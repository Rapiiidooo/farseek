import * as THREE from "three";
import { prepareVisuals } from "./shader-preparation.js";

// What a climbing hold throws off: ice chips under an axe's pick, torn leaves from ivy. One
// pooled instanced mesh, so a burst never adds a draw or a program during play.
const COUNT = 48;
const LIFE = 0.75;
const GRAVITY = 9;

export class ClimbChips {
  constructor(scene, kind) {
    this.kind = kind;
    const leaf = kind === "vine";
    const geometry = leaf
      ? new THREE.PlaneGeometry(0.07, 0.045)
      : new THREE.TetrahedronGeometry(0.028, 0);
    const material = new THREE.MeshStandardMaterial({
      color: leaf ? 0x4f7a3a : 0xdcefff,
      roughness: leaf ? 0.85 : 0.2,
      metalness: leaf ? 0 : 0.1,
      side: leaf ? THREE.DoubleSide : THREE.FrontSide,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, COUNT);
    this.mesh.name = `climb-${kind}-chips`;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.parts = Array.from({ length: COUNT }, () => ({
      age: LIFE,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      spin: new THREE.Vector3(),
    }));
    this.next = 0;
    this.matrix = new THREE.Matrix4();
    this.rotation = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.size = new THREE.Vector3();
    this.hide();
  }

  burst(strike, count = 7) {
    const leaf = this.kind === "vine";
    for (let i = 0; i < count; i++) {
      const part = this.parts[this.next];
      this.next = (this.next + 1) % COUNT;
      const a = Math.random() * Math.PI * 2;
      const across = Math.cos(a) * (leaf ? 0.6 : 1.1);
      part.age = Math.random() * 0.12;
      part.p.set(strike.x, strike.y, strike.z);
      part.p.x += strike.nx * 0.04;
      part.p.z += strike.nz * 0.04;
      part.v.set(
        strike.nx * (0.8 + Math.random() * 1.1) - strike.nz * across,
        (leaf ? 0.3 : 1.2) + Math.sin(a) * (leaf ? 0.4 : 0.9),
        strike.nz * (0.8 + Math.random() * 1.1) + strike.nx * across,
      );
      part.spin.set(
        Math.random() * 12 - 6,
        Math.random() * 12 - 6,
        Math.random() * 12 - 6,
      );
    }
    this.mesh.visible = true;
  }

  update(dt) {
    if (!this.mesh.visible || dt <= 0) return;
    const leaf = this.kind === "vine";
    let alive = false;
    for (let i = 0; i < COUNT; i++) {
      const part = this.parts[i];
      if (part.age < LIFE) {
        part.age += dt;
        part.v.y -= GRAVITY * (leaf ? 0.35 : 1) * dt;
        if (leaf) part.v.multiplyScalar(Math.exp(-dt * 2.5));
        part.p.addScaledVector(part.v, dt);
        alive ||= part.age < LIFE;
      }
      const k = Math.max(0, 1 - part.age / LIFE);
      this.rotation.setFromEuler(
        this.euler.set(
          part.spin.x * part.age,
          part.spin.y * part.age,
          part.spin.z * part.age,
        ),
      );
      this.size.setScalar(k > 0 ? 0.35 + 0.65 * k : 0);
      this.matrix.compose(part.p, this.rotation, this.size);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) this.hide();
  }

  hide() {
    for (const part of this.parts) part.age = LIFE;
    this.size.setScalar(0);
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < COUNT; i++) this.mesh.setMatrixAt(i, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = false;
  }

  prepareForCompile(on) {
    prepareVisuals(this, on, [[this.mesh, "visible", true]]);
  }
}
