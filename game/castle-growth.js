import * as THREE from "three";

export function towerRadius(tower, y) {
  const radius = tower.radius;
  if (y < 3) return radius + 0.75 * (1 - Math.max(0, y) / 3);
  if (y < 8.4) return radius - (0.05 * (y - 3)) / 5.4;
  if (y <= 9) return radius + 0.18;
  return radius - 0.05 - (0.1 * (y - 9)) / (tower.height - 9.3);
}

export function growthPoint(tower, patch, x, y, z) {
  const height = patch.y + y * patch.scale;
  const angle = patch.angle + (x * patch.scale) / tower.radius;
  const radius = towerRadius(tower, height) + z * patch.scale + 0.092;
  return new THREE.Vector3(
    tower.x + Math.sin(angle) * radius,
    height,
    tower.z + Math.cos(angle) * radius,
  );
}

function windowAt(tower, point) {
  const angle = Math.atan2(point.x - tower.x, point.z - tower.z);
  return tower.windows.some((window) => {
    const gap = Math.abs(
      Math.atan2(
        Math.sin(angle - window.angle),
        Math.cos(angle - window.angle),
      ),
    );
    return (
      point.y > window.y - 0.2 &&
      point.y < window.y + window.height + 0.2 &&
      gap < (window.width / 2 + 0.2) / tower.radius
    );
  });
}

export async function installCastleGrowth(assets, castle) {
  const towers = castle?.userData.growthSurfaces?.towers;
  if (!towers?.length) return null;
  const vine = await assets.make("wall_vine", { keepHierarchy: true });
  if (!vine) return null;
  vine.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.name = "castle-wall-growth";
  const patches = towers.flatMap((tower, i) => [
    { tower: i, y: 0.12, angle: tower.outward + 0.36, scale: 0.88 + i * 0.025 },
    {
      tower: i,
      y: Math.min(7, tower.height - 7.5),
      angle: tower.outward - 0.38,
      scale: 0.85,
    },
  ]);
  const point = new THREE.Vector3();
  vine.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const source = mesh.geometry;
    const positions = source.attributes.position;
    const foliage = mesh.material.name === "foliage";
    const records = Object.fromEntries(
      ["position", "uv", "color"]
        .filter((name) => source.attributes[name])
        .map((name) => [name, []]),
    );
    const stride = foliage ? 36 : 3;
    for (const patch of patches) {
      const tower = towers[patch.tower];
      for (let start = 0; start < positions.count; start += stride) {
        const end = Math.min(start + stride, positions.count);
        const transformed = [];
        const center = new THREE.Vector3();
        for (let i = start; i < end; i++) {
          point
            .fromBufferAttribute(positions, i)
            .applyMatrix4(mesh.matrixWorld);
          const p = growthPoint(tower, patch, point.x, point.y, point.z);
          center.add(p);
          transformed.push(p);
        }
        center.multiplyScalar(1 / transformed.length);
        if (windowAt(tower, center)) continue;
        for (let i = start; i < end; i++) {
          records.position.push(...transformed[i - start].toArray());
          for (const name of Object.keys(records)) {
            if (name === "position") continue;
            const attribute = source.attributes[name];
            for (let channel = 0; channel < attribute.itemSize; channel++)
              records[name].push(
                attribute.array[i * attribute.itemSize + channel],
              );
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, values] of Object.entries(records))
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(
          values,
          source.attributes[name].itemSize,
        ),
      );
    geometry.computeVertexNormals();
    const merged = new THREE.Mesh(geometry, mesh.material);
    merged.name = foliage ? "castle-climbing-leaves" : "castle-climbing-stems";
    merged.receiveShadow = merged.castShadow = true;
    root.add(merged);
  });
  root.userData.growth = {
    revision: 1,
    patches: patches.length,
    towers: towers.length,
    clearance: 0.092,
    windows: "retained",
  };
  castle.add(root);
  return root;
}
