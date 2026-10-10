import * as THREE from "three";
import { smooth, mix, set, add } from "./math.js";
import { locomotion } from "./locomotion.js";
import { swing } from "./swing.js";

export const POSES = {
  ground: locomotion,
  swing,

  swim(pose, root, hero, dt, { turnRate }) {
    const horizontal = hero.swimSpeed || 0,
      vertical = hero.swimVertical || 0,
      speed = Math.hypot(horizontal, vertical),
      moving = smooth(0.1, 2.7, speed);
    this.swimPhase += dt * mix(1.15, 4.2, moving);
    const p = this.swimPhase,
      cycle = (p / (Math.PI * 2)) % 1,
      open = smooth(0, 0.18, cycle),
      pull = smooth(0.18, 0.36, cycle),
      recover = smooth(0.36, 0.56, cycle),
      tuck = smooth(0.24, 0.5, cycle),
      kick = smooth(0.57, 0.78, cycle),
      close = smooth(0.64, 0.82, cycle);
    const elbow = mix(mix(0.15, -1.6, pull), 0.15, recover),
      knee = mix(mix(0.08, 1.75, tuck), 0.08, kick),
      thigh = mix(mix(-0.025, -0.38, tuck), -0.025, kick),
      legSpread = (0.025 + 0.24 * tuck) * (1 - close) + 0.025 * close;
    for (const [side, sign] of [
      ["left", 1],
      ["right", -1],
    ]) {
      const scull = Math.sin(p * 1.6 + sign * 0.35);
      set(
        pose,
        side + "UpperArm",
        mix(
          -0.42 + scull * 0.08,
          mix(-2.65, -1.55, pull * (1 - recover)),
          moving,
        ),
        0,
        sign * mix(0.62 + 0.13 * scull, 0.12, moving),
      );
      set(pose, side + "LowerArm", mix(-0.6, elbow, moving));
      set(
        pose,
        side + "UpperLeg",
        mix(-0.08, thigh, moving),
        sign * moving * 0.14 * tuck * (1 - kick),
        sign * mix(0.055, legSpread, moving),
      );
      set(
        pose,
        side + "LowerLeg",
        mix(0.3 + 0.08 * Math.sin(p + sign), knee, moving),
      );
      set(
        pose,
        side + "Foot",
        mix(0.12, mix(mix(0.3, -0.4, tuck), 0.3, kick), moving),
        sign * moving * 0.32 * tuck * (1 - close),
      );
      set(
        pose,
        side + "Hand",
        moving * (-0.08 + 0.2 * pull * (1 - recover)),
        0,
        sign * moving * 0.07 * open * (1 - recover),
      );
    }
    const effort = pull * (1 - recover);
    set(pose, "spine", 0.025 + 0.035 * effort * moving, 0, 0);
    set(pose, "head", mix(-0.23, -0.6 - 0.15 * effort, moving), 0, 0);
    root.pitch =
      mix(
        0.25,
        THREE.MathUtils.clamp(
          Math.atan2(horizontal, vertical),
          0.08,
          Math.PI - 0.08,
        ),
        moving,
      ) -
      0.08 * effort * moving * (horizontal / Math.max(0.1, speed));
    root.roll = THREE.MathUtils.clamp(-turnRate * 0.06, -0.18, 0.18);
    root.bob = mix(0.014 * Math.sin(p * 2), 0.016 * effort, moving);
  },

  roll(pose, root, hero) {
    const t = Math.min(1, hero.t / 0.72);
    const tuck = smooth(0, 0.16, t) * (1 - smooth(0.7, 1, t));
    const shoulder = Math.sin(Math.PI * smooth(0.12, 0.79, t));
    set(pose, "leftUpperLeg", -1.95 * tuck);
    set(pose, "rightUpperLeg", -1.7 * tuck);
    set(pose, "leftLowerLeg", 2.35 * tuck + 0.08);
    set(pose, "rightLowerLeg", 2.15 * tuck + 0.08);
    set(pose, "leftUpperArm", -0.65 * tuck, 0.08 * tuck, 0.12 * tuck);
    set(pose, "rightUpperArm", -0.85 * tuck, -0.12 * tuck, -0.16 * tuck);
    set(pose, "leftLowerArm", -0.92 * tuck - 0.12);
    set(pose, "rightLowerArm", -1.02 * tuck - 0.12);
    set(pose, "leftHand", -0.12 * tuck);
    set(pose, "rightHand", -0.12 * tuck);
    set(pose, "spine", 0.82 * tuck, 0.24 * shoulder);
    set(pose, "head", 0.62 * tuck, -0.18 * shoulder);
    root.bob = -0.28 * tuck;
    root.roll = 0.42 * shoulder;
  },

  // Rising, tucked at the top, reaching for the ground on the way down.
  air(pose, root, hero) {
    const u = THREE.MathUtils.clamp(hero.vel.y / 7.4, -1.6, 1);
    const up = smooth(0.15, 0.6, u),
      down = smooth(-0.15, -0.7, u),
      top = Math.max(0, 1 - up - down);
    const k = (a, b, c) => a * up + b * top + c * down;
    set(pose, "leftUpperLeg", k(-1.15, -0.85, -0.4), 0, 0.04);
    set(pose, "leftLowerLeg", k(1.45, 1.35, 0.4));
    set(pose, "rightUpperLeg", k(0.35, -0.55, -0.12), 0, -0.04);
    set(pose, "rightLowerLeg", k(0.55, 1.1, 0.3));
    const flail = Math.max(0, -hero.vel.y - 9) * 0.08;
    const w = Math.sin(this.time * 9) * Math.min(0.7, flail);
    set(pose, "leftUpperArm", k(-1.7, -0.9, -1.25) + w, 0, k(0.2, 0.75, 1.05));
    set(
      pose,
      "rightUpperArm",
      k(-0.95, -0.9, -1.25) - w,
      0,
      k(-0.2, -0.75, -1.05),
    );
    set(pose, "leftLowerArm", k(-0.55, -0.4, -0.25));
    set(pose, "rightLowerArm", k(-0.65, -0.4, -0.25));
    set(pose, "spine", k(0.18, 0.28, 0.02));
    set(pose, "head", k(-0.15, -0.2, 0.05));
    root.pitch = k(0.08, 0.12, -0.04);
  },

  // Hanging: arms reach up and forward to the lip, legs dangle, shimmying goes hand over hand.
  hang(pose, root, hero) {
    const sh = hero.shimmy || 0;
    const t = this.time;
    const reach = sh ? Math.sin(t * 8.5) : 0;
    set(
      pose,
      "leftUpperArm",
      -2.72 + 0.14 * reach * sh,
      0,
      -0.14 + 0.1 * Math.max(0, reach) * sh,
    );
    set(
      pose,
      "rightUpperArm",
      -2.72 - 0.14 * reach * sh,
      0,
      0.14 + 0.1 * Math.max(0, -reach) * sh,
    );
    set(pose, "leftLowerArm", -0.12 - 0.3 * Math.max(0, -reach));
    set(pose, "rightLowerArm", -0.12 - 0.3 * Math.max(0, reach));
    set(pose, "spine", -0.08);
    set(pose, "head", -0.32, 0.25 * sh);
    // The legs hang a little back with the knees bent, so the boots keep off the wall as
    // they sway.
    const sway = sh ? Math.sin(t * 8.5) * 0.12 : Math.sin(t * 1.3) * 0.04;
    set(pose, "leftUpperLeg", 0.16 + sway, 0, 0.05);
    set(pose, "rightUpperLeg", 0.1 - sway, 0, -0.05);
    set(pose, "leftLowerLeg", 0.5 + Math.max(0, sway));
    set(pose, "rightLowerLeg", 0.4 + Math.max(0, -sway));
    root.roll = sh * 0.05 * reach;
  },

  // The mantle: pull with bent arms, press down with a knee on the lip, then stand.
  climb(pose, root, hero) {
    const t = Math.min(1, hero.t);
    const a = smooth(0, 0.42, t),
      b = smooth(0.24, 0.64, t),
      stand = smooth(0.76, 1, t),
      transfer = b * (1 - stand);
    const armX = mix(mix(-2.72, -1.25, a), 0.35, b);
    const elbow = mix(mix(-0.12, -1.9, a), -0.22, b);
    for (const [side, sign, release] of [
      ["left", 1, smooth(0.62, 0.85, t)],
      ["right", -1, smooth(0.7, 0.93, t)],
    ]) {
      set(
        pose,
        side + "UpperArm",
        armX * (1 - release),
        sign * 0.08 * transfer,
        sign * 0.12,
      );
      set(pose, side + "LowerArm", mix(elbow, -0.2, release));
    }
    set(
      pose,
      "spine",
      mix(mix(-0.05, 0.32, a), 0.7, b) * (1 - stand) + 0.06 * stand,
      -0.065 * transfer,
      0.035 * transfer,
    );
    set(pose, "head", mix(-0.35, -0.12, a) * (1 - stand), 0.05 * transfer);
    set(pose, "leftUpperLeg", mix(mix(0, -0.45, a), -1.8, b) * (1 - stand));
    set(
      pose,
      "leftLowerLeg",
      mix(mix(0.3, 0.7, a), 2.25, b) * (1 - stand) + 0.08 * stand,
    );
    const trailing = smooth(0.54, 0.84, t);
    set(pose, "rightUpperLeg", mix(0.12 * a, -0.8, trailing) * (1 - stand));
    set(
      pose,
      "rightLowerLeg",
      mix(0.3 + 0.15 * a, 1.25, trailing) * (1 - stand) + 0.08 * stand,
    );
    set(pose, "leftFoot", -0.12 * transfer);
    set(pose, "rightFoot", 0.2 * trailing * (1 - stand));
    root.bob = -0.05 * transfer;
    root.roll = 0.045 * transfer;
  },

  // A quick hop onto a low ledge: hands plant, knees tuck through.
  vault(pose, root, hero) {
    const t = Math.min(1, hero.t);
    const plant = smooth(0, 0.35, t),
      tuck = Math.sin(Math.PI * smooth(0.1, 0.9, t)),
      rise = smooth(0.7, 1, t);
    const arm = mix(-1.2, 0.25, plant) * (1 - rise);
    set(pose, "leftUpperArm", arm, 0, 0.15);
    set(pose, "rightUpperArm", arm, 0, -0.15);
    set(pose, "leftLowerArm", -0.3 * (1 - rise));
    set(pose, "rightLowerArm", -0.3 * (1 - rise));
    set(pose, "leftUpperLeg", -1.35 * tuck);
    set(pose, "rightUpperLeg", -1.1 * tuck);
    set(pose, "leftLowerLeg", 1.7 * tuck);
    set(pose, "rightLowerLeg", 1.5 * tuck);
    set(pose, "spine", 0.55 * tuck);
    set(pose, "head", -0.2 * tuck);
  },

  // Braced against a block, ready to push or pull; straining when it will not move.
  grab(pose, root, hero) {
    brace(pose, root, hero, 0, this.time);
    const strain = hero.t - (hero.strainAt ?? -9);
    if (strain < 0.6) {
      const k = Math.sin((strain / 0.6) * Math.PI);
      add(pose, "spine", 0.12 * k + Math.sin(this.time * 38) * 0.03 * k);
      add(pose, "leftUpperLeg", -0.25 * k);
      add(pose, "rightUpperLeg", 0.2 * k);
      root.bob -= 0.05 * k;
    }
  },

  // Driving the block: legs step in time with its slide, the body leans into the work.
  shove(pose, root, hero) {
    brace(pose, root, hero, Math.min(1, hero.t), this.time);
  },

  // Hands on the mirror's handles, the body twisting with the turn.
  turn(pose, root, hero) {
    const spin = hero.turning || 0;
    const t = this.time;
    set(pose, "leftUpperArm", -1.05, 0, 0.18);
    set(pose, "rightUpperArm", -1.05, 0, -0.18);
    set(pose, "leftLowerArm", -1.0 + 0.25 * spin);
    set(pose, "rightLowerArm", -1.0 - 0.25 * spin);
    set(pose, "spine", 0.28, -0.3 * spin, 0);
    set(pose, "head", -0.1, 0.35 * spin, 0);
    const step = Math.abs(spin) > 0.2 ? Math.sin(t * 6) * 0.25 : 0;
    set(pose, "leftUpperLeg", -0.35 + step, 0, 0.08);
    set(pose, "rightUpperLeg", 0.3 - step, 0, -0.08);
    set(pose, "leftLowerLeg", 0.45 + Math.max(0, step));
    set(pose, "rightLowerLeg", 0.2 + Math.max(0, -step));
    root.bob = -0.06;
  },
};

