import * as THREE from "three";
import { Spring } from "./spring.js";
import { smooth } from "./math.js";

// A catch carries the body from where it was to the hold it caught over a moment instead of a
// frame: a jump's momentum settles into the hang or onto the wall, and a drop from the top turns,
// crouches at the edge with the hands on it, then lowers down the face into the hang.
const DROP_TIME = 0.8;
const CROUCH = {
  leftUpperLeg: [-1.75, 0, 0.12],
  rightUpperLeg: [-1.55, 0, -0.12],
  leftLowerLeg: [2.25, 0, 0],
  rightLowerLeg: [2.05, 0, 0],
  leftFoot: [0.35, 0, 0],
  rightFoot: [0.3, 0, 0],
  spine: [0.55, 0, 0],
  head: [0.18, 0, 0],
};

export const arrival = {
  startArrival(hero, state) {
    const a = hero.arrival;
    hero.arrival = null;
    this.arrival = null;
    if (!a || Math.hypot(a.x, a.y, a.z) < 0.02) return;
    const springs = [new Spring(), new Spring(), new Spring()];
    springs[0].v = a.x;
    springs[1].v = Math.max(-0.12, a.y);
    springs[2].v = a.z;
    springs[1].dv = THREE.MathUtils.clamp(a.vy, -6, 2);
    this.arrival = {
      fromTop: a.fromTop,
      // Hands and picks plant on a wall at once, so the body has to meet them quickly.
      rate: state === "wall" ? 1.9 : 1,
      t: 0,
      from: new THREE.Vector3(a.x, a.y, a.z),
      offset: new THREE.Vector3(a.x, a.y, a.z),
      springs,
    };
  },

  // Advances the arrival and, for a drop, blends the crouch at the edge into the pose.
  arrivalPose(pose, root, dt) {
    const A = this.arrival;
    if (!A) return;
    A.t += dt;
    if (A.fromTop) {
      const u = Math.min(1, A.t / DROP_TIME);
      const across = 1 - smooth(0, 0.45, u),
        down = 1 - smooth(0.3, 1, u);
      A.offset.set(A.from.x * across, A.from.y * down, A.from.z * across);
      const w = 1 - smooth(0.3, 0.8, u);
      if (w > 0) {
        for (const [name, target] of Object.entries(CROUCH)) {
          const joint = (pose[name] ??= [0, 0, 0]);
          for (let i = 0; i < 3; i++) joint[i] += (target[i] - joint[i]) * w;
        }
        root.bob -= 0.42 * w;
      }
      if (u >= 1) this.arrival = null;
      return;
    }
    const [x, y, z] = A.springs;
    x.step(0, dt, 2.2 * A.rate, 1);
    y.step(0, dt, 1.7 * A.rate, 1);
    z.step(0, dt, 2.2 * A.rate, 1);
    // The arms already hang straight from the lip: the body comes no lower than its hold, and
    // one caught from below rises the last few centimetres.
    const lowest = Math.max(-0.12, Math.min(-0.015, A.from.y));
    A.offset.set(x.v, Math.max(lowest, y.v), z.v);
    if (A.t > 1.2 && A.offset.lengthSq() < 4e-6) this.arrival = null;
  },
};
