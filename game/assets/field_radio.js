import { detailBatch } from "../prop-detail.js";

// field_radio, candidate C: a second reading, the set built into a travelling case. A low
// timber case whose lid, hinged along the back, stands open behind it on two bronze stays,
// so the leather carrying handle on the lid's free edge is now on top. The controls face up
// from a dark deck recessed into the case: a round speaker grille of bronze slats, two
// parchment dials with vermilion needles and a row of three fluted knobs. Inside the lid, a
// pasted frequency chart and a leather pocket; outside it, two unbuckled leather straps, a
// blank card in a label holder and a parchment tag tied to the handle.
// The boards, lid rims, corner caps, buckles and handle loops are hand-built chamfered
// blocks, a little out of true; thin plates and straps are plain slabs; round parts are
// faceted lathes. The telescopic antenna rises from a bracket on the left side, and a
// coiled cord runs over the right wall to a headset standing on its cups.
// Front faces +Z. The case is 0.52 m wide; the whole piece 1.04 x 0.86 x 0.54 m.
export default function (THREE) {
  const g = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

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
  const TIMBER = mat(0x8a6a48, "timber", { roughness: 0.88 });
  const PANEL = mat(0x4b2e1e, "timber", { roughness: 0.95 });
  const BRONZE = mat(0x9a6a35, "metal", { roughness: 0.45, metalness: 0.6 });
  const LEATHER = mat(0x4b2e1e, "fabric", { roughness: 0.72 });
  const PARCH = mat(0xe6d3ae, "fabric", { roughness: 0.85 });
  const RED = mat(0xc2412d, "metal", { roughness: 0.5, metalness: 0.15 });
  const ROPE = mat(0xb49a6a, "fabric", { roughness: 0.92 });

  let seed = 41;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() - 0.5) * 2 * a;

  // --- faceted triangle soup: every face wound to face away from `inside` ----------------------
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
    return { face, geo };
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
        S.face([vx(s, t, -1), vx(s, t, 1), vy(s, t, 1), vy(s, t, -1)], O);
        S.face([vx(s, -1, t), vx(s, 1, t), vz(s, 1, t), vz(s, -1, t)], O);
        S.face([vy(-1, s, t), vy(1, s, t), vz(1, s, t), vz(-1, s, t)], O);
        for (const u of [-1, 1])
          S.face([vx(s, t, u), vy(s, t, u), vz(s, t, u)], O);
      }
    }
    return S.geo();
  };
  const block = (parent, w, h, d, c, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const me = put(parent, cbox(w, h, d, c), m);
    me.position.set(x, y, z);
    me.rotation.set(rx, ry, rz);
    return me;
  };
  const plate = (parent, w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const me = put(parent, new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    me.rotation.set(rx, ry, rz);
    return me;
  };
  // a faceted turned part about +Y: profile [[r, y], ...] from the bottom up the outside
  const lathe = (parent, prof, seg, m, x, y, z) => {
    const geo = new THREE.LatheGeometry(
      prof.map(([r, h]) => new THREE.Vector2(r, h)),
      seg,
    ).toNonIndexed();
    geo.computeVertexNormals();
    const me = put(parent, geo, m);
    me.position.set(x, y, z);
    return me;
  };
  const UP = V(0, 1, 0);
  const rod = (parent, a, b, r, m, seg = 5, rb = r) => {
    const me = put(
      parent,
      new THREE.CylinderGeometry(rb, r, a.distanceTo(b), seg),
      m,
    );
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return me;
  };
  // a flat strap of width w and thickness t along a polyline, `side` giving its width direction
  const strap = (parent, pts, side, w, t, m) => {
    const S = soup();
    const at = (i) => {
      const p = pts[i],
        tan = pts[Math.min(i + 1, pts.length - 1)]
          .clone()
          .sub(pts[Math.max(i - 1, 0)])
          .normalize();
      const n = tan.clone().cross(side).normalize(),
        s = side.clone().normalize();
      return [
        p
          .clone()
          .addScaledVector(s, -w / 2)
          .addScaledVector(n, -t / 2),
        p
          .clone()
          .addScaledVector(s, w / 2)
          .addScaledVector(n, -t / 2),
        p
          .clone()
          .addScaledVector(s, w / 2)
          .addScaledVector(n, t / 2),
        p
          .clone()
          .addScaledVector(s, -w / 2)
          .addScaledVector(n, t / 2),
      ];
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const A = at(i),
        B = at(i + 1),
        mid = pts[i]
          .clone()
          .add(pts[i + 1])
          .multiplyScalar(0.5);
      for (let k = 0; k < 4; k++)
        S.face([A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]], mid);
    }
    return put(parent, S.geo(), m);
  };

  // --- the case: four boards round a dark deck, standing on its bronze corner caps --------------
  const BW = 0.52,
    BD = 0.36,
    BH = 0.17,
    TH = 0.02,
    yF = 0.004,
    yR = yF + BH,
    DK = yR - 0.012;
  for (const s of [-1, 1]) {
    block(
      g,
      BW,
      BH,
      TH,
      0.004,
      TIMBER,
      jit(0.002),
      yF + BH / 2,
      s * (BD / 2 - TH / 2),
      0,
      0,
      jit(0.004),
    );
    block(
      g,
      TH,
      BH,
      BD - 2 * TH,
      0.004,
      TIMBER,
      s * (BW / 2 - TH / 2),
      yF + BH / 2,
      jit(0.002),
      jit(0.004),
      0,
      0,
    );
  }
  block(g, BW - 2 * TH, 0.012, BD - 2 * TH, 0.002, PANEL, 0, DK - 0.006, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      // rounded bronze corner caps on the four bottom corners, which are also its feet
      block(
        g,
        0.05,
        0.05,
        0.05,
        0.013,
        BRONZE,
        sx * (BW / 2 - 0.021),
        yF + 0.021,
        sz * (BD / 2 - 0.021),
      );
    }
  // two clasps under the front rim, their hasps hanging open
  for (const x of [-0.15, 0.15]) {
    plate(g, 0.044, 0.03, 0.006, BRONZE, x, yR - 0.022, BD / 2 + 0.003);
    plate(
      g,
      0.026,
      0.046,
      0.004,
      BRONZE,
      x + jit(0.003),
      yR - 0.05,
      BD / 2 + 0.009,
      -0.18,
      0,
      jit(0.08),
    );
  }
  // a strip of expedition tape across the front, inked in two lines, and three stamps
  // scratched into the board beside it
  const tapeY = (x) => 0.07 - 0.05 * (x + 0.125);
  plate(
    g,
    0.17,
    0.034,
    0.0016,
    PARCH,
    -0.125,
    0.07,
    BD / 2 + 0.0009,
    0,
    0,
    -0.05,
  );
  for (const [x, dy, w, r] of [
    [-0.19, 0.007, 0.024, 0.15],
    [-0.161, 0.006, 0.016, -0.3],
    [-0.134, 0.008, 0.028, 0.1],
    [-0.099, 0.006, 0.02, 0.35],
    [-0.072, 0.007, 0.018, -0.2],
    [-0.182, -0.007, 0.03, 0.05],
    [-0.144, -0.006, 0.02, -0.25],
    [-0.112, -0.007, 0.034, 0.12],
  ]) {
    plate(
      g,
      w,
      0.0024,
      0.0008,
      LEATHER,
      x,
      tapeY(x) + dy,
      BD / 2 + 0.0019,
      0,
      0,
      r - 0.05,
    );
  }
  for (const [x, y] of [
    [0.058, 0.072],
    [0.094, 0.066],
    [0.128, 0.073],
  ]) {
    put(g, new THREE.RingGeometry(0.0085, 0.012, 12), ROPE).position.set(
      x,
      y,
      BD / 2 + 0.0006,
    );
  }
  // the straps' lower ends on the back wall, and the two hinge barrels
  for (const x of [-0.14, 0.14]) {
    plate(
      g,
      0.032,
      BH - 0.03,
      0.004,
      LEATHER,
      x,
      yF + BH / 2 - 0.005,
      -BD / 2 - 0.002,
    );
    plate(g, 0.036, 0.022, 0.006, BRONZE, x, yF + 0.05, -BD / 2 - 0.004);
    const hinge = put(
      g,
      new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6),
      BRONZE,
    );
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(x, yR, -BD / 2 - 0.004);
  }

  // --- the deck: grille, two dials, three knobs, the jack -------------------------------------------
  const GX = 0.12,
    GZ = -0.015,
    GR = 0.086;
  lathe(
    g,
    [
      [GR + 0.01, 0],
      [GR + 0.01, 0.005],
      [GR + 0.004, 0.01],
      [GR - 0.006, 0.007],
    ],
    14,
    BRONZE,
    GX,
    DK,
    GZ,
  );
  for (let i = -3; i <= 3; i++) {
    const z = i * 0.0225,
      half = Math.sqrt((GR - 0.004) ** 2 - z * z);
    plate(g, 2 * half, 0.005, 0.013, BRONZE, GX, DK + 0.0025, GZ + z);
  }
  for (const [x, z, ang] of [
    [-0.175, -0.08, 0.6],
    [-0.06, -0.08, -0.5],
  ]) {
    lathe(
      g,
      [
        [0.052, 0],
        [0.052, 0.005],
        [0.047, 0.01],
        [0.042, 0.008],
      ],
      12,
      BRONZE,
      x,
      DK,
      z,
    );
    lathe(
      g,
      [
        [0.044, 0.005],
        [0, 0.005],
      ],
      14,
      PARCH,
      x,
      DK,
      z,
    );
    const needle = new THREE.Group();
    needle.position.set(x, DK + 0.0068, z);
    needle.rotation.y = ang;
    g.add(needle);
    plate(needle, 0.004, 0.003, 0.036, RED, 0, 0, -0.012);
    for (const t of [-0.9, 0, 0.9]) {
      plate(
        g,
        0.003,
        0.002,
        0.008,
        LEATHER,
        x + 0.034 * Math.sin(t),
        DK + 0.0058,
        z - 0.034 * Math.cos(t),
        0,
        -t,
        0,
      );
    }
  }
  for (const x of [-0.19, -0.125, -0.06]) {
    lathe(
      g,
      [
        [0.024, 0],
        [0.024, 0.005],
        [0.017, 0.007],
        [0.015, 0.026],
        [0, 0.029],
      ],
      7,
      BRONZE,
      x,
      DK,
      0.07,
    );
    plate(g, 0.004, 0.003, 0.012, PARCH, x, DK + 0.0285, 0.064);
  }
  const JX = 0.2,
    JZ = 0.125;
  lathe(
    g,
    [
      [0.014, 0],
      [0.014, 0.004],
      [0.009, 0.005],
      [0.0085, 0.024],
      [0, 0.026],
    ],
    8,
    BRONZE,
    JX,
    DK,
    JZ,
  );

  // --- the lid: a shallow tray hinged at the back, open a little past upright -----------------------
  const LH = 0.055;
  const lid = new THREE.Group();
  lid.position.set(0, yR, -BD / 2);
  lid.rotation.set(THREE.MathUtils.degToRad(-100), 0, 0.012);
  g.add(lid);
  block(lid, BW, TH, BD, 0.004, TIMBER, 0, LH - TH / 2, BD / 2);
  for (const s of [-1, 1]) {
    block(
      lid,
      BW,
      LH - TH,
      TH,
      0.004,
      TIMBER,
      0,
      (LH - TH) / 2,
      s > 0 ? BD - TH / 2 : TH / 2,
    );
    block(
      lid,
      TH,
      LH - TH,
      BD - 2 * TH,
      0.004,
      TIMBER,
      s * (BW / 2 - TH / 2),
      (LH - TH) / 2,
      BD / 2,
    );
    for (const e of [0, 1])
      block(
        lid,
        0.05,
        0.05,
        0.05,
        0.013,
        BRONZE,
        s * (BW / 2 - 0.021),
        LH - 0.021,
        e ? BD - 0.021 : 0.021,
      );
  }
  // inside (local -y, facing forward once open): a frequency chart and a leather pocket
  const IN = LH - TH;
  plate(
    lid,
    0.27,
    0.003,
    0.22,
    PARCH,
    -0.07,
    IN - 0.0015,
    BD / 2 + 0.01,
    0,
    0.02,
    0,
  );
  for (const [x, z, w, d] of [
    [-0.07, 0.1, 0.23, 0.004],
    [-0.07, 0.15, 0.23, 0.004],
    [-0.07, 0.2, 0.23, 0.004],
    [-0.07, 0.25, 0.23, 0.004],
    [-0.14, 0.19, 0.004, 0.17],
    [0.01, 0.19, 0.004, 0.17],
  ]) {
    plate(lid, w, 0.002, d, LEATHER, x, IN - 0.004, z + 0.01, 0, 0.02, 0);
  }
  plate(lid, 0.12, 0.014, 0.15, LEATHER, 0.16, IN - 0.007, BD / 2 + 0.04);
  plate(
    lid,
    0.124,
    0.006,
    0.06,
    LEATHER,
    0.16,
    IN - 0.016,
    BD / 2 + 0.11,
    0.25,
    0,
    0,
  );
  plate(lid, 0.016, 0.006, 0.012, BRONZE, 0.16, IN - 0.02, BD / 2 + 0.085);
  // outside (local +y, facing back once open): two leather straps, unbuckled, and their buckles
  for (const x of [-0.14, 0.14]) {
    plate(lid, 0.032, 0.004, BD - 0.02, LEATHER, x, LH + 0.002, BD / 2 + 0.005);
    block(lid, 0.044, 0.008, 0.034, 0.002, BRONZE, x, LH + 0.005, BD - 0.07);
    plate(
      lid,
      0.032,
      0.004,
      0.09,
      LEATHER,
      x + 0.008,
      LH + 0.012,
      BD - 0.04,
      0.15,
      0,
      0,
    ); // the loose tongue
  }
  // a bronze label holder with a blank card between the straps
  plate(lid, 0.086, 0.006, 0.058, BRONZE, 0, LH + 0.003, BD / 2 + 0.07);
  plate(lid, 0.07, 0.004, 0.042, PARCH, 0, LH + 0.005, BD / 2 + 0.07);
  // the carrying handle on the free edge, raised: a leather strap between two bronze loops
  const hy = LH / 2;
  const arc = [];
  for (let i = 0; i <= 8; i++) {
    const a = (Math.PI * i) / 8;
    arc.push(V(-0.075 * Math.cos(a), hy, BD + 0.008 + 0.05 * Math.sin(a)));
  }
  strap(lid, arc, V(0, 1, 0), 0.028, 0.008, LEATHER);
  for (const x of [-0.075, 0.075])
    block(lid, 0.024, 0.034, 0.016, 0.003, BRONZE, x, hy, BD + 0.006);
  // a parchment tag tied to the right loop, hanging down the back of the lid
  rod(
    lid,
    V(0.075, LH - 0.01, BD + 0.004),
    V(0.082, LH + 0.012, BD - 0.03),
    0.0018,
    ROPE,
    3,
  );
  plate(
    lid,
    0.045,
    0.003,
    0.07,
    PARCH,
    0.09,
    LH + 0.014,
    BD - 0.068,
    0.12,
    0,
    0.18,
  );
  // two stays from the case sides to the lid's sides
  lid.updateMatrix();
  for (const s of [-1, 1]) {
    const a = V(s * (BW / 2 + 0.005), yR - 0.035, -0.1);
    const b = V(s * (BW / 2 + 0.005), LH / 2, 0.19).applyMatrix4(lid.matrix);
    rod(g, a, b, 0.004, BRONZE, 4);
    const stud = put(
      g,
      new THREE.CylinderGeometry(0.009, 0.009, 0.01, 4),
      BRONZE,
    );
    stud.rotation.z = Math.PI / 2;
    stud.position.copy(a);
  }

  // --- the antenna: a bracket on the left wall, a socket, three sections, a ball tip -----------
  plate(g, 0.02, 0.06, 0.05, BRONZE, -BW / 2 - 0.01, yR - 0.05, -0.06);
  const dir = V(-0.3, 1, -0.07).normalize();
  const A0 = V(-BW / 2 - 0.018, yR - 0.03, -0.06);
  const at = (t) => A0.clone().addScaledVector(dir, t);
  rod(g, at(0), at(0.045), 0.014, BRONZE, 6, 0.012);
  rod(g, at(0.03), at(0.3), 0.0095, BRONZE, 5);
  rod(g, at(0.285), at(0.31), 0.0125, BRONZE, 5);
  rod(g, at(0.3), at(0.53), 0.007, BRONZE, 5);
  rod(g, at(0.515), at(0.54), 0.0095, BRONZE, 5);
  rod(g, at(0.53), at(0.73), 0.005, BRONZE, 5);
  put(g, new THREE.IcosahedronGeometry(0.011, 0), BRONZE).position.copy(
    at(0.735),
  );

  // --- the headset, standing on its cups: pads down, the band arched between them ----------------
  const hs = new THREE.Group();
  hs.position.set(0.45, 0, -0.01);
  hs.rotation.y = 0.6;
  g.add(hs);
  for (const s of [-1, 1]) {
    lathe(
      hs,
      [
        [0.031, 0],
        [0.031, 0.01],
      ],
      8,
      LEATHER,
      s * 0.075,
      0,
      0,
    );
    lathe(
      hs,
      [
        [0.034, 0.01],
        [0.034, 0.018],
        [0.027, 0.031],
        [0.011, 0.032],
        [0, 0.036],
      ],
      8,
      BRONZE,
      s * 0.075,
      0,
      0,
    );
  }
  const band = [];
  for (let i = 0; i <= 10; i++) {
    const a = (Math.PI * i) / 10;
    band.push(V(-0.075 * Math.cos(a), 0.033 + 0.078 * Math.sin(a), 0));
  }
  strap(hs, band, V(0, 0, 1), 0.016, 0.005, BRONZE);

  // --- the cord: out of the jack, over the right wall, then coiled along the ground to a cup -------
  hs.updateMatrix();
  const cupSide = V(-0.075 - 0.034, 0.016, 0).applyMatrix4(hs.matrix);
  const CR = 0.0035,
    HX = 0.012;
  const lead = [
    V(JX, DK + 0.024, JZ),
    V(JX + 0.01, DK + 0.05, JZ + 0.01),
    V(BW / 2 + 0.006, yR + 0.016, JZ + 0.012),
    V(BW / 2 + 0.03, yR - 0.05, JZ + 0.03),
    V(BW / 2 + 0.042, 0.025, JZ + 0.06),
    V(BW / 2 + 0.05, HX + CR, JZ + 0.09),
  ];
  put(
    g,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lead), 10, CR, 4, false),
    LEATHER,
  );
  // the coil: a helix wound round a centreline that curves across the ground to the cup
  const c0 = lead[lead.length - 1],
    c2 = cupSide.clone().setY(HX + CR),
    c1 = V(c2.x - 0.01, HX + CR, c0.z + 0.03);
  const centre = new THREE.QuadraticBezierCurve3(c0, c1, c2);
  const turns = 9,
    per = 5,
    helix = [];
  for (let i = 0; i <= turns * per; i++) {
    const t = i / (turns * per),
      p = centre.getPoint(t),
      tan = centre.getTangent(t);
    const side = tan.clone().cross(UP).normalize(),
      up = side.clone().cross(tan).normalize();
    const a = t * turns * Math.PI * 2,
      r = i < 2 || i > turns * per - 2 ? HX * 0.3 : HX;
    helix.push(
      p
        .addScaledVector(side, Math.cos(a) * r)
        .addScaledVector(up, Math.sin(a) * r),
    );
  }
  put(
    g,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(helix),
      turns * per,
      CR,
      3,
      false,
    ),
    LEATHER,
  );

  const details = detailBatch(THREE, g);
  for (const x of [-0.175, -0.06])
    for (let i = 0; i <= 16; i++) {
      const a = -1.35 + (i * 2.7) / 16;
      details.line(
        LEATHER,
        [
          [x + Math.sin(a) * 0.029, DK + 0.0065, -0.08 - Math.cos(a) * 0.029],
          [
            x + Math.sin(a) * (i % 4 ? 0.034 : 0.038),
            DK + 0.0065,
            -0.08 - Math.cos(a) * (i % 4 ? 0.034 : 0.038),
          ],
        ],
        0.00065,
      );
    }
  for (let i = -6; i <= 6; i++) {
    const x = i * 0.012;
    const reach = Math.sqrt(0.079 ** 2 - x ** 2);
    details.box(LEATHER, [0.004, 0.0015, reach * 2], [GX + x, DK + 0.0015, GZ]);
  }
  for (const x of [-0.226, 0.226])
    for (const z of [-0.145, 0.145])
      details.bolt(BRONZE, 0.005, [x, DK + 0.003, z]);
  for (const x of [-0.19, -0.125, -0.06])
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      details.line(
        LEATHER,
        [
          [x + Math.sin(a) * 0.0154, DK + 0.01, 0.07 + Math.cos(a) * 0.0154],
          [x + Math.sin(a) * 0.0154, DK + 0.024, 0.07 + Math.cos(a) * 0.0154],
        ],
        0.00065,
      );
    }
  details.finish();

  // --- placement: base on y = 0, centred on x and z ------------------------------------------------
  const bb = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const add = (mm) => {
      for (let i = 0; i < p.count; i++)
        bb.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mm));
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
  return g;
}
