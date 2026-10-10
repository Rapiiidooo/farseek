import * as THREE from "three";
import { isleAt } from "./world.js";
import { tubeSet, loft } from "./rope-loft.js";
import { mineralBaseColor } from "./mineral-surface.js";

// A snapped expedition rope draped over an isle's rolled rim: tied off at a piton on the cap,
// laid over the lip along the measured surface, hanging free below it to a frayed end.
const RL = 0.03,
  D = RL * 1.02,
  SIDES = 6,
  FREE_RINGS = 22,
  FIBRES = 4;

export class DrapedRope {
  constructor(isle, toward, { side = 0, seed = 1 } = {}) {
    this.isle = isle;
    this.toward = toward;
    this.side = side;
    this.seed = seed;
    this.time = 0;
  }

  // `hardware` is an expedition_rope asset: its piton, ring and wedge are kept, and its rope
  // gives the material.
  build(scene, hardware) {
    const c = this.isle.collider;
    const a = Math.atan2(
      this.toward.collider.z - c.z,
      this.toward.collider.x - c.x,
    );
    const u = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const w = new THREE.Vector3(-u.z, 0, u.x);
    const origin = new THREE.Vector3(c.x, 0, c.z).addScaledVector(w, this.side);
    const at = (r) => origin.clone().addScaledVector(u, r);
    let rim = 0;
    while (rim < 40) {
      const p = at(rim + 0.05);
      const s = isleAt(c, p.x, p.z);
      if (s.rho > s.rim) break;
      rim += 0.05;
    }
    const r0 = Math.max(0.3, rim - 0.6);
    const anchor = at(r0);
    anchor.y = isleAt(c, anchor.x, anchor.z).top;
    this.anchor = anchor;

    const surfaces = [];
    this.isle.object.updateMatrixWorld(true);
    this.isle.object.traverse((m) => {
      if (m.isMesh && mineralBaseColor(m.material).getHex() === 0xeadcc0)
        surfaces.push(m);
    });
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0),
      inward = u.clone().negate();
    const topAt = (r) => {
      const p = at(r);
      ray.set(p.set(p.x, anchor.y + 3, p.z), down);
      ray.far = 6;
      return ray.intersectObjects(surfaces, false)[0]?.point.y ?? null;
    };
    const faceAt = (y, from) => {
      const p = at(from);
      ray.set(p.set(p.x, y, p.z), inward);
      ray.far = from + 2;
      const hit = ray.intersectObjects(surfaces, false)[0];
      return hit ? from - hit.distance : null;
    };
    const top = [];
    let edge = r0,
      edgeY = topAt(r0) ?? anchor.y;
    for (let r = r0; r < rim + 3; r += 0.04) {
      const y = topAt(r);
      if (y === null || y < edgeY - 0.35) break;
      top.push([r, y]);
      edge = r;
      edgeY = y;
    }
    let lo = edge,
      hi = edge + 0.04;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2,
        y = topAt(mid);
      if (y !== null && y > edgeY - 0.35) lo = mid;
      else hi = mid;
    }
    edge = lo;
    edgeY = topAt(edge) ?? edgeY;
    top.push([edge, edgeY]);
    const face = [];
    let faceR = null,
      bottom = edgeY;
    for (let y = edgeY - 0.03; y > edgeY - 4; y -= 0.04) {
      const r = faceAt(y, edge + 1.2);
      if (r === null || (faceR !== null && r < faceR - 0.03)) break;
      faceR = faceR === null ? r : Math.max(faceR, r);
      face.push([r, y]);
      bottom = y;
    }
    if (!face.length) face.push([edge, edgeY - 0.05]);

    // The centreline in the rope's plane, [r, y], lifted off the stone by the rope's radius.
    const path = [];
    for (let i = 0; i < top.length; i++) {
      const [r, y] = top[i];
      const [r1, y1] = top[Math.min(top.length - 1, i + 1)];
      const [rp, yp] = top[Math.max(0, i - 1)];
      const dr = r1 - rp || 1,
        dy = y1 - yp;
      const l = Math.hypot(dr, dy);
      path.push([r - (dy / l) * RL * 1.1, y + (dr / l) * RL * 1.1]);
    }
    const last = top.length > 1 ? top[top.length - 2] : [edge - 0.04, edgeY];
    const slope = new THREE.Vector2(edge - last[0], edgeY - last[1]);
    const nt = new THREE.Vector2(-slope.y, slope.x).normalize();
    for (const k of [0.25, 0.5, 0.75]) {
      const n = nt.clone().lerp(new THREE.Vector2(1, 0), k).normalize();
      path.push([edge + n.x * RL * 1.1, edgeY + n.y * RL * 1.1]);
    }
    for (const [r, y] of face) path.push([r + RL * 1.1, y]);
    const foot = [face[face.length - 1][0] + RL * 1.1, bottom];

    const world = ([r, y], l = 0) => at(r).addScaledVector(w, l).setY(y);

    hardware.traverse((m) => {
      if (m.isMesh && m.material?.name === "fabric") this.material = m.material;
    });
    for (const m of [...hardware.children])
      if (m.isMesh && m.material === this.material) hardware.remove(m);
    const [ax, ay, az] = hardware.userData.anchor || [0, 1.75, 0];
    const fall = top.length > 2 ? (top[0][1] - top[2][1]) / 0.08 : 0;
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.atan(fall), Math.atan2(u.x, u.z), 0, "YXZ"),
    );
    hardware.quaternion.copy(q);
    hardware.position
      .copy(anchor)
      .sub(new THREE.Vector3(ax, ay, az).applyQuaternion(q));
    hardware.traverse((m) => {
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    scene.add(hardware);
    const local = (x, y, z) =>
      new THREE.Vector3(ax + x, ay + y, az + z)
        .applyQuaternion(q)
        .add(hardware.position);
    // Through the ring: the asset's ring sits 0.12 m behind the anchor corner.
    const A = 0.022 + RL,
      RHO = RL + 0.002;
    const turn = [];
    for (let k = 0; k <= 9; k++) {
      const phi = -Math.PI / 2 - (1.5 * Math.PI * k) / 9;
      turn.push(
        local(
          -D + (2 * D * k) / 9,
          RHO + A + A * Math.sin(phi),
          -0.12 + A * Math.cos(phi),
        ),
      );
    }
    const legs = [-1, 1].map((sgn) => path.map((p) => world(p, sgn * D)));
    const statik = [
      ...legs[0].slice().reverse(),
      local(-D, RHO, -0.03),
      ...turn,
      local(D, RHO + 0.02, -0.12 + A + 0.022),
      local(D, RHO, -0.03),
      ...legs[1],
    ];
    const { geometry, parts } = tubeSet([
      { rings: statik.length, sides: SIDES },
    ]);
    loft(
      geometry.attributes.position,
      geometry.attributes.normal,
      parts[0].start,
      statik.flatMap((p) => [p.x, p.y, p.z]),
      statik.length,
      SIDES,
      () => RL,
    );
    geometry.computeBoundingSphere();
    this.static = new THREE.Mesh(geometry, this.material);
    this.static.castShadow = this.static.receiveShadow = true;
    scene.add(this.static);

    let rand = this.seed * 9301 + 49297;
    const random = () => (rand = (rand * 16807) % 2147483647) / 2147483647;
    this.length = 2.1 + random() * 1.3;
    this.phase = random() * 6.3;
    this.u = u;
    this.w = w;
    this.foot = world(foot);
    const specs = [];
    for (let leg = 0; leg < 2; leg++) {
      specs.push({ rings: FREE_RINGS, sides: SIDES });
      for (let f = 0; f < FIBRES; f++) specs.push({ rings: 2, sides: 3 });
    }
    const set = tubeSet(specs, { dynamic: true });
    this.free = new THREE.Mesh(set.geometry, this.material);
    this.free.castShadow = this.free.receiveShadow = true;
    this.parts = set.parts;
    this.points = new Float32Array(FREE_RINGS * 3);
    this.centre = new Float32Array(FREE_RINGS * 3);
    scene.add(this.free);
    this.update(0);
    set.geometry.boundingSphere = new THREE.Sphere(
      this.foot.clone().setY(this.foot.y - this.length / 2),
      this.length / 2 + 0.6,
    );
    return this;
  }

  update(dt) {
    this.time += dt;
    const t = this.time + this.phase;
    const out = 0.045 + 0.03 * Math.sin(t * 1.3) + 0.012 * Math.sin(t * 2.9);
    const across = 0.03 * Math.sin(t * 1.05 + 1.7) + 0.01 * Math.sin(t * 2.3);
    const { u, w, foot } = this;
    const c = this.centre;
    let x = foot.x,
      y = foot.y,
      z = foot.z;
    const step = this.length / (FREE_RINGS - 1);
    for (let i = 0; i < FREE_RINGS; i++) {
      c[i * 3] = x;
      c[i * 3 + 1] = y;
      c[i * 3 + 2] = z;
      const bend = 0.55 + (0.45 * i) / (FREE_RINGS - 1);
      const ao = out * bend,
        aa = across * bend;
      x += (u.x * Math.sin(ao) + w.x * Math.sin(aa)) * step;
      z += (u.z * Math.sin(ao) + w.z * Math.sin(aa)) * step;
      y -= Math.cos(ao) * Math.cos(aa) * step;
    }
    const geometry = this.free.geometry;
    const position = geometry.attributes.position,
      normal = geometry.attributes.normal;
    const p = this.points;
    let part = 0;
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < FREE_RINGS; i++) {
        const s = (i * step) / 0.9;
        const twist = Math.PI * 2 * s * Math.min(1, i / 4);
        const k = Math.cos(twist) * D * sgn,
          l = Math.sin(twist) * D * sgn;
        p[i * 3] = c[i * 3] + w.x * k + u.x * l;
        p[i * 3 + 1] = c[i * 3 + 1];
        p[i * 3 + 2] = c[i * 3 + 2] + w.z * k + u.z * l;
      }
      const end = loft(
        position,
        normal,
        this.parts[part++].start,
        p,
        FREE_RINGS,
        SIDES,
        (i) =>
          i >= FREE_RINGS - 2 ? RL * (i === FREE_RINGS - 1 ? 1.28 : 1.18) : RL,
        [w.x, 0, w.z],
      );
      const e = (FREE_RINGS - 1) * 3,
        ex = p[e] - p[e - 3],
        ey = p[e + 1] - p[e - 2],
        ez = p[e + 2] - p[e - 1];
      const el = Math.hypot(ex, ey, ez) || 1;
      const bx = (ey * end[2] - ez * end[1]) / el,
        by = (ez * end[0] - ex * end[2]) / el,
        bz = (ex * end[1] - ey * end[0]) / el;
      for (let f = 0; f < FIBRES; f++) {
        const angle = (f / FIBRES) * Math.PI * 2 + (sgn > 0 ? 0.9 : 0.2);
        const ox = end[0] * Math.cos(angle) + bx * Math.sin(angle),
          oy = end[1] * Math.cos(angle) + by * Math.sin(angle),
          oz = end[2] * Math.cos(angle) + bz * Math.sin(angle);
        const lift = 0.038 + 0.01 * (f % 3),
          spread = 0.022 + 0.008 * (f % 2);
        const sx = p[e] + (ex / el) * 0.012 + ox * RL * 0.7,
          sy = p[e + 1] + (ey / el) * 0.012 + oy * RL * 0.7,
          sz = p[e + 2] + (ez / el) * 0.012 + oz * RL * 0.7;
        const fibre = [
          sx,
          sy,
          sz,
          sx + (ex / el) * lift + ox * spread,
          sy + (ey / el) * lift + oy * spread,
          sz + (ez / el) * lift + oz * spread,
        ];
        loft(position, normal, this.parts[part++].start, fibre, 2, 3, (i) =>
          i ? 0.004 : 0.0055,
        );
      }
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
  }
}
