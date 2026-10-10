import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import { finishAsset } from "./asset-finish.js";
import { mineralSurfaceReady } from "./mineral-surface.js";
import { barkSurfaceReady } from "./bark-surface.js";

// The ground each world gives its far doors. Every base keeps the court dais's walkable
// shape, which gateColliders describes: a 12 x 6 m lower tier with its top 0.5 m up, an
// 11 x 4.4 m floor 1.02 m up, and a buttress either side from the ring out to x = 5.5 m,
// 2.6 m deep and up to 3.9 m. Coordinates are the far_gate asset's: base at y = 0, centred,
// the entrance towards +Z, the ring's centre 4.5 m up.
const FLOOR = 1.02,
  LOW = 0.5,
  CY = 4.5,
  RA = 4.46;
const TAU = Math.PI * 2;
const KEEP = new Set(["position", "normal", "uv", "color"]);

function random(seed) {
  let s = seed | 0 || 1;
  return () =>
    ((s = (Math.imul(1664525, s) + 1013904223) | 0) >>> 0) / 4294967296;
}

// One lattice of values serves every noise here; a seed only shifts where it is read.
const LATTICE = (() => {
  const rand = random(7919);
  return Float32Array.from({ length: 4096 }, rand);
})();

function lattice(x, y, z) {
  return LATTICE[((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & 4095];
}

function value(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  let fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iy, iz),
    b = lattice(ix + 1, iy, iz),
    c = lattice(ix, iy + 1, iz),
    d = lattice(ix + 1, iy + 1, iz),
    e = lattice(ix, iy, iz + 1),
    f = lattice(ix + 1, iy, iz + 1),
    g = lattice(ix, iy + 1, iz + 1),
    h = lattice(ix + 1, iy + 1, iz + 1);
  const ab = a + (b - a) * fx,
    cd = c + (d - c) * fx,
    ef = e + (f - e) * fx,
    gh = g + (h - g) * fx;
  const near = ab + (cd - ab) * fy;
  return near + (ef + (gh - ef) * fy - near) * fz;
}

function noise(x, y, z, seed = 0) {
  const s = seed * 13.37;
  return (
    value(x + s, y, z) * 0.6 + value(x * 2.3 + 5 + s, y * 2.3, z * 2.3) * 0.4
  );
}

function material(color, name, roughness = 0.9, extra = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    ...extra,
  });
  m.name = name;
  return m;
}

function prepared(g) {
  for (const name of Object.keys(g.attributes))
    if (!KEEP.has(name)) g.deleteAttribute(name);
  const count = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv)
    g.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(count * 2), 2),
    );
  if (!g.attributes.color)
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3),
    );
  return g;
}

function tint(geometry, color) {
  const g = prepared(geometry);
  const c = g.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, color[0], color[1], color[2]);
  return g;
}

// Every piece is merged per material, so a base costs a few draws like the court's dais.
// Building yields to the world's work budget between pieces, so preparation never stalls play.
class Pieces {
  constructor(pause) {
    this.sets = new Map();
    this.pause = pause;
  }

  add(profile, mat, geometry) {
    if (!this.sets.has(profile)) this.sets.set(profile, new Map());
    const set = this.sets.get(profile);
    if (!set.has(mat)) set.set(mat, []);
    set.get(mat).push(prepared(geometry));
  }

  async build() {
    const root = new THREE.Group();
    for (const [profile, set] of this.sets) {
      const group = new THREE.Group();
      for (const [mat, list] of set) {
        const parts = list.every((g) => g.index)
          ? list
          : list.map((g) => (g.index ? g.toNonIndexed() : g));
        const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
        mesh.castShadow = mat.userData.shadow !== false;
        mesh.receiveShadow = true;
        group.add(mesh);
        for (const g of list) g.dispose();
        await this.pause();
      }
      // The world's own scenery lends its surface recipe: masonry, rock or bark.
      if (profile) finishAsset(THREE, group, profile);
      root.add(group);
      await this.pause();
    }
    await Promise.all([mineralSurfaceReady(root), barkSurfaceReady(root)]);
    return root;
  }
}

function roughen(geometry, amount, seed, keepAbove = Infinity) {
  const p = geometry.attributes.position;
  const k = amount * 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    if (y > keepAbove - 1e-3) continue;
    const u = x * 1.9,
      v = y * 1.9,
      w = z * 1.9;
    p.setXYZ(
      i,
      x + (noise(u, v, w, seed) - 0.5) * k,
      y + (noise(u + 7, v, w, seed) - 0.5) * k * 0.45,
      z + (noise(u, v + 3, w + 9, seed) - 0.5) * k,
    );
  }
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
}

// A slab: a rounded outline extruded upwards from y0 to y1 with a bevelled rim. `erode`
// roughens every face but the top, which stays a flat floor; `jitter` wanders the outline.
function slab(w, d, y0, y1, o = {}) {
  const {
    corner = 0.05,
    bevel = 0.03,
    erode = 0,
    jitter = 0,
    seed = 1,
    step = 0.6,
    x = 0,
    z = 0,
    turn = 0,
  } = o;
  const hw = w / 2,
    hd = d / 2,
    r = Math.min(corner, hw - 0.01, hd - 0.01);
  const points = [];
  const edge = (ax, az, bx, bz) => {
    const count = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i < count; i++)
      points.push([ax + ((bx - ax) * i) / count, az + ((bz - az) * i) / count]);
  };
  const bend = (cx, cz, from) => {
    for (let i = 0; i < 3; i++) {
      const a = from + (i / 3) * (Math.PI / 2);
      points.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  edge(-hw + r, -hd, hw - r, -hd);
  bend(hw - r, -hd + r, -Math.PI / 2);
  edge(hw, -hd + r, hw, hd - r);
  bend(hw - r, hd - r, 0);
  edge(hw - r, hd, -hw + r, hd);
  bend(-hw + r, hd - r, Math.PI / 2);
  edge(-hw, hd - r, -hw, -hd + r);
  bend(-hw + r, -hd + r, Math.PI);
  const shape = new THREE.Shape(
    points.map(([px, pz]) => {
      const k = jitter
        ? (noise(px * 0.8, pz * 0.8, 3.1, seed) - 0.5) * 2 * jitter
        : 0;
      const len = Math.hypot(px, pz) || 1;
      return new THREE.Vector2(px + (px / len) * k, pz + (pz / len) * k);
    }),
  );
  const height = y1 - y0,
    b = Math.min(bevel, height / 2 - 0.002);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, height - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: b > 0.05 ? 2 : 1,
    steps: Math.max(1, Math.round(height / step)),
    curveSegments: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y1 - b, 0);
  if (erode) roughen(geometry, erode, seed, y1);
  if (turn) geometry.rotateY(turn);
  geometry.translate(x, 0, z);
  return geometry;
}

