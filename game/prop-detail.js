export function detailBatch(THREE, parent) {
  const buckets = new Map();
  const vector = (point) => new THREE.Vector3(...point);
  const add = (material, geometry, point = [0, 0, 0], rotation = [0, 0, 0]) => {
    geometry.applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)),
    );
    geometry.translate(...point);
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geometry);
  };
  const box = (material, size, point, rotation) =>
    add(material, new THREE.BoxGeometry(...size), point, rotation);
  const ring = (
    material,
    radius,
    thickness,
    point,
    rotation = [Math.PI / 2, 0, 0],
    arc = Math.PI * 2,
  ) =>
    add(
      material,
      new THREE.TorusGeometry(
        radius,
        thickness,
        4,
        Math.max(12, Math.ceil((32 * arc) / (Math.PI * 2))),
        arc,
      ),
      point,
      rotation,
    );
  const line = (material, points, radius, sides = 4, caps = true) => {
    for (let i = 1; i < points.length; i++) {
      const a = vector(points[i - 1]),
        b = vector(points[i]),
        delta = b.clone().sub(a);
      if (delta.lengthSq() < 1e-12) continue;
      const geometry = new THREE.CylinderGeometry(
        radius,
        radius,
        delta.length(),
        sides,
        1,
        !caps,
      );
      geometry.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          delta.normalize(),
        ),
      );
      add(material, geometry, a.add(b).multiplyScalar(0.5).toArray());
    }
  };
  const bolt = (material, radius, point, normal = [0, 1, 0]) => {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.76,
      radius,
      radius * 0.5,
      6,
    );
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        vector(normal).normalize(),
      ),
    );
    add(material, geometry, point);
  };
  const finish = () => {
    for (const [material, additions] of buckets) {
      const target = parent.children.find(
        (node) =>
          node.isMesh &&
          !node.isInstancedMesh &&
          !node.isSkinnedMesh &&
          node.material === material &&
          !Object.keys(node.geometry.morphAttributes).length,
      );
      const sources = [];
      if (target) {
        target.updateMatrix();
        const inverse = target.matrix.clone().invert();
        sources.push(target.geometry.clone());
        for (const geometry of additions) geometry.applyMatrix4(inverse);
      }
      sources.push(...additions);
      const geometry = joinGeometry(THREE, sources);
      if (target) target.geometry = geometry;
      else parent.add(new THREE.Mesh(geometry, material));
      for (const source of sources) source.dispose();
    }
    buckets.clear();
  };
  return { add, box, ring, line, bolt, finish };
}

function joinGeometry(THREE, geometries) {
  const sources = geometries.map((geometry) =>
    geometry.index ? geometry.toNonIndexed() : geometry,
  );
  const names = new Set(
    sources.flatMap((geometry) => Object.keys(geometry.attributes)),
  );
  const count = sources.reduce(
    (sum, geometry) => sum + geometry.attributes.position.count,
    0,
  );
  const result = new THREE.BufferGeometry();
  for (const name of names) {
    const sample = sources.find((geometry) => geometry.attributes[name])
      .attributes[name];
    const values = new Float32Array(count * sample.itemSize);
    let offset = 0;
    for (const source of sources) {
      const length = source.attributes.position.count * sample.itemSize;
      const attribute = source.attributes[name];
      if (attribute) values.set(attribute.array, offset);
      else if (name === "color") values.fill(1, offset, offset + length);
      offset += length;
    }
    result.setAttribute(
      name,
      new THREE.BufferAttribute(values, sample.itemSize),
    );
  }
  result.computeBoundingBox();
  result.computeBoundingSphere();
  for (let i = 0; i < sources.length; i++)
    if (sources[i] !== geometries[i]) sources[i].dispose();
  return result;
}

export function consolidateDetails(THREE, parent) {
  const buckets = new Map();
  for (const mesh of [...parent.children]) {
    if (
      !mesh.isMesh ||
      mesh.isInstancedMesh ||
      mesh.isSkinnedMesh ||
      mesh.name ||
      Object.keys(mesh.geometry.morphAttributes).length
    )
      continue;
    if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
    buckets.get(mesh.material).push(mesh);
  }
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const sources = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const merged = new THREE.Mesh(joinGeometry(THREE, sources), material);
    merged.castShadow = meshes.some((mesh) => mesh.castShadow);
    merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
    parent.add(merged);
    for (const mesh of meshes) parent.remove(mesh);
    for (const geometry of sources) geometry.dispose();
  }
}

export function surfaceVeins(THREE, parent, material, strokes, radius = 0.003) {
  parent.updateMatrixWorld(true);
  const solids = [];
  parent.traverse((node) => {
    if (node.isMesh) solids.push(node);
  });
  const inverse = parent.matrixWorld.clone().invert();
  const ray = new THREE.Raycaster();
  const batch = detailBatch(THREE, parent);
  for (const stroke of strokes) {
    let points = [];
    for (const [x, y] of stroke) {
      const origin = new THREE.Vector3(x, y, 8).applyMatrix4(
        parent.matrixWorld,
      );
      const direction = new THREE.Vector3(0, 0, -1).transformDirection(
        parent.matrixWorld,
      );
      ray.set(origin, direction);
      const hit = ray.intersectObjects(solids, false)[0];
      if (!hit) {
        batch.line(material, points, radius);
        points = [];
        continue;
      }
      const point = hit.point.clone().applyMatrix4(inverse);
      point.z += radius * 0.4;
      if (points.length && Math.abs(point.z - points.at(-1)[2]) > 0.12) {
        batch.line(material, points, radius);
        points = [];
      }
      points.push(point.toArray());
    }
    batch.line(material, points, radius);
  }
  batch.finish();
}
