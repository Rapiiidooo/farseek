// push_block, candidate C: a second reading, hand-built. Each face is a carved
// panel: a sunken square with 45 degree sides in burnt sienna, the disc and
// crescent cut a further 4 cm to basalt, and two V-cut grooves that stop at the
// chamfers. A chamfered-square loft supplies the sienna base course, the 10 cm
// corner chamfers and a worn, rounded top edge round a slightly dished top.
export default function (THREE) {
  const g = new THREE.Group();

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
  const SAND = mat(0xb57f4f, "stone");
  const SAND_LIT = mat(0xd4a373, "stone", { roughness: 0.86 });
  const SIENNA = mat(0x8a5433, "stone", { roughness: 0.95 });
  const BASALT = mat(0x3a3531, "stone", { roughness: 0.9 });

  const A = 0.95,
    C = 0.1,
    T = 1.9,
    DISH = 0.03;

  // --- triangles from explicit points ------------------------------------------
  // Each quad or triangle is wound to face `out`, so no winding is left to chance.
  const mesh = (m, parent = g) => {
    const pos = [];
    const face = (pts, out) => {
      const [a, b, c] = pts;
      const n = new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a));
      const ordered =
        n.dot(out) < 0 ? [pts[0], ...pts.slice(1).reverse()] : pts;
      for (let i = 1; i < ordered.length - 1; i++)
        for (const p of [ordered[0], ordered[i], ordered[i + 1]])
          pos.push(p.x, p.y, p.z);
    };
    const done = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const me = new THREE.Mesh(geo, m);
      parent.add(me);
      return me;
    };
    return { face, done };
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // --- loft with a chamfered-square section --------------------------------------
  // Rows [t, y]: the outline inset by t, faces parallel. `chamfersOnly` keeps just
  // the four corner facets, for the height where the carved panels form the faces.
  const ring = (t) => {
    const a = A - t,
      k = Math.max(0, C - (2 - Math.SQRT2) * t);
    return [
      [a - k, a],
      [a, a - k],
      [a, -(a - k)],
      [a - k, -a],
      [-(a - k), -a],
      [-a, -(a - k)],
      [-a, a - k],
      [-(a - k), a],
    ];
  };
  const loft = (rows, m, chamfersOnly = false) => {
    const L = mesh(m);
    for (let r = 0; r < rows.length - 1; r++) {
      const R0 = ring(rows[r][0]),
        R1 = ring(rows[r + 1][0]),
        y0 = rows[r][1],
        y1 = rows[r + 1][1];
      for (let e = 0; e < 8; e++) {
        if (chamfersOnly && e % 2 === 1) continue; // odd edges are the main faces
        const f = (e + 1) % 8;
        const p0 = V(R0[e][0], y0, R0[e][1]),
          q0 = V(R0[f][0], y0, R0[f][1]);
        const p1 = V(R1[e][0], y1, R1[e][1]),
          q1 = V(R1[f][0], y1, R1[f][1]);
        // Outward, as LatheGeometry has it: (rise, inward) in (radial, up). A side
        // faces out, a top up, an underside down, a chamfer in between.
        const mid = p0.clone().add(q0).add(p1).add(q1).multiplyScalar(0.25);
        const rise = y1 - y0,
          inward = rows[r + 1][0] - rows[r][0];
        const out = new THREE.Vector3(mid.x, 0, mid.z)
          .normalize()
          .multiplyScalar(rise)
          .add(V(0, inward, 0));
        const pts = [p0, q0, q1, p1].filter(
          (p, i, arr) => i === 0 || p.distanceToSquared(arr[i - 1]) > 1e-12,
        );
        if (pts.length >= 3) L.face(pts, out);
      }
    }
    return L.done();
  };

  loft(
    [
      [A, 0],
      [C, 0],
      [0, C],
      [0, 0.25],
    ],
    SIENNA,
  ); // underside, base chamfer, band
  loft(
    [
      [0, 0.25],
      [0, T - C],
    ],
    SAND,
    true,
  ); // corner chamfers only
  const r2 = 1 - Math.SQRT1_2;
  const top = [
    [0, T - C],
    [r2 * C, T - r2 * C],
    [C, T],
  ]; // worn, rounded top edge
  for (let k = 1; k <= 6; k++) {
    const t = C + (A - C) * (k / 6);
    top.push([t, T - DISH * (1 - ((A - t) / (A - C)) ** 2)]); // very slightly dished
  }
  loft(top, SAND_LIT);

  // --- the carved face panel, built on +Z and turned to each face ------------------
  const U = A - C,
    Y0 = 0.25,
    Y1 = T - C; // flat face between the chamfers
  const RW = 0.54,
    RB = 0.36,
    RT = 1.44,
    RD = 0.06; // sunken square: half width, bottom, top, depth
  const GU = U - 0.06,
    GH = 0.06,
    GD = 0.03; // V grooves: half length, height, depth
  const GY = [1.55, 1.67];
  const MD = 0.04,
    CY = 0.9; // motif cut depth, recess centre height
  // The disc rests low in the crescent's bowl, so the motif cannot read as an eye above a smile.
  const R0 = 0.3,
    R1 = 0.25,
    DY = 0.1,
    RDISC = 0.18,
    DISC = 0.06,
    YC = CY + 0.025;
  const hy = (R0 * R0 - R1 * R1 + DY * DY) / (2 * DY),
    hx = Math.sqrt(R0 * R0 - hy * hy);
  const aH = Math.atan2(hy, hx),
    bH = Math.atan2(hy - DY, hx);
  const crescent = (p) => {
    p.moveTo(hx, YC + hy);
    p.absarc(0, YC, R0, aH, Math.PI - aH, true);
    p.absarc(0, YC + DY, R1, Math.PI - bH, bH, false);
    return p;
  };
  const disc = (p) => {
    p.absarc(0, YC + DISC, RDISC, 0, Math.PI * 2, false);
    return p;
  };
  const rect = (p, u0, u1, y0, y1) => {
    p.moveTo(u0, y0);
    p.lineTo(u1, y0);
    p.lineTo(u1, y1);
    p.lineTo(u0, y1);
    p.lineTo(u0, y0);
    return p;
  };
  const shapeAt = (shape, z, m, parent) => {
    const geo = new THREE.ShapeGeometry(shape, 14);
    geo.translate(0, 0, z);
    parent.add(new THREE.Mesh(geo, m));
  };

  const panel = new THREE.Group();
  // face surface with three openings
  const surf = rect(new THREE.Shape(), -U, U, Y0, Y1);
  surf.holes.push(rect(new THREE.Path(), -RW, RW, RB, RT));
  for (const y of GY)
    surf.holes.push(rect(new THREE.Path(), -GU, GU, y, y + GH));
  shapeAt(surf, A, SAND, panel);

  // sunken square: four 45 degree sides and a floor with the motif cut through
  const S = mesh(SIENNA, panel);
  const zf = A - RD,
    fu = RW - RD,
    fb = RB + RD,
    ft = RT - RD;
  S.face(
    [V(-RW, RB, A), V(RW, RB, A), V(fu, fb, zf), V(-fu, fb, zf)],
    V(0, 1, 1),
  ); // sill
  S.face(
    [V(-RW, RT, A), V(RW, RT, A), V(fu, ft, zf), V(-fu, ft, zf)],
    V(0, -1, 1),
  ); // lintel
  S.face(
    [V(-RW, RB, A), V(-RW, RT, A), V(-fu, ft, zf), V(-fu, fb, zf)],
    V(1, 0, 1),
  ); // left side
  S.face(
    [V(RW, RB, A), V(RW, RT, A), V(fu, ft, zf), V(fu, fb, zf)],
    V(-1, 0, 1),
  ); // right side
  // V grooves: two sloped walls and sloped ends, 3 cm deep
  for (const y of GY) {
    const ym = y + GH / 2,
      ze = A - GD,
      ue = GU - GD;
    S.face(
      [V(-GU, y, A), V(GU, y, A), V(ue, ym, ze), V(-ue, ym, ze)],
      V(0, 1, 1),
    );
    S.face(
      [V(-GU, y + GH, A), V(GU, y + GH, A), V(ue, ym, ze), V(-ue, ym, ze)],
      V(0, -1, 1),
    );
    S.face([V(-GU, y, A), V(-GU, y + GH, A), V(-ue, ym, ze)], V(1, 0, 1));
    S.face([V(GU, y, A), V(GU, y + GH, A), V(ue, ym, ze)], V(-1, 0, 1));
  }
  // walls of the motif cut, facing into the cut
  for (const path of [crescent(new THREE.Path()), disc(new THREE.Path())]) {
    let pts = path.getPoints(14);
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i],
        b = pts[i + 1];
      if (a.distanceToSquared(b) < 1e-12) continue;
      const inward = V(-(b.y - a.y), b.x - a.x, 0); // left of travel on a counter-clockwise loop
      S.face(
        [
          V(a.x, a.y, zf),
          V(b.x, b.y, zf),
          V(b.x, b.y, zf - MD),
          V(a.x, a.y, zf - MD),
        ],
        inward,
      );
    }
  }
  S.done();
  const fl = rect(new THREE.Shape(), -fu, fu, fb, ft);
  fl.holes.push(crescent(new THREE.Path()), disc(new THREE.Path()));
  shapeAt(fl, zf, SIENNA, panel);
  shapeAt(crescent(new THREE.Shape()), zf - MD, BASALT, panel);
  shapeAt(disc(new THREE.Shape()), zf - MD, BASALT, panel);

  for (let f = 0; f < 4; f++) {
    const p = f === 0 ? panel : panel.clone();
    p.rotation.y = (f * Math.PI) / 2;
    g.add(p);
  }

  // --- placement: base on y = 0, centred on x and z ----------------------------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mat4) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        put(m4.multiplyMatrices(n.matrixWorld, im));
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
  return g;
}
