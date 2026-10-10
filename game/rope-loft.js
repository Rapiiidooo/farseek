import * as THREE from "three";

// Tubes on rotation-minimising frames, written into preallocated arrays so a swaying rope is
// rebuilt every frame without allocating; one geometry holds a rope and its strands.
export function tubeSet(specs, { dynamic = false } = {}) {
  let count = 0;
  const parts = specs.map(({ rings, sides }) => {
    const part = { start: count, rings, sides };
    count += rings * sides;
    return part;
  });
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const normal = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  if (dynamic) {
    position.setUsage(THREE.DynamicDrawUsage);
    normal.setUsage(THREE.DynamicDrawUsage);
  }
  const uv = new Float32Array(count * 2);
  const color = new Float32Array(count * 3).fill(1);
  const index = [];
  for (const { start, rings, sides } of parts)
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < sides; j++) {
        const k = start + i * sides + j;
        uv[k * 2] = (j / sides) * 0.25;
        uv[k * 2 + 1] = i * 0.1;
        if (i === rings - 1) continue;
        const a = start + i * sides + j,
          b = start + i * sides + ((j + 1) % sides),
          c = start + (i + 1) * sides + ((j + 1) % sides),
          d = start + (i + 1) * sides + j;
        index.push(a, b, c, a, c, d);
      }
  geometry.setAttribute("position", position);
  geometry.setAttribute("normal", normal);
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.setIndex(index);
  return { geometry, parts };
}

const T = new Float32Array(3),
  N = new Float32Array(3),
  B = new Float32Array(3),
  P = new Float32Array(3);

// Lofts `points` (flat [x, y, z, ...], `rings` of them) into the arrays at vertex `start`.
// `n0` seeds the first frame's normal; `radius(i)` gives each ring's radius.
export function loft(
  position,
  normal,
  start,
  points,
  rings,
  sides,
  radius,
  n0 = null,
) {
  const p = position.array,
    q = normal.array;
  let nx = 0,
    ny = 0,
    nz = 0;
  for (let i = 0; i < rings; i++) {
    const a = Math.max(0, i - 1),
      b = Math.min(rings - 1, i + 1);
    T[0] = points[b * 3] - points[a * 3];
    T[1] = points[b * 3 + 1] - points[a * 3 + 1];
    T[2] = points[b * 3 + 2] - points[a * 3 + 2];
    const tl = Math.hypot(T[0], T[1], T[2]) || 1;
    T[0] /= tl;
    T[1] /= tl;
    T[2] /= tl;
    if (i === 0) {
      if (n0) {
        nx = n0[0];
        ny = n0[1];
        nz = n0[2];
      } else if (Math.abs(T[1]) < 0.9) {
        nx = -T[2];
        ny = 0;
        nz = T[0];
      } else {
        nx = 1;
        ny = 0;
        nz = 0;
      }
    }
    // Carry the previous normal onto this tangent's plane.
    const d = nx * T[0] + ny * T[1] + nz * T[2];
    nx -= T[0] * d;
    ny -= T[1] * d;
    nz -= T[2] * d;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    N[0] = nx;
    N[1] = ny;
    N[2] = nz;
    B[0] = T[1] * nz - T[2] * ny;
    B[1] = T[2] * nx - T[0] * nz;
    B[2] = T[0] * ny - T[1] * nx;
    P[0] = points[i * 3];
    P[1] = points[i * 3 + 1];
    P[2] = points[i * 3 + 2];
    const r = radius(i);
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const ox = N[0] * c + B[0] * s,
        oy = N[1] * c + B[1] * s,
        oz = N[2] * c + B[2] * s;
      const k = (start + i * sides + j) * 3;
      p[k] = P[0] + ox * r;
      p[k + 1] = P[1] + oy * r;
      p[k + 2] = P[2] + oz * r;
      q[k] = ox;
      q[k + 1] = oy;
      q[k + 2] = oz;
    }
  }
  return [nx, ny, nz];
}
