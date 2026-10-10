import * as THREE from "three";

const _v = [0, 1, 2, 3, 4, 5, 6].map(() => new THREE.Vector3());
// Hanging, the palm's face rests this far over the lip's top.
export const LIP = 0.004;
const _q = [0, 1, 2].map(() => new THREE.Quaternion());
function swing(joint, from, to, weight) {
  const q = _q[0].setFromUnitVectors(from, to);
  _q[1].identity().slerp(q, weight);
  const parent = joint.parent.getWorldQuaternion(_q[2]);
  const world = parent.clone().multiply(joint.quaternion);
  joint.quaternion.copy(parent.invert().multiply(_q[1].multiply(world)));
  joint.updateMatrixWorld(true);
}

export function solveArm(arm, goal, weight) {
  // Solve the wrist after orienting the palm so its offset still lands on the goal.
  const turned = arm.hand && goal.fingers ? handTurn(arm, goal) : null;
  const holder = arm.hand || arm.lower;
  const end = () =>
    turned
      ? arm.hand.getWorldPosition(_v[2])
      : holder.localToWorld(_v[2].copy(arm.palm));
  const at = turned
    ? _v[6]
        .copy(goal.at)
        .sub(
          arm.palm
            .clone()
            .multiply(arm.hand.getWorldScale(new THREE.Vector3()))
            .applyQuaternion(turned),
        )
    : _v[6].copy(goal.at);
  const S = arm.upper.getWorldPosition(_v[0]);
  const E = arm.lower.getWorldPosition(_v[1]);
  const P = end();
  const a = S.distanceTo(E),
    b = E.distanceTo(P);
  const toT = _v[3].copy(at).sub(S);
  const d = THREE.MathUtils.clamp(
    toT.length(),
    Math.abs(a - b) + 1e-3,
    goal.minimumBend
      ? Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(goal.minimumBend))
      : a + b - 1e-3,
  );
  const dir = toT.normalize();
  const pole = _v[4].copy(goal.pole).addScaledVector(dir, -goal.pole.dot(dir));
  if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0).addScaledVector(dir, -dir.y);
  pole.normalize();
  const cosA = THREE.MathUtils.clamp(
    (a * a + d * d - b * b) / (2 * a * d),
    -1,
    1,
  );
  const sinA = Math.sqrt(1 - cosA * cosA);
  const elbow = _v[5]
    .copy(S)
    .addScaledVector(dir, cosA * a)
    .addScaledVector(pole, sinA * a);
  swing(
    arm.upper,
    E.clone().sub(S).normalize(),
    elbow.clone().sub(S).normalize(),
    weight,
  );
  const E2 = arm.lower.getWorldPosition(_v[1]).clone();
  const P2 = end().clone();
  const target = S.clone().addScaledVector(dir, d);
  swing(arm.lower, P2.sub(E2).normalize(), target.sub(E2).normalize(), weight);
  if (turned) {
    const parent = arm.hand.parent.getWorldQuaternion(_q[2]);
    const now = arm.hand.getWorldQuaternion(new THREE.Quaternion());
    arm.hand.quaternion.copy(
      parent.invert().multiply(now.slerp(turned, weight)),
    );
    arm.hand.updateMatrixWorld(true);
  } else if (arm.hand && goal.normal) {
    const q = arm.hand.getWorldQuaternion(_q[0]);
    const now = arm.normal.clone().applyQuaternion(q);
    swing(arm.hand, now, goal.normal.clone().normalize(), weight);
  }
}

// The hand's turn in the world that sets its palm facing `goal.normal` and its fingers along
// `goal.fingers`: the rest frame of palm and fingers carried onto the wanted one.
export function handTurn(arm, goal) {
  const frame = (n, f) => {
    const fn = f.clone().addScaledVector(n, -f.dot(n)).normalize();
    return new THREE.Matrix4().makeBasis(
      n,
      fn,
      new THREE.Vector3().crossVectors(n, fn),
    );
  };
  const rest = frame(arm.normal.clone().normalize(), arm.fingers);
  const want = frame(goal.normal.clone().normalize(), goal.fingers);
  return new THREE.Quaternion().setFromRotationMatrix(
    want.multiply(rest.transpose()),
  );
}
