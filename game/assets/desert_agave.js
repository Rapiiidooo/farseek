import { refineNature } from "../nature-detail.js";

// desert_agave, candidate C (hand-built lofts): eighteen leaves on a golden-angle
// spiral, each lofted through a channelled, keeled section along a centreline that
// arcs outward and curls down, tapering to a point; the last fifth of every leaf is a
// separate pale mesh. The dry stalk is a lofted cane with three short branches of seed
// pods, standing out of a low heightfield mound of sand. 1.0 m tall overall.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color, roughness, name) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    m.name = name;
    return m;
  };
  const SAGE = mat(0x7a8766, 0.8, 'foliage');
  const TIP = mat(0xb5b18e, 0.85, 'foliage');
  const STRAW = mat(0xb49a6a, 0.9, 'timber');
  const POD = mat(0x8a6a48, 0.9, 'timber');
  const DUNE = mat(0xd4a373, 0.98, 'ground');

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0), Y = V(0, 1, 0);
  let seed = 53;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() * 2 - 1) * a;

  const newell = (r) => {
    const n = V(0, 0, 0);
    for (let j = 0; j < r.length; j++) {
      const a = r[j], b = r[(j + 1) % r.length];
      n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
    }
    return n;
  };
  const centre = (r) => r.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / r.length);
  // Skin rings into flat-shaded triangles; appends to the given arrays so many
  // leaves can share one mesh.
  const loft = (rings, pos, uv) => {
    const N = rings[0].length, M = rings.length;
    const dir = centre(rings[M - 1]).sub(centre(rings[0]));
    const flip = newell(rings[0]).dot(dir) < 0;
    const tri = (a, b, c, ta, tb, tc) => {
      if (flip) { [b, c] = [c, b]; [tb, tc] = [tc, tb]; }
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      uv.push(...ta, ...tb, ...tc);
    };
    for (let i = 0; i < M - 1; i++) {
      for (let j = 0; j < N; j++) {
        const k = (j + 1) % N;
        const u0 = j / N, u1 = (j + 1) / N, v0 = i / (M - 1), v1 = (i + 1) / (M - 1);
        tri(rings[i][j], rings[i][k], rings[i + 1][k], [u0, v0], [u1, v0], [u1, v1]);
        tri(rings[i][j], rings[i + 1][k], rings[i + 1][j], [u0, v0], [u1, v1], [u0, v1]);
      }
    }
    const cap = (r, out) => {
      const n = newell(r);
      if (n.lengthSq() < 1e-12) return;
      n.normalize();
      const U = V(0, 0, 0).crossVectors(n, Math.abs(n.y) < 0.9 ? Y : X).normalize();
      const W = V(0, 0, 0).crossVectors(n, U);
      const p2 = r.map((p) => new THREE.Vector2(p.dot(U), p.dot(W)));
      for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(p2, [])) {
        let [a, b, c] = [i0, i1, i2];
        const nn = V(0, 0, 0).subVectors(r[b], r[a]).cross(V(0, 0, 0).subVectors(r[c], r[a]));
        if (nn.dot(out) < 0) [b, c] = [c, b];
        pos.push(r[a].x, r[a].y, r[a].z, r[b].x, r[b].y, r[b].z, r[c].x, r[c].y, r[c].z);
        uv.push(0, 0, 1, 0, 0, 1);
      }
    };
    cap(rings[0], dir.clone().negate());
    cap(rings[M - 1], dir);
  };
  const mesh = (pos, uv, m) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const o = new THREE.Mesh(geo, m);
    g.add(o);
    return o;
  };

  // --- leaves: a section channelled on top and keeled below, [side, up] in units of
  // half-width and thickness, carried along an arc in the leaf's own vertical plane
  const SECTION = [[1, 0.25], [0.45, -0.05], [0, -0.18], [-0.45, -0.05], [-1, 0.25], [-0.55, -0.55], [0, -1], [0.55, -0.55]];
  const WIDTH = [[0, 0.72], [0.2, 1.0], [0.5, 0.86], [0.78, 0.5], [0.92, 0.22], [1, 0.02]];
  const TIPAT = 0.78;
  const along = (t) => {
    for (let i = 0; i < WIDTH.length - 1; i++) {
      const [t0, w0] = WIDTH[i], [t1, w1] = WIDTH[i + 1];
      if (t <= t1) return w0 + ((w1 - w0) * (t - t0)) / (t1 - t0);
    }
    return 0.02;
  };
  const body = { pos: [], uv: [] }, tips = { pos: [], uv: [] };
  const COUNT = 18, GOLD = 2.39996;
  for (let k = 0; k < COUNT; k++) {
    const f = k / (COUNT - 1);
    const phi = k * GOLD + 0.4;
    const L = 0.62 - 0.27 * f + jit(0.03), lift = (18 + 56 * f + jit(5)) * (Math.PI / 180);
    const curl = (26 - 14 * f + jit(5)) * (Math.PI / 180), twist = jit(0.25);
    const w0 = 0.1 - 0.03 * f, t0 = 0.062 - 0.016 * f;
    const out = V(Math.cos(phi), 0, Math.sin(phi)), side = V(-Math.sin(phi), 0, Math.cos(phi));
    let p = out.clone().multiplyScalar(0.06 * (1 - f)).setY(0.05 + 0.11 * f);
    const rings = [];
    const STEPS = 7;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const a = lift - curl * t * t;
      const T = out.clone().multiplyScalar(Math.cos(a)).add(V(0, Math.sin(a), 0));
      const up = new THREE.Vector3().crossVectors(side, T).normalize().applyAxisAngle(T, twist * t);
      const s2 = side.clone().applyAxisAngle(T, twist * t);
      const w = w0 * along(t) * (i % 2 ? 0.94 : 1.04), th = t0 * along(t);
      rings.push({ t, ring: SECTION.map(([sx, sy]) => p.clone().addScaledVector(s2, sx * w).addScaledVector(up, sy * th)) });
      if (i === Math.round(TIPAT * STEPS)) rings[rings.length - 1].split = true;
      p = p.clone().addScaledVector(T, L / STEPS);
    }
    const cut = rings.findIndex((r) => r.split);
    loft(rings.slice(0, cut + 1).map((r) => r.ring), body.pos, body.uv);
    loft(rings.slice(cut).map((r) => r.ring), tips.pos, tips.uv);
  }
  mesh(body.pos, body.uv, SAGE);
  mesh(tips.pos, tips.uv, TIP);

  // --- the dry stalk: a hexagonal cane leaning a little, three short branches of pods
  const cane = (a, b, r0, r1, n, arr) => {
    const d = V(0, 0, 0).subVectors(b, a).normalize();
    const e1 = V(0, 0, 0).crossVectors(d, Math.abs(d.y) < 0.9 ? Y : X).normalize(), e2 = V(0, 0, 0).crossVectors(d, e1);
    const ring = (c, r) => Array.from({ length: n }, (_, i) => {
      const q = (i / n) * Math.PI * 2;
      return c.clone().addScaledVector(e1, Math.cos(q) * r).addScaledVector(e2, Math.sin(q) * r);
    });
    loft([ring(a, r0), ring(a.clone().lerp(b, 0.5), (r0 + r1) / 2), ring(b, r1)], arr.pos, arr.uv);
  };
  const stalk = { pos: [], uv: [] }, pods = { pos: [], uv: [] };
  const path = [V(0, 0.08, 0), V(0.01, 0.4, -0.005), V(0.035, 0.7, -0.02), V(0.06, 0.93, -0.035)];
  for (let i = 0; i < path.length - 1; i++) cane(path[i], path[i + 1], 0.03 - i * 0.005, 0.025 - i * 0.005, 6, stalk);
  const pod = (c, r) => {
    const ring = (y, s) => Array.from({ length: 6 }, (_, i) => {
      const q = (i / 6) * Math.PI * 2;
      return c.clone().add(V(Math.cos(q) * r * s, y * r, Math.sin(q) * r * s));
    });
    loft([ring(-1.1, 0.3), ring(-0.5, 0.9), ring(0.3, 1.0), ring(1.0, 0.45)], pods.pos, pods.uv);
  };
  for (const [y, az, len, rise] of [[0.8, 0.3, 0.13, 0.08], [0.87, 2.4, 0.11, 0.07], [0.92, 4.3, 0.09, 0.06]]) {
    const base = path[2].clone().lerp(path[3], (y - 0.7) / 0.23);
    const end = base.clone().add(V(Math.cos(az) * len, rise, Math.sin(az) * len));
    cane(base, end, 0.01, 0.007, 5, stalk);
    pod(end.clone().add(V(0, 0.02, 0)), 0.03);
    pod(end.clone().add(V(Math.cos(az + 1.4) * 0.03, -0.01, Math.sin(az + 1.4) * 0.03)), 0.024);
  }
  pod(path[3].clone().add(V(0.005, 0.035, -0.003)), 0.034);
  mesh(stalk.pos, stalk.uv, STRAW);
  mesh(pods.pos, pods.uv, POD);

  // --- the mound: a low heightfield on a polar grid, its wavy outer ring on the floor
  {
    const R = 0.4, NU = 5, NT = 28, pos = [], uv = [];
    const P = (i, j) => {
      const u = i / NU, a = (j / NT) * Math.PI * 2, w = 1 + 0.08 * Math.sin(3 * a + 0.7) + 0.05 * Math.sin(5 * a + 2);
      const x = R * u * w * Math.cos(a), z = R * u * w * Math.sin(a);
      return [x, 0.09 * (1 - u * u) ** 1.6, z, 0.5 + x / (2 * R), 0.5 + z / (2 * R)];
    };
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NT; j++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        for (const [p0, p1, p2] of i === 0 ? [[a, c, b]] : [[a, c, b], [a, d, c]]) for (const q of [p0, p1, p2]) { pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); }
      }
    }
    mesh(pos, uv, DUNE);
  }

  // --- the six lines -------------------------------------------------------
  const box = new THREE.Box3(), v = new THREE.Vector3(), m4 = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position; if (!p) return;
    const put = (mat4) => { for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4)); };
    if (n.isInstancedMesh) { for (let c = 0; c < n.count; c++) { n.getMatrixAt(c, im); put(m4.multiplyMatrices(n.matrixWorld, im)); } return; }
    put(n.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => { o.position.x -= c.x; o.position.y -= box.min.y; o.position.z -= c.z; });
  return refineNature(THREE, g, "desert_agave");
}
