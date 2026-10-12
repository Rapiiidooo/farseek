import { clamp } from "./world.js";
import { swinging } from "./hero-swing.js";
import { wallClimbing } from "./wall-climb.js";

export const RUN_SPEED = 5.6;

// The explorer's movement. Every traversal verb is a state: ground, air, hang, climb, vault,
// grab (a block held), shove (a block moving) and use (turning a mirror). Distances are
// tuned to the 2 m grid: a running jump clears one cell with room to spare and a
// standing jump reaches a ledge 3 m up.
const R = 0.32,
  HEIGHT = 1.75,
  STEP = 0.55,
  // A careful walk still hops down a drop this low after pressing on at the lip briefly.
  HOP = 1.6,
  HOP_PUSH = 0.35,
  RUN = RUN_SPEED,
  WALK = 2.1,
  GRAVITY = 21,
  JUMP = 7.4,
  COYOTE = 0.13,
  BUFFER = 0.15,
  SHIMMY = 1.35,
  CLIMB_TIME = 0.95,
  VAULT_TIME = 0.55,
  SHOVE_TIME = 1.05,
  TURN_RATE = 0.75,
  // Hanging, the body's centre sits this far out from the wall: the chest just clears the
  // stone and the hands reach over the lip.
  HANG_OFF = 0.27,
  // Braced against a block, the body keeps this much air between itself and the stone, so
  // the forward lean of a push does not put the head into it.
  BRACE = 0.2;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Hero {
  constructor(world, level) {
    this.world = world;
    this.level = level;
    this.hands = 2.05;
    this.pos = { x: 0, z: 0 };
    this.feet = 0;
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = Math.PI;
    this.state = "ground";
    this.t = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.regrab = 0;
    this.backHold = 0;
    this.landing = 0;
    this.fallStart = 0;
    this.waterLanding = false;
    this.prompt = "";
    this.safe = { x: 0, z: 0, feet: 0, yaw: Math.PI };
    this.events = [];
    this.stepLift = 0;
    // Positional snaps (squaring up to a block, catching a ledge) are absorbed here and
    // eased out by the renderer, so the body glides instead of teleporting.
    this.snap = { x: 0, z: 0 };
    this.carried = { x: 0, z: 0 };
    this.lipPush = 0;
    this.sinceJump = 9;
    this.stun = 0;
    this.invulnerable = 0;
    this.canRoll = true;
    this.swimming = false;
    this.swimSpeed = 0;
    this.swimVertical = 0;
  }

  spawn(x, z, feet, yaw) {
    Object.assign(this.pos, { x, z });
    this.feet = feet;
    this.yaw = yaw;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.state = "ground";
    this.swimming = false;
    this.waterLanding = false;
    this.swimSpeed = this.swimVertical = 0;
    this.carried.x = this.carried.z = 0;
    this.safe = { x, z, feet, yaw };
  }

  // Moved by the ground underfoot. The animator consumes `carried` to keep planted feet on
  // that ground instead of in the world.
  carry(dx, dz) {
    this.pos.x += dx;
    this.pos.z += dz;
    this.carried.x += dx;
    this.carried.z += dz;
  }

  get facing() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  // input: { move: {x, y} camera relative, camYaw, jump, interact, interactHeld, drop, walk }
  update(dt, input) {
    this.t +=
      dt /
      (this.state === "climb"
        ? CLIMB_TIME
        : this.state === "vault"
          ? VAULT_TIME
          : 1);
    // `t` restarts with each state; this clock never does.
    this.clock = (this.clock ?? 0) + dt;
    this.regrab = Math.max(0, this.regrab - dt);
    this.landing = Math.max(0, this.landing - dt * 3);
    this.stepLift *= Math.exp(-dt * 14);
    const decay = Math.exp(-dt * 11);
    this.snap.x *= decay;
    this.snap.z *= decay;
    this.sinceJump += dt;
    this.stun = Math.max(0, this.stun - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (input.jump) this.buffer = BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);
    const wish = worldWish(input.move, input.camYaw);
    this.wish = wish;
    this.prompt = "";
    const water = this.swimVolume?.active();
    if (water && this.state !== "swim") {
      this.state = "swim";
      this.vel.y = 0;
      this.buffer = this.coyote = 0;
    } else if (!water && this.state === "swim") {
      this.state = "air";
      this.waterLanding = true;
      this.fallStart = this.feet;
      this.vel.y = 0;
      this.regrab = 0.5;
    }
    this.swimming = this.state === "swim";
    if (!this.swimming) this.swimSpeed = this.swimVertical = 0;
    if (this.state === "air") this.catchRope(dt, input);
    if (this.wallStart(dt, input, wish)) return;
    this[this.state](dt, input, wish);
    if (this.feet < -5 && this.state === "air") {
      this.lastFall = "deep";
      this.respawn();
    }
  }

  swim(dt, input, wish) {
    if (dt <= 0) return;
    const water = this.swimVolume;
    const drive = (input.jumpHeld ? 1 : 0) - (input.dropHeld ? 1 : 0);
    const current = water.current(this.clock, this.pos, this.feet);
    const stream = Math.hypot(current.x, current.z);
    if (stream > 1.5 && !(this.stream > 1.5)) this.events.push("current");
    this.stream = stream;
    const heading = input.swimDirection;
    const direction = heading
      ? {
          x: heading.x * input.move.y - Math.cos(input.camYaw) * input.move.x,
          y: heading.y * input.move.y + drive * 0.75,
          z: heading.z * input.move.y + Math.sin(input.camYaw) * input.move.x,
        }
      : { x: wish.x, y: drive * 0.75, z: wish.z };
    const length = Math.max(
      1,
      Math.hypot(direction.x, direction.y, direction.z),
    );
    const target = {
      x: (direction.x * 3.2) / length + current.x,
      y: (direction.y * 3.2) / length + Math.sin(this.clock * 1.4) * 0.035,
      z: (direction.z * 3.2) / length + current.z,
    };
    const horizontal = Math.hypot(direction.x, direction.z);
    const horizontalRate = horizontal > 0.05 ? 6.4 : 8;
    const verticalRate =
      Math.abs(direction.y) < 0.01
        ? 12
        : direction.y * this.vel.y < 0
          ? 10.5
          : 7.5;
    const previous = { x: this.pos.x, y: this.feet, z: this.pos.z };
    const step = {};
    for (const axis of ["x", "y", "z"]) {
      const rate = axis === "y" ? verticalRate : horizontalRate;
      const blend = 1 - Math.exp(-rate * dt);
      step[axis] =
        target[axis] * dt + ((this.vel[axis] - target[axis]) * blend) / rate;
      this.vel[axis] += (target[axis] - this.vel[axis]) * blend;
    }
    this.pos.x = clamp(previous.x + step.x, water.minX, water.maxX);
    this.pos.z = clamp(previous.z + step.z, water.minZ, water.maxZ);
    const previousFeet = this.feet;
    this.feet = clamp(previousFeet + step.y, water.bottom, water.top);
    if (this.feet !== previousFeet + step.y) this.vel.y = 0;
    const floor = this.world.ground(
      this.pos.x,
      this.pos.z,
      R,
      previousFeet,
      0.02,
    );
    if (this.feet < floor + 0.2) {
      this.feet = floor + 0.2;
      this.vel.y = Math.max(0, this.vel.y);
    }
    const ceiling = this.world.ceiling(
      this.pos.x,
      this.pos.z,
      R,
      previousFeet,
      HEIGHT,
    );
    if (this.feet + HEIGHT > ceiling) {
      this.feet = ceiling - HEIGHT;
      this.vel.y = Math.min(0, this.vel.y);
    }
    const wall = this.world.resolve(this.pos, R, this.feet, HEIGHT, 0.02);
    if (wall) {
      const into = this.vel.x * wall.x + this.vel.z * wall.z;
      if (into < 0) {
        this.vel.x -= wall.x * into;
        this.vel.z -= wall.z * into;
      }
    }
    this.pos.x = clamp(this.pos.x, water.minX, water.maxX);
    this.pos.z = clamp(this.pos.z, water.minZ, water.maxZ);
    for (const axis of ["x", "z"]) {
      const low = axis === "x" ? water.minX : water.minZ;
      const high = axis === "x" ? water.maxX : water.maxZ;
      if (
        (this.pos[axis] === low && this.vel[axis] < 0) ||
        (this.pos[axis] === high && this.vel[axis] > 0)
      )
        this.vel[axis] = 0;
    }
    if (horizontal > 0.05)
      this.turnTowards(Math.atan2(direction.x, direction.z), dt, 3.5);
    this.swimSpeed =
      Math.hypot(this.pos.x - previous.x, this.pos.z - previous.z) / dt;
    this.swimVertical = this.vel.y;
    this.prompt = "swim";
    this.buffer = this.coyote = 0;
  }

  // --- ground ---------------------------------------------------------------
  ground(dt, input, wish) {
    const w = this.world;
    const target = input.walk ? WALK : RUN;
    // On ice the explorer gathers speed slowly and slides a long way before stopping.
    this.onIce = !!w.slickAt?.(this.pos.x, this.pos.z, this.feet);
    const k = this.onIce
      ? wish.len > 0.05
        ? 1.8
        : 0.7
      : wish.len > 0.05
        ? 11
        : 14;
    const blend = 1 - Math.exp(-k * dt);
    this.vel.x += (wish.x * target - this.vel.x) * blend;
    this.vel.z += (wish.z * target - this.vel.z) * blend;
    if (Number.isFinite(input.aimYaw)) this.turnTowards(input.aimYaw, dt, 14);
    else if (wish.len > 0.05)
      this.turnTowards(Math.atan2(wish.x, wish.z), dt, 13);

    const nx = this.pos.x + this.vel.x * dt,
      nz = this.pos.z + this.vel.z * dt;
    // Walking never steps off an edge, as a deliberate way to line up a jump.
    const below = input.walk
      ? w.ground(nx, nz, R * 0.6, this.feet, STEP)
      : this.feet;
    if (below < this.feet - STEP) {
      this.lipPush =
        this.feet - below <= HOP && wish.len > 0.5 ? this.lipPush + dt : 0;
    } else this.lipPush = 0;
    if (below < this.feet - STEP && this.lipPush < HOP_PUSH) {
      this.vel.x = this.vel.z = 0;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    w.resolve(this.pos, R, this.feet, HEIGHT, STEP);
    const g = w.ground(this.pos.x, this.pos.z, R * 0.6, this.feet, STEP);
    if (g >= this.feet - 0.6) {
      // Steps are eased; the gentle slope of an isle's dome is simply followed.
      if (Math.abs(g - this.feet) > 0.06) this.stepLift += this.feet - g;
      this.feet = g;
      this.coyote = COYOTE;
      this.remember();
    } else {
      // Off an edge: fall at once, but keep the coyote window for a late jump.
      this.state = "air";
      this.vel.y = 0;
      this.fallStart = this.feet;
      return;
    }

    const target2 = this.interactTarget();
    if (target2)
      this.prompt =
        target2.kind === "mirror"
          ? "turn"
          : target2.kind === "use"
            ? target2.prompt
            : "grab";
    else if (this.speed < 1.5 && this.findEdgeBelow()) this.prompt = "edge";

    if (this.buffer > 0) {
      const ledge = this.findLedge(0.5, 1.4, R + 0.55);
      if (ledge) return this.beginVault(ledge);
      this.buffer = 0;
      this.coyote = 0;
      this.state = "air";
      this.vel.y = JUMP;
      this.sinceJump = 0;
      this.jumpCut = false;
      this.fallStart = this.feet;
      // A standing jump still carries you forward if the stick asks for it.
      if (this.speed < 2.4 && wish.len > 0.3) {
        this.vel.x = wish.x * 2.6;
        this.vel.z = wish.z * 2.6;
      }
      this.events.push("jump");
      return;
    }
    if (input.interactHeld && target2?.kind === "mirror") {
      this.faceBox(target2.box);
      this.state = "turn";
      this.t = 0;
      this.grip = { ref: target2.ref, box: target2.box };
      this.events.push("grip");
      return;
    }
    if (input.interactPressed && target2?.kind === "use") {
      if (this.level.use?.(target2.ref)) this.events.push("use");
      return;
    }
    if (input.interactHeld && target2?.kind === "block") {
      this.beginGrab(target2);
      return;
    }
    if (input.drop) {
      const edge = this.findEdgeBelow();
      if (edge) this.beginHangFromTop(edge);
    }
    if (input.roll && this.canRoll) return this.beginRoll(wish);
  }

  // --- roll and knockback ---------------------------------------------------
  beginRoll(wish) {
    const d = wish.len > 0.2 ? { x: wish.x, z: wish.z } : this.facing;
    const len = Math.hypot(d.x, d.z) || 1;
    this.rollDir = { x: d.x / len, z: d.z / len };
    this.yaw = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.state = "roll";
    this.t = 0;
    this.invulnerable = Math.max(this.invulnerable, 0.42);
    this.events.push("roll");
  }

  roll(dt, input, wish) {
    if (dt <= 0) return;
    const w = this.world;
    const k = Math.min(1, this.t / 0.72);
    const previous = Math.max(0, this.t - dt) / 0.72;
    const distance = (t) => 2.756 * (2 * t - t * t);
    const step = distance(k) - distance(Math.min(1, previous));
    this.vel.x = (this.rollDir.x * step) / dt;
    this.vel.z = (this.rollDir.z * step) / dt;
    this.pos.x += this.rollDir.x * step;
    this.pos.z += this.rollDir.z * step;
    w.resolve(this.pos, R, this.feet, 1.0, STEP);
    const g = w.ground(this.pos.x, this.pos.z, R * 0.6, this.feet, STEP);
    if (g < this.feet - 0.6) {
      this.state = "air";
      this.vel.y = 0;
      this.fallStart = this.feet;
      return;
    }
    if (Math.abs(g - this.feet) > 0.06) this.stepLift += this.feet - g;
    this.feet = g;
    if (k >= 1) {
      this.state = "ground";
      this.t = 0;
      if (wish.len < 0.1) {
        this.vel.x *= 0.3;
        this.vel.z *= 0.3;
      }
    }
  }

  // Knocked back by a blow: a short hop away from it with the controls taken for a beat.
  takeHit(fromX, fromZ, force = 5) {
    if (
      force > 0 &&
      !(this.invulnerable > 0) &&
      this.shield?.deflect(fromX, fromZ, this)
    )
      return false;
    if (
      this.invulnerable > 0 ||
      this.state === "hang" ||
      this.state === "climb"
    )
      return false;
    const dx = this.pos.x - fromX,
      dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * force;
    this.vel.z = (dz / d) * force;
    this.vel.y = 3.6;
    this.state = "air";
    this.fallStart = this.feet;
    this.stun = 0.5;
    this.invulnerable = 1.2;
    this.jumpCut = true;
    this.events.push("hurt");
    return true;
  }

  // --- air ------------------------------------------------------------------
  air(dt, input, wish) {
    const w = this.world;
    // Letting go of jump early cuts the rise short; falling is a little heavier than
    // rising, which keeps arcs readable without feeling floaty.
    if (
      !input.jumpHeld &&
      !this.jumpCut &&
      this.vel.y > 2 &&
      this.sinceJump < 0.35
    ) {
      this.vel.y *= 0.55;
      this.jumpCut = true;
    }
    this.vel.y -= GRAVITY * (this.vel.y < 0 ? 1.3 : 1) * dt;
    const air = 1 - Math.exp(-2.2 * dt);
    if (wish.len > 0.05 && this.stun <= 0) {
      this.vel.x += (wish.x * RUN - this.vel.x) * air * 0.5;
      this.vel.z += (wish.z * RUN - this.vel.z) * air * 0.5;
      if (!Number.isFinite(input.aimYaw))
        this.turnTowards(Math.atan2(wish.x, wish.z), dt, 4);
    }
    if (Number.isFinite(input.aimYaw) && this.stun <= 0)
      this.turnTowards(input.aimYaw, dt, 14);
    // Late jump just after running off an edge.
    if (this.buffer > 0 && this.coyote > 0) {
      this.buffer = 0;
      this.coyote = 0;
      this.vel.y = JUMP;
      this.sinceJump = 0;
      this.jumpCut = false;
      this.events.push("jump");
    }
    this.coyote -= dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const before = this.feet;
    this.feet += this.vel.y * dt;
    // A fast step must not sink below a top it crossed, or resolve takes that floor for a wall.
    if (this.vel.y < 0)
      this.feet = Math.max(
        this.feet,
        w.ground(this.pos.x, this.pos.z, R * 0.6, before, 0.25),
      );
    w.resolve(this.pos, R, this.feet, HEIGHT, 0.2);
    if (this.vel.y > 0) {
      const c = w.ceiling(this.pos.x, this.pos.z, R * 0.8, this.feet, HEIGHT);
      if (this.feet + HEIGHT > c) {
        this.feet = c - HEIGHT;
        this.vel.y = 0;
      }
    }
    // Hands catch a ledge on the way down, or near the top of the jump.
    if (this.vel.y < 2.5 && this.regrab <= 0 && !input.drop && this.stun <= 0) {
      const ledge = this.findLedge(1.3, this.hands + 0.4, R + 0.3);
      // Only a wall the explorer is heading into, or hanging still beside, is caught.
      if (ledge && this.vel.x * ledge.n.x + this.vel.z * ledge.n.z < 0.8)
        return this.beginHang(ledge);
    }
    if (this.vel.y <= 0) {
      const g = w.ground(this.pos.x, this.pos.z, R * 0.6, this.feet, 0.25);
      if (this.feet <= g + 1e-3) {
        const drop = this.fallStart - g;
        // A fall of more than two storeys ends the attempt, as it would on real stone.
        if (drop > 6.5 && !this.waterLanding) {
          this.lastFall = "high";
          return this.respawn();
        }
        this.feet = g;
        this.landing = clamp(-this.vel.y / 14, 0.15, 1);
        this.vel.y = 0;
        this.state = "ground";
        this.waterLanding = false;
        this.coyote = COYOTE;
        this.events.push(drop > 3.5 ? "land-hard" : "land");
      }
    }
  }

  // --- hang -----------------------------------------------------------------
  beginHang(ledge, fromTop = false) {
    const vy = this.vel.y;
    this.state = "hang";
    this.waterLanding = false;
    this.ledge = ledge;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = Math.atan2(-ledge.n.x, -ledge.n.z);
    const ox = this.pos.x,
      oz = this.pos.z,
      of = this.feet;
    this.placeOnLedge(ledge.hand.x, ledge.hand.z);
    this.arrive(ox, oz, of, vy, fromTop);
    this.backHold = 0;
    this.events.push("grab");
  }

  beginHangFromTop(edge) {
    this.beginHang(edge, true);
    this.events.push("drop-to-hang");
  }

  // Where the body was before a catch put it on a hold; the animator carries it there over a
  // moment (a lowering from the top for `fromTop`) instead of the frame it takes here.
  arrive(ox, oz, of, vy = 0, fromTop = false) {
    this.arrival = {
      x: ox - this.pos.x,
      y: of - this.feet,
      z: oz - this.pos.z,
      vy,
      fromTop,
    };
  }

  placeOnLedge(hx, hz) {
    const { n, top } = this.ledge;
    this.ledge.hand = { x: hx, z: hz };
    this.pos.x = hx + n.x * HANG_OFF;
    this.pos.z = hz + n.z * HANG_OFF;
    this.feet = top - this.hands;
  }

  hang(dt, input, wish) {
    const { n, top } = this.ledge;
    const tx = -n.z,
      tz = n.x; // along the face
    const along = wish.x * tx + wish.z * tz;
    const into = -(wish.x * n.x + wish.z * n.z);
    this.shimmy = 0;
    this.prompt = "hang";
    if (Math.abs(along) > 0.35) {
      const s = Math.sign(along) * SHIMMY * dt;
      const hx = this.ledge.hand.x + tx * s,
        hz = this.ledge.hand.z + tz * s;
      const probe = 0.22 * Math.sign(along);
      const support = this.world.topAt(
        hx + tx * probe - n.x * 0.15,
        hz + tz * probe - n.z * 0.15,
        top,
      );
      const bx = hx + n.x * HANG_OFF,
        bz = hz + n.z * HANG_OFF;
      if (
        support &&
        this.world.free(
          bx,
          bz,
          HANG_OFF - 0.05,
          top - this.hands + 0.1,
          top - 0.15,
        )
      ) {
        this.placeOnLedge(hx, hz);
        this.shimmy = Math.sign(along);
      }
    }
    if (into > 0.5 || this.buffer > 0) {
      this.buffer = 0;
      const spot = this.climbSpot();
      if (spot) {
        this.state = "climb";
        this.t = 0;
        this.climbCue = 0;
        this.from = { x: this.pos.x, z: this.pos.z, feet: this.feet };
        this.to = { x: spot.x, z: spot.z, feet: top };
        this.events.push("climb");
        return;
      }
    }
    this.backHold = into < -0.5 ? this.backHold + dt : 0;
    if (input.drop || this.backHold > 0.35) {
      this.state = "air";
      this.vel.y = 0;
      this.fallStart = this.feet;
      this.regrab = 0.35;
      this.pos.x += n.x * 0.08;
      this.pos.z += n.z * 0.08;
      this.events.push("let-go");
    }
  }

  // Where the explorer can stand after pulling up: straight over the hands, or a little to
  // either side when a wall crowds the spot.
  climbSpot() {
    const { n, top, hand } = this.ledge;
    const tx = -n.z,
      tz = n.x;
    for (const off of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45]) {
      const hx = hand.x + tx * off,
        hz = hand.z + tz * off;
      if (!this.world.topAt(hx - n.x * 0.15, hz - n.z * 0.15, top)) continue;
      const x = hx - n.x * 0.6,
        z = hz - n.z * 0.6;
      if (this.world.free(x, z, R, top + 0.02, top + HEIGHT)) return { x, z };
    }
    return null;
  }

  climb(dt) {
    const k = Math.min(1, this.t);
    const { up, over } = climbProgress(k);
    this.feet = this.from.feet + (this.to.feet - this.from.feet) * up;
    this.pos.x = this.from.x + (this.to.x - this.from.x) * over;
    this.pos.z = this.from.z + (this.to.z - this.from.z) * over;
    if (k >= 0.34 && this.climbCue === 0) {
      this.climbCue = 1;
      this.events.push("climb-pull");
    }
    if (k >= 0.7 && this.climbCue === 1) {
      this.climbCue = 2;
      this.events.push("climb-step");
    }
    if (k >= 1) this.land();
  }

  beginVault(ledge) {
    this.buffer = 0;
    this.state = "vault";
    this.t = 0;
    this.yaw = Math.atan2(-ledge.n.x, -ledge.n.z);
    this.from = { x: this.pos.x, z: this.pos.z, feet: this.feet };
    this.to = {
      x: ledge.hand.x - ledge.n.x * 0.55,
      z: ledge.hand.z - ledge.n.z * 0.55,
      feet: ledge.top,
    };
    this.vel.x = this.vel.z = 0;
    this.events.push("vault");
  }

  vault(dt) {
    const k = Math.min(1, this.t);
    const up = smooth(Math.min(1, k / 0.6)),
      over = smooth(clamp((k - 0.25) / 0.75, 0, 1));
    this.feet = this.from.feet + (this.to.feet - this.from.feet) * up;
    this.pos.x = this.from.x + (this.to.x - this.from.x) * over;
    this.pos.z = this.from.z + (this.to.z - this.from.z) * over;
    if (k >= 1) this.land();
  }

  land() {
    this.state = "ground";
    this.waterLanding = false;
    this.t = 0;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.coyote = COYOTE;
  }

  // --- blocks and mirrors ---------------------------------------------------
  beginGrab(target) {
    const n = this.faceBox(target.box);
    this.state = "grab";
    this.grip = { ref: target.ref, box: target.box, n };
    this.vel.x = this.vel.z = 0;
    this.events.push("grip");
  }

  grab(dt, input, wish) {
    const { n, ref } = this.grip;
    this.prompt = "block";
    if (!input.interactHeld) return this.land();
    const into = -(wish.x * n.x + wish.z * n.z);
    if (Math.abs(into) > 0.6) {
      const pulling = into < 0;
      const dir = pulling ? { x: n.x, z: n.z } : { x: -n.x, z: -n.z };
      // Pulling needs a free cell of level ground behind the explorer.
      const bx = this.pos.x + n.x * 2,
        bz = this.pos.z + n.z * 2;
      // A block of ice slides off on its own: it can only be pushed, never pulled.
      const room =
        !pulling ||
        (!ref.slides &&
          this.world.free(bx, bz, R, this.feet + 0.05, this.feet + HEIGHT) &&
          Math.abs(
            this.world.ground(bx, bz, R * 0.6, this.feet, STEP) - this.feet,
          ) < 0.05);
      if (room && this.level.moveBlock(ref, dir, SHOVE_TIME)) {
        if (ref.slides) {
          this.events.push("push");
          return this.land();
        }
        this.state = "shove";
        this.t = 0;
        this.from = { x: this.pos.x, z: this.pos.z };
        this.dir = dir;
        this.pulling = pulling;
        this.events.push(pulling ? "pull" : "push");
      } else if (this.t - (this.strainAt ?? -9) > 0.8) {
        // It will not go that way: the explorer strains against it and the stone grinds.
        this.strainAt = this.t;
        this.events.push("strain");
      }
    }
  }

  // The explorer keeps station on the face of the sliding block instead of running a clock
  // of its own, so the two never overlap, and the push ends when the block comes to rest.
  shove() {
    const { box: b, n } = this.grip;
    if (n.x) this.pos.x = (n.x > 0 ? b.maxX : b.minX) + n.x * (R + BRACE);
    if (n.z) this.pos.z = (n.z > 0 ? b.maxZ : b.minZ) + n.z * (R + BRACE);
    if (!this.level.isMoving(this.grip.ref)) {
      this.state = "grab";
      this.grip.box = this.level.blockBox(this.grip.ref);
    }
  }

  // Holding a mirror's handles: left and right turn it, releasing lets go.
  turn(dt, input) {
    this.prompt = "turning";
    if (!input.interactHeld) return this.land();
    const spin = input.move.x;
    this.turning = spin;
    if (Math.abs(spin) > 0.2)
      this.level.turnMirror(this.grip.ref, -spin * TURN_RATE * dt);
  }

  // --- queries --------------------------------------------------------------
  interactTarget() {
    const f = this.facing;
    let best = null,
      bestD = Infinity;
    const extras = this.extras?.() ?? [];
    for (const item of [...this.level.interactables(), ...extras]) {
      const b = item.box;
      let dx, dz, d;
      if (b.shape === "round") {
        const ox = b.x - this.pos.x,
          oz = b.z - this.pos.z;
        const c = Math.hypot(ox, oz) || 1;
        d = Math.max(0, c - b.r);
        dx = (ox / c) * Math.max(d, 1e-3);
        dz = (oz / c) * Math.max(d, 1e-3);
        d = Math.max(d, 1e-3);
      } else {
        const cx = clamp(this.pos.x, b.minX, b.maxX),
          cz = clamp(this.pos.z, b.minZ, b.maxZ);
        dx = cx - this.pos.x;
        dz = cz - this.pos.z;
        d = Math.hypot(dx, dz);
      }
      if (d > R + 0.55 || b.minY > this.feet + 0.6 || b.maxY < this.feet + 0.5)
        continue;
      // Facing it, or simply touching it: standing against a mirror is enough to take hold.
      if (d > R + 0.15 && (dx * f.x + dz * f.z) / d < 0.35) continue;
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  // Turns to face the nearest side of a box, or the centre of a drum, and returns the outward
  // normal of the side taken.
  faceBox(b) {
    if (b.shape === "round") {
      const dx = this.pos.x - b.x,
        dz = this.pos.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      const n = { x: dx / d, z: dz / d };
      const ox = this.pos.x,
        oz = this.pos.z;
      this.pos.x = b.x + n.x * (b.r + R + 0.12);
      this.pos.z = b.z + n.z * (b.r + R + 0.12);
      this.yaw = Math.atan2(-n.x, -n.z);
      this.snap.x += ox - this.pos.x;
      this.snap.z += oz - this.pos.z;
      return n;
    }
    const n = sideNormal(this.pos, b);
    this.yaw = Math.atan2(-n.x, -n.z);
    const ox = this.pos.x,
      oz = this.pos.z;
    if (n.x) this.pos.x = (n.x > 0 ? b.maxX : b.minX) + n.x * (R + BRACE);
    if (n.z) this.pos.z = (n.z > 0 ? b.maxZ : b.minZ) + n.z * (R + BRACE);
    if (n.x) this.pos.z = clamp(this.pos.z, b.minZ + 0.3, b.maxZ - 0.3);
    if (n.z) this.pos.x = clamp(this.pos.x, b.minX + 0.3, b.maxX - 0.3);
    this.snap.x += ox - this.pos.x;
    this.snap.z += oz - this.pos.z;
    return n;
  }

  // A ledge whose top lies between feet + low and feet + high, on a side the explorer faces.
  findLedge(low, high, reach) {
    const f = this.facing;
    let best = null;
    for (const b of this.world.boxes) {
      if (!b.solid || !b.grab || b.shape !== "box") continue;
      const top = b.maxY;
      if (top < this.feet + low || top > this.feet + high) continue;
      if (b.maxX - b.minX < 0.6 && b.maxZ - b.minZ < 0.6) continue;
      const n = sideNormal(this.pos, b);
      if (-(n.x * f.x + n.z * f.z) < 0.55) continue;
      const faceX = n.x ? (n.x > 0 ? b.maxX : b.minX) : null,
        faceZ = n.z ? (n.z > 0 ? b.maxZ : b.minZ) : null;
      const gap = n.x ? (this.pos.x - faceX) * n.x : (this.pos.z - faceZ) * n.z;
      if (gap < -0.05 || gap > reach) continue;
      const hx = n.x ? faceX : clamp(this.pos.x, b.minX + 0.25, b.maxX - 0.25);
      const hz = n.z ? faceZ : clamp(this.pos.z, b.minZ + 0.25, b.maxZ - 0.25);
      if (
        !this.world.free(hx - n.x * 0.2, hz - n.z * 0.2, 0.14, top, top + 0.45)
      )
        continue;
      if (!best || gap < best.gap)
        best = { box: b, top, n, hand: { x: hx, z: hz }, gap };
    }
    return best;
  }

  // Standing at an edge and facing a drop: the ledge under the explorer's feet.
  findEdgeBelow() {
    const f = this.facing;
    const ax = Math.abs(f.x) > Math.abs(f.z);
    const n = ax ? { x: Math.sign(f.x), z: 0 } : { x: 0, z: Math.sign(f.z) };
    // Stopped on the lip by a careful walk, the body's centre can stand just past it: then
    // the ground is under the heels.
    const b =
      this.world.topAt(this.pos.x, this.pos.z, this.feet, 0.05) ||
      this.world.topAt(
        this.pos.x - n.x * R * 0.6,
        this.pos.z - n.z * R * 0.6,
        this.feet,
        0.05,
      );
    if (!b) return null;
    const faceX = n.x ? (n.x > 0 ? b.maxX : b.minX) : null,
      faceZ = n.z ? (n.z > 0 ? b.maxZ : b.minZ) : null;
    const gap = n.x ? (faceX - this.pos.x) * n.x : (faceZ - this.pos.z) * n.z;
    if (gap > 0.8) return null;
    const hx = n.x ? faceX : this.pos.x,
      hz = n.z ? faceZ : this.pos.z;
    const below = this.world.ground(
      hx + n.x * 0.6,
      hz + n.z * 0.6,
      0.2,
      this.feet - 1.2,
      0,
    );
    if (below > this.feet - 1.6) return null;
    if (
      !this.world.free(
        hx + n.x * HANG_OFF,
        hz + n.z * HANG_OFF,
        HANG_OFF - 0.05,
        this.feet - this.hands,
        this.feet - 0.1,
      )
    )
      return null;
    return { box: b, top: this.feet, n, hand: { x: hx, z: hz } };
  }

  turnTowards(target, dt, rate) {
    const d = wrapAngle(target - this.yaw);
    this.yaw = wrapAngle(this.yaw + clamp(d, -rate * dt, rate * dt));
  }

  remember() {
    if (this.feet < -0.5 || this.clock - (this.rememberedAt ?? -1) < 0.3)
      return;
    this.rememberedAt = this.clock;
    const w = this.world;
    // A bridge of light fades and a lone rock strands: neither is a place to come back to.
    if (w.unsafeAt?.(this.pos.x, this.pos.z, this.feet)) return;
    // Only a spot with firm ground all round is a safe place to return to.
    for (const [dx, dz] of [
      [0.7, 0],
      [-0.7, 0],
      [0, 0.7],
      [0, -0.7],
    ])
      if (
        Math.abs(
          w.ground(this.pos.x + dx, this.pos.z + dz, 0.1, this.feet, 0.1) -
            this.feet,
        ) > 0.05
      )
        return;
    this.safe = {
      x: this.pos.x,
      z: this.pos.z,
      feet: this.feet,
      yaw: this.yaw,
    };
  }

  respawn() {
    const s = this.safe;
    this.spawn(s.x, s.z, s.feet, s.yaw);
    this.events.push("respawn");
  }
}

Object.assign(Hero.prototype, swinging);
Object.assign(Hero.prototype, wallClimbing);

export function climbProgress(t) {
  const k = clamp(t, 0, 1);
  return {
    up:
      0.56 * smooth(Math.min(1, k / 0.5)) +
      0.44 * smooth(clamp((k - 0.58) / 0.4, 0, 1)),
    over:
      0.18 * smooth(clamp((k - 0.35) / 0.25, 0, 1)) +
      0.82 * smooth(clamp((k - 0.6) / 0.4, 0, 1)),
  };
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Camera-relative stick to a world direction. The camera looks along (sin yaw, cos yaw).
function worldWish(move, camYaw) {
  const fx = Math.sin(camYaw),
    fz = Math.cos(camYaw);
  const rx = -fz,
    rz = fx;
  const x = fx * move.y + rx * move.x,
    z = fz * move.y + rz * move.x;
  const len = Math.hypot(x, z);
  return len > 1e-4
    ? {
        x: x / Math.max(1, len),
        z: z / Math.max(1, len),
        len: Math.min(1, len),
      }
    : { x: 0, z: 0, len: 0 };
}

// Outward normal of the box side nearest a point outside it.
function sideNormal(p, b) {
  const dx = p.x < b.minX ? p.x - b.minX : p.x > b.maxX ? p.x - b.maxX : 0;
  const dz = p.z < b.minZ ? p.z - b.minZ : p.z > b.maxZ ? p.z - b.maxZ : 0;
  if (Math.abs(dx) >= Math.abs(dz) && dx !== 0)
    return { x: Math.sign(dx), z: 0 };
  if (dz !== 0) return { x: 0, z: Math.sign(dz) };
  // Inside or touching: the nearest face.
  const opts = [
    [p.x - b.minX, -1, 0],
    [b.maxX - p.x, 1, 0],
    [p.z - b.minZ, 0, -1],
    [b.maxZ - p.z, 0, 1],
  ].sort((a, c) => a[0] - c[0])[0];
  return { x: opts[1], z: opts[2] };
}
