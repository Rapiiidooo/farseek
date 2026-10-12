import * as THREE from "three";
import { smooth, mix, GAIT, set, add, noise } from "./math.js";

// Each arm draws its own noise, so the two never mirror each other exactly.
const ARMS = [
  ["left", 1, 3],
  ["right", -1, 17],
];

export function locomotion(pose, root, hero, dt, { turnRate, accel }) {
  const speed = this.gaitSpeed,
    r = smooth(2.2, 5, speed),
    moving = smooth(0.06, 0.65, speed),
    idle = 1 - moving;
  if (this.articulatedFeet) {
    if (this.distance > 1e-6 && !this.gaitStarted)
      this.phase = Math.PI * mix(0.58, this.runContact, r);
    this.gaitStarted = moving > 0.02;
  }
  const before = this.phase;
  const strides =
    this.distance / mix(1.4, this.articulatedFeet ? this.runStride : 2.9, r);
  this.cycles += strides;
  this.phase = (this.phase + Math.PI * 2 * strides) % (Math.PI * 2);
  if (
    speed > 0.25 &&
    Math.floor(before / Math.PI) !== Math.floor(this.phase / Math.PI)
  )
    this.footfall = (this.footfall || 0) + 1;
  const phi = this.phase,
    s = Math.cos(phi),
    duty = mix(0.58, this.runContact, r);
  const leg = (phase) => {
    const p = (phase / (Math.PI * 2) + 1) % 1;
    const stance = p < duty;
    const t = stance ? p / duty : (p - duty) / (1 - duty);
    const thigh = stance
      ? mix(-0.4, 0.42, t)
      : mix(0.42, -0.4, smooth(0, 1, t));
    const knee = stance
      ? 0.08 + 0.2 * Math.sin(t * Math.PI)
      : 0.12 + mix(0.8, 1.45, r) * Math.sin(t * Math.PI) ** 1.3;
    return [thigh * moving, knee * moving];
  };
  const [lt, lk] = leg(phi),
    [rt, rk] = leg(phi + Math.PI);
  set(pose, "leftUpperLeg", lt, 0, 0.02);
  set(pose, "leftLowerLeg", lk);
  set(pose, "rightUpperLeg", rt, 0, -0.02);
  set(pose, "rightLowerLeg", rk);
  const swing = mix(0.24, GAIT.arm, r) * moving;
  // Slow noise over strides and time varies each arm's reach, timing and elbow, so no two
  // cycles repeat. Running, the elbow pumps late and the wrist trails the swing.
  const vary = mix(0.5, 1, r) * moving,
    k = this.cycles,
    clock = this.time;
  let reaches = 0;
  for (const [side, sign, seed] of ARMS) {
    const reach =
      1 +
      vary *
        (0.32 * noise(k * 0.41 + clock * 0.03, seed) +
          0.16 * noise(clock * 0.11, seed + 1));
    reaches += reach / 2;
    const theta =
      phi +
      mix(-0.12, 0.18, r) +
      vary * 0.35 * noise(k * 0.33 + clock * 0.05, seed + 2);
    const cycle = sign * Math.cos(theta);
    const forward = Math.max(0, -cycle);
    this.armSwing[side] = cycle * moving;
    const trail = -sign * Math.cos(theta - 0.5);
    set(
      pose,
      side + "UpperArm",
      swing * reach * cycle + 0.1 * r * moving,
      -sign * moving * (0.03 + 0.055 * forward),
      sign *
        (-0.085 +
          0.08 * idle +
          moving * (0.04 + 0.015 * r) -
          0.05 * r * moving * forward +
          vary * 0.1 * noise(k * 0.37 + clock * 0.04, seed + 5)),
    );
    set(
      pose,
      side + "LowerArm",
      -0.12 -
        0.2 * idle -
        moving *
          mix(0.17 + 0.07 * forward + 0.04 * trail, 1.2 + 0.25 * trail, r) +
        mix(0.15, 0.24, r) * moving * noise(k * 0.27 + clock * 0.07, seed + 3),
    );
    set(
      pose,
      side + "Hand",
      -0.02 * moving + vary * 0.12 * sign * Math.sin(theta - 0.9),
      vary * 0.1 * noise(clock * 0.17, seed + 4),
      sign * moving * (0.015 * cycle - mix(0.03, 0.1, r) * trail),
    );
  }
  const lean =
    0.025 +
    0.16 * r * moving +
    THREE.MathUtils.clamp(accel * 0.018, -0.11, 0.13);
  const twist = mix(0.09, GAIT.yaw, r) * moving;
  const support = Math.cos(phi - Math.PI * mix(0.58, this.runContact, r));
  const pelvicRoll = mix(0.034, GAIT.roll, r) * moving * support;
  set(pose, "hips", 0, -twist * s, pelvicRoll);
  set(
    pose,
    "spine",
    lean + vary * 0.03 * noise(clock * 0.23, 41),
    mix(1.5, 1.95, r * this.runForward) *
      twist *
      reaches *
      Math.cos(phi - 0.15),
    -0.7 * pelvicRoll + vary * 0.02 * noise(clock * 0.19, 43),
  );
  set(
    pose,
    "head",
    -0.6 * lean - 0.035,
    -mix(0.85, 1.1, r * this.runForward) * twist * s +
      THREE.MathUtils.clamp(turnRate * 0.035, -0.12, 0.12) +
      vary * 0.08 * noise(clock * 0.21, 47),
    0,
  );
  const supportHeight = Math.cos(phi * 2 - duty * Math.PI * 2);
  root.bob =
    moving *
    mix(
      -0.022 + 0.012 * supportHeight,
      mix(
        -0.042 - 0.023 * supportHeight,
        -0.025 - 0.043 * supportHeight,
        this.runForward,
      ),
      r,
    );
  root.pitch = 0.055 * r * moving;
  root.sway = mix(0.028, GAIT.sway, r) * moving * support;
  root.roll = THREE.MathUtils.clamp(-turnRate * speed * 0.022, -0.2, 0.2);
  const t = this.time;
  const breathe = Math.sin(t * 1.65) * 0.012;
  // Standing, she settles her weight on one leg, the other easy, and now and then moves it over.
  if (t >= (this.weightNext ??= t + 5)) {
    this.weightSide = -(this.weightSide || 1);
    const n = Math.sin(Math.floor(t) * 12.9898) * 43758.5453;
    this.weightNext = t + 6 + 7 * (n - Math.floor(n));
  }
  this.weight =
    (this.weight || 0) +
    ((this.weightSide || 1) * idle - (this.weight || 0)) *
      (1 - Math.exp(-dt / 0.8));
  const weight = this.weight;
  root.sway += 0.045 * weight;
  add(pose, "hips", 0, 0, -0.1 * weight);
  add(pose, "spine", idle * breathe, 0, 0.065 * weight);
  add(
    pose,
    "head",
    -idle * breathe,
    idle * Math.sin(t * 0.37) * 0.1,
    -0.012 * weight,
  );
  add(pose, "leftUpperArm", idle * Math.sin(t * 1.1) * 0.016);
  add(pose, "rightUpperArm", idle * Math.sin(t * 1.1 + 0.5) * 0.016, 0, 0);
  // The upper body lags a floor that speeds up or slows down under the feet.
  const floor = this.supportAccel,
    heading = this.root.yaw.v;
  const floorAhead = floor.x * Math.sin(heading) + floor.z * Math.cos(heading),
    floorAcross = floor.x * Math.cos(heading) - floor.z * Math.sin(heading);
  add(
    pose,
    "spine",
    THREE.MathUtils.clamp(-0.025 * floorAhead, -0.06, 0.06),
    0,
    THREE.MathUtils.clamp(0.025 * floorAcross, -0.05, 0.05),
  );
  if (this.slide > 0.001) glide.call(this, pose, root, hero, t);
  const landing = hero.landing || 0;
  if (landing > 0) {
    add(pose, "leftUpperLeg", -0.7 * landing);
    add(pose, "rightUpperLeg", -0.6 * landing);
    add(pose, "leftLowerLeg", 1.25 * landing);
    add(pose, "rightLowerLeg", 1.15 * landing);
    add(pose, "spine", 0.32 * landing);
    add(pose, "head", -0.12 * landing);
    add(pose, "leftUpperArm", -0.35 * landing, 0, 0.25 * landing);
    add(pose, "rightUpperArm", -0.35 * landing, 0, -0.25 * landing);
    root.bob -= 0.2 * landing;
  }
}

