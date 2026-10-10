import { propDetails } from "../props-detail.js";

// path_lantern, arm B: profiles.
// The stone is one four-sided lathe, so it is square and flat shaded, and its
// profile carries everything: three chamfered tiers of base, a 0.2 m shaft with
// two incised grooves near its head (5.5 cm tall, 2.5 cm deep, floors and lips in
// night basalt), and a capital stepped out twice. Turned bronze parts, each step
// crisp: a dish with a raised cup that seats the crystal, four bell sockets, and a
// stepped lid with a finial. The four ribs are tubes swept along curves on the
// diagonals that swell out round the crystal and close under the lid, tapering as
// they rise. The crystal is a cut six-sided lathe, 0.28 m tall, its own mesh.
// 0.6 x 2.4 x 0.6 m; the crystal's centre is 2.13 m up.
export default function (THREE) {
  const g = new THREE.Group();
  const details = propDetails(THREE, g);

  // ---- materials --------------------------------------------------------------
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const BASALT = M(0x3a3531, "stone", 0.84);
  const NIGHT = M(0x2a2830, "stone", 0.92);
  const BRONZE = M(0x9a6a35, "metal", 0.5, 0.6);
  // Dormant crystal with its own material, so the game can light it by raising
  // emissiveIntensity. Unnamed and just under opaque so the loader's procedural
  // surfaces leave it alone.
  const CRYSTAL = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    emissive: 0x39e3d0,
    emissiveIntensity: 0,
    roughness: 0.2,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
    flatShading: true,
  });

  // ---- merging: one mesh per material ---------------------------------------------
  // UVs are projected from each face's dominant axis over the merged mesh's box, so
  // the loader's surfaces keep one texel density across big and small parts.
  const boxUv = (pos, n) => {
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n * 3; i++) {
      lo[i % 3] = Math.min(lo[i % 3], pos[i]);
      hi[i % 3] = Math.max(hi[i % 3], pos[i]);
    }
    const su = Math.max(hi[0] - lo[0], hi[2] - lo[2]) || 1,
      sv = hi[1] - lo[1] || 1;
    const uv = new Float32Array(n * 2);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let t = 0; t < n; t += 3) {
      a.fromArray(pos, t * 3);
      b.fromArray(pos, t * 3 + 3);
      c.fromArray(pos, t * 3 + 6);
      const f = b.sub(a).cross(c.sub(a));
      const ax = Math.abs(f.x),
        ay = Math.abs(f.y),
        az = Math.abs(f.z);
      for (let k = t; k < t + 3; k++) {
        const x = pos[k * 3] - lo[0],
          y = pos[k * 3 + 1] - lo[1],
          z = pos[k * 3 + 2] - lo[2];
        const [u, v] =
          ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
        uv[k * 2] = u / su;
        uv[k * 2 + 1] = v / sv;
      }
    }
    return new THREE.BufferAttribute(uv, 2);
  };
  const merge = (geos) => {
    const flat = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    let n = 0;
    for (const x of flat) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3);
    let o = 0;
    for (const x of flat) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      o += x.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", boxUv(pos, n));
    return out;
  };
  const PARTS = new Map();
  const put = (mat, geo) => {
    if (!PARTS.has(mat)) PARTS.set(mat, []);
    PARTS.get(mat).push(geo);
    return geo;
  };

  // ---- profile tools --------------------------------------------------------------
  // Profiles are [radius, height] and run out along the bottom, up the outside and
  // in along the top, so faces look out. LatheGeometry leaves the last normal of a
  // profile unnormalised; fix it.
  const fixNormals = (geo) => {
    const nr = geo.attributes.normal,
      v = new THREE.Vector3();
    for (let k = 0; k < nr.count; k++) {
      v.fromBufferAttribute(nr, k).normalize();
      nr.setXYZ(k, v.x, v.y, v.z);
    }
    return geo;
  };
  const lathe = (pts, segs, phi = 0) =>
    fixNormals(
      new THREE.LatheGeometry(
        pts.map(([r, y]) => new THREE.Vector2(r, y)),
        segs,
        phi,
      ),
    );
  const facets = (geo) => {
    const f = geo.toNonIndexed();
    f.computeVertexNormals();
    return f;
  };
  // every edge of a stepped profile turned on its own, so its steps stay crisp
  // rather than shading as one soft dome
  const crisp = (mat, pts, segs) => {
    for (let i = 0; i < pts.length - 1; i++)
      put(mat, lathe([pts[i], pts[i + 1]], segs));
  };

  // ---- the stone: a square lathe (half-widths here, turned to corner radii) --------
  // Runs of one profile, each with its material; the grooves are night basalt.
  const SQ = (pts) => pts.map(([h, y]) => [h * Math.SQRT2, y]);
  const groove = (y0, y1) => [
    [0.1, y0],
    [0.075, y0],
    [0.075, y1],
    [0.1, y1],
  ]; // 2.5 cm deep
  const runs = [
    [
      BASALT,
      [
        [0.001, 0],
        [0.3, 0],
        [0.3, 0.1],
        [0.28, 0.12],
        [0.23, 0.12],
        [0.23, 0.2],
        [0.21, 0.22],
        [0.15, 0.22],
        [0.15, 0.28],
        [0.13, 0.3],
        [0.1, 0.3],
        [0.1, 1.48],
      ],
    ],
    [NIGHT, groove(1.48, 1.535)],
    [
      BASALT,
      [
        [0.1, 1.535],
        [0.1, 1.59],
      ],
    ],
    [NIGHT, groove(1.59, 1.645)],
    [
      BASALT,
      [
        [0.1, 1.645],
        [0.1, 1.8],
        [0.13, 1.8],
        [0.13, 1.85],
        [0.16, 1.85],
        [0.16, 1.915],
        [0.14, 1.935],
        [0.001, 1.935],
      ],
    ],
  ];
  for (const [mat, pts] of runs)
    put(mat, facets(lathe(SQ(pts), 4, Math.PI / 4)));

  // ---- bronze: a dish with a raised cup for the crystal, sockets, lid -------------
  crisp(
    BRONZE,
    [
      [0.12, 1.935],
      [0.13, 1.945],
      [0.13, 1.958],
      [0.118, 1.968],
      [0.062, 1.968],
      [0.05, 1.975],
      [0.046, 1.995],
      [0.001, 1.995],
    ],
    16,
  );
  crisp(
    BRONZE,
    [
      [0.001, 2.29],
      [0.132, 2.29],
      [0.132, 2.322],
      [0.12, 2.33],
      [0.095, 2.33],
      [0.095, 2.355],
      [0.088, 2.36],
      [0.058, 2.36],
      [0.058, 2.378],
      [0.03, 2.384],
      [0.014, 2.392],
      [0.001, 2.4],
    ],
    12,
  );

  // ---- four ribs swept along curves on the diagonals, tapering as they rise ---------
  const ribPts = [
    [0.105, 1.97],
    [0.118, 2.0],
    [0.155, 2.06],
    [0.176, 2.13],
    [0.165, 2.2],
    [0.125, 2.262],
    [0.07, 2.305],
  ];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2,
      ox = Math.sin(a),
      oz = Math.cos(a);
    const curve = new THREE.CatmullRomCurve3(
      ribPts.map(([s, y]) => new THREE.Vector3(ox * s, y, oz * s)),
      false,
      "centripetal",
    );
    const TS = 16,
      RS = 6;
    const tube = new THREE.TubeGeometry(curve, TS, 1, RS, false);
    const p = tube.attributes.position,
      cpt = new THREE.Vector3(),
      w = new THREE.Vector3();
    for (let i = 0; i <= TS; i++) {
      const t = i / TS,
        r = 0.02 + (0.014 - 0.02) * t;
      curve.getPointAt(t, cpt);
      for (let j = 0; j <= RS; j++) {
        const q = i * (RS + 1) + j;
        w.fromBufferAttribute(p, q).sub(cpt).multiplyScalar(r).add(cpt);
        p.setXYZ(q, w.x, w.y, w.z);
      }
    }
    put(BRONZE, tube);
    // a bell-shaped socket where the rib leaves the dish
    put(
      BRONZE,
      lathe(
        [
          [0.03, 1.962],
          [0.03, 1.975],
          [0.022, 1.995],
          [0.001, 2.0],
        ],
        8,
      ).translate(ox * 0.105, 0, oz * 0.105),
    );
  }

  // ---- the crystal: its own mesh, centred on its own origin so it can turn ----------
  const CY = 2.13; // tips at 1.99 and 2.27
  const crystal = new THREE.Mesh(
    merge([
      facets(
        lathe(
          [
            [0.001, -0.14],
            [0.045, -0.1],
            [0.068, -0.03],
            [0.068, 0.03],
            [0.045, 0.1],
            [0.001, 0.14],
          ],
          6,
          Math.PI / 6,
        ),
      ),
    ]),
    CRYSTAL,
  );
  crystal.name = "crystal";
  crystal.position.set(0, CY, 0);
  g.add(crystal);

  for (const side of [-1, 1]) {
    for (const y of [0.4, 0.48, 0.56, 1.25, 1.33, 1.41]) {
      put(
        BRONZE,
        new THREE.BoxGeometry(0.08, 0.007, 0.003).translate(0, y, side * 0.101),
      );
      put(
        BRONZE,
        new THREE.BoxGeometry(0.003, 0.007, 0.08).translate(side * 0.101, y, 0),
      );
    }
    for (const y of [0.35, 1.45])
      for (const x of [-0.064, 0.064])
        put(
          BRONZE,
          new THREE.SphereGeometry(0.009, 6, 4)
            .scale(1, 1, 0.45)
            .translate(x, y, side * 0.101),
        );
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    put(
      BRONZE,
      new THREE.SphereGeometry(0.007, 6, 4).translate(
        Math.sin(a) * 0.122,
        2.307,
        Math.cos(a) * 0.122,
      ),
    );
  }
  for (const [mat, geos] of PARTS) g.add(new THREE.Mesh(merge(geos), mat));

  // ---- placement: base at y = 0, centred on x and z (measured on vertices) ---------
  const bb = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const q = n.isMesh && n.geometry.attributes.position;
    if (!q) return;
    const add = (mat) => {
      for (let i = 0; i < q.count; i++)
        bb.expandByPoint(v.fromBufferAttribute(q, i).applyMatrix4(mat));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        add(m.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    add(n.matrixWorld);
  });
  const c = bb.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= bb.min.y;
    o.position.z -= c.z;
  });

  const r3 = (x) => Math.round(x * 1000) / 1000;
  g.userData.parts = { crystal };
  g.userData.light = [
    r3(crystal.position.x),
    r3(crystal.position.y),
    r3(crystal.position.z),
  ];
  return details.batch();
}
