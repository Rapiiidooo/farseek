export function canopyBranches(
  THREE,
  radius,
  height,
  seed,
  source,
  variant = "B",
) {
  const vertices = source.attributes.position,
    index = source.index,
    faces = [],
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < (index?.count ?? vertices.count); i += 3) {
    const ids = [0, 1, 2].map(
      (offset) => index?.getX(i + offset) ?? i + offset,
    );
    a.fromBufferAttribute(vertices, ids[0]);
    b.fromBufferAttribute(vertices, ids[1]);
    c.fromBufferAttribute(vertices, ids[2]);
    const weight = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    if (weight < 1e-7) continue;
    area += weight;
    faces.push({ a: a.clone(), b: b.clone(), c: c.clone(), area });
  }
  const count = Math.round(
      (variant === "A" ? 64 : variant === "B" ? 96 : 72) *
        (radius > 4 ? 1.8 : 1),
    ),
    positions = [],
    normals = [],
    uv = [],
    up = new THREE.Vector3(0, 1, 0),
    point = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    side = new THREE.Vector3(),
    along = new THREE.Vector3(),
    frame = new THREE.Matrix4(),
    roll = new THREE.Matrix4();
  const fraction = (value) => value - Math.floor(value);
  for (let i = 0; i < count; i++) {
    const target = ((i + 0.5) / count) * area,
      face = faces.find((candidate) => candidate.area >= target),
      u = Math.sqrt(fraction(i * 0.61803398875 + seed * 0.173 + 0.11)),
      v = fraction(i * 0.41421356237 + seed * 0.29 + 0.31);
    point.copy(face.a).multiplyScalar(1 - u);
    point.addScaledVector(face.b, u * (1 - v)).addScaledVector(face.c, u * v);
    normal
      .set(point.x / radius, point.y / height + 0.16, point.z / radius)
      .normalize();
    point.addScaledVector(normal, radius * 0.018);
    side.crossVectors(up, normal);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    along.crossVectors(normal, side).normalize();
    frame.makeBasis(side, along, normal).setPosition(point);
    const size =
      Math.min(2.15, Math.max(0.8, radius * 0.46)) *
      (0.8 + fraction(i * 0.73 + seed) * 0.35);
    for (let crossed = 0; crossed < (variant === "C" ? 2 : 1); crossed++) {
      const card = new THREE.PlaneGeometry(
          size,
          size,
          variant === "B" ? 2 : 1,
          1,
        ),
        p = card.attributes.position;
      if (variant === "B")
        for (let j = 0; j < p.count; j++)
          p.setZ(j, size * 0.13 * (1 - ((p.getX(j) * 2) / size) ** 2));
      card.computeVertexNormals();
      roll.makeRotationZ(Math.sin(i * 7.1 + seed) * 1.2);
      if (crossed) roll.multiply(new THREE.Matrix4().makeRotationY(1.15));
      card.applyMatrix4(frame.clone().multiply(roll));
      const expanded = card.toNonIndexed();
      positions.push(...expanded.attributes.position.array);
      normals.push(...expanded.attributes.normal.array);
      uv.push(...expanded.attributes.uv.array);
      expanded.dispose();
      card.dispose();
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
