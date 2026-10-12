import * as THREE from "three";
import { solveArm } from "./ik.js";
import { smooth, set, wrap } from "./math.js";
import createIceAxe from "../assets/ice_axe.js";

// Climbing a marked wall: the body faces the surface, the palms and soles follow the four holds
// the explorer plants in turn (hero.cling.limbs), and Mira's ice axes ride crossed on the pack
// until she climbs ice with them in her fists.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
// The palm off the surface: a fist round an axe's shaft hangs under the pick's reach, a hand on
// ivy closes on the stems.
const PALM = { ice: 0.238, vine: 0.055 };
// The sole's centre off the surface, with the toes against it.
const SOLE = 0.12;
// Stowed on the pack, in the model's frame: crossed against its outer panel (z -0.149 as posed,
// the hydration pack of hero-warrior.js), the second shaft over the first, heads up, picks outward.
const STOW = [
  { side: 1, at: [0.012, 1.3, -0.17], tilt: 0.42 },
  { side: -1, at: [-0.012, 1.3, -0.2], tilt: 0.42 },
];
// The cord that holds them: knotted where the shafts cross, out to the pack's four corners.
const LASHING = {
  knot: [0, 1.3, -0.207],
  corners: [
    [-0.085, 1.41],
    [0.085, 1.41],
    [-0.085, 1.19],
    [0.085, 1.19],
  ],
  face: -0.15,
};

function lashing() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x8e3326,
    roughness: 0.75,
  });
  const group = new THREE.Group();
  group.name = "Ice axe lashing";
  const knot = V(...LASHING.knot);
  for (const [x, y] of LASHING.corners) {
    const corner = V(x, y, LASHING.face);
    // Pulled taut over the shafts, it bows a little away from the pack.
    const bend = knot
      .clone()
      .lerp(corner, 0.5)
      .setZ(LASHING.face - 0.035);
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.QuadraticBezierCurve3(knot, bend, corner),
          10,
          0.0032,
          6,
        ),
        material,
      ),
    );
  }
  const tie = new THREE.Mesh(
    new THREE.TorusGeometry(0.014, 0.0055, 6, 14),
    material,
  );
  tie.position.copy(knot);
  group.add(tie);
  group.traverse((node) => {
    if (node.isMesh) node.castShadow = node.receiveShadow = true;
  });
  return group;
}

function holdPoint(s, hold, d, out) {
  return out.set(
    s.o.x + s.t.x * hold.u + s.n.x * d,
    hold.y,
    s.o.z + s.t.z * hold.u + s.n.z * d,
  );
}

export function wallPose(pose, root, hero) {
  const W = hero.cling;
  const left = W?.limbs.leftHand.y ?? 0,
    right = W?.limbs.rightHand.y ?? 0;
  const lean = THREE.MathUtils.clamp((left - right) * 0.6, -0.18, 0.18);
  const reach = W?.leap
    ? Math.sin(Math.PI * Math.min(1, W.leap.t / W.leap.time))
    : 0;
  set(pose, "leftUpperArm", -2.45, 0, -0.12);
  set(pose, "rightUpperArm", -2.45, 0, 0.12);
  set(pose, "leftLowerArm", -0.35);
  set(pose, "rightLowerArm", -0.35);
  set(pose, "spine", -0.04 - 0.1 * reach, lean * 0.5, -lean * 0.3);
  set(pose, "head", -0.32 - 0.1 * reach, lean, 0);
  set(pose, "hips", 0, -lean * 0.4, lean * 0.35);
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    set(pose, side + "UpperLeg", -0.7, 0, sign * 0.3);
    set(pose, side + "LowerLeg", 1.1);
    set(pose, side + "Foot", 0.2);
  }
  root.pitch = 0.1 - 0.06 * reach;
  root.roll = lean * 0.15;
  root.bob = 0;
}

