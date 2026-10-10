import { propDetails } from "../props-detail.js";

// confiscation_bin, arm C: a second reading, built as a chamfered coffer.
// The chest is laid up from hand-built chamfered blocks like the builders' masonry: a
// plinth, four corner posts with bronze sleeves at head and foot, recessed wall panels
// crossed by bronze bands, and a rim course. The lid is a chamfered slab with a raised
// top and bronze corner caps, held 65 degrees open by a bronze prop rod standing in a
// socket on the right end, whose fork catches a pin on the lid. The heap is piled higher:
// a boot dangles over the left end by its shaft, the dented kettle sits on top, the map
// sticks up at the back, a rope coil spills a loop down the front, and the stamp-ochre
// tag stands above it all. Lathe, tube and extrusion shape the junk.
// Chest 1.2 x 0.8 x 0.8 m closed; about 1.4 m tall with the lid propped.
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
  const BRONZE = M(0x9a6a35, "metal", 0.5, 0.6);
  const CHALK = M(0xc9c2d8, "plaster", 0.82);
  const OCHRE = M(0xd9a441, "fabric", 0.8);
  const LEATHER = M(0x4b2e1e, "fabric", 0.86);
  const CANVAS = M(0xcdbf9f, "fabric", 0.92);
  const PAPER = M(0xe6d3ae, "fabric", 0.9);
  const ROPE = M(0xb49a6a, "fabric", 0.95);
  const TIMBER = M(0x8a6a48, "timber", 0.86);
  const HEAP = M(0x2b2420, "fabric", 0.95);

  // ---- merging: one mesh per material per moving group --------------------------
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
  const STATIC = new Map(),
    LID = new Map();
  const put = (mat, geo, bucket = STATIC) => {
    if (!bucket.has(mat)) bucket.set(mat, []);
    bucket.get(mat).push(geo);
    return geo;
  };
  const putAll = (mat, geos, bucket = STATIC) => {
    for (const geo of geos) put(mat, geo, bucket);
  };
  const flush = (bucket, parent) => {
    for (const [mat, geos] of bucket)
      parent.add(new THREE.Mesh(merge(geos), mat));
  };

  // ---- chamfered blocks ------------------------------------------------------------
  // Built face by face (6 faces, 12 edge strips, 8 corner triangles); each face is
  // sorted round its centroid and wound away from the block's centre.
  const polyGeo = (faces) => {
    const P = [],
      N = [];
    const c = new THREE.Vector3(),
      n0 = new THREE.Vector3(),
      u = new THREE.Vector3(),
      w = new THREE.Vector3();
    const e1 = new THREE.Vector3(),
      e2 = new THREE.Vector3(),
      n = new THREE.Vector3(),
      d = new THREE.Vector3();
    for (const f of faces) {
      const pts = f.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      c.set(0, 0, 0);
      for (const p of pts) c.add(p);
      c.multiplyScalar(1 / pts.length);
      n0.copy(c).normalize();
      u.subVectors(pts[0], c);
      u.addScaledVector(n0, -u.dot(n0)).normalize();
      w.crossVectors(n0, u);
      const ang = (p) => {
        d.subVectors(p, c);
        return Math.atan2(d.dot(w), d.dot(u));
      };
      pts.sort((p, q) => ang(p) - ang(q));
      for (let i = 1; i < pts.length - 1; i++) {
        const tri = [pts[0], pts[i], pts[i + 1]];
        n.crossVectors(
          e1.subVectors(tri[1], tri[0]),
          e2.subVectors(tri[2], tri[0]),
        ).normalize();
        for (const p of tri) {
          P.push(p.x, p.y, p.z);
          N.push(n.x, n.y, n.z);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    return geo;
  };
  const cbox = (w, h, d, ch) => {
    const H = [w / 2, h / 2, d / 2],
      S = [-1, 1];
    const p = (s, full) => s.map((k, i) => k * (i === full ? H[i] : H[i] - ch));
    const faces = [];
    for (let i = 0; i < 3; i++)
      for (const s of S) {
        const f = [];
        for (const a of S)
          for (const b of S) {
            const sg = [];
            sg[i] = s;
            sg[(i + 1) % 3] = a;
            sg[(i + 2) % 3] = b;
            f.push(p(sg, i));
          }
        faces.push(f);
      }
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3,
        k = (i + 2) % 3;
      for (const si of S)
        for (const sj of S) {
          const f = [];
          for (const sk of S) {
            const sg = [];
            sg[i] = si;
            sg[j] = sj;
            sg[k] = sk;
            f.push(p(sg, i), p(sg, j));
          }
          faces.push(f);
        }
    }
    for (const sx of S)
      for (const sy of S)
        for (const sz of S)
          faces.push([0, 1, 2].map((i) => p([sx, sy, sz], i)));
    return polyGeo(faces);
  };
  const blk = (mat, x0, y0, z0, x1, y1, z1, ch = 0.012, bucket = STATIC) =>
    put(
      mat,
      cbox(x1 - x0, y1 - y0, z1 - z0, ch).translate(
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        (z0 + z1) / 2,
      ),
      bucket,
    );
  const fixNormals = (geo) => {
    const nr = geo.attributes.normal,
      v = new THREE.Vector3();
    for (let k = 0; k < nr.count; k++) {
      v.fromBufferAttribute(nr, k).normalize();
      nr.setXYZ(k, v.x, v.y, v.z);
    }
    return geo;
  };
  const lathe = (pts, segs) =>
    fixNormals(
      new THREE.LatheGeometry(
        pts.map(([r, y]) => new THREE.Vector2(r, y)),
        segs,
      ),
    );
  const cylX = (r, x0, x1, y, z, segs = 12) =>
    new THREE.CylinderGeometry(r, r, x1 - x0, segs)
      .rotateZ(Math.PI / 2)
      .translate((x0 + x1) / 2, y, z);
  const pose = (geo, m, x, y, z) => geo.applyMatrix4(m).translate(x, y, z);
  const euler = (rx, ry, rz) =>
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));

  // ---- the coffer --------------------------------------------------------------------
  const RIM = 0.65;
  blk(BASALT, -0.6, 0, -0.4, 0.6, 0.06, 0.4, 0.015); // plinth
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 0.525,
        z = sz * 0.325;
      blk(
        BASALT,
        x - 0.065,
        0.06,
        z - 0.065,
        x + 0.065,
        RIM - 0.05,
        z + 0.065,
        0.018,
      ); // corner post
      blk(BRONZE, x - 0.08, 0.0, z - 0.08, x + 0.08, 0.12, z + 0.08, 0.012); // foot sleeve
      blk(
        BRONZE,
        x - 0.075,
        RIM - 0.13,
        z - 0.075,
        x + 0.075,
        RIM + 0.004,
        z + 0.075,
        0.012,
      ); // head sleeve
    }
  blk(BASALT, -0.46, 0.06, 0.29, 0.46, RIM - 0.05, 0.37, 0.01); // recessed panels
  blk(BASALT, -0.46, 0.06, -0.37, 0.46, RIM - 0.05, -0.29, 0.01);
  for (const s of [-1, 1])
    blk(
      BASALT,
      Math.min(s * 0.49, s * 0.57),
      0.06,
      -0.26,
      Math.max(s * 0.49, s * 0.57),
      RIM - 0.05,
      0.26,
      0.01,
    );
  blk(BASALT, -0.49, 0.06, -0.29, 0.49, 0.15, 0.29, 0.005); // floor
  // rim course round the opening
  blk(BASALT, -0.59, RIM - 0.05, 0.3, 0.59, RIM, 0.39, 0.012);
  blk(BASALT, -0.59, RIM - 0.05, -0.39, 0.59, RIM, -0.3, 0.012);
  for (const s of [-1, 1])
    blk(
      BASALT,
      Math.min(s * 0.5, s * 0.59),
      RIM - 0.05,
      -0.3,
      Math.max(s * 0.5, s * 0.59),
      RIM,
      0.3,
      0.012,
    );
  // bronze bands across the panels, with bosses
  blk(BRONZE, -0.46, 0.29, 0.365, 0.46, 0.345, 0.382, 0.006);
  blk(BRONZE, -0.46, 0.29, -0.382, 0.46, 0.345, -0.365, 0.006);
  for (const s of [-1, 1])
    blk(
      BRONZE,
      Math.min(s * 0.565, s * 0.582),
      0.29,
      -0.26,
      Math.max(s * 0.565, s * 0.582),
      0.345,
      0.26,
      0.006,
    );
  for (const x of [-0.3, 0, 0.3])
    for (const z of [0.382, -0.382])
      put(
        BRONZE,
        new THREE.CylinderGeometry(0.02, 0.024, 0.012, 10)
          .rotateX(Math.PI / 2)
          .translate(x, 0.3175, z + Math.sign(z) * 0.006),
      );
  // hasp staple and body hinge knuckles
  put(
    BRONZE,
    new THREE.TorusGeometry(0.028, 0.008, 5, 12).translate(0, RIM - 0.1, 0.39),
  );
  blk(BRONZE, -0.04, RIM - 0.13, 0.37, 0.04, RIM - 0.06, 0.39, 0.005);
  const HZ = -0.395;
  for (const s of [-1, 1]) {
    put(BRONZE, cylX(0.022, s * 0.3 - 0.035, s * 0.3 + 0.035, RIM, HZ));
    // each leaf stands 6 mm proud of the rim course it crosses, never flush with it
    blk(
      BRONZE,
      s * 0.3 - 0.04,
      RIM - 0.1,
      -0.396,
      s * 0.3 + 0.04,
      RIM - 0.01,
      -0.37,
      0.005,
    );
  }

  // ---- the lid: chamfered slab built closed round the hinge axis, propped 65 degrees ---
  const lid = new THREE.Group();
  lid.name = "lid";
  lid.position.set(0, RIM, HZ);
  const OPEN = (65 * Math.PI) / 180,
    PIN = [0.05, 0.55]; // pin at (y, z) in the lid frame
  blk(BASALT, -0.6, 0, 0, 0.6, 0.1, 0.8, 0.018, LID);
  blk(BASALT, -0.5, 0.09, 0.1, 0.5, 0.15, 0.7, 0.02, LID);
  for (const sx of [-1, 1])
    for (const z of [0.075, 0.725])
      blk(
        BRONZE,
        sx * 0.53 - 0.076,
        -0.008,
        z - 0.081,
        sx * 0.53 + 0.076,
        0.112,
        z + 0.081,
        0.012,
        LID,
      );
  put(
    BRONZE,
    lathe(
      [
        [0.15, 0.145],
        [0.15, 0.158],
        [0.125, 0.172],
        [0.0, 0.172],
      ],
      28,
    ).translate(0, 0, 0.4),
    LID,
  );
  put(
    CHALK,
    lathe(
      [
        [0.08, 0.172],
        [0.08, 0.18],
        [0, 0.18],
      ],
      24,
    ).translate(0, 0, 0.4),
    LID,
  );
  put(
    OCHRE,
    lathe(
      [
        [0.05, 0.18],
        [0.05, 0.186],
        [0, 0.186],
      ],
      20,
    ).translate(-0.012, 0, 0.4),
    LID,
  );
  put(
    CHALK,
    lathe(
      [
        [0.042, 0.186],
        [0.042, 0.19],
        [0, 0.19],
      ],
      20,
    ).translate(0.01, 0, 0.392),
    LID,
  );
  for (const s of [-1, 1]) {
    for (const k of [-1, 1])
      put(
        BRONZE,
        cylX(
          0.022,
          s * 0.3 + k * 0.075 - 0.035,
          s * 0.3 + k * 0.075 + 0.035,
          0,
          0,
        ),
        LID,
      );
    blk(
      BRONZE,
      s * 0.3 - 0.12,
      0.012,
      -0.018,
      s * 0.3 + 0.12,
      0.08,
      0.004,
      0.004,
      LID,
    );
  }
  blk(BRONZE, -0.035, -0.09, 0.8, 0.035, 0.06, 0.814, 0.004, LID); // hasp tongue
  put(BRONZE, cylX(0.018, 0.6, 0.65, PIN[0], PIN[1], 10), LID); // the pin the prop catches
  // underside: a chalk panel with an ochre disc
  blk(CHALK, -0.4, -0.012, 0.18, 0.4, 0.002, 0.62, 0.004, LID);
  put(
    OCHRE,
    new THREE.CylinderGeometry(0.12, 0.12, 0.008, 28).translate(0, -0.014, 0.4),
    LID,
  );
  put(
    CHALK,
    new THREE.CylinderGeometry(0.095, 0.095, 0.006, 28).translate(
      0.05,
      -0.02,
      0.43,
    ),
    LID,
  );
  for (const x of [-0.51, 0.51])
    for (const z of [0.05, 0.18, 0.62, 0.75])
      put(
        BRONZE,
        new THREE.SphereGeometry(0.012, 6, 4)
          .scale(1, 0.45, 1)
          .translate(x, 0.11, z),
        LID,
      );
  for (const z of [0.2, 0.6])
    blk(BRONZE, -0.39, -0.015, z - 0.007, 0.39, -0.009, z + 0.007, 0.002, LID);
  for (const geos of LID.values()) for (const geo of geos) geo.rotateX(-OPEN);
  flush(LID, lid);
  g.add(lid);

  // ---- the prop: a bronze rod in a socket on the right end, forked under the lid's pin
  const pinY = RIM + PIN[0] * Math.cos(OPEN) + PIN[1] * Math.sin(OPEN);
  const pinZ = HZ - PIN[0] * Math.sin(OPEN) + PIN[1] * Math.cos(OPEN);
  const RX = 0.62;
  blk(BRONZE, 0.565, 0.27, pinZ - 0.045, RX + 0.03, 0.33, pinZ + 0.045, 0.008);
  put(
    BRONZE,
    new THREE.CylinderGeometry(0.017, 0.02, pinY - 0.018 - 0.24, 10).translate(
      RX,
      (0.24 + pinY - 0.018) / 2,
      pinZ,
    ),
  );
  blk(
    BRONZE,
    RX - 0.02,
    pinY - 0.03,
    pinZ - 0.035,
    RX + 0.02,
    pinY - 0.016,
    pinZ + 0.035,
    0.004,
  );
  for (const s of [-1, 1])
    blk(
      BRONZE,
      RX - 0.014,
      pinY - 0.03,
      pinZ + s * 0.035 - 0.007,
      RX + 0.014,
      pinY + 0.03,
      pinZ + s * 0.035 + 0.007,
      0.003,
    );

  // ---- the heap ----------------------------------------------------------------------
  for (const [x, y, z, sx, sy, sz] of [
    [-0.2, 0.62, 0.02, 0.36, 0.16, 0.3],
    [0.2, 0.64, -0.06, 0.34, 0.18, 0.28],
    [0.02, 0.66, 0.1, 0.3, 0.15, 0.22],
    [-0.05, 0.64, -0.14, 0.32, 0.16, 0.2],
  ]) {
    put(
      HEAP,
      new THREE.SphereGeometry(1, 10, 6).scale(sx, sy, sz).translate(x, y, z),
    );
  }
  put(
    CANVAS,
    new THREE.SphereGeometry(1, 12, 8)
      .scale(0.2, 0.14, 0.16)
      .translate(-0.26, 0.72, -0.14),
  );
  put(
    CANVAS,
    new THREE.SphereGeometry(1, 10, 6)
      .scale(0.17, 0.08, 0.12)
      .rotateY(0.5)
      .translate(-0.3, 0.7, 0.16),
  );

  // the boot dangles over the left end: shaft across the rim, foot hanging outside
  {
    const s = new THREE.Shape(
      [
        [-0.09, 0],
        [0.17, 0],
        [0.205, 0.02],
        [0.2, 0.06],
        [0.16, 0.1],
        [0.07, 0.115],
        [0.035, 0.145],
        [0.03, 0.3],
        [-0.075, 0.3],
        [-0.08, 0.1],
        [-0.095, 0.03],
      ].map(([u, v]) => new THREE.Vector2(u, v)),
    );
    const b = 0.014;
    const boot = new THREE.ExtrudeGeometry(s, {
      depth: 0.096 - 2 * b,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelOffset: -b,
      bevelSegments: 2,
      curveSegments: 6,
    });
    boot.translate(0, 0, -0.048 + b);
    boot.rotateY(-Math.PI / 2); // toe towards +z, width along x
    // shaft (+y) onto +x, toe (+z) straight down
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, -1, 0),
    );
    put(LEATHER, pose(boot, m, -0.71, RIM + 0.04, 0.2));
    // a dark sole and heel under the foot
    const sole = new THREE.ExtrudeGeometry(
      new THREE.Shape(
        [
          [-0.092, -0.015],
          [0.175, -0.015],
          [0.212, 0.0],
          [0.2, 0.018],
          [0.17, 0.006],
          [-0.092, 0.006],
        ].map(([u, v]) => new THREE.Vector2(u, v)),
      ),
      { depth: 0.104, bevelEnabled: false, curveSegments: 4 },
    );
    sole.translate(0, 0, -0.052).rotateY(-Math.PI / 2);
    put(HEAP, pose(sole, m, -0.71, RIM + 0.04, 0.2));
    const heel = new THREE.BoxGeometry(0.104, 0.024, 0.075).translate(
      0,
      -0.02,
      -0.055,
    );
    put(HEAP, pose(heel, m, -0.71, RIM + 0.04, 0.2));
    put(
      CANVAS,
      new THREE.TorusGeometry(0.05, 0.012, 5, 14)
        .rotateY(Math.PI / 2)
        .translate(-0.42, RIM + 0.02, 0.2),
    );
  }

  // the dented kettle sits on top, spout to the front right
  {
    const body = lathe(
      [
        [0.07, 0],
        [0.09, 0.012],
        [0.12, 0.06],
        [0.122, 0.09],
        [0.1, 0.145],
        [0.062, 0.172],
        [0.058, 0.185],
        [0.03, 0.198],
        [0.018, 0.2],
        [0.02, 0.216],
        [0.003, 0.222],
      ],
      18,
    );
    const p = body.attributes.position,
      v = new THREE.Vector3(),
      dent = new THREE.Vector3(-0.1, 0.1, -0.06);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = v.distanceTo(dent);
      if (d < 0.075) {
        const k = (0.075 - d) * 0.6;
        v.x += k * 0.8;
        v.z += k * 0.5;
        p.setXYZ(i, v.x, v.y, v.z);
      }
    }
    body.computeVertexNormals();
    const spout = new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0.07, 0.1),
        new THREE.Vector3(0, 0.1, 0.19),
        new THREE.Vector3(0, 0.17, 0.23),
      ),
      8,
      0.018,
      8,
    );
    const arc = new THREE.EllipseCurve(0, 0, 0.088, 0.1, 0, Math.PI)
      .getPoints(10)
      .map((q) => new THREE.Vector3(q.x, q.y + 0.17, 0));
    const handle = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(arc),
      12,
      0.011,
      6,
    );
    const m = euler(0.12, -0.5, -0.16);
    for (const geo of [body, spout, handle])
      put(BRONZE, pose(geo, m, 0.05, 0.74, 0.08));
  }

  // the hat, tipped on the heap at the back left
  {
    const hat = lathe(
      [
        [0, 0.004],
        [0.19, 0],
        [0.205, 0.014],
        [0.198, 0.024],
        [0.12, 0.014],
        [0.112, 0.028],
        [0.108, 0.1],
        [0.09, 0.128],
        [0.04, 0.14],
        [0, 0.132],
      ],
      18,
    );
    const band = lathe(
      [
        [0.1135, 0.026],
        [0.1135, 0.058],
      ],
      18,
    );
    const m = euler(-0.35, 0.4, 0.3);
    put(CANVAS, pose(hat, m, -0.3, 0.72, -0.1));
    put(LEATHER, pose(band, m, -0.3, 0.72, -0.1));
  }

  // the rolled map sticks up out of the back right of the heap
  {
    const L = 0.58;
    const roll = lathe(
      [
        [0.043, 0],
        [0.047, 0.012],
        [0.042, 0.03],
        [0.042, L - 0.03],
        [0.047, L - 0.012],
        [0.043, L],
      ],
      16,
    );
    const ends = [
      lathe(
        [
          [0.002, 0.004],
          [0.043, 0],
        ],
        16,
      ),
      lathe(
        [
          [0.043, L],
          [0.002, L - 0.004],
        ],
        16,
      ),
    ];
    const ties = [
      lathe(
        [
          [0.044, 0.16],
          [0.047, 0.17],
          [0.044, 0.18],
        ],
        12,
      ),
      lathe(
        [
          [0.044, L - 0.18],
          [0.047, L - 0.17],
          [0.044, L - 0.16],
        ],
        12,
      ),
    ];
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0.28, 0.9, 0.3).normalize(),
    );
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    put(PAPER, pose(roll, m, 0.3, 0.6, -0.2));
    for (const geo of ends) put(CANVAS, pose(geo, m, 0.3, 0.6, -0.2));
    for (const geo of ties) put(ROPE, pose(geo, m, 0.3, 0.6, -0.2));
  }

  // a rope coil on the front right, with a loop spilling down the front
  {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 * 2.2,
        r = 0.1 + 0.03 * Math.sin(3 * a);
      pts.push(
        new THREE.Vector3(
          0.36 + r * Math.cos(a),
          0.76 + 0.03 * Math.sin(2 * a) + i * 0.002,
          0.14 + r * Math.sin(a) * 0.8,
        ),
      );
    }
    pts.push(
      new THREE.Vector3(0.44, 0.7, 0.34),
      new THREE.Vector3(0.44, RIM + 0.02, 0.41),
      new THREE.Vector3(0.43, 0.5, 0.42),
    );
    pts.push(
      new THREE.Vector3(0.36, 0.42, 0.42),
      new THREE.Vector3(0.28, 0.5, 0.42),
      new THREE.Vector3(0.25, RIM + 0.02, 0.41),
      new THREE.Vector3(0.22, 0.72, 0.3),
    );
    put(
      ROPE,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts, false, "centripetal"),
        104,
        0.016,
        5,
        false,
      ),
    );
  }

  // the stamp-ochre tag on a stick, standing above the heap
  {
    const stick = lathe(
      [
        [0.011, 0],
        [0.009, 0.56],
        [0.014, 0.57],
        [0.002, 0.585],
      ],
      8,
    );
    const tag = new THREE.ExtrudeGeometry(
      new THREE.Shape(
        [
          [0, -0.05],
          [0.13, -0.05],
          [0.16, -0.02],
          [0.16, 0.05],
          [0, 0.05],
        ].map(([u, v]) => new THREE.Vector2(u, v)),
      ),
      { depth: 0.008, bevelEnabled: false },
    );
    tag.translate(0.012, 0.5, -0.004);
    const m = euler(0.08, 0.9, -0.06);
    put(TIMBER, pose(stick, m, -0.16, 0.62, 0.22));
    put(OCHRE, pose(tag, m, -0.16, 0.62, 0.22));
  }

  for (const side of [-1, 1]) {
    const x = side * 0.587;
    put(
      BRONZE,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, 0.45, -0.09),
          new THREE.Vector3(x + side * 0.025, 0.4, -0.075),
          new THREE.Vector3(x + side * 0.03, 0.37, 0),
          new THREE.Vector3(x + side * 0.025, 0.4, 0.075),
          new THREE.Vector3(x, 0.45, 0.09),
        ]),
        12,
        0.012,
        5,
        false,
      ),
    );
    for (const z of [-0.09, 0.09])
      put(
        BRONZE,
        new THREE.SphereGeometry(0.021, 7, 4)
          .scale(0.3, 1, 1)
          .translate(x, 0.45, z),
      );
  }
  for (const x of [-0.52, 0.52])
    for (const y of [0.065, 0.1, 0.56, 0.6])
      for (const z of [-0.406, 0.406])
        put(
          BRONZE,
          new THREE.SphereGeometry(0.009, 6, 4)
            .scale(1, 1, 0.35)
            .translate(x, y, z),
        );
  flush(STATIC, g);

  // ---- placement: base at y = 0, centred on x and z (measured on vertices) ---------
  const bb = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const add = (mat) => {
      for (let i = 0; i < p.count; i++)
        bb.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat));
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

  g.userData.joints = { lid };
  return details.batch();
}
