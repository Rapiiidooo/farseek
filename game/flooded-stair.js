import * as THREE from "three";
import { CurrentField } from "./sea-currents.js";

// The stairwell before the guardian's court holds the sea between two pressure fields: a swimmer
// cannot climb out over a rim above the water, so both exits are vertical.
export const FLOODED = {
  minX: -3,
  maxX: 3,
  minZ: -61,
  maxZ: -53,
  floor: 21.5,
  roof: 29.4,
  blocks: [
    { x: -1.2, z: -55.6, w: 3.6, d: 0.9, top: 24.7 },
    { x: 1.2, z: -58.3, w: 3.6, d: 0.9, top: 24.7 },
  ],
  // The surge: calm, an amber warning, then the burst, repeating.
  period: 5.6,
  warn: 2.4,
  burst: 3.8,
  speed: 4.4,
};
const AMBER = 0xffb24a;

export class FloodedStair {
  constructor(archive, layout = FLOODED) {
    this.archive = archive;
    this.layout = layout;
    this.phase = "calm";
  }

  build() {
    const a = this.archive,
      L = this.layout;
    const stone = a.stone;
    const tile = stone.userData.tileMeters || 2;
    const box = (minX, minY, minZ, maxX, maxY, maxZ, collide = true) => {
      const w = maxX - minX,
        h = maxY - minY,
        d = maxZ - minZ;
      const geometry = new THREE.BoxGeometry(w, h, d);
      const p = geometry.attributes.position,
        n = geometry.attributes.normal,
        uv = geometry.attributes.uv;
      const cx = (minX + maxX) / 2,
        cy = (minY + maxY) / 2,
        cz = (minZ + maxZ) / 2;
      for (let i = 0; i < p.count; i++)
        uv.setXY(
          i,
          (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) + cz : p.getX(i) + cx) / tile,
          (Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) + cz : p.getY(i) + cy) / tile,
        );
      const mesh = new THREE.Mesh(geometry, stone);
      mesh.position.set(cx, cy, cz);
      mesh.receiveShadow = true;
      a.scene.add(mesh);
      if (collide)
        a.world.add(minX, minY, minZ, maxX, maxY, maxZ, "rock", null, {
          grab: false,
        });
      return mesh;
    };
    const t = 0.6;
    box(
      L.minX - t,
      L.floor - 1.2,
      L.minZ - 0.4,
      L.maxX + t,
      L.floor,
      L.maxZ + 0.4,
    );
    for (const side of [-1, 1]) {
      const x = side < 0 ? L.minX - t : L.maxX;
      box(x, L.floor - 0.5, L.minZ - 0.4, x + t, L.roof + 0.8, L.maxZ + 0.4);
    }
    box(L.minX - t, L.roof, L.minZ + 0.6, L.maxX + t, L.roof + 0.7, -57.1);
    box(
      L.minX - t,
      L.roof + 0.12,
      -57.1,
      L.maxX + t,
      L.roof + 0.95,
      L.maxZ - 0.5,
    );
    box(L.minX, L.floor, L.maxZ, L.maxX, 24.8, L.maxZ + 0.4);
    box(L.minX, L.floor, L.minZ - 0.4, L.maxX, 24.3, L.minZ);
    this.lees = [];
    for (const b of L.blocks) {
      box(
        b.x - b.w / 2,
        L.floor,
        b.z - b.d / 2,
        b.x + b.w / 2,
        b.top,
        b.z + b.d / 2,
      );
      this.lees.push({
        minX: b.x - b.w / 2 + 0.1,
        maxX: b.x + b.w / 2 - 0.1,
        minY: L.floor,
        maxY: b.top + 0.35,
        minZ: b.z + b.d / 2,
        maxZ: b.z + b.d / 2 + 1.7,
      });
    }
    const shell = a.sanctuary.shell.material;
    this.fieldUniforms = { uTime: { value: 0 }, uStrength: { value: 1 } };
    const field = shell.clone();
    field.uniforms = this.fieldUniforms;
    const tint = new THREE.MeshBasicMaterial({
      color: 0x0d4a57,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.fields = [];
    for (const [z, low, facing] of [
      [L.maxZ, 26, 1],
      [L.minZ, 25.5, -1],
    ]) {
      const h = L.roof - low,
        w = L.maxX - L.minX;
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), field);
      sheet.position.set(0, low + h / 2, z);
      sheet.renderOrder = 2;
      a.scene.add(sheet);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tint);
      water.position.set(0, low + h / 2, z + facing * 0.02);
      if (facing < 0) water.rotation.y = Math.PI;
      water.renderOrder = 1;
      a.scene.add(water);
      for (const [x, y, sw, sh] of [
        [0, L.roof - 0.05, w, 0.09],
        [L.minX + 0.05, low + h / 2, 0.09, h],
        [L.maxX - 0.05, low + h / 2, 0.09, h],
      ]) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(sw, sh, 0.05),
          a.pathLight,
        );
        strip.position.set(x, y, z + facing * 0.04);
        a.scene.add(strip);
      }
      this.fields.push(sheet);
    }
    this.vent = new THREE.Mesh(
      new THREE.PlaneGeometry(L.maxX - L.minX - 0.8, 2.2),
      new THREE.MeshBasicMaterial({
        color: AMBER,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.vent.position.set(0, L.floor + 1.3, L.minZ + 0.03);
    a.scene.add(this.vent);
    this.current = new CurrentField({
      box: {
        minX: L.minX,
        maxX: L.maxX,
        minY: L.floor,
        maxY: L.roof,
        minZ: L.minZ,
        maxZ: L.maxZ,
      },
      flow: { x: 0, z: 1 },
      speed: L.speed,
      edge: 0.6,
      lees: this.lees,
      streaks: 140,
    }).build(a.scene);
    this.region = {
      minX: L.minX,
      maxX: L.maxX,
      minY: L.floor,
      maxY: L.roof,
      minZ: L.minZ,
      maxZ: L.maxZ,
    };
    this.update(0);
  }

  contains(p) {
    const r = this.region;
    return (
      p.x > r.minX &&
      p.x < r.maxX &&
      p.y > r.minY &&
      p.y < r.maxY &&
      p.z > r.minZ &&
      p.z < r.maxZ
    );
  }

  // The next place to make for: the lee of each block in turn, then the far landing.
  next(hero) {
    const [a, b] = this.lees;
    const centre = (l) =>
      new THREE.Vector3(
        (l.minX + l.maxX) / 2,
        this.layout.floor + 2,
        (l.minZ + l.maxZ) / 2,
      );
    if (hero.pos.z > (a.minZ + a.maxZ) / 2 + 0.3) return centre(a);
    if (hero.pos.z > (b.minZ + b.maxZ) / 2 + 0.3) return centre(b);
    return new THREE.Vector3(0, 26.2, this.layout.minZ - 0.6);
  }

  surge(time) {
    const L = this.layout;
    const u = ((time % L.period) + L.period) % L.period;
    if (u < L.warn) return { phase: "calm", k: 0.12, warn: 0 };
    if (u < L.burst)
      return {
        phase: "warning",
        k: 0.12 + 0.18 * ((u - L.warn) / (L.burst - L.warn)),
        warn: 1,
      };
    return { phase: "burst", k: 1, warn: 0 };
  }

  update(dt, time = this.archive.time) {
    const s = this.surge(time);
    this.phase = s.phase;
    this.current.scale = s.k;
    this.current.update(dt, 1);
    this.fieldUniforms.uTime.value += dt;
    this.vent.material.opacity = s.warn
      ? 0.35 + Math.sin(time * 12) * 0.25
      : s.phase === "burst"
        ? 0.8
        : 0.1;
  }

  visuals() {
    return this.current.visuals();
  }

  telemetry() {
    return {
      phase: this.phase,
      scale: this.current.scale,
      region: this.region,
      lees: this.lees,
    };
  }
}
