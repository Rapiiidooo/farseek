import { propDetails } from "../props-detail.js";

// brazier, candidate D: profiles. A deep cast basin, rounded like a cauldron so its belly
// reads from below, rides on three legs that grip its sides and splay straight down to paw
// feet: there is no hub, rung or ring under it, so no angle reads it as a stool. The rolled
// rim is bronze outside and fire-blackened inside; a mound of coals fills it to the lip,
// its embers glowing lantern amber. 1.1 m tall, 0.8 m across the rim.
export default function (THREE) {
  const g = new THREE.Group();
  const details = propDetails(THREE, g);

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
  const BRONZE = mat(0x9a6a35, "metal", { roughness: 0.56, metalness: 0.55 });
  // Fire-blackened bronze: the inside of the basin and the top of its lip.
  const SOOT = mat(0x3a3531, "metal", { roughness: 0.84, metalness: 0.3 });
  const COAL = mat(0x3a3531, "stone", { roughness: 0.95 });
  const EMBER = mat(0x8a5433, "stone", {
    roughness: 0.9,
    emissive: 0xffb24a,
    emissiveIntensity: 1.5,
  });

  const add = (geo, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  // Rows run outward along a bottom, up a side, inward along a top.
  const lathe = (rows, seg) =>
    new THREE.LatheGeometry(
      rows.map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
    );

  // --- the basin: a deep rounded belly under a rolled rim ---------------------
  const RIM = { r: 0.365, y: 1.06, t: 0.035 };
  const bead = (degrees) =>
    degrees.map((deg) => {
      const a = (deg * Math.PI) / 180;
      return [RIM.r + RIM.t * Math.cos(a), RIM.y + RIM.t * Math.sin(a)];
    });
  add(
    lathe(
      [
        [0, 0.6],
        [0.07, 0.605],
        [0.14, 0.625],
        [0.2, 0.66],
        [0.25, 0.71],
        [0.288, 0.775],
        [0.312, 0.845],
        [0.322, 0.91],
        [0.318, 0.965],
        [0.326, 0.99],
        [0.34, 1.012],
        ...bead([-125, -90, -45, 0, 45]),
      ],
      40,
    ),
    BRONZE,
  );
  add(
    lathe(
      [
        ...bead([45, 90, 135, 180]),
        [0.316, 1.035],
        [0.3, 0.99],
        [0.268, 0.93],
        [0.21, 0.875],
        [0.13, 0.84],
        [0.05, 0.828],
        [0, 0.826],
      ],
      40,
    ),
    SOOT,
  );
  // Two cast bands round the belly, the lower one where the legs take hold.
  for (const [y, r] of [
    [0.8, 0.3],
    [0.94, 0.324],
  ])
    add(
      new THREE.TorusGeometry(r, 0.011, 6, 48).rotateX(Math.PI / 2),
      BRONZE,
      0,
      y,
      0,
    );

  // --- legs: each grips the belly, then splays straight down to a paw foot ------
  const LEG = [
    [0.27, 0.86],
    [0.318, 0.8],
    [0.345, 0.7],
    [0.356, 0.52],
    [0.356, 0.32],
    [0.35, 0.14],
    [0.346, 0.05],
  ];
  const legCurve = (a) =>
    new THREE.CatmullRomCurve3(
      LEG.map(
        ([r, y]) => new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a)),
      ),
    );
  // TubeGeometry places rings at arc-length steps; scaling each ring about its centre keeps
  // its radial normals, which the gentle taper barely tilts.
  const leg = (curve, TS = 18, RS = 10) => {
    const geo = new THREE.TubeGeometry(curve, TS, 1, RS, false);
    const p = geo.attributes.position,
      c = new THREE.Vector3(),
      w = new THREE.Vector3();
    for (let i = 0; i <= TS; i++) {
      curve.getPointAt(i / TS, c);
      const k = i / TS;
      const r =
        0.042 - 0.014 * k + 0.008 * Math.exp(-((k - 0.12) ** 2) / 0.004);
      for (let j = 0; j <= RS; j++) {
        const q = i * (RS + 1) + j;
        w.fromBufferAttribute(p, q).sub(c).multiplyScalar(r).add(c);
        p.setXYZ(q, w.x, w.y, w.z);
      }
    }
    return geo;
  };
  // A paw: a squat dome on a low disc, set a little outward of the leg.
  const paw = lathe(
    [
      [0, 0],
      [0.05, 0],
      [0.052, 0.012],
      [0.046, 0.03],
      [0.032, 0.048],
      [0.016, 0.058],
      [0, 0.06],
    ],
    16,
  ).scale(1, 1, 1.12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add(leg(legCurve(a)), BRONZE);
    const foot = paw.clone().rotateY(a);
    add(foot, BRONZE, 0.348 * Math.sin(a), 0, 0.348 * Math.cos(a));
    // A cast knop where the leg leaves the belly.
    add(
      new THREE.SphereGeometry(0.04, 12, 8).scale(1, 1.25, 1),
      BRONZE,
      0.33 * Math.sin(a),
      0.79,
      0.33 * Math.cos(a),
    );
  }
  // A disc medallion on the belly between each pair of legs, the builders' mark.
  for (let i = 0; i < 3; i++) {
    const a = ((i + 0.5) / 3) * Math.PI * 2;
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const n = out
      .clone()
      .multiplyScalar(0.97)
      .add(new THREE.Vector3(0, -0.24, 0))
      .normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      n,
    );
    const centre = out.clone().multiplyScalar(0.316).setY(0.875);
    for (const [r0, r1, h, lift] of [
      [0.044, 0.048, 0.016, 0.004],
      [0.02, 0.024, 0.014, 0.014],
    ])
      add(
        new THREE.CylinderGeometry(r0, r1, h, 16)
          .applyQuaternion(q)
          .translate(...centre.clone().addScaledVector(n, lift).toArray()),
        BRONZE,
      );
  }

  // --- coals: a mound filling the basin to its lip, embers glowing in it --------
  const peak = 1.05;
  const moundY = (r) => peak - 0.045 * (r / 0.31) ** 1.6;
  add(
    lathe(
      [
        [0.318, 1.0],
        [0.26, moundY(0.26)],
        [0.18, moundY(0.18)],
        [0.09, moundY(0.09)],
        [0, peak],
      ],
      32,
    ),
    COAL,
  );
  const lumps = [
    [0, 0, 0.04],
    [0.1, 0.5, 0.046],
    [0.11, 2.6, 0.044],
    [0.1, 4.6, 0.042],
    [0.19, 1.4, 0.04],
    [0.2, 3.5, 0.036],
    [0.19, 5.6, 0.042],
    [0.06, 1.9, 0.036],
    [0.25, 0.4, 0.03],
    [0.26, 2.4, 0.03],
    [0.25, 4.4, 0.032],
  ];
  lumps.forEach(([r, a, s], i) => {
    const l = add(
      new THREE.IcosahedronGeometry(s, 0),
      i % 3 === 1 ? EMBER : COAL,
      r * Math.sin(a),
      moundY(r) + s * 0.15,
      r * Math.cos(a),
    );
    l.rotation.set(a * 0.9, a * 1.7, a * 1.1);
  });
  for (let i = 0; i < 28; i++) {
    const a = i * 2.39996,
      r = 0.04 + (0.24 * ((i * 7) % 28)) / 28;
    const coal = new THREE.IcosahedronGeometry(0.016 + (i % 3) * 0.005, 0);
    coal
      .scale(1, 0.55, 0.7)
      .rotateY(a)
      .translate(Math.sin(a) * r, moundY(r) + 0.012, Math.cos(a) * r);
    details.add(coal, i % 3 === 0 ? EMBER : COAL);
  }
  // Rivets round the rolled rim.
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    details.add(
      new THREE.OctahedronGeometry(0.0065)
        .scale(1, 1, 0.5)
        .rotateY(a)
        .translate(
          Math.sin(a) * (RIM.r + RIM.t * 0.75),
          RIM.y - 0.018,
          Math.cos(a) * (RIM.r + RIM.t * 0.75),
        ),
      BRONZE,
    );
  }
  const flameY = peak + 0.04;

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
  const ctr = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= ctr.x;
    o.position.y -= box.min.y;
    o.position.z -= ctr.z;
  });

  const r3 = (x) => Math.round(x * 1000) / 1000;
  g.userData.flame = [r3(-ctr.x), r3(flameY - box.min.y), r3(-ctr.z)];
  return details.batch();
}
