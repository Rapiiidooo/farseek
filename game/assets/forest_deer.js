/**
 * forest_deer, candidate B: built from profiles.
 *
 * A stag of the wild forest, 2.3 m to the antler tips and 2.1 m from nose to
 * tail. The torso is one loft through sixteen hand-set cross-sections (deep
 * chest, tucked flank, rounded haunch), its lower arc split off as the paler
 * belly and its rear rings as the rump patch. Neck, legs, tail, antler beams
 * and tines are tubes swept along Catmull-Rom centrelines with oval sections
 * that swell at the joints; the head is lofted along its own axis with a pale
 * chin and a dark nose; hooves, ears, burrs and the spore-lime buds are lathes.
 *
 * Front +Z, up +Y, the stag's left is +X. Every joint is a Group at its pivot
 * with zero rotation at rest, its parts baked into one mesh per material: legs
 * at the shoulders (1.0 m) and hips (1.02 m), head and neck at the base of the
 * neck (1.15 m, inside the chest). A positive rotation.x swings a leg backwards
 * and lowers the head towards the ground.
 */
export default function (THREE) {
  const g = new THREE.Group();
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const V2 = (x, y) => new THREE.Vector2(x, y);

  // ---- palette (farseek/docs/style-lock.md) ---------------------------------
  const M = (color, name, roughness, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      ...extra,
    });
    m.name = name;
    return m;
  };
  const fur = M(0x5a4030, "fabric", 0.9); // bark umber coat
  const pale = M(0xb49a6a, "fabric", 0.92); // belly, rump patch, chin, inner ears
  const dark = M(0x3a3531, "fabric", 0.62); // hooves, nose, eyes
  const horn = M(0xe6d3ae, "stone", 0.75); // antlers
  // Fern green under a spore-lime glow, so the buds still read if the game dims them.
  const bud = M(0x7da04a, "foliage", 0.5, {
    emissive: 0xc3f25a,
    emissiveIntensity: 1.3,
  });

  // ---- skeleton: pivots in metres at rest, before the placement shift ---------
  const PIV = {
    body: V(0, 0, 0),
    frontLeft: V(0.13, 1.0, 0.34),
    frontRight: V(-0.13, 1.0, 0.34),
    backLeft: V(0.13, 1.02, -0.56),
    backRight: V(-0.13, 1.02, -0.56),
    head: V(0, 1.15, 0.4),
  };

  // Geometry is written in rest-pose model coordinates, then stored relative to
  // its joint's pivot, as non-indexed triangles in one bucket per joint and material.
  const buckets = new Map();
  const bucket = (joint, material) => {
    if (!buckets.has(joint)) buckets.set(joint, new Map());
    const byMat = buckets.get(joint);
    if (!byMat.has(material)) byMat.set(material, { pos: [], nor: [], uv: [] });
    return byMat.get(material);
  };
  const addGeo = (joint, material, geo, matrix = null) => {
    const q = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) q.applyMatrix4(matrix);
    const p = PIV[joint],
      b = bucket(joint, material);
    const P = q.attributes.position,
      N = q.attributes.normal,
      U = q.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      b.pos.push(P.getX(i) - p.x, P.getY(i) - p.y, P.getZ(i) - p.z);
      b.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      b.uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
    }
  };

  // A smooth skin through closed rings of equal length. pick(i, k) gives the
  // material of the quad between ring i and i + 1 at segment k; caps[0] and
  // caps[1] close the first and last ring with a fan when set. The winding is
  // fixed by the sign of the enclosed volume, the normals averaged per vertex.
  // Texture coordinates are in coat tiles: one tile spans about 0.18 m around the
  // widest ring and 0.32 m along the length, so the hair grain matches on every part.
  const skin = (joint, rings, pick, caps = [null, null]) => {
    const n = rings.length,
      N = rings[0].length;
    const pts = rings.flat();
    const idx = (i, k) => i * N + (k % N);
    const centre = (ring) =>
      ring.reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(N);
    let widest = 0;
    const along = [0];
    rings.forEach((ring, i) => {
      let perimeter = 0;
      for (let k = 0; k < N; k++)
        perimeter += ring[k].distanceTo(ring[(k + 1) % N]);
      widest = Math.max(widest, perimeter);
      if (i > 0)
        along.push(
          along[i - 1] + centre(ring).distanceTo(centre(rings[i - 1])),
        );
    });
    const U = widest / 0.18,
      Vs = along.map((d) => d / 0.32);
    const tris = [];
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < N; k++) {
        const m = pick(i, k);
        const u0 = (k / N) * U,
          u1 = ((k + 1) / N) * U,
          v0 = Vs[i],
          v1 = Vs[i + 1];
        tris.push([
          idx(i, k),
          idx(i, k + 1),
          idx(i + 1, k + 1),
          m,
          [u0, v0, u1, v0, u1, v1],
        ]);
        tris.push([
          idx(i, k),
          idx(i + 1, k + 1),
          idx(i + 1, k),
          m,
          [u0, v0, u1, v1, u0, v1],
        ]);
      }
    }
    [0, n - 1].forEach((end, e) => {
      if (!caps[e]) return;
      pts.push(centre(rings[end]));
      const ci = pts.length - 1,
        v = Vs[end];
      for (let k = 0; k < N; k++) {
        const a = idx(end, k),
          b = idx(end, k + 1),
          u0 = (k / N) * U,
          u1 = ((k + 1) / N) * U;
        tris.push(
          e === 0
            ? [ci, b, a, caps[e], [(u0 + u1) / 2, v - 0.1, u1, v, u0, v]]
            : [ci, a, b, caps[e], [(u0 + u1) / 2, v + 0.1, u0, v, u1, v]],
        );
      }
    });
    const o = new THREE.Vector3();
    for (const p of pts) o.add(p);
    o.divideScalar(pts.length);
    const e1 = new THREE.Vector3(),
      e2 = new THREE.Vector3(),
      cr = new THREE.Vector3();
    let vol = 0;
    for (const [a, b, c] of tris) {
      e1.subVectors(pts[b], pts[a]);
      e2.subVectors(pts[c], pts[a]);
      vol += cr.crossVectors(e1, e2).dot(o.clone().sub(pts[a]).negate());
    }
    if (vol < 0)
      for (const t of tris) {
        [t[1], t[2]] = [t[2], t[1]];
        t[4] = [t[4][0], t[4][1], t[4][4], t[4][5], t[4][2], t[4][3]];
      }
    const vn = pts.map(() => new THREE.Vector3());
    for (const [a, b, c] of tris) {
      e1.subVectors(pts[b], pts[a]);
      e2.subVectors(pts[c], pts[a]);
      cr.crossVectors(e1, e2);
      vn[a].add(cr);
      vn[b].add(cr);
      vn[c].add(cr);
    }
    for (const v of vn) v.normalize();
    const p = PIV[joint];
    for (const [a, b, c, m, uv] of tris) {
      const bk = bucket(joint, m);
      [a, b, c].forEach((vi, j) => {
        bk.pos.push(pts[vi].x - p.x, pts[vi].y - p.y, pts[vi].z - p.z);
        bk.nor.push(vn[vi].x, vn[vi].y, vn[vi].z);
        bk.uv.push(uv[j * 2], uv[j * 2 + 1]);
      });
    }
  };

  // Rings along a Catmull-Rom centreline through ctrl. sec[j] is the section at
  // control point j, [half width, half depth in front, half depth behind], eased
  // along each span; ref picks the direction the section calls its front.
  const sweepRings = (ctrl, sec, per, N, ref = V(0, 0, 1)) => {
    const curve = new THREE.CatmullRomCurve3(ctrl, false, "centripetal");
    const L = ctrl.length - 1,
      rings = [],
      at = [];
    for (let j = 0; j < L; j++) {
      const m = Array.isArray(per) ? per[j] : per;
      for (let s = 0; s < m; s++) at.push([j, s / m]);
    }
    at.push([L - 1, 1]);
    for (const [j, f] of at) {
      const t = (j + f) / L;
      const c = curve.getPoint(t),
        T = curve.getTangent(t).normalize();
      const F = ref.clone().addScaledVector(T, -ref.dot(T)).normalize();
      const X = new THREE.Vector3().crossVectors(F, T).normalize();
      const a = sec[j],
        b = sec[j + 1],
        e = f * f * (3 - 2 * f);
      const w = a[0] + (b[0] - a[0]) * e,
        fr = a[1] + (b[1] - a[1]) * e,
        bk = a[2] + (b[2] - a[2]) * e;
      const ring = [];
      for (let k = 0; k < N; k++) {
        const th = (2 * Math.PI * k) / N,
          co = Math.cos(th);
        ring.push(
          c
            .clone()
            .addScaledVector(X, w * Math.sin(th))
            .addScaledVector(F, (co > 0 ? fr : bk) * co),
        );
      }
      rings.push(ring);
    }
    return rings;
  };
  const tube = (joint, material, ctrl, sec, per, N, ref) =>
    skin(joint, sweepRings(ctrl, sec, per, N, ref), () => material);

  // A lathe from [radius, height] pairs, placed by position, quaternion and scale.
  const lathe = (
    joint,
    material,
    prof,
    segs,
    pos,
    quat = new THREE.Quaternion(),
    scale = V(1, 1, 1),
  ) => {
    const geo = new THREE.LatheGeometry(
      prof.map(([r, y]) => V2(r, y)),
      segs,
    );
    addGeo(joint, material, geo, new THREE.Matrix4().compose(pos, quat, scale));
    geo.dispose();
  };
  const UP = V(0, 1, 0);
  const along = (d) =>
    new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());

  // ---- torso: a loft through sixteen sections, front to back -------------------
  // [z, top of the back, underline, half width, height of the widest point]
  const ST = [
    [0.58, 1.1, 0.98, 0.06, 1.04],
    [0.55, 1.2, 0.86, 0.12, 1.03],
    [0.48, 1.26, 0.8, 0.16, 1.02],
    [0.38, 1.3, 0.775, 0.18, 1.02],
    [0.26, 1.31, 0.77, 0.19, 1.03],
    [0.12, 1.29, 0.775, 0.2, 1.03],
    [-0.02, 1.265, 0.79, 0.205, 1.04],
    [-0.16, 1.25, 0.81, 0.2, 1.05],
    [-0.3, 1.245, 0.84, 0.19, 1.06],
    [-0.42, 1.255, 0.87, 0.185, 1.07],
    [-0.54, 1.27, 0.88, 0.19, 1.08],
    [-0.65, 1.265, 0.89, 0.185, 1.08],
    [-0.74, 1.24, 0.91, 0.165, 1.08],
    [-0.79, 1.215, 0.93, 0.148, 1.08],
    [-0.825, 1.175, 0.96, 0.112, 1.075],
    [-0.85, 1.12, 1.0, 0.055, 1.068],
  ];
  // Vertex columns 7 and 13 bound the pale belly: each ring sets them PHI radians
  // either side of the underline, so the patch is a smooth lens that closes to a
  // point at both ends instead of stepping from ring to ring.
  const PHI = [0, 0, 0, 0, 0, 0.62, 0.82, 0.86, 0.8, 0.62, 0.34, 0, 0, 0, 0, 0];
  const NT = 20,
    sp = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
  const torso = ST.map(([z, top, bot, w, mid], i) => {
    const phi = PHI[i],
      ring = [];
    for (let k = 0; k < NT; k++) {
      const th =
        k >= 7 && k <= 13
          ? Math.PI + ((k - 10) * phi) / 3
          : Math.PI + phi + (((k + 7) % NT) * (2 * Math.PI - 2 * phi)) / 14;
      const s = sp(Math.sin(th), 0.85),
        c = sp(Math.cos(th), 0.85);
      ring.push(V(w * s, mid + (c > 0 ? top - mid : mid - bot) * c, z));
    }
    return ring;
  });
  // k = 0 is the top of the back and k = 10 the underline; the rear rings are the
  // rump patch, round the tail and down between the hams
  skin(
    "body",
    torso,
    (i, k) =>
      (i >= 4 && i <= 10 && k >= 7 && k <= 12) || i >= 14 ? pale : fur,
    [fur, pale],
  );
  // tail: a short flattened tube hanging over the patch
  tube(
    "body",
    fur,
    [V(0, 1.215, -0.79), V(0, 1.17, -0.855), V(0, 1.08, -0.875)],
    [
      [0.045, 0.03, 0.03],
      [0.04, 0.028, 0.026],
      [0.012, 0.01, 0.01],
    ],
    3,
    8,
    V(0, 0, -1),
  );

  // ---- legs: oval tubes that swell at shoulder, knee and fetlock ----------------
  const hoof = (j, x, z) => {
    // two rounded toes, a cloven hoof
    const prof = [
      [0, 0],
      [0.028, 0],
      [0.03, 0.014],
      [0.022, 0.052],
      [0.012, 0.07],
      [0, 0.072],
    ];
    for (const d of [-1, 1])
      lathe(
        j,
        dark,
        prof,
        6,
        V(x + d * 0.018, 0, z + 0.008),
        undefined,
        V(0.62, 1, 1.3),
      );
  };
  const frontLeg = (j, s) => {
    const x = 0.13 * s;
    tube(
      j,
      fur,
      [
        V(x, 1.08, 0.36),
        V(x, 0.92, 0.33),
        V(x, 0.76, 0.295),
        V(x, 0.6, 0.318),
        V(x, 0.5, 0.328),
        V(x, 0.44, 0.332),
        V(x, 0.38, 0.334),
        V(x, 0.14, 0.343),
        V(x, 0.115, 0.347),
        V(x, 0.065, 0.37),
      ],
      [
        [0.06, 0.09, 0.09],
        [0.075, 0.115, 0.11],
        [0.055, 0.06, 0.075],
        [0.042, 0.048, 0.045],
        [0.032, 0.036, 0.034],
        [0.035, 0.043, 0.04],
        [0.026, 0.029, 0.028],
        [0.025, 0.028, 0.028],
        [0.031, 0.035, 0.035],
        [0.026, 0.03, 0.028],
      ],
      [2, 2, 2, 1, 1, 1, 2, 1, 1],
      8,
    );
    hoof(j, x, 0.375);
  };
  const backLeg = (j, s) => {
    const x = 0.13 * s;
    tube(
      j,
      fur,
      [
        V(x, 1.1, -0.57),
        V(x, 0.9, -0.54),
        V(x, 0.72, -0.49),
        V(x, 0.58, -0.58),
        V(x, 0.46, -0.64),
        V(x, 0.38, -0.628),
        V(x, 0.14, -0.598),
        V(x, 0.115, -0.593),
        V(x, 0.065, -0.568),
      ],
      [
        [0.07, 0.11, 0.12],
        [0.09, 0.13, 0.17],
        [0.07, 0.085, 0.1],
        [0.045, 0.05, 0.055],
        [0.037, 0.04, 0.056],
        [0.027, 0.03, 0.03],
        [0.025, 0.028, 0.028],
        [0.031, 0.035, 0.035],
        [0.026, 0.03, 0.028],
      ],
      [2, 2, 2, 1, 1, 2, 1, 1],
      8,
    );
    hoof(j, x, -0.563);
  };
  frontLeg("frontLeft", 1);
  frontLeg("frontRight", -1);
  backLeg("backLeft", 1);
  backLeg("backRight", -1);

  // ---- neck: an oval tube, deep at the throat where the mane hangs --------------
  const H = "head";
  tube(
    H,
    fur,
    [
      V(0, 1.1, 0.36),
      V(0, 1.25, 0.47),
      V(0, 1.42, 0.575),
      V(0, 1.57, 0.65),
      V(0, 1.69, 0.7),
    ],
    [
      [0.12, 0.13, 0.13],
      [0.12, 0.155, 0.1],
      [0.095, 0.125, 0.085],
      [0.08, 0.09, 0.075],
      [0.07, 0.075, 0.07],
    ],
    2,
    14,
    V(0, 0, 1),
  );

  // ---- head: lofted along its own axis, nose down --------------------------------
  const O = V(0, 1.745, 0.66),
    D = V(0, -0.12, 0.46).normalize(),
    U = V(0, D.z, -D.y),
    X = V(1, 0, 0);
  // [distance along the axis, half width, height above, depth below, drop of the centre]
  const HS = [
    [0, 0.05, 0.05, 0.05, 0],
    [0.03, 0.075, 0.075, 0.08, 0],
    [0.09, 0.088, 0.085, 0.09, 0],
    [0.15, 0.082, 0.075, 0.085, 0.005],
    [0.22, 0.066, 0.062, 0.075, 0.012],
    [0.3, 0.052, 0.05, 0.062, 0.02],
    [0.38, 0.044, 0.045, 0.052, 0.025],
    [0.44, 0.038, 0.04, 0.042, 0.028],
    [0.47, 0.022, 0.024, 0.024, 0.03],
  ];
  const NH = 14;
  const headRings = HS.map(([t, w, up, dn, drop]) => {
    const c = O.clone().addScaledVector(D, t).addScaledVector(U, -drop),
      ring = [];
    for (let k = 0; k < NH; k++) {
      const th = (2 * Math.PI * k) / NH,
        co = Math.cos(th);
      ring.push(
        c
          .clone()
          .addScaledVector(X, w * Math.sin(th))
          .addScaledVector(U, (co > 0 ? up : dn) * co),
      );
    }
    return ring;
  });
  // k = 7 is under the jaw; the last spans carry the pale chin, the tip is the nose
  skin(H, headRings, (i, k) => (i >= 5 && k >= 5 && k <= 8 ? pale : fur), [
    fur,
    dark,
  ]);
  const onHead = (t, side, up) =>
    O.clone()
      .addScaledVector(D, t)
      .addScaledVector(X, side)
      .addScaledVector(U, up);
  for (const s of [1, -1]) {
    // eye
    lathe(
      H,
      dark,
      [
        [0, -0.018],
        [0.013, -0.012],
        [0.018, 0],
        [0.013, 0.012],
        [0, 0.018],
      ],
      6,
      onHead(0.115, 0.079 * s, 0.03),
    );
    // ear: a flattened leaf lathe splayed out and leaning back, a pale lining in front
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-0.3, 0, -1.1 * s),
    );
    const face = V(0, 0, 1).applyQuaternion(q),
      dir = V(0, 1, 0).applyQuaternion(q);
    const base = onHead(0.02, 0.06 * s, 0.05);
    const leaf = [
      [0, 0],
      [0.028, 0.02],
      [0.046, 0.07],
      [0.044, 0.13],
      [0.026, 0.19],
      [0, 0.235],
    ];
    lathe(H, fur, leaf, 8, base, q, V(1, 1, 0.34));
    lathe(
      H,
      pale,
      leaf.map(([r, y]) => [r * 0.74, y * 0.84]),
      8,
      base.clone().addScaledVector(face, 0.007).addScaledVector(dir, 0.025),
      q,
      V(1, 1, 0.26),
    );
  }

  // ---- antlers: swept beams and tines, burrs at the base, buds as lathes ------------
  const buds = [];
  for (const s of [1, -1]) {
    const P = (x, y, z) => V(x * s, y, z);
    tube(
      H,
      horn,
      [
        P(0.055, 1.79, 0.752),
        P(0.18, 1.9, 0.67),
        P(0.33, 2.0, 0.58),
        P(0.45, 2.11, 0.52),
        P(0.52, 2.2, 0.51),
        P(0.52, 2.26, 0.55),
      ],
      [
        [0.034, 0.034, 0.034],
        [0.03, 0.03, 0.03],
        [0.027, 0.027, 0.027],
        [0.024, 0.024, 0.024],
        [0.021, 0.021, 0.021],
        [0.017, 0.017, 0.017],
      ],
      2,
      7,
      V(0, 0, 1),
    );
    const tines = [
      [
        [P(0.08, 1.845, 0.745), P(0.13, 1.86, 0.87), P(0.17, 1.91, 0.965)],
        0.024,
      ], // brow, over the face
      [[P(0.18, 1.9, 0.675), P(0.22, 1.93, 0.79), P(0.26, 1.99, 0.875)], 0.021], // bez
      [[P(0.4, 2.065, 0.545), P(0.44, 2.1, 0.65), P(0.48, 2.17, 0.735)], 0.019], // trez
      [[P(0.52, 2.25, 0.54), P(0.57, 2.28, 0.59), P(0.6, 2.31, 0.63)], 0.017], // crown
      [[P(0.52, 2.25, 0.53), P(0.52, 2.29, 0.47), P(0.51, 2.32, 0.42)], 0.017],
      [[P(0.52, 2.25, 0.54), P(0.47, 2.28, 0.59), P(0.44, 2.31, 0.63)], 0.016],
    ];
    for (const [pts, r] of tines) {
      tube(
        H,
        horn,
        pts,
        [
          [r, r, r],
          [r * 0.75, r * 0.75, r * 0.75],
          [0.002, 0.002, 0.002],
        ],
        2,
        5,
        V(0, 1, 0),
      );
    }
    // the burr, a rough ring where the antler leaves the skull
    lathe(
      H,
      horn,
      [
        [0.03, -0.012],
        [0.046, -0.008],
        [0.05, 0.004],
        [0.042, 0.012],
        [0.03, 0.012],
      ],
      7,
      P(0.058, 1.8, 0.75),
      along(P(0.12, 0.11, -0.08)),
    );
    for (const i of [0, 2, 3, 4])
      buds.push([
        tines[i][0][2],
        tines[i][0][2].clone().sub(tines[i][0][1]),
        1,
      ]);
    buds.push([P(0.34, 2.007, 0.598), P(0.3, 0.2, 0.7), 0.9]);
  }
  const BUD = [
    [0, -0.004],
    [0.017, 0.004],
    [0.023, 0.018],
    [0.017, 0.032],
    [0.006, 0.041],
    [0, 0.043],
  ];
  for (const [at, dir, k] of buds)
    lathe(H, bud, BUD, 6, at, along(dir), V(k, k, k));

  // A point on the front of the neck, t from its base to the jaw.
  const NECK = [
    [V(0, 1.1, 0.36), 0.13],
    [V(0, 1.25, 0.47), 0.155],
    [V(0, 1.42, 0.575), 0.125],
    [V(0, 1.57, 0.65), 0.09],
    [V(0, 1.69, 0.7), 0.075],
  ];
  const throat = (t, x) => {
    const f = Math.min(t, 0.999) * (NECK.length - 1),
      j = Math.floor(f),
      e = f - j;
    const c = NECK[j][0].clone().lerp(NECK[j + 1][0], e),
      depth = NECK[j][1] + (NECK[j + 1][1] - NECK[j][1]) * e;
    const axis = NECK[j + 1][0].clone().sub(NECK[j][0]).normalize();
    const front = V(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
    return c
      .addScaledVector(front, depth * Math.sqrt(1 - (x / 0.12) ** 2) - 0.006)
      .add(V(x, 0, 0));
  };
  // A slim three-sided lock from base points [a, b, c] to a tip, faces turned outward.
  const lock = (joint, material, [a, b, c, tip]) => {
    const middle = a.clone().add(b).add(c).add(tip).multiplyScalar(0.25);
    const pos = [];
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const n = q.clone().sub(p).cross(tip.clone().sub(p));
      const out = p
        .clone()
        .add(q)
        .add(tip)
        .multiplyScalar(1 / 3)
        .sub(middle);
      const face = n.dot(out) >= 0 ? [p, q, tip] : [q, p, tip];
      for (const v of face) pos.push(v.x, v.y, v.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    addGeo(joint, material, geo);
  };
  const oval = (joint, material, at, radii, q = new THREE.Quaternion()) => {
    const geo = new THREE.SphereGeometry(1, 10, 6);
    geo.scale(...radii);
    addGeo(
      joint,
      material,
      geo,
      new THREE.Matrix4().compose(at, q, V(1, 1, 1)),
    );
  };
  for (const s of [-1, 1]) {
    const eye = onHead(0.112, s * 0.082, 0.033);
    oval(H, pale, eye, [0.006, 0.021, 0.03]);
    oval(
      H,
      dark,
      eye.clone().add(V(s * 0.006, 0, 0.004)),
      [0.007, 0.013, 0.02],
    );
    oval(H, dark, onHead(0.429, s * 0.031, -0.003), [0.012, 0.014, 0.021]);
    tube(
      H,
      dark,
      [
        onHead(0.31, s * 0.043, -0.05),
        onHead(0.385, s * 0.036, -0.054),
        onHead(0.445, s * 0.021, -0.044),
      ],
      [
        [0.002, 0.002, 0.002],
        [0.002, 0.002, 0.002],
        [0.001, 0.001, 0.001],
      ],
      2,
      4,
    );
    for (let i = 0; i < 9; i++)
      for (const lane of [0.35, 0.8]) {
        const t = 0.12 + (i + lane * 0.5) * 0.085,
          hash =
            Math.abs(Math.sin(i * 12.9 + lane * 7.1 + s * 3.3) * 437.5) % 1;
        const root = throat(t, s * lane * 0.045),
          hang = V(s * 0.12 * lane, -1, 0.42 - t * 0.3).normalize(),
          length = (0.045 + 0.045 * Math.sin(Math.PI * t)) * (0.8 + hash * 0.4),
          side = V(1, 0, 0).cross(hang).normalize().multiplyScalar(0.009),
          across = V(0.011, 0, 0);
        lock(H, fur, [
          root.clone().add(across),
          root.clone().sub(across),
          root.clone().add(side),
          root.clone().addScaledVector(hang, length),
        ]);
      }
    for (const [j, z] of [
      [s > 0 ? "frontLeft" : "frontRight", 0.33],
      [s > 0 ? "backLeft" : "backRight", -0.61],
    ])
      oval(j, dark, V(s * 0.13, 0.084, z - 0.023), [0.016, 0.012, 0.012]);
  }

  // ---- bake each joint into one mesh per material -------------------------------
  const J = {};
  let glow = null;
  for (const [joint, byMat] of buckets) {
    let parent = g;
    if (joint !== "body") {
      parent = new THREE.Group();
      parent.name = joint;
      parent.position.copy(PIV[joint]);
      g.add(parent);
      J[joint] = parent;
    }
    for (const [material, b] of byMat) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
      // The surface pass multiplies UVs by each mesh's size in recipe tiles
      // (0.7 m fabric, 0.85 m stone); dividing first keeps the coat grain even.
      const tile = { fabric: 0.7, stone: 0.85 }[material.name];
      if (tile) {
        geo.computeBoundingBox();
        const size = geo.boundingBox.getSize(V());
        const ru = Math.max(1, Math.max(size.x, size.z) / tile),
          rv = Math.max(1, size.y / tile);
        for (let i = 0; i < b.uv.length; i += 2) {
          b.uv[i] /= ru;
          b.uv[i + 1] /= rv;
        }
      }
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      const mesh = new THREE.Mesh(geo, material);
      parent.add(mesh);
      if (material === bud) {
        mesh.name = "glow";
        glow = mesh;
      }
    }
  }

  // ---- placement: base at y = 0, centred on x and z, measured on vertices -------
  // Shifts the root's children only, so every pivot keeps its place on the body.
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

  g.userData.parts = {
    frontLeft: J.frontLeft,
    frontRight: J.frontRight,
    backLeft: J.backLeft,
    backRight: J.backRight,
    head: J.head,
    glow,
  };
  return g;
}
