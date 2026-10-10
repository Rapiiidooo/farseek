import { detailBatch, consolidateDetails } from "../prop-detail.js";

export default function (THREE) {
  const root = new THREE.Group();
  root.name = "Compact expedition pistol";
  const proportions = new THREE.Vector3(0.68, 0.84, 0.7);
  const steel = new THREE.MeshStandardMaterial({
    color: 0x64727a,
    metalness: 0.72,
    roughness: 0.37,
  });
  const frame = new THREE.MeshStandardMaterial({
    color: 0x2b343a,
    metalness: 0.34,
    roughness: 0.49,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x202526,
    roughness: 0.86,
  });
  const inset = new THREE.MeshStandardMaterial({
    color: 0x10171a,
    metalness: 0.18,
    roughness: 0.67,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x9e5941,
    metalness: 0.5,
    roughness: 0.43,
  });
  const slide = new THREE.Group();
  slide.name = "pistolSlide";
  root.add(slide);
  const gripGroup = new THREE.Group();
  root.add(gripGroup);
  const magazine = new THREE.Group();
  magazine.name = "pistolMagazine";
  root.add(magazine);
  const body = detailBatch(THREE, root),
    upper = detailBatch(THREE, slide),
    magazineDetails = detailBatch(THREE, magazine),
    gripDetails = detailBatch(THREE, gripGroup);
  const profile = (batch, material, points, width, x = 0, bevel = 0.001) => {
    const shape = new THREE.Shape(
      points.map(([z, y]) => new THREE.Vector2(z, y)),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: width - bevel * 2,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelOffset: -bevel,
      bevelSegments: 2,
      curveSegments: 3,
    });
    geometry.translate(0, 0, -width / 2 + bevel);
    geometry.rotateY(-Math.PI / 2);
    batch.add(material, geometry, [x, 0, 0]);
  };
  const round = (
    batch,
    material,
    radius,
    length,
    point,
    axis = [0, 0, 1],
    open = false,
    segments = 24,
  ) => {
    const geometry = new THREE.CylinderGeometry(
      radius,
      radius,
      length,
      segments,
      1,
      open,
    );
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...axis),
      ),
    );
    geometry.scale(1, proportions.x / proportions.y, 1);
    batch.add(material, geometry, point);
  };
  const boreY = 0.203 * 0.74;
  profile(
    body,
    frame,
    [
      [-0.106, 0.115],
      [-0.104, 0.138],
      [0.143, 0.138],
      [0.159, 0.127],
      [0.15, 0.113],
      [0.027, 0.112],
      [0.005, 0.099],
      [-0.035, 0.098],
      [-0.049, 0.112],
    ],
    0.044,
  );
  profile(
    gripDetails,
    frame,
    [
      [-0.107, 0.12],
      [-0.052, 0.119],
      [-0.033, 0.091],
      [-0.056, 0.019],
      [-0.105, 0.014],
      [-0.117, 0.023],
      [-0.094, 0.091],
    ],
    0.039,
    0,
    0.0025,
  );
  profile(
    magazineDetails,
    inset,
    [
      [-0.117, 0.024],
      [-0.055, 0.023],
      [-0.055, 0.013],
      [-0.064, 0.008],
      [-0.114, 0.011],
      [-0.122, 0.015],
    ],
    0.044,
    0,
    0.0015,
  );
  profile(
    magazineDetails,
    steel,
    [
      [-0.109, 0.022],
      [-0.069, 0.022],
      [-0.047, 0.11],
      [-0.084, 0.115],
    ],
    0.027,
    0,
    0.001,
  );
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++)
      magazineDetails.bolt(
        inset,
        0.0017,
        [side * 0.0137, 0.036 + i * 0.012, -0.091 + i * 0.003],
        [side, 0, 0],
      );
    magazineDetails.line(
      frame,
      [
        [side * 0.0138, 0.025, -0.099],
        [side * 0.0138, 0.105, -0.079],
      ],
      0.0006,
    );
  }
  magazineDetails.box(inset, [0.023, 0.0025, 0.025], [0, 0.11, -0.065]);
  magazineDetails.box(accent, [0.01, 0.003, 0.027], [0, 0.113, -0.065]);
  for (const side of [-1, 1]) {
    profile(
      gripDetails,
      rubber,
      [
        [-0.092, 0.111],
        [-0.055, 0.107],
        [-0.043, 0.085],
        [-0.062, 0.027],
        [-0.103, 0.027],
        [-0.11, 0.033],
      ],
      0.006,
      side * 0.0203,
      0.0014,
    );
    for (let row = 0; row < 18; row++) {
      const y = 0.034 + row * 0.0038;
      const back = -0.106 + (y - 0.034) * 0.22;
      const front = -0.063 + (y - 0.034) * 0.25;
      gripDetails.line(
        frame,
        [
          [side * 0.0231, y, back],
          [side * 0.0233, y + 0.0015, (back + front) / 2],
          [side * 0.0231, y, front],
        ],
        0.00038,
      );
    }
    for (const [y, z] of [
      [0.1, -0.077],
      [0.035, -0.083],
    ]) {
      gripDetails.bolt(steel, 0.0032, [side * 0.0237, y, z], [side, 0, 0]);
      gripDetails.box(inset, [0.0005, 0.00065, 0.0033], [side * 0.0246, y, z]);
    }
    body.bolt(steel, 0.003, [side * 0.0222, 0.117, -0.052], [side, 0, 0]);
    profile(
      body,
      steel,
      [
        [-0.073, 0.128],
        [-0.026, 0.128],
        [-0.021, 0.123],
        [-0.065, 0.122],
      ],
      0.002,
      side * 0.0233,
      0.0004,
    );
    body.box(
      inset,
      [0.0014, 0.003, 0.019],
      [side * 0.025, 0.129, -0.071],
      [0.14, 0, 0],
    );
  }
  const guardShape = new THREE.Shape([
    new THREE.Vector2(-0.027, 0.115),
    new THREE.Vector2(0.033, 0.114),
    new THREE.Vector2(0.039, 0.096),
    new THREE.Vector2(0.028, 0.077),
    new THREE.Vector2(-0.016, 0.075),
    new THREE.Vector2(-0.036, 0.089),
  ]);
  guardShape.holes.push(
    new THREE.Path([
      new THREE.Vector2(-0.022, 0.109),
      new THREE.Vector2(-0.029, 0.089),
      new THREE.Vector2(-0.014, 0.082),
      new THREE.Vector2(0.025, 0.084),
      new THREE.Vector2(0.031, 0.098),
      new THREE.Vector2(0.028, 0.108),
    ]),
  );
  const guard = new THREE.ExtrudeGeometry(guardShape, {
    depth: 0.01,
    bevelEnabled: true,
    bevelSize: 0.001,
    bevelThickness: 0.001,
    bevelOffset: -0.001,
    bevelSegments: 2,
  });
  guard.translate(0, 0, -0.005);
  guard.rotateY(-Math.PI / 2);
  body.add(frame, guard);
  profile(
    body,
    steel,
    [
      [-0.013, 0.111],
      [-0.005, 0.109],
      [-0.002, 0.092],
      [-0.008, 0.086],
      [-0.012, 0.088],
      [-0.009, 0.096],
    ],
    0.006,
    0,
    0.0008,
  );
  profile(
    upper,
    steel,
    [
      [-0.108, 0.139],
      [-0.108, 0.164],
      [-0.092, 0.174],
      [0.01, 0.174],
      [0.012, 0.139],
    ],
    0.048,
    0,
    0.0012,
  );
  profile(
    upper,
    steel,
    [
      [0.055, 0.139],
      [0.055, 0.174],
      [0.148, 0.173],
      [0.151, 0.169],
      [0.151, 0.139],
    ],
    0.048,
    0,
    0.0012,
  );
  profile(
    upper,
    steel,
    [
      [0.008, 0.139],
      [0.058, 0.139],
      [0.058, 0.157],
      [0.008, 0.157],
    ],
    0.048,
  );
  profile(
    upper,
    steel,
    [
      [0.008, 0.15],
      [0.058, 0.15],
      [0.058, 0.174],
      [0.008, 0.174],
    ],
    0.003,
    -0.0225,
    0.0006,
  );
  profile(
    upper,
    steel,
    [
      [0.149, 0.162],
      [0.149, 0.173],
      [0.17, 0.164],
      [0.173, 0.162],
    ],
    0.046,
    0,
    0.0008,
  );
  for (const side of [-1, 1])
    profile(
      upper,
      steel,
      [
        [0.149, 0.139],
        [0.173, 0.139],
        [0.17, 0.164],
        [0.149, 0.168],
      ],
      0.009,
      side * 0.0195,
      0.0008,
    );
  upper.box(frame, [0.01, 0.002, 0.041], [-0.016, 0.1725, 0.033]);
  round(body, steel, 0.0117, 0.185, [0, boreY, 0.083], [0, 0, 1], true, 32);
  round(body, inset, 0.0083, 0.026, [0, boreY, 0.163], [0, 0, 1], true, 24);
  body.add(
    steel,
    new THREE.RingGeometry(0.0083, 0.0117, 32).scale(
      1,
      proportions.x / proportions.y,
      1,
    ),
    [0, boreY, 0.176],
  );
  round(body, inset, 0.00825, 0.001, [0, boreY, 0.154]);
  round(body, frame, 0.0061, 0.077, [0, 0.1295, 0.132]);
  body.add(
    steel,
    new THREE.RingGeometry(0.0032, 0.0062, 20).scale(
      1,
      proportions.x / proportions.y,
      1,
    ),
    [0, 0.1295, 0.171],
  );
  for (const side of [-1, 1]) {
    for (let k = 0; k < 10; k++)
      upper.box(
        inset,
        [0.0007, 0.019, 0.0015],
        [side * 0.02405, 0.153, -0.095 + k * 0.0058],
        [0.14, 0, 0],
      );
    for (let k = 0; k < 5; k++)
      upper.box(
        frame,
        [0.0006, 0.012, 0.0011],
        [side * 0.02405, 0.153, 0.111 + k * 0.006],
        [0.14, 0, 0],
      );
    upper.line(
      frame,
      [
        [side * 0.0241, 0.14, -0.102],
        [side * 0.0241, 0.14, 0.163],
      ],
      0.00065,
    );
    upper.bolt(frame, 0.0022, [side * 0.0242, 0.162, -0.025], [side, 0, 0]);
  }
  for (let k = 0; k < 5; k++)
    body.box(inset, [0.031, 0.0022, 0.003], [0, 0.1125, 0.07 + k * 0.014]);
  upper.box(frame, [0.032, 0.0024, 0.009], [0, 0.175, -0.077]);
  for (const side of [-1, 1]) {
    upper.box(inset, [0.01, 0.0055, 0.008], [side * 0.011, 0.177, -0.077]);
    upper.bolt(steel, 0.0009, [side * 0.01, 0.177, -0.0812], [0, 0, -1]);
  }
  upper.box(frame, [0.004, 0.006, 0.015], [0, 0.175, 0.139]);
  upper.box(accent, [0.002, 0.0011, 0.009], [0, 0.1782, 0.138]);
  profile(
    body,
    frame,
    [
      [-0.104, 0.134],
      [-0.119, 0.14],
      [-0.123, 0.155],
      [-0.115, 0.159],
      [-0.106, 0.15],
    ],
    0.012,
    0,
    0.0008,
  );
  for (let k = 0; k < 4; k++)
    body.box(inset, [0.013, 0.0008, 0.001], [0, 0.157, -0.12 + k * 0.002]);
  body.box(accent, [0.001, 0.0018, 0.0045], [-0.0244, 0.133, -0.077]);
  body.finish();
  upper.finish();
  gripDetails.finish();
  magazineDetails.finish();
  for (const mesh of [...gripGroup.children]) {
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const t = THREE.MathUtils.smoothstep(position.getY(i), 0.101, 0.12);
      const depth = THREE.MathUtils.lerp(0.82, 1, t);
      position.setZ(i, -0.055 + (position.getZ(i) + 0.055) * depth);
    }
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    root.add(mesh);
  }
  root.remove(gripGroup);
  consolidateDetails(THREE, root);
  consolidateDetails(THREE, slide);
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.scale(proportions.x, proportions.y, proportions.z);
    node.geometry.computeBoundingBox();
    node.geometry.computeBoundingSphere();
    node.castShadow = node.receiveShadow = true;
  });
  const point = (x, y, z) =>
    new THREE.Vector3(x, y, z).multiply(proportions).toArray();
  const magazineCenter = new THREE.Vector3(...point(0, 0.056, -0.079));
  for (const mesh of magazine.children)
    mesh.geometry.translate(
      -magazineCenter.x,
      -magazineCenter.y,
      -magazineCenter.z,
    );
  magazine.position.copy(magazineCenter);
  root.userData.parts = { slide, magazine };
  root.userData.magazineSeat = magazineCenter.toArray();
  root.userData.magazineAxis = new THREE.Vector3(0, -1, -0.24)
    .normalize()
    .toArray();
  root.userData.grip = point(0, 0.093 * 0.74, -0.055);
  root.userData.gripSurface = {
    left: point(0.0237, 0.093 * 0.74, -0.087),
    right: point(-0.0237, 0.093 * 0.74, -0.087),
  };
  root.userData.muzzle = point(0, boreY, 0.179);
  root.userData.holsterScale = proportions.toArray();
  root.userData.recoilTravel = 0.021 * proportions.z;
  root.userData.description =
    "A compact field sidearm with a slim graphite slide, open bore and ejection port, fitted grip panels and articulated recoil.";
  return root;
}
