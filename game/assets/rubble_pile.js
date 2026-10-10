import { propDetails } from "../props-detail.js";

// rubble_pile, candidate A (primitives): a heap of fallen masonry about 2.4 m
// across and 0.9 m tall. Each dressed block is a full-section head and two
// courses about a box core, so a sienna-floored groove runs along both long
// faces and stops short of the dressed end. A course is an eight-sided cylinder
// whose ring corners sit on its chamfered section; its far end vertices are moved
// onto that course's own oblique break, skinned in the other sandstone. The
// sunlit block leans against the dressed end of the sandstone one; a faceted
// drum with a bone band lies in front, snapped in a step; box lumps, triangular
// wedges and five- or six-sided flakes spill round them.
export default function (THREE) {
  const g = new THREE.Group();
  const details = propDetails(THREE, g);

  const mat = (color, roughness) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
    });
    m.name = "stone";
    return m;
  };
  const SUN = mat(0xd4a373, 0.86);
  const SAND = mat(0xb57f4f, 0.9);
  const SIENNA = mat(0x8a5433, 0.95);
  const BONE = mat(0xe6d3ae, 0.78);

  const put = (parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    parent.add(o);
    return o;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // Flat facets everywhere: every face of dressed stone is a plane.
  const facet = (geo) => {
    const n = geo.index ? geo.toNonIndexed() : geo;
    n.computeVertexNormals();
    return n;
  };
  // A primitive with its placement baked in, so its vertices can be moved in the
  // frame of the block it belongs to.
  const _o = new THREE.Object3D();
  const bake = (geo, [x, y, z], [rx, ry, rz] = [0, 0, 0]) => {
    _o.position.set(x, y, z);
    _o.rotation.set(rx, ry, rz);
    _o.updateMatrix();
    return facet(geo).applyMatrix4(_o.matrix);
  };

  // Lowest world-space point of an object, measured on its vertices.
  const _v = new THREE.Vector3();
  const lowest = (o) => {
    g.updateMatrixWorld(true);
    let min = Infinity;
    o.traverse((n) => {
      const p = n.isMesh && n.geometry.attributes.position;
      if (!p) return;
      for (let i = 0; i < p.count; i++)
        min = Math.min(
          min,
          _v.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld).y,
        );
    });
    return min;
  };
  const settle = (o, sink = 0.01) => {
    o.position.y -= lowest(o) + sink;
    return o;
  };

  // --- dressed blocks ------------------------------------------------------------
  // One course, x from x0 to x1, y from y0 to y1, z within +-d/2: an eight-sided
  // cylinder laid along x whose ring corners are moved onto the course's section,
  // a rectangle with its lower and/or upper long edges chamfered by c. One closed
  // mesh, so no hidden face meets the surface and flickers through it.
  const course = (x0, x1, y0, y1, d, c, cb, ct, e = 0) => {
    const h = d / 2 + e,
      kb = cb ? c : 0,
      kt = ct ? c : 0;
    y0 -= e;
    y1 += e;
    // corners in the cylinder's own order round its axis: down the front, along
    // the bottom, up the back, along the top
    const oct = [
      [y1 - kt, h],
      [y0 + kb, h],
      [y0, h - kb],
      [y0, -h + kb],
      [y0 + kb, -h],
      [y1 - kt, -h],
      [y1, -h + kt],
      [y1, h - kt],
    ];
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1).toNonIndexed();
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      let yy = (y0 + y1) / 2,
        zz = 0;
      if (x * x + z * z > 0.25) {
        const k = ((Math.round(Math.atan2(x, z) / (Math.PI / 4)) % 8) + 8) % 8;
        [yy, zz] = oct[k];
      }
      p.setXYZ(i, x0 + (y + 0.5) * (x1 - x0), yy, zz);
    }
    geo.computeVertexNormals();
    return [geo];
  };
  // Move every vertex at or beyond x = from to x = to(y, z) + (x - from).
  const bend = (geos, from, to) => {
    for (const gg of geos) {
      const p = gg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        if (x >= from - 1e-5) p.setX(i, to(p.getY(i), p.getZ(i)) + (x - from));
      }
      gg.computeVertexNormals();
    }
    return geos;
  };

  // A block with its dressed end at x = 0, broken toward +x: low(y, z) and up(y, z)
  // give the x where the lower and the upper course broke. A dressed head of full
  // section, then two courses about a core set back by the groove depth, with a
  // thin sienna floor on each face; the groove starts at the head. Each course
  // ends in a skin of the fracture colour. Where two parts meet, one is 1 mm
  // larger and overlaps the other, so no hidden face touches a visible one.
  const block = (body, broken, o) => {
    const b = new THREE.Group();
    const { L, H, D, c, gy, gw, gd, low, up } = o;
    const yl = gy - gw / 2,
      yu = gy + gw / 2,
      f = 0.018,
      P = 0.09,
      FL = 0.012,
      e = 0.001,
      lap = 0.006;
    const mk = (geos, m) => geos.forEach((gg) => b.add(new THREE.Mesh(gg, m)));
    const band = (y, z) => (y < gy ? low(y, z) : up(y, z));
    const at = (fn, dx) => (y, z) => fn(y, z) + dx;
    mk(course(0, P, 0, H, D, c, true, true, e), body);
    mk(
      bend(
        course(P - 0.01, L - f, 0, yl, D, c, true, false),
        L - f,
        at(low, -f),
      ),
      body,
    );
    mk(
      bend(
        course(P - 0.01, L - f, yu, H, D, c, false, true),
        L - f,
        at(up, -f),
      ),
      body,
    );
    mk(
      bend(
        course(L - f - lap, L, 0, yl, D, c, true, false, e),
        L - f - lap,
        at(low, -f - lap),
      ),
      broken,
    );
    mk(
      bend(
        course(L - f - lap, L, yu, H, D, c, false, true, e),
        L - f - lap,
        at(up, -f - lap),
      ),
      broken,
    );
    const core = D - 2 * gd,
      x0 = P - 0.01,
      x1 = L - f - 0.001;
    mk(
      bend(
        [bake(box(x1 - x0, gw + 0.004, core), [(x0 + x1) / 2, gy, 0])],
        x1,
        at(band, -f - 0.001),
      ),
      body,
    );
    mk(
      bend(
        [
          bake(box(f + lap - 0.001, gw + 0.004, core), [
            L - f - lap + (f + lap - 0.001) / 2,
            gy,
            0,
          ]),
        ],
        L - f - lap,
        at(band, -f - lap),
      ),
      broken,
    );
    for (const s of [-1, 1]) {
      const a = P - 0.005,
        z = s * (core / 2 + FL / 2 - 0.004);
      mk(
        bend(
          [bake(box(L - f - a, gw + 0.002, FL), [(a + L - f) / 2, gy, z])],
          L - f,
          at(band, -f),
        ),
        SIENNA,
      );
    }
    // where the lower course outlasted the band, its broken top is fracture too
    const step = bake(box(1, 0.012, D - 0.004), [0.5, yl + 0.004, 0]);
    const p = step.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i),
        a = band(yl + 0.01, z) - 0.004;
      p.setX(i, p.getX(i) < 0.5 ? a : Math.max(a, low(yl, z) - 0.006));
    }
    step.computeVertexNormals();
    mk([step], broken);
    return b;
  };

  // the bed block, lying with its break toward -x and its dressed end toward +x
  const B1 = {
    L: 1.25,
    H: 0.5,
    D: 0.62,
    c: 0.05,
    gy: 0.33,
    gw: 0.075,
    gd: 0.045,
    // an oblique break that steps at the groove: the band and the upper course
    // lost their front corner, the lower course broke square-ish below them
    low: (y, z) => 1.24 - 0.2 * (z / 0.62 + 0.5) + 0.03 * (y / 0.29),
    up: (y, z) => 1.14 - 0.36 * (z / 0.62 + 0.5) - 0.05 * ((y - 0.37) / 0.13),
  };
  const b1 = block(SAND, SUN, B1);
  b1.position.set(0.26, 0, -0.16);
  b1.rotation.y = Math.PI - 0.1;
  g.add(b1);
  settle(b1, 0.015);

  // the leaning block: its dressed foot on the ground at +x, its body pitched up
  // across the bed block's dressed end, its break in the air above the bed block
  const B2 = {
    L: 1.06,
    H: 0.36,
    D: 0.5,
    c: 0.045,
    gy: 0.21,
    gw: 0.07,
    gd: 0.04,
    low: (y, z) => 1.03 + 0.12 * (z / 0.5 + 0.5) - 0.1 * (y / 0.36),
    up: (y, z) =>
      1.03 + 0.12 * (z / 0.5 + 0.5) - 0.1 * (y / 0.36) - 0.06 * (z / 0.5 + 0.5),
  };
  const lean = new THREE.Group();
  const pitch = new THREE.Group();
  const b2 = block(SUN, SAND, B2);
  pitch.add(b2);
  lean.add(pitch);
  g.add(lean);
  lean.position.set(0.9, 0, -0.1);
  lean.rotation.y = Math.PI - 0.22; // local +x runs to the left, a little toward the back
  // Pitch it just enough for its underside to clear the bed block's dressed end.
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(lean.matrixWorld).invert();
  let reach = Infinity;
  for (let s = -B1.D / 2; s <= B1.D / 2; s += 0.01) {
    for (const x of [0, 0.05, 0.1]) {
      const p = b1
        .localToWorld(new THREE.Vector3(x, B1.H, s * (1 - (2 * B1.c) / B1.D)))
        .applyMatrix4(inv);
      if (Math.abs(p.z) <= B2.D / 2 && p.x > 0) reach = Math.min(reach, p.x);
    }
  }
  const top1 = b1.localToWorld(new THREE.Vector3(0, B1.H, 0)).y;
  pitch.rotation.z = Math.atan2(top1 + 0.004, reach);
  settle(lean, 0.012);

  // --- the drum ------------------------------------------------------------------
  // Built along +y, bed at y = 0: a faceted shaft with a chamfered bed and a bone
  // band near it, snapped at the top in a step where half the section broke higher.
  const R = 0.28,
    LD = 0.44,
    E = 0.13,
    SEG = 14;
  const drumUp = new THREE.Group();
  put(
    drumUp,
    facet(new THREE.CylinderGeometry(R, R, LD, SEG, 1, true)),
    SAND,
    0,
    LD / 2,
    0,
  );
  put(
    drumUp,
    facet(new THREE.CylinderGeometry(R, R - 0.035, 0.035, SEG, 1, true)),
    SAND,
    0,
    -0.0175,
    0,
  );
  put(
    drumUp,
    facet(new THREE.CircleGeometry(R - 0.035, SEG)),
    SAND,
    0,
    -0.035,
    0,
    Math.PI / 2,
    0,
    Math.PI / SEG,
  );
  put(
    drumUp,
    facet(new THREE.CylinderGeometry(R + 0.024, R + 0.024, 0.1, SEG, 1)),
    BONE,
    0,
    0.1,
    0,
  );
  put(
    drumUp,
    facet(new THREE.CircleGeometry(R, SEG)),
    SUN,
    0,
    LD,
    0,
    -Math.PI / 2,
    0,
    Math.PI / SEG,
  );
  // the higher half: a half drum, its broken end and the split face across the diameter
  put(
    drumUp,
    facet(new THREE.CylinderGeometry(R, R, E, SEG / 2, 1, true, 0, Math.PI)),
    SAND,
    0,
    LD + E / 2,
    0,
  );
  put(
    drumUp,
    facet(new THREE.CircleGeometry(R, SEG / 2, -Math.PI / 2, Math.PI)),
    SUN,
    0,
    LD + E,
    0,
    -Math.PI / 2,
    0,
    0,
  );
  put(drumUp, box(0.012, E, 2 * R), SUN, 0.005, LD + E / 2, 0);
  // a chip left standing on the lower face
  put(
    drumUp,
    box(0.1, 0.05, 0.15),
    SUN,
    -0.13,
    LD + 0.018,
    0.06,
    0.1,
    0.4,
    0.12,
  );
  const drum = new THREE.Group();
  drumUp.rotation.z = -Math.PI / 2; // the axis now runs along +x from the bed
  drumUp.rotation.x = Math.PI / 2; // the step stands on edge, seen from the side
  drum.add(drumUp);
  drum.position.set(-0.4, 0, 0.84);
  drum.rotation.y = 0.93; // bed and band toward the front left
  g.add(drum);
  settle(drum, 0.024); // the band holds the shaft up; bed it in the grit

  // --- chunks and flakes ---------------------------------------------------------
  // [kind, material, size x, y, z, x, z, rot x, y, z, sink]. box: a squared lump;
  // wedge: a triangular prism, a broken-off arris; flake: a thin five- or six-sided slab.
  const flakeGeo = [
    facet(new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1)),
    facet(new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1)),
  ];
  const wedgeGeo = facet(new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1))
    .rotateX(Math.PI / 2)
    .rotateZ(Math.PI);
  const cubeGeo = box(1, 1, 1);
  const bits = [
    // fallen out of the bed block's break, to the left
    ["wedge", SAND, 0.36, 0.21, 0.24, -1.03, -0.36, 0, 0.5, 0, 0.01],
    ["flake", SAND, 0.34, 0.055, 0.26, -1.04, 0.2, 0.1, 0.3, -0.12, 0.004],
    ["box", SIENNA, 0.22, 0.15, 0.2, -0.98, 0.68, 0.12, 0.6, -0.1, 0.012],
    ["flake", SIENNA, 0.3, 0.05, 0.24, -0.72, -0.62, -0.08, 1.2, 0.06, 0.004],
    // in front
    ["flake", SAND, 0.36, 0.06, 0.28, 0.2, 0.68, -0.06, 0.3, 0.05, 0.005],
    ["box", SIENNA, 0.26, 0.17, 0.2, 0.5, 0.8, 0.08, -0.4, 0.14, 0.015],
    ["wedge", SIENNA, 0.28, 0.16, 0.22, -0.76, 0.6, 0, 2.6, 0, 0.01],
    // round the leaning block's foot, and behind
    ["wedge", SAND, 0.3, 0.17, 0.2, 0.98, 0.44, 0, -0.4, 0, 0.01],
    ["box", SAND, 0.2, 0.14, 0.24, 0.66, -0.62, -0.1, 0.35, 0.18, 0.012],
    ["flake", SIENNA, 0.4, 0.05, 0.3, 0.12, -0.76, 0.05, 1.9, 0.06, 0.004],
    ["box", SIENNA, 0.16, 0.12, 0.18, -0.36, -0.82, 0.2, -0.3, 0.1, 0.01],
  ];
  bits.forEach(([kind, m, sx, sy, sz, x, z, rx, ry, rz, sink], i) => {
    const o = new THREE.Group();
    const geo =
      kind === "box" ? cubeGeo : kind === "wedge" ? wedgeGeo : flakeGeo[i % 2];
    put(o, geo, m).scale.set(sx, sy, sz);
    o.rotation.set(rx, ry, rz);
    o.position.set(x, 0, z);
    g.add(o);
    settle(o, sink);
  });
  // a flake propped against the back of the bed block
  const prop = new THREE.Group();
  put(prop, flakeGeo[0], SIENNA).scale.set(0.36, 0.05, 0.3);
  prop.rotation.set(-0.9, 0.2, 0.05);
  prop.position.set(-0.28, 0, -0.6);
  g.add(prop);
  settle(prop, 0.01);

  for (const [parent, desc] of [
    [b1, B1],
    [b2, B2],
  ])
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x = 0.15 + i * 0.115,
          y = desc.H * 0.38 + 0.018 * Math.sin(i * 2.3),
          z = side * (desc.D / 2 + 0.0015);
        details.line(
          [
            [x, y, z],
            [x + 0.024, y + 0.006, z],
            [x + 0.058, y - 0.004, z],
          ],
          SIENNA,
          0.0025,
          parent,
        );
      }
    }
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996,
      r = 0.26 + (i % 7) * 0.085;
    const chip = new THREE.IcosahedronGeometry(0.018 + (i % 4) * 0.006, 0);
    chip
      .scale(1, 0.35, 0.7)
      .rotateY(a)
      .translate(Math.sin(a) * r, 0.015, Math.cos(a) * r);
    details.add(chip, i % 3 ? SAND : SIENNA);
  }
  // --- the six lines -------------------------------------------------------------
  const box3 = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put4 = (mat4) => {
      for (let i = 0; i < p.count; i++)
        box3.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        put4(m4.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    put4(n.matrixWorld);
  });
  const c = box3.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box3.min.y;
    o.position.z -= c.z;
  });
  return details.batch();
}
