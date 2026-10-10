/**
 * warden, candidate C: a faceted masonry construct.
 *
 * Every mass is a chamfered prism built as its own flat-shaded BufferGeometry,
 * cut the way the explorer is cut, so the Warden reads as carved by the same
 * builders as the ruins: a sixteen-sided chalk pear with an incised base
 * course, a D-shaped bronze mask whose flat face carries a chamfered plate
 * with a real slit, a faceted dome with two incised brow grooves, the
 * disc-and-crescent inlaid in chalk on the back of the head, and a stepped
 * basalt stamp with a stamp-ochre band. The sash is laid onto the body's
 * facets by raycasting.
 *
 * Front +Z, up +Y, the Warden's left is +X. Every joint is a Group at its
 * pivot with zero rotation at rest; each joint's parts are baked into one mesh
 * per material. Pivots: body and legs at the hips (0.3 m), head at the neck
 * (0.62 m), arms at the shoulders (0.525 m), stamp in the right fist (0.32 m).
 * A positive rotation.x swings a hanging limb backwards and tips the body
 * forwards; rightArm.x near -2.6 raises the stamp beside the mask.
 */
export default function (THREE) {
  const g = new THREE.Group();
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const UP = V3(0, 1, 0);

  // ---- palette (farseek/docs/style-lock.md) ---------------------------------
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const chalk = M(0xc9c2d8, "stone", 0.86);
  const ochre = M(0xd9a441, "fabric", 0.8);
  const bronze = M(0x9a6a35, "metal", 0.5, 0.6);
  const timber = M(0x8a6a48, "timber", 0.85);
  const basalt = M(0x3a3531, "stone", 0.8);
  // The eye is unnamed and just under opaque so the surface pass leaves it
  // alone; the game dims or flares it through emissiveIntensity.
  const glow = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    emissive: 0x39e3d0,
    emissiveIntensity: 1.2,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
  });

  // ---- skeleton: pivots in world metres at rest ------------------------------
  const J = {},
    P = {};
  const joint = (name, parent, x, y, z) => {
    const j = new THREE.Group();
    j.name = name;
    const pp = parent ? P[parent] : [0, 0, 0];
    j.position.set(x - pp[0], y - pp[1], z - pp[2]);
    (parent ? J[parent] : g).add(j);
    J[name] = j;
    P[name] = [x, y, z];
  };
  // Arms hang 35 degrees out from the pear so the stamp clears the feet at
  // rest and the mask when raised overhead.
  const SPLAY = (35 * Math.PI) / 180,
    SS = Math.sin(SPLAY),
    SC = Math.cos(SPLAY);
  const SHX = 0.26,
    SHY = 0.525,
    REACH = 0.245;
  const SIDES = [
    ["left", 1],
    ["right", -1],
  ];
  joint("body", null, 0, 0.3, 0);
  joint("head", "body", 0, 0.62, 0);
  for (const [side, s] of SIDES) {
    joint(side + "Arm", "body", SHX * s, SHY, 0);
    joint(side + "Leg", null, 0.1 * s, 0.3, 0);
  }
  const G = V3(-(SHX + REACH * SS), SHY - REACH * SC, 0);
  joint("stamp", "rightArm", G.x, G.y, G.z);

  // ---- helpers ------------------------------------------------------------------
  const put = (jn, geo, mat, x = 0, y = 0, z = 0, q = null) => {
    const m = new THREE.Mesh(geo, mat);
    const p = P[jn];
    m.position.set(x - p[0], y - p[1], z - p[2]);
    if (q) m.quaternion.copy(q);
    J[jn].add(m);
    return m;
  };
  const along = (d) =>
    new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  const flat = (geo) => {
    const out = geo.index ? geo.toNonIndexed() : geo;
    out.computeVertexNormals();
    return out;
  };
  const gem = (r) => flat(new THREE.SphereGeometry(r, 8, 6));
  // octagon: a w x d rectangle with its corners cut by c
  const oct = (w, d, c) => {
    const x = w / 2,
      z = d / 2;
    return [
      [x - c, z],
      [x, z - c],
      [x, -z + c],
      [x - c, -z],
      [-x + c, -z],
      [-x, -z + c],
      [-x, z - c],
      [-x + c, z],
    ];
  };
  // n-gon with a flat facet facing +Z, same winding as oct
  const ngon = (w, d, n = 12) =>
    Array.from({ length: n }, (_, i) => {
      const a = Math.PI / n + (2 * Math.PI * i) / n;
      return [Math.sin(a) * (w / 2), Math.cos(a) * (d / 2)];
    });
  const disc = (r, n = 16) => ngon(2 * r, 2 * r, n);
  const geoFrom = (pos) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  };
  // faceted solid through rings [y, points]
  const prism = (rings) => {
    const pos = [],
      n = rings[0][1].length;
    const at = (r, i) => {
      const [x, z] = r[1][i % n];
      return [x, r[0], z];
    };
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let k = 0; k < rings.length - 1; k++) {
      const A = rings[k],
        B = rings[k + 1];
      for (let i = 0; i < n; i++) {
        tri(at(A, i), at(A, i + 1), at(B, i + 1));
        tri(at(A, i), at(B, i + 1), at(B, i));
      }
    }
    for (const [r, top] of [
      [rings[0], false],
      [rings[rings.length - 1], true],
    ]) {
      const c = [
        r[1].reduce((s, p) => s + p[0], 0) / n,
        r[0],
        r[1].reduce((s, p) => s + p[1], 0) / n,
      ];
      for (let i = 0; i < n; i++)
        top ? tri(c, at(r, i), at(r, i + 1)) : tri(c, at(r, i + 1), at(r, i));
    }
    return geoFrom(pos);
  };
  // flat ring solid between two concentric outlines of the same count
  const annulus = (outer, inner, y0, y1) => {
    const pos = [],
      n = outer.length;
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    const p3 = (pts, i, y) => {
      const [x, z] = pts[i % n];
      return [x, y, z];
    };
    for (let i = 0; i < n; i++) {
      tri(p3(outer, i, y0), p3(outer, i + 1, y0), p3(outer, i + 1, y1));
      tri(p3(outer, i, y0), p3(outer, i + 1, y1), p3(outer, i, y1));
      tri(p3(inner, i, y0), p3(inner, i + 1, y1), p3(inner, i + 1, y0));
      tri(p3(inner, i, y0), p3(inner, i, y1), p3(inner, i + 1, y1));
      tri(p3(inner, i, y1), p3(outer, i, y1), p3(outer, i + 1, y1));
      tri(p3(inner, i, y1), p3(outer, i + 1, y1), p3(inner, i + 1, y1));
      tri(p3(inner, i, y0), p3(outer, i + 1, y0), p3(outer, i, y0));
      tri(p3(inner, i, y0), p3(inner, i + 1, y0), p3(outer, i + 1, y0));
    }
    return geoFrom(pos);
  };
  // a limb: rows [h, w, d, c] along dir from base
  const limb = (jn, base, dir, rows, mat) =>
    put(
      jn,
      prism(rows.map(([h, w, d, c]) => [h, oct(w, d, c)])),
      mat,
      base.x,
      base.y,
      base.z,
      along(dir),
    );
  const shape = (pts, holes = []) => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes)
      s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return s;
  };
  const rAt = (prof, y) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [y0, r0] = prof[i],
        [y1, r1] = prof[i + 1];
      if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return prof[prof.length - 1][1];
  };
  // cut incised grooves [y0, y1, depth] into a [y, r] profile
  const carve = (prof, cuts) => {
    let out = prof.map((p) => p.slice());
    for (const [a, b, dep] of cuts) {
      const ra = rAt(prof, a),
        rb = rAt(prof, b);
      out = out.filter(([y]) => y < a || y > b);
      out.push([a, ra], [a, ra - dep], [b, rb - dep], [b, rb]);
      out.sort((p, q) => p[0] - q[0]);
    }
    return out;
  };

  // ---- body: a sixteen-sided chalk pear with an incised base course ---------
  const PEAR = [
    [0.197, 0.05],
    [0.203, 0.12],
    [0.215, 0.18],
    [0.235, 0.222],
    [0.262, 0.252],
    [0.3, 0.266],
    [0.345, 0.268],
    [0.395, 0.26],
    [0.45, 0.242],
    [0.505, 0.218],
    [0.555, 0.192],
    [0.6, 0.165],
    [0.635, 0.13],
    [0.655, 0.08],
  ];
  const BZ = 0.88;
  const bodyMesh = put(
    "body",
    prism(
      carve(PEAR, [[0.236, 0.246, 0.01]]).map(([y, r]) => [
        y,
        ngon(2 * r, 2 * r * BZ, 16),
      ]),
    ),
    chalk,
  );

  // sash: a band between two tilted planes, laid onto the facets by raycasting
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const cast = (mesh, from, dir) => {
    ray.set(from, dir);
    const h = ray.intersectObject(mesh, false)[0];
    return h
      ? {
          p: h.point.clone(),
          n: h.face.normal.clone().transformDirection(mesh.matrixWorld),
        }
      : null;
  };
  const SASH = { y0: 0.43, k: 0.45, hw: 0.046, t: 0.013, n: 48 };
  const onPlane = (phi, y0) => {
    const dir = V3(Math.sin(phi), 0, Math.cos(phi));
    let x = 0.24 * dir.x,
      h = null;
    for (let it = 0; it < 6; it++) {
      const got = cast(
        bodyMesh,
        V3(0, y0 + SASH.k * x, 0).addScaledVector(dir, 1),
        dir.clone().negate(),
      );
      if (got) {
        h = got;
        x = got.p.x;
      }
    }
    return h;
  };
  {
    const pos = [];
    const quad = (a, b, c, d, want) => {
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      const t = n.dot(want) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
      for (const v of t) pos.push(v.x, v.y, v.z);
    };
    const off = (h, d) => h.p.clone().addScaledVector(h.n, d);
    const up = [],
      lo = [];
    for (let i = 0; i < SASH.n; i++) {
      const phi = (2 * Math.PI * i) / SASH.n;
      up.push(onPlane(phi, SASH.y0 + SASH.hw));
      lo.push(onPlane(phi, SASH.y0 - SASH.hw));
    }
    const nUp = V3(-SASH.k, 1, 0).normalize(),
      nLo = nUp.clone().negate();
    for (let i = 0; i < SASH.n; i++) {
      const j = (i + 1) % SASH.n;
      const out = up[i].n.clone().add(lo[i].n);
      const [uo, uo2, lo1, lo2] = [
        off(up[i], SASH.t),
        off(up[j], SASH.t),
        off(lo[i], SASH.t),
        off(lo[j], SASH.t),
      ];
      const [ui, ui2, li, li2] = [
        off(up[i], -0.004),
        off(up[j], -0.004),
        off(lo[i], -0.004),
        off(lo[j], -0.004),
      ];
      quad(lo1, lo2, uo2, uo, out);
      quad(ui, uo, uo2, ui2, nUp);
      quad(li, li2, lo2, lo1, nLo);
    }
    put("body", geoFrom(pos), ochre);
  }
  // round bronze badge of office on the sash, over the heart
  const badge = {};
  {
    const bx = 0.075,
      by = SASH.y0 + SASH.k * bx;
    const h = cast(bodyMesh, V3(bx, by, 1), V3(0, 0, -1));
    const base = h.p.clone().addScaledVector(h.n, SASH.t - 0.002);
    badge.top = base.clone().addScaledVector(h.n, 0.024);
    badge.normal = h.n.clone();
    put(
      "body",
      prism([
        [0, disc(0.05, 12)],
        [0.013, disc(0.05, 12)],
        [0.013, disc(0.03, 12)],
        [0.024, disc(0.023, 12)],
      ]),
      bronze,
      base.x,
      base.y,
      base.z,
      along(h.n),
    );
  }
  // Relief that crosses the sash band stays thinner than the sash, or it pierces it.
  const underSash = (p, margin = 0.012) =>
    Math.abs(p.y - (SASH.y0 + SASH.k * p.x)) < SASH.hw + margin;

  // ---- head: a D-shaped bronze mask, flat in front and domed on top ----------
  const HW = 0.215,
    ZF = 0.19,
    ZB = -0.18,
    CF = 0.048,
    ZC = 0.02,
    NB = 5;
  const dring = (hw, zf, zb, cf) => {
    const pts = [
      [hw - cf, zf],
      [hw, zf - cf],
    ];
    for (let i = 0; i <= NB; i++) {
      const a = (i / NB) * Math.PI;
      pts.push([hw * Math.cos(a), zb * Math.sin(a)]);
    }
    pts.push([-hw, zf - cf], [-hw + cf, zf]);
    return pts;
  };
  const headRing = (y, grow = 0) => {
    let hw = HW,
      zf = ZF,
      zb = ZB,
      cf = CF;
    if (y < 0.645) {
      const t = (0.645 - y) / 0.045;
      hw -= 0.045 * t;
      zf -= 0.04 * t;
      zb += 0.035 * t;
    } else if (y > 0.9) {
      const c = Math.cos(Math.asin(Math.min(1, (y - 0.9) / 0.25)));
      hw = HW * c;
      zf = ZC + (ZF - ZC) * Math.sqrt(c);
      zb = ZC + (ZB - ZC) * c;
      cf = CF * c;
    }
    return [y, dring(hw + grow, zf + grow, zb - grow, cf)];
  };
  put(
    "head",
    prism([
      headRing(0.6),
      headRing(0.625),
      headRing(0.64),
      headRing(0.64, 0.009),
      headRing(0.668, 0.009),
      headRing(0.668),
      headRing(0.9),
      headRing(0.94),
      headRing(0.962),
      headRing(0.962, -0.008),
      headRing(0.972, -0.008),
      headRing(0.972),
      headRing(0.988),
      headRing(0.988, -0.008),
      headRing(0.998, -0.008),
      headRing(0.998),
      headRing(1.035),
      headRing(1.068),
      headRing(1.097),
      headRing(1.12),
      headRing(1.138),
      [1.15, dring(0.03, 0.075, -0.012, 0.01)],
    ]),
    bronze,
  );
  // the mask proper: a stepped plate with a pointed slit, and the eye glowing inside it
  const SLIT = [
    [0, 0.745],
    [0.021, 0.764],
    [0.021, 0.9],
    [0, 0.919],
    [-0.021, 0.9],
    [-0.021, 0.764],
  ];
  const plate = new THREE.ExtrudeGeometry(
    shape(
      [
        [-0.138, 0.676],
        [0.138, 0.676],
        [0.15, 0.688],
        [0.15, 0.895],
        [0.114, 0.942],
        [-0.114, 0.942],
        [-0.15, 0.895],
        [-0.15, 0.688],
      ],
      [SLIT],
    ),
    {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelOffset: -0.006,
      bevelSegments: 1,
      curveSegments: 1,
    },
  );
  put("head", flat(plate), bronze, 0, 0, ZF + 0.005);
  const eyeGeo = new THREE.ExtrudeGeometry(
    shape(SLIT.map(([x, y]) => [x * 0.86, 0.832 + (y - 0.832) * 0.97])),
    { depth: 0.02, bevelEnabled: false },
  );
  const eye = put("head", flat(eyeGeo), glow, 0, 0, ZF - 0.01);
  eye.name = "eye";
  eye.userData.keep = true;
  // rounded medallions on the cheeks
  const boss = (r) =>
    prism([
      [0, disc(r, 12)],
      [0.012, disc(r, 12)],
      [0.012, disc(r * 0.5, 12)],
      [0.02, disc(r * 0.42, 12)],
    ]);
  for (const [, s] of SIDES)
    put(
      "head",
      boss(0.045),
      bronze,
      s * (HW - 0.001),
      0.8,
      0.07,
      along(V3(s, 0, 0)),
    );
  // disc and crescent inlaid in chalk on the back of the head
  {
    const cres = new THREE.Shape();
    cres.moveTo(0.04496, 0.021875);
    cres.absarc(
      0,
      0,
      0.05,
      Math.atan2(0.021875, 0.04496),
      Math.PI - Math.atan2(0.021875, 0.04496),
      true,
    );
    cres.absarc(
      0,
      0.02,
      0.045,
      Math.atan2(0.001875, -0.04496),
      Math.atan2(0.001875, 0.04496),
      false,
    );
    const zb = ZB * Math.sin((2 * Math.PI) / 5) - 0.001;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
    put(
      "head",
      flat(
        new THREE.ExtrudeGeometry(cres, {
          depth: 0.012,
          bevelEnabled: false,
          curveSegments: 5,
        }),
      ),
      chalk,
      0,
      0.775,
      zb,
      q,
    );
    put(
      "head",
      prism([
        [0, disc(0.02, 10)],
        [0.012, disc(0.02, 10)],
      ]),
      chalk,
      0,
      0.815,
      zb,
      along(V3(0, 0, -1)),
    );
  }

  // ---- arms: faceted chalk limbs, bronze cuffs --------------------------------
  for (const [side, s] of SIDES) {
    const A = side + "Arm",
      S = V3(...P[A]),
      d = V3(SS * s, -SC, 0);
    put(A, gem(0.082), chalk, S.x, S.y, S.z);
    limb(
      A,
      S,
      d,
      [
        [0.03, 0.14, 0.132, 0.042],
        [0.118, 0.146, 0.138, 0.044],
        [0.118, 0.158, 0.15, 0.047],
        [0.142, 0.158, 0.15, 0.047],
        [0.142, 0.14, 0.132, 0.042],
        [0.206, 0.126, 0.12, 0.037],
      ],
      chalk,
    );
    limb(
      A,
      S,
      d,
      [
        [0.176, 0.14, 0.134, 0.042],
        [0.204, 0.14, 0.134, 0.042],
      ],
      bronze,
    );
  }
  // left hand: a palm and three thick fingers curling towards the body
  {
    const S = V3(...P.leftArm),
      d = V3(SS, -SC, 0),
      nIn = V3(-SC, -SS, 0);
    const W = S.clone().addScaledVector(d, 0.198);
    limb(
      "leftArm",
      W,
      d,
      [
        [0, 0.066, 0.108, 0.022],
        [0.066, 0.064, 0.11, 0.022],
      ],
      chalk,
    );
    const f = d
      .clone()
      .multiplyScalar(Math.cos(0.38))
      .addScaledVector(nIn, Math.sin(0.38));
    for (const dz of [-0.036, 0, 0.036]) {
      const base = W.clone()
        .addScaledVector(d, 0.058)
        .add(V3(0, 0, dz));
      limb(
        "leftArm",
        base,
        f,
        [
          [0, 0.034, 0.032, 0.01],
          [0.052, 0.033, 0.031, 0.01],
          [0.07, 0.02, 0.019, 0.006],
        ],
        chalk,
      );
    }
  }
  // right hand: a fist round the stamp handle, three finger bars across its front
  put(
    "rightArm",
    prism([
      [G.y - 0.054, oct(0.116, 0.108, 0.032)],
      [G.y + 0.046, oct(0.116, 0.108, 0.032)],
      [G.y + 0.056, oct(0.1, 0.092, 0.028)],
    ]),
    chalk,
    G.x - 0.006,
    0,
    G.z,
  );
  for (const dy of [-0.031, 0, 0.031]) {
    put(
      "rightArm",
      prism([
        [-0.05, oct(0.028, 0.032, 0.009)],
        [0.05, oct(0.028, 0.032, 0.009)],
      ]),
      chalk,
      G.x - 0.006,
      G.y + dy,
      G.z + 0.056,
      along(V3(1, 0, 0)),
    );
  }

  // ---- legs: stubby columns, bronze knee bands, round flat feet ---------------
  for (const [side, s] of SIDES) {
    const L = side + "Leg",
      x = 0.1 * s;
    put(L, gem(0.07), chalk, x, 0.3, 0);
    put(
      L,
      prism([
        [0.045, oct(0.12, 0.12, 0.035)],
        [0.285, oct(0.13, 0.13, 0.038)],
      ]),
      chalk,
      x,
      0,
      0,
    );
    put(
      L,
      prism([
        [0.128, oct(0.142, 0.142, 0.042)],
        [0.156, oct(0.142, 0.142, 0.042)],
      ]),
      bronze,
      x,
      0,
      0,
    );
    put(
      L,
      prism([
        [0.046, oct(0.138, 0.138, 0.04)],
        [0.068, oct(0.138, 0.138, 0.04)],
      ]),
      chalk,
      x,
      0,
      0,
    );
    put(
      L,
      prism([
        [0, ngon(0.2, 0.236, 16)],
        [0.034, ngon(0.2, 0.236, 16)],
        [0.052, ngon(0.164, 0.198, 16)],
      ]),
      chalk,
      x,
      0,
      0.03,
    );
  }

  // ---- stamp: stepped basalt head, bronze hoop and ferrule, timber handle -----
  {
    const y = G.y;
    const at = (geo, mat) => put("stamp", geo, mat, G.x, 0, G.z);
    at(
      prism([
        [y - 0.265, disc(0.166)],
        [y - 0.256, disc(0.175)],
        [y - 0.176, disc(0.175)],
        [y - 0.168, disc(0.166)],
        [y - 0.168, disc(0.128)],
        [y - 0.15, disc(0.12)],
        [y - 0.15, disc(0.07)],
      ]),
      basalt,
    );
    at(
      prism([
        [y - 0.234, disc(0.18)],
        [y - 0.198, disc(0.18)],
      ]),
      ochre,
    );
    at(
      prism([
        [y - 0.153, disc(0.05, 12)],
        [y - 0.118, disc(0.05, 12)],
      ]),
      bronze,
    );
    at(
      prism([
        [y - 0.15, disc(0.037, 8)],
        [y - 0.1, disc(0.035, 8)],
        [y + 0.05, disc(0.034, 8)],
        [y + 0.068, disc(0.04, 8)],
      ]),
      timber,
    );
    at(
      prism([
        [y + 0.062, disc(0.04, 8)],
        [y + 0.075, disc(0.052, 8)],
        [y + 0.11, disc(0.052, 8)],
        [y + 0.127, disc(0.034, 8)],
        [y + 0.133, disc(0.02, 8)],
      ]),
      timber,
    );
    // the face carries the disc motif, raised and inked in stamp ochre
    at(annulus(disc(0.132), disc(0.098), y - 0.273, y - 0.264), ochre);
    at(
      prism([
        [y - 0.273, disc(0.055, 12)],
        [y - 0.264, disc(0.055, 12)],
      ]),
      ochre,
    );
  }

  const bead = (jn, at, r, material = bronze, flatten = 1) => {
    const geo = new THREE.SphereGeometry(r, 6, 4);
    geo.scale(1, 1, flatten);
    return put(jn, geo, material, at.x, at.y, at.z);
  };
  const seam = (jn, points, r, material = bronze) =>
    put(
      jn,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        8,
        r,
        4,
        false,
      ),
      material,
    );
  const shellPoint = (angle, y, offset = 0.004) => {
    const direction = V3(Math.sin(angle), 0, Math.cos(angle));
    const hit = cast(
      bodyMesh,
      V3(0, y, 0).addScaledVector(direction, 1),
      direction.clone().negate(),
    );
    return hit.p.addScaledVector(hit.n, offset);
  };
  for (const angle of [-2.55, -1.65, -0.78, 0.78, 1.65, 2.55]) {
    const points = [0.27, 0.33, 0.4, 0.49, 0.555].map((y) =>
      shellPoint(angle, y),
    );
    seam("body", points, 0.0035);
    for (const y of [0.285, 0.535]) {
      const at = shellPoint(angle, y, 0.008);
      if (!underSash(at)) bead("body", at, 0.009);
    }
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const positions = [];
    const outline = [
      [-0.19, 0.277],
      [0.19, 0.277],
      [0.19, 0.337],
      [0.13, 0.348],
      [-0.13, 0.348],
      [-0.19, 0.337],
    ];
    const points = outline.map(([da, y]) => shellPoint(angle + da, y, 0.005));
    const center = shellPoint(angle, 0.312, 0.0105);
    for (let j = 0; j < points.length; j++)
      positions.push(
        ...center.toArray(),
        ...points[j].toArray(),
        ...points[(j + 1) % points.length].toArray(),
      );
    const geo = geoFrom(positions);
    const normal = new THREE.Vector3().fromBufferAttribute(
      geo.attributes.normal,
      0,
    );
    if (normal.dot(V3(Math.sin(angle), 0, Math.cos(angle))) < 0) {
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k += 3) {
        const a = V3().fromBufferAttribute(p, k + 1),
          b = V3().fromBufferAttribute(p, k + 2);
        p.setXYZ(k + 1, ...b.toArray());
        p.setXYZ(k + 2, ...a.toArray());
      }
      geo.computeVertexNormals();
    }
    put("body", geo, chalk);
  }
  for (const side of [-1, 1]) {
    seam(
      "head",
      [
        V3(side * 0.155, 0.704, 0.207),
        V3(side * 0.162, 0.833, 0.207),
        V3(side * 0.127, 0.927, 0.207),
      ],
      0.004,
      chalk,
    );
    for (const y of [0.709, 0.886])
      bead("head", V3(side * 0.13, y, 0.212), 0.0075, chalk, 0.5);
    for (let i = 0; i < 4; i++) {
      const slot = new THREE.BoxGeometry(0.039, 0.007, 0.006);
      put("head", slot, chalk, side * 0.091, 0.741 + i * 0.025, 0.211);
    }
    const jointCap = new THREE.TorusGeometry(0.032, 0.005, 5, 12);
    put(
      "head",
      jointCap,
      chalk,
      side * 0.232,
      0.8,
      0.07,
      new THREE.Quaternion().setFromAxisAngle(
        V3(0, 1, 0),
        (side * Math.PI) / 2,
      ),
    );
  }
  for (const y of [0.774, 0.881])
    put("head", new THREE.BoxGeometry(0.038, 0.004, 0.005), bronze, 0, y, 0.2);
  seam(
    "head",
    [
      V3(0, 1.142, 0.079),
      V3(0, 1.11, 0.125),
      V3(0, 1.04, 0.18),
      V3(0, 0.998, 0.199),
    ],
    0.0038,
    chalk,
  );
  put(
    "body",
    new THREE.TorusGeometry(0.017, 0.003, 5, 12),
    chalk,
    badge.top.x,
    badge.top.y,
    badge.top.z,
    new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), badge.normal),
  );
  bead(
    "body",
    badge.top.clone().addScaledVector(badge.normal, 0.0015),
    0.0075,
    chalk,
    0.45,
  );
  for (const [side, s] of SIDES) {
    const A = side + "Arm",
      S = V3(...P[A]),
      d = V3(SS * s, -SC, 0),
      inward = V3(SC * s, SS, 0);
    for (const h of [0.036, 0.118, 0.159]) {
      const at = S.clone().addScaledVector(d, h);
      limb(
        A,
        at,
        d,
        [
          [0, 0.151, 0.144, 0.037],
          [0.009, 0.151, 0.144, 0.037],
        ],
        bronze,
      );
    }
    for (const h of [0.048, 0.139]) {
      const at = S.clone()
        .addScaledVector(d, h)
        .add(V3(0, 0, 0.074));
      bead(A, at, 0.012, bronze, 0.55);
    }
    const at = S.clone()
      .addScaledVector(d, 0.031)
      .addScaledVector(inward, 0.024);
    const plate = new THREE.SphereGeometry(
      0.079,
      10,
      6,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.64,
    );
    plate.scale(1, 0.65, 1);
    put(A, plate, bronze, at.x, at.y, at.z);
    for (const y of [0.084, 0.183]) {
      put(
        side + "Leg",
        new THREE.BoxGeometry(0.059, 0.027, 0.008),
        bronze,
        s * 0.1,
        y,
        0.067,
      );
      bead(side + "Leg", V3(s * 0.1, y, 0.075), 0.009, chalk, 0.5);
    }
    for (const z of [0.02, 0.055, 0.09])
      put(
        side + "Leg",
        new THREE.BoxGeometry(0.11, 0.004, 0.008),
        bronze,
        s * 0.1,
        0.041,
        z,
      );
  }
  for (const dy of [-0.031, 0, 0.031]) {
    bead(
      "rightArm",
      V3(G.x - 0.027, G.y + dy, G.z + 0.075),
      0.01,
      bronze,
      0.45,
    );
    bead("rightArm", V3(G.x + 0.02, G.y + dy, G.z + 0.075), 0.01, bronze, 0.45);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    bead(
      "stamp",
      V3(G.x + Math.sin(a) * 0.15, G.y - 0.171, G.z + Math.cos(a) * 0.15),
      0.008,
      bronze,
    );
  }
  for (let i = 0; i < 5; i++) {
    put(
      "stamp",
      new THREE.TorusGeometry(0.036, 0.0024, 4, 10).rotateX(Math.PI / 2),
      bronze,
      G.x,
      G.y - 0.089 + i * 0.018,
      G.z,
    );
  }

  // ---- bake each joint's parts into one mesh per material ---------------------
  const boxUV = (geo) => {
    geo.computeBoundingBox();
    const bb = geo.boundingBox,
      sz = bb.getSize(V3());
    const H = Math.max(sz.x, sz.z, 1e-6),
      VY = Math.max(sz.y, 1e-6);
    const p = geo.attributes.position,
      n = geo.attributes.normal,
      uv = new Float32Array(p.count * 2);
    for (let t = 0; t < p.count; t += 3) {
      let ax = 0,
        ay = 0,
        az = 0;
      for (let k = 0; k < 3; k++) {
        ax += Math.abs(n.getX(t + k));
        ay += Math.abs(n.getY(t + k));
        az += Math.abs(n.getZ(t + k));
      }
      for (let k = t; k < t + 3; k++) {
        const x = p.getX(k) - bb.min.x,
          y = p.getY(k) - bb.min.y,
          z = p.getZ(k) - bb.min.z;
        const [u, v] =
          ay >= ax && ay >= az
            ? [x / H, z / VY]
            : ax >= az
              ? [z / H, y / VY]
              : [x / H, y / VY];
        uv[k * 2] = u;
        uv[k * 2 + 1] = v;
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geo;
  };
  const merge = (geos) => {
    let n = 0;
    for (const q of geos) n += q.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3);
    let o = 0;
    for (const q of geos) {
      pos.set(q.attributes.position.array, o * 3);
      nor.set(q.attributes.normal.array, o * 3);
      o += q.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return boxUV(out);
  };
  for (const j of Object.values(J)) {
    const byMat = new Map();
    for (const c of [...j.children]) {
      if (!c.isMesh) continue;
      c.updateMatrix();
      if (c.userData.keep) {
        c.geometry.applyMatrix4(c.matrix);
        c.position.set(0, 0, 0);
        c.quaternion.identity();
        c.scale.set(1, 1, 1);
        boxUV(c.geometry);
        continue;
      }
      const geo = (
        c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()
      ).applyMatrix4(c.matrix);
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(geo);
      j.remove(c);
      c.geometry.dispose();
    }
    for (const [mat, geos] of byMat) j.add(new THREE.Mesh(merge(geos), mat));
  }

  // ---- placement: base at y = 0, centred on x and z, measured on vertices -----
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const add = (mat) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        add(m4.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    add(n.matrixWorld);
  });
  const ctr = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= ctr.x;
    o.position.y -= box.min.y;
    o.position.z -= ctr.z;
  });
  g.updateMatrixWorld(true);

  g.userData.joints = {
    body: J.body,
    head: J.head,
    leftArm: J.leftArm,
    rightArm: J.rightArm,
    leftLeg: J.leftLeg,
    rightLeg: J.rightLeg,
    stamp: J.stamp,
  };
  g.userData.parts = { eye };
  return g;
}
