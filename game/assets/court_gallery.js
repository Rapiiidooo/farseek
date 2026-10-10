export default function (THREE) {
  const root = new THREE.Group();
  root.userData.mounts = "back";
  const stone = (color) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.91 });
    m.name = "stone";
    return m;
  };
  const sand = stone(0xb57f4f),
    sun = stone(0xd4a373),
    bone = stone(0xe6d3ae),
    dark = stone(0x8a5433);
  let seed = 913;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const add = (geometry, material, point) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...point);
    root.add(mesh);
    return mesh;
  };
  const block = (material, width, height, depth, point, cut = 0.045) => {
    const b = Math.min(cut, width * 0.14, height * 0.18, depth * 0.2);
    const w = width / 2 - b,
      h = height / 2 - b;
    const outline = [
      [-w + b, -h],
      [w - b, -h],
      [w, -h + b],
      [w, h - b],
      [w - b, h],
      [-w + b, h],
      [-w, h - b],
      [-w, -h + b],
    ];
    const geometry = new THREE.ExtrudeGeometry(
      new THREE.Shape(outline.map((p) => new THREE.Vector2(...p))),
      {
        depth: depth - b * 2,
        bevelEnabled: true,
        bevelSize: b,
        bevelThickness: b,
        bevelSegments: 1,
        steps: 1,
      },
    );
    geometry.translate(0, 0, -depth / 2 + b);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      const wear = (0.5 + 0.5 * Math.sin(x * 11.3 + y * 8.7 + z * 6.4)) * 0.008;
      positions.setXYZ(i, x * (1 - wear), y * (1 - wear), z * (1 - wear));
    }
    geometry.computeVertexNormals();
    return add(geometry, material, point);
  };
  block(dark, 5.1, 0.26, 0.88, [0, 0.13, 0]);
  for (let row = 0; row < 8; row++) {
    let x = -2.38;
    const height = 0.6;
    while (x < 2.3) {
      const width = Math.min(2.38 - x, 0.82 + random() * 0.64);
      if (width < 0.07) break;
      block(
        row < 2 ? dark : sand,
        width - 0.014,
        height - 0.018,
        0.19,
        [x + width / 2, 0.26 + (row + 0.5) * height, -0.265],
        0.018,
      );
      x += width;
    }
  }
  for (const sign of [-1, 1]) {
    block(bone, 1.13, 0.29, 0.81, [sign * 1.92, 0.41, 0.04]);
    const rows = sign < 0 ? 8 : 5;
    for (let row = 0; row < rows; row++) {
      const y = 0.57 + (row + 0.5) * 0.52;
      block(
        row % 4 === 3 ? sun : sand,
        0.73 + random() * 0.08,
        0.502,
        0.55 + random() * 0.04,
        [sign * (1.92 + Math.sin(row * 2.2) * 0.022), y, 0.105],
      );
      if (row < rows - 1) {
        for (const edge of [-1, 1])
          block(
            dark,
            0.018,
            0.42,
            0.027,
            [sign * 1.92 + edge * 0.15, y, 0.416],
            0.004,
          );
      }
    }
    block(sign < 0 ? bone : sand, 1.08, 0.25, 0.67, [
      sign * 1.92,
      0.57 + rows * 0.52 + 0.105,
      0.1,
    ]);
  }
  // The stepped crown rests on courses that end where it broke off.
  for (let step = 0; step < 4; step++) {
    block(step === 3 ? bone : sun, 0.87, 0.28, 0.74, [
      -1.74 + step * 0.28,
      5.13 + step * 0.29,
      0.015,
    ]);
    if (step < 3) {
      const low = step ? 4.99 + step * 0.29 : 5.065;
      block(sand, 0.82 - step * 0.28, 5.27 + step * 0.29 - low, 0.74, [
        -0.88 + step * 0.14,
        (low + 5.27 + step * 0.29) / 2,
        0.015,
      ]);
    }
  }
  const fractured = block(sand, 0.85, 0.3, 0.59, [1.28, 3.44, 0.1]);
  fractured.rotation.z = 0.12;
  for (let row = 0; row < 3; row++)
    block(
      bone,
      3.15 - row * 0.25,
      0.075,
      0.035,
      [-0.05, 1.03 + row * 0.13, -0.1725],
      0.008,
    );
  const disc = add(
    new THREE.CylinderGeometry(0.37, 0.41, 0.11, 24),
    dark,
    [-0.14, 3.12, -0.125],
  );
  disc.rotation.x = Math.PI / 2;
  const moon = new THREE.Shape();
  moon.absarc(0, 0, 0.3, Math.PI * 0.3, Math.PI * 1.7, false);
  moon.absarc(0.102, 0, 0.222, Math.PI * 1.62, Math.PI * 0.38, true);
  const crescent = add(
    new THREE.ExtrudeGeometry(moon, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSize: 0.01,
      bevelThickness: 0.01,
      bevelSegments: 1,
      curveSegments: 10,
    }),
    bone,
    [-0.14, 3.12, -0.065],
  );
  crescent.rotation.z = -0.61;
  const bounds = new THREE.Box3().setFromObject(root),
    center = bounds.getCenter(new THREE.Vector3());
  for (const node of root.children) {
    node.position.x -= center.x;
    node.position.y -= bounds.min.y;
    node.position.z -= center.z;
  }
  root.userData.gallery = { revision: 1, width: 5.1, backMounted: true };
  return root;
}
