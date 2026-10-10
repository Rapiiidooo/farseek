import * as THREE from "three";

// The canyon wall around the court, swept as one continuous skin along the court's
// boundary instead of a row of boxes: a weathered face worn back by strata and noise, an
// irregular skyline, and a rounded rim that runs back into the rock. The box colliders stay
// where they were; the skin only ever recedes behind their faces, except for shallow
// ledges, so nothing the explorer touches changes.

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function noise3(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const u = smooth01(x - xi),
    v = smooth01(y - yi),
    w = smooth01(z - zi);
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function smooth01(t) {
  return t * t * (3 - 2 * t);
}

function fbm(x, y, z) {
  return (
    noise3(x, y, z) * 0.55 +
    noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 +
    noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15
  );
}

// A closed loop through the corners with each corner rounded, sampled every `step` metres.
// Walking the corners clockwise seen from above puts the rock on the left of travel.
function sampleLoop(corners, radius, step) {
  const pts = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const a = corners[(i - 1 + n) % n],
      b = corners[i],
      c = corners[(i + 1) % n];
    const d0 = norm([b[0] - a[0], b[1] - a[1]]),
      d1 = norm([c[0] - b[0], c[1] - b[1]]);
    const start = [b[0] - d0[0] * radius, b[1] - d0[1] * radius],
      end = [b[0] + d1[0] * radius, b[1] + d1[1] * radius];
    // Quadratic fillet through the corner.
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push([
        (1 - t) * (1 - t) * start[0] + 2 * (1 - t) * t * b[0] + t * t * end[0],
        (1 - t) * (1 - t) * start[1] + 2 * (1 - t) * t * b[1] + t * t * end[1],
      ]);
    }
    const next = corners[(i + 1) % n];
    const runEnd = [next[0] - d1[0] * radius, next[1] - d1[1] * radius];
    const len = Math.hypot(runEnd[0] - end[0], runEnd[1] - end[1]);
    const count = Math.max(1, Math.round(len / step));
    for (let k = 1; k < count; k++)
      pts.push([
        end[0] + ((runEnd[0] - end[0]) * k) / count,
        end[1] + ((runEnd[1] - end[1]) * k) / count,
      ]);
  }
  return pts;
}

function norm([x, y]) {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

export function buildCliffs(
  material,
  { corners, top, base = -10, step = 0.7 },
) {
  return skin(sampleLoop(corners, 1.4, step), true, material, top, base);
}

// An open ridge along a polyline, rock on the left of travel: the second world's valley sides.
export function buildRidge(material, { points, top, base = -10, step = 0.7 }) {
  const line = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    const n = Math.max(
      1,
      Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step),
    );
    for (let k = 0; k < n; k++)
      line.push([
        a[0] + ((b[0] - a[0]) * k) / n,
        a[1] + ((b[1] - a[1]) * k) / n,
      ]);
  }
  line.push(points[points.length - 1]);
  return skin(line, false, material, top, base);
}

function skin(loop, closed, material, top, base) {
  const cols = loop.length;
  // Along-track distance, for texture coordinates.
  const along = [0];
  for (let i = 1; i <= cols; i++) {
    const a = loop[i - 1],
      b = loop[i % cols];
    along.push(along[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const columns = loop.map((p, i) => {
    const a = closed ? loop[(i - 1 + cols) % cols] : loop[Math.max(0, i - 1)],
      b = closed ? loop[(i + 1) % cols] : loop[Math.min(cols - 1, i + 1)];
    const t = norm([b[0] - a[0], b[1] - a[1]]);
    const out = [t[1], -t[0]]; // left of travel: into the rock
    const h = top(p[0], p[1]);
    return { p, out, h };
  });
  // Profile: the face from the base to the brow, then the rim running back into the rock.
  const profile = (h) => {
    const list = [];
    const faceSteps = 30;
    for (let k = 0; k <= faceSteps; k++)
      list.push({
        depth: 0,
        y: base + ((h - base) * k) / faceSteps,
        face: true,
      });
    list.push({ depth: 0.6, y: h + 0.45, face: false });
    list.push({ depth: 1.8, y: h + 0.8, face: false });
    list.push({ depth: 4, y: h + 0.6, face: false });
    list.push({ depth: 8, y: h + 1.2, face: false });
    return list;
  };
  const P = columns.map(({ p, out, h }) =>
    profile(h).map(({ depth, y, face }) => {
      let d = depth;
      let yy = y;
      if (face) {
        // Worn by broad weathering and horizontal strata, but held within a hand's width
        // of the collider face (-0.12 to +0.45 m): the explorer's body stops 0.19 m short
        // of that face, so the rock is touched where it is drawn and never passed through.
        const broad = fbm(p[0] * 0.18, y * 0.22, p[1] * 0.18);
        const strata = Math.pow(Math.abs(Math.sin(y * 1.45 + broad * 2.6)), 5);
        d += Math.min(
          0.45,
          Math.max(-0.12, (broad - 0.45) * 0.9 + strata * 0.22),
        );
      } else {
        yy += (fbm(p[0] * 0.3, depth, p[1] * 0.3) - 0.5) * 1.6;
        d += (fbm(p[1] * 0.25, depth * 0.5, p[0] * 0.25) - 0.5) * 1.2;
      }
      return [p[0] + out[0] * d, yy, p[1] + out[1] * d];
    }),
  );
  const normalGrid = P.map((column, i) =>
    column.map((_, row) => {
      const a = P[closed ? (i - 1 + cols) % cols : Math.max(0, i - 1)][row];
      const b = P[closed ? (i + 1) % cols : Math.min(cols - 1, i + 1)][row];
      const lower = column[Math.max(0, row - 1)];
      const upper = column[Math.min(column.length - 1, row + 1)];
      return new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
        .cross(
          new THREE.Vector3(
            upper[0] - lower[0],
            upper[1] - lower[1],
            upper[2] - lower[2],
          ),
        )
        .normalize()
        .toArray();
    }),
  );
  const profileDistances = P.map((column) => {
    const distances = [column[0][1]];
    for (let row = 1; row < column.length; row++) {
      const a = column[row - 1],
        b = column[row];
      distances.push(
        distances[row - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      );
    }
    return distances;
  });
  const pos = [],
    uvs = [],
    normals = [];
  const tile = material.userData.tileMeters || 2;
  for (let i = 0; i < (closed ? cols : cols - 1); i++) {
    const A = P[i],
      B = P[(i + 1) % cols];
    for (let k = 0; k < A.length - 1; k++) {
      const a0 = A[k],
        a1 = A[k + 1],
        b0 = B[k],
        b1 = B[k + 1];
      const u0 = along[i] / tile,
        u1 = along[i + 1] / tile;
      const N = normalGrid[i],
        M = normalGrid[(i + 1) % cols];
      const vA = profileDistances[i],
        vB = profileDistances[(i + 1) % cols];
      for (const [p, u, v, n] of [
        [a0, u0, vA[k] / tile, N[k]],
        [b0, u1, vB[k] / tile, M[k]],
        [b1, u1, vB[k + 1] / tile, M[k + 1]],
        [a0, u0, vA[k] / tile, N[k]],
        [b1, u1, vB[k + 1] / tile, M[k + 1]],
        [a1, u0, vA[k + 1] / tile, N[k + 1]],
      ]) {
        pos.push(p[0], p[1], p[2]);
        uvs.push(u, v);
        normals.push(...n);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
