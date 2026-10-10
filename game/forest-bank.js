export function forestBankGeometry(THREE) {
  const source = new THREE.IcosahedronGeometry(1, 5);
  const position = source.attributes.position;
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    const v = (y + 1) / 2,
      angle = Math.atan2(z, x);
    const originalRadius = Math.hypot(x, z);
    const shoulder = Math.max(0, (v - 0.49) / 0.51);
    const radius =
      originalRadius < 1e-6
        ? 0
        : (0.96 + 0.035 * Math.sin(v * 7)) *
          Math.sqrt(Math.max(0.015, 1 - shoulder ** 2));

    const broad = 1 + 0.03 * Math.sin(angle * 4 + v * 9);
    x = Math.cos(angle) * radius * broad;
    z = Math.sin(angle) * radius * broad;
    const fractureShoulder = Math.max(0, v - 0.48);
    x = Math.min(
      1.03 - fractureShoulder * 0.85 - z * 0.12,
      Math.max(-1.02 + fractureShoulder * 0.55, x),
    );
    z = Math.min(
      1.04 - fractureShoulder * 0.5 + x * 0.06,
      Math.max(-1.02 + fractureShoulder * 0.7, z),
    );
    y = Math.max(0.025, Math.min(v, 0.86 - x * 0.19 + z * 0.1));

    position.setXYZ(i, x, y, z);
  }
  source.computeBoundingBox();
  const center = source.boundingBox.getCenter(new THREE.Vector3());
  const base = source.boundingBox.min.y;
  const height = source.boundingBox.max.y - base;
  let radius = 0;
  for (let i = 0; i < position.count; i++)
    radius = Math.max(
      radius,
      Math.hypot(position.getX(i) - center.x, position.getZ(i) - center.z),
    );
  for (let i = 0; i < position.count; i++)
    position.setXYZ(
      i,
      ((position.getX(i) - center.x) * 1.04) / radius,
      ((position.getY(i) - base) * 0.94) / height,
      ((position.getZ(i) - center.z) * 1.04) / radius,
    );
  const expanded = source.index ? source.toNonIndexed() : source;
  const p = expanded.attributes.position;
  const positions = [],
    normals = [],
    uvs = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (n.lengthSq() < 1e-14) continue;
    n.normalize();
    const nx = Math.abs(n.x),
      ny = Math.abs(n.y),
      nz = Math.abs(n.z);
    for (const point of [a, b, c]) {
      positions.push(...point.toArray());
      normals.push(...n.toArray());
      if (ny > nx && ny > nz)
        uvs.push((point.x * 2.65) / 2.4, (-point.z * 2.65) / 2.4);
      else if (nx > nz)
        uvs.push(
          (-point.z * (Math.sign(n.x) || 1) * 2.65) / 2.4,
          (point.y * 4.6) / 2.4,
        );
      else
        uvs.push(
          (point.x * (Math.sign(n.z) || 1) * 2.65) / 2.4,
          (point.y * 4.6) / 2.4,
        );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const joined = new Map(),
    normal = geometry.attributes.normal;
  const shaped = geometry.attributes.position;
  for (let i = 0; i < shaped.count; i++) {
    const key = [shaped.getX(i), shaped.getY(i), shaped.getZ(i)]
      .map((value) => Math.round(value * 1e5))
      .join(":");
    if (!joined.has(key)) joined.set(key, []);
    joined.get(key).push(i);
  }
  const original = normal.array.slice(),
    first = new THREE.Vector3();
  for (const indices of joined.values())
    for (const i of indices) {
      first.fromArray(original, i * 3);
      n.set(0, 0, 0);
      for (const j of indices) {
        a.fromArray(original, j * 3);
        if (first.dot(a) > 0.82) n.add(a);
      }
      n.normalize();
      normal.setXYZ(i, n.x, n.y, n.z);
    }
  if (expanded !== source) expanded.dispose();
  source.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
