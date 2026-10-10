import { refineNature } from "../nature-detail.js";

export default function (THREE) {
  const root = new THREE.Group();
  const material = (color, roughness) => {
    const value = new THREE.MeshStandardMaterial({
      color,
      roughness,
      vertexColors: true,
    });
    value.name = "stone";
    value.userData.boulderPaletteBase = 0xb57f4f;
    return value;
  };
  const materials = [
    material(0x8a5433, 0.95),
    material(0xb57f4f, 0.92),
    material(0xd4a373, 0.86),
  ];
  const stones = [
    {
      radii: [1.15, 0.95],
      height: 2.08,
      at: [-0.55, 0, -0.25],
      rotate: [0, 0.3, 0],
    },
    {
      radii: [0.88, 0.7],
      height: 1.55,
      at: [1.08, -0.12, 0.2],
      rotate: [0, -0.4, 0.2],
    },
    {
      radii: [0.58, 0.48],
      height: 0.95,
      at: [0.12, -0.1, 1.02],
      rotate: [-0.26, 0.8, 0],
    },
    ...[
      [-1.55, 0.55, 0.17],
      [1.75, -0.55, 0.14],
      [0.95, 1.2, 0.11],
      [-0.2, 1.25, 0.09],
    ].map(([x, z, radius], index) => ({
      radii: [radius * 1.2, radius],
      height: radius * 1.3,
      at: [x, -0.03, z],
      rotate: [
        Math.sin(index * 2.7) * 0.18,
        index * 1.7,
        Math.cos(index * 3.1) * 0.17,
      ],
      chip: true,
    })),
  ];
  const point = new THREE.Vector3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (const [index, stone] of stones.entries()) {
    const { chip = false } = stone;
    const source = new THREE.IcosahedronGeometry(1, chip ? 2 : 8);
    const positions = source.attributes.position,
      uv = source.attributes.uv,
      phase = 0.71 + index * 1.83;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      let x = positions.getX(vertex),
        y = positions.getY(vertex),
        z = positions.getZ(vertex);

      const level = (y + 0.55) / 1.55;
      const shoulder = Math.max(0, level - 0.5);
      x = Math.min(
        0.83 - shoulder * 0.64 - z * 0.12,
        Math.max(-0.86 + shoulder * 0.46, x),
      );
      z = Math.min(
        0.88 - shoulder * 0.35 + x * 0.13,
        Math.max(-0.8 + shoulder * 0.5 + x * 0.08, z),
      );
      const fracture = Math.max(
        0,
        x * 0.74 + z * 0.62 - (0.97 - shoulder * 0.23),
      );
      x -= fracture * 0.74;
      z -= fracture * 0.62;
      x += 0.018 * Math.sin(z * 9 + level * 8 + phase);
      z += 0.017 * Math.sin(x * 8 - level * 7 + phase);
      y = Math.min(level, 0.84 - x * 0.16 + z * 0.12);

      uv.setY(vertex, THREE.MathUtils.clamp(y, 0, 1));
      point.set(x * stone.radii[0], y * stone.height, z * stone.radii[1]);
      point.applyEuler(new THREE.Euler(...stone.rotate));
      point.add(new THREE.Vector3(...stone.at));
      positions.setXYZ(vertex, point.x, point.y, point.z);
    }
    const flat = source.index ? source.toNonIndexed() : source;
    const p = flat.attributes.position,
      t = flat.attributes.uv,
      out = [],
      tex = [];
    for (let i = 0; i < p.count; i += 3) {
      if (p.getY(i) < 0 && p.getY(i + 1) < 0 && p.getY(i + 2) < 0) continue;
      a.fromBufferAttribute(p, i);
      a.y = Math.max(0, a.y);
      b.fromBufferAttribute(p, i + 1);
      b.y = Math.max(0, b.y);
      c.fromBufferAttribute(p, i + 2);
      c.y = Math.max(0, c.y);
      if (
        new THREE.Vector3()
          .subVectors(b, a)
          .cross(new THREE.Vector3().subVectors(c, a))
          .lengthSq() < 1e-12
      )
        continue;
      for (const [offset, vertex] of [a, b, c].entries()) {
        out.push(...vertex.toArray());
        tex.push(t.getX(i + offset), t.getY(i + offset));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(tex, 2));
    geometry.computeVertexNormals();
    root.add(new THREE.Mesh(geometry, materials[1]));
    if (flat !== source) flat.dispose();
    source.dispose();
  }
  const bounds = new THREE.Box3().setFromObject(root),
    center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3()),
    scale = new THREE.Vector3(
      3.633284091949463 / size.x,
      2.2588582038879395 / size.y,
      2.740952491760254 / size.z,
    );
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      point.set(
        (point.x - center.x) * scale.x,
        (point.y - bounds.min.y) * scale.y,
        (point.z - center.z) * scale.z,
      );
      position.setXYZ(i, point.x, point.y, point.z);
    }
  });
  refineNature(THREE, root, "boulder_cluster");
  const mesh = root.children.find((child) => child.isMesh),
    geometry = mesh.geometry,
    position = geometry.attributes.position,
    normal = geometry.attributes.normal,
    uv = geometry.attributes.uv,
    color = geometry.attributes.color,
    neighbors = new Map(),
    keys = [];
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
    keys.push(key);
    if (!neighbors.has(key)) neighbors.set(key, []);
    neighbors.get(key).push(new THREE.Vector3().fromBufferAttribute(normal, i));
  }
  const limit = Math.cos(THREE.MathUtils.degToRad(55)),
    smooth = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    a.fromBufferAttribute(normal, i);
    b.set(0, 0, 0);
    for (const candidate of neighbors.get(keys[i]))
      if (a.dot(candidate) > limit) b.add(candidate);
    b.normalize();
    smooth.set(b.toArray(), i * 3);
  }
  const bins = materials.map(() => ({
      position: [],
      normal: [],
      uv: [],
      color: [],
    })),
    tone = new THREE.Color();
  for (let i = 0; i < position.count; i += 3) {
    const level = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3,
      batch = level < 0.17 ? 0 : level > 0.78 ? 2 : 1,
      bin = bins[batch],
      base = materials[batch].color;
    for (let k = i; k < i + 3; k++) {
      bin.position.push(position.getX(k), position.getY(k), position.getZ(k));
      bin.normal.push(...smooth.subarray(k * 3, k * 3 + 3));
      bin.uv.push(uv.getX(k), uv.getY(k));
      const t = uv.getY(k);
      tone
        .copy(materials[0].color)
        .lerp(materials[1].color, THREE.MathUtils.smoothstep(t, 0.02, 0.28));
      tone.lerp(materials[2].color, THREE.MathUtils.smoothstep(t, 0.64, 0.98));
      bin.color.push(
        (color.getX(k) * tone.r) / base.r,
        (color.getY(k) * tone.g) / base.g,
        (color.getZ(k) * tone.b) / base.b,
      );
    }
  }
  mesh.removeFromParent();
  geometry.dispose();
  for (const [index, bin] of bins.entries()) {
    if (!bin.position.length) continue;
    const geometry = new THREE.BufferGeometry();
    for (const [key, size] of [
      ["position", 3],
      ["normal", 3],
      ["uv", 2],
      ["color", 3],
    ])
      geometry.setAttribute(
        key,
        new THREE.Float32BufferAttribute(bin[key], size),
      );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    root.add(new THREE.Mesh(geometry, materials[index]));
  }
  return root;
}