// The ring's outer circle at a given height, as the inner face of a buttress.
function ringX(y) {
  return Math.sqrt(Math.max(0, RA * RA - (y - CY) ** 2));
}

// A buttress course from y0 to y1, from the ring out to `outer`, across z0..z1.
function course(y0, y1, outer, z0, z1, o = {}) {
  const { bevel = 0.04, erode = 0, seed = 3, lean = 0 } = o;
  const pts = [
    [outer, y0],
    [outer - lean, y1],
  ];
  for (let i = 0; i <= 6; i++) {
    const y = y1 + ((y0 - y1) * i) / 6;
    pts.push([ringX(y) - 0.02, y]);
  }
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const b = Math.min(bevel, (y1 - y0) / 2 - 0.002, (z1 - z0) / 2 - 0.002);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: z1 - z0 - 2 * b,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: b > 0.05 ? 2 : 1,
    steps: erode ? Math.max(1, Math.round((z1 - z0) / 0.6)) : 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, z0 + b);
  if (erode) roughen(geometry, erode, seed);
  return geometry;
}

// The left buttress is the right one mirrored; mirroring turns every triangle inside out,
// so two corners of each swap back.
function sided(geometry, side) {
  const g = prepared(geometry);
  if (side > 0) return g;
  g.scale(-1, 1, 1);
  if (g.index) {
    const index = g.index;
    for (let i = 0; i < index.count; i += 3) {
      const t = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, t);
    }
    return g;
  }
  const count = g.attributes.position.count;
  for (let i = 0; i < count; i += 3)
    for (const a of Object.values(g.attributes))
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.getComponent(i + 1, k);
        a.setComponent(i + 1, k, a.getComponent(i + 2, k));
        a.setComponent(i + 2, k, t);
      }
  return g;
}

function lump(rx, ry, rz, o = {}) {
  const { seed = 1, detail = 2, rough = 0.25, flat = true, smooth = false } = o;
  let g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k =
      1 +
      (noise(v.x * 2 + 4, v.y * 2 + 4, v.z * 2 + 4, seed) - 0.5) * 2 * rough;
    v.multiplyScalar(k);
    if (flat && v.y < -0.15) v.y = -0.15;
    p.setXYZ(i, v.x * rx, v.y * ry, v.z * rz);
  }
  if (smooth) {
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g = mergeVertices(g);
  }
  g.computeVertexNormals();
  return g;
}

function cone(radius, length, sides = 6) {
  const g = new THREE.ConeGeometry(radius, length, sides, 1);
  g.rotateX(Math.PI);
  g.translate(0, -length / 2, 0);
  return g;
}

// A tapered tube along a curve, for roots: radius from `r0` at the start to `r1` at the tip.
function tube(points, r0, r1, sides = 8, segments = 30) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const frames = curve.computeFrenetFrames(segments, false);
  const length = curve.getLength();
  const position = [],
    normal = [],
    uv = [],
    index = [];
  const p = new THREE.Vector3(),
    nrm = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = r0 + (r1 - r0) * t ** 0.8;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * TAU;
      nrm
        .copy(frames.normals[i])
        .multiplyScalar(Math.cos(a))
        .addScaledVector(frames.binormals[i], Math.sin(a));
      position.push(p.x + nrm.x * r, p.y + nrm.y * r, p.z + nrm.z * r);
      normal.push(nrm.x, nrm.y, nrm.z);
      uv.push(j / sides, t * length * 1.2);
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j,
        b = a + sides + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

// A painted parallelogram on a riser (face +1 front, -1 back), with y as its middle.
function stripe(x0, x1, y, z, slant, face) {
  const h = 0.055,
    at = z + face * 0.004;
  const pts = [
    [x0, y - h],
    [x1, y - h],
    [x1 + slant, y + h],
    [x0 + slant, y + h],
  ];
  const position = [];
  for (const k of face > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])
    position.push(pts[k][0], pts[k][1], at);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.computeVertexNormals();
  return g;
}

function box(w, h, d, x, y, z, turn = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (turn) g.rotateY(turn);
  g.translate(x, y, z);
  return g;
}