// Gliding on ice: soft knees, the chest over the feet, leaning against the slowing glide, and
// free arms held out for balance as the body wavers. Held equipment keeps its own arms.
function glide(pose, root, hero, t) {
  const w = this.slide,
    yaw = this.root.yaw.v,
    direction = this.glideDirection;
  const ahead = direction.x * Math.sin(yaw) + direction.z * Math.cos(yaw),
    across = direction.x * Math.cos(yaw) - direction.z * Math.sin(yaw);
  const brake = THREE.MathUtils.clamp(this.glideDecel * 0.05, 0, 0.12) * w;
  const sway = noise(t * 0.6, 29),
    waver = noise(t * 0.9 + 5, 31);
  root.bob -= 0.055 * w;
  root.roll += 0.035 * sway * w;
  add(
    pose,
    "spine",
    0.1 * w - brake * ahead,
    0.05 * waver * w,
    brake * across - 0.03 * sway * w,
  );
  add(
    pose,
    "head",
    -0.07 * w + 0.5 * brake * ahead,
    -0.04 * waver * w,
    0.02 * sway * w,
  );
  const pistols = hero.equipment === "pistols" && hero.weaponActive;
  const carrying =
    hero.holding || (!hero.equipment && (hero.throwT ?? 9) < 0.5);
  for (const [side, sign, seed] of ARMS) {
    if (pistols || (sign < 0 && carrying)) continue;
    blend(
      pose[side + "UpperArm"],
      -0.3 + 0.1 * noise(t * 0.7, seed + 5),
      0,
      sign * (0.6 + 0.15 * sign * sway),
      w,
    );
    blend(
      pose[side + "LowerArm"],
      -0.62 + 0.12 * noise(t * 0.5, seed + 6),
      0,
      0,
      w,
    );
    blend(pose[side + "Hand"], 0.08, 0, sign * 0.1, w);
  }
}

function blend(joint, x, y, z, w) {
  joint[0] += (x - joint[0]) * w;
  joint[1] += (y - joint[1]) * w;
  joint[2] += (z - joint[2]) * w;
}
