import * as THREE from "three";
import { Spring } from "./spring.js";
import { smooth, mix, noise } from "./math.js";

// Fingers in the glove's order: thumb, index, middle, ring, little. A free hand curls each one
// on a spring of its own: -1 open, 0 relaxed (the glove's bind pose), 1 closed like the grip.
const SIDES = ["left", "right"];
const FREE = 0,
  FIRM = 1,
  REACH = 2;
// Hz and damping: the outer fingers answer a little later and looser than the index.
const HZ = [5.4, 6.6, 6.1, 5.7, 5.2];
const DAMPING = [0.72, 0.62, 0.6, 0.57, 0.54];
// A hand at rest, well short of the glove's bind pose, which reads clenched: the fingers half
// open, the index straightest, the ring and little finger rounder.
const CASCADE = [-0.3, -0.52, -0.44, -0.36, -0.28];
// A loose running fist, the little finger closing most.
const RUN = [0.32, 0.46, 0.54, 0.6, 0.66];
// Degrees each finger parts from its neighbours as the hand spreads, about the palm's normal.
const PART = [-10, -8, 0, 6, 11];
const DRIFT = [0.11, 0.17, 0.14, 0.19, 0.23];
// A hold closes once the hand has come this far to it, and lets go below the second value.
const HOLDS = { ledge: [0.8, 0.35], vine: [0.7, 0.5] };
const PALM_NORMAL = new THREE.Vector3(0, 0, 1);
const _part = new THREE.Quaternion();

