import { detailBatch } from "../prop-detail.js";

// sun_mirror, candidate C: a second reading. The U fork is a semicircular cradle
// that follows the disc at a constant gap (one extruded outline with round pivot
// eyes); the disc has a stepped bezel and a sunburst of twelve tapered back ribs;
// the handles are T grips; the drum carries three deep grooves under a stepped top.
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
  const BRONZE = mat(0x9a6a35, "metal", { roughness: 0.5, metalness: 0.6 });
  const MIRROR = mat(0xe0b56a, "metal", { roughness: 0.18, metalness: 1 });

  const add = (parent, geo, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  // Lathe from [r, y, sharp] rows. A sharp row is doubled so the lathe does not
  // average normals across the corner, which keeps stepped profiles crisp; the
  // zero-area strips that leaves (and the ones at the axis) are dropped.
  // Rows run outward along a bottom, upward along a side, inward along a top.
  const lathe = (rows, seg) => {
    const pts = [];
    for (const [r, y, sharp] of rows) {
      pts.push(new THREE.Vector2(r, y));
      if (sharp) pts.push(new THREE.Vector2(r, y));
    }
    const geo = new THREE.LatheGeometry(pts, seg);
    const p = geo.attributes.position,
      idx = geo.index.array,
      keep = [];
    const va = new THREE.Vector3(),
      vb = new THREE.Vector3(),
      vc = new THREE.Vector3();
    for (let i = 0; i < idx.length; i += 3) {
      va.fromBufferAttribute(p, idx[i]);
      vb.fromBufferAttribute(p, idx[i + 1]);
      vc.fromBufferAttribute(p, idx[i + 2]);
      if (vb.sub(va).cross(vc.sub(va)).lengthSq() > 1e-14)
        keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    geo.setIndex(keep);
    return geo;
  };

  // --- drum: sienna plinth course, sandstone body with three deep grooves, and a
  //     two-step top in sunlit sandstone. 1.2 m across, 0.55 m tall.
  const DS = 40;
  add(
    g,
    lathe(
      [
        [0, 0],
        [0.58, 0, 1],
        [0.6, 0.02, 1],
        [0.6, 0.085, 1],
        [0.588, 0.1],
      ],
      DS,
    ),
    SIENNA,
  );
  const body = [
    [0.588, 0.1],
    [0.588, 0.19],
  ];
  add(g, lathe(body, DS), SAND);
  const GR = [
    [0.19, 0.225],
    [0.26, 0.295],
    [0.33, 0.365],
  ];
  GR.forEach(([y0, y1], i) => {
    add(
      g,
      lathe(
        [
          [0.588, y0],
          [0.545, y0 + 0.006, 1],
          [0.545, y1 - 0.006, 1],
          [0.588, y1],
        ],
        DS,
      ),
      SIENNA,
    );
    const next = i < GR.length - 1 ? GR[i + 1][0] : 0.45;
    add(
      g,
      lathe(
        [
          [0.588, y1],
          [0.588, next],
        ],
        DS,
      ),
      SAND,
    );
  });
  add(
    g,
    lathe(
      [
        [0.588, 0.45],
        [0.575, 0.47, 1],
        [0.575, 0.5, 1],
        [0.555, 0.52, 1],
        [0.555, 0.53, 1],
        [0.53, 0.55, 1],
        [0, 0.55],
      ],
      DS,
    ),
    SAND_LIT,
  );
  // bronze turntable plate
  add(
    g,
    lathe(
      [
        [0.3, 0.55],
        [0.3, 0.562, 1],
        [0.285, 0.575, 1],
        [0, 0.575],
      ],
      32,
    ),
    BRONZE,
  );

  // --- T-grip push handles at the drum's sides ----------------------------------
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.08, 0.13, 0.13), BRONZE, s * 0.6, 0.41, 0); // socket
    const bar = add(
      g,
      new THREE.CylinderGeometry(0.032, 0.032, 0.24, 12),
      BRONZE,
      s * 0.74,
      0.41,
      0,
    );
    bar.rotation.z = Math.PI / 2; // x 0.62..0.86
    const t = add(
      g,
      new THREE.CylinderGeometry(0.042, 0.042, 0.22, 14),
      BRONZE,
      s * 0.862,
      0.41,
      0,
    );
    t.rotation.x = Math.PI / 2; // grip along Z
  }

  // --- cradle yoke: a half ring round the disc's lower half, round eyes at the
  //     pivots. Drawn b inside its size because the bevel grows it by b.
  const PIV = 1.3,
    b = 0.012,
    D = 0.12;
  const Ro = 0.74 - b,
    Ri = 0.65 + b,
    E = 0.085 - b,
    EX = 0.695;
  // where a circle of radius R about the pivot meets the eye circle
  const meet = (R) => {
    const x = (R * R - E * E + EX * EX) / (2 * EX);
    return [x, -Math.sqrt(R * R - x * x)];
  };
  const [xo, yo] = meet(Ro),
    [xi, yi] = meet(Ri);
  const aO = Math.atan2(yo, xo),
    aI = Math.atan2(yi, xi);
  const eo = Math.atan2(yo, xo - EX),
    ei = Math.atan2(yi, xi - EX);
  const cr = new THREE.Shape();
  cr.moveTo(-xo, yo);
  cr.absarc(0, 0, Ro, Math.PI - aO, 2 * Math.PI + aO, false); // outer arc through the bottom
  cr.absarc(EX, 0, E, eo, ei + 2 * Math.PI, false); // right eye, over the top
  cr.absarc(0, 0, Ri, aI, -Math.PI - aI, true); // inner arc back through the bottom
  cr.absarc(-EX, 0, E, Math.PI - ei, Math.PI - eo, false); // left eye, over the top
  const cradle = new THREE.ExtrudeGeometry(cr, {
    depth: D - 2 * b,
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 2,
    curveSegments: 12,
  });
  add(g, cradle, BRONZE, 0, PIV, -(D - 2 * b) / 2);
  // stepped saddle joining the cradle to the turntable plate
  add(g, new THREE.BoxGeometry(0.36, 0.035, 0.18), BRONZE, 0, 0.585, 0);
  add(g, new THREE.BoxGeometry(0.24, 0.03, 0.15), BRONZE, 0, 0.615, 0);
  for (const s of [-1, 1]) {
    const pin = add(
      g,
      new THREE.CylinderGeometry(0.036, 0.036, 0.24, 12),
      BRONZE,
      s * 0.67,
      PIV,
      0,
    );
    pin.rotation.z = Math.PI / 2; // x 0.55..0.79
    const cap = add(
      g,
      new THREE.CylinderGeometry(0.058, 0.058, 0.035, 18),
      BRONZE,
      s * 0.79,
      PIV,
      0,
    );
    cap.rotation.z = Math.PI / 2;
  }

  // --- the disc, 1.2 m across and 0.08 m thick --------------------------------
  // Its own group, pivoted on the disc centre, so a game can tilt it about X
  // (rotation.x > 0 tips the face down).
  const disc = new THREE.Group();
  disc.name = "mirror_disc";
  disc.position.set(0, PIV, 0);
  g.add(disc);
  const onAxis = new THREE.Group(); // lathes around Y, turned so +Y points to +Z
  onAxis.rotation.x = Math.PI / 2;
  disc.add(onAxis);
  // flat back and a two-step bezel
  add(
    onAxis,
    lathe(
      [
        [0, -0.04],
        [0.58, -0.04, 1],
        [0.6, -0.025, 1],
        [0.6, 0.015, 1],
        [0.578, 0.015, 1],
        [0.578, 0.045, 1],
        [0.548, 0.045, 1],
        [0.54, 0.03],
      ],
      48,
    ),
    BRONZE,
  );
  // polished face, 1.5 cm concave
  const face = [];
  for (let k = 0; k <= 8; k++) {
    const r = 0.548 * (1 - k / 8);
    face.push([r, 0.022 + 0.015 * (r / 0.548) ** 2]);
  }
  add(onAxis, lathe(face, 48), MIRROR);
  // stepped boss on the back, every riser chamfered
  add(
    onAxis,
    lathe(
      [
        [0, -0.114],
        [0.05, -0.114, 1],
        [0.068, -0.094, 1],
        [0.09, -0.094, 1],
        [0.11, -0.074, 1],
        [0.13, -0.074, 1],
        [0.162, -0.04],
      ],
      32,
    ),
    BRONZE,
  );
  // Sunburst: twelve ridge ribs, 4.5 cm proud at the root and 3 cm at the rim,
  // hand-built as wedges with 45 degree flanks. Flanks parallel to the view
  // leak through the face under the verifier's software MSAA.
  // The ridge line is pulled in from both ends so the end faces slope too.
  const ridge = (r0, r1, w0, w1, h0, h1) => {
    const P = [
      [-w0 / 2, r0, 0],
      [w0 / 2, r0, 0],
      [0, r0 + h0, -h0],
      [-w1 / 2, r1, 0],
      [w1 / 2, r1, 0],
      [0, r1 - h1, -h1],
    ];
    const tri = [
      [0, 5, 2],
      [0, 3, 5],
      [1, 5, 4],
      [1, 2, 5],
      [0, 2, 1],
      [3, 4, 5],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        tri.flat().flatMap((i) => P[i]),
        3,
      ),
    );
    geo.computeVertexNormals();
    return geo;
  };
  const ribGeo = ridge(0.13, 0.555, 0.09, 0.05, 0.045, 0.03);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const m = add(disc, ribGeo, BRONZE, 0, 0, -0.038);
    m.rotation.z = -a;
  }
  for (const s of [-1, 1]) {
    const t = add(
      disc,
      new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16),
      BRONZE,
      s * 0.62,
      0,
      0,
    );
    t.rotation.z = Math.PI / 2; // trunnion lugs where the pins enter
  }

  const details = detailBatch(THREE, disc);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    details.bolt(
      BRONZE,
      0.008,
      [Math.sin(a) * 0.589, Math.cos(a) * 0.589, 0.017],
      [0, 0, 1],
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) * Math.PI) / 6;
    details.bolt(
      BRONZE,
      0.008,
      [Math.sin(a) * 0.568, Math.cos(a) * 0.568, -0.042],
      [0, 0, -1],
    );
  }
  details.finish();

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

  const r3 = (x) => Math.round(x * 1000) / 1000;
  g.userData.mirror = {
    center: [r3(-c.x), r3(PIV - box.min.y), r3(-c.z)],
    radius: 0.6,
  };
  return g;
}