function disc(radius, x, y, z, sides = 24) {
  const g = new THREE.CylinderGeometry(radius, radius, 0.012, sides);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

// A clump of crossed blades, for the sage of the isles.
function tuft(height, x, y, z, seed) {
  const rand = random(seed);
  const position = [],
    normal = [],
    color = [];
  for (let i = 0; i < 9; i++) {
    const a = rand() * TAU,
      lean = 0.25 + rand() * 0.4,
      h = height * (0.6 + rand() * 0.5),
      w = 0.018 + rand() * 0.012,
      shade = 0.9 + rand() * 0.2;
    const sx = Math.cos(a + Math.PI / 2) * w,
      sz = Math.sin(a + Math.PI / 2) * w;
    position.push(
      x - sx,
      y,
      z - sz,
      x + sx,
      y,
      z + sz,
      x + Math.cos(a) * lean * h,
      y + h,
      z + Math.sin(a) * lean * h,
    );
    for (let k = 0; k < 3; k++) {
      normal.push(0, 1, 0);
      color.push(shade, 1, 0.9);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  return g;
}

// A fern: arching fronds, each a rachis with leaflets either side that shrink to the tip,
// moss green at the crown and fern green where the light reaches.
function fern(x, y, z, size, seed) {
  const rand = random(seed);
  const position = [],
    color = [];
  const point = (out, up, yaw) => [
    x + Math.cos(yaw) * out,
    y + up,
    z + Math.sin(yaw) * out,
  ];
  for (let f = 0; f < 9; f++) {
    const yaw = (f / 9) * TAU + rand() * 0.5,
      length = size * (0.65 + rand() * 0.45),
      rise = 0.7 + rand() * 0.45,
      droop = 0.75 + rand() * 0.35;
    const sx = -Math.sin(yaw),
      sz = Math.cos(yaw);
    const segments = 7;
    for (let k = 0; k < segments; k++) {
      const t0 = k / segments,
        t1 = (k + 1) / segments,
        tm = (t0 + t1) / 2;
      const a = point(
        length * t0,
        length * (Math.sin(rise) * t0 - droop * t0 * t0),
        yaw,
      );
      const b = point(
        length * t1,
        length * (Math.sin(rise) * t1 - droop * t1 * t1),
        yaw,
      );
      const m = point(
        length * tm,
        length * (Math.sin(rise) * tm - droop * tm * tm),
        yaw,
      );
      const wide = size * 0.17 * (1 - tm * 0.85) * (k === 0 ? 0.5 : 1);
      const sag = -wide * 0.35;
      for (const s of [1, -1]) {
        const tip = [m[0] + sx * wide * s, m[1] + sag, m[2] + sz * wide * s];
        position.push(...a, ...b, ...tip);
        const lit = 0.62 + tm * 0.5;
        color.push(
          0.62,
          0.7,
          0.55,
          lit,
          lit * 1.08,
          lit * 0.62,
          lit * 1.05,
          lit * 1.12,
          lit * 0.6,
        );
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  g.computeVertexNormals();
  return g;
}

// --- the checkpoint: a customs platform in night basalt, warden chalk and stamp ochre ----
async function checkpoint(pause) {
  const pieces = new Pieces(pause);
  // Night basalt lifted towards ash lilac, so the dressed stone reads under the violet sky.
  const night = material(0x5a5466, "stone", 0.86),
    basalt = material(0x423d4a, "stone", 0.82),
    chalk = material(0xc9c2d8, "plaster", 0.8),
    ochre = material(0xd9a441, "plaster", 0.7),
    paint = material(0xc9c2d8, "plaster", 0.75),
    lamp = material(0x1d5f63, "lens", 0.28, {
      emissive: 0x39e3d0,
      emissiveIntensity: 1.4,
    });
  ochre.userData.shadow = paint.userData.shadow = lamp.userData.shadow = false;
  const S = "far_gate";
  pieces.add(S, night, slab(12, 6, 0, 0.42, { corner: 0.04, bevel: 0.025 }));
  pieces.add(
    S,
    basalt,
    slab(11.96, 5.96, 0.42, LOW, { corner: 0.04, bevel: 0.015 }),
  );
  pieces.add(
    S,
    night,
    slab(11, 4.4, LOW, 0.94, { corner: 0.04, bevel: 0.025 }),
  );
  pieces.add(
    S,
    basalt,
    slab(10.98, 4.38, 0.94, FLOOR, { corner: 0.03, bevel: 0.012 }),
  );
  await pause();
  for (const face of [1, -1]) {
    // Chalk panels let into every riser, framed by the basalt.
    for (let i = 0; i < 8; i++)
      pieces.add(
        S,
        chalk,
        box(1.12, 0.18, 0.02, -4.9 + i * 1.4, 0.17, face * 3.0),
      );
    for (let i = 0; i < 5; i++)
      pieces.add(
        S,
        chalk,
        box(1.7, 0.22, 0.02, -4.2 + i * 2.1, 0.68, face * 2.2),
      );
    for (const zz of [-1.8, 0, 1.8])
      pieces.add(S, chalk, box(0.02, 0.18, 1.4, face * 6.0, 0.17, zz));
    for (const zz of [-1.1, 1.1])
      pieces.add(S, chalk, box(0.02, 0.22, 1.6, face * 5.5, 0.68, zz));
    // Stamp-ochre and chalk barrier stripes along both step noses, read from the approach.
    for (let i = 0, x0 = -5.95; x0 + 0.24 <= 5.97; i++, x0 += 0.26)
      pieces.add(
        null,
        i % 2 ? paint : ochre,
        stripe(x0, x0 + 0.13, 0.34, face * 3.0, 0.1, face),
      );
    for (let i = 0, x0 = -5.45; x0 + 0.24 <= 5.47; i++, x0 += 0.26)
      pieces.add(
        null,
        i % 2 ? paint : ochre,
        stripe(x0, x0 + 0.13, 0.86, face * 2.2, 0.1, face),
      );
    // A chalk queue line on the floor before and behind the ring, ending in ochre seals.
    pieces.add(S, chalk, box(3.2, 0.006, 0.09, 0, FLOOR + 0.003, face * 1.75));
    for (const side of [-1, 1]) {
      const sx = side * 1.86,
        sz = face * 1.75;
      const ring = new THREE.RingGeometry(0.11, 0.17, 24);
      ring.rotateX(-Math.PI / 2);
      ring.translate(sx, FLOOR + 0.004, sz);
      pieces.add(null, ochre, ring);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + Math.PI / 4;
        pieces.add(
          null,
          ochre,
          box(
            0.05,
            0.006,
            0.05,
            sx + Math.cos(a) * 0.2,
            FLOOR + 0.004,
            sz + Math.sin(a) * 0.2,
            a,
          ),
        );
      }
    }
    // A chalk border inlaid in the floor, and chalk nosing on both step edges.
    pieces.add(S, chalk, box(10.5, 0.006, 0.07, 0, FLOOR + 0.003, face * 1.98));
    pieces.add(S, chalk, box(0.07, 0.006, 3.96, face * 5.27, FLOOR + 0.003, 0));
    pieces.add(S, chalk, box(11.9, 0.006, 0.06, 0, LOW + 0.003, face * 2.94));
    pieces.add(S, chalk, box(10.9, 0.006, 0.05, 0, FLOOR + 0.003, face * 2.15));
  }
  await pause();
  // Buttresses: stacked dressed blocks with chalk panels, a stamp seal and two lamps.
  for (const side of [1, -1]) {
    for (const [m, g] of [
      [night, course(FLOOR, 2.86, 5.5, -1.3, 1.3, { bevel: 0.03 })],
      [basalt, course(2.86, 3.02, 5.46, -1.26, 1.26, { bevel: 0.015 })],
      [night, course(3.02, 3.48, 5.32, -1.12, 1.12, { bevel: 0.03 })],
      [chalk, course(3.48, 3.62, 5.2, -1.0, 1.0, { bevel: 0.02 })],
      [night, course(3.62, 3.86, 5.08, -0.9, 0.9, { bevel: 0.03 })],
    ])
      pieces.add(S, m, sided(g, side));
    pieces.add(S, chalk, box(0.02, 1.3, 1.9, side * 5.5, 1.92, 0));
    for (const face of [1, -1])
      pieces.add(S, chalk, box(0.5, 1.2, 0.02, side * 5.1, 1.95, face * 1.3));
    const seal = new THREE.TorusGeometry(0.3, 0.05, 6, 28);
    seal.rotateY(Math.PI / 2);
    seal.translate(side * 5.53, 1.92, 0);
    pieces.add(null, ochre, seal);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      pieces.add(
        null,
        ochre,
        box(
          0.04,
          0.1,
          0.1,
          side * 5.53,
          1.92 + Math.sin(a) * 0.36,
          Math.cos(a) * 0.36,
        ),
      );
    }
    pieces.add(null, ochre, disc(0.12, side * 5.52, 1.92, 0));
    for (const face of [1, -1]) {
      const lens = new THREE.CylinderGeometry(0.075, 0.09, 0.05, 16);
      lens.rotateX(Math.PI / 2);
      lens.translate(side * 5.05, 3.25, face * 1.14);
      pieces.add(null, lamp, lens);
    }
    await pause();
  }
  return pieces.build();
}

// --- the dawn isles: limestone grown up out of the isle's own rock --------------------------
async function isles(pause) {
  const pieces = new Pieces(pause);
  const lime = material(0xeadcc0, "stone", 0.9),
    rock = material(0x9b7658, "stone", 0.92),
    sage = material(0x7a8766, "foliage", 0.85, {
      side: THREE.DoubleSide,
      vertexColors: true,
    });
  sage.userData.shadow = false;
  const P = "floating_isle";
  // The skirt: the isle's rock rising in strata to carry the dais, lost into the dome.
  pieces.add(
    P,
    rock,
    slab(12.5, 6.5, -0.55, 0.05, {
      corner: 0.7,
      bevel: 0.1,
      erode: 0.07,
      jitter: 0.12,
      seed: 4,
      step: 0.8,
    }),
  );
  pieces.add(
    P,
    rock,
    slab(11.2, 5.3, -1.25, -0.5, {
      corner: 1.1,
      bevel: 0.12,
      erode: 0.1,
      jitter: 0.2,
      seed: 7,
      step: 0.9,
    }),
  );
  pieces.add(
    P,
    rock,
    slab(9.4, 4.0, -2.0, -1.2, {
      corner: 1.3,
      bevel: 0.12,
      erode: 0.12,
      jitter: 0.25,
      seed: 9,
      step: 0.9,
    }),
  );
  await pause();
  pieces.add(
    P,
    lime,
    slab(12, 6, 0.1, LOW, {
      corner: 0.55,
      bevel: 0.09,
      erode: 0.035,
      jitter: 0.04,
      seed: 11,
    }),
  );
  pieces.add(
    P,
    lime,
    slab(11, 4.4, LOW, FLOOR, {
      corner: 0.42,
      bevel: 0.08,
      erode: 0.03,
      jitter: 0.03,
      seed: 13,
    }),
  );
  // A strata line of the isle's rock along the dais's flank.
  pieces.add(
    P,
    rock,
    slab(12.06, 6.06, 0.17, 0.23, {
      corner: 0.56,
      bevel: 0.02,
      erode: 0.02,
      seed: 15,
      step: 0.8,
    }),
  );
  await pause();
  for (const side of [1, -1]) {
    for (const [m, g] of [
      [
        lime,
        course(FLOOR, 2.3, 5.5, -1.3, 1.3, {
          bevel: 0.12,
          erode: 0.035,
          seed: 21,
        }),
      ],
      [
        rock,
        course(2.3, 2.42, 5.44, -1.24, 1.24, {
          bevel: 0.04,
          erode: 0.02,
          seed: 23,
        }),
      ],
      [
        lime,
        course(2.42, 3.25, 5.4, -1.22, 1.22, {
          bevel: 0.16,
          erode: 0.04,
          seed: 25,
          lean: 0.12,
        }),
      ],
      [
        lime,
        course(3.25, 3.8, 5.05, -0.92, 0.92, {
          bevel: 0.16,
          erode: 0.03,
          seed: 27,
          lean: 0.18,
        }),
      ],
    ])
      pieces.add(P, m, sided(g, side));
    await pause();
  }
  // Loose limestone and clumps of sage where the tiers meet the isle.
  const rand = random(77);
  for (let i = 0; i < 22; i++) {
    const sx = i & 1 ? 1 : -1,
      sz = i & 2 ? 1 : -1;
    const x = sx * (5.6 + rand() * 0.8),
      z = sz * (2.2 + rand() * 1.1);
    const s = 0.06 + rand() * 0.12;
    const stone = lump(s * 1.3, s * 0.7, s, {
      seed: 30 + i,
      detail: 1,
      rough: 0.3,
    });
    stone.translate(
      x,
      (Math.abs(x) < 6 && Math.abs(z) < 3 ? LOW : 0.05) + s * 0.3,
      z,
    );
    pieces.add(P, lime, stone);
  }
  for (let i = 0; i < 18; i++) {
    const sx = i & 1 ? 1 : -1,
      sz = i & 2 ? 1 : -1;
    pieces.add(
      null,
      sage,
      tuft(
        0.22 + rand() * 0.2,
        sx * (5.55 + rand() * 0.42),
        LOW,
        sz * (2.3 + rand() * 0.65),
        60 + i,
      ),
    );
  }
  return pieces.build();
}

// --- the frozen reach: frost slate under snow, with ice under every lip ---------------------
async function frost(pause) {
  const pieces = new Pieces(pause);
  const slate = material(0x3d4654, "stone", 0.92),
    dark = material(0x333b47, "stone", 0.94),
    snow = material(0xe9f2f6, "snow", 0.86),
    ice = material(0xa9d2e3, "ice", 0.1, {
      flatShading: true,
      vertexColors: true,
    });
  ice.userData.frostStone = true;
  ice.userData.shadow = false;
  const B = "boulder_cluster";
  const layer = (w, d, y0, y1, seed, over = 0) =>
    slab(w + over, d + over, y0, y1, {
      corner: 0.1,
      bevel: 0.03,
      erode: 0.02,
      jitter: 0.035,
      seed,
      x: (random(seed)() - 0.5) * 0.06,
      turn: (random(seed + 1)() - 0.5) * 0.008,
    });
  pieces.add(B, dark, layer(12, 6, 0, 0.24, 3));
  pieces.add(B, slate, layer(12, 6, 0.24, LOW, 5, 0.1));
  await pause();
  pieces.add(B, dark, layer(11, 4.4, LOW, 0.68, 7));
  pieces.add(B, slate, layer(11, 4.4, 0.68, 0.86, 9, 0.06));
  pieces.add(B, slate, layer(11, 4.4, 0.86, FLOOR, 11, 0.02));
  await pause();
  const rand = random(404);
  const hang = (x, y, z, long) => {
    const length = long * (0.35 + rand() * 0.65),
      g = cone(0.012 + length * 0.09, length, 6);
    g.rotateZ((rand() - 0.5) * 0.12);
    g.translate(x, y, z);
    const c = g.attributes.position;
    const colors = new Float32Array(c.count * 3);
    for (let i = 0; i < c.count; i++) {
      const k = THREE.MathUtils.clamp((y - c.getY(i)) / length, 0, 1);
      colors[i * 3] = 0.55 + 0.45 * k;
      colors[i * 3 + 1] = 0.75 + 0.25 * k;
      colors[i * 3 + 2] = 0.9 + 0.1 * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    pieces.add(null, ice, g);
  };
  // Icicles under each overhanging lip: the lower tier's edge and the floor's edge.
  for (const face of [1, -1]) {
    for (let x = -5.8; x <= 5.8; x += 0.16 + rand() * 0.22)
      if (rand() < 0.7) hang(x, 0.245, face * 3.035, 0.2);
    for (let x = -5.3; x <= 5.3; x += 0.14 + rand() * 0.2)
      if (rand() < 0.65 && Math.abs(x) > 0.5) hang(x, 0.68, face * 2.215, 0.17);
    for (let z = -2.8; z <= 2.8; z += 0.18 + rand() * 0.22)
      if (rand() < 0.6) hang(face * 6.035, 0.245, z, 0.2);
  }
  await pause();
  // Buttresses: slate laid in courses, each course a little proud of the one below.
  for (const side of [1, -1]) {
    const courses = [
      [dark, FLOOR, 1.72, 5.5, 1.3],
      [slate, 1.72, 2.4, 5.56, 1.34],
      [dark, 2.4, 2.98, 5.48, 1.28],
      [slate, 2.98, 3.38, 5.54, 1.32],
      [dark, 3.38, 3.62, 5.22, 1.02],
      [slate, 3.62, 3.86, 5.1, 0.94],
    ];
    for (const [i, [m, y0, y1, outer, half]] of courses.entries()) {
      const g = course(y0, y1, outer, -half, half, {
        bevel: 0.03,
        erode: 0.02,
        seed: 40 + i,
      });
      pieces.add(B, m, sided(g, side));
      if (!(i % 2)) continue;
      for (let z = -half + 0.1; z < half - 0.05; z += 0.14 + rand() * 0.16)
        if (rand() < 0.6) hang(side * (outer + 0.015), y0 + 0.01, z, 0.42);
      for (const face of [1, -1])
        for (let x = 4.75; x < outer - 0.05; x += 0.15 + rand() * 0.15)
          if (rand() < 0.55)
            hang(side * x, y0 + 0.01, face * (half + 0.015), 0.34);
    }
    // Snow heaped on the buttress, its cap overhanging a little.
    pieces.add(
      null,
      snow,
      lump(0.5, 0.2, 1.05, {
        seed: 50 + side,
        detail: 3,
        rough: 0.14,
        smooth: true,
      }).translate(side * 4.75, 3.88, 0),
    );
    pieces.add(
      null,
      snow,
      lump(0.35, 0.14, 1.3, {
        seed: 52 + side,
        detail: 2,
        rough: 0.16,
        smooth: true,
      }).translate(side * 5.35, 3.4, 0),
    );
    await pause();
  }
  // Drifts banked into the corners and along the flanks, clear of the walkway. They have
  // no colliders, so none rises much above a boot.
  for (const [x, z, sx, sy, sz] of [
    [5.75, 2.65, 0.55, 0.14, 0.5],
    [-5.75, 2.65, 0.55, 0.14, 0.5],
    [5.75, -2.6, 0.6, 0.15, 0.55],
    [-5.75, -2.6, 0.6, 0.15, 0.55],
    [5.75, 0, 0.32, 0.1, 1.6],
    [-5.75, 0, 0.32, 0.1, 1.6],
  ])
    pieces.add(
      null,
      snow,
      lump(sx, sy, sz, {
        seed: x * 3 + z,
        detail: 2,
        rough: 0.14,
        smooth: true,
      }).translate(x, LOW + 0.01, z),
    );
  for (const [x, z, sx, sy, sz] of [
    [6.6, -2.4, 1.2, 0.24, 1.6],
    [-6.7, -2.2, 1.3, 0.26, 1.7],
    [6.4, 2.9, 0.9, 0.2, 0.8],
    [-6.5, 3.0, 0.9, 0.2, 0.9],
    [5.2, -3.5, 1.3, 0.2, 0.55],
    [-5.0, -3.55, 1.2, 0.18, 0.5],
  ])
    pieces.add(
      null,
      snow,
      lump(sx, sy, sz, {
        seed: x + z * 7,
        detail: 3,
        rough: 0.12,
        smooth: true,
      }).translate(x, 0, z),
    );
  // Meltwater frozen in sheets at the dais's foot and glazing one corner of the riser.
  for (const [x, z, r] of [
    [6.9, 1.2, 0.9],
    [-7.1, 0.4, 0.7],
    [3.2, 3.9, 0.8],
  ])
    pieces.add(
      null,
      ice,
      lump(r, 0.04, r * 0.7, {
        seed: r * 10,
        detail: 1,
        rough: 0.35,
      }).translate(x, 0, z),
    );
  pieces.add(
    null,
    ice,
    slab(1.6, 0.05, 0.02, 0.4, {
      corner: 0.02,
      bevel: 0.01,
      erode: 0.015,
      seed: 61,
      x: -4.6,
      z: 3.03,
    }),
  );
  return pieces.build();
}

// --- the Wildwood: old mossy stone gripped by roots, with ferns and fallen leaves ------------
async function forest(pause) {
  const pieces = new Pieces(pause);
  const stone = material(0x8f8d7c, "stone", 0.9),
    joint = material(0x3e3a30, "stone", 0.96),
    moss = material(0x35522a, "moss", 1, { vertexColors: true }),
    bark = material(0x5a4030, "timber", 0.95),
    leaves = material(0xffffff, "litter", 0.9, {
      side: THREE.DoubleSide,
      vertexColors: true,
    }),
    fronds = material(0x4f7a3a, "fronds", 0.85, {
      side: THREE.DoubleSide,
      vertexColors: true,
    });
  leaves.userData.shadow = false;
  const C = "hill_castle";
  pieces.add(
    C,
    joint,
    slab(11.9, 5.9, 0, LOW - 0.02, {
      corner: 0.2,
      bevel: 0.04,
      erode: 0.03,
      seed: 2,
      step: 0.9,
    }),
  );
  pieces.add(
    C,
    joint,
    slab(10.9, 4.3, LOW - 0.04, FLOOR - 0.06, {
      corner: 0.1,
      bevel: 0.02,
      seed: 4,
      step: 0.9,
    }),
  );
  await pause();
  const rand = random(505);
  // The lower course, mostly under the forest floor, in big worn blocks.
  for (const face of [1, -1]) {
    for (let i = 0; i < 5; i++)
      pieces.add(
        C,
        stone,
        slab(2.34, 0.92, 0.06, LOW, {
          corner: 0.12,
          bevel: 0.06,
          erode: 0.03,
          jitter: 0.02,
          seed: 10 + i * 2 + face,
          x: -4.8 + i * 2.4,
          z: face * 2.53,
        }),
      );
    pieces.add(
      C,
      stone,
      slab(0.92, 4.1, 0.06, LOW, {
        corner: 0.12,
        bevel: 0.06,
        erode: 0.03,
        seed: 30 + face,
        x: face * 5.53,
        z: 0,
      }),
    );
    await pause();
  }
  // The floor: large flags with worn rims, hand-laid, each a hair off level.
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 2; j++)
      pieces.add(
        C,
        stone,
        slab(2.16, 2.16, LOW - 0.02, FLOOR - rand() * 0.008, {
          corner: 0.1,
          bevel: 0.05,
          erode: 0.025,
          jitter: 0.015,
          seed: 40 + i * 3 + j,
          x: -4.4 + i * 2.2,
          z: -1.1 + j * 2.2,
          turn: (rand() - 0.5) * 0.012,
        }),
      );
    await pause();
  }
  // Buttresses: three worn courses and a cap.
  for (const side of [1, -1]) {
    for (const g of [
      course(FLOOR, 2.12, 5.5, -1.3, 1.3, {
        bevel: 0.07,
        erode: 0.03,
        seed: 60,
      }),
      course(2.14, 3.02, 5.47, -1.28, 1.28, {
        bevel: 0.07,
        erode: 0.03,
        seed: 61,
      }),
      course(3.04, 3.44, 5.36, -1.18, 1.18, {
        bevel: 0.06,
        erode: 0.03,
        seed: 62,
      }),
      course(3.46, 3.84, 5.1, -0.94, 0.94, {
        bevel: 0.08,
        erode: 0.03,
        seed: 63,
      }),
    ])
      pieces.add(C, stone, sided(g, side));
    await pause();
  }
  // Moss: deep cushions on the buttress tops and in the corners, thin where feet go.
  const pad = (x, y, z, w, d, h, seed) => {
    const g = prepared(
      lump(w, h, d, { seed, detail: 2, rough: 0.42, smooth: true }),
    );
    g.translate(x, y, z);
    const c = g.attributes.color,
      p = g.attributes.position;
    for (let i = 0; i < c.count; i++) {
      const k = THREE.MathUtils.clamp(
        (p.getY(i) - y) / Math.max(h, 0.01),
        0,
        1,
      );
      const lit =
        0.55 +
        0.45 * k +
        (noise(p.getX(i) * 7, 0, p.getZ(i) * 7, seed) - 0.5) * 0.4;
      c.setXYZ(i, lit * (0.92 + 0.14 * k), lit * (1.0 + 0.1 * k), lit * 0.82);
    }
    pieces.add(null, moss, g);
  };
  for (const side of [1, -1]) {
    pad(side * 4.85, 3.8, 0.05, 0.5, 1.0, 0.24, 70 + side);
    pad(side * 5.25, 3.4, -0.45, 0.32, 0.62, 0.16, 72 + side);
    pad(side * 5.4, 3.0, 0.75, 0.22, 0.45, 0.14, 74 + side);
    for (const face of [1, -1]) {
      pad(
        side * 5.3,
        FLOOR,
        face * 1.75,
        0.3,
        0.42,
        0.05,
        76 + side + face * 5,
      );
      pad(
        side * 5.95,
        LOW,
        face * (2.45 + rand() * 0.3),
        0.5,
        0.6,
        0.12,
        90 + side + face * 3,
      );
    }
    await pause();
  }
  for (const face of [1, -1]) {
    for (let k = 0; k < 5; k++) {
      const x = (k % 2 ? -1 : 1) * (3.2 + rand() * 2.2);
      pad(
        x,
        FLOOR - 0.02,
        face * 2.18,
        0.42 + rand() * 0.3,
        0.16,
        0.05,
        100 + k + face * 13,
      );
    }
    await pause();
  }
  // Roots rise out of the forest floor at the foot of the stone, which here is the lower
  // tier's top, and stay pressed against it as they climb and cross.
  const root = (points, r0, r1) =>
    pieces.add(
      "wild_tree",
      bark,
      tube(
        points.map((p) => new THREE.Vector3(...p)),
        r0,
        r1,
      ),
    );
  for (const s of [1, -1]) {
    root(
      [
        [s * 6.5, 0.42, -1.05],
        [s * 6.05, 0.58, -0.92],
        [s * 5.7, 0.84, -0.86],
        [s * 5.66, 1.35, -0.74],
        [s * 5.66, 2.05, -0.42],
        [s * 5.64, 2.72, -0.06],
        [s * 5.55, 3.2, 0.3],
        [s * 5.38, 3.52, 0.6],
      ],
      0.2,
      0.03,
    );
    root(
      [
        [s * 6.6, 0.42, 1.65],
        [s * 6.12, 0.52, 1.25],
        [s * 5.72, 0.72, 0.92],
        [s * 5.63, 1.22, 0.6],
        [s * 5.62, 1.66, 0.1],
        [s * 5.63, 2.12, -0.55],
        [s * 5.6, 2.42, -1.0],
      ],
      0.15,
      0.03,
    );
    root(
      [
        [s * 6.35, 0.42, 2.95],
        [s * 5.95, 0.55, 2.55],
        [s * 5.62, 0.78, 2.28],
        [s * 5.38, 1.12, 1.8],
        [s * 5.17, 1.15, 1.47],
        [s * 5.06, 1.62, 1.42],
        [s * 5.0, 2.3, 1.41],
        [s * 4.95, 2.9, 1.39],
      ],
      0.16,
      0.03,
    );
    root(
      [
        [s * 6.3, 0.42, -2.9],
        [s * 5.9, 0.56, -2.55],
        [s * 5.6, 0.8, -2.3],
        [s * 5.32, 1.12, -1.85],
        [s * 5.12, 1.15, -1.47],
        [s * 5.04, 1.7, -1.42],
        [s * 4.98, 2.4, -1.41],
      ],
      0.15,
      0.03,
    );
    root(
      [
        [s * 7.1, 0.38, 0.2],
        [s * 6.5, 0.46, 0.15],
        [s * 6.08, 0.6, 0.12],
        [s * 5.72, 0.86, 0.1],
      ],
      0.17,
      0.06,
    );
    await pause();
  }
  // Ferns at the corners, where the roots go down into the floor.
  for (const [x, z, size, seed] of [
    [6.45, 3.05, 0.75, 1],
    [-6.5, 2.95, 0.68, 2],
    [6.6, -2.95, 0.8, 3],
    [-6.7, -2.8, 0.74, 4],
    [6.3, 1.1, 0.5, 5],
    [-6.25, -0.9, 0.48, 6],
    [5.85, -2.55, 0.42, 7],
    [-5.9, 2.5, 0.4, 8],
  ])
    pieces.add(null, fronds, fern(x, LOW - 0.02, z, size, seed));
  // Fallen leaves in the corners and along the foot of the risers.
  const colors = [
    [0.55, 0.36, 0.2],
    [0.66, 0.48, 0.24],
    [0.42, 0.46, 0.22],
    [0.36, 0.25, 0.16],
  ];
  const position = [],
    color = [];
  for (let i = 0; i < 160; i++) {
    let x, z, y;
    if (i < 90) {
      x = (rand() - 0.5) * 13.4;
      z = (rand() < 0.5 ? -1 : 1) * (2.3 + rand() * 1.0);
      y = Math.abs(z) < 3 && Math.abs(x) < 6 ? LOW : 0.02;
    } else {
      x = (rand() < 0.5 ? -1 : 1) * (4.4 + rand() * 1.0);
      z = (rand() - 0.5) * 4.2;
      y = FLOOR;
      if (Math.abs(z) < 1.36) continue;
    }
    const s = 0.05 + rand() * 0.06,
      a = rand() * TAU,
      ca = Math.cos(a),
      sa = Math.sin(a),
      tilt = (rand() - 0.5) * 0.02;
    const corner = (u, v) => [
      x + u * ca - v * sa,
      y + 0.006 + u * tilt,
      z + u * sa + v * ca,
    ];
    const q = [
      corner(0, -s),
      corner(s * 0.45, 0),
      corner(0, s),
      corner(-s * 0.45, 0),
    ];
    const tone = colors[Math.floor(rand() * colors.length)];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      position.push(...q[k]);
      color.push(...tone);
    }
  }
  const litter = new THREE.BufferGeometry();
  litter.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  litter.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  litter.computeVertexNormals();
  pieces.add(null, leaves, litter);
  return pieces.build();
}

// --- the Drowned Archive: pale stone gone soft under the sea, green bronze and its growth ----
async function sea(pause) {
  const pieces = new Pieces(pause);
  const pale = material(0xc8c3ae, "stone", 0.92),
    worn = material(0xa9a58f, "stone", 0.95),
    bronze = material(0x4f8a72, "metal", 0.6, { metalness: 0.3 }),
    shell = material(0xd9d2bf, "shell", 0.9, { vertexColors: true }),
    reef = material(0xffffff, "reef", 0.85, { vertexColors: true }),
    sand = material(0xd2c39a, "sand", 0.95);
  const R = "ruin_tower";
  // Both sea doors stand on a causeway exactly as wide as the lower tier, whose top their floor
  // meets: the causeway is the footing, and a lower tier would only break through its sides.
  pieces.add(
    R,
    pale,
    slab(11, 4.4, LOW, FLOOR, {
      corner: 0.22,
      bevel: 0.06,
      erode: 0.035,
      jitter: 0.03,
      seed: 5,
    }),
  );
  await pause();
  // A green-bronze frame let into the floor, with plates at its corners.
  for (const face of [1, -1]) {
    pieces.add(
      null,
      bronze,
      box(10.2, 0.012, 0.09, 0, FLOOR + 0.004, face * 1.92),
    );
    pieces.add(
      null,
      bronze,
      box(0.09, 0.012, 3.84, face * 5.1, FLOOR + 0.004, 0),
    );
    for (const side of [1, -1])
      pieces.add(
        null,
        bronze,
        box(
          0.34,
          0.016,
          0.34,
          side * 5.1,
          FLOOR + 0.006,
          face * 1.92,
          Math.PI / 4,
        ),
      );
  }
  const rand = random(606);
  const up = new THREE.Vector3(0, 1, 0),
    out = new THREE.Vector3(),
    turn = new THREE.Quaternion();
  const crust = (x, y, z, r, nx, nz) => {
    const h = r * (0.7 + rand() * 0.5);
    const g = new THREE.CylinderGeometry(r * 0.45, r, h, 6, 1);
    g.translate(0, h / 2, 0);
    // Each barnacle grows out of the face it sits on.
    g.applyQuaternion(
      turn.setFromUnitVectors(
        up,
        out.set(nx, nx || nz ? 0.25 : 1, nz).normalize(),
      ),
    );
    g.translate(x, y, z);
    const shade = 0.75 + rand() * 0.3;
    pieces.add(null, shell, tint(g, [shade, shade * 0.97, shade * 0.9]));
  };
  // Buttresses: soft pale blocks banded in bronze, crusted below and grown over above.
  for (const side of [1, -1]) {
    for (const [m, g] of [
      [
        pale,
        course(FLOOR, 2.2, 5.5, -1.3, 1.3, {
          bevel: 0.09,
          erode: 0.045,
          seed: 70,
        }),
      ],
      [
        worn,
        course(2.2, 3.1, 5.46, -1.28, 1.28, {
          bevel: 0.09,
          erode: 0.05,
          seed: 71,
        }),
      ],
      [
        pale,
        course(3.1, 3.5, 5.3, -1.12, 1.12, {
          bevel: 0.08,
          erode: 0.04,
          seed: 72,
        }),
      ],
      [
        worn,
        course(3.5, 3.82, 5.08, -0.92, 0.92, {
          bevel: 0.08,
          erode: 0.04,
          seed: 73,
        }),
      ],
    ])
      pieces.add(R, m, sided(g, side));
    for (const y of [1.9, 2.88]) {
      pieces.add(null, bronze, box(0.03, 0.09, 2.64, side * 5.51, y, 0));
      for (const face of [1, -1])
        pieces.add(
          null,
          bronze,
          box(0.85, 0.09, 0.03, side * 5.1, y, face * 1.31),
        );
    }
    pieces.add(null, bronze, box(0.62, 0.03, 1.6, side * 4.88, 3.84, 0));
    for (let i = 0; i < 70; i++) {
      const k = rand();
      const y = FLOOR + 0.05 + rand() ** 1.8 * 1.9;
      if (k < 0.45)
        crust(
          side * 5.5,
          y,
          (rand() - 0.5) * 2.5,
          0.014 + rand() * 0.028,
          side,
          0,
        );
      else {
        const face = k < 0.72 ? 1 : -1;
        crust(
          side * (4.75 + rand() * 0.72),
          y,
          face * 1.3,
          0.014 + rand() * 0.028,
          0,
          face,
        );
      }
    }
    for (let i = 0; i < 20; i++)
      crust(
        side * (4.8 + rand() * 0.6),
        FLOOR,
        (rand() < 0.5 ? -1 : 1) * (1.35 + rand() * 0.7),
        0.016 + rand() * 0.03,
        0,
        0,
      );
    await pause();
  }
  // Reef growth: rounded heads, tube sponges and branched fans in the reef's colours.
  const corals = [
    [0.95, 0.4, 0.48],
    [0.98, 0.55, 0.24],
    [0.62, 0.34, 0.84],
    [0.95, 0.78, 0.32],
    [0.32, 0.72, 0.62],
  ];
  const head = (x, y, z, r, seed) =>
    pieces.add(
      null,
      reef,
      tint(
        lump(r, r * 0.62, r * 0.9, {
          seed,
          detail: 2,
          rough: 0.35,
          smooth: true,
        }).translate(x, y, z),
        corals[seed % corals.length],
      ),
    );
  const sponge = (x, y, z, seed) => {
    const r = random(seed);
    for (let i = 0; i < 5; i++) {
      const h = 0.12 + r() * 0.22,
        w = 0.035 + r() * 0.03;
      const g = new THREE.CylinderGeometry(w, w * 0.8, h, 8, 1);
      g.translate(x + (r() - 0.5) * 0.16, y + h / 2, z + (r() - 0.5) * 0.16);
      pieces.add(null, reef, tint(g, corals[(seed + 3) % corals.length]));
    }
  };
  const fan = (x, y, z, size, seed, yaw) => {
    const r = random(seed);
    const axis = new THREE.Vector3(0, 0, 1);
    const grow = (from, dir, length, depth) => {
      const to = from.clone().addScaledVector(dir, length);
      const g = new THREE.CylinderGeometry(
        0.012 * (depth + 1),
        0.016 * (depth + 1),
        length,
        5,
      );
      g.translate(0, length / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      g.translate(from.x, from.y, from.z);
      g.rotateY(yaw);
      g.translate(x, y, z);
      pieces.add(null, reef, tint(g, corals[(seed + 1) % corals.length]));
      if (depth === 0) return;
      for (const k of [-1, 1])
        grow(
          to,
          dir
            .clone()
            .applyAxisAngle(axis, k * (0.35 + r() * 0.3))
            .normalize(),
          length * 0.72,
          depth - 1,
        );
    };
    grow(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), size * 0.38, 3);
  };
  for (const side of [1, -1]) {
    head(side * 4.95, 3.86, 0.42, 0.22, 3 + (side > 0 ? 0 : 2));
    head(side * 4.7, 3.86, -0.5, 0.16, 4);
    head(side * 4.62, 3.86, 0.05, 0.13, 6);
    sponge(side * 4.98, 3.84, -0.62, 41 + side);
    sponge(side * 5.3, 3.46, -0.85, 43 + side);
    fan(side * 5.08, 3.84, -0.1, 0.9, 11 + side, side * 0.3);
    // Floor growth hugs the buttress foot and stays low, since nothing here collides.
    head(side * 5.2, FLOOR, 1.45, 0.17, 1);
    head(side * 5.3, FLOOR, -1.48, 0.2, 2);
    fan(side * 4.95, FLOOR, -1.42, 0.38, 21 + side, 1.2);
    head(side * 5.42, FLOOR, 1.62, 0.1, 0);
    head(side * 5.38, 3.48, 0.95, 0.12, 4);
    // Sand settled into the corners of the floor beside the buttress.
    for (const face of [1, -1])
      pieces.add(
        null,
        sand,
        lump(0.55, 0.05, 0.45, {
          seed: 80 + side + face * 3,
          detail: 2,
          rough: 0.2,
          smooth: true,
        }).translate(side * 4.85, FLOOR - 0.02, face * 1.75),
      );
    await pause();
  }
  return pieces.build();
}

const BASES = { checkpoint, isles, frost, forest, sea };
const templates = new Map();

// Steps of worn masonry climbing to a door's floor, in the forest base's stone.
export async function stoneSteps(steps, assets = null) {
  const pieces = new Pieces(async () => {
    await assets?.yieldWork?.();
  });
  const stone = material(0x8f8d7c, "stone", 0.9);
  for (const [i, { x, z, width, depth, low, top }] of steps.entries())
    pieces.add(
      "hill_castle",
      stone,
      slab(width, depth, low, top, {
        corner: 0.14,
        bevel: 0.05,
        erode: 0.03,
        jitter: 0.02,
        seed: 70 + i * 3,
        step: 0.9,
        x,
        z,
      }),
    );
  return pieces.build();
}

// Replaces a far_gate model's court dais with the named world's base, in place. Each style
// is built once, yielding to `assets.yieldWork` between pieces, and every later door of that
// style shares its geometry and materials. The court keeps the asset's own dais.
export async function dressGate(model, kind = "court", assets = null) {
  const old = model?.userData.base;
  const build = BASES[kind];
  if (!old?.parent || !build) return model;
  if (!templates.has(kind)) {
    const pending = build(async () => {
      await assets?.yieldWork?.();
    });
    templates.set(kind, pending);
    pending.catch(() => templates.delete(kind));
  }
  const base = (await templates.get(kind)).clone();
  base.name = `${kind} base`;
  base.position.copy(old.position);
  old.parent.add(base);
  old.removeFromParent();
  model.userData.base = base;
  return model;
}
