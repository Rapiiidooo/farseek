import { architectureDetail } from "../architecture-detail.js";
// hill_castle, arm C: a second reading, a ridge castle of crowned towers.
// Instead of a ring seen over its own front towers, the five towers stand in a
// staggered line along the crest, alternately forward and back, so all five
// read across the skyline from the front. Each tower is two-toned, sunlit
// sandstone up to a bone roll level with the wall walk and bone limestone above,
// and is crowned the fortified way: a machicolated gallery on sloping corbels,
// a crenellated parapet of curved merlons, and the steep cone rising from inside
// the parapet ring. The gate is a tall arch through a bone portal with a stepped
// crown, a ring of sandstone voussoirs and a dark door halfway along the passage.
// Everything is hand-built BufferGeometry: convex solids, smooth drums, curved
// sectors and prisms, with UVs projected from world space. Lit windows are flat
// arched panes (twin lights on the keep), merged into one lantern amber mesh,
// userData.parts.windows. One mesh per material.
export default function (THREE) {
  const g = new THREE.Group();
  const detail = architectureDetail(THREE, g);

  // ---- materials ----------------------------------------------------------------
  const mat = (color, roughness, name, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      ...extra,
    });
    if (name) m.name = name;
    return m;
  };
  const BONE = mat(0xe6d3ae, 0.84, "stone");
  const SUNLIT = mat(0xd4a373, 0.88, "stone");
  const SAND = mat(0xb57f4f, 0.9, "stone");
  const BASALT = mat(0x3a3531, 0.96, "stone");
  const ROOF = mat(0x4f7a3a, 0.76, "tile");
  const BRONZE = mat(0x9a6a35, 0.45, "metal", { metalness: 0.6 });
  // Lantern amber is light only; the dark base keeps an unlit window an opening.
  const GLOW = mat(0x3a3531, 0.62, null, {
    emissive: 0xffb24a,
    emissiveIntensity: 1.2,
  });

  // ---- hand-built geometry ---------------------------------------------------------
  const bufs = new Map();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const _e = new THREE.Vector3();
  const normalOf = (a, b, c) =>
    new THREE.Vector3().subVectors(b, a).cross(_e.subVectors(c, a)).normalize();
  const tri = (m, a, b, c, na, nb = na, nc = na) => {
    let B = bufs.get(m);
    if (!B) bufs.set(m, (B = { p: [], n: [] }));
    B.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    B.n.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
  };
  // A planar convex polygon, counterclockwise seen from its front, flat shaded.
  const fan = (m, pts) => {
    const n = normalOf(pts[0], pts[1], pts[2]);
    for (let i = 1; i < pts.length - 1; i++)
      tri(m, pts[0], pts[i], pts[i + 1], n);
  };
  // A convex solid from a bottom and a top ring of four corners. Each face is
  // turned outwards by testing it against the centroid, so corner order is free.
  const FACES = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const solid = (m, c8) => {
    const ctr = c8.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / 8);
    for (const f of FACES) {
      let q = f.map((i) => c8[i]);
      const fc = q.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(0.25);
      if (normalOf(q[0], q[1], q[2]).dot(fc.sub(ctr)) < 0)
        q = [q[0], q[3], q[2], q[1]];
      fan(m, q);
    }
  };
  // The side of a frustum round a tower axis, smooth shaded; either radius may
  // be zero. `inward` turns it to face the axis (the inside of a parapet).
  const drum = (m, t, r0, r1, y0, y1, n = 48, inward = false) => {
    const k = (r0 - r1) / (y1 - y0),
      s = inward ? -1 : 1;
    const P = (a, r, y) => V(t.x + r * Math.sin(a), y, t.z + r * Math.cos(a));
    const N = (a) => V(s * Math.sin(a), s * k, s * Math.cos(a)).normalize();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2,
        am = (a0 + a1) / 2;
      const b0 = P(a0, r0, y0),
        b1 = P(a1, r0, y0),
        c1 = P(a1, r1, y1),
        c0 = P(a0, r1, y1);
      const tris = [];
      if (r0 > 1e-4)
        tris.push([b0, b1, c1, N(a0), N(a1), r1 > 1e-4 ? N(a1) : N(am)]);
      if (r1 > 1e-4)
        tris.push([b0, c1, c0, r0 > 1e-4 ? N(a0) : N(am), N(a1), N(a0)]);
      for (const [a, b, c, na, nb, nc] of tris) {
        if (inward) tri(m, a, c, b, na, nc, nb);
        else tri(m, a, b, c, na, nb, nc);
      }
    }
  };
  // A flat ring (or disc, r0 = 0) round a tower axis, facing up or down.
  const annulus = (m, t, r0, r1, y, up, n = 48) => {
    const P = (a, r) => V(t.x + r * Math.sin(a), y, t.z + r * Math.cos(a));
    const nrm = V(0, up ? 1 : -1, 0);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      const q =
        r0 > 1e-4
          ? [P(a0, r1), P(a1, r1), P(a1, r0), P(a0, r0)]
          : [P(a0, r1), P(a1, r1), P(0, 0)];
      if (normalOf(q[0], q[1], q[2]).y * nrm.y < 0) q.reverse();
      for (let j = 1; j < q.length - 1; j++) tri(m, q[0], q[j], q[j + 1], nrm);
    }
  };
  // A curved block round a tower axis between two angles and two radii. The
  // outer bottom edge can sit at its own radius and height, which makes a corbel.
  const sector = (m, t, a0, a1, r0, r1, y0, y1, rOutBot = r1, yOutBot = y0) => {
    const P = (a, r, y) => V(t.x + r * Math.sin(a), y, t.z + r * Math.cos(a));
    solid(m, [
      P(a0, r0, y0),
      P(a1, r0, y0),
      P(a1, rOutBot, yOutBot),
      P(a0, rOutBot, yOutBot),
      P(a0, r0, y1),
      P(a1, r0, y1),
      P(a1, r1, y1),
      P(a0, r1, y1),
    ]);
  };
  // A block along a wall line: s along it, u across it (outwards), y up. The
  // outer face leans in by `lean` at the top.
  const beam = (m, w, s0, s1, u0, u1, y0, y1, lean = 0) => {
    const P = (s, u, y) =>
      V(w.ax + w.ux * s + w.nx * u, y, w.az + w.uz * s + w.nz * u);
    solid(m, [
      P(s0, u0, y0),
      P(s1, u0, y0),
      P(s1, u1, y0),
      P(s0, u1, y0),
      P(s0, u0, y1),
      P(s1, u0, y1),
      P(s1, u1 - lean, y1),
      P(s0, u1 - lean, y1),
    ]);
  };
  const box = (m, x0, x1, y0, y1, z0, z1) =>
    solid(m, [
      V(x0, y0, z0),
      V(x1, y0, z0),
      V(x1, y0, z1),
      V(x0, y0, z1),
      V(x0, y1, z0),
      V(x1, y1, z0),
      V(x1, y1, z1),
      V(x0, y1, z1),
    ]);
  // A polygon in x and y (counterclockwise seen from +Z) extruded from z0 to z1.
  // Edges along the ground are left open; they stand on the hill.
  const prismZ = (m, outline, z0, z1) => {
    const F = (i, z) => V(outline[i][0], outline[i][1], z);
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
      outline.map(([x, y]) => new THREE.Vector2(x, y)),
      [],
    )) {
      const [ax, ay] = outline[a],
        [bx, by] = outline[b],
        [cx, cy] = outline[c];
      const ccw = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0;
      const [p, q] = ccw ? [b, c] : [c, b];
      tri(m, F(a, z1), F(p, z1), F(q, z1), V(0, 0, 1));
      tri(m, F(a, z0), F(q, z0), F(p, z0), V(0, 0, -1));
    }
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      if (outline[i][1] < 1e-6 && outline[j][1] < 1e-6) continue;
      fan(m, [F(i, z0), F(j, z0), F(j, z1), F(i, z1)]);
    }
  };
  // Lit windows: a flat arched pane facing phi (0 is +Z), its sill at y0.
  const arch = (w, hr, seg = 6) => {
    const pts = [
      [-w / 2, 0],
      [w / 2, 0],
      [w / 2, hr],
    ];
    for (let i = 1; i < seg; i++) {
      const a = (i / seg) * Math.PI;
      pts.push([(w / 2) * Math.cos(a), hr + (w / 2) * Math.sin(a)]);
    }
    pts.push([-w / 2, hr]);
    return pts;
  };
  const pane = (m, x, y0, z, phi, w, hr) => {
    const c = Math.cos(phi),
      s = Math.sin(phi);
    fan(
      m,
      arch(w, hr).map(([lx, ly]) => V(x + lx * c, y0 + ly, z - lx * s)),
    );
  };
  const windowFrame = (x, y0, z, phi, w, hr, frame = BONE) => {
    const c = Math.cos(phi),
      s = Math.sin(phi);
    const P = (lx, ly, depth) =>
      V(x + lx * c + depth * s, y0 + ly, z - lx * s + depth * c);
    const inner = arch(w + 0.035, hr),
      outer = arch(w + 0.3, hr);
    for (const point of outer) if (point[1] === 0) point[1] = -0.16;
    for (let i = 0; i < inner.length; i++) {
      const next = (i + 1) % inner.length;
      solid(frame, [
        P(...inner[i], -0.055),
        P(...inner[next], -0.055),
        P(...outer[next], -0.055),
        P(...outer[i], -0.055),
        P(...inner[i], 0.14),
        P(...inner[next], 0.14),
        P(...outer[next], 0.14),
        P(...outer[i], 0.14),
      ]);
    }
    const bar = (x0, x1, y0, y1) =>
      solid(BRONZE, [
        P(x0, y0, 0.018),
        P(x1, y0, 0.018),
        P(x1, y1, 0.018),
        P(x0, y1, 0.018),
        P(x0, y0, 0.052),
        P(x1, y0, 0.052),
        P(x1, y1, 0.052),
        P(x0, y1, 0.052),
      ]);
    bar(-0.025, 0.025, 0, hr + w / 2 - 0.025);
    bar(-w / 2, w / 2, hr * 0.62 - 0.025, hr * 0.62 + 0.025);
  };

  // ---- plan -------------------------------------------------------------------------
  const WALK = 9.0,
    T = 2.0;
  const C = { x: 0, z: -0.8 };
  const TW = [
    // Hs is the foot of the parapet; the cone starts 0.3 m above it.
    // keep: 25 + 0.3 + 12.95 + 3.75 = 42 m to the spire tip
    {
      x: 3.4,
      z: -5.6,
      r: 4.4,
      Hs: 25.0,
      roof: 12.95,
      spire: 3.75,
      round: [14.2],
      twin: 19.6,
      low: [5.4],
      w: 0.9,
      hr: 1.15,
    },
    {
      x: -8.0,
      z: -5.0,
      r: 3.4,
      Hs: 19.5,
      roof: 10.3,
      spire: 3.0,
      round: [14.0],
      low: [5.4],
      w: 0.85,
      hr: 1.05,
    },
    {
      x: 15.0,
      z: -3.6,
      r: 2.6,
      Hs: 17.5,
      roof: 9.6,
      spire: 2.8,
      round: [12.4],
      low: [5.0],
      w: 0.8,
      hr: 1.0,
    },
    {
      x: 9.4,
      z: 4.6,
      r: 3.0,
      Hs: 15.5,
      roof: 8.9,
      spire: 2.6,
      round: [11.0],
      low: [4.8],
      w: 0.85,
      hr: 1.05,
    },
    {
      x: -14.6,
      z: 3.2,
      r: 2.7,
      Hs: 14.0,
      roof: 8.3,
      spire: 2.4,
      round: [10.9],
      low: [4.8],
      w: 0.8,
      hr: 1.0,
    },
  ];
  const [KEEP, T2, T5, T4, T1] = TW;

  // Portal: centre, half width, wall line, faces, arch, crown steps.
  const GXc = -2.0,
    PW = 3.8,
    GZ = 4.15,
    PZ0 = GZ - T / 2,
    PZ1 = GZ + T / 2 + 0.9;
  const OW = 2.1,
    SPR = 6.6,
    R_OUT = 3.0,
    PH = 11.8;
  const GATE_L = { x: GXc - PW, z: 4.0, r: 0 },
    GATE_R = { x: GXc + PW, z: 4.3, r: 0 };
  const WALLS = [
    [T1, GATE_L],
    [GATE_R, T4],
    [T4, T5],
    [T5, KEEP],
    [KEEP, T2],
    [T2, T1],
  ];

  // ---- curtain walls ------------------------------------------------------------------
  const MW = 1.2,
    GAP = 0.95;
  for (const [a, b] of WALLS) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      L = Math.hypot(dx, dz),
      ux = dx / L,
      uz = dz / L;
    let nx = uz,
      nz = -ux;
    if (nx * ((a.x + b.x) / 2 - C.x) + nz * ((a.z + b.z) / 2 - C.z) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const w = { ax: a.x, az: a.z, ux, uz, nx, nz };
    const s0 = a.r ? 0 : -0.5,
      s1 = b.r ? L : L + 0.5;
    beam(SAND, w, s0, s1, -T / 2 - 0.3, T / 2 + 0.7, 0, 2.2, 0.6); // battered foot
    beam(SUNLIT, w, s0, s1, -T / 2, T / 2, 0, WALK); // wall
    beam(BONE, w, s0, s1, T / 2 - 0.1, T / 2 + 0.16, WALK - 0.55, WALK - 0.05); // coping
    beam(SUNLIT, w, s0, s1, T / 2 - 0.55, T / 2, WALK, WALK + 0.65); // parapet
    const m0 = a.r ? a.r + 0.35 : 0.3,
      m1 = b.r ? L - b.r - 0.35 : L - 0.3;
    const span = m1 - m0,
      n = Math.max(1, Math.round((span + GAP) / (MW + GAP)));
    const step = n > 1 ? (span - MW) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const s = n > 1 ? m0 + MW / 2 + i * step : (m0 + m1) / 2;
      beam(
        SUNLIT,
        w,
        s - MW / 2,
        s + MW / 2,
        T / 2 - 0.55,
        T / 2,
        WALK + 0.6,
        WALK + 1.8,
      );
    }
  }

  // ---- towers ---------------------------------------------------------------------------
  const joinsOf = (t) => {
    const j = [];
    for (const [a, b] of WALLS) {
      if (a === t) j.push(Math.atan2(b.x - t.x, b.z - t.z));
      if (b === t) j.push(Math.atan2(a.x - t.x, a.z - t.z));
    }
    return j;
  };
  const gap = (p, q) => Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q)));
  for (const t of TW) {
    const { r, Hs } = t;
    const yC = Hs - 1.6; // foot of the corbels
    drum(SAND, t, r + 0.75, r, 0, 3.0); // battered foot
    drum(SUNLIT, t, r, r - 0.05, 3.0, WALK - 0.6); // sandstone lower storeys
    // roll level with the walk, its top 3 cm proud so it never shares the walk's plane
    drum(BONE, t, r + 0.18, r + 0.18, WALK - 0.6, WALK + 0.03);
    annulus(BONE, t, r - 0.05, r + 0.18, WALK + 0.03, true);
    annulus(BONE, t, r - 0.05, r + 0.18, WALK - 0.6, false);
    drum(BONE, t, r - 0.05, r - 0.15, WALK, Hs - 0.3); // bone upper storeys
    // machicolated gallery: sloping corbels under an overhanging parapet
    const nc = Math.max(12, Math.round((2 * Math.PI * r) / 0.95));
    for (let i = 0; i < nc; i++) {
      const a = (i / nc) * Math.PI * 2,
        d = 0.21 / r;
      sector(
        SUNLIT,
        t,
        a - d,
        a + d,
        r - 0.35,
        r + 0.72,
        yC,
        Hs - 0.3,
        r + 0.72,
        Hs - 0.62,
      );
    }
    drum(SUNLIT, t, r + 0.75, r + 0.75, Hs - 0.3, Hs + 0.9); // parapet, outer face
    annulus(SUNLIT, t, r - 0.15, r + 0.75, Hs - 0.3, false); // its underside
    drum(SUNLIT, t, r + 0.3, r + 0.3, Hs + 0.3, Hs + 0.9, 48, true); // inner face
    annulus(SUNLIT, t, r + 0.3, r + 0.75, Hs + 0.9, true); // crenel floor
    annulus(SAND, t, r - 0.2, r + 0.3, Hs + 0.3, true); // gallery floor
    const nm = Math.max(7, Math.round((2 * Math.PI * (r + 0.52)) / 2.1));
    for (let i = 0; i < nm; i++) {
      const a = ((i + 0.5) / nm) * Math.PI * 2,
        d = 0.56 / (r + 0.52);
      sector(SUNLIT, t, a - d, a + d, r + 0.3, r + 0.75, Hs + 0.85, Hs + 2.0);
    }
    const apex = Hs + 0.3 + t.roof;
    drum(ROOF, t, r + 0.12, 0, Hs + 0.3, apex); // cone inside the parapet
    const k = apex + 0.32 * t.spire;
    drum(BRONZE, t, 0.24, 0, apex - 0.7, apex + t.spire, 8); // needle
    drum(BRONZE, t, 0, 0.36, k - 0.34, k, 8); // knop
    drum(BRONZE, t, 0.36, 0, k, k + 0.34, 8);

    // windows: above the parapets they go all the way round; lower ones only
    // face out, and never where a wall meets the tower
    const joins = joinsOf(t),
      out = Math.atan2(t.x - C.x, t.z - C.z);
    const rAt = (y) =>
      y < WALK
        ? r - (0.05 * (y - 3)) / (WALK - 3.6)
        : r - 0.05 - (0.1 * (y - WALK)) / (Hs - 0.3 - WALK);
    const at = (phi, y, dw = 0) => {
      const rr = rAt(y) + 0.035,
        c = Math.cos(phi),
        s = Math.sin(phi);
      (t.windows ??= []).push({
        angle: phi + Math.atan2(dw, rr),
        y,
        width: t.w,
        height: t.hr + t.w / 2,
      });
      pane(
        GLOW,
        t.x + rr * s + dw * c,
        y,
        t.z + rr * c - dw * s,
        phi,
        t.w,
        t.hr,
      );
      windowFrame(
        t.x + rr * s + dw * c,
        y,
        t.z + rr * c - dw * s,
        phi,
        t.w,
        t.hr,
      );
    };
    t.round.forEach((y, i) => {
      const n = r > 3.2 ? 5 : 4;
      for (let q = 0; q < n; q++)
        at(out + ((q + 0.5 * (i % 2)) / n) * Math.PI * 2, y);
    });
    if (t.twin)
      for (let q = 0; q < 4; q++) {
        const phi = out + ((q + 0.5) / 4) * Math.PI * 2;
        at(phi, t.twin, -0.62);
        at(phi, t.twin, 0.62);
      }
    for (const y of t.low) {
      for (let q = -2; q <= 2; q++) {
        const phi = out + q * 0.62;
        if (joins.some((j) => gap(phi, j) < 0.65)) continue;
        at(phi, y);
      }
    }
  }

  // ---- portal: a tall arch through a bone block with a stepped crown -------------------------------
  {
    const outline = [
      [GXc - PW, 0],
      [GXc - OW, 0],
      [GXc - OW, SPR],
    ];
    for (let i = 1; i < 16; i++) {
      const a = Math.PI - (i / 16) * Math.PI;
      outline.push([GXc + OW * Math.cos(a), SPR + OW * Math.sin(a)]);
    }
    outline.push(
      [GXc + OW, SPR],
      [GXc + OW, 0],
      [GXc + PW, 0],
      [GXc + PW, PH],
      [GXc - PW, PH],
    );
    prismZ(BONE, outline, PZ0, PZ1);
    // two stepped tiers across the full depth, each with a sandstone coping
    for (const [hw, y0, y1] of [
      [2.6, PH + 0.05, PH + 1.0],
      [1.3, PH + 1.0, PH + 2.0],
    ]) {
      box(BONE, GXc - hw, GXc + hw, y0, y1 - 0.22, PZ0, PZ1);
      box(
        SUNLIT,
        GXc - hw - 0.12,
        GXc + hw + 0.12,
        y1 - 0.22,
        y1,
        PZ0 - 0.12,
        PZ1 + 0.12,
      );
    }
    box(
      SUNLIT,
      GXc - PW - 0.12,
      GXc + PW + 0.12,
      PH - 0.2,
      PH + 0.05,
      PZ0 - 0.12,
      PZ1 + 0.12,
    );
    // sandstone voussoirs, proud of the face, and a keystone
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI + 0.012,
        a1 = ((i + 1) / N) * Math.PI - 0.012;
      const key = i === (N - 1) / 2,
        ro = key ? R_OUT + 0.3 : R_OUT,
        zf = PZ1 + (key ? 0.3 : 0.2);
      const P = (a, rr, z) =>
        V(GXc + rr * Math.cos(a), SPR + rr * Math.sin(a), z);
      solid(SAND, [
        P(a0, OW - 0.03, PZ1 - 0.05),
        P(a1, OW - 0.03, PZ1 - 0.05),
        P(a1, ro, PZ1 - 0.05),
        P(a0, ro, PZ1 - 0.05),
        P(a0, OW - 0.03, zf),
        P(a1, OW - 0.03, zf),
        P(a1, ro, zf),
        P(a0, ro, zf),
      ]);
    }
    // sandstone footing either side, and the dark door halfway along the passage
    for (const s of [-1, 1]) {
      const x0 = GXc + s * (OW - 0.06),
        x1 = GXc + s * (PW + 0.45);
      solid(SAND, [
        V(x0, 0, PZ0 - 0.1),
        V(x1, 0, PZ0 - 0.1),
        V(x1, 0, PZ1 + 0.45),
        V(x0, 0, PZ1 + 0.45),
        V(x0, 1.8, PZ0 - 0.1),
        V(GXc + s * PW, 1.8, PZ0 - 0.1),
        V(GXc + s * PW, 1.8, PZ1 + 0.05),
        V(x0, 1.8, PZ1 + 0.05),
      ]);
      // the portal's lights get the towers' framed reveals, in sandstone against the bone face
      pane(GLOW, GXc + s * 1.35, 9.75, PZ1 + 0.03, 0, 0.7, 0.75);
      windowFrame(GXc + s * 1.35, 9.75, PZ1 + 0.03, 0, 0.7, 0.75, SAND);
      pane(GLOW, GXc + s * 1.35, 9.75, PZ0 - 0.03, Math.PI, 0.7, 0.75);
      windowFrame(GXc + s * 1.35, 9.75, PZ0 - 0.03, Math.PI, 0.7, 0.75, SAND);
    }
    const zd = (PZ0 + PZ1) / 2;
    fan(
      BASALT,
      arch(2 * OW + 0.1, SPR).map(([x, y]) => V(GXc + x, y, zd + 0.1)),
    );
    fan(
      BASALT,
      arch(2 * OW + 0.1, SPR).map(([x, y]) => V(GXc - x, y, zd - 0.1)),
    );
  }

  const doorZ = (PZ0 + PZ1) / 2 + 0.12;
  for (let i = 0; i < 9; i++) {
    const x = GXc - 1.96 + i * 0.49;
    box(SAND, x, x + 0.445, 0.18, SPR - 0.12, doorZ, doorZ + 0.035);
  }
  for (const y of [1.4, 3.25, 5.5]) {
    box(
      BRONZE,
      GXc - 1.97,
      GXc - 0.08,
      y,
      y + 0.14,
      doorZ + 0.035,
      doorZ + 0.1,
    );
    box(
      BRONZE,
      GXc + 0.08,
      GXc + 1.97,
      y,
      y + 0.14,
      doorZ + 0.035,
      doorZ + 0.1,
    );
  }
  for (const t of TW) {
    for (const y of [3.05, 6.4, 11.8])
      if (y < t.Hs - 2) {
        const radius = t.r - (y > WALK ? 0.1 : 0) + 0.014;
        drum(SAND, t, radius, radius, y, y + 0.045, 24);
      }
    const courses = Math.ceil(t.roof / 0.55);
    for (let level = 1; level < courses; level++) {
      const fraction = level / courses;
      const y = t.Hs + 0.3 + t.roof * fraction;
      const radius = (t.r + 0.12) * (1 - fraction);
      drum(ROOF, t, radius + 0.065, radius + 0.012, y - 0.075, y + 0.04, 24);
      annulus(ROOF, t, radius - 0.01, radius + 0.065, y - 0.075, false, 24);
    }
  }

  // ---- courtyard floor --------------------------------------------------------------------------
  {
    const ring = [
      T1,
      { x: GXc - PW, z: PZ0 },
      { x: GXc + PW, z: PZ0 },
      T4,
      T5,
      KEEP,
      T2,
    ];
    const pts = ring.map((p) => [p.x, -p.z]);
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
      pts.map(([x, y]) => new THREE.Vector2(x, y)),
      [],
    )) {
      const P = (i) => V(pts[i][0], 0.12, -pts[i][1]);
      const q = [P(a), P(b), P(c)];
      if (normalOf(q[0], q[1], q[2]).y < 0) q.reverse();
      tri(SAND, q[0], q[1], q[2], V(0, 1, 0));
    }
  }

  // ---- one mesh per material, UVs projected from world space ---------------------------------------
  const build = (B) => {
    const pos = new Float32Array(B.p),
      nor = new Float32Array(B.n),
      uv = new Float32Array((B.p.length / 3) * 2);
    let x0 = Infinity,
      y0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      z1 = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      x0 = Math.min(x0, pos[i]);
      x1 = Math.max(x1, pos[i]);
      y0 = Math.min(y0, pos[i + 1]);
      y1 = Math.max(y1, pos[i + 1]);
      z0 = Math.min(z0, pos[i + 2]);
      z1 = Math.max(z1, pos[i + 2]);
    }
    const W = Math.max(x1 - x0, z1 - z0, 1e-3),
      H = Math.max(y1 - y0, 1e-3);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let t = 0; t < pos.length / 9; t++) {
      a.fromArray(pos, t * 9);
      b.fromArray(pos, t * 9 + 3);
      c.fromArray(pos, t * 9 + 6);
      const n = normalOf(a, b, c);
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k,
          x = pos[i * 3],
          y = pos[i * 3 + 1],
          z = pos[i * 3 + 2];
        if (Math.abs(n.y) > 0.7) {
          uv[i * 2] = (x - x0) / W;
          uv[i * 2 + 1] = (z - z0) / W;
        } else if (Math.abs(n.x) > Math.abs(n.z)) {
          uv[i * 2] = (z - z0) / W;
          uv[i * 2 + 1] = (y - y0) / H;
        } else {
          uv[i * 2] = (x - x0) / W;
          uv[i * 2 + 1] = (y - y0) / H;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geo;
  };
  let windows = null;
  for (const [m, B] of bufs) {
    const mesh = new THREE.Mesh(build(B), m);
    if (m === GLOW) {
      mesh.name = "windows";
      windows = mesh;
    }
    g.add(mesh);
  }

  // ---- place: base on y = 0, centred on x and z -----------------------------------------------------
  const bb = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const add = (mat4) => {
      for (let i = 0; i < p.count; i++)
        bb.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4));
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
  const ctr = bb.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= ctr.x;
    o.position.y -= bb.min.y;
    o.position.z -= ctr.z;
  });

  g.userData.parts = { windows };
  g.userData.growthSurfaces = {
    towers: TW.map((t) => ({
      x: t.x - ctr.x,
      z: t.z - ctr.z,
      radius: t.r,
      height: t.Hs,
      outward: Math.atan2(t.x - C.x, t.z - C.z),
      windows: t.windows || [],
    })),
  };
  return detail.finish();
}
