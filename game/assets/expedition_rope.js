// expedition_rope, candidate C (a second reading, hand-built lofts): the rope is doubled
// the way climbers rig a ring to abseil from it. Its middle passes through the ring, one
// leg under the ring's far side and one over it, both legs run along the lip and over it
// side by side, twist loosely round each other down the face in a gentle S, and end
// together in one thick doubled overhand knot with two frayed tails. One continuous loft on
// rotation-minimising frames carries the rope; ring, eye and piton are lofts of the same
// routine and the timber wedge is a hand-cut block.
// The lip is not part of the asset: its top is the plane y = anchor[1], its face the plane
// z = anchor[2], facing +Z; the rope lies on the corner between them.
export default function (THREE) {
  const g = new THREE.Group();
  g.userData.mounts = "back";

  const mat = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const ROPE = mat(0xa9845a, "fabric", 0.95);
  const BRONZE = mat(0x9a6a35, "metal", 0.45, 0.6);
  const TIMBER = mat(0x8a6a48, "timber", 0.9);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0),
    UP = V(0, 1, 0);
  const PARTS = new Map();
  const put = (m, geo) => {
    if (!PARTS.has(m)) PARTS.set(m, []);
    PARTS.get(m).push(geo.index ? geo.toNonIndexed() : geo);
  };

  // --- the loft: rings of NS points carried along a polyline on rotation-minimising frames --
  // rad(i, j) gives the radius of point j on ring i, spin(i) turns ring i about the path.
  const frames = (pts, closed, n0) => {
    const n = pts.length,
      T = [],
      N = [];
    for (let i = 0; i < n; i++) {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)],
        b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      T.push(b.clone().sub(a).normalize());
    }
    let nn = n0
      ? n0.clone()
      : V(0, 0, 0).crossVectors(T[0], Math.abs(T[0].y) < 0.9 ? UP : X);
    nn.addScaledVector(T[0], -nn.dot(T[0])).normalize();
    N.push(nn);
    for (let i = 1; i < n; i++)
      N.push(
        N[i - 1]
          .clone()
          .applyQuaternion(
            new THREE.Quaternion().setFromUnitVectors(T[i - 1], T[i]),
          )
          .addScaledVector(T[i], 0)
          .normalize(),
      );
    return { T, N, B: T.map((t, i) => V(0, 0, 0).crossVectors(t, N[i])) };
  };
  const loft = (
    m,
    pts,
    { NS = 6, rad, spin = () => 0, closed = false, caps = true, n0 } = {},
  ) => {
    const { N, B } = frames(pts, closed, n0);
    const pos = [],
      idx = [];
    pts.forEach((p, i) => {
      for (let j = 0; j < NS; j++) {
        const a = (j / NS) * Math.PI * 2 + spin(i),
          r = rad(i, j);
        const q = p
          .clone()
          .addScaledVector(N[i], Math.cos(a) * r)
          .addScaledVector(B[i], Math.sin(a) * r);
        pos.push(q.x, q.y, q.z);
      }
    });
    const rings = pts.length,
      last = closed ? rings : rings - 1;
    for (let i = 0; i < last; i++) {
      const i1 = (i + 1) % rings;
      for (let j = 0; j < NS; j++) {
        const j1 = (j + 1) % NS;
        const a = i * NS + j,
          b = i * NS + j1,
          c = i1 * NS + j1,
          d = i1 * NS + j;
        idx.push(a, b, c, a, c, d);
      }
    }
    if (!closed && caps) {
      for (const [i, out] of [
        [0, -1],
        [rings - 1, 1],
      ]) {
        const c = pos.length / 3;
        const p = pts[i];
        pos.push(p.x, p.y, p.z);
        for (let j = 0; j < NS; j++) {
          const a = i * NS + j,
            b = i * NS + ((j + 1) % NS);
          if (out > 0) idx.push(c, a, b);
          else idx.push(c, b, a);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    put(m, geo);
  };
  const circle = (c, u, w, r, n) =>
    Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2;
      return c
        .clone()
        .addScaledVector(u, Math.cos(a) * r)
        .addScaledVector(w, Math.sin(a) * r);
    });
  const resample = (ctrl, step) => {
    const cr = new THREE.CatmullRomCurve3(ctrl, false, "centripetal");
    return cr.getSpacedPoints(Math.max(2, Math.round(cr.getLength() / step)));
  };

  // --- the anchor: lip corner at x = 0, y = YT, z = 0 -----------------------------------
  const YT = 1.8,
    RL = 0.026,
    D = RL * 1.02,
    RHO = RL + 0.002;
  const K = V(0, YT, 0);
  const S = V(0, 0, 1),
    W = V(0, 1, 0); // the legs lie along the lip
  const RR = 0.09,
    RT = 0.022,
    A = RT + RL;
  const F = V(0, YT + RHO + A, -0.12); // ring's far side, where the rope passes
  const TH = (55 * Math.PI) / 180;
  const P = V(0, -Math.sin(TH), Math.cos(TH));
  const C = F.clone().addScaledVector(P, -RR),
    E = F.clone().addScaledVector(P, -2 * RR);

  // ring and eye, lofted round circles; the eye's hole runs along X, the ring hangs in X and P
  loft(BRONZE, circle(C, P.clone().negate(), X, RR, 18), {
    NS: 5,
    rad: () => RT,
    closed: true,
  });
  const PD = V(0, Math.cos(0.44), -Math.sin(0.44)); // the piton leans back against the pull
  loft(BRONZE, circle(E, PD, V(0, 0, 0).crossVectors(X, PD), 0.037, 8), {
    NS: 4,
    rad: () => 0.013,
    closed: true,
  });
  {
    const foot = E.clone().addScaledVector(PD, -(E.y - YT) / PD.y),
      top = E.clone().addScaledVector(PD, -0.032);
    const shank = [
      foot.clone().addScaledVector(PD, -0.07),
      foot.clone().addScaledVector(PD, -0.03),
      foot,
      foot.clone().addScaledVector(PD, 0.012),
      top,
    ];
    const r = [0.004, 0.012, 0.03, 0.017, 0.017];
    loft(BRONZE, shank, { NS: 6, rad: (i) => r[i], spin: () => 0.5, n0: X });
  }

  // timber wedge beside the piton: a hand-cut tapered block, thick end up, split at the top
  {
    const pos = [];
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.1, -0.35, 0.14),
    );
    const o = V(-0.15, YT, -0.13);
    const at = (x, y, z) => V(x, y, z).applyQuaternion(q).add(o);
    const top = [
      at(-0.024, 0.07, -0.064),
      at(0.022, 0.066, -0.062),
      at(0.024, 0.07, 0.064),
      at(-0.022, 0.074, 0.06),
    ];
    const bot = [
      at(-0.006, -0.05, -0.018),
      at(0.006, -0.05, -0.02),
      at(0.006, -0.05, 0.02),
      at(-0.006, -0.05, 0.018),
    ];
    const tri = (a, b, c) =>
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const quad = (a, b, c, d) => {
      tri(a, b, c);
      tri(a, c, d);
    };
    quad(top[0], top[3], top[2], top[1]);
    quad(bot[0], bot[1], bot[2], bot[3]);
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      quad(top[k], top[k1], bot[k1], bot[k]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    put(TIMBER, geo);
  }

  // --- the doubled rope ----------------------------------------------------------------------
  // the pair's centreline from the corner down through the knot, and a frame to twist on
  const DROP = 1.38,
    sm = (t) => t * t * (3 - 2 * t);
  const pair = [];
  for (let k = 0; k <= 18; k++) {
    const s = k / 18;
    pair.push(
      V(
        0.085 * Math.sin(2 * Math.PI * 0.93 * s) * sm(Math.min(1, s / 0.16)),
        YT - DROP * s,
        0,
      ),
    );
  }
  const Q = pair[pair.length - 1].clone().add(V(0.022, -0.14, 0));
  const KN = [
    [-0.02, 0.085, 0],
    [-0.03, 0.04, 0.006],
    [-0.016, 0.0, 0.042],
    [0.036, -0.034, 0.04],
    [0.068, 0.004, -0.004],
    [0.042, 0.05, -0.044],
    [-0.024, 0.058, -0.04],
    [-0.066, 0.02, 0.0],
    [-0.05, -0.022, 0.048],
    [0.002, -0.03, 0.062],
    [0.042, -0.008, 0.024],
    [0.026, -0.05, -0.026],
    [0.004, -0.095, -0.004],
    [0.0, -0.13, 0.008],
  ].map(([x, y, z]) => Q.clone().add(V(x, y, z)));
  const knot = resample(KN, 0.022);
  const line = [...pair, ...knot.slice(1)];
  const nHang = pair.length;
  const fr = frames(line, false, X);
  // twist: the legs start side by side and wind round each other with a long pitch, then
  // hold their last twist through the knot
  const PITCH = 0.9;
  let run = 0;
  const beta = line.map((p, i) => {
    if (i > 0 && i < nHang) run += p.distanceTo(line[i - 1]);
    return (2 * Math.PI * run) / PITCH;
  });
  // lift the pair off the face just enough that the back leg never enters it
  const lift = (i) =>
    RHO +
    Math.abs(Math.sin(beta[i])) * D +
    (i < nHang ? 0.04 * (i / (nHang - 1)) ** 1.6 : 0.04);
  const legAt = (i, sgn) => {
    const off = fr.N[i]
      .clone()
      .multiplyScalar(Math.cos(beta[i]))
      .addScaledVector(fr.B[i], Math.sin(beta[i]));
    return line[i]
      .clone()
      .add(V(0, 0, lift(i)))
      .addScaledVector(off, sgn * D * (i < nHang ? 1 : 1.05));
  };
  const leg = (sgn) => line.map((_, i) => legAt(i, sgn));

  // over the lip: each leg turns the corner at its own x
  const corner = (sgn) =>
    [0.66, 0.33, 0].map((b) =>
      K.clone().add(
        V(
          sgn * D,
          RHO * Math.cos((Math.PI / 2) * b),
          RHO * Math.sin((Math.PI / 2) * b),
        ),
      ),
    );
  // through the ring: leg A arrives under the ring's far side, rounds its back and top,
  // and leaves in front of it as leg B, drifting across so the legs lie side by side
  const turn = [];
  const NT = 9;
  for (let k = 0; k <= NT; k++) {
    const phi = -Math.PI / 2 - (1.5 * Math.PI * k) / NT;
    turn.push(
      F.clone()
        .addScaledVector(X, -D + (2 * D * k) / NT)
        .addScaledVector(S, A * Math.cos(phi))
        .addScaledVector(W, A * Math.sin(phi)),
    );
  }
  const lip = (sgn, zs) => zs.map((z) => V(sgn * D, YT + RHO, z));
  const legA = leg(-1).reverse(),
    legB = leg(1);
  const rope = [
    ...legA,
    ...corner(-1),
    ...lip(-1, [-0.04, -0.08]),
    ...turn,
    V(D, YT + RHO + 0.02, F.z + A + 0.022),
    ...lip(1, [-0.035]),
    ...corner(1).reverse(),
    ...legB.slice(1),
  ];
  loft(ROPE, rope, { NS: 6, rad: () => RL });

  // two frayed tails: the rope flares where it unlays, and a brush of fibres stands out of it
  for (const [ends, sgn] of [
    [legA, -1],
    [legB, 1],
  ]) {
    const i = sgn < 0 ? 0 : ends.length - 1,
      j = sgn < 0 ? 1 : ends.length - 2;
    const at = ends[i],
      dir = at.clone().sub(ends[j]).normalize();
    const side = V(0, 0, 0)
      .crossVectors(dir, Math.abs(dir.y) < 0.9 ? UP : X)
      .normalize();
    loft(
      ROPE,
      [
        at.clone().addScaledVector(dir, -0.004),
        at.clone().addScaledVector(dir, 0.012),
        at.clone().addScaledVector(dir, 0.022),
      ],
      { NS: 6, rad: (ii) => [RL * 0.98, RL * 1.22, RL * 1.28][ii] },
    );
    for (let k = 0; k < 4; k++) {
      const out = side
        .clone()
        .applyAxisAngle(dir, (sgn > 0 ? 0.9 : 0.2) + (k * 2 * Math.PI) / 4);
      const f0 = at
        .clone()
        .addScaledVector(dir, 0.016)
        .addScaledVector(out, RL * 0.7);
      const f1 = f0
        .clone()
        .addScaledVector(dir, 0.038 + 0.01 * (k % 3))
        .addScaledVector(out, 0.022 + 0.008 * (k % 2));
      loft(ROPE, [f0, f1], {
        NS: 3,
        rad: (ii) => [0.0055, 0.004][ii],
        caps: false,
      });
    }
  }

  // --- merge per material, UVs projected over each merged box --------------------------
  const merged = (geos) => {
    let n = 0;
    for (const x of geos) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3);
    let o = 0;
    for (const x of geos) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      o += x.attributes.position.count;
    }
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n * 3; i++) {
      lo[i % 3] = Math.min(lo[i % 3], pos[i]);
      hi[i % 3] = Math.max(hi[i % 3], pos[i]);
    }
    const su = Math.max(hi[0] - lo[0], hi[2] - lo[2]) || 1,
      sv = hi[1] - lo[1] || 1;
    const uv = new Float32Array(n * 2);
    for (let t = 0; t < n; t += 3) {
      const a = V(pos[t * 3], pos[t * 3 + 1], pos[t * 3 + 2]);
      const f = V(pos[t * 3 + 3], pos[t * 3 + 4], pos[t * 3 + 5])
        .sub(a)
        .cross(V(pos[t * 3 + 6], pos[t * 3 + 7], pos[t * 3 + 8]).sub(a));
      const fx = Math.abs(f.x),
        fy = Math.abs(f.y),
        fz = Math.abs(f.z);
      for (let k = t; k < t + 3; k++) {
        const x = pos[k * 3] - lo[0],
          y = pos[k * 3 + 1] - lo[1],
          z = pos[k * 3 + 2] - lo[2];
        const [u, v] =
          fy >= fx && fy >= fz ? [x, z] : fx >= fz ? [z, y] : [x, y];
        uv[k * 2] = u / su;
        uv[k * 2 + 1] = v / sv;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geo;
  };
  for (const [m, geos] of PARTS) g.add(new THREE.Mesh(merged(geos), m));

  // --- placement: lowest point on y = 0, centred on x and z (measured on vertices) -------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const add = (mm) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mm));
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
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box.min.y;
    o.position.z -= c.z;
  });

  // the lip corner between the two legs, after the shift: put this on a ledge edge
  const r3 = (x) => Math.round(x * 1000) / 1000;
  g.userData.anchor = [r3(K.x - c.x), r3(K.y - box.min.y), r3(K.z - c.z)];
  return g;
}
