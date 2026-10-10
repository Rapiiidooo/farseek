import { clamp } from "./world.js";

// Climbing marked walls: scarred ice with Mira's axes, thick ivy with bare hands. A surface is
// a vertical rectangle on a plane, kept in `world.walls`. On it the explorer moves up, down and
// across, leaps to another hold, lets go, and pulls up onto a walkable top with the ledge climb.
// Four holds (two hands, two feet) are planted in turn as she moves, so the animator keeps
// palms and soles on the surface; a hand reaching a new hold on ice is an axe strike.
const R = 0.32,
  HEIGHT = 1.75,
  // The body's centre stands this far off the surface.
  OFF = 0.42,
  // The higher hand reaches this far above the feet, the lower one this far.
  HIGH = 1.95,
  LOW = 1.5,
  // An axe's pick bites this far above the hand holding it.
  PICK = 0.28;
export const CLIMB = {
  ice: {
    up: 1.1,
    down: 1.3,
    side: 0.85,
    step: 0.42,
    leap: 1.6,
    leapTime: 0.42,
  },
  vine: {
    up: 0.72,
    down: 0.95,
    side: 0.6,
    step: 0.34,
    leap: 1.3,
    leapTime: 0.5,
  },
};
// Each limb's hold relative to the body, as [along, above the feet], and the point of the
// climbing cycle at which it reaches for the next hold. A hand and the opposite foot move as a
// pair, the foot a little after the hand.
const LIMBS = {
  leftHand: { at: [0.2, 1.66], from: 0, hand: true },
  rightFoot: { at: [-0.14, 0.42], from: 0.18 },
  rightHand: { at: [-0.2, 1.66], from: 0.5, hand: true },
  leftFoot: { at: [0.14, 0.42], from: 0.68 },
};
// A reach lasts this part of the cycle. A planted hold that strays from its place by more than
// STRAY, or beyond the reach of its shoulder or hip, as when climbing turns into a traverse, is
// reached for at once.
const SPAN = 0.24;
const STRAY = { hand: 0.42, foot: 0.36 };
const JOINT = {
  hand: {
    across: 0.21,
    up: 1.43,
    depth: { ice: 0.08, vine: 0.25 },
    reach: 0.54,
  },
  foot: { across: 0.1, up: 0.9, depth: { ice: 0.28, vine: 0.28 }, reach: 0.8 },
};
// Where each limb holds at the moment of a catch: staggered, one hand high.
const CATCH = {
  leftHand: [0.2, 1.88],
  rightHand: [-0.2, 1.56],
  leftFoot: [0.14, 0.58],
  rightFoot: [-0.14, 0.28],
};

export function climbSurface({
  kind,
  x,
  z,
  nx,
  nz,
  width,
  bottom,
  top,
  mantle = true,
  side = 1,
  id = "",
}) {
  const length = Math.hypot(nx, nz) || 1;
  const n = { x: nx / length, z: nz / length };
  return {
    kind,
    id,
    o: { x, z },
    n,
    // Along the surface, to the left of a climber facing it.
    t: { x: -n.z, z: n.x },
    half: width / 2,
    y0: bottom,
    y1: top,
    mantle,
    side,
  };
}

export function addClimbSurface(world, options) {
  const surface = climbSurface(options);
  (world.walls ??= []).push(surface);
  return surface;
}

export function wallPoint(s, u, d, out = {}) {
  out.x = s.o.x + s.t.x * u + s.n.x * d;
  out.z = s.o.z + s.t.z * u + s.n.z * d;
  return out;
}

function onWall(s, x, z) {
  const dx = x - s.o.x,
    dz = z - s.o.z;
  return { u: dx * s.t.x + dz * s.t.z, d: dx * s.n.x + dz * s.n.z };
}

