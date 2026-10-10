import * as THREE from "three";

// Shape on top of colour for the amber warnings painted on the ground: triangles pointing into
// a ring, stripes across a strip. They are drawn in the warning's own material, a few
// millimetres above it, so they share its program, its opacity and its colour, and appear
// brighter where they overlap it.
const LIFT = 0.004;

function flat(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

// `count` triangles between radii `inner` (their tips) and `outer` (their bases).
export function warningTriangles(ring, inner, outer, count = 6, half = 0.14) {
  const p = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const ux = Math.cos(a),
      uz = Math.sin(a);
    const tip = [ux * inner, LIFT, uz * inner];
    const left = [ux * outer - uz * half, LIFT, uz * outer + ux * half];
    const right = [ux * outer + uz * half, LIFT, uz * outer - ux * half];
    p.push(...tip, ...left, ...right);
  }
  const mesh = new THREE.Mesh(flat(p), ring.material);
  mesh.name = "warningTriangles";
  ring.add(mesh);
  return mesh;
}

// Slanted stripes across a `width` by `depth` strip lying flat, centred on its origin.
export function warningStripes(strip, width, depth, every = 0.9, band = 0.32) {
  const p = [];
  const slant = depth * 0.6;
  for (let x = -width / 2 + every / 2; x < width / 2 - band; x += every) {
    const x0 = x,
      x1 = Math.min(x + band, width / 2);
    const back = -depth / 2,
      front = depth / 2;
    const a = [x0 - slant / 2, LIFT, front],
      b = [x1 - slant / 2, LIFT, front],
      c = [x1 + slant / 2, LIFT, back],
      d = [x0 + slant / 2, LIFT, back];
    for (const q of [a, b, c, d])
      q[0] = Math.max(-width / 2, Math.min(width / 2, q[0]));
    p.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const mesh = new THREE.Mesh(flat(p), strip.material);
  mesh.name = "warningStripes";
  strip.add(mesh);
  return mesh;
}
