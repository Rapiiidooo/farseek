import * as THREE from "three";
import { solveArm, handTurn, LIP } from "./ik.js";
import { smooth, mix, wrap } from "./math.js";

export const hands = {
  arm(side, s) {
    const J = this.joints;
    const upper = J[side + "UpperArm"],
      lower = J[side + "LowerArm"],
      hand = J[side + "Hand"] || null;
    if (!upper || !lower) return null;
    this.model.updateMatrixWorld(true);
    let palmSpace = upper;
    while (palmSpace !== this.model && !palmSpace.userData.palms?.[side])
      palmSpace = palmSpace.parent || this.model;
    const rest = palmSpace.userData.palms?.[side];
    const palmModel = rest
      ? new THREE.Vector3(...rest)
      : new THREE.Vector3(0.24 * s, 0.86, 0.06);
    const palmWorld = palmSpace.localToWorld(palmModel.clone());
    const holder = hand || lower;
    const normals =
      this.model.userData.palmNormals || palmSpace.userData.palmNormals;
    const fingers =
      this.model.userData.palmFingers || palmSpace.userData.palmFingers;
    return {
      side: s,
      upper,
      lower,
      hand,
      palm: holder.worldToLocal(palmWorld.clone()),
      // The palm faces the thigh at rest: inwards, towards the body's centre line.
      normal: normals?.[side]
        ? new THREE.Vector3(...normals[side]).normalize()
        : new THREE.Vector3(-s, 0, 0),
      // From the wrist through the palm towards the fingers, in the hand's frame.
      fingers: fingers?.[side]
        ? new THREE.Vector3(...fingers[side]).normalize()
        : holder.worldToLocal(palmWorld.clone()).normalize(),
      length:
        upper
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(lower.getWorldPosition(new THREE.Vector3())) +
        lower.getWorldPosition(new THREE.Vector3()).distanceTo(palmWorld),
      weight: 0,
    };
  },

  hangReach(ahead) {
    const L = this.ik.left;
    if (!L) return null;
    const m = this.model;
    const saved = [m.position.clone(), m.rotation.clone()];
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.updateMatrixWorld(true);
    const spine = this.joints.spine;
    const savedSpine = spine?.rotation.clone();
    if (spine) spine.rotation.x = this.rest.spine.rot.x - 0.08;
    m.updateMatrixWorld(true);
    const S = L.upper.getWorldPosition(new THREE.Vector3());
    const E = L.lower.getWorldPosition(new THREE.Vector3());
    const P = (L.hand || L.lower).localToWorld(L.palm.clone());
    const wrist = L.hand?.getWorldPosition(new THREE.Vector3());
    const turn = L.hand
      ? handTurn(L, {
          normal: new THREE.Vector3(0, -1, 0),
          fingers: new THREE.Vector3(0, 0, 1),
        })
      : null;
    const offset = turn
      ? L.palm
          .clone()
          .multiply(L.hand.getWorldScale(new THREE.Vector3()))
          .applyQuaternion(turn)
      : new THREE.Vector3();
    const len = S.distanceTo(E) + E.distanceTo(wrist || P) - 0.015;
    const dx = 0.2 - offset.x - S.x;
    const dz = ahead - offset.z - S.z;
    const height =
      S.y + Math.sqrt(Math.max(0, len * len - dx * dx - dz * dz)) + offset.y;
    if (spine) spine.rotation.copy(savedSpine);
    m.position.copy(saved[0]);
    m.rotation.copy(saved[1]);
    m.updateMatrixWorld(true);
    return height;
  },

  measureReach() {
    const L = this.ik.left;
    if (!L) return null;
    const m = this.model;
    const saved = [m.position.clone(), m.rotation.clone()];
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    L.upper.rotation.x = -2.9;
    m.updateMatrixWorld(true);
    const p = (L.hand || L.lower).localToWorld(L.palm.clone());
    L.upper.rotation.x = 0;
    m.position.copy(saved[0]);
    m.rotation.copy(saved[1]);
    m.updateMatrixWorld(true);
    return p.y;
  },

  swimArms(dt, hero) {
    const moving = smooth(
      0.1,
      2.7,
      Math.hypot(hero.swimSpeed || 0, hero.swimVertical || 0),
    );
    const active = hero.swimming || hero.state === "swim";
    const weight = this.swimArmWeight.step(active ? moving : 0, dt, 5, 1);
    if (!active || weight < 0.001 || !this.ik.left || !this.ik.right) return;
    const cycle = (this.swimPhase / (Math.PI * 2)) % 1;
    const open = smooth(0.02, 0.18, cycle),
      pull = smooth(0.18, 0.35, cycle),
      recover = smooth(0.35, 0.55, cycle);
    this.model.updateMatrixWorld(true);
    for (const side of ["left", "right"]) {
      const arm = this.ik[side],
        sign = arm.side;
      const parent = arm.upper.parent,
        rest = this.rest[side + "UpperArm"].pos;
      const scale = parent.getWorldScale(new THREE.Vector3()).y;
      const span = arm.length / scale;
      const extended = Math.sqrt(
        Math.max(
          0.1,
          (span * 0.975) ** 2 - (Math.abs(rest.x) - 0.065) ** 2 - 0.06 ** 2,
        ),
      );
      const x = mix(mix(mix(0.065, 0.42, open), 0.19, pull), 0.065, recover);
      const y = mix(
        mix(mix(extended, extended * 0.72, open), 0.005, pull),
        extended,
        recover,
      );
      const z = mix(mix(0.07, 0.29, pull), 0.07, recover);
      const target = parent.localToWorld(
        new THREE.Vector3(sign * x, rest.y + y, rest.z + z),
      );
      const rotation = parent.getWorldQuaternion(new THREE.Quaternion());
      const effort = pull * (1 - recover);
      const pole = new THREE.Vector3(
        sign * 0.6,
        mix(0.08, -0.48, effort),
        0.24,
      ).applyQuaternion(rotation);
      const normal = new THREE.Vector3(
        sign * 0.16 * open * (1 - recover),
        -0.6 * effort,
        1,
      )
        .normalize()
        .applyQuaternion(rotation);
      const fingers = new THREE.Vector3(
        sign * 0.1 * open * (1 - recover),
        1,
        0.08,
      )
        .normalize()
        .applyQuaternion(rotation);
      solveArm(arm, { at: target, pole, normal, fingers }, Math.min(1, weight));
      if (arm.hand) {
        const aligned = arm.hand
          .getWorldPosition(new THREE.Vector3())
          .sub(arm.lower.getWorldPosition(new THREE.Vector3()))
          .normalize()
          .lerp(fingers, 0.12)
          .normalize();
        const palmNormal = normal
          .clone()
          .addScaledVector(aligned, -normal.dot(aligned))
          .normalize();
        solveArm(
          arm,
          { at: target, pole, normal: palmNormal, fingers: aligned },
          Math.min(1, weight),
        );
      }
      for (const name of [
        side + "UpperArm",
        side + "LowerArm",
        side + "Hand",
      ]) {
        const joint = this.joints[name];
        if (!joint) continue;
        const rest = this.rest[name].rot;
        ["x", "y", "z"].forEach((axis, i) => {
          const spring = this.springs[name][i];
          const value =
            spring.v + wrap(joint.rotation[axis] - rest[axis] - spring.v);
          spring.dv = THREE.MathUtils.clamp((value - spring.v) / dt, -12, 12);
          spring.v = value;
        });
      }
    }
  },

  weaponArms(dt, hero, snap = false) {
    const active =
      hero.equipment === "pistols" &&
      hero.weaponActive &&
      !hero.swimming &&
      ["ground", "air"].includes(hero.state);
    const weight = this.weaponWeight.step(
      active ? THREE.MathUtils.clamp(hero.weaponAim || 0, 0, 1) : 0,
      dt,
      7,
      1,
    );
    if (!active || weight < 0.001 || !hero.aimDirection) {
      this.weaponYaw.v = this.weaponYaw.dv = 0;
      this.weaponPitch.v = this.weaponPitch.dv = 0;
      return;
    }
    const aim = new THREE.Vector3().copy(hero.aimDirection);
    if (!aim.toArray().every(Number.isFinite) || aim.lengthSq() < 0.001) return;
    aim.normalize();
    this.model.updateMatrixWorld(true);
    const bodyForward = new THREE.Vector3(0, 0, 1).transformDirection(
      this.model.matrixWorld,
    );
    const heading = Math.atan2(bodyForward.x, bodyForward.z);
    const targetYaw = THREE.MathUtils.clamp(
      wrap(Math.atan2(aim.x, aim.z) - heading),
      -0.96,
      0.96,
    );
    const targetPitch = THREE.MathUtils.clamp(Math.asin(aim.y), -1.1, 0.78);
    if (snap) {
      this.weaponYaw.v = targetYaw;
      this.weaponPitch.v = targetPitch;
      this.weaponYaw.dv = this.weaponPitch.dv = 0;
    }
    const yaw = this.weaponYaw.step(targetYaw, dt, 5, 1);
    const pitch = this.weaponPitch.step(targetPitch, dt, 5, 1);
    aim.set(
      Math.sin(heading + yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(heading + yaw) * Math.cos(pitch),
    );
    this.weaponAimDirection.copy(aim);
    const right = new THREE.Vector3(0, 1, 0).cross(aim);
    if (right.lengthSq() < 0.001)
      right.set(Math.cos(hero.yaw), 0, -Math.sin(hero.yaw));
    right.normalize();
    const up = new THREE.Vector3().crossVectors(aim, right).normalize();
    this.model.updateMatrixWorld(true);
    for (const side of ["left", "right"]) {
      const arm = this.ik[side];
      if (!arm?.hand) continue;
      const recoil = THREE.MathUtils.clamp(
        hero[side === "left" ? "fireRecoilLeft" : "fireRecoilRight"] || 0,
        0,
        1,
      );
      const forward = aim.clone().applyAxisAngle(right, -0.16 * recoil);

      const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
      const at = shoulder
        .clone()
        .addScaledVector(aim, arm.length * 0.97 - 0.045 * recoil)
        .addScaledVector(right, arm.side * 0.025)
        .addScaledVector(up, -0.055 + recoil * 0.02);
      const pole = up
        .clone()
        .negate()
        .addScaledVector(right, arm.side * 0.35);
      solveArm(
        arm,
        {
          at,
          pole,
          normal: right.clone().multiplyScalar(-arm.side),
          fingers: forward,
        },
        Math.min(1, weight),
      );
      const gun = hero.weaponGuns?.[side];
      if (hero.weaponTarget && gun && weight > 0.85 && recoil < 0.2) {
        for (let pass = 0; pass < 2; pass++) {
          gun.updateWorldMatrix(true, false);
          const muzzle = gun.localToWorld(
            new THREE.Vector3(...gun.userData.muzzle),
          );
          const toward = hero.weaponTarget.clone().sub(muzzle).normalize();
          const converged = aim
            .clone()
            .add(toward.sub(hero.aimDirection))
            .normalize();
          const normal = new THREE.Vector3(0, 1, 0)
            .cross(converged)
            .normalize()
            .multiplyScalar(-arm.side);
          solveArm(
            arm,
            { at, pole, normal, fingers: converged },
            Math.min(1, weight),
          );
        }
      }
    }
  },

  reach(dt, hero, reduced) {
    const L = this.ik.left,
      R = this.ik.right;
    if (!L || !R) return;
    const goal = this.reachGoals(hero);
    const k = Math.min(1, dt * (reduced ? 30 : 9));
    this.model.updateMatrixWorld(true);
    for (const arm of [L, R]) {
      const g = goal?.[arm.side > 0 ? "left" : "right"];
      arm.weight += ((g ? (g.weight ?? goal.weight) : 0) - arm.weight) * k;
      if (g) arm.goal = g;
      if (arm.weight < 0.01 || !arm.goal) continue;
      solveArm(arm, arm.goal, arm.weight);
    }
  },

  reachGoals(hero) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const f = { x: Math.sin(hero.yaw), z: Math.cos(hero.yaw) };
    // The explorer's left is +X when facing +Z.
    const left = { x: f.z, z: -f.x };
    const pair = (cx, cy, cz, spread, pole, normal) => ({
      left: {
        at: V(cx + left.x * spread, cy, cz + left.z * spread),
        pole: V(
          left.x * pole.side + pole.x,
          pole.y,
          left.z * pole.side + pole.z,
        ),
        normal,
      },
      right: {
        at: V(cx - left.x * spread, cy, cz - left.z * spread),
        pole: V(
          -left.x * pole.side + pole.x,
          pole.y,
          -left.z * pole.side + pole.z,
        ),
        normal,
      },
    });
    const st = hero.state;
    if (st === "swing" && hero.pendulum) return this.swingGoals;
    if (st === "wall") return this.wallGoals(hero);
    if ((st === "hang" || st === "climb") && hero.ledge) {
      const { n, top, hand } = hero.ledge;
      // Planted where the climb began, so the hands stay put while the body rises.
      if (st === "hang" || !this.climbHold)
        this.climbHold = { x: hand.x, z: hand.z };
      const h = st === "climb" ? this.climbHold : hand;
      // Each palm flat on the top just behind the lip, its fingers reaching over the stone.
      const g = pair(
        h.x - n.x * 0.03,
        top + LIP,
        h.z - n.z * 0.03,
        0.2,
        { side: 0.7, x: n.x * 0.6, y: -0.3, z: n.z * 0.6 },
        V(0, -1, 0),
      );
      g.left.fingers = g.right.fingers = V(-n.x, 0, -n.z);
      // Shimmying, the leading hand reaches ahead and the other follows.
      if (st === "hang" && hero.shimmy) {
        const lead = hero.shimmy > 0 ? g.left : g.right;
        const along = { x: -n.z * hero.shimmy, z: n.x * hero.shimmy };
        const swing = Math.max(0, Math.sin(this.time * 8.5));
        lead.at.x += along.x * 0.08 * swing;
        lead.at.z += along.z * 0.08 * swing;
        lead.at.y += 0.05 * swing;
      }
      g.weight = 1;
      if (st === "climb") {
        const t = Math.min(1, hero.t);
        g.left.weight = 1 - smooth(0.56, 0.72, t);
        g.right.weight = 1 - smooth(0.62, 0.8, t);
      }
      return g;
    }
    this.climbHold = null;
    if ((st === "grab" || st === "shove") && hero.grip?.n) {
      const n = hero.grip.n;
      // The face the explorer braces against (hero.js BRACE), at chest height.
      const fx = hero.pos.x - n.x * 0.52,
        fz = hero.pos.z - n.z * 0.52;
      const g = pair(
        fx + n.x * 0.02,
        hero.feet + 1.12,
        fz + n.z * 0.02,
        0.24,
        { side: 0.6, x: 0, y: -0.8, z: 0 },
        V(-n.x, 0, -n.z),
      );
      g.weight = 1;
      return g;
    }
    if (st === "turn" && hero.grip?.ref) {
      const m = hero.grip.ref;
      const dx = hero.pos.x - m.x,
        dz = hero.pos.z - m.z;
      const d = Math.hypot(dx, dz) || 1;
      const g = pair(
        m.x + (dx / d) * 0.5,
        0.6,
        m.z + (dz / d) * 0.5,
        0.3,
        { side: 0.7, x: dx / d, y: -0.5, z: dz / d },
        V(0, -1, 0),
      );
      g.weight = 1;
      return g;
    }
    return null;
  },
};
