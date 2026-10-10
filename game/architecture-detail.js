export function architectureDetail(THREE, root) {
  const add = (geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], parent = root) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  };
  const block = (material, position, size, bevel = 0.025, rotation = [0, 0, 0]) => {
    const [w, h, d] = size;
    if (!bevel) return add(new THREE.BoxGeometry(w, h, d), material, position, rotation);
    const b = Math.min(bevel, w * 0.2, h * 0.2, d * 0.2);
    const points = [[-w / 2 + b, -h / 2], [w / 2 - b, -h / 2], [w / 2, -h / 2 + b], [w / 2, h / 2 - b], [w / 2 - b, h / 2], [-w / 2 + b, h / 2], [-w / 2, h / 2 - b], [-w / 2, -h / 2 + b]];
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d - b * 2, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.4, bevelSegments: 1, steps: 1, curveSegments: 1 });
    geometry.translate(0, 0, -d / 2 + b);
    return add(geometry, material, position, rotation);
  };
  const line = (material, points, radius = 0.012, parent = root) => {
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]);
      const mesh = add(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 5), material, a.clone().add(b).multiplyScalar(0.5).toArray(), [0, 0, 0], parent);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    }
  };
  const ring = (material, radius, thickness, height, y, start = 0, span = Math.PI * 2, count = 32, center = [0, 0]) => {
    const profile = [[radius - thickness, -height / 2], [radius, -height / 2], [radius, height / 2], [radius - thickness, height / 2], [radius - thickness, -height / 2]];
    return add(new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(...p)), count, start, span), material, [center[0], y, center[1]]);
  };
  const panel = (material, x0, x1, y0, y1, z, width = 0.7, height = 0.4, depth = 0.035, rotation = 0) => {
    let row = 0;
    for (let y = y0; y < y1 - 0.04; y += height, row++) {
      const top = Math.min(y + height, y1);
      for (let x = x0 - (row % 2) * width / 2; x < x1 - 0.04; x += width) {
        const a = Math.max(x, x0), b = Math.min(x + width, x1);
        if (b - a < 0.08) continue;
        const mesh = block(material, [(a + b) / 2, (y + top) / 2, z], [b - a - 0.025, top - y - 0.022, depth], 0);
        if (rotation) {
          mesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
          mesh.rotation.y = rotation;
        }
      }
    }
  };
  const finish = () => {
    const declarations = new Set();
    for (const value of Object.values(root.userData)) {
      if (value?.isObject3D) declarations.add(value);
      else if (value && typeof value === "object")
        for (const node of Object.values(value)) if (node?.isObject3D) declarations.add(node);
    }
    const visit = (parent) => {
      for (const child of parent.children.slice()) if (!child.isMesh) visit(child);
      const buckets = new Map();
      for (const mesh of parent.children)
        if (mesh.isMesh && !mesh.name && !declarations.has(mesh) && !Array.isArray(mesh.material)) {
          const key = mesh.material.uuid;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(mesh);
        }
      for (const meshes of buckets.values()) {
        if (meshes.length < 2) continue;
        const records = meshes.map((mesh) => {
          mesh.updateMatrix();
          const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          geometry.applyMatrix4(mesh.matrix);
          if (!geometry.attributes.normal) geometry.computeVertexNormals();
          return geometry;
        });
        const count = records.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
        const geometry = new THREE.BufferGeometry();
        for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2]]) {
          const buffer = new Float32Array(count * size);
          let offset = 0;
          for (const record of records) {
            if (record.attributes[name]) buffer.set(record.attributes[name].array, offset * size);
            offset += record.attributes.position.count;
          }
          geometry.setAttribute(name, new THREE.BufferAttribute(buffer, size));
        }
        const merged = new THREE.Mesh(geometry, meshes[0].material);
        merged.castShadow = meshes.some((mesh) => mesh.castShadow);
        merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
        meshes.forEach((mesh) => parent.remove(mesh));
        records.forEach((record) => record.dispose());
        parent.add(merged);
      }
    };
    visit(root);
    return root;
  };
  return { add, block, line, ring, panel, finish };
}