export const wall = {
  // Mira's axes join the explorer's model before any world prepares its shaders, so they are
  // drawn into every warm-up whether or not she has them yet.
  prepareWall() {
    const spine = this.joints.spine;
    this.wallWeight = 0;
    this.wallLegWeight = 0;
    if (!spine || !this.ik.left || !this.ik.right) return;
    this.model.updateMatrixWorld(true);
    const toSpine = spine.matrixWorld
      .clone()
      .invert()
      .multiply(this.model.matrixWorld);
    this.axes = STOW.map(({ side, at, tilt }, i) => {
      const axe = createIceAxe(THREE);
      axe.name = `${i ? "Right" : "Left"} ice axe`;
      axe.traverse((node) => {
        if (node.isMesh) node.castShadow = node.receiveShadow = true;
      });
      const up = V(side * Math.sin(tilt), Math.cos(tilt), 0);
      const pick = V(side * Math.cos(tilt), -Math.sin(tilt), 0);
      const turn = new THREE.Matrix4().makeBasis(
        V().crossVectors(up, pick),
        up,
        pick,
      );
      // The middle of the shaft rests on the pack.
      const middle = V(...axe.userData.grip)
        .setY(0.26)
        .applyMatrix4(turn);
      const stowed = turn.clone().setPosition(V(...at).sub(middle));
      const local = toSpine.clone().multiply(stowed);
      const record = {
        axe,
        side,
        key: side > 0 ? "left" : "right",
        position: V(),
        quaternion: new THREE.Quaternion(),
        scale: V(),
        held: null,
      };
      local.decompose(record.position, record.quaternion, record.scale);
      axe.visible = false;
      this.stowAxe(record);
      return record;
    });
    this.lashing = lashing();
    toSpine.decompose(
      this.lashing.position,
      this.lashing.quaternion,
      this.lashing.scale,
    );
    this.lashing.visible = false;
    spine.add(this.lashing);
  },

  stowAxe(record) {
    const { axe } = record;
    this.joints.spine.add(axe);
    axe.position.copy(record.position);
    axe.quaternion.copy(record.quaternion);
    axe.scale.copy(record.scale);
    record.held = false;
  },

  // In the fist: the pick points where the knuckles do, the shaft runs through the grip.
  holdAxe(record) {
    const arm = this.ik[record.key];
    const hand = arm.hand || arm.lower;
    const { axe } = record;
    hand.add(axe);
    const forward = arm.fingers.clone().normalize();
    // The head rises on the thumb's side of the fist.
    const up = arm.normal
      .clone()
      .cross(forward)
      .multiplyScalar(record.side)
      .normalize();
    const across = V().crossVectors(up, forward).normalize();
    axe.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, forward),
    );
    const scale = 1 / (hand.getWorldScale(V()).x || 1);
    axe.scale.setScalar(scale);
    axe.position.copy(arm.palm).sub(
      V(...axe.userData.grip)
        .applyQuaternion(axe.quaternion)
        .multiplyScalar(scale),
    );
    record.held = true;
  },

  mountAxes(hero) {
    if (!this.axes) return;
    const owned = !!hero.axes;
    const held = owned && hero.state === "wall" && hero.cling?.s.kind === "ice";
    for (const record of this.axes) {
      record.axe.visible = owned;
      if (held && !record.held) this.holdAxe(record);
      else if (!held && record.held !== false) this.stowAxe(record);
    }
    if (this.lashing) this.lashing.visible = owned && !held;
  },

  // The hands' goals on the wall, for `reach`.
  wallGoals(hero) {
    const W = hero.cling;
    if (!W) return null;
    const { s } = W;
    const ice = s.kind === "ice";
    const n = V(s.n.x, 0, s.n.z),
      t = V(s.t.x, 0, s.t.z);
    const goals = { weight: 1 };
    for (const [key, name, sign] of [
      ["left", "leftHand", 1],
      ["right", "rightHand", -1],
    ]) {
      const hold = W.limbs[name];
      const at = holdPoint(s, hold, PALM[s.kind], V());
      // A hand on its way to the next hold swings out from the surface.
      if (hold.s >= 0) at.addScaledVector(n, Math.sin(Math.PI * hold.s) * 0.12);
      goals[key] = {
        at,
        pole: t
          .clone()
          .multiplyScalar(sign * 0.8)
          .addScaledVector(n, 0.35)
          .add(V(0, -0.45, 0)),
        normal: ice ? t.clone().multiplyScalar(-sign) : n.clone().negate(),
        fingers: ice
          ? n.clone().negate()
          : UP.clone().addScaledVector(n, -0.25).normalize(),
      };
    }
    return goals;
  },

  // Soles on the foot holds, toes against the surface, knees out to the sides.
  wallLegs(dt, hero) {
    const W = hero.state === "wall" ? hero.cling : null;
    this.wallLegWeight = W ? Math.min(1, this.wallLegWeight + dt * 6) : 0;
    if (!W || !this.articulatedFeet) return;
    const weight = smooth(0, 1, this.wallLegWeight);
    const { s } = W;
    const n = V(s.n.x, 0, s.n.z),
      t = V(s.t.x, 0, s.t.z);
    this.model.updateMatrixWorld(true);
    for (const leg of this.legs) {
      const sign = leg.side === "left" ? 1 : -1;
      const hold = W.limbs[leg.side + "Foot"];
      const at = holdPoint(s, hold, SOLE, V());
      if (hold.s >= 0) {
        at.addScaledVector(n, Math.sin(Math.PI * hold.s) * 0.1);
        at.y += Math.sin(Math.PI * hold.s) * 0.06;
      }
      const toes = n.clone().negate();
      const sole = UP.clone().addScaledVector(n, -0.22).normalize();
      solveArm(
        leg,
        {
          at,
          pole: t
            .clone()
            .multiplyScalar(sign * 0.9)
            .addScaledVector(n, -0.25)
            .add(V(0, 0.15, 0)),
          normal: sole,
          fingers: toes,
        },
        weight,
      );
      for (const name of [
        leg.side + "UpperLeg",
        leg.side + "LowerLeg",
        leg.side + "Foot",
      ]) {
        const joint = this.joints[name],
          rest = this.rest[name]?.rot;
        if (!joint || !rest) continue;
        ["x", "y", "z"].forEach((axis, j) => {
          const spring = this.springs[name][j];
          const value =
            spring.v + wrap(joint.rotation[axis] - rest[axis] - spring.v);
          spring.dv = THREE.MathUtils.clamp((value - spring.v) / dt, -18, 18);
          spring.v = value;
        });
      }
    }
  },
};

export const WALL_CONTACT = { palm: PALM, sole: SOLE };
