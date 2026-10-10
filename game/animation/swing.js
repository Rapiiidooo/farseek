import * as THREE from "three";
import { smooth, mix, set } from "./math.js";

// On a swing rope: the body hangs along the rope from both hands, the legs kick forward with the
// swing and trail behind on the way back, and the catch lands with a flex of arms and knees.
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function swing(pose, root, hero, dt) {
  const sw = hero.pendulum;
  if (!sw) return;
  const catchK = 1 - smooth(0, 0.35, sw.t);
  const forward = THREE.MathUtils.clamp(sw.spin / 1.6, -1, 1);
  const lead = (forward + 1) / 2;
  const height = THREE.MathUtils.clamp(sw.angle / 1.1, -1, 1);
  // The body follows the rope's angle exactly, without the root spring's lag.
  const pitch = this.root.pitch;
  pitch.v += (-sw.angle - pitch.v) * (1 - Math.exp(-dt * 26));
  pitch.dv = 0;
  root.pitch = -sw.angle;
  root.bob = 0;
  for (const [side, sign, offset] of [
    ["left", 1, 0.06],
    ["right", -1, -0.04],
  ]) {
    set(pose, side + "UpperArm", -2.6, 0, sign * -0.08);
    set(pose, side + "LowerArm", -0.3 - 0.45 * catchK);
    set(pose, side + "Hand", 0.1);
    const kick = mix(0.25, -0.95, lead) + offset - 0.35 * catchK * forward;
    set(pose, side + "UpperLeg", kick, 0, sign * 0.05);
    set(
      pose,
      side + "LowerLeg",
      mix(1.05, 0.22, lead) + 0.35 * catchK + offset * 2,
    );
    set(pose, side + "Foot", 0.3 - 0.1 * lead);
  }
  set(pose, "spine", mix(-0.12, 0.2, lead) + 0.08 * catchK, 0, 0);
  set(pose, "head", -0.25 + 0.45 * Math.max(0, height) * 0.6, 0, 0);
  this.swingGoals = ropeGoals(hero);
}

function ropeGoals(hero) {
  const sw = hero.pendulum,
    p = sw.rope.pivot,
    g = sw.grip;
  const up = V(p.x - g.x, p.y - g.y, p.z - g.z).normalize();
  const forward = V(sw.dir.x, 0, sw.dir.y);
  const right = V()
    .crossVectors(forward, V(0, 1, 0))
    .normalize();
  const goal = (along, sign) => {
    const normal = right.clone().multiplyScalar(sign);
    return {
      at: g.clone().addScaledVector(up, along).addScaledVector(normal, -0.035),
      pole: right
        .clone()
        .multiplyScalar(-sign * 0.8)
        .addScaledVector(forward, 0.35)
        .addScaledVector(up, -0.3),
      normal,
      fingers: up.clone().multiplyScalar(0.8).addScaledVector(forward, 0.6),
      weight: 1,
    };
  };
  return { left: goal(-0.06, 1), right: goal(0.07, -1), weight: 1 };
}
