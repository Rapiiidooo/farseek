import { detailBatch } from "../prop-detail.js";

// glyph_stela, arm B: extruded profiles.
// The shaft is its tapering front outline extruded in slices: full courses, and
// carved bands set back 3 cm. A front skin extruded from the same outline with
// the panel as a hole gives the recess a chamfered rim. Base tiers and crown steps
// are chamfered outlines extruded upward. The bezel and the domed lens are lathe
// profiles. Bevels are pulled back onto the drawn outline (bevelOffset), so they
// are chamfers and every size stays as drawn.
// 1.3 x 2.4 x 0.68 m. Lens centre 1.3 m up, level with the sun mirror's disc.
export default function (THREE) {
  const g = new THREE.Group();

  // ---- materials ------------------------------------------------------------
  const stone = (color, roughness = 0.9) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
    });
    m.name = "stone";
    return m;
  };
  const sand = stone(0xb57f4f);
  const sunlit = stone(0xd4a373, 0.86);
  const sienna = stone(0x8a5433, 0.94);
  const bronze = new THREE.MeshStandardMaterial({
    color: 0x9a6a35,
    roughness: 0.45,
    metalness: 0.7,
  });
  bronze.name = "metal";
  // Dormant crystal, its own material so the game can light it (raise
  // emissiveIntensity). Unnamed and just under opaque so the loader's procedural
  // surfaces leave it alone.
  const crystal = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    emissive: 0x39e3d0,
    emissiveIntensity: 0,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
  });

  // ---- static parts are merged per material at the end ----------------------
  const buckets = new Map();
  const add = (geo, mat) => {
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geo);
  };
  const merge = (geos) => {
    const flat = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    let n = 0;
    for (const x of flat) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2);
    let o = 0;
    for (const x of flat) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      if (x.attributes.uv) uv.set(x.attributes.uv.array, o * 2);
      o += x.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return out;
  };

  // ---- extrusion helpers ----------------------------------------------------
  const shape = (pts, holes = []) => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes)
      s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return s;
  };
  const extrude = (s, a, b, bev) => {
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: b - a - 2 * bev,
      bevelEnabled: bev > 0,
      bevelThickness: bev,
      bevelSize: bev,
      bevelOffset: -bev,
      bevelSegments: 1,
      curveSegments: 1,
    });
    geo.translate(0, 0, a + bev);
    return geo;
  };
  // outline in the front (x, y) plane, extruded along z from z0 to z1
  const zprism = (pts, z0, z1, bev, holes) =>
    extrude(shape(pts, holes), z0, z1, bev);
  // rectangle w x d with chamfered corners, extruded up from y0 to y1
  const yprism = (w, d, y0, y1, bev, ch) => {
    const x = w / 2,
      z = d / 2;
    const geo = extrude(
      shape([
        [-x + ch, -z],
        [x - ch, -z],
        [x, -z + ch],
        [x, z - ch],
        [x - ch, z],
        [-x + ch, z],
        [-x, z - ch],
        [-x, -z + ch],
      ]),
      y0,
      y1,
      bev,
    );
    geo.rotateX(-Math.PI / 2); // extrusion axis z -> y
    return geo;
  };

  // ---- base: two 0.25 m tiers, stepped mostly in width ----------------------
  add(yprism(1.3, 0.68, 0, 0.25, 0.025, 0.03), sienna);
  add(yprism(1.15, 0.64, 0.25, 0.5, 0.02, 0.03), sand);

  // ---- shaft ------------------------------------------------------------------
  const Y0 = 0.5,
    YT = 2.04,
    ZF = 0.3,
    ZB = -0.3,
    INS = 0.03,
    SKIN = 0.08;
  const hw = (y) => 0.5 - (0.05 * (y - Y0)) / (YT - Y0);
  const PW = 0.48,
    PY0 = 0.525,
    PY1 = PY0 + PW,
    PZ = ZF - SKIN; // panel recess
  const LY = 1.3,
    LR = 0.225; // lens centre height, radius
  const trap = (y0, y1, i = 0, ch = 0) => {
    const a = hw(y0) - i,
      b = hw(y1) - i;
    return ch
      ? [
          [-a, y0],
          [a, y0],
          [a, y0 + ch],
          [b, y1 - ch],
          [b, y1],
          [-b, y1],
          [-b, y1 - ch],
          [-a, y0 + ch],
        ]
      : [
          [-a, y0],
          [a, y0],
          [b, y1],
          [-b, y1],
        ];
  };
  // body slices behind the front skin; bands (1: sides and back, 2: all round)
  // are set back 3 cm and darkened
  const rows = [
    [0.5, 0.66, 0],
    [0.66, 0.7, 1],
    [0.7, 1.14, 0],
    [1.14, 1.18, 1],
    [1.18, 1.66, 0],
    [1.66, 1.7, 2],
    [1.7, 1.82, 0],
    [1.82, 1.86, 2],
    [1.86, YT, 0],
  ];
  for (const [a, b, band] of rows) {
    if (band)
      add(
        zprism(trap(a, b, INS), ZB + INS, band === 2 ? ZF - INS : PZ, 0),
        sienna,
      );
    else add(zprism(trap(a, b, 0, 0.012), ZB, PZ, 0.02), sand);
  }
  // front skin in three pieces between the all-round bands; the lowest one is cut
  // by the panel. It reaches 3 cm into the body so its rear chamfer stays buried.
  // The panel opens onto the plinth: a hole 2.5 cm above the skin's foot overlaps
  // the bevelled outline, which three r186 triangulates as a filled face.
  const recess = [
    [-PW / 2, Y0],
    [PW / 2, Y0],
    [PW / 2, PY1],
    [-PW / 2, PY1],
  ];
  const low = trap(Y0, 1.66, 0, 0.012);
  low.splice(1, 0, recess[0], recess[3], recess[2], recess[1]);
  add(zprism(low, PZ - 0.03, ZF, 0.02), sand);
  add(zprism(trap(1.7, 1.82, 0, 0.012), PZ - 0.03, ZF, 0.02), sand);
  add(zprism(trap(1.86, YT, 0, 0.012), PZ - 0.03, ZF, 0.02), sand);
  add(zprism(recess, PZ, PZ + 0.006, 0), sienna); // recess floor, a hair proud

  // ---- crown: two receding steps and a chamfered cap ------------------------
  add(yprism(0.84, 0.52, YT, 2.16, 0.02, 0.03), sunlit);
  add(yprism(0.66, 0.42, 2.16, 2.27, 0.02, 0.03), sunlit);
  add(yprism(0.5, 0.32, 2.27, 2.4, 0.05, 0.04), sunlit);

  // ---- lens and bezel: lathe profiles facing +Z --------------------------------
  // Profiles are [radius, height above the face] and run counter-clockwise round
  // the solid; lathe() turns each edge on its own so corners stay crisp, turn()
  // keeps a smooth profile such as the dome in one piece.
  // LatheGeometry leaves the last normal of a profile unnormalised; fix it.
  const turn = (pts, segs = 40) => {
    const geo = new THREE.LatheGeometry(
      pts.map(([r, h]) => new THREE.Vector2(r, h)),
      segs,
    );
    const nr = geo.attributes.normal,
      v = new THREE.Vector3();
    for (let k = 0; k < nr.count; k++) {
      v.fromBufferAttribute(nr, k).normalize();
      nr.setXYZ(k, v.x, v.y, v.z);
    }
    return geo.rotateX(Math.PI / 2); // lathe axis y -> +Z
  };
  const lathe = (pts, segs = 40) =>
    pts.slice(1).map((p, i) => turn([pts[i], p], segs));
  for (const geo of lathe([
    [0.274, -0.01],
    [0.274, 0.012],
    [0.264, 0.02],
    [0.258, 0.037],
    [0.236, 0.037],
    [0.227, 0.027],
    [0.227, -0.02],
  ])) {
    geo.translate(0, LY, ZF);
    add(geo, bronze);
  }
  const DOME = 0.03,
    dome = [[LR - 0.002, 0.008]];
  for (let i = 1; i <= 6; i++) {
    const t = i / 6,
      r = (LR - 0.002) * (1 - t);
    dome.push([r, 0.008 + (DOME - 0.008) * (1 - (r / (LR - 0.002)) ** 2)]);
  }
  const lens = new THREE.Mesh(
    merge([
      ...lathe([
        [LR - 0.002, -0.02],
        [LR - 0.002, 0.008],
      ]),
      turn(dome),
    ]),
    crystal,
  );
  lens.name = "lens";
  lens.position.set(0, LY, ZF);
  g.add(lens);
  const LZ = ZF + DOME; // apex of the dome

  for (const [mat, geos] of buckets) g.add(new THREE.Mesh(merge(geos), mat));

  const details = detailBatch(THREE, g);
  for (const side of [-1, 1]) {
    details.line(
      bronze,
      [
        [side * 0.36, 0.62, 0.303],
        [side * 0.335, 1.51, 0.303],
      ],
      0.004,
    );
    for (let i = 0; i < 8; i++)
      details.line(
        sienna,
        [
          [side * 0.395, 0.65 + i * 0.113, 0.301],
          [side * 0.365, 0.685 + i * 0.113, 0.301],
        ],
        0.003,
      );
  }
  details.finish();

  // ---- placement: base at y = 0, centred on x and z (measured on vertices) ---
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mat) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        put(m.multiplyMatrices(n.matrixWorld, im));
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

  const r3 = (x, y, z) => [
    +(x - c.x).toFixed(3),
    +(y - box.min.y).toFixed(3),
    +(z - c.z).toFixed(3),
  ];
  g.userData.parts = { lens };
  g.userData.lens = { center: r3(0, LY, LZ), radius: LR }; // front apex of the lens
  g.userData.panel = { center: r3(0, (PY0 + PY1) / 2, PZ + 0.006), size: PW }; // recess floor, faces +Z
  return g;
}