// The body's range on a surface: both hands on it, the feet free below it.
function range(s) {
  return {
    u0: -s.half + 0.3,
    u1: s.half - 0.3,
    f0: s.y0 - LOW,
    f1: s.y1 - HIGH,
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

export const wallClimbing = {
  // Runs before the state's own update: a jump at a marked wall, or a fall or jump onto one,
  // takes hold of it. Returns true when the explorer has just caught a wall.
  wallStart(dt, input, wish) {
    const walls = this.world.walls;
    if (!walls?.length || this.swimming) return false;
    if (this.state === "ground") {
      this.wallLeft = null;
      if (this.buffer <= 0) return false;
      const found = this.findWall(0.2, 1.1, 0.55, 0.25);
      if (!found) return false;
      this.buffer = 0;
      this.beginWall(found.s, found.u, found.feet + 0.25);
      return true;
    }
    if (this.state !== "air" || this.regrab > 0 || this.stun > 0) return false;
    if (input.drop) return false;
    const found = this.findWall(0.02, 0.8, 0.2, 0.35, true);
    if (!found) return false;
    this.beginWall(found.s, found.u, found.feet);
    return true;
  },

  canHold(s) {
    return s.kind !== "ice" || !!this.axes;
  },

  // The nearest surface in front within `near`..`far` of the body's centre that the explorer
  // faces, with her hands in its reach once her feet are moved by at most `slack`.
  findWall(near, far, facing, slack, flying = false) {
    const f = this.facing;
    let best = null;
    for (const s of this.world.walls) {
      if (!this.canHold(s) || s === this.wallLeft) continue;
      const { u, d } = onWall(s, this.pos.x, this.pos.z);
      if (d < near || d > far) continue;
      const toward = -(f.x * s.n.x + f.z * s.n.z);
      const closing = -(this.vel.x * s.n.x + this.vel.z * s.n.z);
      if (flying ? toward < facing && closing < 0.5 : toward < facing) continue;
      if (flying && closing < -1) continue;
      const b = range(s);
      if (u < b.u0 - 0.2 || u > b.u1 + 0.2) continue;
      if (this.feet < b.f0 - slack || this.feet > b.f1 + slack) continue;
      if (!best || d < best.d)
        best = {
          s,
          d,
          u: clamp(u, b.u0, b.u1),
          feet: clamp(this.feet, b.f0, b.f1),
        };
    }
    return best;
  },

  beginWall(s, u, feet) {
    const b = range(s);
    const ox = this.pos.x,
      oz = this.pos.z,
      of = this.feet;
    this.state = "wall";
    this.t = 0;
    this.waterLanding = false;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.cling = {
      s,
      u: clamp(u, b.u0, b.u1),
      phase: 0,
      leap: null,
      moving: 0,
      limbs: {},
      side: s.side,
    };
    this.feet = clamp(feet, b.f0, b.f1);
    this.placeOnWall();
    this.snap.x += ox - this.pos.x;
    this.snap.z += oz - this.pos.z;
    this.stepLift += of - this.feet;
    this.plantAll(CATCH);
    this.events.push("grab");
    for (const name of ["leftHand", "rightHand"]) this.wallStrike(name);
  },

  placeOnWall() {
    const { s, u } = this.cling;
    wallPoint(s, u, OFF, this.pos);
    this.yaw = Math.atan2(-s.n.x, -s.n.z);
  },

  plantAll(offsets) {
    const W = this.cling;
    for (const name of Object.keys(LIMBS)) {
      const [a, y] = offsets[name];
      W.limbs[name] = {
        u: W.u + a,
        y: this.feet + y,
        fu: 0,
        fy: 0,
        tu: 0,
        ty: 0,
        s: -1,
      };
    }
  },

  // A hand reaching its new hold: on ice the axe's pick bites above the grip.
  wallStrike(name) {
    const W = this.cling,
      limb = W.limbs[name];
    const p = wallPoint(W.s, limb.u, 0);
    const ice = W.s.kind === "ice";
    (this.wallStrikes ??= []).push({
      x: p.x,
      y: limb.y + (ice ? PICK : 0.05),
      z: p.z,
      nx: W.s.n.x,
      nz: W.s.n.z,
      kind: W.s.kind,
    });
    if (this.wallStrikes.length > 16) this.wallStrikes.shift();
    this.events.push(ice ? "axe" : "vine");
  },

  wall(dt, input, wish) {
    const W = this.cling;
    if (!W) return this.land();
    this.prompt = "wall";
    if (W.leap) return this.wallLeap(dt);
    if (dt <= 0) return;
    const { s } = W,
      K = CLIMB[s.kind];
    if (input.drop) return this.leaveWall(false);
    const up = -(wish.x * s.n.x + wish.z * s.n.z),
      across = wish.x * s.t.x + wish.z * s.t.z;
    if (this.buffer > 0) {
      this.buffer = 0;
      if (up < -0.5) return this.leaveWall(true);
      const length = Math.hypot(across, up);
      const du = length > 0.3 ? across / length : 0,
        dy = length > 0.3 ? up / length : 1;
      if (this.beginLeap(du, dy)) return;
    }
    const b = range(s);
    // The body pulls in time with the holds: quicker just after a hand bites.
    const pace = 1 + 0.35 * Math.cos(Math.PI * 4 * (W.phase - 0.37));
    const vu = Math.abs(across) > 0.25 ? across * K.side * pace : 0;
    const vy =
      up > 0.25 ? up * K.up * pace : up < -0.25 ? up * K.down * pace : 0;
    const u0 = W.u,
      f0 = this.feet;
    W.u = clamp(W.u + vu * dt, b.u0, b.u1);
    this.feet = clamp(this.feet + vy * dt, b.f0, b.f1);
    if (up > 0.25 && this.feet >= b.f1 - 1e-4 && s.mantle && this.mantle())
      return;
    this.placeOnWall();
    if (vy < 0) {
      const ground = this.world.ground(
        this.pos.x,
        this.pos.z,
        R * 0.6,
        this.feet + 0.3,
        0.3,
      );
      if (this.feet <= ground + 0.02) {
        this.feet = ground;
        this.vel.x = this.vel.y = this.vel.z = 0;
        this.cling = null;
        this.events.push("land");
        return this.land();
      }
    }
    const du = W.u - u0,
      dy = this.feet - f0,
      moved = Math.hypot(du, dy);
    this.vel.x = (s.t.x * du) / dt;
    this.vel.z = (s.t.z * du) / dt;
    this.vel.y = dy / dt;
    W.moving = moved / dt;
    if (moved > 1e-6) {
      W.dir = { u: du / moved, y: dy / moved };
      this.stepHolds(moved / (2 * K.step));
    } else this.settleHolds(dt);
  },

  // Advances the climbing cycle by `turn` of a round: a limb whose turn comes, or whose hold
  // strays out of reach, reaches for a hold ahead of where the body is going, and lands a
  // fixed part of the cycle later.
  stepHolds(turn) {
    const W = this.cling,
      K = CLIMB[W.s.kind];
    const before = W.phase;
    W.phase = (W.phase + turn) % 1;
    const passed = (edge) =>
      before <= W.phase
        ? before < edge && W.phase >= edge
        : before < edge || W.phase >= edge;
    for (const [name, limb] of Object.entries(LIMBS)) {
      const hold = W.limbs[name];
      if (hold.s < 0) {
        const u = W.u + limb.at[0],
          y = this.feet + limb.at[1];
        const joint = limb.hand ? JOINT.hand : JOINT.foot;
        const stray =
          Math.hypot(hold.u - u, hold.y - y) >
            (limb.hand ? STRAY.hand : STRAY.foot) ||
          Math.hypot(
            hold.u - W.u - Math.sign(limb.at[0]) * joint.across,
            hold.y - this.feet - joint.up,
            joint.depth[W.s.kind],
          ) > joint.reach;
        if (passed(limb.from) || stray) {
          // It lands where the body will be when the reach ends, plus a lead, kept within
          // reach of where its shoulder or hip will be then.
          const travel = SPAN * 2 * K.step,
            lead = 0.38 * 2 * K.step;
          const bu = W.u + W.dir.u * travel,
            bf = this.feet + W.dir.y * travel;
          const ju = bu + Math.sign(limb.at[0]) * joint.across,
            jy = bf + joint.up;
          let du = bu + limb.at[0] + W.dir.u * lead * 0.6 - ju,
            dy = bf + limb.at[1] + W.dir.y * lead - jy;
          const room =
            Math.sqrt(joint.reach ** 2 - joint.depth[W.s.kind] ** 2) * 0.9;
          const length = Math.hypot(du, dy);
          if (length > room) {
            du *= room / length;
            dy *= room / length;
          }
          hold.fu = hold.u;
          hold.fy = hold.y;
          hold.tu = ju + du;
          hold.ty = jy + dy;
          hold.p0 = W.phase;
          hold.s = 0;
          continue;
        }
      }
      if (hold.s < 0) continue;
      hold.s = Math.max(
        hold.s,
        Math.min(1, ((W.phase - hold.p0 + 1) % 1) / SPAN),
      );
      const k = smooth(hold.s);
      hold.u = hold.fu + (hold.tu - hold.fu) * k;
      hold.y = hold.fy + (hold.ty - hold.fy) * k;
      if (hold.s >= 1) {
        hold.s = -1;
        if (limb.hand) this.wallStrike(name);
      }
    }
  },

  // Standing still, a limb already reaching finishes its move.
  settleHolds(dt) {
    const W = this.cling;
    for (const [name, limb] of Object.entries(LIMBS)) {
      const hold = W.limbs[name];
      if (hold.s < 0) continue;
      hold.s = Math.min(1, hold.s + dt / 0.22);
      const k = smooth(hold.s);
      hold.u = hold.fu + (hold.tu - hold.fu) * k;
      hold.y = hold.fy + (hold.ty - hold.fy) * k;
      if (hold.s >= 1) {
        hold.s = -1;
        if (limb.hand) this.wallStrike(name);
      }
    }
  },

  // A jump on the wall: the farthest hold within reach along the stick, on this surface or one
  // beside it in much the same plane. Nothing within reach, nothing happens.
  beginLeap(du, dy) {
    const W = this.cling,
      K = CLIMB[W.s.kind];
    for (let reach = K.leap; reach >= 0.45; reach -= 0.1) {
      const target = this.leapTarget(W.u + du * reach, this.feet + dy * reach);
      if (!target) continue;
      W.leap = {
        t: 0,
        time: K.leapTime,
        from: { x: this.pos.x, z: this.pos.z, feet: this.feet },
        ...target,
      };
      const end = {
        x: target.s.o.x + target.s.t.x * target.u,
        z: target.s.o.z + target.s.t.z * target.u,
      };
      for (const [name, offset] of Object.entries(CATCH)) {
        const hold = W.limbs[name];
        const p = onWall(W.s, end.x, end.z);
        hold.fu = hold.u;
        hold.fy = hold.y;
        hold.tu = p.u + offset[0];
        hold.ty = target.feet + offset[1];
        hold.s = 0;
      }
      this.events.push("jump");
      return true;
    }
    return false;
  },

  leapTarget(u, feet) {
    const W = this.cling;
    const at = wallPoint(W.s, u, OFF);
    for (const s of [W.s, ...this.world.walls.filter((s) => s !== W.s)]) {
      if (!this.canHold(s) || s.n.x * W.s.n.x + s.n.z * W.s.n.z < 0.7) continue;
      const p = onWall(s, at.x, at.z);
      if (Math.abs(p.d - OFF) > 0.6) continue;
      const b = range(s);
      if (p.u < b.u0 || p.u > b.u1 || feet < b.f0 || feet > b.f1) continue;
      return { s, u: p.u, feet };
    }
    return null;
  },

  wallLeap(dt) {
    const W = this.cling,
      L = W.leap;
    L.t = Math.min(L.time, L.t + dt);
    const k = smooth(L.t / L.time);
    const end = wallPoint(L.s, L.u, OFF);
    const out = Math.sin(Math.PI * k) * 0.16;
    const nx = W.s.n.x + (L.s.n.x - W.s.n.x) * k,
      nz = W.s.n.z + (L.s.n.z - W.s.n.z) * k;
    const x = L.from.x + (end.x - L.from.x) * k + nx * out,
      z = L.from.z + (end.z - L.from.z) * k + nz * out;
    const feet = L.from.feet + (L.feet - L.from.feet) * k;
    if (dt > 0) {
      this.vel.x = (x - this.pos.x) / dt;
      this.vel.z = (z - this.pos.z) / dt;
      this.vel.y = (feet - this.feet) / dt;
    }
    this.pos.x = x;
    this.pos.z = z;
    this.feet = feet;
    // The holds travel with the body to the new grips.
    for (const hold of Object.values(W.limbs)) {
      const h = smooth(Math.min(1, (L.t / L.time) * 1.15));
      hold.u = hold.fu + (hold.tu - hold.fu) * h;
      hold.y = hold.fy + (hold.ty - hold.fy) * h;
    }
    if (L.t < L.time) return;
    const from = W.s;
    W.s = L.s;
    W.u = L.u;
    W.leap = null;
    W.phase = 0;
    for (const hold of Object.values(W.limbs)) {
      if (from !== W.s) {
        const p = wallPoint(from, hold.tu, 0);
        hold.tu = onWall(W.s, p.x, p.z).u;
      }
      hold.u = hold.tu;
      hold.y = hold.ty;
      hold.s = -1;
    }
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.placeOnWall();
    this.events.push("grab");
    for (const name of ["leftHand", "rightHand"]) this.wallStrike(name);
  },

  // Letting go, or kicking off backwards with a jump. The same surface is not caught again
  // until the explorer stands on something.
  leaveWall(kick) {
    const s = this.cling.s;
    this.wallLeft = s;
    this.cling = null;
    this.state = "air";
    this.fallStart = this.feet;
    this.regrab = 0.35;
    this.vel.x = s.n.x * (kick ? 3 : 1);
    this.vel.z = s.n.z * (kick ? 3 : 1);
    this.vel.y = kick ? 5.5 : 0;
    if (kick) {
      this.yaw = Math.atan2(s.n.x, s.n.z);
      this.sinceJump = 0;
      this.jumpCut = true;
      this.events.push("jump");
    } else this.events.push("let-go");
  },

  // At the top of a surface with standing room above it: the ledge climb pulls her over.
  mantle() {
    const { s, u } = this.cling;
    const top = s.y1;
    const edge = wallPoint(s, u, 0);
    const x = edge.x - s.n.x * 0.55,
      z = edge.z - s.n.z * 0.55;
    const ground = this.world.ground(x, z, R * 0.6, top + 0.2, 0.3);
    if (Math.abs(ground - top) > 0.2) return false;
    if (!this.world.free(x, z, R, ground + 0.02, ground + HEIGHT)) return false;
    this.placeOnWall();
    this.ledge = { n: { ...s.n }, top: ground, hand: { x: edge.x, z: edge.z } };
    this.cling = null;
    this.state = "climb";
    this.t = 0;
    this.climbCue = 0;
    this.from = { x: this.pos.x, z: this.pos.z, feet: this.feet };
    this.to = { x, z, feet: ground };
    this.events.push("climb");
    return true;
  },
};
