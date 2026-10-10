// ice_block: a chamfered square lofted up Y with jittered faceted walls, spalls cut back to a
// deep-ice core and a frost crust on the cap.
export default function (THREE) {
  const g = new THREE.Group();
  const V3 = THREE.Vector3;
  const UP = new V3(0, 1, 0);

  // Seeded, so every load builds the same block.
  let seed = 7919;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() * 2 - 1) * a;
  const lerp = (a, b, f) => a + (b - a) * f;

  const mat = (color, roughness) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const ICE = mat(0xa9d2e3, 0.4); // clear ice faces
  const DEEP = mat(0x5b9bbd, 0.35); // the core, where a face is cut back
  const RIME = mat(0xe9f2f6, 0.65); // bevels and bubbles
  const FROST = mat(0xe9f2f6, 0.9); // the crust on top

  // --- triangles, bucketed per material ------------------------------------------------
  const buckets = new Map();
  const tri = (m, a, b, c) => {
    let arr = buckets.get(m);
    if (!arr) buckets.set(m, (arr = []));
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  // A polygon fanned from its first point and wound to face `out` (Newell normal).
  const poly = (m, pts, out) => {
    const P = pts.filter(
      (p, i) =>
        p.distanceToSquared(pts[(i + pts.length - 1) % pts.length]) > 1e-10,
    );
    if (P.length < 3) return;
    const n = new V3();
    for (let i = 0; i < P.length; i++) {
      const a = P[i],
        b = P[(i + 1) % P.length];
      n.x += (a.y - b.y) * (a.z + b.z);
      n.y += (a.z - b.z) * (a.x + b.x);
      n.z += (a.x - b.x) * (a.y + b.y);
    }
    const Q = n.dot(out) < 0 ? P.slice().reverse() : P;
    for (let i = 1; i < Q.length - 1; i++) tri(m, Q[0], Q[i], Q[i + 1]);
  };

  // --- the section and the profile -------------------------------------------------------
  const HW = 0.95,
    D = 0.085,
    U = HW - D; // half width, bevel inset (0.12 m across), flat half face
  const H = 1.87,
    N = 5; // top rim of the ice (the crust rises to 1.9), grid cells per face
  const Y0 = D,
    Y1 = H - D,
    YM = (Y0 + Y1) / 2,
    YR = (Y1 - Y0) / 2;
  // 1 at the apex c, 0 at both rims: the shape of each bulge or dip, faceted by the grid.
  const tent = (x, c, r) =>
    Math.max(0, x < c ? (x + r) / (c + r) : (r - x) / (r - c));

  // Per wall: bulge or dip, its depth and apex (fractions of the half face), the chips as
  // groups of grid triangles [column, row, half], and bubbles as [chip, offset along the
  // wall, offset up, radius] from the middle of that chip's floor.
  const cell = (i, j) => [
    [i, j, 0],
    [i, j, 1],
  ];
  const WALLS = [
    {
      bulge: true,
      A: 0.035,
      au: -0.3,
      av: 0.25,
      chips: [
        [...cell(4, 0), ...cell(4, 1), ...cell(3, 0), [3, 1, 0]],
        [...cell(1, 3), [2, 3, 0]],
      ],
      bubbles: [
        [0, -0.07, 0.06, 0.065],
        [0, 0.08, -0.04, 0.045],
        [1, 0.02, 0.01, 0.05],
      ],
    },
    {
      bulge: false,
      A: 0.04,
      au: 0.2,
      av: -0.15,
      chips: [
        [...cell(1, 3), ...cell(2, 3), ...cell(1, 4), [2, 4, 1]],
        [
          [3, 1, 1],
          [4, 1, 0],
        ],
      ],
      bubbles: [[0, 0.06, -0.05, 0.06]],
    },
    {
      bulge: true,
      A: 0.03,
      au: 0.25,
      av: -0.3,
      chips: [
        [...cell(0, 1), ...cell(0, 2), [1, 1, 0], [1, 2, 1]],
        [...cell(3, 3), [4, 3, 0]],
      ],
      bubbles: [[0, -0.05, 0.05, 0.065]],
    },
    {
      bulge: false,
      A: 0.035,
      au: -0.15,
      av: 0.2,
      chips: [
        [...cell(2, 4), ...cell(3, 4), [2, 3, 1], [3, 3, 0]],
        [...cell(0, 0)],
      ],
      bubbles: [[1, 0.03, 0.02, 0.05]],
    },
  ];

  const pk = (i, j) => i * 64 + j;
  const cellTris = (n = N) => {
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // Counter-clockwise seen from outside; the diagonal is picked at random per cell.
        const q = [
          [i, j],
          [i + 1, j],
          [i + 1, j + 1],
          [i, j + 1],
        ];
        const pair =
          rnd() < 0.5
            ? [
                [q[0], q[1], q[2]],
                [q[0], q[2], q[3]],
              ]
            : [
                [q[0], q[1], q[3]],
                [q[1], q[2], q[3]],
              ];
        pair.forEach((tr, w) => cells.set(`${i},${j},${w}`, tr));
      }
    }
    return cells;
  };

  const walls = WALLS.map((spec, k) => {
    const a = (k * Math.PI) / 2;
    const n = new V3(Math.sin(a), 0, Math.cos(a)); // +Z, +X, -Z, -X
    const t = new V3().crossVectors(UP, n); // along the wall, left to right seen from outside
    const P = [];
    for (let i = 0; i <= N; i++) {
      const col = [];
      for (let j = 0; j <= N; j++) {
        const ru = i === 0 || i === N,
          rv = j === 0 || j === N;
        let u = lerp(-U, U, i / N),
          y = lerp(Y0, Y1, j / N);
        // Rim points keep their place along the rim so the bevels stay straight in plan.
        if (!ru && !rv) {
          u += jit(0.06);
          y += jit(0.06);
        } else y += jit(0.01);
        const s = tent(u, spec.au * U, U) * tent(y - YM, spec.av * YR, YR);
        let off = spec.bulge ? -spec.A * (1 - s) : -spec.A * s;
        off += ru || rv ? jit(0.006) : jit(0.024);
        col.push(
          t
            .clone()
            .multiplyScalar(u)
            .addScaledVector(n, HW + Math.min(0, off))
            .setY(y),
        );
      }
      P.push(col);
    }
    return { spec, n, t, P };
  });

  // Sink a group of grid triangles into a scallop: a deep-ice floor shrunk to half size
  // towards the group's centre and pushed in by `depth`, with sloping deep-ice sides.
  const sink = (P, n, tris, depth) => {
    const pts = new Map();
    for (const tr of tris) for (const [i, j] of tr) pts.set(pk(i, j), P[i][j]);
    const c = new V3();
    pts.forEach((p) => c.add(p));
    c.multiplyScalar(1 / pts.size);
    const floor = new Map();
    pts.forEach((p, id) =>
      floor.set(id, c.clone().lerp(p, 0.55).addScaledVector(n, -depth)),
    );
    const edges = new Map();
    for (const tr of tris) {
      poly(
        DEEP,
        tr.map(([i, j]) => floor.get(pk(i, j))),
        n,
      );
      for (let e = 0; e < 3; e++) {
        const ka = pk(...tr[e]),
          kb = pk(...tr[(e + 1) % 3]);
        const key = ka < kb ? `${ka}-${kb}` : `${kb}-${ka}`;
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [ka, kb]);
      }
    }
    // A boundary edge runs counter-clockwise round the group, so the group lies to its left.
    for (const [ka, kb] of edges.values()) {
      const pa = pts.get(ka),
        pb = pts.get(kb);
      const inward = new V3()
        .crossVectors(n, new V3().subVectors(pb, pa))
        .addScaledVector(n, 0.5);
      poly(DEEP, [pa, pb, floor.get(kb), floor.get(ka)], inward);
    }
    return c.addScaledVector(n, -depth);
  };

  const bubbleAt = []; // [a point just outside the wall, its normal, radius], placed last
  for (const { spec, n, t, P } of walls) {
    const cells = cellTris();
    const cut = new Set();
    const floors = spec.chips.map((chip) => {
      chip.forEach(([i, j, w]) => cut.add(`${i},${j},${w}`));
      return sink(
        P,
        n,
        chip.map(([i, j, w]) => cells.get(`${i},${j},${w}`)),
        chip.length > 4 ? 0.095 : 0.065,
      );
    });
    for (const [key, tr] of cells)
      if (!cut.has(key))
        poly(
          ICE,
          tr.map(([i, j]) => P[i][j]),
          n,
        );
    for (const [ci, du, dv, r] of spec.bubbles) {
      bubbleAt.push([
        floors[ci]
          .clone()
          .addScaledVector(t, du)
          .addScaledVector(UP, dv)
          .addScaledVector(n, 0.5),
        n,
        r,
      ]);
    }
  }

  // --- the top cap: a shallow faceted dish under a crust of frost --------------------------
  // Twice the walls' grid, so the crust's wavering outline is not cut into blocks.
  const NT = 2 * N;
  const T = [];
  for (let i = 0; i <= NT; i++) {
    const col = [];
    for (let j = 0; j <= NT; j++) {
      const rim = i === 0 || i === NT || j === 0 || j === NT;
      let x = lerp(-U, U, i / NT),
        v = lerp(-U, U, j / NT); // v runs towards -Z
      if (!rim) {
        x += jit(0.035);
        v += jit(0.035);
      }
      const s = tent(x, 0.15 * U, U) * tent(v, -0.2 * U, U);
      const y = H - 0.016 * s + (rim ? -rnd() * 0.008 : jit(0.005));
      col.push(new V3(x, Math.min(H, y), -v));
    }
    T.push(col);
  }
  const topAt = (p) =>
    T[Math.round(((p.x + U) / (2 * U)) * NT)][
      Math.round(((-p.z + U) / (2 * U)) * NT)
    ];

  // The crust is a shell over the cap whose lift turns negative outside a wavering outline, so
  // it thins into the ice instead of standing on it like a cut-out.
  const crustLift = (p) => {
    const dx = p.x - 0.04,
      dz = p.z + 0.05,
      th = Math.atan2(dz, dx);
    const r =
      0.68 *
      (1 +
        0.12 * Math.sin(2 * th + 0.4) +
        0.1 * Math.sin(3 * th + 2.2) +
        0.06 * Math.sin(5 * th + 1.3) +
        0.05 * Math.sin(9 * th + p.x * 6));
    return (
      0.03 * (1 - (Math.hypot(dx, dz) / r) ** 2) +
      0.005 * Math.sin(p.x * 17 + p.z * 11) -
      0.004
    );
  };
  for (const tr of cellTris(NT).values()) {
    const pts = tr.map(([i, j]) => T[i][j]);
    poly(ICE, pts, UP);
    const lifted = pts.map((p) => p.clone().setY(p.y + crustLift(p)));
    if (lifted.some((p, k) => p.y > pts[k].y)) poly(FROST, lifted, UP);
  }

  // --- bevels: glacier white strips between the walls, the cap and the base ---------------
  const inset = (t, n, u) => t.clone().multiplyScalar(u).addScaledVector(n, U); // on y = 0
  for (let k = 0; k < 4; k++) {
    const A = walls[k],
      B = walls[(k + 1) % 4];
    const nn = A.n.clone().add(B.n);
    for (let j = 0; j < N; j++)
      poly(RIME, [A.P[N][j], A.P[N][j + 1], B.P[0][j + 1], B.P[0][j]], nn);
    const corner = inset(A.t, A.n, U);
    poly(RIME, [A.P[N][N], B.P[0][N], topAt(corner)], nn.clone().add(UP));
    poly(RIME, [A.P[N][0], B.P[0][0], corner], nn.clone().sub(UP));
  }
  const ring = [];
  for (const { n, t, P } of walls) {
    for (let i = 0; i < N; i++) {
      const pa = inset(t, n, lerp(-U, U, i / N)),
        pb = inset(t, n, lerp(-U, U, (i + 1) / N));
      const pm = inset(t, n, lerp(-U, U, (i + 0.5) / N));
      poly(
        RIME,
        [P[i][N], P[i + 1][N], topAt(pb), topAt(pm), topAt(pa)],
        n.clone().add(UP),
      );
      poly(RIME, [P[i][0], P[i + 1][0], pb, pa], n.clone().sub(UP));
      ring.push(pa);
    }
  }
  // The base: one flat fan on y = 0 over the whole footprint inside the bevel.
  const O = new V3();
  for (let m = 0; m < ring.length; m++)
    poly(ICE, [O, ring[m], ring[(m + 1) % ring.length]], UP.clone().negate());

  for (const [m, arr] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    geo.computeVertexNormals(); // unindexed, so every facet keeps its own normal
    g.add(new THREE.Mesh(geo, m));
  }

  // --- trapped bubbles in the chips: flat lenses a few millimetres proud of the floor --------
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const solids = g.children.slice();
  const bubbleGeo = new THREE.SphereGeometry(1, 10, 5).toNonIndexed();
  const bubbles = { position: [], normal: [] };
  for (const [o, n, r] of bubbleAt) {
    ray.set(o, n.clone().negate());
    const hit = ray.intersectObjects(solids, false)[0];
    if (!hit) continue;
    const at = new THREE.Matrix4().compose(
      hit.point.clone().addScaledVector(n, 0.007 - 0.2 * r),
      new THREE.Quaternion().setFromUnitVectors(UP, n),
      new V3(r, r * 0.2, r),
    );
    const b = bubbleGeo.clone().applyMatrix4(at);
    bubbles.position.push(...b.attributes.position.array);
    bubbles.normal.push(...b.attributes.normal.array);
  }
  if (bubbles.position.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(bubbles.position, 3),
    );
    geo.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(bubbles.normal, 3),
    );
    g.add(new THREE.Mesh(geo, RIME));
  }

  // --- placement: base on y = 0, centred on x and z ---------------------------------------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    const p = o.isMesh && o.geometry.attributes.position;
    if (!p) return;
    const put = (mat4) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4));
    };
    if (o.isInstancedMesh) {
      for (let c = 0; c < o.count; c++) {
        o.getMatrixAt(c, im);
        put(m4.multiplyMatrices(o.matrixWorld, im));
      }
      return;
    }
    put(o.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box.min.y;
    o.position.z -= c.z;
  });
  return g;
}
