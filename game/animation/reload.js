import * as THREE from "three";
import { solveArm } from "./ik.js";
import { add } from "./math.js";

export function reloadBody(pose, root, hero) {
  const reload = hero.weaponReload;
  if (!reload || !hero.weaponActive) return;
  add(
    pose,
    "spine",
    0.08 * reload.dip,
    0.045 * reload.spread,
    -0.025 * reload.spread,
  );
  add(
    pose,
    "head",
    -0.04 * reload.dip,
    -0.035 * reload.spread,
    0.02 * reload.spread,
  );
  root.pitch += 0.025 * reload.dip;
  root.bob -= 0.018 * reload.dip;
}

export function reloadArms(hero) {
  const pose = hero.weaponReload;
  if (!hero.weaponActive || hero.equipment !== "pistols" || !pose) return;
  this.model.updateMatrixWorld(true);
  for (const key of ["left", "right"]) {
    const arm = this.ik[key];
    const gun = hero.weaponGuns?.[key];
    const belt = hero.weaponMagazineBelts?.[key];
    if (!arm?.hand || !gun || !belt) continue;
    const frame = this.model
      .getWorldQuaternion(new THREE.Quaternion())
      .slerp(belt.getWorldQuaternion(new THREE.Quaternion()), pose.dock);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(frame);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(frame);
    const forward = new THREE.Vector3(
      arm.side * 1.05 * pose.spread,
      0.58 * pose.spread,
      1,
    )
      .normalize()
      .applyQuaternion(frame);
    const normal = right
      .clone()
      .addScaledVector(forward, -right.dot(forward))
      .normalize()
      .multiplyScalar(-arm.side);
    const at = this.model.localToWorld(
      new THREE.Vector3(
        arm.side * THREE.MathUtils.lerp(0.22, 0.62, pose.spread),
        THREE.MathUtils.lerp(1.12, 1.28, pose.spread),
        THREE.MathUtils.lerp(0.32, 0.2, pose.spread),
      ),
    );
    const goal = {
      at,
      pole: up
        .clone()
        .negate()
        .addScaledVector(right, arm.side * 0.85),
      normal,
      fingers: forward,
    };
    solveArm(arm, goal, pose.blend);
    const seat = belt
      .getWorldPosition(new THREE.Vector3())
      .addScaledVector(up, 0.115 * (1 - pose.insertion));
    for (let pass = 0; pass < 3 && pose.dock > 0.001; pass++) {
      gun.updateWorldMatrix(true, true);
      const slot = gun.localToWorld(
        new THREE.Vector3(...gun.userData.magazineSeat),
      );
      const palm = arm.hand.localToWorld(arm.palm.clone());
      goal.at.copy(palm).addScaledVector(seat.clone().sub(slot), pose.dock);
      solveArm(arm, goal, pose.blend);
    }
  }
}
