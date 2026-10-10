// ice_axe, arm B: one of Mira's pair of ice axes. The timber shaft is a tube swept along a
// gentle double bend and flattened to an oval; the steel pick, adze, cap and finger rest are side
// profiles extruded to their thickness; the spike is lathed; the vermilion tape is a sleeve with
// a raised spiral. userData.grip is the centre of the hand on the tape, userData.pick the tip.
export default function (THREE) {
  const g = new THREE.Group();
  const mat = (color, roughness, name, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const TIMBER = mat(0x8a6a48, 0.78, "timber");
  const STEEL = mat(0x9aa2a4, 0.34, "metal", 0.85);
  const DARK = mat(0x4b5254, 0.5, "metal", 0.7);
  const TAPE = mat(0xa34c39, 0.86, "fabric");
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const add = (geo, m) => {
    const mesh = new THREE.Mesh(geo, m);
    g.add(mesh);
    return mesh;
  };
  // A side profile in (z, y) extruded `width` across x, centred on x = 0.
  const profile = (points, width, m, bevel = 0.0012) => {
    const shape = new THREE.Shape(
      points.map(([z, y]) => new THREE.Vector2(z, y)),
    );
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 4,
    });
    geo.rotateY(-Math.PI / 2);
    geo.translate(width / 2 - bevel, 0, 0);
    return add(geo, m);
  };

  // The shaft: a slight backward kink at the grip, then a long forward bow under the head.
  const curve = new THREE.CatmullRomCurve3([
    V(0, 0.045, 0),
    V(0, 0.12, -0.004),
    V(0, 0.22, 0.003),
    V(0, 0.32, 0.017),
    V(0, 0.415, 0.027),
    V(0, 0.468, 0.025),
  ]);
  const shaft = new THREE.TubeGeometry(curve, 40, 0.0155, 10, false);
  shaft.scale(0.7, 1, 1);
  add(shaft, TIMBER);
  // The tape sleeve over the grip and its raised spiral.
  const grip = new THREE.CatmullRomCurve3(
    curve.getPoints(40).filter((p) => p.y > 0.05 && p.y < 0.2),
  );
  const sleeve = new THREE.TubeGeometry(grip, 20, 0.0168, 10, false);
  sleeve.scale(0.72, 1, 1);
  add(sleeve, TAPE);
  const turns = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    const p = grip.getPointAt(t);
    const a = t * Math.PI * 2 * 6;
    turns.push(V(Math.cos(a) * 0.0125, p.y, p.z + Math.sin(a) * 0.0172));
  }
  add(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(turns),
      120,
      0.0016,
      4,
      false,
    ),
    TAPE,
  );
  // The finger rest juts forward over the top of the tape.
  profile(
    [
      [0.008, 0.196],
      [0.036, 0.19],
      [0.04, 0.198],
      [0.03, 0.206],
      [0.008, 0.211],
    ],
    0.014,
    STEEL,
  );
  // Collar and spike, lathed.
  const spike = new THREE.LatheGeometry(
    [
      [0.0, -0.002],
      [0.004, 0.004],
      [0.011, 0.03],
      [0.0135, 0.034],
      [0.0135, 0.062],
      [0.011, 0.066],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    10,
  );
  spike.scale(0.8, 1, 1.15);
  add(spike, STEEL);
  // The head: cap and plates over the shaft's top, then the pick and the adze.
  profile(
    [
      [-0.004, 0.43],
      [0.052, 0.43],
      [0.06, 0.47],
      [0.05, 0.5],
      [-0.002, 0.506],
      [-0.012, 0.48],
    ],
    0.026,
    DARK,
  );
  const pick = [
    [0.05, 0.5],
    [0.09, 0.494],
    [0.13, 0.478],
    [0.17, 0.455],
    [0.205, 0.426],
    [0.228, 0.398],
    [0.236, 0.39],
    [0.226, 0.392],
  ];
  // The underside runs back with teeth.
  const under = [];
  for (let k = 0; k <= 9; k++) {
    const t = k / 9;
    const z = 0.222 - t * 0.17;
    const y = 0.392 + 0.08 * t - 0.012 * t * t;
    under.push([z, y - (k % 2 ? 0.0065 : 0)]);
  }
  profile([...pick, ...under, [0.05, 0.47]], 0.0068, STEEL, 0.0008);
  profile(
    [
      [-0.006, 0.452],
      [-0.006, 0.498],
      [-0.03, 0.494],
      [-0.06, 0.5],
      [-0.082, 0.508],
      [-0.086, 0.476],
      [-0.06, 0.468],
      [-0.03, 0.462],
    ],
    0.01,
    STEEL,
    0.001,
  );
  // Two rivets through the cap.
  for (const [z, y] of [
    [0.01, 0.452],
    [0.036, 0.448],
  ])
    for (const side of [-1, 1]) {
      const rivet = add(
        new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 8),
        STEEL,
      );
      rivet.rotation.z = Math.PI / 2;
      rivet.position.set(side * 0.0135, y, z);
    }

  const gripPoint = V(0, 0.112, -0.002);
  const tip = V(0, 0.39, 0.236);
  const box = new THREE.Box3(),
    v = new THREE.Vector3();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    for (let i = 0; i < p.count; i++)
      box.expandByPoint(
        v.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld),
      );
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box.min.y;
    o.position.z -= c.z;
  });
  const shift = V(-c.x, -box.min.y, -c.z);
  g.userData.grip = gripPoint.add(shift).toArray();
  g.userData.pick = tip.add(shift).toArray();
  return g;
}
