import * as THREE from "three";
import { isleAt } from "./world.js";
import { SwingRope } from "./swing-rope.js";

// The expedition's intact swing ropes, each on a timber gantry leaning out from an isle's rim
// over a gap no jump spans: [isle, toward]. The gantry's feet stand this far inside the rim.
export const SWINGS = [
  { id: "first", on: "step2", toward: "well" },
  { id: "relay", on: "midway", toward: "camp" },
];
const INSET = 0.35,
  // The rope's free end hangs this far above the rim it leaves from.
  CLEAR = 1.05;

export class IsleSwings {
  constructor(isles) {
    this.isles = isles;
    this.ropes = [];
    this.gantries = [];
  }

  async build(material) {
    for (const def of SWINGS) await this.add(def, material);
  }

  async add(def, material) {
    const { isles } = this;
    const from = isles.isle(def.on),
      to = isles.isle(def.toward);
    const c = from.collider;
    const a = Math.atan2(to.collider.z - c.z, to.collider.x - c.x);
    const u = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const rim = isleAt(c, c.x + u.x * 60, c.z + u.z * 60).rim;
    const spot = new THREE.Vector3(c.x, 0, c.z).addScaledVector(u, rim - INSET);
    spot.y = isleAt(c, spot.x, spot.z).top;
    const model =
      (await isles.assets.make("swing_gantry", { keepHierarchy: true })) ||
      fallbackGantry();
    const yaw = Math.atan2(u.x, u.z);
    const turn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const local = (p) => new THREE.Vector3(...p).applyQuaternion(turn);
    const anchor = model.userData.anchor || [0, 0, 0];
    model.quaternion.copy(turn);
    model.position.copy(spot).sub(local(anchor));
    model.traverse((m) => {
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    isles.scene.add(model);
    for (const foot of model.userData.feet || []) {
      const p = local(foot).add(model.position);
      isles.world.addRound(
        p.x,
        p.z,
        0.2,
        spot.y - 1,
        spot.y + 1.6,
        "prop",
        null,
        {
          cam: false,
        },
      );
    }
    const pivot = local(model.userData.pivot || [0, 6.45, 3]).add(
      model.position,
    );
    const length = pivot.y - (spot.y + CLEAR);
    const rope = new SwingRope({
      pivot,
      heading: new THREE.Vector2(u.x, u.z),
      length,
      grip: [Math.max(2.4, length - 2.5), length - 0.32],
      material,
    }).build(isles.scene);
    rope.id = def.id;
    rope.on = def.on;
    rope.toward = def.toward;
    this.ropes.push(rope);
    this.gantries.push(model);
  }

  rope(id) {
    return this.ropes.find((r) => r.id === id);
  }

  update(dt) {
    for (const rope of this.ropes) rope.update(dt);
  }

  reset() {
    for (const rope of this.ropes) {
      rope.reset();
      rope.draw();
    }
  }

  // Where the objective marker sits on a rope: the middle of its grip, where hands close on it.
  mark(id) {
    const rope = this.rope(id);
    return rope.at((rope.grip[0] + rope.grip[1]) / 2);
  }

  telemetry() {
    return this.ropes.map((rope) => ({
      id: rope.id,
      on: rope.on,
      toward: rope.toward,
      ...rope.telemetry(),
    }));
  }
}

// A timber A-frame until the generated gantry loads.
function fallbackGantry() {
  const g = new THREE.Group();
  const timber = new THREE.MeshStandardMaterial({
    color: 0x8a6a48,
    roughness: 0.9,
  });
  timber.name = "timber";
  for (const s of [-1, 1]) {
    const foot = new THREE.Vector3(s * 1.25, 0, 0),
      top = new THREE.Vector3(0, 6.75, 3);
    const d = top.clone().sub(foot);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.085, d.length(), 8),
      timber,
    );
    pole.position.copy(foot).add(top).multiplyScalar(0.5);
    pole.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      d.normalize(),
    );
    g.add(pole);
  }
  g.userData.anchor = [0, 0, 0];
  g.userData.pivot = [0, 6.45, 3];
  g.userData.feet = [
    [-1.25, 0, 0],
    [1.25, 0, 0],
  ];
  return g;
}
