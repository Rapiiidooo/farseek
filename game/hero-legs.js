const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function attachRefinedLegs(THREE, model) {
  if (model.userData.appearance?.legs === "tailored") return model;
  const trousers = ["left", "right"].map((side) =>
    model.getObjectByName(side + "FieldTrousers"),
  );
  if (trousers.some((mesh) => !mesh?.isSkinnedMesh)) return model;
  const joints = model.userData.joints;
  const shift = joints.hips.position.clone().sub(new THREE.Vector3(0, 0.95, 0));
  const sections = [
    [0.3, 1, 1],
    [0.325, 1, 1],
    [0.365, 0.91, 0.94],
    [0.415, 0.94, 1],
    [0.47, 0.83, 0.93],
    [0.51, 0.8, 0.9],
    [0.58, 0.79, 0.9],
    [0.67, 0.86, 0.94],
    [0.745, 0.91, 0.98],
    [0.805, 1, 1],
  ];
  const section = (y, component) => {
    const index = sections.findIndex((row) => row[0] >= y);
    if (index < 0) return sections.at(-1)[component];
    if (index === 0) return sections[0][component];
    const a = sections[index - 1],
      b = sections[index];
    return THREE.MathUtils.lerp(
      a[component],
      b[component],
      smooth(a[0], b[0], y),
    );
  };
  const fit = (point, sign) => {
    point.sub(shift);
    const { x, y, z } = point;
    const join = smooth(0.745, 0.805, y);
    const knee = Math.exp(-(((y - 0.52) / 0.12) ** 2)) * smooth(0.325, 0.43, y);
    const hip = smooth(0.79, 0.87, y) * (1 - smooth(0.9, 0.99, y));
    const axis = sign * (0.1 - 0.004 * knee);
    const legX = axis + (x - sign * 0.1) * section(y, 1);
    const hipX = x * (1 + 0.055 * hip);
    const lowerZ = -0.004 + (z + 0.004) * section(y, 2);
    const back = 1 - smooth(-0.07, 0.01, z);
    const glute =
      Math.exp(-(((y - 0.885) / 0.088) ** 2)) *
      smooth(0.7, 0.79, y) *
      (1 - smooth(0.95, 0.99, y));
    const roundness =
      0.55 + 0.45 * Math.exp(-(((Math.abs(x) - 0.091) / 0.093) ** 2));
    const seat = -0.05 * glute * roundness * back;
    point.set(
      THREE.MathUtils.lerp(legX, hipX, join),
      y,
      THREE.MathUtils.lerp(lowerZ, z, join) + seat,
    );
    return point.add(shift);
  };
  model.updateMatrixWorld(true);
  const modelInverse = model.matrixWorld.clone().invert();
  const point = new THREE.Vector3();
  for (let side = 0; side < trousers.length; side++) {
    const sign = side === 0 ? 1 : -1;
    const name = side === 0 ? "left" : "right";
    const meshes = [
      trousers[side],
      ...joints[name + "UpperLeg"].children.filter((mesh) => mesh.isMesh),
    ];
    for (const mesh of meshes) {
      const geometry = mesh.geometry.clone();
      const positions = geometry.attributes.position;
      const toModel = modelInverse.clone().multiply(mesh.matrixWorld);
      const fromModel = toModel.clone().invert();
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(toModel);
        fit(point, sign).applyMatrix4(fromModel);
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    }
  }
  const seams = new Map();
  for (const mesh of trousers) {
    const positions = mesh.geometry.attributes.position;
    const normals = mesh.geometry.attributes.normal;
    for (let i = 0; i < positions.count; i++) {
      const key = [positions.getX(i), positions.getY(i), positions.getZ(i)]
        .map((value) => Math.round(value * 1e6))
        .join(":");
      if (!seams.has(key)) seams.set(key, []);
      seams.get(key).push([normals, i]);
    }
  }
  for (const seam of seams.values()) {
    if (seam.length < 2) continue;
    const normal = new THREE.Vector3();
    for (const [attribute, index] of seam)
      normal.add(point.fromBufferAttribute(attribute, index));
    normal.normalize();
    for (const [attribute, index] of seam)
      attribute.setXYZ(index, normal.x, normal.y, normal.z);
  }
  model.userData.appearance.legs = "tailored";
  return model;
}
