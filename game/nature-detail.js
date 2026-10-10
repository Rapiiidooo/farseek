const wave = (x, y, z) =>
  Math.sin(x * 3.17 + Math.sin(z * 2.31)) * Math.cos(y * 4.13 - z * 1.73);

export function mergeNature(THREE, root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(),
    bins = new Map();
  const meshes = [];
  root.traverse((node) => {
    if (node.isMesh) meshes.push(node);
  });
  for (const mesh of meshes) {
    if (Array.isArray(mesh.material)) continue;
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    if (!bins.has(mesh.material)) bins.set(mesh.material, []);
    bins.get(mesh.material).push({ mesh, geometry });
  }
  for (const [material, items] of bins) {
    if (items.length < 2) {
      items[0].geometry.dispose();
      continue;
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, size] of [
      ["position", 3],
      ["normal", 3],
      ["uv", 2],
      ["color", 3],
    ]) {
      const count = items.reduce(
        (sum, { geometry: g }) => sum + g.attributes.position.count,
        0,
      );
      const array = new Float32Array(count * size);
      let offset = 0;
      for (const { geometry: g } of items) {
        const attribute = g.getAttribute(name),
          length = g.attributes.position.count * size;
        if (attribute) array.set(attribute.array, offset);
        else if (name === "color") array.fill(1, offset, offset + length);
        offset += length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    const merged = new THREE.Mesh(geometry, material);
    merged.name =
      items[0].mesh.name ||
      `${root.name || "Nature"} ${material.name || "surface"}`;
    root.add(merged);
    for (const { mesh, geometry: g } of items) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      g.dispose();
    }
  }
}

