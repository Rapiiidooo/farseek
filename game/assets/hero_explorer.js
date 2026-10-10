export default function (THREE) {
  const g = new THREE.Group();
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const UP = V3(0, 1, 0);
  const DEG = Math.PI / 180;

  // Palette follows docs/style-lock.md.
  const M = (color, name, roughness, metalness = 0, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...extra,
    });
    m.name = name;
    return m;
  };
  const indigo = M(0x2d3656, "fabric", 0.86);
  const skirtCloth = M(0x2d3656, "fabric", 0.86, 0, { side: THREE.DoubleSide });
  const vermilion = M(0xc2412d, "fabric", 0.8);
  const canvas = M(0xcdbf9f, "fabric", 0.9);
  const leather = M(0x4b2e1e, "fabric", 0.68);
  const bronze = M(0x9a6a35, "metal", 0.42, 0.7);
  // Skin and lenses carry recipe names only so the surface pass keeps them
  // smooth: by colour alone skin classifies as timber and amber as roof tile.
  const skin = M(0x9c6b4e, "plaster", 0.57);
  const amber = M(0x5a3410, "metal", 0.2, 0.3);
  const hair = M(0x3b2618, "fabric", 0.75);
  const white = M(0xbdb5a4, "plaster", 0.5);
  const iris = M(0x765436, "plaster", 0.42);
  const pupil = M(0x201b16, "plaster", 0.28);
  const lips = M(0x83513f, "plaster", 0.61);
  const olive = M(0x6b6a45, "fabric", 0.88);
  const patch = M(0xa99b78, "fabric", 0.92);
  const tin = M(0x7d8a86, "metal", 0.45, 0.6);
  const canteenMat = () => tin;

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
    return j;
  };
  const SIDES = [
    ["left", 1],
    ["right", -1],
  ];
  const UPPER = 0.29,
    FORE = 0.245;
  // arms hang 8 degrees out; the upper arm 5 degrees forward, the forearm a relaxed 12 more
  const hang = (s, fwd) =>
    V3(
      s * Math.sin(8 * DEG),
      -Math.cos(8 * DEG) * Math.cos(fwd),
      Math.cos(8 * DEG) * Math.sin(fwd),
    );
  joint("hips", null, 0, 0.95, 0);
  joint("spine", "hips", 0, 1.05, 0);
  joint("head", "spine", 0, 1.52, 0);
  joint("scarfTail", "spine", 0.07, 1.49, -0.115);
  const ARM = {};
  for (const [side, s] of SIDES) {
    const S = V3(0.21 * s, 1.45, 0),
      du = hang(s, 5 * DEG),
      df = hang(s, 17 * DEG);
    const E = S.clone().addScaledVector(du, UPPER),
      W = E.clone().addScaledVector(df, FORE);
    ARM[side] = { s, S, E, W, df };
    joint(side + "UpperArm", "spine", S.x, S.y, S.z);
    joint(side + "LowerArm", side + "UpperArm", E.x, E.y, E.z);
    joint(side + "Hand", side + "LowerArm", W.x, W.y, W.z);
    joint(side + "UpperLeg", "hips", 0.1 * s, 0.92, 0);
    joint(side + "LowerLeg", side + "UpperLeg", 0.1 * s, 0.5, 0);
  }

  // ---- helpers (world coordinates in, joint-local out) -------------------------
  const put = (jn, geo, mat, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo, mat);
    const p = P[jn];
    m.position.set(x - p[0], y - p[1], z - p[2]);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.q) m.quaternion.copy(o.q);
    if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    J[jn].add(m);
    return m;
  };
  const along = (d, from = UP) =>
    new THREE.Quaternion().setFromUnitVectors(from, d.clone().normalize());
  const basis = (dir, nrm) => {
    const y = dir.clone().normalize();
    const z = nrm.clone().addScaledVector(y, -nrm.dot(y)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(x, y, z),
    );
  };
  // lathe from [radius, height] pairs, bottom to top
  const latheGeo = (prof, seg = 20, phi0 = 0, phiL = Math.PI * 2) =>
    new THREE.LatheGeometry(
      prof.map(([r, h]) => V2(r, h)),
      seg,
      phi0,
      phiL,
    );
  // lathe laid along a limb from a towards b, its local +Z turned forward so it can be flattened
  const limb = (jn, a, b, prof, mat, seg = 12, flat = 1) =>
    put(jn, latheGeo(prof, seg), mat, a.x, a.y, a.z, {
      q: basis(b.clone().sub(a), V3(0, 0, 1)),
      s: [1, 1, flat],
    });
  // extruded outline, centred, bevel inside the drawn size
  const extrude = (shape, depth, bevel = 0, curve = 3) => {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, depth - 2 * bevel),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: curve,
    });
    geo.center();
    return geo;
  };
  const roundRect = (w, h, r) => {
    const s = new THREE.Shape(),
      x = -w / 2,
      y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  };
  // flat strap swept through points with given outward normals
  const ribbonGeo = (pts, nrms, w, t) => {
    const n = pts.length,
      pos = [],
      idx = [];
    const frames = pts.map((p, i) => {
      const T = pts[Math.min(n - 1, i + 1)]
        .clone()
        .sub(pts[Math.max(0, i - 1)])
        .normalize();
      const N = nrms[i].clone().addScaledVector(T, -nrms[i].dot(T)).normalize();
      return { p, B: new THREE.Vector3().crossVectors(T, N).normalize(), N };
    });
    const corner = (f, a, b) =>
      f.p
        .clone()
        .addScaledVector(f.B, (a * w) / 2)
        .addScaledVector(f.N, (b * t) / 2);
    const faces = [
      [
        [1, 1],
        [-1, 1],
      ],
      [
        [-1, 1],
        [-1, -1],
      ],
      [
        [-1, -1],
        [1, -1],
      ],
      [
        [1, -1],
        [1, 1],
      ],
    ];
    for (const [c0, c1] of faces) {
      const base = pos.length / 3;
      for (const f of frames)
        for (const c of [c0, c1]) pos.push(...corner(f, c[0], c[1]).toArray());
      for (let i = 0; i < n - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    for (const [f, sgn] of [
      [frames[0], -1],
      [frames[n - 1], 1],
    ]) {
      const base = pos.length / 3;
      for (const c of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ])
        pos.push(...corner(f, c[0], c[1]).toArray());
      if (sgn > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        new Array((pos.length / 3) * 2).fill(0),
        2,
      ),
    );
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const tubeGeo = (pts, r, segs, radial = 6, closed = false) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts, closed),
      segs,
      r,
      radial,
      closed,
    );
  // Weld coincident vertices and recompute smooth normals: closes lathe and tube
  // seams, rounds extruded caps into their bevels, drops collapsed triangles.
  const weld = (geo) => {
    const src = geo.attributes.position,
      ix = geo.index;
    const map = new Map(),
      pos = [],
      remap = new Uint32Array(src.count);
    for (let i = 0; i < src.count; i++) {
      const x = src.getX(i),
        y = src.getY(i),
        z = src.getZ(i);
      const key =
        Math.round(x * 1e5) +
        "," +
        Math.round(y * 1e5) +
        "," +
        Math.round(z * 1e5);
      let k = map.get(key);
      if (k === undefined) {
        k = pos.length / 3;
        map.set(key, k);
        pos.push(x, y, z);
      }
      remap[i] = k;
    }
    const tri = [],
      n = ix ? ix.count : src.count;
    for (let i = 0; i < n; i += 3) {
      const a = remap[ix ? ix.getX(i) : i],
        b = remap[ix ? ix.getX(i + 1) : i + 1],
        c = remap[ix ? ix.getX(i + 2) : i + 2];
      if (a !== b && b !== c && a !== c) tri.push(a, b, c);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        new Array((pos.length / 3) * 2).fill(0),
        2,
      ),
    );
    out.setIndex(tri);
    out.computeVertexNormals();
    return out;
  };
  // Squared-off plan for a lathe: each ring keeps its radius as half-width and
  // takes the depth given for its height and bearing (a superellipse, n = 3 unless told).
  const SQ = 3;
  const superR = (phi, a, b, n = SQ) =>
    1 /
    Math.pow(
      Math.abs(Math.sin(phi) / a) ** n + Math.abs(Math.cos(phi) / b) ** n,
      1 / n,
    );
  const squared = (geo, depth, bearing = (phi) => phi, expo = () => SQ) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        a = Math.hypot(x, z);
      if (a < 1e-6) continue;
      const phi = bearing(Math.atan2(x, z), y);
      const r = superR(phi, a, depth(a, y, phi), expo(y));
      p.setXYZ(i, r * Math.sin(phi), y, r * Math.cos(phi));
    }
    return weld(geo);
  };

  const garment = (tab, segments = 28, phase = 0, amplitude = 0.0024) => {
    const low = tab[0][1],
      high = tab.at(-1)[1],
      samples = [];
    for (let i = 0; i <= 48; i++) {
      const y = THREE.MathUtils.lerp(low, high, i / 48);
      const row = tab.findIndex((point) => point[1] >= y);
      const k = Math.max(0, row - 1),
        a = tab[k],
        b = tab[Math.min(k + 1, tab.length - 1)];
      const t = b[1] === a[1] ? 0 : (y - a[1]) / (b[1] - a[1]);
      samples.push([THREE.MathUtils.lerp(a[0], b[0], t), y]);
    }
    const geo = latheGeo(samples, segments),
      p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        r = Math.hypot(x, z);
      if (r < 1e-5) continue;
      const t = (y - low) / (high - low),
        a = Math.atan2(x, z);
      const envelope = Math.sin(t * Math.PI) ** 2;
      const fold =
        Math.sin(a * 3 + t * 11 + phase) * 0.18 +
        Math.exp(-(((t - 0.2 - 0.07 * Math.sin(a + phase)) / 0.11) ** 2)) *
          Math.sin(t * 30 + a * 2) *
          0.7 +
        Math.exp(-(((t - 0.78 - 0.08 * Math.sin(a)) / 0.1) ** 2)) *
          Math.sin(t * 31 - a) *
          0.65;
      const radius = r + amplitude * envelope * fold;
      p.setXYZ(i, (x * radius) / r, y, (z * radius) / r);
    }
    return weld(geo);
  };
  const bootUpper = () => {
    const section = [
      [-0.105, 0.016, 0.07, 0.027],
      [-0.09, 0.046, 0.099, 0.07],
      [-0.06, 0.057, 0.113, 0.076],
      [-0.018, 0.063, 0.113, 0.073],
      [0.04, 0.064, 0.093, 0.049],
      [0.1, 0.061, 0.08, 0.036],
      [0.15, 0.054, 0.074, 0.031],
      [0.18, 0.032, 0.07, 0.026],
      [0.186, 0.001, 0.07, 0.001],
    ];
    const positions = [],
      indices = [],
      sides = 24;
    for (const [z, w, cy, h] of section)
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        positions.push(Math.sin(a) * w, cy + Math.cos(a) * h, z);
      }
    for (let j = 0; j < section.length - 1; j++)
      for (let i = 0; i < sides; i++) {
        const a = j * (sides + 1) + i,
          b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(indices);
    return weld(geo);
  };

  // ---- the jacket body as one lathe, and its surface for straps and pockets ----
  const TORSO = [
    [0.972, 0.166],
    [1.06, 0.16],
    [1.15, 0.155],
    [1.25, 0.174],
    [1.32, 0.201],
    [1.37, 0.213],
    [1.405, 0.218],
    [1.435, 0.212],
    [1.46, 0.184],
    [1.475, 0.151],
    [1.49, 0.1],
    [1.5, 0.058],
    [1.516, 0.04],
    [1.525, 0],
  ];
  const KT = 0.62;
  // the jacket's plan squares off at the armpits, so a raised or swung arm's root sinks into it
  const band = (y, a, b) => Math.min(1, Math.max(0, (y - a) / (b - a)));
  const torsoN = (y) =>
    2.25 + 0.55 * band(y, 1.15, 1.34) - 0.55 * band(y, 1.445, 1.48);
  const profR = (tab, y) => {
    if (y <= tab[0][0]) return [tab[0][1], 0];
    for (let i = 0; i < tab.length - 1; i++) {
      const [y0, r0] = tab[i],
        [y1, r1] = tab[i + 1];
      if (y <= y1)
        return [r0 + ((r1 - r0) * (y - y0)) / (y1 - y0), (r1 - r0) / (y1 - y0)];
    }
    return [tab[tab.length - 1][1], 0];
  };
  const onBody = (x, y, z, lift) => {
    const [r, dr] = profR(TORSO, y),
      b = KT * r,
      e = torsoN(y);
    const f = 1 / Math.pow(Math.abs(x / r) ** e + Math.abs(z / b) ** e, 1 / e);
    const p = V3(x * f, y, z * f);
    const n = V3(
      (Math.sign(p.x) * Math.abs(p.x) ** (e - 1)) / r ** e,
      -dr / r,
      (Math.sign(p.z) * Math.abs(p.z) ** (e - 1)) / b ** e,
    ).normalize();
    return { p: p.addScaledVector(n, lift), n };
  };
  const strap = (jn, ctrl, w, t, mat, per = 4, rise = () => 0) => {
    const pts = [],
      nrms = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      for (let k = 0; k < per; k++) {
        const f = k / per;
        const c = ctrl[i].map((v, j) => v + (ctrl[i + 1][j] - v) * f);
        const s = onBody(c[0], c[1], c[2], t / 2 + 0.0045 + rise(c[1]));
        pts.push(s.p);
        nrms.push(s.n);
      }
    }
    const e = ctrl[ctrl.length - 1],
      s = onBody(e[0], e[1], e[2], t / 2 + 0.0045 + rise(e[1]));
    pts.push(s.p);
    nrms.push(s.n);
    return put(jn, ribbonGeo(pts, nrms, w, t), mat, 0, 0, 0);
  };
  const onFace = (jn, geo, mat, x, y, face, lift) => {
    const { p, n } = onBody(x, y, face * 0.3, lift);
    return put(jn, geo, mat, p.x, p.y, p.z, { q: basis(UP, n) });
  };

  // ---- hips: seat, squared belt, satchel ---------------------------------------
  // The fixed skirt's half-width by height, and its depth behind: 0.13 under the belt,
  // 0.2 at the hem, clear of a thigh swung 35 degrees back.
  const SKIRT = [
    [0.212, 0.846],
    [0.21, 0.862],
    [0.206, 0.884],
    [0.201, 0.91],
    [0.196, 0.935],
    [0.19, 0.96],
    [0.184, 0.985],
  ];
  const flare = (y) =>
    0.13 + 0.07 * Math.pow(Math.min(1, Math.max(0, (0.985 - y) / 0.139)), 1.2);
  put("hips", new THREE.SphereGeometry(0.16, 12, 8), canvas, 0, 0.905, -0.005, {
    s: [1.0, 0.56, 0.74],
  });
  const KB = 0.713,
    BELT_Y = 0.971,
    BELT_A = 0.187;
  put(
    "hips",
    squared(
      latheGeo(
        [
          [0.176, 0.966],
          [0.187, BELT_Y],
          [0.19, 0.984],
          [0.19, 1.036],
          [0.187, 1.048],
          [0.176, 1.053],
        ],
        24,
      ),
      (a) => a * KB,
    ),
    leather,
    0,
    0,
    0,
  );
  {
    const buckle = roundRect(0.064, 0.052, 0.01);
    buckle.holes.push(roundRect(0.038, 0.028, 0.005));
    put(
      "hips",
      extrude(buckle, 0.01, 0, 2),
      bronze,
      0,
      1.01,
      0.19 * KB + 0.004,
    );
    put(
      "hips",
      new THREE.BoxGeometry(0.008, 0.03, 0.01),
      bronze,
      0.004,
      1.01,
      0.19 * KB + 0.006,
    );
  }
  // a point on the fixed skirt (or the belt above it) at a plan bearing and height, lifted off the cloth
  const SKIRT_A = (y) =>
    profR(
      SKIRT.map(([a, h]) => [h, a]),
      y,
    )[0];
  const skirtAt = (phi, y, lift) => {
    const a = y > 0.985 ? 0.19 : SKIRT_A(y),
      b = y > 0.985 ? 0.19 * KB : Math.cos(phi) >= 0 ? a * 0.72 : flare(y);
    const r = superR(phi, a, b) + lift;
    return V3(r * Math.sin(phi), y, r * Math.cos(phi));
  };
  // satchel on the right hip, hanging over the flared skirt, its top leaning in
  let satchelLoops;
  {
    const b = -123 * DEG;
    const out = V3(Math.sin(b), 0, Math.cos(b)),
      tan = V3(Math.cos(b), 0, -Math.sin(b));
    const up = UP.clone()
      .multiplyScalar(Math.cos(15 * DEG))
      .addScaledVector(out, -Math.sin(15 * DEG));
    const nz = new THREE.Vector3().crossVectors(tan, up);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(tan, up, nz),
    );
    const C = V3(0, 0.862, 0).addScaledVector(out, 0.262);
    const at = (lx, ly, lz) =>
      C.clone()
        .addScaledVector(tan, lx)
        .addScaledVector(up, ly)
        .addScaledVector(nz, lz);
    const pl = (geo, mat, v) => put("hips", geo, mat, v.x, v.y, v.z, { q });
    const bag = new THREE.Shape();
    bag.moveTo(-0.09, 0.075);
    bag.lineTo(0.09, 0.075);
    bag.lineTo(0.09, -0.035);
    bag.quadraticCurveTo(0.09, -0.075, 0.05, -0.075);
    bag.lineTo(-0.05, -0.075);
    bag.quadraticCurveTo(-0.09, -0.075, -0.09, -0.035);
    bag.lineTo(-0.09, 0.075);
    pl(extrude(bag, 0.068, 0.01, 6), leather, at(0, 0, 0));
    const flap = new THREE.Shape();
    flap.moveTo(-0.094, 0.08);
    flap.lineTo(0.094, 0.08);
    flap.lineTo(0.094, -0.005);
    flap.quadraticCurveTo(0.094, -0.035, 0.05, -0.035);
    flap.lineTo(-0.05, -0.035);
    flap.quadraticCurveTo(-0.094, -0.035, -0.094, -0.005);
    flap.lineTo(-0.094, 0.08);
    const side = nz.dot(out) > 0 ? 1 : -1;
    pl(extrude(flap, 0.012, 0.003, 6), leather, at(0, 0.022, 0.039 * side));
    pl(
      new THREE.BoxGeometry(0.03, 0.034, 0.01),
      bronze,
      at(0, -0.01, 0.047 * side),
    );
    satchelLoops = [
      at(0.08, 0.07, -0.02 * side),
      at(-0.08, 0.07, -0.02 * side),
    ];
  }

  // ---- the skirt: sides and vented back hang from the hips, flared behind ------
  const skirtDepth = (a, y, phi) => (Math.cos(phi) >= 0 ? a * 0.72 : flare(y));
  const EDGE = 72 * DEG;
  for (const s of [1, -1]) {
    // each half runs from the side seam round to the centre-back vent, which opens towards the hem
    const vent = (y) =>
      0.004 + 0.022 * Math.min(1, Math.max(0, (0.975 - y) / 0.129));
    const bearing = (phi, y) => {
      const u = (Math.abs(phi) - EDGE) / (Math.PI - EDGE);
      return s * (EDGE + u * (Math.PI - vent(y) - EDGE));
    };
    const half = latheGeo(SKIRT, 12, s > 0 ? EDGE : -Math.PI, Math.PI - EDGE);
    put("hips", squared(half, skirtDepth, bearing), skirtCloth, 0, 0, 0);
  }
  // the satchel hangs from two straps that run up the skirt and under the belt
  for (const lo of satchelLoops) {
    const phi = Math.atan2(lo.x, lo.z);
    const pts = [
      lo,
      skirtAt(phi, 0.952, 0.006),
      skirtAt(phi, 0.975, 0.004),
      skirtAt(phi, 0.995, -0.004),
    ];
    put(
      "hips",
      ribbonGeo(
        pts,
        pts.map((q) => V3(q.x, 0, q.z).normalize()),
        0.026,
        0.008,
      ),
      leather,
      0,
      0,
      0,
    );
  }
  // the vent's underlap, so the seat never shows through it
  put(
    "hips",
    squared(
      latheGeo(
        SKIRT.map(([a, y]) => [a * 0.97, y]),
        4,
        Math.PI - 0.12,
        0.24,
      ),
      (a, y, phi) => skirtDepth(a, y, phi) * 0.97,
    ),
    skirtCloth,
    0,
    0,
    0,
  );
  // hem rolls give the cloth an edge
  for (const s of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const phi = s * (EDGE + (i / 12) * (Math.PI - 0.026 - EDGE));
      const r = superR(phi, 0.212, skirtDepth(0.212, 0.846, phi));
      pts.push(V3(r * Math.sin(phi), 0.848, r * Math.cos(phi)));
    }
    put("hips", tubeGeo(pts, 0.0045, 14, 4), skirtCloth, 0, 0, 0);
  }

  // ---- the front halves of the skirt, carried by the thighs ----------------------
  // Above 25 to 34 degrees under the hip hinge (the X axis at y 0.92) each is a surface of
  // revolution about it, so a thigh swinging on that hinge only slides it round its own
  // circle: forward, up under the belt; back, down over the thigh. At each x the radius
  // puts that circle just under the belt's lower edge. Below, the cloth hangs straight
  // to the hem, which a 60 degree swing lifts only as far as the belt.
  const HY = 0.92;
  const beltZ = (x) =>
    BELT_A * KB * Math.pow(Math.max(0, 1 - Math.abs(x / BELT_A) ** SQ), 1 / SQ);
  const flapR = (x) => Math.hypot(beltZ(x), BELT_Y - HY) - 0.004;
  for (const [side, s] of SIDES) {
    const x0 = -0.008 * s,
      x1 = 0.182 * s,
      NX = 14,
      NV = 10,
      HEM = 0.846;
    const pos = [],
      idx = [],
      hemPts = [];
    for (let i = 0; i <= NX; i++) {
      const x = x0 + ((x1 - x0) * i) / NX;
      // the left half tucks 6 mm under the right one where they overlap at the centre
      const tuck =
        s > 0 ? 0.006 * Math.min(1, Math.max(0, (0.016 - x) / 0.012)) : 0;
      // the straight part starts lower towards the sides, where the belt's plan turns back
      const k = Math.min(1, Math.max(0, (Math.abs(x) - 0.1) / 0.06)),
        KNEE = -(25 + 9 * k * k * (3 - 2 * k)) * DEG;
      const R = flapR(x) - tuck,
        zs = R * Math.cos(KNEE),
        ys = HY + R * Math.sin(KNEE);
      for (let j = 0; j <= 2; j++) pos.push(x, HEM + ((ys - HEM) * j) / 3, zs);
      for (let j = 0; j <= NV - 3; j++) {
        const a = KNEE + (80 * DEG - KNEE) * Math.pow(j / (NV - 3), 1.4);
        pos.push(x, HY + R * Math.sin(a), R * Math.cos(a));
      }
      hemPts.push(V3(x, HEM + 0.002, zs - 0.002));
    }
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j,
          b = a + NV + 1;
        if (s > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    put(side + "UpperLeg", weld(geo), skirtCloth, 0, 0, 0);
    put(side + "UpperLeg", tubeGeo(hemPts, 0.0045, 14, 4), skirtCloth, 0, 0, 0);
  }

  // ---- spine: jacket, placket, pockets, satchel strap, scarf roll, rope coil ----
  put(
    "spine",
    squared(
      garment(
        TORSO.map(([y, r]) => [r, y]),
        32,
        0.4,
        0.0025,
      ),
      (a) => a * KT,
      undefined,
      torsoN,
    ),
    indigo,
    0,
    0,
    0,
  );
  strap(
    "spine",
    [
      [0, 1.1, 1],
      [0, 1.44, 1],
    ],
    0.026,
    0.008,
    indigo,
    5,
  );
  for (const y of [1.16, 1.25])
    onFace(
      "spine",
      latheGeo(
        [
          [0.011, 0],
          [0.011, 0.004],
          [0.006, 0.008],
          [0, 0.009],
        ],
        10,
      ),
      bronze,
      0,
      y,
      1,
      0.004,
    ).rotateX(Math.PI / 2);
  for (const [, s] of SIDES) {
    onFace(
      "spine",
      extrude(roundRect(0.088, 0.094, 0.012), 0.014, 0.003),
      indigo,
      0.09 * s,
      1.315,
      1,
      0.004,
    );
    const flap = new THREE.Shape();
    flap.moveTo(-0.049, 0.018);
    flap.lineTo(0.049, 0.018);
    flap.lineTo(0.049, -0.006);
    flap.lineTo(0, -0.024);
    flap.lineTo(-0.049, -0.006);
    flap.lineTo(-0.049, 0.018);
    onFace(
      "spine",
      extrude(flap, 0.012, 0.003),
      indigo,
      0.09 * s,
      1.37,
      1,
      0.012,
    );
    onFace(
      "spine",
      new THREE.SphereGeometry(0.009, 8, 6),
      bronze,
      0.09 * s,
      1.352,
      1,
      0.02,
    );
  }
  const line = (a, b, n) =>
    Array.from({ length: n + 1 }, (_, i) =>
      a.map((c, j) => c + ((b[j] - c) * i) / n),
    );
  // the front run rides over the right chest pocket and its flap
  const overPocket = (y) =>
    0.015 *
    Math.min(1, Math.max(0, Math.min((y - 1.205) / 0.05, (1.45 - y) / 0.04)));
  strap(
    "spine",
    line([-0.19, 1.03, 0.2], [0.075, 1.5, 0.2], 8),
    0.045,
    0.012,
    leather,
    2,
    overPocket,
  );
  strap(
    "spine",
    line([0.075, 1.5, -0.2], [-0.15, 1.03, -0.2], 6),
    0.045,
    0.012,
    leather,
    2,
  );
  {
    const N = 48,
      R = 12,
      positions = [],
      indices = [];
    const at = (a, v, inside) => {
      const fold =
        0.0032 * Math.sin(v * Math.PI * 4 + a * 2) * Math.sin(v * Math.PI);
      const radius =
        0.067 + 0.009 * Math.sin(v * Math.PI) + fold - (inside ? 0.004 : 0);
      const y =
        1.502 + 0.034 * v + 0.003 * Math.sin(a + 0.5) + 0.002 * Math.sin(a * 2);
      return V3(
        Math.sin(a) * radius,
        y,
        Math.cos(a) * (radius * 0.87 + 0.008 * (1 - v)),
      );
    };
    for (const inside of [false, true])
      for (let j = 0; j <= R; j++)
        for (let i = 0; i <= N; i++)
          positions.push(...at((i / N) * Math.PI * 2, j / R, inside).toArray());
    const count = (N + 1) * (R + 1);
    for (const inner of [0, 1])
      for (let j = 0; j < R; j++)
        for (let i = 0; i < N; i++) {
          const a = inner * count + j * (N + 1) + i,
            b = a + N + 1;
          if (inner) indices.push(a, b, a + 1, b, b + 1, a + 1);
          else indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
    for (const j of [0, R])
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i,
          b = a + count;
        if (j === 0) indices.push(a, b, a + 1, b, b + 1, a + 1);
        else indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(indices);
    put("spine", weld(geo), vermilion, 0, 0, 0);
  }
  // coil of rope on the back: a helix of three turns with its end hanging free
  {
    const pts = [];
    const turns = 3.2,
      N = 64;
    for (let i = 0; i <= N; i++) {
      const t = i / N,
        a = Math.PI / 2 + t * turns * Math.PI * 2;
      const r = 0.094 + 0.03 * t + 0.004 * Math.sin(a * 1.7);
      pts.push(
        V3(-0.02 + Math.cos(a) * r, 1.22 + Math.sin(a) * r, -0.232 - t * 0.04),
      );
    }
    const end = pts[pts.length - 1];
    pts.push(
      V3(end.x - 0.012, end.y - 0.05, end.z - 0.004),
      V3(end.x - 0.02, end.y - 0.1, end.z),
    );
    put("spine", tubeGeo(pts, 0.0135, 72, 5), canvas, 0, 0, 0);
    put(
      "spine",
      latheGeo(
        [
          [0.026, -0.035],
          [0.03, -0.03],
          [0.03, 0.03],
          [0.026, 0.035],
        ],
        12,
      ),
      leather,
      -0.02,
      1.33,
      -0.25,
      { r: [0, 0, Math.PI / 2], s: [1, 1, 1.6] },
    );
    put(
      "spine",
      latheGeo(
        [
          [0.026, -0.035],
          [0.03, -0.03],
          [0.03, 0.03],
          [0.026, 0.035],
        ],
        12,
      ),
      leather,
      -0.13,
      1.22,
      -0.25,
      { s: [1, 1, 1.6] },
    );
  }

  // ---- scarf tail: an extruded strip bent to hang behind the left shoulder ----
  put(
    "scarfTail",
    latheGeo(
      [
        [0, -0.019],
        [0.013, -0.017],
        [0.02, -0.011],
        [0.018, -0.004],
        [0.013, 0.002],
        [0.019, 0.009],
        [0.014, 0.016],
        [0, 0.019],
      ],
      16,
    ),
    vermilion,
    0.067,
    1.5,
    -0.118,
    { r: [-0.12, 0.32, -0.35], s: [1, 1, 0.5] },
  );
  {
    const pts = [
      V3(0.046, 1.522, -0.061),
      V3(0.054, 1.514, -0.083),
      V3(0.064, 1.504, -0.108),
      V3(0.07, 1.488, -0.136),
    ];
    put(
      "scarfTail",
      ribbonGeo(
        pts,
        pts.map(() => V3(0.45, 0.25, -1).normalize()),
        0.04,
        0.006,
      ),
      vermilion,
      0,
      0,
      0,
    );
  }
  {
    const L = 0.34,
      tail = new THREE.Shape();
    tail.moveTo(-0.05, 0);
    tail.lineTo(0.05, 0);
    tail.lineTo(0.044, -L + 0.02);
    tail.lineTo(0.026, -L);
    tail.lineTo(0.012, -L + 0.028);
    tail.lineTo(0, -L + 0.004);
    tail.lineTo(-0.012, -L + 0.028);
    tail.lineTo(-0.026, -L);
    tail.lineTo(-0.044, -L + 0.02);
    tail.lineTo(-0.05, 0);
    const geo = new THREE.ExtrudeGeometry(tail, {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 1,
      curveSegments: 2,
    });
    geo.translate(0, 0, -0.008);
    // hang it: slide outwards and curl slightly off the back as it falls
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i),
        f = -y / L;
      p.setXYZ(
        i,
        p.getX(i) - 0.075 * f - 0.02 * f * f,
        y * 0.97,
        p.getZ(i) + 0.012 * Math.sin(f * Math.PI),
      );
    }
    geo.computeVertexNormals();
    // lay the strip's face towards the back-left
    put("scarfTail", geo, vermilion, 0.07, 1.488, -0.136, {
      q: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.06, Math.PI - 0.34, 0),
      ),
    });
  }

  const skull = [
    [1.506, 0.034, 0.032, -0.036],
    [1.522, 0.038, 0.051, -0.047],
    [1.535, 0.048, 0.072, -0.061],
    [1.552, 0.06, 0.077, -0.075],
    [1.575, 0.072, 0.072, -0.086],
    [1.598, 0.078, 0.073, -0.094],
    [1.624, 0.079, 0.072, -0.098],
    [1.646, 0.078, 0.079, -0.096],
    [1.67, 0.076, 0.074, -0.091],
    [1.692, 0.069, 0.061, -0.08],
    [1.71, 0.058, 0.039, -0.065],
    [1.727, 0.038, 0.009, -0.045],
    [1.739, 0.001, -0.019, -0.021],
  ];
  const profile = (y) => {
    const i = Math.max(
      0,
      Math.min(skull.length - 2, skull.findIndex((row) => row[0] >= y) - 1),
    );
    const a = skull[i],
      b = skull[i + 1];
    const t = THREE.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const before = skull[Math.max(0, i - 1)],
      after = skull[Math.min(skull.length - 1, i + 2)];
    return a.slice(1).map((v, k) => {
      const component = k + 1;
      const d = b[0] - a[0];
      const ma = ((b[component] - before[component]) / (b[0] - before[0])) * d;
      const mb = ((after[component] - v) / (after[0] - a[0])) * d;
      return (
        (2 * t * t * t - 3 * t * t + 1) * v +
        (t * t * t - 2 * t * t + t) * ma +
        (-2 * t * t * t + 3 * t * t) * b[component] +
        (t * t * t - t * t) * mb
      );
    });
  };
  const gauss = (x, y, cx, cy, sx, sy) =>
    Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);
  const relief = (x, y) =>
    0.018 * gauss(x, y, 0, 1.61, 0.0115, 0.03) +
    0.012 * gauss(x, y, 0, 1.593, 0.013, 0.009) +
    0.004 * gauss(x, y, 0, 1.561, 0.03, 0.014) +
    0.002 * gauss(x, y, 0, 1.537, 0.03, 0.011) +
    [-1, 1].reduce(
      (sum, side) =>
        sum +
        0.0035 * gauss(x, y, side * 0.046, 1.602, 0.024, 0.016) +
        0.0028 * gauss(x, y, side * 0.011, 1.588, 0.007, 0.0045) +
        0.002 * gauss(x, y, side * 0.032, 1.638, 0.02, 0.006) -
        0.008 * gauss(x, y, side * 0.032, 1.6225, 0.021, 0.011) -
        0.0015 * gauss(x, y, side * 0.023, 1.576, 0.01, 0.012),
      0,
    );
  const faceZ = (x, y) => {
    const [w, front] = profile(y);
    return front * Math.sqrt(Math.max(0, 1 - (x / w) ** 2)) + relief(x, y);
  };
  const loftHead = (sides, rings, exponent) => {
    const positions = [],
      indices = [];
    for (let j = 0; j <= rings; j++) {
      const y = THREE.MathUtils.lerp(skull[0][0], skull.at(-1)[0], j / rings);
      const [w, front, back] = profile(y);
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const sin = Math.sin(a),
          cos = Math.cos(a);
        const x = Math.sign(sin) * Math.abs(sin) ** exponent * w;
        const z =
          cos >= 0 ? faceZ(x, y) : -Math.abs(back) * Math.abs(cos) ** exponent;
        positions.push(x, y, z);
      }
    }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < sides; i++) {
        const a = j * (sides + 1) + i,
          b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(indices);
    return weld(geo);
  };
  const headGeo = loftHead(64, 64, 1);
  put("head", headGeo, skin, 0, 0, 0);
  put(
    "head",
    new THREE.CylinderGeometry(0.037, 0.043, 0.065, 20),
    skin,
    0,
    1.514,
    -0.004,
  );
  const patchMesh = (rows, columns, point) => {
    const positions = [],
      indices = [];
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= columns; i++)
        positions.push(...point(i / columns, j / rows).toArray());
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < columns; i++) {
        const a = j * (columns + 1) + i,
          b = a + columns + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(indices);
    return weld(geo);
  };
  for (const [, side] of SIDES) {
    const cx = side * 0.032,
      cy = 1.623;
    const eyeAt = (u, v, lift = 0) => {
      const x = cx + u * 0.0142;
      const y =
        cy +
        v * (v > 0 ? 0.0048 : 0.0035) * (1 - 0.36 * Math.abs(u)) -
        side * u * 0.00065;
      return V3(
        x,
        y,
        faceZ(x, y) + 0.0007 + 0.003 * (1 - u * u - v * v) + lift,
      );
    };
    const irisAt = (u, v) => {
      const x = cx - 0.00015 * side + u * 0.0053;
      const horizontal = (x - cx) / 0.0142,
        edge = 1 - 0.36 * Math.abs(horizontal);
      const low = -0.0035 * edge,
        high = 0.0048 * edge;
      const y =
        cy + THREE.MathUtils.clamp(v * 0.0053, low + 0.00025, high - 0.00025);
      const p = eyeAt(
        horizontal,
        (y - cy) / ((y > cy ? 0.0048 : 0.0035) * edge),
      );
      p.z += 0.0003;
      return p;
    };
    const disc = (point) => {
      const geo = patchMesh(5, 28, (t, r) =>
        point(Math.cos(t * Math.PI * 2) * r, Math.sin(t * Math.PI * 2) * r),
      );
      const ix = geo.index.array;
      for (let i = 0; i < ix.length; i += 3)
        [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
      geo.computeVertexNormals();
      return geo;
    };
    put("head", disc(eyeAt), white, 0, 0, 0);
    put("head", disc(irisAt), iris, 0, 0, 0);
    put(
      "head",
      disc((u, v) => irisAt(u * 0.43, v * 0.43).add(V3(0, 0, 0.00035))),
      pupil,
      0,
      0,
      0,
    );
    for (const upper of [1, -1]) {
      const lid = patchMesh(4, 28, (t, v) => {
        const u = t * 2 - 1,
          arc = Math.sqrt(Math.max(0, 1 - u * u));
        const p = eyeAt(u, arc * upper);
        const width = (upper > 0 ? 0.0052 : 0.0036) * arc;
        p.y += upper * width * v;
        p.z =
          faceZ(p.x, p.y) +
          0.0004 +
          Math.sin(v * Math.PI) * 0.0015 * arc +
          (1 - v) * 0.0008;
        return p;
      });
      if (upper < 0) {
        const ix = lid.index.array;
        for (let i = 0; i < ix.length; i += 3)
          [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
        lid.computeVertexNormals();
      }
      put("head", lid, skin, 0, 0, 0);
    }
    const brow = patchMesh(2, 20, (t, v) => {
      const x = side * (0.015 + t * 0.034),
        y = 1.6368 + Math.sin(t * Math.PI) * 0.0022 - t * 0.0025;
      const yy =
        y + (v - 0.5) * (0.0032 * Math.sin(t * Math.PI) ** 0.45 + 0.0004);
      return V3(x, yy, faceZ(x, yy) + 0.0008);
    });
    if (side < 0) {
      const ix = brow.index.array;
      for (let i = 0; i < ix.length; i += 3)
        [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
      brow.computeVertexNormals();
    }
    put("head", brow, hair, 0, 0, 0);
    const ear = new THREE.SphereGeometry(1, 20, 14);
    const ep = ear.attributes.position;
    for (let i = 0; i < ep.count; i++) {
      const x = ep.getX(i),
        y = ep.getY(i),
        z = ep.getZ(i);
      ep.setXYZ(
        i,
        x * (0.0095 + 0.0015 * y),
        y * 0.022,
        z * 0.009 -
          (z > 0 ? 0.005 * Math.exp(-((x / 0.63) ** 2 + (y / 0.66) ** 2)) : 0),
      );
    }
    put("head", weld(ear), skin, side * 0.08, 1.609, -0.006, {
      r: [0, side * 0.28, side * -0.08],
    });
    const helix = Array.from({ length: 20 }, (_, i) => {
      const a = -0.8 + (i / 19) * Math.PI * 1.75;
      return V3(
        side * (0.082 + Math.cos(a) * 0.007),
        1.611 + Math.sin(a) * 0.018,
        0.0005,
      );
    });
    put("head", tubeGeo(helix, 0.0013, 20, 5), skin, 0, 0, 0);
    put(
      "head",
      new THREE.SphereGeometry(1, 10, 6),
      lips,
      side * 0.083,
      1.607,
      0.001,
      { s: [0.003, 0.007, 0.002] },
    );
    put(
      "head",
      new THREE.SphereGeometry(1, 10, 6),
      lips,
      side * 0.0085,
      1.587,
      faceZ(side * 0.0085, 1.587) + 0.00015,
      { s: [0.0023, 0.00075, 0.00065] },
    );
  }
  for (const upper of [1, -1]) {
    const lip = patchMesh(5, 32, (t, v) => {
      const x = (t * 2 - 1) * 0.0245,
        edge = Math.sin(t * Math.PI);
      const seam = 1.5595 + 0.0012 * Math.abs(x / 0.0245);
      const width =
        upper > 0
          ? (0.0024 +
              0.0013 * Math.exp(-(((Math.abs(x) - 0.007) / 0.004) ** 2))) *
            edge
          : 0.0043 * edge;
      const y = seam + upper * width * v;
      const z =
        faceZ(x, y) +
        edge * (0.0006 + 0.0024 * Math.sin(v * Math.PI) + 0.001 * (1 - v));
      return V3(x, y, z);
    });
    if (upper < 0) {
      const ix = lip.index.array;
      for (let i = 0; i < ix.length; i += 3)
        [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
      lip.computeVertexNormals();
    }
    put("head", lip, lips, 0, 0, 0);
  }
  const mouth = Array.from({ length: 17 }, (_, i) => {
    const x = ((i / 16) * 2 - 1) * 0.0235,
      y = 1.5595 + 0.0012 * Math.abs(x / 0.0245);
    return V3(x, y, faceZ(x, y) + 0.00175);
  });
  put("head", tubeGeo(mouth, 0.00025, 20, 4), lips, 0, 0, 0);
  const hairPoint = (a, t, lift = 0) => {
    const edge =
      1.36 +
      (1 - Math.cos(a)) * 0.51 +
      0.07 * Math.sin(a * 2 + 0.3) +
      0.03 * Math.sin(a * 5);
    const theta = t * edge;
    const wave = 0.0014 * Math.sin(a * 9 + t * 4) * Math.sin(t * Math.PI);
    return V3(
      Math.sin(a) * Math.sin(theta) * (0.085 + lift + wave) +
        0.008 * Math.sin(theta * 2),
      1.654 + Math.cos(theta) * (0.096 + lift),
      -0.015 + Math.cos(a) * Math.sin(theta) * (0.1 + lift + wave),
    );
  };
  {
    const cap = patchMesh(24, 56, (u, t) => hairPoint(u * Math.PI * 2, t));
    const ix = cap.index.array;
    for (let i = 0; i < ix.length; i += 3)
      [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    cap.computeVertexNormals();
    put("head", cap, hair, 0, 0, 0);
    const ends = [-1.31, -0.93, -0.49, -0.04, 0.37, 0.94];
    for (let k = 0; k < ends.length; k++) {
      const end = ends[k],
        start = 0.17 + 0.055 * Math.sin(k * 1.7) ** 2,
        finish = 0.89 + 0.09 * Math.sin(k * 1.8) ** 2;
      const lock = patchMesh(5, 20, (u, v) => {
        const t = start + (finish - start) * u;
        const sweep = 0.97 + 0.26 * Math.sin(k * 2.1);
        const a =
          end +
          sweep * (1 - t) ** 1.3 +
          (v - 0.5) * (0.3 + 0.075 * Math.sin(k * 2.2));
        return hairPoint(
          a,
          t,
          0.0002 +
            0.0015 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI) ** 0.65,
        );
      });
      put("head", lock, hair, 0, 0, 0);
    }
    const forelock = patchMesh(5, 24, (u, v) => {
      const t = 0.4 + 0.64 * u;
      const a =
        0.5 -
        0.95 * u +
        0.15 * Math.sin(u * Math.PI) +
        (v - 0.5) * 0.17 * (1 - u * 0.88);
      return hairPoint(
        a,
        t,
        0.0003 + 0.002 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI),
      );
    });
    put("head", forelock, hair, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const end = 1.65 + k * 0.7;
      const lock = patchMesh(3, 14, (u, v) =>
        hairPoint(
          end + 0.42 * (1 - u) + (v - 0.5) * 0.25,
          0.28 + u * 0.69,
          0.0002 + 0.0012 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI),
        ),
      );
      put("head", lock, hair, 0, 0, 0);
    }
  }
  put(
    "head",
    tubeGeo(
      [
        V3(0, 1.611, -0.102),
        V3(0.003, 1.583, -0.129),
        V3(0.01, 1.548, -0.153),
        V3(0.016, 1.501, -0.155),
      ],
      0.016,
      18,
      8,
    ),
    hair,
    0,
    0,
    0,
  );
  put(
    "head",
    new THREE.TorusGeometry(0.017, 0.004, 6, 16),
    vermilion,
    0.004,
    1.583,
    -0.13,
    { r: [1.9, 0, 0] },
  );

  // ---- arms: lathe sleeves with a deltoid swell, rolled cuffs, flared gauntlets ----
  for (const [side] of SIDES) {
    const A = ARM[side],
      U = side + "UpperArm",
      L = side + "LowerArm";
    // Sleeve, from the elbow (h = 0) up past the shoulder pivot (h = 0.29): a closed,
    // lipped end that stays over the elbow when it bends, a taper to 0.093 at the
    // elbow, the deltoid swell to 0.122, and a cap flattened so the shoulder line runs on.
    const sleeve = garment(
      [
        [0, -0.05],
        [0.026, -0.044],
        [0.0405, -0.031],
        [0.0488, -0.013],
        [0.0492, -0.002],
        [0.0468, 0.016],
        [0.0466, 0.045],
        [0.0495, 0.1],
        [0.0548, 0.16],
        [0.0598, 0.21],
        [0.0614, 0.25],
        [0.055, 0.285],
        [0.034, 0.303],
        [0.015, 0.312],
        [0.004, 0.317],
        [0, 0.318],
      ],
      28,
      0.7,
      0.0027,
    );
    // lean the cap in over the shoulder joint, so the shoulder line runs on from the collar
    // and a raised or swung arm tucks its cap into the body rather than showing its end
    const sp = sleeve.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const k = Math.min(1, Math.max(0, (sp.getY(i) - 0.2) / 0.118));
      sp.setX(i, sp.getX(i) - A.s * 0.022 * k * k * (3 - 2 * k));
    }
    put(U, weld(sleeve), indigo, A.E.x, A.E.y, A.E.z, {
      q: basis(A.S.clone().sub(A.E), V3(0, 0, 1)),
      s: [1, 1, 0.9],
    });
    // Forearm, from the wrist (h = 0) up to the elbow (h = 0.245): a dome inside the
    // sleeve's end, the sleeve rolled into a thick cuff, the shirt sleeve tapering
    // from 0.085 to 0.065, and the glove's short flared gauntlet closed at the wrist.
    limb(
      L,
      A.W,
      A.E,
      [
        [0.036, 0.152],
        [0.047, 0.155],
        [0.0555, 0.163],
        [0.0568, 0.174],
        [0.0515, 0.185],
        [0.0565, 0.193],
        [0.0568, 0.203],
        [0.0525, 0.213],
        [0.0402, 0.222],
        [0.04, 0.245],
        [0.0346, 0.265],
        [0.02, 0.2796],
        [0, 0.285],
      ],
      indigo,
      14,
    );
    limb(
      L,
      A.W,
      A.E,
      [
        [0.0325, 0.028],
        [0.0336, 0.055],
        [0.0372, 0.1],
        [0.0408, 0.135],
        [0.0425, 0.158],
        [0.0425, 0.172],
        [0.035, 0.178],
      ],
      canvas,
      12,
    );
    limb(
      L,
      A.W,
      A.E,
      [
        [0, -0.004],
        [0.021, -0.008],
        [0.0332, -0.0135],
        [0.0358, -0.004],
        [0.0381, 0.013],
        [0.0412, 0.028],
        [0.0448, 0.04],
        [0.0466, 0.0485],
        [0.0444, 0.052],
        [0.0405, 0.047],
        [0.0368, 0.04],
        [0.034, 0.034],
      ],
      leather,
      14,
    );
  }

  // ---- hands: extruded palm and thumb outlines, tube fingers in a loose half fist ----
  // Hand space: x across the hand towards the thumb, y from the wrist to the
  // fingertips, z out of the palm. The left hand's frame is a mirror image, so its
  // triangles are flipped after the move.
  const handFrame = (A) => {
    const a = A.df.clone();
    const p0 = V3(-A.s * Math.cos(20 * DEG), 0, -Math.sin(20 * DEG));
    const p = p0.addScaledVector(a, -p0.dot(a)).normalize();
    const t =
      A.s > 0
        ? new THREE.Vector3().crossVectors(p, a)
        : new THREE.Vector3().crossVectors(a, p);
    const m = new THREE.Matrix4().makeBasis(t, a, p).setPosition(A.W);
    return { m, flip: m.determinant() < 0 };
  };
  const toHand = (geo, F) => {
    geo.applyMatrix4(F.m);
    if (F.flip) {
      const ix = geo.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        const t = ix[i + 1];
        ix[i + 1] = ix[i + 2];
        ix[i + 2] = t;
      }
    }
    geo.computeVertexNormals();
    return geo;
  };
  // a finger: a tube through its joints, swelling at the knuckle, tapering, closed at the tip
  const fingerGeo = (pts, r, seg = 10, radial = 6) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const geo = new THREE.TubeGeometry(curve, seg, r, radial, false);
    const p = geo.attributes.position,
      c = V3(),
      o = V3();
    for (let i = 0; i <= seg; i++) {
      curve.getPointAt(i / seg, c);
      const k =
        i === seg
          ? 0
          : i === seg - 1
            ? 0.68
            : (i === 2 ? 1.07 : 1) - (0.15 * i) / seg;
      for (let j = 0; j <= radial; j++) {
        const n = i * (radial + 1) + j;
        o.fromBufferAttribute(p, n).sub(c);
        const w = o.x;
        o.x = 0;
        o.multiplyScalar(0.97 * k);
        o.x = w * 0.95 * k;
        p.setXYZ(n, c.x + o.x, c.y + o.y, c.z + o.z);
      }
    }
    return weld(geo);
  };
  // a side outline round a bent centreline, drawn inside the bevel that will grow it
  const outlineShape = (cl, hw, tipSteps = 5) => {
    const left = [],
      right = [];
    cl.forEach(([x, y], i) => {
      const [px, py] = cl[Math.max(0, i - 1)],
        [nx, ny] = cl[Math.min(cl.length - 1, i + 1)];
      const l = Math.hypot(nx - px, ny - py),
        n = [-(ny - py) / l, (nx - px) / l];
      left.push(V2(x + n[0] * hw[i], y + n[1] * hw[i]));
      right.push(V2(x - n[0] * hw[i], y - n[1] * hw[i]));
    });
    const [ex, ey] = cl[cl.length - 1],
      [lx, ly] = cl[cl.length - 2],
      r = hw[hw.length - 1];
    const a0 = Math.atan2(ey - ly, ex - lx),
      tip = [];
    for (let k = 1; k <= tipSteps; k++) {
      const a = a0 + Math.PI / 2 - (k * Math.PI) / (tipSteps + 1);
      tip.push(V2(ex + Math.cos(a) * r, ey + Math.sin(a) * r));
    }
    return new THREE.Shape([...left, ...tip, ...right.reverse()]);
  };
  // the palm's outline, drawn 9.5 mm inside the finished edge the bevel will grow
  const PALM = [
    [-0.019, -0.0045],
    [0.0, -0.0065],
    [0.019, -0.0045],
    [0.0265, 0.008],
    [0.031, 0.03],
    [0.0295, 0.055],
    [0.028, 0.074],
    [0.016, 0.0805],
    [-0.001, 0.0785],
    [-0.016, 0.0745],
    [-0.0265, 0.0675],
    [-0.0285, 0.05],
    [-0.0265, 0.025],
    [-0.0225, 0.006],
  ];
  // [across, knuckle, phalanx lengths, curl at each joint in degrees, radius]: index to little finger
  const FINGERS = [
    [0.0309, 0.087, [0.04, 0.026, 0.02], [24, 42, 20], 0.0102],
    [0.00965, 0.088, [0.044, 0.028, 0.021], [27, 46, 22], 0.0108],
    [-0.0116, 0.084, [0.041, 0.026, 0.02], [30, 50, 24], 0.0102],
    [-0.03105, 0.076, [0.033, 0.021, 0.018], [34, 54, 26], 0.0089],
  ];
  // thumb joints in hand space: base inside the heel, the web, the bend, the tip beside the index
  const THUMB = [
    [0.021, 0.02, 0.006],
    [0.039, 0.052, 0.017],
    [0.043, 0.083, 0.027],
    [0.04, 0.106, 0.03],
  ];
  const PALM_B = 0.0095,
    PALM_D = 0.011;
  const palmTaper = (y) => 1.12 - 2.3 * (y + 0.014);
  const palmCentre = {};
  // Each hand has two sets of fingers and thumb in groups of their own, left out of the bake:
  // open and relaxed, shown at rest, and closed round a grip, shown when the hand holds or
  // grips something. The game shows one or the other (userData.hands).
  const HANDS = {};
  const RELAXED = [
    [9, 14, 8],
    [10, 15, 8],
    [11, 16, 9],
    [13, 18, 10],
  ];
  for (const [side] of SIDES) {
    const A = ARM[side],
      H = side + "Hand",
      F = handFrame(A);
    const outline = new THREE.CatmullRomCurve3(
      PALM.map(([x, y]) => V3(x, y, 0)),
      true,
      "centripetal",
    ).getPoints(20);
    const shape = new THREE.Shape(
      outline.slice(0, -1).map((v) => V2(v.x, v.y)),
    );
    const palm = new THREE.ExtrudeGeometry(shape, {
      depth: PALM_D,
      bevelEnabled: true,
      bevelThickness: PALM_B,
      bevelSize: PALM_B,
      bevelSegments: 3,
      steps: 1,
      curveSegments: 1,
    });
    palm.translate(0, 0, -PALM_D / 2);
    // thicker at the heel than at the knuckles; linear, so the flat faces stay flat
    const pp = palm.attributes.position;
    for (let i = 0; i < pp.count; i++)
      pp.setZ(i, pp.getZ(i) * palmTaper(pp.getY(i)));
    put(H, toHand(weld(palm), F), leather, 0, 0, 0);
    const sets = {};
    for (const mode of ["Open", "Grip"]) {
      const group = new THREE.Group();
      group.name = side + "Hand" + mode;
      J[H].add(group);
      sets[mode] = group;
      FINGERS.forEach(([x, d, len, grip, r], i) => {
        const curl = mode === "Grip" ? grip : RELAXED[i];
        // relaxed, the fingers also fan a little apart
        const fan = mode === "Grip" ? 0 : (x - 0.0) * 0.12;
        const pts = [
          V3(x, d - 0.022, -0.004),
          V3(x + fan * 0.3, d - 0.002, -0.0075),
        ];
        let a = 0,
          c = pts[1];
        for (let k = 0; k < 3; k++) {
          a += curl[k] * DEG;
          c = c
            .clone()
            .add(
              V3(
                fan * (k + 1) * 0.35,
                Math.cos(a) * len[k],
                Math.sin(a) * len[k],
              ),
            );
          pts.push(c);
        }
        pts.push(
          c
            .clone()
            .add(V3(0, Math.cos(a), Math.sin(a)).multiplyScalar(r * 0.4)),
        );
        const m = put(H, toHand(fingerGeo(pts, r), F), leather, 0, 0, 0);
        J[H].remove(m);
        group.add(m);
      });
    }
    HANDS[side + "Open"] = sets.Open;
    HANDS[side + "Grip"] = sets.Grip;
    sets.Grip.visible = false;
    // thumb: its side outline arcs forward out of the heel and back to the index (22 mm
    // thick once the bevel grows it), extruded across its width along the palm's normal
    const tj = THUMB.map(([a, b, c]) => V3(a, b, c)),
      t0 = tj[0];
    const tu = tj[3].clone().sub(t0).normalize();
    const bow = tj[1].clone().sub(t0);
    const tv = bow.addScaledVector(tu, -bow.dot(tu)).normalize();
    const tw = new THREE.Vector3().crossVectors(tu, tv),
      TB = 0.0075;
    const cl = tj.map((q) => {
      const d = q.clone().sub(t0);
      return [d.dot(tu), d.dot(tv)];
    });
    const thumb = new THREE.ExtrudeGeometry(
      outlineShape(cl, [0.0022, 0.0039, 0.0031, 0.0023]),
      {
        depth: 0.0072,
        bevelEnabled: true,
        bevelThickness: TB,
        bevelSize: TB,
        bevelSegments: 3,
        steps: 1,
        curveSegments: 1,
      },
    );
    thumb.translate(0, 0, -0.0036);
    thumb.applyMatrix4(
      new THREE.Matrix4().makeBasis(tu, tv, tw).setPosition(t0),
    );
    for (const mode of ["Grip", "Open"]) {
      const geo = thumb.clone();
      // open, the thumb swings a little out from the palm about its root
      if (mode === "Open")
        geo
          .applyMatrix4(
            new THREE.Matrix4().makeTranslation(-t0.x, -t0.y, -t0.z),
          )
          .applyMatrix4(new THREE.Matrix4().makeRotationY(0.25))
          .applyMatrix4(new THREE.Matrix4().makeTranslation(t0.x, t0.y, t0.z));
      const m = put(H, toHand(weld(geo), F), leather, 0, 0, 0);
      J[H].remove(m);
      sets[mode].add(m);
    }
    // centre of the palm's face, for grips
    const half = (PALM_D / 2 + PALM_B) * palmTaper(0.045);
    palmCentre[side] = V3(0.002, 0.045, half).applyMatrix4(F.m);
  }

  // ---- legs: lathe trousers and boot shafts, extruded boots and soles --------
  for (const [side, s] of SIDES) {
    const U = side + "UpperLeg",
      L = side + "LowerLeg",
      x = 0.1 * s;
    put(U, new THREE.SphereGeometry(0.084, 10, 6), canvas, x, 0.92, 0);
    put(
      U,
      garment(
        [
          [0.07, 0.5],
          [0.074, 0.55],
          [0.089, 0.7],
          [0.093, 0.83],
          [0.087, 0.9],
          [0.06, 0.945],
          [0, 0.95],
        ],
        28,
        s * 0.8,
        0.0025,
      ),
      canvas,
      x,
      0,
      0,
    );
    put(L, new THREE.SphereGeometry(0.07, 10, 8), canvas, x, 0.5, 0);
    put(
      L,
      garment(
        [
          [0.062, 0.3],
          [0.07, 0.325],
          [0.079, 0.345],
          [0.078, 0.37],
          [0.069, 0.4],
          [0.07, 0.46],
          [0.071, 0.5],
        ],
        24,
        s * 0.6,
        0.003,
      ),
      canvas,
      x,
      0,
      0,
    );
    put(
      L,
      latheGeo(
        [
          [0.066, 0.1],
          [0.07, 0.16],
          [0.072, 0.25],
          [0.075, 0.295],
          [0.083, 0.3],
          [0.085, 0.34],
          [0.08, 0.35],
          [0.072, 0.345],
        ],
        12,
      ),
      leather,
      x,
      0,
      0,
    );
    put(L, bootUpper(), leather, x, 0, 0.0180749624);
    // thick sole: the footprint, extruded down to the ground
    const fp = new THREE.Shape();
    fp.moveTo(-0.05, -0.104);
    fp.lineTo(0.05, -0.104);
    fp.quadraticCurveTo(0.06, 0.05, 0.057, 0.13);
    fp.quadraticCurveTo(0.052, 0.195, 0.0, 0.198);
    fp.quadraticCurveTo(-0.052, 0.195, -0.057, 0.13);
    fp.quadraticCurveTo(-0.06, 0.05, -0.05, -0.104);
    put(L, extrude(fp, 0.05, 0.008, 5), leather, x, 0.025, 0.045, {
      r: [Math.PI / 2, 0, 0],
    });
  }

  for (const [, s] of SIDES) {
    const n = V3(0.12 * s, -0.35, 1).normalize();
    const base = V3(0.05 * s, 1.43, 0.145);
    const cup = [
      [0.033, 0],
      [0.034, 0.015],
      [0.032, 0.027],
      [0.029, 0.031],
      [0.024, 0.028],
      [0.024, 0.024],
    ];
    put("spine", latheGeo(cup, 14), bronze, base.x, base.y, base.z, {
      q: along(n),
    });
    const lens = base.clone().addScaledVector(n, 0.025);
    put(
      "spine",
      latheGeo(
        [
          [0.025, 0],
          [0.025, 0.003],
          [0.017, 0.005],
          [0, 0.006],
        ],
        14,
      ),
      amber,
      lens.x,
      lens.y,
      lens.z,
      { q: along(n) },
    );
  }
  put(
    "spine",
    new THREE.BoxGeometry(0.03, 0.011, 0.012),
    bronze,
    0,
    1.438,
    0.162,
  );
  // the backpack: an olive canvas body on the jacket's back, its flap, two straps rising into
  // the scarf, and a bedroll tied on top; the rope coil rides on its back
  put(
    "spine",
    extrude(roundRect(0.26, 0.29, 0.04), 0.1, 0.014, 4),
    olive,
    0,
    1.235,
    -0.17,
  );
  put(
    "spine",
    extrude(roundRect(0.27, 0.12, 0.03), 0.02, 0.006, 4),
    olive,
    0,
    1.33,
    -0.222,
    { r: [-0.12, 0, 0] },
  );
  for (const x of [-0.07, 0.07]) {
    put(
      "spine",
      new THREE.BoxGeometry(0.022, 0.13, 0.008),
      leather,
      x,
      1.27,
      -0.232,
    );
    put(
      "spine",
      new THREE.BoxGeometry(0.03, 0.022, 0.012),
      bronze,
      x,
      1.225,
      -0.236,
    );
    strap(
      "spine",
      [
        [x * 1.2, 1.3, -1],
        [x * 1.2, 1.47, -1],
      ],
      0.03,
      0.008,
      leather,
      4,
    );
  }
  put(
    "spine",
    new THREE.CylinderGeometry(0.056, 0.056, 0.34, 14),
    canvas,
    0,
    1.43,
    -0.17,
    { r: [0, 0, Math.PI / 2] },
  );
  for (const x of [-0.11, 0.11])
    put(
      "spine",
      new THREE.TorusGeometry(0.058, 0.008, 5, 16),
      leather,
      x,
      1.43,
      -0.17,
      { r: [0, Math.PI / 2, 0] },
    );
  // the canteen at the left hip, behind the skirt's flare, on a strap from the belt
  {
    const b = 123 * DEG,
      out = V3(Math.sin(b), 0, Math.cos(b));
    const C = V3(0, 0.875, 0).addScaledVector(out, 0.235);
    put(
      "hips",
      new THREE.CylinderGeometry(0.062, 0.062, 0.032, 18),
      canteenMat(),
      C.x,
      C.y,
      C.z,
      { q: along(out) },
    );
    const cap = C.clone().add(V3(0, 0.068, 0));
    put(
      "hips",
      new THREE.CylinderGeometry(0.012, 0.014, 0.022, 10),
      bronze,
      cap.x,
      cap.y,
      cap.z,
    );
    const top = skirtAt(b, 0.99, 0.004);
    put(
      "hips",
      ribbonGeo(
        [C.clone().add(V3(0, 0.05, 0)), skirtAt(b, 0.95, 0.008), top],
        [out, out, out],
        0.022,
        0.007,
      ),
      leather,
      0,
      0,
      0,
    );
  }
  for (const [side, s] of SIDES) {
    const U = side + "UpperLeg",
      L = side + "LowerLeg",
      x = 0.1 * s;
    // a cargo pocket on the outside of each thigh, its flap buttoned
    put(
      U,
      extrude(roundRect(0.07, 0.085, 0.012), 0.016, 0.004),
      canvas,
      x + 0.089 * s,
      0.705,
      0.004,
      { r: [0, (Math.PI / 2) * s, 0] },
    );
    put(
      U,
      extrude(roundRect(0.074, 0.03, 0.008), 0.012, 0.003),
      patch,
      x + 0.098 * s,
      0.742,
      0.004,
      { r: [0, (Math.PI / 2) * s, 0] },
    );
    put(
      U,
      new THREE.SphereGeometry(0.006, 6, 4),
      bronze,
      x + 0.106 * s,
      0.738,
      0.004,
    );
    // a worn patch over each knee
    put(L, new THREE.SphereGeometry(0.048, 12, 8), patch, x, 0.472, 0.052, {
      s: [1, 1.15, 0.42],
    });
    // laces crossing between two rows of eyelets up the boot's front
    for (const [i, yy] of [0.16, 0.2, 0.24].entries()) {
      for (const dx of [-0.016, 0.016])
        put(
          L,
          new THREE.SphereGeometry(0.006, 6, 4),
          bronze,
          x + dx,
          yy,
          0.073,
        );
      if (i < 2)
        for (const t of [-1, 1])
          put(
            L,
            new THREE.BoxGeometry(0.044, 0.005, 0.004),
            canvas,
            x,
            yy + 0.02,
            0.077,
            { r: [0, 0, t * 0.62] },
          );
    }
  }

  const thread = M(0x55617b, "fabric", 0.93);
  const darkLeather = M(0x352820, "fabric", 0.79);
  for (const [, s] of SIDES) {
    strap(
      "spine",
      [
        [s * 0.105, 1.07, 1],
        [s * 0.118, 1.18, 1],
        [s * 0.142, 1.28, 1],
        [s * 0.145, 1.39, 1],
      ],
      0.0022,
      0.0012,
      thread,
      6,
      () => 0.003,
    );
    strap(
      "spine",
      [
        [s * 0.09, 1.44, 1],
        [s * 0.12, 1.451, 0.7],
        [s * 0.17, 1.45, 0.35],
      ],
      0.003,
      0.0014,
      thread,
      8,
      () => 0.003,
    );
    strap(
      "spine",
      [
        [s * 0.12, 1.09, -1],
        [s * 0.14, 1.25, -1],
        [s * 0.15, 1.4, -1],
      ],
      0.0025,
      0.001,
      thread,
      6,
      () => 0.003,
    );
    for (const y of [1.275, 1.315, 1.35]) {
      const points = [-0.036, -0.018, 0, 0.018, 0.036].map(
        (dx) => onBody(s * 0.09 + dx, y, 1, 0.024).p,
      );
      put("spine", tubeGeo(points, 0.0009, 8, 4), thread, 0, 0, 0);
    }
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64,
        a = t * Math.PI * 4.5,
        r = 0.007 + t * 0.043;
      pts.push(V3(s * 0.173, 1.43 + Math.sin(a) * r, -0.17 + Math.cos(a) * r));
    }
    put("spine", tubeGeo(pts, 0.0015, 64, 4), patch, 0, 0, 0);
  }
  for (const [side, s] of SIDES) {
    const L = side + "LowerLeg",
      U = side + "UpperLeg",
      x = s * 0.1;
    put(
      L,
      extrude(roundRect(0.106, 0.105, 0.027), 0.015, 0.005, 5),
      leather,
      x,
      0.09,
      -0.08,
    );
    for (const z of [-0.078, -0.025, 0.03, 0.085, 0.135]) {
      put(
        L,
        new THREE.BoxGeometry(0.099, 0.009, 0.015),
        darkLeather,
        x,
        0.01,
        z,
      );
    }
    const hem = Array.from({ length: 21 }, (_, i) => {
      const a = (i / 20) * Math.PI * 2;
      return V3(x + Math.sin(a) * 0.083, 0.339, Math.cos(a) * 0.083);
    });
    put(L, tubeGeo(hem, 0.0015, 24, 4, true), patch, 0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const y = 0.14 + i * 0.035;
      for (const sign of [-1, 1]) {
        const points = [
          V3(x + sign * 0.022, y, 0.076),
          V3(x, y + 0.014, 0.081),
          V3(x - sign * 0.022, y + 0.028, 0.076),
        ];
        put(L, tubeGeo(points, 0.0018, 6, 5), canvas, 0, 0, 0);
      }
    }
    const hipSeam = Array.from({ length: 16 }, (_, i) => {
      const y = 0.57 + (i / 15) * 0.27;
      return V3(
        x + s * (0.081 + Math.sin(((y - 0.57) / 0.27) * Math.PI) * 0.008),
        y,
        -0.015,
      );
    });
    put(U, tubeGeo(hipSeam, 0.0014, 18, 4), patch, 0, 0, 0);
    const H = side + "Hand",
      F = handFrame(ARM[side]);
    for (const across of [-0.018, 0, 0.018]) {
      const pts = [
        V3(across, 0.016, -0.018),
        V3(across, 0.043, -0.0155),
        V3(across, 0.067, -0.012),
      ];
      put(H, toHand(tubeGeo(pts, 0.0014, 8, 4), F), darkLeather, 0, 0, 0);
    }
  }

  // ---- bake each joint's parts into one mesh per material ---------------------
  const mergeGeos = (geos) => {
    let nv = 0,
      ni = 0;
    for (const q of geos) {
      nv += q.attributes.position.count;
      ni += q.index ? q.index.count : q.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3),
      nor = new Float32Array(nv * 3),
      uv = new Float32Array(nv * 2);
    const idx = new Uint32Array(ni);
    let ov = 0,
      oi = 0;
    for (const q of geos) {
      const n = q.attributes.position.count;
      pos.set(q.attributes.position.array, ov * 3);
      nor.set(q.attributes.normal.array, ov * 3);
      if (q.attributes.uv) uv.set(q.attributes.uv.array, ov * 2);
      if (q.index)
        for (let i = 0; i < q.index.count; i++)
          idx[oi++] = q.index.array[i] + ov;
      else for (let i = 0; i < n; i++) idx[oi++] = ov + i;
      ov += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  };
  for (const j of [...Object.values(J), ...Object.values(HANDS)]) {
    const byMat = new Map();
    for (const c of [...j.children]) {
      if (!c.isMesh) continue;
      c.updateMatrix();
      const geo = c.geometry.clone().applyMatrix4(c.matrix);
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(geo);
      j.remove(c);
      c.geometry.dispose();
    }
    for (const [mat, geos] of byMat)
      j.add(new THREE.Mesh(mergeGeos(geos), mat));
  }

  // ---- placement: base at y = 0, centred on x and z, measured on vertices -----
  const box3 = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const add = (mat) => {
      for (let i = 0; i < p.count; i++)
        box3.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat));
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
  const ctr = box3.getCenter(new THREE.Vector3());
  const shift = V3(-ctr.x, -box3.min.y, -ctr.z);
  g.children.forEach((o) => {
    o.position.add(shift);
  });

  // ---- grip: soles to fingertips with both upper arms overhead (x = -2.9) -----
  const HANG = -2.9;
  for (const k of Object.keys(HANDS)) HANDS[k].visible = k.endsWith("Grip");
  J.leftUpperArm.rotation.x = HANG;
  J.rightUpperArm.rotation.x = HANG;
  g.updateMatrixWorld(true);
  let top = -Infinity;
  const shown = (n) => {
    for (let o = n; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  for (const k of ["leftLowerArm", "rightLowerArm"]) {
    J[k].traverse((n) => {
      const p = n.isMesh && shown(n) && n.geometry.attributes.position;
      if (!p) return;
      for (let i = 0; i < p.count; i++)
        top = Math.max(
          top,
          v.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld).y,
        );
    });
  }
  J.leftUpperArm.rotation.x = 0;
  J.rightUpperArm.rotation.x = 0;
  for (const k of Object.keys(HANDS)) HANDS[k].visible = k.endsWith("Open");
  g.updateMatrixWorld(true);

  const r3 = (p) => [p.x, p.y, p.z].map((c) => Math.round(c * 1000) / 1000);
  g.userData.joints = {
    hips: J.hips,
    spine: J.spine,
    head: J.head,
    leftUpperArm: J.leftUpperArm,
    leftLowerArm: J.leftLowerArm,
    leftHand: J.leftHand,
    rightUpperArm: J.rightUpperArm,
    rightLowerArm: J.rightLowerArm,
    rightHand: J.rightHand,
    leftUpperLeg: J.leftUpperLeg,
    leftLowerLeg: J.leftLowerLeg,
    rightUpperLeg: J.rightUpperLeg,
    rightLowerLeg: J.rightLowerLeg,
    scarfTail: J.scarfTail,
  };
  g.userData.grip = { hands: Math.round(top * 1000) / 1000 };
  g.userData.hands = HANDS;
  g.userData.palms = {
    left: r3(palmCentre.left.add(shift)),
    right: r3(palmCentre.right.add(shift)),
  };
  return g;
}
