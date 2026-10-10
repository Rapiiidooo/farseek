export function propDetails(THREE, root) {
  const vector = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p));
  const add = (geometry, material, parent = root) => {
    const mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
    return mesh;
  };
  const line = (points, material, radius = 0.003, parent = root) =>
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map(vector)),
        Math.max(3, points.length * 2),
        radius,
        3,
        false,
      ),
      material,
      parent,
    );
  const pin = (at, material, radius = 0.01, parent = root) =>
    add(
      new THREE.SphereGeometry(radius, 6, 4)
        .scale(1, 1, 0.45)
        .translate(...vector(at).toArray()),
      material,
      parent,
    );
  const batch = () => {
    root.updateMatrixWorld(true);
    const protectedNodes = new Set([root]);
    for (const section of ["joints", "parts"])
      for (const node of Object.values(root.userData[section] || {}))
        if (node?.isObject3D) protectedNodes.add(node);
    root.traverse((node) => {
      if (node.name) protectedNodes.add(node);
    });
    const groups = new Map(),
      originals = [],
      disposed = new Set();
    root.traverse((node) => {
      if (!node.isMesh || protectedNodes.has(node)) return;
      let owner = node.parent;
      while (owner && !protectedNodes.has(owner)) owner = owner.parent;
      if (!groups.has(owner)) groups.set(owner, new Map());
      const buckets = groups.get(owner);
      if (!buckets.has(node.material)) buckets.set(node.material, []);
      const geo = node.geometry.index
        ? node.geometry.toNonIndexed()
        : node.geometry.clone();
      geo.applyMatrix4(
        new THREE.Matrix4()
          .copy(owner.matrixWorld)
          .invert()
          .multiply(node.matrixWorld),
      );
      buckets.get(node.material).push(geo);
      originals.push(node);
      disposed.add(node.geometry);
    });
    for (const node of originals) node.removeFromParent();
    for (const geo of disposed) geo.dispose();
    for (const [owner, buckets] of groups)
      for (const [material, geos] of buckets) {
        const count = geos.reduce(
            (sum, g) => sum + g.attributes.position.count,
            0,
          ),
          merged = new THREE.BufferGeometry();
        for (const [name, size] of [
          ["position", 3],
          ["normal", 3],
          ["uv", 2],
        ]) {
          const data = new Float32Array(count * size);
          let offset = 0;
          for (const geo of geos) {
            const attribute = geo.attributes[name];
            if (attribute) data.set(attribute.array, offset);
            offset += geo.attributes.position.count * size;
          }
          merged.setAttribute(name, new THREE.BufferAttribute(data, size));
        }
        merged.computeBoundingBox();
        merged.computeBoundingSphere();
        add(merged, material, owner);
        for (const geo of geos) geo.dispose();
      }
    return root;
  };
  return { add, line, pin, batch };
}
