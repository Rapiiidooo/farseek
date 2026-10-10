import * as THREE from "three";
import { smooth, mix, add } from "./math.js";

export function overlays(pose, root, hero, speed = hero.speed) {
  if (
    hero.equipment === "pistols" &&
    hero.weaponActive &&
    !hero.swimming &&
    ["ground", "air"].includes(hero.state)
  ) {
    const running =
      hero.state === "ground"
        ? smooth(2.2, 5, speed) *
          (1 - THREE.MathUtils.clamp(hero.weaponAim || 0, 0, 1))
        : 0;
    const relaxedCarry =
      hero.state === "ground"
        ? (1 - smooth(2.2, 4, speed)) *
          (1 - THREE.MathUtils.clamp(hero.weaponAim || 0, 0, 1))
        : 0;
    const walk =
      hero.state === "ground" ? smooth(0.1, 0.7, speed) * relaxedCarry : 0;
    for (const [side, sign] of [
      ["left", 1],
      ["right", -1],
    ]) {
      const upper = pose[side + "UpperArm"],
        lower = pose[side + "LowerArm"];
      upper[0] = mix(-0.08, 0, running) + upper[0] * mix(0.3, 0.82, running);
      upper[1] *= mix(0.3, 0.7, running);
      upper[2] = mix(sign * 0.025, upper[2], running);
      lower[0] =
        mix(-0.42, -0.23, relaxedCarry) * (1 - running) +
        lower[0] * mix(0.12, 0.85, running) +
        0.09 * walk;
    }
  }
  const t = hero.equipment ? undefined : hero.throwT;
  if (t !== undefined && t < 0.5) {
    // Wind back, whip across, follow through.
    const wind = smooth(0, 0.08, t),
      whip = smooth(0.08, 0.2, t),
      back = smooth(0.25, 0.5, t);
    const armX = mix(mix(0, 0.9, wind), -1.55, whip) * (1 - back);
    const armZ = mix(mix(0, -0.9, wind), -0.2, whip) * (1 - back);
    add(pose, "rightUpperArm", armX, 0, armZ);
    add(pose, "rightLowerArm", mix(-1.2 * wind, -0.15, whip) * (1 - back));
    add(
      pose,
      "spine",
      0.1 * whip * (1 - back),
      mix(0.5 * wind, -0.45, whip) * (1 - back),
    );
  } else if (hero.holding) {
    if (hero.state === "ground" && !hero.swimming) {
      const upper = pose.rightUpperArm,
        lower = pose.rightLowerArm;
      const running = smooth(2.2, 5, speed);
      upper[0] =
        mix(-0.2, -0.08, running) + upper[0] * mix(0.32, 0.72, running);
      upper[1] = 0.06;
      upper[2] = -0.025;
      lower[0] =
        mix(-0.72, -0.24, running) + lower[0] * mix(0.22, 0.78, running);
    } else {
      add(pose, "rightUpperArm", -0.35, 0, -0.08);
      add(pose, "rightLowerArm", -0.55);
    }
    if (
      hero.equipment === "orb" &&
      !hero.swimming &&
      ["ground", "air"].includes(hero.state)
    ) {
      const pulse = THREE.MathUtils.clamp(hero.orbPulse || 0, 0, 1);
      add(pose, "rightUpperArm", -0.1 * pulse);
      add(pose, "rightLowerArm", -0.06 * pulse);
      add(pose, "rightHand", 0.08 * pulse);
    }
  }
  const c = hero.equipment ? undefined : hero.catchT;
  if (c !== undefined && c < 0.3) {
    const k = Math.sin((c / 0.3) * Math.PI);
    add(pose, "rightUpperArm", -1.3 * k, 0, -0.2 * k);
  }
  if (hero.stun > 0) {
    const k = Math.min(1, hero.stun / 0.3);
    add(pose, "spine", -0.45 * k);
    add(pose, "head", 0.3 * k);
    add(pose, "leftUpperArm", -0.9 * k, 0, 0.6 * k);
    add(pose, "rightUpperArm", -0.9 * k, 0, -0.6 * k);
    root.pitch -= 0.25 * k;
  }
}
