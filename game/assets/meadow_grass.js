import { refineNature } from "../nature-detail.js";

// meadow_grass, candidate B (profiles): every blade is a hand-built strip swept along its
// own arc. The arc integrates a lean angle that falls from nearly upright at the root to a
// droop at the tip, slowly at first, so the inner blades stand and the outer ones bow out;
// each strip drifts sideways, rolls with a twist as it climbs and tapers to a point over
// its last third. Every blade is two sheets a hair apart, wound opposite ways and sharing
// one normal field that leans up and out from the tuft: under DoubleSide each side then
// shows a front face with the soft normal, so the clump shades as one mound instead of
// flipping blade by blade. Moss green below and fern green above, split at a row that
// varies per blade. Four lofted stalks nod at the top, each hanging five lofted spindles
// on alternate sides as an oat head. Roots sit at y = 0 inside 0.15 m; 0.6 m tall, 0.7 m
// across.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    m.name = 'foliage';
    return m;
  };
  const MOSS = mat(0x4f7a3a);
  const FERN = mat(0x7da04a);

  let seed = 4127;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() * 2 - 1) * a;
  const D = Math.PI / 180;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const bins = new Map([[MOSS, { pos: [], nor: [], uv: [] }], [FERN, { pos: [], nor: [], uv: [] }]]);
  const e1 = V(0, 0, 0), e2 = V(0, 0, 0), cr = V(0, 0, 0);
  // One triangle of vertices { p, n, t }, wound so that its front face looks along `front`.
  const tri = (m, a, b, c, front) => {
    cr.crossVectors(e1.subVectors(b.p, a.p), e2.subVectors(c.p, a.p));
    if (front && cr.dot(front) < 0) [b, c] = [c, b];
    const B = bins.get(m);
    for (const q of [a, b, c]) {
      B.pos.push(q.p.x, q.p.y, q.p.z);
      B.nor.push(q.n.x, q.n.y, q.n.z);
      B.uv.push(q.t[0], q.t[1]);
    }
  };

  // The soft normal field points straight out from a hub under the middle of the base, so
  // the whole tuft is lit like one low mound; each blade keeps a little of its own normal.
  const HUB = V(0, -0.16, 0);
  const SOFT = 0.7;
  const soft = (p, n) => p.clone().sub(HUB).normalize().multiplyScalar(SOFT).addScaledVector(n, 1 - SOFT).normalize();

  // --- blades -----------------------------------------------------------------------------
  const NB = 32;
  // the inner blades stand nearly straight and get four segments, the bowed ones five
  const ROWS4 = [0, 0.3, 0.57, 0.8, 1], ROWS5 = [0, 0.24, 0.46, 0.65, 0.83, 1];
  const GAP = 0.0011;
  for (let k = 0; k < NB; k++) {
    // t runs from 0 (inner: tall, nearly upright) to 1 (outer: short, bowed, tip drooping)
    const t = Math.min(1, Math.max(0, (k + 0.5) / NB + jit(0.04)));
    const az = k * 2.39996 + jit(0.2);
    const O = V(Math.sin(az), 0, Math.cos(az)), S0 = V(Math.cos(az), 0, -Math.sin(az));
    const r0 = Math.max(0.004, 0.008 + 0.056 * t + jit(0.008)), ra = az + jit(0.5);
    const root = V(Math.sin(ra) * r0, 0, Math.cos(ra) * r0);
    const L = (0.52 - 0.14 * t) * (1 + jit(0.07));
    const th0 = (87 - 17 * t + jit(3)) * D, th1 = (60 - 112 * t + jit(8)) * D, pw = 1.9 - 0.7 * t;
    const drift = jit(0.05) * L, twist = jit(1.1);
    const NI = 36, pts = [root];
    for (let i = 1; i <= NI; i++) {
      const u = (i - 0.5) / NI, th = th0 + (th1 - th0) * Math.pow(u, pw);
      const p = pts[i - 1].clone().addScaledVector(O, (Math.cos(th) * L) / NI).addScaledVector(S0, (2 * drift * u) / NI);
      p.y += (Math.sin(th) * L) / NI;
      pts.push(p);
    }
    const P = (u) => {
      const f = Math.min(Math.max(u, 0), 1) * NI, i = Math.min(Math.floor(f), NI - 1);
      return pts[i].clone().lerp(pts[i + 1], f - i);
    };
    // frame: tangent T, width W (horizontal at the root, rolled by the twist), normal N = T x W
    const frame = (u) => {
      const T = P(u + 0.03).sub(P(u - 0.03)).normalize();
      const W = S0.clone().addScaledVector(T, -S0.dot(T)).normalize().applyAxisAngle(T, twist * Math.pow(u, 1.3));
      return { T, W, N: V(0, 0, 0).crossVectors(T, W) };
    };
    const w0 = 0.021 * (1 + jit(0.12));
    const width = (u) => w0 * (1 - 0.25 * u) * Math.pow(Math.min(1, (1 - u) / 0.35), 0.8);
    // the blade's own normal, turned to agree with the soft field over its upper half
    const mid = frame(0.6);
    const sgn = mid.N.dot(P(0.6).sub(HUB)) < 0 ? -1 : 1;
    const ROWS = t < 0.36 ? ROWS4 : ROWS5;
    const split = t < 0.36 ? 2 : t < 0.6 ? 3 : 2;
    const u0 = rnd();

    const rows = ROWS.map((u) => {
      const f = frame(u), c = P(u), hw = width(u) / 2, n = f.N.clone().multiplyScalar(sgn);
      const pts2 = u < 1 ? [[c.clone().addScaledVector(f.W, -hw), -1], [c.clone().addScaledVector(f.W, hw), 1]] : [[c, 0]];
      return { N: f.N, list: pts2.map(([p, s]) => ({ p, n: soft(p, n), t: [u0 + s * 0.012, u * L] })) };
    });
    for (const side of [1, -1]) {
      const off = (r) => r.list.map((q) => ({ p: q.p.clone().addScaledVector(r.N, side * GAP), n: q.n, t: q.t }));
      const R = rows.map(off);
      for (let i = 0; i < ROWS.length - 1; i++) {
        const m = i < split ? MOSS : FERN;
        const front = rows[i].N.clone().add(rows[i + 1].N).multiplyScalar(side);
        const [a, b] = R[i], nx = R[i + 1];
        if (nx.length === 1) { tri(m, a, b, nx[0], front); continue; }
        tri(m, a, b, nx[1], front);
        tri(m, a, nx[1], nx[0], front);
      }
    }
  }

  // --- stalks and oat heads -----------------------------------------------------------------
  // A loft along a polyline with parallel-transported rings; a radius of 0 closes the loft
  // to a point there. Normals are the rings' own radial directions.
  const loft = (pts, rad, sides, matAt, v0 = 0) => {
    const n = pts.length;
    const T = pts.map((p, i) => pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize());
    const Nr = V(1, 0, 0).addScaledVector(T[0], -T[0].x).normalize();
    const rings = [];
    for (let i = 0; i < n; i++) {
      if (i) {
        const axis = V(0, 0, 0).crossVectors(T[i - 1], T[i]), s = axis.length();
        if (s > 1e-6) Nr.applyAxisAngle(axis.normalize(), Math.atan2(s, T[i - 1].dot(T[i])));
        Nr.addScaledVector(T[i], -Nr.dot(T[i])).normalize();
      }
      const Bn = V(0, 0, 0).crossVectors(T[i], Nr);
      const v = v0 + i * 0.05;
      if (rad[i] <= 0) {
        const tip = { p: pts[i].clone(), n: T[i].clone().multiplyScalar(i ? 1 : -1), t: [0.5, v] };
        rings.push(Array.from({ length: sides }, () => tip));
        continue;
      }
      rings.push(Array.from({ length: sides }, (_, j) => {
        const q = (j / sides) * Math.PI * 2;
        const dir = Nr.clone().multiplyScalar(Math.cos(q)).addScaledVector(Bn, Math.sin(q));
        return { p: pts[i].clone().addScaledVector(dir, rad[i]), n: dir, t: [j / sides, v] };
      }));
    }
    for (let i = 0; i < n - 1; i++) {
      const m = matAt(i);
      for (let j = 0; j < sides; j++) {
        const k = (j + 1) % sides;
        const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][k], d = rings[i][k];
        const out = a.n.clone().add(c.n);
        if (rad[i + 1] > 0) tri(m, a, b, c, out);
        if (rad[i] > 0) tri(m, a, c, d, out);
      }
    }
  };

  // An oat head: the stalk rises with a slight lean and nods near the top, and five small
  // spindles hang from its last stretch on alternate sides, pointing down and out.
  const stalk = (az, lean, H, nod) => {
    const O = V(Math.sin(az), 0, Math.cos(az));
    const NI = 40, pts = [O.clone().multiplyScalar(0.014)];
    const th0 = (90 - lean) * D, th1 = (90 - nod) * D;
    for (let i = 1; i <= NI; i++) {
      const u = (i - 0.5) / NI, th = th0 + (th1 - th0) * Math.pow(u, 2.6);
      const p = pts[i - 1].clone().addScaledVector(O, (Math.cos(th) * H) / NI);
      p.y += (Math.sin(th) * H) / NI;
      pts.push(p);
    }
    const P = (u) => { const f = u * NI, i = Math.min(Math.floor(f), NI - 1); return pts[i].clone().lerp(pts[i + 1], f - i); };
    const US = [0, 0.32, 0.6, 0.82, 1];
    loft(US.map(P), US.map((u) => 0.0028 - 0.001 * u), 3, (i) => (i < 2 ? MOSS : FERN), rnd());
    const psi0 = rnd() * 6.3;
    for (let s = 0; s < 5; s++) {
      const u = 0.78 + 0.055 * s, at = P(u), psi = psi0 + s * 2.5, phi = (s === 4 ? 12 : 34) * D;
      const side = V(Math.sin(psi), 0, Math.cos(psi)).lerp(O, 0.3).normalize();
      const dir = side.multiplyScalar(Math.sin(phi)).setY(-Math.cos(phi)).normalize();
      const len = 0.03 - 0.002 * s;
      loft([at, at.clone().addScaledVector(dir, len * 0.58), at.clone().addScaledVector(dir, len)], [0, 0.0058, 0], 4, () => FERN, rnd());
    }
  };
  const S = [[0.5, 5, 0.6, 40], [2.2, 8, 0.56, 55], [3.9, 4, 0.53, 35], [5.3, 10, 0.5, 50]];
  for (const [az, lean, H, nod] of S) stalk(az + jit(0.2), lean, H * (1 + jit(0.03)), nod);

  for (const [m, B] of bins) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = m === MOSS ? 'grass_lower' : 'grass_upper';
    g.add(mesh);
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
  return refineNature(THREE, g, "meadow_grass");
}