export function canopyLeaves(THREE, radius, height, seed, count = 10, source) {
  const positions = [],
    uv = [],
    candidates = [];
  const original = source.attributes.position;
  for (let i = 0; i < original.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(original, i);
    if (
      p.y > -height * 0.3 &&
      p.y < height * 0.7 &&
      Math.hypot(p.x, p.z) > radius * 0.6
    )
      candidates.push(p);
  }
  for (let i = 0; i < count; i++) {
    const center =
      candidates[(i * 17 + Math.floor(seed * 7)) % candidates.length].clone();
    const normal = new THREE.Vector3(
      center.x / radius,
      center.y / height + 0.4,
      center.z / radius,
    ).normalize();
    const side = new THREE.Vector3(center.z, 0, -center.x).normalize();
    const along = new THREE.Vector3().crossVectors(side, normal).normalize();
    const length = radius * (0.29 + 0.045 * Math.sin(i * 4.7 + seed)),
      width = length * 0.18;
    center.addScaledVector(normal, length * 0.035);
    const base = center.clone().addScaledVector(along, -length * 0.48);
    const tip = center
      .clone()
      .addScaledVector(along, length * 0.52)
      .addScaledVector(normal, -length * 0.025);
    const mid = center.clone().addScaledVector(normal, length * 0.08);
    const outline = [
      base,
      center
        .clone()
        .addScaledVector(along, -length * 0.2)
        .addScaledVector(side, -width),
      center
        .clone()
        .addScaledVector(along, length * 0.16)
        .addScaledVector(side, -width * 0.8),
      tip,
      center
        .clone()
        .addScaledVector(along, length * 0.16)
        .addScaledVector(side, width * 0.8),
      center
        .clone()
        .addScaledVector(along, -length * 0.2)
        .addScaledVector(side, width),
    ];
    for (let j = 0; j < outline.length; j++) {
      for (const p of [outline[j], outline[(j + 1) % outline.length], mid])
        positions.push(...p.toArray());
      uv.push(0, 0, 1, 0, 0.5, 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function reliefTexture(THREE, kind, size = 128) {
  const data = new Uint8Array(size * size * 4),
    turn = Math.PI * 2;
  const height = (u, v) =>
    0.5 +
    0.5 *
      Math.sin(
        u * turn * 13 +
          Math.sin(v * turn * 7) * 1.8 +
          Math.sin(u * turn * 3 + v * turn * 4),
      );
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        i = (y * size + x) * 4;
      if (kind === "coral") {
        const dx = (height(u + 1 / size, v) - height(u - 1 / size, v)) * 2.1;
        const dy = (height(u, v + 1 / size) - height(u, v - 1 / size)) * 2.1;
        const length = Math.hypot(dx, dy, 1);
        data.set(
          [
            ((-dx / length) * 0.5 + 0.5) * 255,
            ((-dy / length) * 0.5 + 0.5) * 255,
            ((1 / length) * 0.5 + 0.5) * 255,
            255,
          ],
          i,
        );
      } else {
        const rib =
          0.25 +
          0.75 *
            (0.5 + 0.5 * Math.cos(u * turn * 5 + Math.sin(v * turn) * 0.4)) **
              1.8;
        data.set([255 * rib, 255 * rib, 255 * rib, 255], i);
      }
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function refineNature(THREE, root, kind) {
  root.updateMatrixWorld(true);
  const whole = new THREE.Box3().setFromObject(root),
    size = whole.getSize(new THREE.Vector3());
  const extent = Math.max(...size.toArray()),
    point = new THREE.Vector3(),
    local = new THREE.Vector3();
  const frost = [
    "ice_spire",
    "icicle_cluster",
    "frozen_falls",
    "snow_pine",
    "frost_cairn",
  ].includes(kind);
  root.traverse((mesh) => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const geometry = mesh.geometry,
      position = geometry.attributes.position,
      material = mesh.material;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox.clone(),
      localSize = bounds.getSize(new THREE.Vector3());
    const stone = material.name === "stone",
      wood = material.name === "timber",
      leaf = material.name === "foliage";
    const ice =
      frost &&
      !stone &&
      !wood &&
      !leaf &&
      material.color.b > material.color.r * 0.95;
    const snow = ice && material.roughness > 0.7;
    const color = new Float32Array(position.count * 3),
      frequency =
        kind === "giant_tree"
          ? 0.8
          : kind === "wild_tree"
            ? 2.4
            : 10 / Math.max(0.6, extent);
    const relief =
      stone && kind !== "floating_isle" && material.roughness > 0.5;
    for (let i = 0; i < position.count; i++) {
      local.fromBufferAttribute(position, i);
      point.copy(local).applyMatrix4(mesh.matrixWorld);
      const x = point.x * frequency,
        y = point.y * frequency,
        z = point.z * frequency;
      const noise = wave(x, y, z),
        fine = wave(x * 3.1 + 3, y * 2.3, z * 3.1);
      let r = 1,
        g = 1,
        b = 1;
      if (stone) {
        const strata = Math.sin(y * 6.5 + Math.sin(x * 1.7 + z) * 0.8),
          vein = Math.pow(
            Math.max(0, Math.cos(y * 2.8 + x * 0.8 + z * 1.3)),
            14,
          );
        const v =
          0.77 + 0.1 * noise + 0.06 * fine + 0.075 * strata + 0.11 * vein;
        r = v * (1 + 0.05 * strata);
        g = v;
        b = v * (1 - 0.055 * strata);
      } else if (wood) {
        const grain = Math.sin(x * 19 + z * 17 + Math.sin(y * 0.65) * 2),
          v = 0.73 + 0.13 * grain + 0.085 * noise;
        r = v * 1.04;
        g = v;
        b = v * 0.91;
      } else if (leaf) {
        const h = (point.y - whole.min.y) / (size.y || 1),
          v = 0.68 + 0.22 * h + 0.12 * noise + 0.06 * fine;
        r = v * (0.93 + 0.07 * Math.sin(x + z));
        g = v;
        b = v * 0.87;
        if (kind === "desert_agave") {
          const ridge = Math.pow(Math.abs(Math.sin(x * 3 + z * 2)), 7);
          r += ridge * 0.13;
          g += ridge * 0.16;
          b += ridge * 0.14;
        }
        if (kind === "meadow_grass") {
          const uv = geometry.attributes.uv;
          const blade = uv ? Math.sin(uv.getX(i) * 37) : noise;
          r = v * (0.96 + 0.11 * blade);
          g = v;
          b = v * 0.78;
        }
      } else if (ice) {
        const rib = Math.pow(
            Math.abs(Math.sin(x * 5 + z * 4 + Math.sin(y * 0.8))),
            5,
          ),
          v = (snow ? 0.91 : 0.72) + 0.06 * noise + (snow ? 0.025 : 0.19) * rib;
        r = v * (snow ? 1 : 0.92);
        g = v;
        b = Math.min(1, v * 1.06);
      } else if (kind === "glow_mushroom") {
        const v = 0.81 + 0.12 * noise + 0.055 * fine;
        r = v;
        g = v * 0.98;
        b = v * 0.93;
      } else if (kind === "sea_coral") {
        const v = 0.75 + 0.12 * noise + 0.09 * fine;
        r = v;
        g = v * 0.96;
        b = v * 0.92;
      } else {
        const v = 0.91 + 0.065 * noise;
        r = g = b = v;
      }
      color.set(
        [Math.max(0.35, r), Math.max(0.35, g), Math.max(0.35, b)],
        i * 3,
      );
      if (relief) {
        const edge = Math.min(
          local.x - bounds.min.x,
          bounds.max.x - local.x,
          local.y - bounds.min.y,
          bounds.max.y - local.y,
          local.z - bounds.min.z,
          bounds.max.z - local.z,
        );
        const depth =
          Math.min(
            Math.max(0, edge) * 0.12,
            Math.min(...localSize.toArray()) * 0.018,
          ) *
          (noise * 0.65 + fine * 0.35);
        local.addScaledVector(
          point.set(local.x, 0, local.z).normalize(),
          depth,
        );
        local.clamp(bounds.min, bounds.max);
        position.setXYZ(i, local.x, local.y, local.z);
      }
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
    material.vertexColors = true;
    if (kind === "sea_coral" && !material.normalMap) {
      material.normalMap = reliefTexture(THREE, "coral");
      material.normalScale = new THREE.Vector2(0.8, 0.8);
    }
    if (
      kind === "lumen_plant" &&
      material.transparent &&
      !material.emissiveMap
    ) {
      material.emissiveMap = reliefTexture(THREE, "lumen", 64);
      material.emissiveIntensity *= 0.65;
    }
    if (relief) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
  if (
    [
      "basalt_spire",
      "boulder_cluster",
      "ice_spire",
      "frost_cairn",
      "frozen_falls",
      "sea_kelp",
      "sea_coral",
    ].includes(kind)
  )
    mergeNature(THREE, root);
  root.userData.natureDetail = { revision: 2, kind };
  return root;
}