function brace(pose, root, hero, progress, time) {
  const pulling = hero.state === "shove" && hero.pulling;
  const moving = hero.state === "shove";
  const p = moving ? progress * Math.PI * 4 : 0;
  const s = Math.sin(p);
  set(pose, "leftUpperArm", pulling ? -1.25 : -1.45, 0, 0.05);
  set(pose, "rightUpperArm", pulling ? -1.25 : -1.45, 0, -0.05);
  set(pose, "leftLowerArm", pulling ? -0.1 : -0.5);
  set(pose, "rightLowerArm", pulling ? -0.1 : -0.5);
  set(pose, "spine", pulling ? -0.25 : 0.3 + 0.05 * Math.sin(time * 3));
  set(pose, "head", pulling ? 0.1 : -0.3);
  const base = pulling ? [0.35, -0.3] : [-0.6, 0.45];
  set(pose, "leftUpperLeg", base[0] + 0.45 * s, 0, 0.05);
  set(pose, "rightUpperLeg", base[1] - 0.45 * s, 0, -0.05);
  set(pose, "leftLowerLeg", 0.45 + 0.5 * Math.max(0, s));
  set(pose, "rightLowerLeg", 0.3 + 0.5 * Math.max(0, -s));
  root.bob = -0.12 + (moving ? 0.03 * Math.abs(s) : 0);
  root.pitch = pulling ? -0.06 : 0.08;
}
