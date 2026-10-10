import * as THREE from "three";
import { CurrentField } from "./sea-currents.js";

// A current sweeps west across the plaza between the door and the control desk; the still water
// behind three broken piers makes a route from shelter to shelter.
export const ARRIVAL_CURRENT = {
  box: { minX: -24, maxX: 24, minY: 18, maxY: 44, minZ: -15.5, maxZ: -7.6 },
  flow: { x: -1, z: 0 },
  speed: 2.6,
  // [x, z, top, length]: each pier is a slab of wall 1 m thick along the flow and `length`
  // across it; the last stops short of the console's landing.
  piers: [
    [6.8, -9.0, 34.0, 3.6],
    [9.2, -11.3, 33.4, 3.6],
    [11.6, -13.5, 32.8, 3.0],
  ],
};

export class ArrivalCurrent {
  constructor(archive, layout = ARRIVAL_CURRENT) {
    this.archive = archive;
    this.layout = layout;
  }

  build() {
    const a = this.archive,
      L = this.layout;
    const tile = a.stone.userData.tileMeters || 2;
    const block = (x, y0, y1, z, w, d, yaw = 0, tilt = 0) => {
      const geometry = new THREE.BoxGeometry(w, y1 - y0, d);
      const p = geometry.attributes.position,
        n = geometry.attributes.normal,
        uv = geometry.attributes.uv;
      for (let i = 0; i < p.count; i++)
        uv.setXY(
          i,
          (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) + z : p.getX(i) + x) / tile,
          (Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) + z : p.getY(i) + y1) / tile,
        );
      const mesh = new THREE.Mesh(geometry, a.stone);
      mesh.position.set(x, (y0 + y1) / 2, z);
      mesh.rotation.set(tilt, yaw, 0);
      mesh.receiveShadow = true;
      a.scene.add(mesh);
    };
    this.lees = [];
    this.shelters = [];
    for (const [x, z, top, length] of L.piers) {
      const half = length / 2;
      block(x, 0, top - 1.4, z, 1, length);
      block(
        x + 0.05,
        top - 1.45,
        top,
        z - half / 4,
        0.92,
        length * 0.7,
        0.06,
        0.05,
      );
      block(
        x - 0.08,
        top - 1.5,
        top - 0.6,
        z + half * 0.72,
        0.96,
        0.9,
        -0.1,
        -0.08,
      );
      a.world.add(x - 0.5, 0, z - half, x + 0.5, top, z + half, "rock", null, {
        grab: false,
      });
      const downstream = Math.sign(L.flow.x) || 1;
      const lee = {
        minX: downstream < 0 ? x - 0.5 - 3.4 : x + 0.5,
        maxX: downstream < 0 ? x - 0.5 : x + 0.5 + 3.4,
        minY: L.box.minY,
        maxY: top - 0.4,
        minZ: z - half + 0.2,
        maxZ: z + half - 0.2,
      };
      this.lees.push(lee);
      this.shelters.push(
        new THREE.Vector3((lee.minX + lee.maxX) / 2, Math.min(31, top - 2), z),
      );
    }
    this.current = new CurrentField({
      box: L.box,
      flow: L.flow,
      speed: L.speed,
      edge: 1.4,
      lees: this.lees,
      streaks: 420,
    }).build(a.scene);
  }

  update(dt, show) {
    this.current.scale = show;
    this.current.update(dt, show);
  }

  // The shelter to make for next: past the lee she is in, or the first one not yet passed.
  next(hero) {
    for (let k = 0; k < this.lees.length; k++) {
      const l = this.lees[k];
      if (hero.pos.z < l.minZ - 0.3) continue;
      const inside =
        hero.pos.x > l.minX - 0.3 &&
        hero.pos.x < l.maxX + 0.3 &&
        hero.pos.z < l.maxZ + 0.3;
      return inside ? (this.shelters[k + 1] ?? null) : this.shelters[k];
    }
    return null;
  }

  visuals() {
    return this.current.visuals();
  }

  telemetry() {
    return {
      scale: this.current.scale,
      box: this.layout.box,
      flow: this.layout.flow,
      shelters: this.shelters.map((s) => s.toArray()),
      lees: this.lees,
    };
  }
}