// A repeatable value in [0, 1) for a hand's nth gesture.
const pick = (n, seed) => {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const bump = (age, delay, length) =>
  Math.sin(Math.PI * THREE.MathUtils.clamp((age - delay) / length, 0, 1));

export const fingers = {
  prepareFingers() {
    this.fingerRig = {};
    this.fingerAir = 0;
    const H = this.model.userData.hands;
    for (const side of SIDES) {
      const open = H?.[side + "Open"];
      const glove = open?.children.find((mesh) => mesh.fingerPoses);
      const bones = glove?.rigNames
        .slice(1)
        .map((name) => open.getObjectByName(name));
      if (!bones?.length || !bones.every(Boolean)) continue;
      const turns = (values) =>
        bones.map((_, i) => new THREE.Quaternion().fromArray(values, i * 4));
      this.fingerRig[side] = {
        seed: side === "left" ? 101 : 131,
        bones,
        relaxed: turns(glove.fingerPoses.relaxed),
        grip: turns(glove.fingerPoses.grip),
        open: turns(glove.fingerPoses.open),
        curl: HZ.map(() => new Spring()),
        spread: new Spring(),
        target: [0, 0, 0, 0, 0],
        gesture: [0, 0, 0, 0, 0, 0],
        closed: false,
        closing: 0,
        arrival: 0,
        kind: "ledge",
        written: 0,
        landing: 0,
        stun: 0,
        footfall: this.footfall || 0,
        fidget: { next: side === "left" ? 2.4 : 4.1, start: -9, kind: 0, n: 0 },
      };
    }
  },

  // What a hand holds: nothing, something it holds at once (a weapon, the orb, the axes, a block),
  // or a hold it reaches for and closes on as it arrives (a ledge, the rope, ivy).
  handHold(hero, side) {
    const st = hero.state;
    const weight = this.ik[side]?.weight ?? 0;
    const rig = this.fingerRig[side];
    if (
      hero.weaponReload ||
      (hero.equipment === "pistols" &&
        hero.weaponActive &&
        !hero.swimming &&
        (st === "ground" || st === "air"))
    )
      return FIRM;
    if (
      side === "right" &&
      (hero.holding ||
        (!hero.equipment && hero.throwT !== undefined && hero.throwT < 0.5))
    )
      return FIRM;
    let arrival = -1;
    if (st === "wall" && hero.cling) {
      if (hero.cling.s.kind === "ice") return FIRM;
      const hold = hero.cling.limbs[side + "Hand"],
        leap = hero.cling.leap;
      arrival = Math.min(
        weight,
        leap ? leap.t / leap.time : hold && hold.s >= 0 ? hold.s : 1,
      );
      if (rig) rig.kind = "vine";
    } else if (st === "hang" || st === "climb" || st === "swing") {
      arrival = weight;
      if (rig) rig.kind = "ledge";
    }
    if (arrival < 0 || !rig) return weight > 0.35 ? FIRM : FREE;
    rig.arrival = arrival;
    return REACH;
  },

  showHands(hero, dt, reduced = false) {
    const H = this.model.userData.hands;
    if (!H) return;
    this.fingerRig ??= {};
    this.fingerAir =
      hero.state === "air" && !hero.swimming ? (this.fingerAir || 0) + dt : 0;
    for (const side of SIDES) {
      const open = H[side + "Open"],
        grip = H[side + "Grip"];
      if (!open || !grip) continue;
      const hold = this.handHold(hero, side);
      const rig = this.fingerRig[side];
      const closed = rig
        ? this.stepFingers(rig, side, hold, hero, dt, reduced)
        : hold !== FREE;
      open.visible = !closed;
      grip.visible = closed;
      if (!rig) this.handCurl[side] = closed ? 1 : 0;
    }
  },

  stepFingers(rig, side, hold, hero, dt, reduced) {
    const curl = rig.curl;
    // A curl written from outside (the lab resetting a pose) becomes the hand's state.
    if (this.handCurl[side] !== rig.written)
      for (let f = 0; f < 5; f++) {
        curl[f].v = this.handCurl[side];
        curl[f].dv = 0;
      }
    let closing = false;
    if (hold === FIRM) rig.closed = true;
    else if (hold === FREE) rig.closed = false;
    else if (rig.closed) rig.closed = rig.arrival >= HOLDS[rig.kind][1];
    else if (rig.arrival >= HOLDS[rig.kind][0]) {
      closing = true;
      rig.closing += dt;
      if (this.meanCurl(rig) > 0.985 || rig.closing > 0.2) rig.closed = true;
    }
    if (!closing) rig.closing = 0;
    if (rig.closed) {
      for (let f = 0; f < 5; f++) {
        curl[f].v = 1;
        curl[f].dv = 0;
      }
      rig.spread.v = rig.spread.dv = 0;
      rig.written = this.handCurl[side] = 1;
      return true;
    }
    if (dt > 0) {
      const spread = this.fingerTargets(
        rig,
        side,
        hold,
        closing,
        hero,
        reduced,
      );
      for (let f = 0; f < 5; f++) {
        curl[f].step(
          rig.target[f],
          dt,
          reduced ? 9 : closing ? 9 : HZ[f],
          reduced ? 1 : closing ? 0.85 : DAMPING[f],
        );
        curl[f].v = THREE.MathUtils.clamp(curl[f].v, -1, 1.05);
      }
      rig.spread.step(spread, dt, reduced ? 8 : 4.5, reduced ? 1 : 0.8);
    }
    this.poseFingers(rig);
    rig.written = this.handCurl[side] = THREE.MathUtils.clamp(
      this.meanCurl(rig),
      0,
      1,
    );
    return false;
  },

  meanCurl(rig) {
    const c = rig.curl;
    return (c[1].v + c[2].v + c[3].v + c[4].v) / 4;
  },

  // Fills rig.target with each free finger's curl and returns how far the hand spreads.
  fingerTargets(rig, side, hold, closing, hero, reduced) {
    const target = rig.target,
      curl = rig.curl,
      t = this.time,
      seed = rig.seed;
    if (closing) {
      target.fill(1.15);
      return 0;
    }
    if (hold === REACH) {
      target.fill(-0.7);
      target[0] = -0.5;
      return 0.75;
    }
    const st = hero.state;
    // A hop down a step keeps the stride's hands; only a jump or a real fall opens them.
    const airborne = smooth(0.18, 0.55, this.fingerAir);
    const footing =
      hero.swimming || (st !== "ground" && st !== "air") ? 0 : 1 - airborne;
    const pace = st === "ground" ? this.gaitSpeed : hero.speed || 0;
    const run = footing * smooth(1.8, 5, pace) * (1 - this.slide);
    const walk = footing * smooth(0.1, 1.2, pace) * (1 - run);
    const still = footing * (1 - smooth(0.05, 0.6, pace));
    const swing = footing ? this.armSwing[side] : 0;
    const forward = Math.max(0, -swing),
      back = Math.max(0, swing);
    let spread = 0.2 * run * forward;
    let flex = 0.09 * walk * (back - forward);
    let open = 0;
    // Brief flexes: a landing, a hit, a roll's tuck.
    const landing = hero.landing || 0,
      stun = hero.stun || 0;
    if (!reduced) {
      if (landing > rig.landing + 0.05)
        for (let f = 0; f < 5; f++)
          curl[f].dv += 9 * smooth(0.15, 0.6, landing);
      if (stun > rig.stun + 0.05) for (let f = 0; f < 5; f++) curl[f].dv += 6;
    }
    rig.landing = landing;
    rig.stun = stun;
    flex += 0.45 * landing + 0.4 * Math.min(1, stun / 0.3);
    if (st === "roll") {
      const k = Math.min(1, hero.t / 0.72);
      flex += 0.55 * smooth(0, 0.16, k) * (1 - smooth(0.7, 1, k));
    }
    // Vaulting, the palms plant flat; in the air the hands part, wider when falling.
    if (st === "vault") {
      const k = Math.min(1, hero.t);
      const plant = smooth(0.05, 0.25, k) * (1 - smooth(0.55, 0.8, k));
      open = 0.6 * plant;
      spread = Math.max(spread, 0.5 * plant);
    }
    if (airborne > 0) {
      const u = THREE.MathUtils.clamp((hero.vel?.y || 0) / 7.4, -1.6, 1);
      const falling = smooth(-0.15, -0.9, u);
      open = Math.max(open, airborne * (0.1 + 0.4 * falling));
      spread = Math.max(spread, airborne * (0.3 + 0.6 * falling));
    }
    if (this.slide > 0.001) {
      open = mix(open, 0.3, this.slide);
      spread = mix(spread, 0.85, this.slide);
    }
    // Swimming, the fingers close up and cup through the pull and lengthen through the glide.
    if (hero.swimming) {
      const cycle = (this.swimPhase / (Math.PI * 2)) % 1;
      const moving = smooth(
        0.1,
        2.7,
        Math.hypot(hero.swimSpeed || 0, hero.swimVertical || 0),
      );
      const pull = smooth(0.18, 0.36, cycle) * (1 - smooth(0.36, 0.56, cycle));
      flex += moving * (0.25 * pull - 0.35 * (1 - pull));
      spread = mix(0.1, -0.45, moving);
    }
    // Footfalls shake the free fingers, more when running.
    const steps = this.footfall || 0;
    if (steps !== rig.footfall && !reduced)
      for (let f = 0; f < 5; f++)
        curl[f].dv += (0.8 + 2.2 * run) * (0.7 + 0.12 * f);
    rig.footfall = steps;
    // A slow drift, unmatched between fingers, and now and then a small gesture.
    const calm = reduced ? 0 : 0.05 + 0.1 * still;
    const tension = calm * 0.9 * noise(t * 0.07, seed);
    const gesture = reduced ? null : this.fidget(rig, t, still + walk);
    for (let f = 0; f < 5; f++) {
      const loose = mix(CASCADE[f], RUN[f] - 0.16 * forward, run);
      const drift =
        calm * (f ? 1 : 0.7) * noise(t * DRIFT[f] + f * 3.1, seed + f) +
        tension;
      target[f] = mix(
        loose + flex + drift + (gesture ? gesture[f] : 0),
        -0.75,
        open,
      );
    }
    return gesture ? spread + gesture[5] : spread;
  },

  // Every few seconds a small gesture: a ripple from the little finger to the index, the thumb
  // rubbing the index, or a short stretch of the whole hand. Five curls and a spread, or null.
  fidget(rig, t, idle) {
    const g = rig.fidget;
    if (t >= g.next) {
      g.n++;
      g.start = t;
      g.kind = Math.floor(pick(g.n, rig.seed) * 3);
      g.next = t + 2.6 + 4 * pick(g.n, rig.seed + 7);
    }
    const age = t - g.start;
    if (age > 1.4 || idle < 0.05) return null;
    const out = rig.gesture;
    out.fill(0);
    if (g.kind === 0)
      for (let f = 1; f < 5; f++)
        out[f] = 0.36 * idle * bump(age, (4 - f) * 0.09, 0.5);
    else if (g.kind === 1) {
      out[0] = 0.45 * idle * bump(age, 0, 0.75);
      out[1] = 0.24 * idle * bump(age, 0.05, 0.7);
    } else {
      for (let f = 0; f < 5; f++)
        out[f] = -0.45 * idle * bump(age, f * 0.03, 0.8);
      out[5] = 0.7 * idle * bump(age, 0, 0.8);
    }
    return out;
  },

  // One slerp per bone, from relaxed towards the grip or the open hand, and each finger's spread.
  poseFingers(rig) {
    const spread = THREE.MathUtils.clamp(rig.spread.v, -0.6, 1);
    for (let f = 0; f < 5; f++) {
      const c = THREE.MathUtils.clamp(rig.curl[f].v, -1, 1);
      const toward = c >= 0 ? rig.grip : rig.open;
      for (let k = 0; k < 3; k++) {
        const i = f * 3 + k;
        const turn = rig.bones[i].quaternion;
        turn.slerpQuaternions(rig.relaxed[i], toward[i], Math.abs(c));
        if (k === 0 && spread)
          turn.multiply(
            _part.setFromAxisAngle(
              PALM_NORMAL,
              THREE.MathUtils.degToRad(PART[f] * spread * (1 - Math.max(0, c))),
            ),
          );
      }
    }
  },
};
