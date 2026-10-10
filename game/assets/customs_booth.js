import { architectureDetail } from "../architecture-detail.js";
// customs_booth, arm C: a second reading, built as chamfered masonry.
// Every mass is a hand-built chamfered block, laid as courses: corner piers of four
// stacked blocks whose chamfers read as joints, base and head courses framing
// recessed chalk panels, a stern striped brow of alternating stamp-ochre and chalk
// blocks projecting over the window, and a counter slab on a corbel tongue. The
// barrier hangs on a bronze hub on the front face of a square post and carries a
// round basalt counterweight behind the pivot; its beam is octagonal.
// Booth 2.4 x 2.0 m, 2.8 m to the top of the lamp; 6.7 m wide with the arm.
export default function (THREE) {
  const g = new THREE.Group();
  const detail = architectureDetail(THREE, g);

  // ---- materials --------------------------------------------------------------
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const NIGHT = M(0x2a2830, "stone", 0.84);
  const SHADOW = M(0x131118, "stone", 0.96);
  const CHALK = M(0xc9c2d8, "plaster", 0.82);
  const OCHRE = M(0xd9a441, "plaster", 0.72);
  const BRONZE = M(0x9a6a35, "metal", 0.5, 0.6);
  const TIMBER = M(0x8a6a48, "timber", 0.86);
  const SLATE = M(0x8c7fa3, "stone", 0.74);
  // The lamp keeps a material of its own so the game can dim or flash it (lit at 2,
  // above the second world's bloom threshold; 0 shows dormant crystal). Unnamed and
  // just under opaque so the loader's procedural surfaces leave it alone.
  const LAMP = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    emissive: 0x39e3d0,
    emissiveIntensity: 2,
    roughness: 0.3,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
  });

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
    ARM = new Map();
  const put = (mat, geo, bucket = STATIC) => {
    if (!bucket.has(mat)) bucket.set(mat, []);
    bucket.get(mat).push(geo);
    return geo;
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
  // block between two corners with a chamfer
  const blk = (mat, x0, y0, z0, x1, y1, z1, ch = 0.02, bucket = STATIC) =>
    put(
      mat,
      cbox(x1 - x0, y1 - y0, z1 - z0, ch).translate(
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        (z0 + z1) / 2,
      ),
      bucket,
    );
  const cyl = (
    mat,
    rTop,
    rBot,
    h,
    seg,
    x,
    y,
    z,
    axis = "y",
    bucket = STATIC,
  ) => {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    if (axis === "x") geo.rotateZ(-Math.PI / 2);
    if (axis === "z") geo.rotateX(Math.PI / 2);
    return put(mat, geo.translate(x, y, z), bucket);
  };
  const crescentShape = (R, r2, ox, oy, n = 20) => {
    const d = Math.hypot(ox, oy),
      a = (R * R - r2 * r2 + d * d) / (2 * d),
      h = Math.sqrt(R * R - a * a);
    const px = (a / d) * ox,
      py = (a / d) * oy,
      qx = (-oy / d) * h,
      qy = (ox / d) * h;
    const t1 = Math.atan2(py + qy, px + qx),
      t2 = Math.atan2(py - qy, px - qx);
    const f1 = Math.atan2(py + qy - oy, px + qx - ox),
      f2 = Math.atan2(py - qy - oy, px - qx - ox);
    const TAU = Math.PI * 2,
      span = (x) => ((x % TAU) + TAU) % TAU,
      so = span(t2 - t1),
      si = span(f2 - f1);
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const t = t1 + (so * k) / n;
      pts.push(new THREE.Vector2(R * Math.cos(t), R * Math.sin(t)));
    }
    for (let k = 1; k < n; k++) {
      const t = f2 - (si * k) / n;
      pts.push(new THREE.Vector2(ox + r2 * Math.cos(t), oy + r2 * Math.sin(t)));
    }
    return new THREE.Shape(pts);
  };
  // a face frame for medallions: 'pz' | 'nz' | 'px' | 'nx', at the face plane f0
  const onFace = (geo, face) => {
    if (face === "nz") geo.rotateY(Math.PI);
    if (face === "px") geo.rotateY(Math.PI / 2);
    if (face === "nx") geo.rotateY(-Math.PI / 2);
    return geo;
  };
  const medallion = (face, u, v, plane, zc, r) => {
    // built facing +z at the origin, then turned onto the face and moved to it
    const parts = [];
    const disc = new THREE.CylinderGeometry(r, r + 0.012, 0.03, 32);
    disc.rotateX(Math.PI / 2);
    disc.translate(u, v, 0.015);
    parts.push([NIGHT, disc]);
    const rim = new THREE.TorusGeometry(r, 0.02, 6, 36);
    rim.translate(u, v, 0.03);
    parts.push([BRONZE, rim]);
    const cr = new THREE.ExtrudeGeometry(
      crescentShape(r * 0.66, r * 0.56, r * 0.24, r * 0.14),
      { depth: 0.012, bevelEnabled: false, curveSegments: 24 },
    );
    cr.translate(u, v, 0.03);
    parts.push([OCHRE, cr]);
    for (const [mat, geo] of parts) {
      onFace(geo, face);
      if (face === "pz") geo.translate(0, 0, plane);
      if (face === "nz") geo.translate(0, 0, plane);
      if (face === "px" || face === "nx") geo.translate(plane, 0, zc);
      put(mat, geo);
    }
  };

  // ---- layout ------------------------------------------------------------------------
  const WX = 1.06,
    WF = 0.66,
    WB = -0.86,
    T = 0.16,
    ZC = (WF + WB) / 2;
  const SILL = 1.08,
    HEAD = 1.72,
    WIN = 0.78,
    FLOOR = 0.55,
    TOP = 1.8;
  const PO = 0.05; // how far piers stand proud of the walls

  // plinth: two chamfered courses
  blk(NIGHT, -1.18, 0, ZC - 0.88, 1.18, 0.1, ZC + 0.88, 0.03);
  blk(NIGHT, -1.13, 0.1, ZC - 0.83, 1.13, 0.2, ZC + 0.83, 0.025);

  // the room: walls, raised floor, ceiling, and a near-black lining
  blk(NIGHT, -WX, 0.2, WF - T, WX, SILL - 0.07, WF, 0.01); // under the counter
  blk(NIGHT, -WX, 0.2, WB + T, -WX + T, TOP, WF - T, 0.01); // sides
  blk(NIGHT, WX - T, 0.2, WB + T, WX, TOP, WF - T, 0.01);
  blk(NIGHT, -WX, 0.2, WB, WX, TOP, WB + T, 0.01); // back
  blk(NIGHT, -WX + T, 0.2, WB + T, WX - T, FLOOR, WF - T, 0.005);
  blk(NIGHT, -WX + T, HEAD, WB + T, WX - T, TOP, WF - T, 0.005);
  const inner = (w, h, x, y, z, rx, ry) => {
    const geo = new THREE.PlaneGeometry(w, h);
    if (rx) geo.rotateX(rx);
    if (ry) geo.rotateY(ry);
    put(SHADOW, geo.translate(x, y, z));
  };
  const RX = WX - T - 0.004,
    RB = WB + T + 0.004,
    RF = WF - T,
    RH = HEAD - FLOOR - 0.008;
  inner(2 * RX, RH, 0, (FLOOR + HEAD) / 2, RB);
  inner(2 * RX, RF - RB, 0, FLOOR + 0.004, (RF + RB) / 2, -Math.PI / 2);
  inner(2 * RX, RF - RB, 0, HEAD - 0.004, (RF + RB) / 2, Math.PI / 2);
  inner(RF - RB, RH, -RX, (FLOOR + HEAD) / 2, (RF + RB) / 2, 0, Math.PI / 2);
  inner(RF - RB, RH, RX, (FLOOR + HEAD) / 2, (RF + RB) / 2, 0, -Math.PI / 2);

  // corner piers, four courses each; the front pair doubles as the window jambs
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const y0 = 0.2 + k * 0.4,
        y1 = y0 + 0.4;
      const xa = s * WIN,
        xb = s * (WX + PO);
      blk(
        NIGHT,
        Math.min(xa, xb),
        y0,
        WF - 0.22,
        Math.max(xa, xb),
        y1,
        WF + PO,
        0.025,
      );
      const xc = s * (WX - 0.26),
        xd = s * (WX + PO);
      blk(
        NIGHT,
        Math.min(xc, xd),
        y0,
        WB - PO,
        Math.max(xc, xd),
        y1,
        WB + 0.26,
        0.025,
      );
    }
  }
  // side faces: base course, head course and a recessed chalk panel between the piers
  for (const s of [-1, 1]) {
    const xo = s * (WX + 0.03),
      xi = s * (WX - 0.02),
      xp = s * (WX + 0.008);
    blk(
      NIGHT,
      Math.min(xi, xo),
      0.2,
      WB + 0.26,
      Math.max(xi, xo),
      0.36,
      WF - 0.22,
      0.02,
    );
    blk(
      NIGHT,
      Math.min(xi, xo),
      1.64,
      WB + 0.26,
      Math.max(xi, xo),
      TOP,
      WF - 0.22,
      0.02,
    );
    blk(
      CHALK,
      Math.min(xi, xp),
      0.36,
      WB + 0.26,
      Math.max(xi, xp),
      1.64,
      WF - 0.22,
      0.008,
    );
    medallion(s > 0 ? "px" : "nx", 0, 1.0, s * (WX + 0.008), ZC, 0.28);
  }
  // back face: base course, a chalk door between jamb blocks, a lintel with a medallion,
  // chalk panels either side of the door
  blk(NIGHT, -WX + 0.26, 0.2, WB - 0.03, WX - 0.26, 0.36, WB + 0.02, 0.02);
  blk(NIGHT, -WX + 0.26, 1.64, WB - 0.03, WX - 0.26, TOP, WB + 0.02, 0.02);
  for (const s of [-1, 1]) {
    blk(
      NIGHT,
      Math.min(s * 0.38, s * 0.5),
      0.36,
      WB - 0.05,
      Math.max(s * 0.38, s * 0.5),
      1.64,
      WB + 0.02,
      0.02,
    );
    blk(
      CHALK,
      Math.min(s * 0.5, s * (WX - 0.26)),
      0.36,
      WB - 0.008,
      Math.max(s * 0.5, s * (WX - 0.26)),
      1.64,
      WB + 0.02,
      0.006,
    );
    for (const y of [0.62, 0.78, 0.94])
      blk(
        NIGHT,
        Math.min(s * 0.56, s * 0.74),
        y,
        WB - 0.03,
        Math.max(s * 0.56, s * 0.74),
        y + 0.05,
        WB,
        0.01,
      );
  }
  blk(CHALK, -0.38, 0.36, WB - 0.02, 0.38, 1.46, WB + 0.02, 0.01); // the door
  blk(NIGHT, -0.5, 1.46, WB - 0.06, 0.5, 1.64, WB + 0.02, 0.025); // its lintel
  medallion("nz", 0, 1.55, WB - 0.06, 0, 0.075);
  const knob = new THREE.TorusGeometry(0.055, 0.014, 6, 24);
  knob.translate(-0.24, 0.92, WB - 0.035);
  put(BRONZE, knob);
  cyl(BRONZE, 0.024, 0.024, 0.05, 10, -0.24, 0.975, WB - 0.035, "z");

  // front face: base course, chalk panel with medallion, corbel tongue, counter slab
  blk(NIGHT, -WIN, 0.2, WF - 0.02, WIN, 0.36, WF + 0.03, 0.02);
  blk(CHALK, -WIN, 0.36, WF - 0.02, WIN, 0.84, WF + 0.008, 0.008);
  medallion("pz", 0, 0.53, WF + 0.008, 0, 0.15);
  blk(NIGHT, -0.66, 0.84, WF - 0.02, 0.66, SILL - 0.07, 0.9, 0.03); // corbel tongue
  blk(NIGHT, -0.5, 0.74, WF - 0.02, 0.5, 0.86, 0.8, 0.025);
  blk(CHALK, -0.94, SILL - 0.07, WF - T - 0.1, 0.94, SILL, 1.0, 0.02); // counter

  // the brow over the window: a head block and a projecting slab of alternating
  // stamp-ochre and chalk blocks
  blk(NIGHT, -WX - PO, HEAD, WF - 0.22, WX + PO, TOP, WF + PO, 0.025);
  blk(NIGHT, -0.96, 1.76, WF, 0.96, 1.86, 0.86, 0.02);
  const NB = 9,
    BW = 2.04 / NB;
  for (let i = 0; i < NB; i++)
    blk(
      i % 2 ? CHALK : OCHRE,
      -1.02 + i * BW,
      1.86,
      WF - 0.05,
      -1.02 + (i + 1) * BW,
      2.0,
      0.96,
      0.018,
    );

  // band course round the other three faces, faced with the same alternating blocks
  const BZ0 = WB - 0.04,
    BZ1 = WF + PO,
    BXH = WX + 0.02;
  blk(NIGHT, -BXH, TOP, BZ0, BXH, 2.02, BZ1, 0.02);
  for (const s of [-1, 1])
    for (let i = 0; i < 7; i++) {
      const z0 = BZ0 + ((BZ1 - BZ0) * i) / 7,
        z1 = BZ0 + ((BZ1 - BZ0) * (i + 1)) / 7;
      blk(
        i % 2 ? CHALK : OCHRE,
        Math.min(s * (BXH - 0.01), s * (BXH + 0.02)),
        1.83,
        z0,
        Math.max(s * (BXH - 0.01), s * (BXH + 0.02)),
        1.99,
        z1,
        0.016,
      );
    }
  for (let i = 0; i < 9; i++) {
    const x0 = -BXH + (2 * BXH * i) / 9,
      x1 = -BXH + (2 * BXH * (i + 1)) / 9;
    blk(
      i % 2 ? CHALK : OCHRE,
      x0,
      1.83,
      BZ0 - 0.02,
      x1,
      1.99,
      BZ0 + 0.01,
      0.016,
    );
  }

  // stepped roof: cornice, chalk tier, basalt tier
  blk(NIGHT, -1.2, 2.02, -1.0, 1.2, 2.18, 0.8, 0.045);
  blk(CHALK, -0.98, 2.18, ZC - 0.68, 0.98, 2.33, ZC + 0.68, 0.035);
  blk(NIGHT, -0.68, 2.33, ZC - 0.38, 0.68, 2.47, ZC + 0.38, 0.03);
  cyl(BRONZE, 0.28, 0.3, 0.06, 32, 0, 2.5, ZC);
  cyl(BRONZE, 0.265, 0.265, 0.02, 32, 0, 2.54, ZC);
  for (let k = 0; k < 6; k++) {
    // six claws hold the dome
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const claw = cbox(0.06, 0.12, 0.035, 0.008);
    claw.translate(0, 0.05, 0);
    claw.rotateX(-0.35);
    claw.translate(0, 0, 0.255);
    claw.rotateY(a);
    put(BRONZE, claw.translate(0, 2.53, ZC));
  }
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    LAMP,
  );
  lamp.name = "lamp";
  lamp.position.set(0, 2.55, ZC);
  g.add(lamp);

  // the counter: a round stamp and a stack of slate papers
  cyl(NIGHT, 0.12, 0.125, 0.04, 28, -0.48, SILL + 0.02, 0.84);
  cyl(OCHRE, 0.1, 0.115, 0.07, 28, -0.48, SILL + 0.075, 0.84);
  cyl(TIMBER, 0.028, 0.034, 0.13, 12, -0.48, SILL + 0.175, 0.84);
  put(
    TIMBER,
    new THREE.SphereGeometry(0.052, 14, 10).translate(-0.48, SILL + 0.27, 0.84),
  );
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < 12; i++) {
    const top = i === 11;
    const geo = cbox(0.34, 0.014, 0.25, 0.004);
    geo.rotateY(top ? -0.45 : rnd() * 0.24);
    put(
      SLATE,
      geo.translate(
        0.42 + (top ? -0.04 : rnd() * 0.03),
        SILL + 0.008 + i * 0.018,
        0.83 + (top ? 0.03 : rnd() * 0.02),
      ),
    );
  }

  // ---- barrier post: square chamfered courses in front of the left corner ------------
  const PX = 1.5,
    PZ = 0.8,
    PIVOT = 1.1,
    AZ = PZ + 0.24; // the beam runs at z = AZ
  blk(NIGHT, PX - 0.22, 0, PZ - 0.22, PX + 0.22, 0.12, PZ + 0.22, 0.03);
  blk(NIGHT, PX - 0.16, 0.12, PZ - 0.16, PX + 0.16, 0.22, PZ + 0.16, 0.025);
  blk(NIGHT, PX - 0.12, 0.22, PZ - 0.12, PX + 0.12, 1.12, PZ + 0.12, 0.02);
  for (const y of [0.42, 0.72])
    blk(CHALK, PX - 0.13, y, PZ - 0.13, PX + 0.13, y + 0.1, PZ + 0.13, 0.012);
  blk(NIGHT, PX - 0.15, 1.12, PZ - 0.15, PX + 0.15, 1.2, PZ + 0.15, 0.025);
  cyl(BRONZE, 0.1, 0.1, 0.05, 24, PX, PIVOT, PZ + 0.145, "z"); // hub plate on the front face
  cyl(
    BRONZE,
    0.03,
    0.03,
    AZ - PZ - 0.17,
    12,
    PX,
    PIVOT,
    (PZ + 0.17 + AZ) / 2,
    "z",
  ); // the pin

  // ---- the barrier arm: a Group on the pin; octagonal striped beam along +x and a
  // round counterweight behind the pivot ---------------------------------------------
  const barrier = new THREE.Group();
  barrier.name = "barrier";
  barrier.position.set(PX, PIVOT, AZ);
  cyl(BRONZE, 0.085, 0.085, 0.12, 24, 0, 0, 0, "z", ARM); // hub
  const beam = (mat, x0, x1, r) => {
    const geo = new THREE.CylinderGeometry(r, r, x1 - x0, 8);
    geo.rotateY(Math.PI / 8);
    geo.rotateZ(-Math.PI / 2);
    put(mat, geo.translate((x0 + x1) / 2, 0, 0), ARM);
  };
  const L = 4.0,
    NBAND = 9,
    S0 = 0.06,
    E0 = L - 0.05;
  for (let i = 0; i < NBAND; i++)
    beam(
      i % 2 ? CHALK : OCHRE,
      S0 + ((E0 - S0) * i) / NBAND,
      S0 + ((E0 - S0) * (i + 1)) / NBAND,
      0.068,
    );
  beam(BRONZE, E0, L, 0.078); // end cap
  // the collar starts 1 cm short of the first band, so their end faces never share a plane
  beam(BRONZE, 0.05, 0.2, 0.078); // collar at the hub
  beam(NIGHT, -0.3, -0.05, 0.05); // counterweight arm
  cyl(NIGHT, 0.13, 0.13, 0.1, 28, -0.34, 0, 0, "z", ARM); // counterweight disc
  cyl(BRONZE, 0.07, 0.07, 0.112, 20, -0.34, 0, 0, "z", ARM);
  flush(ARM, barrier);
  g.add(barrier);

  for (const y of [0.56, 1.25]) {
    blk(
      BRONZE,
      -0.355,
      y - 0.045,
      WB - 0.047,
      -0.18,
      y + 0.045,
      WB - 0.022,
      0.008,
    );
    cyl(BRONZE, 0.025, 0.025, 0.13, 12, -0.352, y, WB - 0.05);
  }
  for (const s of [-1, 1]) {
    blk(
      BRONZE,
      s * 0.72 - 0.025,
      SILL + 0.025,
      WF - 0.015,
      s * 0.72 + 0.025,
      HEAD - 0.01,
      WF + 0.028,
      0.008,
    );
    for (const y of [SILL + 0.06, HEAD - 0.07])
      cyl(BRONZE, 0.018, 0.018, 0.016, 8, s * 0.72, y, WF + 0.034, "z");
  }
  blk(
    BRONZE,
    -0.73,
    HEAD - 0.047,
    WF - 0.015,
    0.73,
    HEAD - 0.012,
    WF + 0.027,
    0.007,
  );
  for (let i = 0; i < 5; i++)
    blk(
      SHADOW,
      -0.22 + i * 0.105,
      1.285,
      WB - 0.035,
      -0.167 + i * 0.105,
      1.335,
      WB - 0.022,
      0.005,
    );
  for (const s of [-1, 1])
    for (const z of [-0.64, 0.4])
      cyl(BRONZE, 0.022, 0.022, 0.018, 8, s * (WX + 0.022), 1.53, z, "x");

  flush(STATIC, g);

  // ---- placement: base at y = 0, centred on x and z (measured on vertices) ---------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
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
        add(m.multiplyMatrices(n.matrixWorld, im));
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

  const at = (x, y, z) => [
    +(x - c.x).toFixed(3),
    +(y - box.min.y).toFixed(3),
    +(z - c.z).toFixed(3),
  ];
  g.userData.joints = { barrier };
  g.userData.parts = { lamp };
  g.userData.window = {
    center: at(0, (SILL + HEAD) / 2, WF),
    width: 2 * WIN,
    height: +(HEAD - SILL).toFixed(3),
  };
  g.userData.counter = {
    center: at(0, SILL, (WF + 1.0) / 2),
    width: 1.88,
    depth: +(1.0 - WF).toFixed(3),
  };
  g.userData.inside = at(0, FLOOR, ZC + 0.1);
  return detail.finish();
}
