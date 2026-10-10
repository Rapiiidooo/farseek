import { propDetails } from "../props-detail.js";

// supply_crates, candidate C: a second reading, a supply dump left too long. Every
// board, batten and stave is its own hand-built chamfered block, so edges catch the
// sun the way the carved ruins do, and none sits quite true: the top crate has slid
// askew, a front board of the bottom crate has split and fallen in, the barrel's top
// hoop has slipped. Straw is bristling blades, spilling from the open crate.
// Front faces +Z. 1.8 m wide, 1.2 m deep, 1.3 m tall.
export default function (THREE) {
  const g = new THREE.Group();
  const details = propDetails(THREE, g);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Y = V(0, 1, 0);

  const mat = (color, name, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0,
      ...o,
    });
    m.name = name;
    return m;
  };
  // Values stay distinct per material: the loader merges by value, not by name.
  const TIMBER = mat(0x8a6a48, "timber", { roughness: 0.9 });
  const DARK = mat(0x4b2e1e, "timber", {
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const ROPE = mat(0xb49a6a, "fabric", { roughness: 0.92 });
  const STRAW = mat(0xb49a6a, "foliage", {
    roughness: 0.98,
    side: THREE.DoubleSide,
  });
  const BRONZE = mat(0x9a6a35, "metal", { roughness: 0.5, metalness: 0.6 });
  const PAPER = mat(0xe6d3ae, "fabric", {
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const LEATHER = mat(0x4b2e1e, "fabric", { roughness: 0.7 });

  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() - 0.5) * 2 * a;

  // --- faceted triangle soup: every face wound to face away from `inside` ----------------------------
  const soup = () => {
    const pos = [];
    const face = (pts, inside) => {
      const [a, b, c] = pts;
      const n = new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a));
      const mid = pts
        .reduce((s, p) => s.add(p), V(0, 0, 0))
        .multiplyScalar(1 / pts.length);
      const o =
        n.dot(mid.sub(inside)) < 0 ? [pts[0], ...pts.slice(1).reverse()] : pts;
      for (let i = 1; i < o.length - 1; i++)
        for (const p of [o[0], o[i], o[i + 1]]) pos.push(p.x, p.y, p.z);
    };
    const tri2 = (a, b, c) =>
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const geo = () => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const uv = [];
      for (let i = 0; i < pos.length; i += 3)
        uv.push(pos[i] + pos[i + 2], pos[i + 1]);
      geom.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geom.computeVertexNormals();
      return geom;
    };
    return { face, tri2, geo };
  };
  const put = (parent, geo, m) => {
    const me = new THREE.Mesh(geo, m);
    parent.add(me);
    return me;
  };

  // a w x h x d block with every edge chamfered by c, centred on the origin
  const cbox = (w, h, d, c) => {
    const S = soup(),
      W = w / 2,
      H = h / 2,
      D = d / 2,
      O = V(0, 0, 0);
    const vx = (sx, sy, sz) => V(sx * W, sy * (H - c), sz * (D - c));
    const vy = (sx, sy, sz) => V(sx * (W - c), sy * H, sz * (D - c));
    const vz = (sx, sy, sz) => V(sx * (W - c), sy * (H - c), sz * D);
    const sq = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const s of [-1, 1]) {
      S.face(
        sq.map(([a, b]) => vx(s, a, b)),
        O,
      );
      S.face(
        sq.map(([a, b]) => vy(a, s, b)),
        O,
      );
      S.face(
        sq.map(([a, b]) => vz(a, b, s)),
        O,
      );
      for (const t of [-1, 1]) {
        S.face([vx(s, t, -1), vx(s, t, 1), vy(s, t, 1), vy(s, t, -1)], O); // x-y edges, along z
        S.face([vx(s, -1, t), vx(s, 1, t), vz(s, 1, t), vz(s, -1, t)], O); // x-z edges, along y
        S.face([vy(-1, s, t), vy(1, s, t), vz(1, s, t), vz(-1, s, t)], O); // y-z edges, along x
        for (const u of [-1, 1])
          S.face([vx(s, t, u), vy(s, t, u), vz(s, t, u)], O);
      }
    }
    return S.geo();
  };
  // place a block by centre and Euler turn inside `parent`
  const block = (parent, w, h, d, c, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const me = put(parent, cbox(w, h, d, c), m);
    me.position.set(x, y, z);
    me.rotation.set(rx, ry, rz);
    return me;
  };

  // --- a crate: boards of uneven width, chamfered battens, nails, rope handles --------------------
  const T = 0.024,
    BW = 0.07,
    BT = 0.028;
  const nail = (parent, x, y, z, axis) => {
    const me = put(parent, new THREE.OctahedronGeometry(0.012), BRONZE);
    me.position.set(x, y, z).addScaledVector(axis, 0.004);
  };
  const crate = (w, h, d, { lid = true, fill = 1, broken = false } = {}) => {
    const c = new THREE.Group();
    const fh = lid ? h : h * fill;
    put(
      c,
      new THREE.BoxGeometry(w - 2 * T, fh - 0.01, d - 2 * T),
      DARK,
    ).position.set(0, fh / 2, 0);
    // boards stacked up each wall, each a touch uneven
    const widths = [];
    let left = h;
    while (left > 0.001) {
      const b = Math.min(left, 0.17 + rnd() * 0.07);
      widths.push(left - b < 0.1 ? left : b);
      left -= widths[widths.length - 1];
    }
    for (const s of [-1, 1]) {
      let y = 0;
      widths.forEach((bh, i) => {
        const cy = y + bh / 2;
        const skip = broken && s === 1 && i === 1;
        if (skip) {
          // split: the left half still nailed, a splinter, and a dark hole where the rest was
          block(
            c,
            w * 0.52,
            bh - 0.008,
            T,
            0.006,
            TIMBER,
            -w * 0.24,
            cy,
            s * (d / 2 - T / 2),
          );
          block(
            c,
            0.05,
            bh * 0.7,
            T * 0.8,
            0.004,
            TIMBER,
            0.04,
            cy - bh * 0.1,
            s * (d / 2 - T / 2),
            0,
            0.2,
            0.5,
          );
        } else {
          block(
            c,
            w + jit(0.006),
            bh - 0.008,
            T,
            0.006,
            TIMBER,
            jit(0.004),
            cy,
            s * (d / 2 - T / 2) + jit(0.002),
            0,
            0,
            jit(0.01),
          );
        }
        block(
          c,
          T,
          bh - 0.008,
          d - 2 * T,
          0.006,
          TIMBER,
          s * (w / 2 - T / 2) + jit(0.002),
          cy,
          jit(0.004),
          jit(0.01),
          0,
          0,
        );
        y += bh;
      });
      // corner battens on front and back, rails top and bottom on the ends
      for (const k of [-1, 1]) {
        const bx = k * (w / 2 - BW / 2);
        block(c, BW, h, BT, 0.01, TIMBER, bx, h / 2, s * (d / 2 + BT / 2));
        for (const yy of [0.045, h - 0.045])
          nail(c, bx, yy, s * (d / 2 + BT), V(0, 0, s));
      }
      for (const yy of [BW / 2, h - BW / 2])
        block(c, BT, BW, d + 2 * BT, 0.01, TIMBER, s * (w / 2 + BT / 2), yy, 0);
      // rope handle: through two holes near the top, knotted, hanging in a loose loop
      const xr = s * (w / 2 + 0.02),
        hy = h - 0.14;
      const loop = new THREE.CatmullRomCurve3([
        V(xr, hy, -0.1),
        V(xr + s * 0.01, hy - 0.08, -0.085),
        V(xr + s * 0.018, hy - 0.125, 0.01),
        V(xr + s * 0.01, hy - 0.085, 0.09),
        V(xr, hy, 0.1),
      ]);
      const tube = new THREE.TubeGeometry(loop, 8, 0.018, 4, false);
      put(c, tube.toNonIndexed(), ROPE).geometry.computeVertexNormals();
      for (const z of [-0.1, 0.1]) {
        const knot = put(c, new THREE.IcosahedronGeometry(0.027, 0), ROPE);
        knot.position.set(xr, hy + 0.005, z);
        knot.rotation.set(jit(0.5), jit(0.5), jit(0.5));
      }
    }
    // grain: flat dark strips just proud of the boards, which sit up to 2 mm out of true
    const grain = soup();
    for (const side of [-1, 1]) {
      let grainY = 0;
      for (const [i, bh] of widths.entries()) {
        if (!(broken && side === 1 && i === 1))
          for (let row = 0; row < 3; row++) {
            const y = grainY + bh * (0.22 + row * 0.25),
              z = side * (d / 2 + 0.0025);
            const x0 = -w * 0.36 + 0.01 * Math.sin(i * 3 + row),
              x1 = w * (0.22 + row * 0.06);
            const pts = [
              [x0, y],
              [x0 + (x1 - x0) * 0.35, y + 0.003],
              [x1, y - 0.002],
            ];
            for (let k = 0; k < 2; k++) {
              const [ax, ay] = pts[k],
                [bx, by] = pts[k + 1];
              grain.tri2(
                V(ax, ay - 0.0012, z),
                V(bx, by - 0.0012, z),
                V(bx, by + 0.0012, z),
              );
              grain.tri2(
                V(ax, ay - 0.0012, z),
                V(bx, by + 0.0012, z),
                V(ax, ay + 0.0012, z),
              );
            }
          }
        grainY += bh;
      }
      for (const sign of [-1, 1])
        for (const y of [0.055, h - 0.055]) {
          const x = sign * (w / 2 - 0.045),
            z = side * (d / 2 + BT + 0.003);
          details.add(
            new THREE.BoxGeometry(0.065, 0.055, 0.003).translate(x, y, z),
            BRONZE,
            c,
          );
          put(
            c,
            new THREE.OctahedronGeometry(0.006)
              .scale(1, 1, 0.45)
              .translate(x, y, z + side * 0.003),
            DARK,
          );
        }
    }
    put(c, grain.geo(), DARK);
    if (lid) {
      const n = 4,
        pw = (d - 0.01 * (n - 1)) / n;
      for (let i = 0; i < n; i++)
        block(
          c,
          w + jit(0.01),
          T,
          pw,
          0.006,
          TIMBER,
          jit(0.006),
          h + T / 2,
          -d / 2 + pw / 2 + i * (pw + 0.01),
          0,
          jit(0.02),
          0,
        );
      for (const k of [-1, 1]) {
        block(
          c,
          BW,
          BT,
          d,
          0.01,
          TIMBER,
          k * (w / 2 - 0.12),
          h + T + BT / 2,
          0,
        );
        for (const zz of [-d / 2 + 0.05, d / 2 - 0.05])
          nail(c, k * (w / 2 - 0.12), h + T + BT, zz, Y);
      }
    }
    return c;
  };

  // --- the stack: the top crate has slid askew -------------------------------------------------
  const b1 = crate(0.8, 0.62, 0.58, { broken: true });
  b1.position.set(-0.46, 0, -0.3);
  g.add(b1);
  const b2 = crate(0.72, 0.56, 0.52);
  b2.position.set(-0.42, 0.62 + T + BT, -0.33);
  b2.rotation.y = 0.2;
  g.add(b2);

  // --- straw: blades radiating from a clump ------------------------------------------------------
  const tufts = (parent, spots, up = 1) => {
    const S = soup();
    for (const [x, y, z, n, len, spread] of spots) {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2,
          tilt = spread * (0.3 + rnd() * 0.7);
        const dir = V(
          Math.cos(a) * Math.sin(tilt),
          up * Math.cos(tilt),
          Math.sin(a) * Math.sin(tilt),
        ).normalize();
        const side = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.008);
        const base = V(x + jit(0.02), y, z + jit(0.02));
        const tip = base
          .clone()
          .addScaledVector(dir, len * (0.6 + rnd() * 0.5));
        S.tri2(base.clone().sub(side), base.clone().add(side), tip);
      }
    }
    return put(parent, S.geo(), STRAW);
  };

  // --- the open crate: straw mound, the rolled map, the lid leaning on the front -----------------
  const b3 = crate(0.74, 0.5, 0.56, { lid: false, fill: 0.8 });
  b3.position.set(0.45, 0, -0.26);
  b3.rotation.y = -0.08;
  g.add(b3);
  {
    // a lumpy faceted mound filling the crate to just over the rim
    const S = soup(),
      NX = 6,
      NZ = 5,
      w = 0.74 - 2 * T - 0.004,
      d = 0.56 - 2 * T - 0.004;
    const hgt = [];
    for (let i = 0; i <= NX; i++) {
      hgt.push([]);
      for (let j = 0; j <= NZ; j++) {
        const u = i / NX - 0.5,
          v = j / NZ - 0.5,
          edge = Math.max(Math.abs(u), Math.abs(v)) * 2;
        hgt[i].push(0.4 + 0.1 * (1 - edge ** 2) + jit(0.018));
      }
    }
    const P = (i, j) =>
      V(-w / 2 + (w * i) / NX, hgt[i][j], -d / 2 + (d * j) / NZ);
    for (let i = 0; i < NX; i++)
      for (let j = 0; j < NZ; j++) {
        S.face([P(i, j), P(i + 1, j), P(i + 1, j + 1)], V(0, -1, 0));
        S.face([P(i, j), P(i + 1, j + 1), P(i, j + 1)], V(0, -1, 0));
      }
    put(b3, S.geo(), STRAW);
    const spots = [];
    for (let i = 0; i < 16; i++)
      spots.push([jit(0.29), 0.45, jit(0.2), 7, 0.13, 0.9]);
    for (const [x, z] of [
      [-0.33, 0.24],
      [0.33, 0.24],
      [0.33, -0.24],
      [-0.33, -0.22],
      [0, 0.26],
      [0.1, -0.26],
    ])
      spots.push([x, 0.44, z, 6, 0.11, 1.3]);
    tufts(b3, spots);
  }
  {
    // map: an eight-sided roll with a spiral of darker turns at the top end, tied twice
    const a = V(-0.07, 0.3, -0.04),
      b = V(0.13, 0.87, 0.06),
      dir = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Y, dir);
    const roll = put(
      b3,
      new THREE.CylinderGeometry(
        0.043,
        0.043,
        a.distanceTo(b),
        8,
      ).toNonIndexed(),
      PAPER,
    );
    roll.geometry.computeVertexNormals();
    roll.position.copy(a).add(b).multiplyScalar(0.5);
    roll.quaternion.copy(q);
    for (const f of [0.6, 0.84]) {
      const tie = put(
        b3,
        new THREE.CylinderGeometry(0.047, 0.047, 0.022, 8).toNonIndexed(),
        LEATHER,
      );
      tie.geometry.computeVertexNormals();
      tie.position.copy(a).lerp(b, f);
      tie.quaternion.copy(q);
    }
    const S = soup(),
      u = V(1, 0, 0).cross(dir).normalize(),
      w2 = dir.clone().cross(u).normalize();
    for (let k = 0; k < 20; k++) {
      const t0 = (k / 20) * Math.PI * 4.2,
        t1 = ((k + 1) / 20) * Math.PI * 4.2;
      const r0 = 0.006 + 0.0028 * t0,
        r1 = 0.006 + 0.0028 * t1;
      const p = (t, r) =>
        b
          .clone()
          .addScaledVector(dir, 0.002)
          .addScaledVector(u, Math.cos(t) * r)
          .addScaledVector(w2, Math.sin(t) * r);
      S.tri2(p(t0, r0 - 0.003), p(t1, r1 - 0.003), p(t1, r1 + 0.003));
      S.tri2(p(t0, r0 - 0.003), p(t1, r1 + 0.003), p(t0, r0 + 0.003));
    }
    put(b3, S.geo(), LEATHER).material = mat(0x4b2e1e, "fabric", {
      roughness: 0.71,
      side: THREE.DoubleSide,
    });
  }
  {
    // the lid: four boards on two battens, leaning on the crate's front, a little turned
    const lid = new THREE.Group();
    for (let i = 0; i < 4; i++)
      block(
        lid,
        0.74 + jit(0.01),
        0.132,
        T,
        0.006,
        TIMBER,
        jit(0.005),
        0.068 + i * 0.141,
        0,
      );
    for (const k of [-1, 1]) {
      block(lid, BW, 0.56, BT, 0.01, TIMBER, k * 0.25, 0.28, T / 2 + BT / 2);
      for (const yy of [0.06, 0.5])
        nail(lid, k * 0.25, yy, T / 2 + BT, V(0, 0, 1));
    }
    lid.position.set(0.03, 0.012, 0.52);
    lid.rotation.set(-0.4, 0.14, 0, "YXZ");
    b3.add(lid);
    // straw spilled on the ground beside the lid
    tufts(b3, [
      [-0.34, 0.006, 0.44, 7, 0.14, 1.45],
      [-0.2, 0.006, 0.62, 6, 0.12, 1.5],
      [0.4, 0.006, 0.5, 5, 0.12, 1.5],
    ]);
  }

  // --- the barrel: separate bulging staves, three hoops, the top one slipped ---------------------
  const barrel = new THREE.Group();
  barrel.position.set(-0.52, 0, 0.36);
  g.add(barrel);
  {
    const BH = 0.56,
      BR = 0.168,
      BB = 0.046,
      N = 13,
      TH = 0.02;
    const rAt = (y) => BR + BB * (1 - ((2 * y) / BH - 1) ** 2);
    // a dark core seen only through the stave joints, stopping short of the head
    const core = put(
      barrel,
      new THREE.CylinderGeometry(
        BR - TH - 0.004,
        BR - TH - 0.004,
        BH - 0.08,
        N,
      ).toNonIndexed(),
      DARK,
    );
    core.position.y = BH / 2 - 0.02;
    for (let i = 0; i < N; i++) {
      const a0 = ((i + 0.04) / N) * Math.PI * 2,
        a1 = ((i + 0.96) / N) * Math.PI * 2,
        S = soup();
      const ring = (y, r) =>
        [a0, a1].flatMap((a) => [
          V(Math.sin(a) * r, y, Math.cos(a) * r),
          V(Math.sin(a) * (r - TH), y, Math.cos(a) * (r - TH)),
        ]);
      const R = [];
      for (let k = 0; k <= 6; k++) {
        const y = (k / 6) * BH;
        R.push(ring(y, rAt(y) + (k === 6 ? 0.004 : 0)));
      }
      const mid = V(
        Math.sin((a0 + a1) / 2) * (BR + BB - TH / 2),
        BH / 2,
        Math.cos((a0 + a1) / 2) * (BR + BB - TH / 2),
      );
      for (let k = 0; k < 6; k++) {
        const [o0, i0, o1, i1] = R[k],
          [O0, I0, O1, I1] = R[k + 1];
        const cy = V(0, (k + 0.5) * (BH / 6), 0);
        S.face([o0, o1, O1, O0], cy); // outer
        S.face(
          [i0, i1, I1, I0],
          cy.clone().add(mid.clone().setY(0).multiplyScalar(2)),
        ); // inner
        S.face(
          [o0, i0, I0, O0],
          mid
            .clone()
            .setY((k + 0.5) * (BH / 6))
            .add(
              V(
                Math.cos((a0 + a1) / 2),
                0,
                -Math.sin((a0 + a1) / 2),
              ).multiplyScalar(0.05),
            ),
        );
        S.face(
          [o1, i1, I1, O1],
          mid
            .clone()
            .setY((k + 0.5) * (BH / 6))
            .add(
              V(
                -Math.cos((a0 + a1) / 2),
                0,
                Math.sin((a0 + a1) / 2),
              ).multiplyScalar(0.05),
            ),
        );
      }
      const [o0, i0, o1, i1] = R[0],
        [O0, I0, O1, I1] = R[6];
      S.face([o0, o1, i1, i0], V(mid.x, 0.3, mid.z));
      S.face([O0, O1, I1, I0], V(mid.x, BH - 0.3, mid.z));
      put(barrel, S.geo(), TIMBER);
    }
    // the head sits a little down inside the chime
    const head = put(
      barrel,
      new THREE.CylinderGeometry(
        BR - TH + 0.002,
        BR - TH + 0.002,
        0.02,
        N,
      ).toNonIndexed(),
      TIMBER,
    );
    head.geometry.computeVertexNormals();
    head.position.y = BH - 0.035;
    const hoop = (y, tilt) => {
      const r = rAt(y) + 0.006,
        S = soup(),
        n = 16;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2,
          a1 = ((k + 1) / n) * Math.PI * 2;
        const p = (a, dy, dr) =>
          V(
            Math.sin(a) * (r + dr),
            y + dy + Math.sin(a) * tilt,
            Math.cos(a) * (r + dr),
          );
        S.face(
          [p(a0, -0.02, 0), p(a1, -0.02, 0), p(a1, 0.02, 0), p(a0, 0.02, 0)],
          V(0, y, 0),
        );
        S.face(
          [
            p(a0, 0.02, 0),
            p(a1, 0.02, 0),
            p(a1, 0.02, -0.012),
            p(a0, 0.02, -0.012),
          ],
          V(0, y - 1, 0),
        );
        S.face(
          [
            p(a0, -0.02, 0),
            p(a1, -0.02, 0),
            p(a1, -0.02, -0.012),
            p(a0, -0.02, -0.012),
          ],
          V(0, y + 1, 0),
        );
      }
      put(barrel, S.geo(), BRONZE);
    };
    hoop(0.06, 0);
    hoop(0.19, 0);
    hoop(BH - 0.2, 0.025); // slipped from the chime and hanging crooked
  }

  // --- placement: base on y = 0, centred on x and z ----------------------------------------------
  const bb = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((nd) => {
    const p = nd.isMesh && nd.geometry.attributes.position;
    if (!p) return;
    const add = (mm) => {
      for (let i = 0; i < p.count; i++)
        bb.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mm));
    };
    if (nd.isInstancedMesh) {
      for (let c = 0; c < nd.count; c++) {
        nd.getMatrixAt(c, im);
        add(m4.multiplyMatrices(nd.matrixWorld, im));
      }
      return;
    }
    add(nd.matrixWorld);
  });
  const ctr = bb.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= ctr.x;
    o.position.y -= bb.min.y;
    o.position.z -= ctr.z;
  });
  return details.batch();
}
