import { architectureDetail } from "../architecture-detail.js";
// guardian_colossus, candidate C (a second reading, hand-built lofts): every
// part is one BufferGeometry skinned through chamfered cross-sections, so the
// figure tapers like carving rather than stacking like blocks. This reading
// robes the guardian: pleated columns fall from the knees to a bone hem and the
// feet emerge below it. 14 m seated guardian, front +Z.
export default function (THREE) {
  const g = new THREE.Group();
  const detail = architectureDetail(THREE, g);

  const mat = (color, roughness) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
    });
    m.name = "stone";
    return m;
  };
  const SUN = mat(0xd4a373, 0.84);
  const SAND = mat(0xb57f4f, 0.9);
  const SIENNA = mat(0x8a5433, 0.95);
  const BONE = mat(0xe6d3ae, 0.76);
  const BASALT = mat(0x3a3531, 0.82);
  const FIG = SUN;

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0),
    Y = V(0, 1, 0),
    Z = V(0, 0, 1);
  const add = (geo, m, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    parent.add(o);
    return o;
  };

  // Skin a list of rings (equal point counts) into one flat-shaded mesh with end
  // caps. Winding comes from the first ring's area normal against the loft
  // direction, so concave rings (notches, slits) stay correct.
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
  // Chamfered rectangle (a, b half sizes, c corner cut) with notches cut into
  // its +v edge: [fraction of a, width, depth]. Same point count for equal notch lists.
  const crect = (a, b, c, notches = []) => {
    const pts = [
      [a, -(b - c)],
      [a, b - c],
      [a - c, b],
    ];
    for (const [f, w, d] of notches
      .map(([f, w, d]) => [f * a, w, d])
      .sort((p, q) => q[0] - p[0])) {
      pts.push(
        [f + w / 2, b],
        [f + w / 2, b - d],
        [f - w / 2, b - d],
        [f - w / 2, b],
      );
    }
    pts.push(
      [-(a - c), b],
      [-a, b - c],
      [-a, -(b - c)],
      [-(a - c), -b],
      [a - c, -b],
    );
    return pts;
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
  // Horizontal sections stacked up a vertical axis: [y, a (x), b (z), c, notches on the front].
  const column = (x, z, secs) =>
    loft(
      secs.map(([y, a, b, c, n]) => place(crect(a, b, c, n), V(x, y, z), X, Z)),
    );
  // Chamfered block: every edge cut at 45 degrees by c.
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
  // Prism from a plan polygon (x, z) between two heights.
  const prism = (pts, y0, y1, m) =>
    add(loft([y0, y1].map((y) => pts.map(([x, z]) => V(x, y, z)))), m);
  // Round medallion facing +Z: [radius, depth] profile skinned like a lathe.
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
  // A flat bone rim: outer wall and face, its inner wall dropping into the medallion it frames.
  const hoop = (r0, r1, t) =>
    roundel(
      [
        [r1, 0],
        [r1, t],
        [r0, t],
        [r0, t * 0.4],
      ],
      28,
    );
  // Put a +Z-facing piece at p, turned about Y.
  const mount = (geo, m, p, ry) => {
    const o = add(geo, m);
    o.position.copy(p);
    o.rotation.y = ry;
    return o;
  };

  // ---------------------------------------------------------------- plinth
  // A fissure runs right across both steps in front of the toes; the slabs in
  // front of it have settled, so it shows on the top and on both side faces.
  const crack = [
    [-4.2, 4.3],
    [-3.75, 4.25],
    [-3.0, 4.05],
    [-2.3, 4.4],
    [-1.5, 4.15],
    [-0.6, 4.45],
    [0.3, 4.1],
    [1.15, 4.4],
    [2.0, 4.08],
    [2.8, 4.38],
    [3.75, 4.2],
    [4.2, 4.14],
  ];
  const gap = 0.09;
  const inner = crack.slice(1, -1);
  prism(
    [
      [-4.2, -4.4],
      [4.2, -4.4],
      ...crack
        .slice()
        .reverse()
        .map(([x, z]) => [x, z - gap]),
    ],
    0,
    0.5,
    SIENNA,
  );
  prism(
    [...crack.map(([x, z]) => [x, z + gap]), [4.2, 5.2], [-4.2, 5.2]],
    0,
    0.47,
    SIENNA,
  );
  prism(
    [
      [-3.75, -3.95],
      [3.75, -3.95],
      ...inner
        .slice()
        .reverse()
        .map(([x, z]) => [x, z - gap]),
    ],
    0.5,
    1.0,
    SAND,
  );
  prism(
    [...inner.map(([x, z]) => [x, z + gap]), [3.75, 4.75], [-3.75, 4.75]],
    0.47,
    0.92,
    SAND,
  );
  for (let i = -2; i <= 2; i++) {
    mount(
      roundel(
        [
          [0.19, 0],
          [0.19, 0.04],
        ],
        20,
      ),
      BASALT,
      V(i * 1.6, 0.24, 5.19),
      0,
    );
    mount(
      roundel(
        [
          [0.19, 0],
          [0.19, 0.04],
        ],
        20,
      ),
      BASALT,
      V(i * 1.6, 0.25, -4.39),
      Math.PI,
    );
  }

  // ----------------------------------------------------------------- throne
  block(-3.3, 3.3, 1.0, 1.4, -3.6, 1.1, 0.05, SIENNA);
  block(-2.8, 2.8, 1.4, 4.4, -3.4, 0.9, 0.06, SAND);
  for (const s of [1, -1]) {
    const bx = (a, b, y0, y1, z0, z1, c, m) =>
      s > 0
        ? block(a, b, y0, y1, z0, z1, c, m)
        : block(-b, -a, y0, y1, z0, z1, c, m);
    // side frame round a deep recessed panel
    bx(2.76, 3.1, 3.85, 4.4, -3.4, 0.9, 0.07, SAND);
    bx(2.76, 3.1, 1.4, 1.95, -3.4, 0.9, 0.07, SAND);
    bx(2.76, 3.1, 1.9, 3.9, -3.4, -2.75, 0.07, SAND);
    bx(2.76, 3.1, 1.9, 3.9, 0.25, 0.9, 0.07, SAND);
    bx(2.78, 2.83, 1.9, 3.9, -2.8, 0.3, 0.01, SIENNA);
    const ry = (s * Math.PI) / 2;
    mount(medallion(0.72, 0.3), SAND, V(s * 2.83, 2.9, -1.25), ry);
    mount(hoop(0.66, 0.78, 0.3), BONE, V(s * 2.83, 2.9, -1.25), ry);
    mount(crescent(0.36, 0.12), SIENNA, V(s * 2.97, 2.9, -1.25), ry);
    for (const dz of [-2.25, -0.25])
      mount(medallion(0.24, 0.26), BONE, V(s * 2.83, 2.9, dz), ry);
    // sunlit cap beside the thighs; raised bands across the seat front beside the robe
    bx(1.8, 3.2, 4.38, 4.52, -2.2, 1.0, 0.04, SUN);
    for (const y of [2.0, 3.1])
      bx(1.85, 3.1, y, y + 0.32, 0.86, 1.02, 0.04, SAND);
    // grooved bands round the sides of the first backrest tier
    for (const y of [5.0, 5.45, 5.9])
      bx(3.0, 3.2, y, y + 0.25, -3.4, -2.2, 0.03, SAND);
  }
  // receding backrest tiers, each with a sunlit cap
  block(-3.1, 3.1, 4.4, 6.7, -3.4, -2.2, 0.07, SAND);
  block(-3.2, 3.2, 6.68, 6.84, -3.5, -2.1, 0.04, SUN);
  block(-2.4, 2.4, 6.84, 8.0, -3.2, -2.2, 0.07, SAND);
  block(-2.5, 2.5, 7.98, 8.12, -3.3, -2.1, 0.04, SUN);
  block(-1.6, 1.6, 8.12, 9.0, -3.0, -2.2, 0.07, SAND);
  block(-1.7, 1.7, 8.98, 9.1, -3.1, -2.1, 0.04, SUN);
  // back: raised courses on the seat, a medallion flanked by channels, twin circles, a crescent
  for (const [y0, y1] of [
    [1.4, 2.2],
    [2.36, 3.3],
    [3.46, 4.4],
  ])
    block(-2.8, 2.8, y0, y1, -3.56, -3.3, 0.06, SAND);
  block(-2.8, 2.8, 1.45, 4.35, -3.44, -3.38, 0.01, SIENNA);
  mount(medallion(0.95, 0.34), SAND, V(0, 5.55, -3.4), Math.PI);
  mount(hoop(0.88, 1.02, 0.36), BONE, V(0, 5.55, -3.4), Math.PI);
  mount(crescent(0.46, 0.14), SIENNA, V(0, 5.55, -3.56), Math.PI);
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const x = s * (1.45 + i * 0.42);
      block(x - 0.14, x + 0.14, 4.6, 6.5, -3.56, -3.3, 0.04, SAND);
    }
    mount(medallion(0.28, 0.2), BONE, V(s * 1.25, 7.6, -3.2), Math.PI);
  }
  block(-2.4, 2.4, 7.0, 7.2, -3.26, -3.18, 0.01, SIENNA);
  block(-2.4, 2.4, 6.84, 7.0, -3.32, -3.1, 0.03, SAND);
  block(-2.4, 2.4, 7.2, 7.36, -3.32, -3.1, 0.03, SAND);
  mount(crescent(0.34, 0.12), SIENNA, V(0, 8.55, -2.99), Math.PI);

  // ----------------------------------------------------------------- figure
  const pleats = (d) => [
    [-0.36, 0.13, d],
    [0.36, 0.13, d],
  ];
  for (const s of [1, -1]) {
    const cx = s * 0.88;
    // robed thigh, knee rounding forward
    add(
      loft(
        [
          [-1.9, 0.72, 0.58, 5.0],
          [0.4, 0.76, 0.62, 5.02],
          [2.2, 0.73, 0.62, 5.0],
          [2.62, 0.63, 0.55, 4.98],
          [2.8, 0.45, 0.4, 4.96],
        ].map(([z, a, b, y]) => place(crect(a, b, 0.22), V(cx, y, z), X, Y)),
      ),
      FIG,
    );
    // pleated robe column from knee to hem, with a bone hem band
    add(
      column(cx, 1.95, [
        [4.75, 0.68, 0.68, 0.22, pleats(0.1)],
        [3.3, 0.62, 0.62, 0.22, pleats(0.1)],
        [2.1, 0.66, 0.64, 0.22, pleats(0.1)],
        [1.78, 0.68, 0.66, 0.22, pleats(0.1)],
      ]),
      FIG,
    );
    add(
      column(cx, 1.95, [
        [1.74, 0.7, 0.68, 0.22],
        [1.78, 0.74, 0.72, 0.24],
        [1.96, 0.74, 0.72, 0.24],
        [2.0, 0.7, 0.68, 0.22],
      ]),
      BONE,
    );
    // the foot, toes grooved only toward the front
    const fx = s * 0.82;
    const toes = (d) => [
      [-0.5, 0.05, d],
      [0, 0.05, d],
      [0.5, 0.05, d],
    ];
    add(
      loft(
        [
          [1.4, 0.55, 0.38, 1.38, 0],
          [2.2, 0.58, 0.36, 1.36, 0],
          [2.8, 0.6, 0.3, 1.3, 0],
          [3.4, 0.58, 0.22, 1.22, 0.05],
          [3.85, 0.5, 0.16, 1.16, 0.07],
        ].map(([z, a, b, y, d]) =>
          place(
            crect(a, b, Math.min(0.14, b * 0.6), toes(d)),
            V(fx, y, z),
            X,
            Y,
          ),
        ),
      ),
      FIG,
    );
  }
  // robe between the knees: a sagging lap and a recessed pleated fall
  block(-0.32, 0.32, 4.6, 5.45, -1.2, 2.55, 0.08, FIG);
  add(
    column(0, 1.9, [
      [
        4.7,
        0.5,
        0.4,
        0.1,
        [
          [-0.3, 0.1, 0.08],
          [0.3, 0.1, 0.08],
        ],
      ],
      [
        1.8,
        0.55,
        0.42,
        0.1,
        [
          [-0.3, 0.1, 0.08],
          [0.3, 0.1, 0.08],
        ],
      ],
    ]),
    FIG,
  );
  add(
    column(0, 1.9, [
      [1.76, 0.52, 0.42, 0.1],
      [1.98, 0.56, 0.46, 0.1],
    ]),
    BONE,
  );
  // torso: channels carved down the chest fade in and out with the sections
  const ch = (d) => [
    [-0.39, 0.16, d],
    [-0.13, 0.16, d],
    [0.13, 0.16, d],
    [0.39, 0.16, d],
  ];
  add(
    column(0, -1.2, [
      [4.4, 1.62, 1.1, 0.35, ch(0)],
      [5.4, 1.55, 1.08, 0.35, ch(0)],
      [6.3, 1.45, 1.06, 0.35, ch(0.1)],
      [7.3, 1.72, 1.1, 0.35, ch(0.12)],
      [8.0, 1.85, 1.1, 0.35, ch(0.1)],
      [8.2, 1.8, 1.05, 0.35, ch(0)],
      [8.55, 1.2, 0.85, 0.3, ch(0)],
    ]),
    FIG,
  );
  // waist band with a disc
  add(
    column(0, -1.2, [
      [5.38, 1.62, 1.18, 0.34],
      [5.42, 1.68, 1.24, 0.36],
      [5.82, 1.68, 1.24, 0.36],
      [5.86, 1.62, 1.18, 0.34],
    ]),
    BONE,
  );
  mount(medallion(0.34, 0.2), SAND, V(0, 5.62, 0.02), 0);
  // stepped collar of three courses and a stepped bib
  add(
    column(0, -1.2, [
      [7.95, 1.94, 1.44, 0.45],
      [8.0, 2.0, 1.5, 0.48],
      [8.3, 2.0, 1.5, 0.48],
      [8.3, 1.64, 1.35, 0.4],
      [8.58, 1.64, 1.35, 0.4],
      [8.58, 1.28, 1.2, 0.34],
      [8.85, 1.28, 1.2, 0.34],
    ]),
    BONE,
  );
  add(
    loft(
      [-0.2, 0.22].map((z) =>
        place(
          [
            [1.05, 8.05],
            [-1.05, 8.05],
            [-1.05, 7.72],
            [-0.68, 7.72],
            [-0.68, 7.46],
            [0.68, 7.46],
            [0.68, 7.72],
            [1.05, 7.72],
          ],
          V(0, 0, z),
          X,
          Y,
        ),
      ),
    ),
    BONE,
  );
  // arms
  for (const s of [1, -1]) {
    add(
      column(s * 2.0, -1.2, [
        [7.4, 0.6, 0.76, 0.22],
        [8.35, 0.64, 0.8, 0.24],
        [8.65, 0.5, 0.64, 0.2],
        [8.8, 0.28, 0.4, 0.12],
      ]),
      FIG,
    );
    add(
      column(s * 2.0, -1.25, [
        [8.3, 0.5, 0.62, 0.18],
        [7.0, 0.46, 0.58, 0.18],
        [6.2, 0.48, 0.6, 0.18],
        [5.75, 0.36, 0.46, 0.14],
      ]),
      FIG,
    );
    add(
      column(s * 2.0, -1.25, [
        [6.98, 0.5, 0.62, 0.18],
        [7.02, 0.56, 0.68, 0.2],
        [7.22, 0.56, 0.68, 0.2],
        [7.26, 0.5, 0.62, 0.18],
      ]),
      BONE,
    );
    const E = V(s * 2.0, 0, -1.3),
      Wr = V(s * 1.2, 0, 1.45);
    const f = Wr.clone().sub(E).normalize(),
      L = Wr.clone().sub(E).length();
    const sideAx = V(f.z, 0, -f.x);
    const at = (t, y) => E.clone().addScaledVector(f, t).setY(y);
    add(
      loft(
        [
          [-0.35, 0.4, 0.33, 5.93],
          [0, 0.47, 0.36, 5.96],
          [L * 0.6, 0.45, 0.35, 5.95],
          [L, 0.38, 0.3, 5.9],
        ].map(([t, a, b, y]) => place(crect(a, b, 0.13), at(t, y), sideAx, Y)),
      ),
      FIG,
    );
    // open hand, palm down, fingers grooved and curling over the knee
    const fingers = (d) => [
      [-0.5, 0.05, d],
      [0, 0.05, d],
      [0.5, 0.05, d],
    ];
    add(
      loft(
        [
          [L - 0.12, 0.4, 0.18, 5.78, 0, 0],
          [L + 0.45, 0.52, 0.18, 5.78, 0, 0],
          [L + 1.15, 0.5, 0.15, 5.76, 0, 0.06],
          [L + 1.4, 0.48, 0.14, 5.7, 35, 0.06],
          [L + 1.53, 0.46, 0.13, 5.52, 75, 0.06],
          [L + 1.56, 0.44, 0.12, 5.3, 90, 0.05],
        ].map(([t, a, b, y, deg, d]) => {
          const th = (deg * Math.PI) / 180;
          const up = Y.clone()
            .multiplyScalar(Math.cos(th))
            .addScaledVector(f, Math.sin(th));
          return place(crect(a, b, 0.08, fingers(d)), at(t, y), sideAx, up);
        }),
      ),
      FIG,
    );
    const thumb = sideAx.clone().multiplyScalar(-s * 0.54);
    add(
      loft(
        [
          [L + 0.02, 0.12, 0.13, 5.7],
          [L + 0.6, 0.12, 0.12, 5.68],
          [L + 0.92, 0.1, 0.1, 5.64],
        ].map(([t, a, b, y]) =>
          place(crect(a, b, 0.05), at(t, y).add(thumb), sideAx, Y),
        ),
      ),
      FIG,
    );
  }
  // neck, head, the slit mask and channels down the back of the head
  add(
    column(0, -1.1, [
      [8.6, 0.65, 0.65, 0.2],
      [9.6, 0.65, 0.65, 0.2],
    ]),
    FIG,
  );
  add(
    column(0, -1.05, [
      [9.35, 0.82, 0.9, 0.3],
      [9.75, 0.92, 0.98, 0.3],
      [10.75, 0.93, 1.0, 0.3],
      [11.12, 0.86, 0.94, 0.28],
    ]),
    FIG,
  );
  add(
    loft(
      [
        [-0.1, 0.86, 0.75, 0.24, 0.24, 1.23],
        [0.13, 0.86, 0.75, 0.24, 0.24, 1.23],
        [0.2, 0.8, 0.69, 0.2, 0.34, 1.17],
      ].map(([z, a, b, c, w, d]) =>
        place(crect(a, b, c, [[0, w, d]]), V(0, 10.2, z), X, Y),
      ),
    ),
    BONE,
  );
  block(-0.2, 0.2, 10.72, 10.95, -0.1, 0.18, 0.02, BONE);
  block(-0.2, 0.2, 9.62, 10.8, -0.08, -0.02, 0.005, BASALT);
  for (let i = -2; i <= 2; i++)
    block(i * 0.3 - 0.09, i * 0.3 + 0.09, 9.55, 10.9, -2.1, -1.9, 0.02, FIG);
  // headdress: three receding tiers with groove bands and sunlit caps; the top
  // tier's front right corner is broken away in a jagged slope
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
  add(column(0, -1.0, tierSecs(1.0, 0.94, 12.1, 12.5, 13.05)), SAND);
  block(-1.05, 1.05, 13.05, 13.13, -1.99, -0.01, 0.02, SUN);
  // The break is a diagonal cut across the front right corner that grows up the
  // crown in uneven steps; moving the two corner points along their own faces
  // keeps every ring convex.
  const broken = (y, pullX, pullZ) => {
    const r = place(crect(0.725, 0.68, 0.12), V(0, y, -1.0), X, Z);
    r[1].z -= pullZ;
    r[2].x -= pullX;
    return r;
  };
  const crown = [
    [13.13, 0, 0],
    [13.42, 0, 0],
    [13.62, 0, 0],
    [13.66, 0.08, 0.26],
    [13.71, 0.3, 0.22],
    [13.77, 0.27, 0.48],
    [13.83, 0.5, 0.44],
    [13.88, 0.47, 0.66],
    [13.93, 0.64, 0.62],
  ];
  const tier3 = crown.map(([y, px, pz]) => broken(y, px, pz));
  tier3.splice(
    2,
    0,
    place(crect(0.605, 0.56, 0.1), V(0, 13.42, -1.0), X, Z),
    place(crect(0.605, 0.56, 0.1), V(0, 13.55, -1.0), X, Z),
    place(crect(0.725, 0.68, 0.12), V(0, 13.55, -1.0), X, Z),
  );
  add(loft(tier3), SAND);
  add(loft([13.93, 14.0].map((y) => broken(y, 0.64, 0.62))), SUN);
  mount(medallion(0.5, 0.36), BONE, V(0, 12.58, -0.08), 0);
  mount(crescent(0.26, 0.1), SIENNA, V(0, 12.58, 0.09), 0);

  detail.panel(SAND, -2.55, 2.55, 1.65, 4.1, 3.565, 1.25, 0.78, 0.04, Math.PI);
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 4; i++)
      detail.block(
        SIENNA,
        [sign * (0.48 + i * 0.31), 8.155, 0.317],
        [0.07, 0.18, 0.022],
        0,
      );
    detail.block(BONE, [sign * 2.0, 7.98, -0.405], [0.6, 0.16, 0.055], 0.018);
  }
  detail.line(
    SIENNA,
    [
      [-1.52, 6.34, -0.137],
      [-1.28, 6.58, -0.126],
      [-1.37, 6.86, -0.106],
      [-1.1, 7.14, -0.09],
    ],
    0.024,
  );

  // -------------------------------------------------------------- weathering
  const chunk = prism(
    [
      [-0.3, -0.35],
      [0.28, -0.4],
      [0.36, 0.1],
      [0.05, 0.42],
      [-0.34, 0.2],
    ],
    0,
    0.42,
    SAND,
  );
  chunk.position.set(3.1, 0.98, 3.45);
  chunk.rotation.set(0.12, 0.7, -0.1);
  const chip = prism(
    [
      [-0.2, -0.15],
      [0.18, -0.18],
      [0.2, 0.12],
      [-0.12, 0.2],
    ],
    0,
    0.22,
    SUN,
  );
  chip.position.set(-3.95, 0.47, 4.95);
  chip.rotation.set(0.05, -0.4, 0.15);

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
