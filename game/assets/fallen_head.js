import { architectureDetail } from "../architecture-detail.js";
// fallen_head, candidate C (hand-built lofts in the guardian's own vocabulary): the
// head of guardian_colossus rebuilt from the same chamfered sections, with a split
// mask, a snapped neck and a fractured headdress, then laid on its right side, face
// to +Z and headdress to -X, and sunk into a heightfield drift.
export default function (THREE) {
  const g = new THREE.Group();
  const detail = architectureDetail(THREE, g);

  const mat = (color, roughness, name = "stone") => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
    });
    m.name = name;
    return m;
  };
  const SUN = mat(0xd4a373, 0.84);
  const SAND = mat(0xb57f4f, 0.9);
  const SIENNA = mat(0x8a5433, 0.95);
  const BONE = mat(0xe6d3ae, 0.76);
  const BASALT = mat(0x3a3531, 0.82);
  const DUNE = mat(0xd4a373, 0.98, "ground");
  const FIG = SUN;

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0),
    Y = V(0, 1, 0),
    Z = V(0, 0, 1);
  const head = new THREE.Group();
  const add = (geo, m, parent = head) => {
    const o = new THREE.Mesh(geo, m);
    parent.add(o);
    return o;
  };
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() * 2 - 1) * a;

  // Skin rings of equal point count into one flat-shaded mesh with end caps; winding
  // follows the first ring's area normal against the loft direction.
  const newell = (r) => {
    const n = V(0, 0, 0);
    for (let j = 0; j < r.length; j++) {
      const a = r[j],
        b = r[(j + 1) % r.length];
      n.x += (a.y - b.y) * (a.z + b.z);
      n.y += (a.z - b.z) * (a.x + b.x);
      n.z += (a.x - b.x) * (a.y + b.y);
    }
    return n;
  };
  const centre = (r) =>
    r.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / r.length);
  const loft = (rings) => {
    const N = rings[0].length,
      M = rings.length,
      pos = [],
      uv = [];
    const dir = centre(rings[M - 1]).sub(centre(rings[0]));
    const flip = newell(rings[0]).dot(dir) < 0;
    const tri = (a, b, c, ta, tb, tc) => {
      if (flip) {
        [b, c] = [c, b];
        [tb, tc] = [tc, tb];
      }
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      uv.push(...ta, ...tb, ...tc);
    };
    for (let i = 0; i < M - 1; i++) {
      for (let j = 0; j < N; j++) {
        const k = (j + 1) % N;
        const u0 = j / N,
          u1 = (j + 1) / N,
          v0 = i / (M - 1),
          v1 = (i + 1) / (M - 1);
        tri(
          rings[i][j],
          rings[i][k],
          rings[i + 1][k],
          [u0, v0],
          [u1, v0],
          [u1, v1],
        );
        tri(
          rings[i][j],
          rings[i + 1][k],
          rings[i + 1][j],
          [u0, v0],
          [u1, v1],
          [u0, v1],
        );
      }
    }
    const cap = (r, out) => {
      const n = newell(r).normalize();
      const U = V(0, 0, 0)
        .crossVectors(n, Math.abs(n.y) < 0.9 ? Y : X)
        .normalize();
      const W = V(0, 0, 0).crossVectors(n, U);
      const p2 = r.map((p) => new THREE.Vector2(p.dot(U), p.dot(W)));
      let lo = Infinity,
        span = 1e-6;
      for (const p of p2) {
        lo = Math.min(lo, p.x, p.y);
        span = Math.max(span, Math.abs(p.x), Math.abs(p.y));
      }
      const t2 = (i) => [
        (p2[i].x - lo) / (2 * span),
        (p2[i].y - lo) / (2 * span),
      ];
      for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(p2, [])) {
        let [a, b, c] = [i0, i1, i2];
        const nn = V(0, 0, 0)
          .subVectors(r[b], r[a])
          .cross(V(0, 0, 0).subVectors(r[c], r[a]));
        if (nn.dot(out) < 0) [b, c] = [c, b];
        pos.push(
          r[a].x,
          r[a].y,
          r[a].z,
          r[b].x,
          r[b].y,
          r[b].z,
          r[c].x,
          r[c].y,
          r[c].z,
        );
        uv.push(...t2(a), ...t2(b), ...t2(c));
      }
    };
    cap(rings[0], dir.clone().negate());
    cap(rings[M - 1], dir);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  };
  // Chamfered rectangle (a, b half sizes, c corner cut), counter-clockwise.
  const crect = (a, b, c) => [
    [a, -(b - c)],
    [a, b - c],
    [a - c, b],
    [-(a - c), b],
    [-a, b - c],
    [-a, -(b - c)],
    [-(a - c), -b],
    [a - c, -b],
  ];
  // The same outline with every edge split in k, so clean and broken rings match.
  const crectK = (a, b, c, k) => {
    const base = crect(a, b, c),
      out = [];
    base.forEach(([x0, y0], i) => {
      const [x1, y1] = base[(i + 1) % base.length];
      for (let j = 0; j < k; j++)
        out.push([x0 + ((x1 - x0) * j) / k, y0 + ((y1 - y0) * j) / k]);
    });
    return out;
  };
  const circle = (r, n = 24) =>
    Array.from({ length: n }, (_, i) => [
      r * Math.cos((i / n) * Math.PI * 2),
      r * Math.sin((i / n) * Math.PI * 2),
    ]);
  const place = (pts, c, ax, ay) =>
    pts.map(([u, v]) =>
      c.clone().addScaledVector(ax, u).addScaledVector(ay, v),
    );
  // Horizontal rings up a vertical axis; h(i, u, v) gives each point its height.
  const ringY = (pts, x, z, h) =>
    pts.map(([u, v], i) =>
      V(x + u, typeof h === "function" ? h(i, u, v) : h, z + v),
    );
  const column = (x, z, secs) =>
    loft(secs.map(([y, a, b, c]) => ringY(crect(a, b, c), x, z, y)));
  const block = (x0, x1, y0, y1, z0, z1, c, m) => {
    const a = (x1 - x0) / 2,
      b = (z1 - z0) / 2,
      x = (x0 + x1) / 2,
      z = (z0 + z1) / 2;
    return add(
      column(x, z, [
        [y0, a - c, b - c, c * 0.414],
        [y0 + c, a, b, c],
        [y1 - c, a, b, c],
        [y1, a - c, b - c, c * 0.414],
      ]),
      m,
    );
  };
  const roundel = (prof, n = 24) =>
    loft(prof.map(([r, t]) => place(circle(r, n), V(0, 0, t), X, Y)));
  const medallion = (r, t) =>
    roundel(
      [
        [r, 0],
        [r, t * 0.62],
        [r * 0.9, t * 0.85],
        [r * 0.72, t * 0.85],
        [r * 0.68, t * 0.5],
        [r * 0.26, t * 0.5],
        [r * 0.22, t],
      ],
      28,
    );
  const crescentPts = (r) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (0.3 + 1.4 * (i / 12));
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1.62 - 1.24 * (i / 10));
      pts.push([r * 0.34 + r * 0.74 * Math.cos(a), r * 0.74 * Math.sin(a)]);
    }
    return pts;
  };
  const crescent = (r, t) =>
    loft([0, t].map((z) => place(crescentPts(r), V(0, 0, z), X, Y)));
  const mount = (geo, m, p) => {
    const o = add(geo, m);
    o.position.copy(p);
    return o;
  };
  // Rough rings step in from a clean outline, each point on its outer point's bearing; a squared
  // first ring (exponent p > 2) keeps an even inset where an ellipse folds square corners into an X.
  const rough = (pts, f, j, p = 2) => {
    const ru = Math.max(...pts.map(([u]) => Math.abs(u))) * f,
      rv = Math.max(...pts.map(([, v]) => Math.abs(v))) * f;
    const e = (c) => Math.sign(c) * Math.abs(c) ** (2 / p);
    return pts.map(([u, v]) => {
      const a = Math.atan2(v / rv, u / ru);
      return [ru * e(Math.cos(a)) + jit(j), rv * e(Math.sin(a)) + jit(j)];
    });
  };

  // ------------------------------------------------ the head, upright, in the
  // guardian's own coordinates (its neck base at 8.6 m, headdress front at z = 0.2)
  const K = 3;
  // An irregular lump, used as rubble left standing on a break.
  const lump = (p, r, m) => {
    const ring = (f, y) =>
      Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 + jit(0.25),
          rr = r * f * (0.75 + rnd() * 0.5);
        return V(
          p.x + Math.cos(a) * rr,
          p.y + y * r + jit(r * 0.12),
          p.z + Math.sin(a) * rr,
        );
      });
    return add(
      loft([
        ring(0.45, -0.7),
        ring(1, -0.1),
        ring(0.7, 0.45),
        ring(0.25, 0.75),
      ]),
      m,
    );
  };
  // The neck snapped on a slant: a rough rim, then a broken face across it.
  const neck = crectK(0.65, 0.65, 0.2, K);
  const neckH = (i, u, v) =>
    8.64 + 0.12 * (v / 0.65) - 0.07 * (u / 0.65) + jit(0.05);
  add(
    loft([
      ringY(
        rough(neck, 0.24, 0.04),
        0,
        -1.1,
        (i, u, v) => neckH(i, u, v) + 0.02 + jit(0.06),
      ),
      ringY(
        rough(neck, 0.55, 0.05),
        0,
        -1.1,
        (i, u, v) => neckH(i, u, v) - 0.07 + jit(0.07),
      ),
      ringY(
        rough(neck, 0.82, 0.04),
        0,
        -1.1,
        (i, u, v) => neckH(i, u, v) + 0.04 + jit(0.05),
      ),
      ringY(neck, 0, -1.1, neckH),
      ringY(neck, 0, -1.1, 9.6),
    ]),
    FIG,
  );
  lump(V(0.18, 8.58, -1.3), 0.26, FIG);
  lump(V(-0.3, 8.62, -0.8), 0.18, FIG);
  add(
    column(0, -1.05, [
      [9.35, 0.82, 0.9, 0.3],
      [9.75, 0.92, 0.98, 0.3],
      [10.75, 0.93, 1.0, 0.3],
      [11.12, 0.86, 0.94, 0.28],
    ]),
    FIG,
  );
  for (let i = -2; i <= 2; i++)
    block(i * 0.3 - 0.09, i * 0.3 + 0.09, 9.55, 10.9, -2.1, -1.9, 0.02, FIG);

  // The mask, split by a crack running across it: two slabs, each a back layer and
  // a stepped front layer, so the crack and the slit open into V-shaped cuts.
  const A = 0.86,
    B = 0.75,
    CY = 10.2,
    CH = 0.24,
    SW = 0.12,
    SLIT0 = 9.72,
    SLIT1 = 10.72,
    GAP = 0.07;
  const crack = [
    [-A, 10.44],
    [-0.55, 10.3],
    [-0.34, 10.37],
    [0.36, 10.15],
    [0.62, 10.24],
    [A, 10.06],
  ];
  const crackV = (u) => {
    for (let i = 0; i < crack.length - 1; i++) {
      const [u0, v0] = crack[i],
        [u1, v1] = crack[i + 1];
      if (u <= u1) return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0);
    }
    return crack[crack.length - 1][1];
  };
  const inner = crack.slice(1, -1);
  const maskPiece = (upper, d) => {
    const a = A - d,
      b = B - d,
      c = CH - d * 0.6,
      sw = SW + d,
      off = GAP / 2 + d;
    const cv = (u) => crackV(u) + (upper ? off : -off);
    const edge = [
      [-a, cv(-a)],
      ...inner.filter(([u]) => u < -sw).map(([u]) => [u, cv(u)]),
    ];
    const right = [
      ...inner.filter(([u]) => u > sw).map(([u]) => [u, cv(u)]),
      [a, cv(a)],
    ];
    if (upper) {
      return [
        [a, cv(a)],
        [a, CY + b - c],
        [a - c, CY + b],
        [-(a - c), CY + b],
        [-a, CY + b - c],
        ...edge,
        [-sw, cv(-sw)],
        [-sw, SLIT1 + d],
        [sw, SLIT1 + d],
        [sw, cv(sw)],
        ...right.slice(0, -1),
      ];
    }
    return [
      [-a, cv(-a)],
      [-a, CY - b + c],
      [-(a - c), CY - b],
      [a - c, CY - b],
      [a, CY - b + c],
      ...right.slice().reverse(),
      [sw, cv(sw)],
      [sw, SLIT0 - d],
      [-sw, SLIT0 - d],
      [-sw, cv(-sw)],
      ...edge.slice(1).reverse(),
    ];
  };
  for (const upper of [true, false]) {
    const ring = (d, z) => place(maskPiece(upper, d), V(0, 0, z), X, Y);
    const piece = add(
      loft([ring(0, -0.1), ring(0, 0.12), ring(0.05, 0.12), ring(0.05, 0.2)]),
      BONE,
    );
    // the chin-side slab has settled back a little along the crack
    if (!upper) piece.position.set(0.01, -0.015, -0.025);
  }
  block(-0.2, 0.2, 9.62, 10.8, -0.08, -0.02, 0.005, BASALT);
  {
    const w = GAP / 2 + 0.05;
    const pts = [
      ...crack.map(([u, v]) => [u, v + w]),
      ...crack
        .slice()
        .reverse()
        .map(([u, v]) => [u, v - w]),
    ];
    add(loft([-0.1, -0.03].map((z) => place(pts, V(0, 0, z), X, Y))), SIENNA);
  }

  // headdress: the first tier whole, with its groove band and sunlit cap
  const tierSecs = (hw, hd, y0, gy, y1) => [
    [y0, hw - 0.07, hd - 0.07, 0.1],
    [y0 + 0.07, hw, hd, 0.14],
    [gy, hw, hd, 0.14],
    [gy, hw - 0.12, hd - 0.12, 0.1],
    [gy + 0.13, hw - 0.12, hd - 0.12, 0.1],
    [gy + 0.13, hw, hd, 0.14],
    [y1 - 0.05, hw, hd, 0.14],
    [y1, hw - 0.05, hd - 0.05, 0.12],
  ];
  add(column(0, -1.0, tierSecs(1.275, 1.2, 10.95, 11.42, 12.0)), SAND);
  block(-1.33, 1.33, 12.0, 12.1, -2.25, 0.25, 0.03, SUN);
  // the second tier sheared off on a slant that climbs to the front edge, so the
  // disc on its face survives; the upper tier is gone, a few lumps left on the break
  const K2 = 3;
  const t2 = (hw, hd, c) => crectK(hw, hd, c, K2);
  const breakH = (i, u, v) =>
    12.74 + 0.24 * (v / 0.94) + 0.07 * (u / 1.0) + jit(0.04);
  // Relief follows position rather than ring index, or the rings terrace into a hipped pyramid.
  const ripple = (u, v) =>
    0.07 * Math.sin(3.1 * u + 1.7 * v + 0.5) +
    0.05 * Math.sin(5.3 * v - 2.3 * u + 1.2);
  add(
    loft([
      ringY(t2(0.93, 0.87, 0.1), 0, -1.0, 12.1),
      ringY(t2(1.0, 0.94, 0.14), 0, -1.0, 12.17),
      ringY(t2(1.0, 0.94, 0.14), 0, -1.0, 12.5),
      ringY(t2(0.88, 0.82, 0.1), 0, -1.0, 12.5),
      ringY(t2(0.88, 0.82, 0.1), 0, -1.0, 12.63),
      ringY(t2(1.0, 0.94, 0.14), 0, -1.0, 12.63),
      ringY(t2(1.0, 0.94, 0.14), 0, -1.0, breakH),
      ringY(
        rough(t2(1.0, 0.94, 0.14), 0.86, 0.04, 6),
        0,
        -1.0,
        (i, u, v) => breakH(i, u, v) - 0.06 + ripple(u, v) * 0.5 + jit(0.03),
      ),
      ringY(
        rough(t2(1.0, 0.94, 0.14), 0.58, 0.07, 3),
        0,
        -1.0,
        (i, u, v) => breakH(i, u, v) + ripple(u, v) + jit(0.04),
      ),
      ringY(
        rough(t2(1.0, 0.94, 0.14), 0.26, 0.06),
        0,
        -1.0,
        (i, u, v) => breakH(i, u, v) + ripple(u, v) + jit(0.04),
      ),
    ]),
    SAND,
  );
  lump(V(-0.35, 12.72, -1.35), 0.34, SAND);
  lump(V(0.45, 12.84, -1.1), 0.24, SAND);
  lump(V(-0.3, 12.84, -0.75), 0.16, SAND);
  lump(V(0.5, 12.78, -1.55), 0.2, SAND);
  mount(medallion(0.44, 0.34), BONE, V(0, 12.52, -0.07));
  mount(crescent(0.23, 0.1), SIENNA, V(0, 12.52, 0.1));

  // ------------------------------------------------ lay it down and sink it
  const S = 1.02,
    ROLL = 0.1,
    TILT = -0.04,
    SINK = 0.37;
  const pose = new THREE.Group();
  head.position.set(0, -10.8, 1.0);
  pose.add(head);
  pose.scale.setScalar(S);
  const q = (ax, a) => new THREE.Quaternion().setFromAxisAngle(ax, a);
  pose.quaternion.copy(
    q(Z, TILT)
      .multiply(q(X, -ROLL))
      .multiply(q(Z, Math.PI / 2)),
  );
  g.add(pose);
  g.updateMatrixWorld(true);
  let low = Infinity;
  pose.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position,
      w = V(0, 0, 0);
    for (let i = 0; i < p.count; i++)
      low = Math.min(
        low,
        w.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).y,
      );
  });
  pose.position.y = -low - SINK;
  g.updateMatrixWorld(true);
  // Bake every part into the group's space and cut it at the ground: triangles wholly
  // below are dropped, the rest are clamped to y = 0, so the head is really sunk.
  const parts = [];
  pose.traverse((o) => {
    if (o.isMesh) parts.push(o);
  });
  g.remove(pose);
  for (const o of parts) {
    const src = (
      o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    ).applyMatrix4(o.matrixWorld);
    const p = src.attributes.position.array,
      t = src.attributes.uv.array,
      pos = [],
      uv = [];
    for (let i = 0; i < p.length; i += 9) {
      if (p[i + 1] < 0 && p[i + 4] < 0 && p[i + 7] < 0) continue;
      for (let k = 0; k < 3; k++) {
        pos.push(p[i + k * 3], Math.max(0, p[i + k * 3 + 1]), p[i + k * 3 + 2]);
        uv.push(t[(i / 9) * 6 + k * 2], t[(i / 9) * 6 + k * 2 + 1]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    add(geo, o.material, g);
  }

  // ------------------------------------------------ the drift: soft mounds banked
  // against the underside, highest on the back, on an elliptical polar grid whose
  // wavy outer ring lies on the floor
  const mounds = [
    [0, -0.1, 2.3, 1.3, 0.5],
    [0.3, -1.2, 2.6, 1.0, 0.8],
    [2.1, -0.2, 0.9, 1.4, 0.75],
    [-2.1, -0.4, 0.7, 1.2, 0.55],
    [0.4, 1.0, 2.2, 0.5, 0.22],
    [1.6, 1.0, 0.8, 0.5, 0.4],
  ];
  const hAt = (x, z) => {
    let h = 0;
    for (const [mx, mz, rx, rz, mh] of mounds) {
      const r2 = ((x - mx) / rx) ** 2 + ((z - mz) / rz) ** 2;
      if (r2 < 1) h = Math.max(h, mh * (1 - r2) ** 2);
    }
    return h * (1 + 0.06 * Math.sin(x * 5.3 + Math.sin(z * 2.1) * 1.6));
  };
  {
    const RX = 2.4,
      RZ = 1.55,
      CZ = -0.15,
      NU = 9,
      NT = 44,
      pos = [],
      uv = [];
    const P = (i, j) => {
      const u = i / NU,
        t = (j / NT) * Math.PI * 2;
      const w = 1 + 0.05 * Math.sin(3 * t + 1) + 0.04 * Math.sin(5 * t + 2.3);
      const x = RX * u * w * Math.cos(t),
        z = CZ + RZ * u * w * Math.sin(t);
      const f = Math.min(1, (1 - u) / 0.3);
      return [
        x,
        hAt(x, z) * f * f * (3 - 2 * f),
        z,
        0.5 + x / (2 * RX),
        0.5 + (z - CZ) / (2 * RZ),
      ];
    };
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NT; j++) {
        const a = P(i, j),
          b = P(i + 1, j),
          c = P(i + 1, j + 1),
          d = P(i, j + 1);
        for (const [p0, p1, p2] of i === 0
          ? [[a, c, b]]
          : [
              [a, c, b],
              [a, d, c],
            ]) {
          for (const p of [p0, p1, p2]) {
            pos.push(p[0], p[1], p[2]);
            uv.push(p[3], p[4]);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    add(geo, DUNE, g);
  }

  // --- the six lines -------------------------------------------------------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mat4) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        put(m4.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    put(n.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box.min.y;
    o.position.z -= c.z;
  });
  return detail.finish();
}
