import { refineNature } from "../nature-detail.js";

// frozen_falls: a curtain of swept ice columns over a deep-ice body, flat at the back. Built
// against the rock plane z = 0; the placement at the end recentres.
export default function (THREE) {
  const g = new THREE.Group();
  g.userData.mounts = "back";

  const mat = (hex, rough) =>
    new THREE.MeshStandardMaterial({
      color: hex,
      roughness: rough,
      metalness: 0,
      flatShading: true,
    });
  const ICE = mat(0xa9d2e3, 0.35);
  const DEEP = mat(0x5b9bbd, 0.4);
  const FROST = mat(0xe9f2f6, 0.85);

  const add = (geo, m) => {
    const mesh = new THREE.Mesh(geo, m);
    g.add(mesh);
    return mesh;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  let seed = 1811;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() * 2 - 1) * a;
  const hj = (x, y, z, a) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return ((h - Math.floor(h)) * 2 - 1) * a;
  };
  // Frost thickness: a shell offset by this lies under the ice where it is negative, so the
  // frost's outline is the zero line, cutting across faces rather than following them.
  const frostAt = (p) =>
    0.022 +
    0.042 *
      (0.55 * Math.sin(p.x * 7.3 + p.y * 5.1 + 0.4) +
        0.45 * Math.sin(p.y * 9.7 - p.x * 4.4 + p.z * 6 + 1.3));

  // How far the front of the curtain stands off the rock, by height: over the brow at 7.4 m,
  // tucked under it, out over the bulge at about 4.2 m and into the apron.
  const PY = [7.78, 7.33, 6.9, 6.3, 5.45, 4.5, 3.7, 2.6, 1.55, 0.35];
  const PZ = [0.5, 1.04, 0.74, 0.52, 0.84, 1.38, 1.34, 0.96, 0.72, 0.95];
  const front = (y) => {
    if (y >= PY[0]) return PZ[0];
    for (let i = 0; i < PY.length - 1; i++) {
      if (y >= PY[i + 1]) {
        const t = (PY[i] - y) / (PY[i] - PY[i + 1]),
          s = t * t * (3 - 2 * t);
        return PZ[i] + (PZ[i + 1] - PZ[i]) * s;
      }
    }
    return PZ[PZ.length - 1];
  };
  const reach = (x) => 1 - 0.32 * (x / 2.3) ** 2;

  const soups = new Map([
    [ICE, []],
    [DEEP, []],
    [FROST, []],
  ]);
  const e1 = V(0, 0, 0),
    e2 = V(0, 0, 0);
  const tri = (m, a, b, c, out) => {
    e1.subVectors(b, a).cross(e2.subVectors(c, a));
    if (e1.lengthSq() < 1e-12) return;
    if (e1.dot(out) < 0) [b, c] = [c, b];
    soups.get(m).push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const axisGap = (p, a, b) => {
    const ab = V(0, 0, 0).subVectors(b, a);
    const t = THREE.MathUtils.clamp(
      V(0, 0, 0).subVectors(p, a).dot(ab) / ab.lengthSq(),
      0,
      1,
    );
    return p.clone().sub(a.clone().addScaledVector(ab, t));
  };

  // Rings square to the path through the knots; the frame starts from +X, which never runs
  // along a column.
  const rings = (knots, sides, spin) =>
    knots.map((k, i) => {
      const t = V(0, 0, 0)
        .subVectors(
          knots[Math.min(knots.length - 1, i + 1)].p,
          knots[Math.max(0, i - 1)].p,
        )
        .normalize();
      const u = V(1, 0, 0).addScaledVector(t, -t.x).normalize();
      const w = V(0, 0, 0).crossVectors(t, u);
      const pts = [];
      for (let j = 0; j < sides; j++) {
        const q = spin + (j / sides) * Math.PI * 2,
          r = k.r * (1 + hj(k.p.x, k.p.y, j, 0.07));
        pts.push(
          k.p
            .clone()
            .addScaledVector(u, Math.cos(q) * r)
            .addScaledVector(w, Math.sin(q) * r),
        );
      }
      return { c: k.p, pts };
    });
  const lift = (p, c) =>
    p.clone().addScaledVector(
      V(0, 0, 0)
        .subVectors(p, c)
        .normalize()
        .multiplyScalar(0.6)
        .add(V(0, 0.4, 0)),
      frostAt(p),
    );
  const skin = (m, R, frosted = () => false) => {
    for (let i = 0; i < R.length - 1; i++) {
      const A = R[i],
        B = R[i + 1],
        n = A.pts.length;
      const mid = A.c.clone().add(B.c).multiplyScalar(0.5);
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        const out = A.pts[j].clone().add(B.pts[k]).multiplyScalar(0.5).sub(mid);
        tri(m, A.pts[j], A.pts[k], B.pts[k], out);
        tri(m, A.pts[j], B.pts[k], B.pts[j], out);
        const face = V(0, 0, 0)
          .subVectors(A.pts[k], A.pts[j])
          .cross(V(0, 0, 0).subVectors(B.pts[j], A.pts[j]))
          .normalize();
        if (face.dot(out) < 0) face.negate();
        if (face.y < 0.38 || !frosted((A.c.y + B.c.y) / 2)) continue;
        const [a, b, c, d] = [
          lift(A.pts[j], A.c),
          lift(A.pts[k], A.c),
          lift(B.pts[k], B.c),
          lift(B.pts[j], B.c),
        ];
        tri(FROST, a, b, c, out);
        tri(FROST, a, c, d, out);
      }
    }
  };
  // A pointed end faces away from its axis; a flat cap faces along it.
  const fan = (m, ring, apex, flat = false) => {
    const n = ring.pts.length,
      axis = apex.clone().sub(ring.c);
    for (let j = 0; j < n; j++) {
      const a = ring.pts[j],
        b = ring.pts[(j + 1) % n];
      const centroid = a
        .clone()
        .add(b)
        .add(apex)
        .multiplyScalar(1 / 3);
      tri(m, a, b, apex, flat ? axis : axisGap(centroid, ring.c, apex));
    }
  };

  // --- the deep-ice body -----------------------------------------------------------------
  {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0;
      const hw = top ? 1.5 : 1.95;
      p.setXYZ(
        i,
        Math.sign(p.getX(i)) * hw,
        top ? 7.75 : 0,
        p.getZ(i) > 0 ? 0.36 : 0.01,
      );
    }
    geo.computeVertexNormals();
    add(geo, DEEP);
    const b = add(new THREE.SphereGeometry(1, 14, 9, 0, Math.PI), DEEP);
    b.scale.set(1.95, 2.2, 1.08);
    b.position.set(0, 4.25, 0.012);
    const f = add(
      new THREE.SphereGeometry(1, 14, 6, 0, Math.PI, 0, Math.PI / 2),
      DEEP,
    );
    f.scale.set(2.1, 2.0, 0.7);
    f.position.z = 0.012;
    // One flat plate over the whole outline, facing the cliff, sits flush wherever it is set.
    const back = new THREE.PlaneGeometry(1, 1, 1, 7);
    const bp = back.attributes.position;
    const OUT = [
      [0, 2.5],
      [0.62, 2.5],
      [1.1, 2.3],
      [3.0, 2.28],
      [4.3, 2.16],
      [5.6, 1.98],
      [7.2, 1.84],
      [8.0, 1.72],
    ];
    for (let i = 0; i < bp.count; i++) {
      const [y, hw] = OUT[Math.round((bp.getY(i) + 0.5) * 7)];
      bp.setXYZ(i, Math.sign(bp.getX(i)) * hw, y, 0);
    }
    back.rotateY(Math.PI);
    back.computeVertexNormals();
    add(back, DEEP);
    const u = new THREE.CylinderGeometry(0.34, 0.34, 3.1, 7, 1, false);
    u.rotateZ(Math.PI / 2);
    add(u, DEEP).position.set(0, 7.2, 0.38);
  }

  // --- the columns -----------------------------------------------------------------------
  // x at the lip and at the foot, radius, lowest point (a free end hangs in a point), how far
  // it stands out, its turn; deep ones sit back in the grooves, the last four spill at the edges.
  const COLUMNS = [
    { xt: -1.56, xb: -2.16, r: 0.2, yb: 3.2, k: 0.7, spin: 0 },
    { xt: -1.28, xb: -1.74, r: 0.27, yb: 0.3, k: 0.82, spin: 0.52 },
    { xt: -1.02, xb: -1.37, r: 0.16, yb: 0.3, k: 0.72, spin: 0, m: DEEP },
    { xt: -0.76, xb: -1.0, r: 0.3, yb: 0.3, k: 0.94, spin: 0 },
    { xt: -0.4, xb: -0.5, r: 0.27, yb: 0.3, k: 0.99, spin: 0.52 },
    { xt: -0.1, xb: -0.1, r: 0.17, yb: 0.3, k: 0.84, spin: 0, m: DEEP },
    { xt: 0.2, xb: 0.28, r: 0.33, yb: 0.3, k: 1.04, spin: 0 },
    { xt: 0.57, xb: 0.76, r: 0.26, yb: 0.3, k: 0.97, spin: 0.52 },
    { xt: 0.86, xb: 1.18, r: 0.17, yb: 0.3, k: 0.8, spin: 0, m: DEEP },
    { xt: 1.12, xb: 1.52, r: 0.29, yb: 0.3, k: 0.87, spin: 0 },
    { xt: 1.39, xb: 1.86, r: 0.23, yb: 1.4, k: 0.76, spin: 0.52 },
    { xt: 1.6, xb: 2.16, r: 0.18, yb: 3.0, k: 0.66, spin: 0 },
    { xt: -1.86, xb: -2.06, r: 0.15, yb: 4.3, k: 0.6, spin: 0.3, spill: true },
    { xt: -2.12, xb: -2.24, r: 0.11, yb: 6.1, k: 0.55, spin: 0.1, spill: true },
    { xt: 1.88, xb: 2.08, r: 0.14, yb: 4.8, k: 0.6, spin: 0.2, spill: true },
    { xt: 2.14, xb: 2.25, r: 0.1, yb: 6.5, k: 0.52, spin: 0.4, spill: true },
  ];
  const Y_TOP = PY[0],
    Y_FOOT = 0.3;
  for (const c of COLUMNS) {
    const m = c.m || ICE,
      ice = m === ICE && !c.spill;
    const phase = rnd() * Math.PI * 2,
      drip = 0.06 + rnd() * 0.07;
    const xAt = (y) =>
      c.xb +
      (c.xt - c.xb) * (Math.max(0, y - Y_FOOT) / (Y_TOP - Y_FOOT)) ** 1.2;
    // thicker over the bulge and at the foot, swelling where drips froze, tapering to a free end
    const rAt = (y) => {
      const swell = 1 + 0.2 * Math.exp(-(((y - 4.2) / 1.1) ** 2)),
        bead =
          1 +
          drip *
            (Math.sin(y * 2.6 + phase) + 0.5 * Math.sin(y * 6.1 + 2 * phase));
      if (c.yb > Y_FOOT)
        return (
          c.r *
          swell *
          bead *
          Math.max(0.55, Math.min(1, (y - c.yb) / 2.2 + 0.55))
        );
      return c.r * bead * (swell + 0.35 * Math.max(0, 1 - y / 1.2));
    };
    const zAt = (y, r, x) => Math.max(r + 0.02, front(y) * c.k * reach(x) - r);
    const bottom = Math.max(c.yb, Y_FOOT);
    // closer knots over the brow, where the column turns most
    const step = (y) => (y > 6.4 ? 0.2 : 0.4);
    const ys = [Y_TOP];
    while (ys.at(-1) - step(ys.at(-1)) > bottom + 0.15)
      ys.push(ys.at(-1) - step(ys.at(-1)) + jit(0.04));
    ys.push(bottom);
    const knots = ys.map((y, i) => {
      const r = rAt(y),
        x = xAt(y) + (i ? jit(0.012) : 0);
      return { p: V(x, y, zAt(y, r, x) + (i ? jit(0.015) : 0)), r };
    });
    const sides = m === DEEP ? 5 : 6;
    const R = rings(knots, sides, c.spin);
    // frost settles on the upper slope of the bulge
    const bulge = ice && rnd() < 0.75;
    const lo = 4.4 + jit(0.2),
      hi = 5.3 + jit(0.25);
    skin(m, R, (y) => bulge && y > lo && y < hi);
    const end = (i, j) => R[i].c.clone().sub(R[j].c).normalize();
    fan(m, R[0], R[0].c.clone().addScaledVector(end(0, 1), 0.02), true);
    const last = R[R.length - 1];
    if (c.yb > Y_FOOT)
      fan(
        m,
        last,
        last.c
          .clone()
          .add(V(jit(0.03), -(0.45 + knots.at(-1).r * 1.8), jit(0.03))),
      );
    else
      fan(
        m,
        last,
        last.c.clone().addScaledVector(end(R.length - 1, R.length - 2), 0.02),
        true,
      );
    if (!ice) continue;
    // icicles hang from the brow's underside, clear of the curtain tucked in below it
    for (let i = 0, count = rnd() < 0.55 ? 2 : 1; i < count; i++) {
      const y0 = 7.14 + jit(0.06),
        r0 = rAt(y0),
        x = xAt(y0) + jit(r0 * 0.6);
      const len = 0.35 + rnd() * 0.75,
        rad = 0.04 + len * 0.045;
      const cone = new THREE.ConeGeometry(rad, len, 6, 1, false, rnd());
      cone.rotateX(Math.PI);
      add(cone, ICE).position.set(x, y0 - len / 2, zAt(y0, r0, x) + r0 * 0.55);
    }
    if (rnd() < 0.45) {
      const y0 = 3.42 + jit(0.08),
        r0 = rAt(y0),
        x = xAt(y0) + jit(r0 * 0.5);
      const len = 0.3 + rnd() * 0.45,
        rad = 0.035 + len * 0.05;
      const cone = new THREE.ConeGeometry(rad, len, 5, 1, false, rnd());
      cone.rotateX(Math.PI);
      add(cone, ICE).position.set(
        x,
        y0 - len / 2,
        front(y0) * c.k * reach(x) - 0.03,
      );
    }
  }

  // A loft along X through sections [[z, y], ...], shrunk to a point at both ends.
  const along = (m, from, to, gap, section) => {
    const xs = [
      [from - 0.06, 0],
      [from, 0.55],
      [from + 0.1, 0.85],
    ];
    for (let x = from + 0.26; x < to - 0.2; x += gap) xs.push([x, 1]);
    xs.push([to - 0.1, 0.85], [to, 0.55], [to + 0.06, 0]);
    const R = xs.map(([x, s]) => {
      const sec = section(x);
      const cz = sec.reduce((a, [z]) => a + z, 0) / sec.length,
        cy = sec.reduce((a, [, y]) => a + y, 0) / sec.length;
      return {
        c: V(x, cy, cz),
        pts: sec.map(([z, y]) =>
          V(x, cy + (y - cy) * s, Math.max(0.012, cz + (z - cz) * s)),
        ),
      };
    });
    for (let i = 0; i < R.length - 1; i++) {
      const A = R[i],
        B = R[i + 1],
        n = A.pts.length;
      for (let k = 0; k < n; k++) {
        const a = A.pts[k],
          b = B.pts[k],
          c = B.pts[(k + 1) % n],
          d = A.pts[(k + 1) % n];
        const mid = a.clone().add(c).multiplyScalar(0.5);
        const core = V(
          THREE.MathUtils.clamp(mid.x, from + 0.3, to - 0.3),
          (A.c.y + B.c.y) / 2,
          (A.c.z + B.c.z) / 2,
        );
        tri(m, a, d, c, mid.clone().sub(core));
        tri(m, a, c, b, mid.sub(core));
      }
    }
  };

  // --- the brow: a lumpy roll of ice where the curtain spills over the lip -----------------
  {
    const bump = (x) =>
      COLUMNS.reduce(
        (s, c) =>
          c.m || c.spill
            ? s
            : Math.max(s, c.k * Math.max(0, 1 - ((x - c.xt) / 0.26) ** 2)),
        0,
      );
    along(ICE, -1.82, 1.84, 0.12, (x) => {
      const b = bump(x),
        f =
          (0.8 + 0.22 * b) *
          reach(x) *
          (1 + 0.07 * Math.sin(x * 13.7 + 0.5) + jit(0.03)),
        y = 7.36 + 0.03 * Math.sin(x * 5.1) + jit(0.015);
      return [
        [0.05, y + 0.34],
        [0.45 * f, y + 0.36],
        [0.86 * f, y + 0.23 + jit(0.03)],
        [f, y + 0.02],
        [0.93 * f, y - 0.2 - 0.06 * b + jit(0.04)],
        [0.7 * f, y - 0.31 - 0.05 * b + jit(0.04)],
        [0.4 * f, y - 0.27],
        [0.05, y - 0.2],
      ];
    });
  }

  // --- the cornice: snow lodged on the lip, drooping over the brow -----------------------
  {
    const section = (x) => {
      const top =
        7.92 + 0.03 * Math.sin(x * 4.1 + 0.6) + 0.02 * Math.sin(x * 9.7 + 2.1);
      const zf =
        0.6 +
        0.07 * Math.sin(x * 2.3 + 1.2) +
        0.04 * Math.sin(x * 6.1) +
        jit(0.02);
      const droop =
        0.06 + 0.06 * Math.max(0, Math.sin(x * 5.3 + 0.4)) + jit(0.015);
      return [
        [0.012, top - 0.06],
        [0.2, top + 0.02],
        [zf - 0.2, top + jit(0.012)],
        [zf - 0.03, top - 0.07],
        [zf, top - 0.15 - droop * 0.5],
        [zf - 0.07, top - 0.25 - droop],
        [zf - 0.3, top - 0.27],
        [0.012, top - 0.29],
      ];
    };
    along(FROST, -2.3, 2.3, 0.16, section);
  }

  // --- the apron: pooled ice in front of the foot, with frost where the spray settled -----
  {
    const SX = 2.5,
      SY = 0.62,
      SZ = 1.72;
    const apron = new THREE.SphereGeometry(
      1,
      18,
      6,
      0,
      Math.PI,
      0,
      Math.PI / 2,
    );
    add(apron, ICE).scale.set(SX, SY, SZ);
    for (const [x, z, sx, sy, sz, ry] of [
      [-1.35, 1.2, 1.0, 0.3, 0.72, 0.3],
      [0.2, 1.42, 1.05, 0.32, 0.6, -0.1],
      [1.55, 1.18, 0.9, 0.28, 0.7, -0.35],
    ]) {
      const l = add(
        new THREE.SphereGeometry(1, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2),
        ICE,
      );
      l.scale.set(sx, sy, sz);
      l.position.set(x, 0, z);
      l.rotation.y = ry;
    }
    const s = add(
      new THREE.CylinderGeometry(
        1,
        1.03,
        0.12,
        14,
        1,
        false,
        -Math.PI / 2,
        Math.PI,
      ),
      DEEP,
    );
    s.scale.set(2.42, 1, 1.9);
    s.position.set(0, 0.06, 0);
    const flat = apron.index ? apron.toNonIndexed() : apron;
    const p = flat.attributes.position;
    const on = (i) => {
      const v = V(p.getX(i) * SX, p.getY(i) * SY, p.getZ(i) * SZ);
      const n = V(
        v.x / (SX * SX),
        v.y / (SY * SY),
        v.z / (SZ * SZ),
      ).normalize();
      return v.addScaledVector(
        n,
        frostAt(V(v.x * 0.8, v.z * 1.6 + 0.4, v.y)) - 0.016,
      );
    };
    for (let i = 0; i < p.count; i += 3) {
      const [a, b, c] = [on(i), on(i + 1), on(i + 2)];
      const ny = V(0, 0, 0)
        .subVectors(b, a)
        .cross(V(0, 0, 0).subVectors(c, a))
        .normalize();
      if (Math.abs(ny.y) < 0.55 || a.z + b.z + c.z < 1.2) continue;
      tri(FROST, a, b, c, V(0, 1, 0));
    }
    if (flat !== apron) flat.dispose();
  }

  // --- the hand-built triangles, faceted, with UVs projected over each material's box -------
  for (const [m, P] of soups) {
    if (!P.length) continue;
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i++) {
      lo[i % 3] = Math.min(lo[i % 3], P[i]);
      hi[i % 3] = Math.max(hi[i % 3], P[i]);
    }
    const su = Math.max(hi[0] - lo[0], hi[2] - lo[2]) || 1,
      sv = hi[1] - lo[1] || 1;
    const UV = [];
    const A = V(0, 0, 0),
      B = V(0, 0, 0),
      C = V(0, 0, 0);
    for (let t = 0; t < P.length; t += 9) {
      A.fromArray(P, t);
      B.fromArray(P, t + 3);
      C.fromArray(P, t + 6);
      e1.subVectors(B, A).cross(e2.subVectors(C, A));
      const fx = Math.abs(e1.x),
        fy = Math.abs(e1.y),
        fz = Math.abs(e1.z);
      for (const q of [A, B, C]) {
        const x = q.x - lo[0],
          y = q.y - lo[1],
          z = q.z - lo[2];
        const [u, v] =
          fy >= fx && fy >= fz ? [x, z] : fx >= fz ? [z, y] : [x, y];
        UV.push(u / su, v / sv);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
    geo.computeVertexNormals();
    add(geo, m);
  }

  // --- place: base on y = 0, centred on x and z ------------------------------------------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    mm = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (m4) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m4));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        put(mm.multiplyMatrices(n.matrixWorld, im));
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
  return refineNature(THREE, g, "frozen_falls");
}
