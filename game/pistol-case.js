import * as THREE from "three";
import createPistol from "./assets/twin_pistol.js";
import { finishAsset } from "./asset-finish.js";
import { detailBatch } from "./prop-detail.js";

const STAND = { width: 0.62, depth: 0.44, height: 0.5 };
const TRAY = { width: 0.36, depth: 0.34, height: 0.1, wall: 0.016 };

// Mira's field case on a crate at her camp: canvas over a hard frame, its lid thrown back and
// both pistols lying in a cut felt lining. Taking them leaves their dark pockets behind.
export class PistolCase {
  constructor(scene, world) {
    Object.assign(this, { scene, world });
    this.taken = false;
    this.pistols = [];
  }

  build({ x, y, z, yaw }) {
    const root = new THREE.Group();
    root.name = "Mira's pistol case";
    const material = (color, name, roughness, metalness = 0) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      m.name = name;
      return m;
    };
    const timber = material(0x8a6a48, "timber", 0.9);
    const batten = material(0x5f4834, "timber", 0.92);
    const canvas = material(0x5d6650, "fabric", 0.86);
    const lining = material(0xb9a27a, "fabric lining", 0.96);
    const pocket = material(0x3a3127, "fabric pocket", 1);
    const steel = material(0x8c8f88, "metal", 0.42, 0.75);
    const signal = material(0xa34c39, "fabric", 0.7);
    const detail = detailBatch(THREE, root);
    const { width, depth, height } = STAND;
    detail.box(timber, [width, height, depth], [0, height / 2, 0]);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        detail.box(
          batten,
          [0.05, height + 0.004, 0.05],
          [sx * (width / 2 - 0.02), height / 2, sz * (depth / 2 - 0.02)],
        );
    for (const sz of [-1, 1])
      detail.box(
        batten,
        [width + 0.004, 0.045, 0.03],
        [0, height - 0.04, sz * (depth / 2 + 0.002)],
      );
    for (const level of [0.17, 0.33])
      detail.box(
        batten,
        [width - 0.1, 0.006, 0.006],
        [0, level, depth / 2 + 0.002],
      );
    const floor = height + 0.006;
    const { width: tw, depth: td, height: th, wall } = TRAY;
    detail.box(canvas, [tw, 0.012, td], [0, floor + 0.006, 0]);
    for (const sz of [-1, 1])
      detail.box(
        canvas,
        [tw, th, wall],
        [0, floor + th / 2, sz * (td / 2 - wall / 2)],
      );
    for (const sx of [-1, 1])
      detail.box(
        canvas,
        [wall, th, td - wall * 2],
        [sx * (tw / 2 - wall / 2), floor + th / 2, 0],
      );
    const bed = floor + th - 0.03;
    detail.box(
      lining,
      [tw - wall * 2, bed - floor - 0.012, td - wall * 2],
      [0, (bed + floor + 0.012) / 2, 0],
    );
    for (const sx of [-1, 1]) {
      detail.box(
        steel,
        [0.03, 0.022, 0.008],
        [sx * 0.1, floor + th - 0.02, td / 2 + 0.003],
      );
      detail.box(
        signal,
        [0.05, 0.012, 0.004],
        [sx * 0.1, floor + th - 0.045, td / 2 + 0.002],
      );
      for (const sz of [-1, 1])
        detail.box(
          steel,
          [0.026, th + 0.006, 0.026],
          [sx * (tw / 2 - 0.006), floor + th / 2, sz * (td / 2 - 0.006)],
        );
    }
    // The pockets the pistols were cut into, under where they lie.
    for (const side of [-1, 1])
      for (const [cx, cz, sx, sz] of [
        [-0.0015, 0.035, 0.214, 0.06],
        [-0.078, 0.105, 0.06, 0.097],
      ])
        detail.box(
          pocket,
          [sx, 0.002, sz],
          [side * cx, bed + 0.001, side * cz],
        );
    detail.finish();
    const lid = new THREE.Group();
    lid.name = "Pistol case lid";
    lid.position.set(0, floor + th, -td / 2);
    lid.rotation.x = -1.92;
    const lidDetail = detailBatch(THREE, lid);
    lidDetail.box(canvas, [tw, 0.034, td], [0, -0.017, td / 2]);
    lidDetail.box(
      lining,
      [tw - wall * 2, 0.012, td - wall * 2],
      [0, 0.006, td / 2],
    );
    lidDetail.box(signal, [tw * 0.6, 0.004, 0.035], [0, -0.035, td * 0.72]);
    lidDetail.finish();
    root.add(lid);
    finishAsset(THREE, root, "pistol_case");
    for (const [index, side] of [-1, 1].entries()) {
      const pistol = finishAsset(THREE, createPistol(THREE), "twin_pistol");
      pistol.name = `Mira's ${index ? "right" : "left"} pistol`;
      const along = new THREE.Vector3(side, 0, 0);
      const top = new THREE.Vector3(0, 0, -side);
      pistol.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(top.clone().cross(along), top, along),
      );
      pistol.position.set(-side * 0.02, bed + 0.006, side * 0.158);
      root.add(pistol);
      this.pistols.push(pistol);
    }
    root.traverse((node) => {
      if (node.isMesh) node.castShadow = node.receiveShadow = true;
    });
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    this.scene.add(root);
    root.updateMatrixWorld(true);
    this.root = root;
    this.center = new THREE.Vector3(0, bed + 0.05, 0).applyMatrix4(
      root.matrixWorld,
    );
    this.collider = this.world.addRound(
      x,
      z,
      Math.hypot(width, depth) / 2,
      y - 1,
      y + floor + th,
      "prop",
      null,
      { cam: false },
    );
    const reach = Math.max(width, depth) / 2 + 0.15;
    this.box = {
      shape: "box",
      minX: x - reach,
      maxX: x + reach,
      minZ: z - reach,
      maxZ: z + reach,
      minY: y,
      maxY: y + 1.4,
    };
    this.setTaken(this.taken);
  }

  setTaken(taken) {
    this.taken = taken;
    for (const pistol of this.pistols) pistol.visible = !taken;
  }

  interactable(use) {
    if (this.taken || !this.box) return null;
    return { kind: "use", box: this.box, ref: { use }, prompt: "take-pistols" };
  }
}
