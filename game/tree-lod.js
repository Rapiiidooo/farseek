import * as THREE from "three";

// Distance levels for the Wildwood's tree batches. A depth band whose nearest tree is far from the
// camera draws simplified trunks and canopy lobes; leaf cards stay whole, so the canopy keeps its
// cover. Levels switch per band with hysteresis and keep every material, so no program changes.
const NAME = "forest-wild_tree-instances";
const FAR = 115;
const NEAR = 100;
// Vertices merge within cells this fraction of a mesh's height, and only when their normals agree.
const CELL = 1 / 25;

function simplify(source) {
  const position = source.attributes.position,
    normal = source.attributes.normal,
    names = Object.keys(source.attributes),
    count = source.index ? source.index.count : position.count,
    vertexAt = (i) => (source.index ? source.index.getX(i) : i);
  source.computeBoundingBox();
  const size = source.boundingBox.getSize(new THREE.Vector3());
  const cell = Math.max(size.x, size.y, size.z) * CELL;
  const min = source.boundingBox.min;
  const cells = new Map(),
    sums = [],
    remap = new Int32Array(position.count).fill(-1);
  const n = new THREE.Vector3();
  for (let v = 0; v < position.count; v++) {
    n.fromBufferAttribute(normal, v);
    const facing =
      Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z)
        ? n.x > 0
          ? 0
          : 1
        : Math.abs(n.y) >= Math.abs(n.z)
          ? n.y > 0
            ? 2
            : 3
          : n.z > 0
            ? 4
            : 5;
    const key = [
      Math.floor((position.getX(v) - min.x) / cell),
      Math.floor((position.getY(v) - min.y) / cell),
      Math.floor((position.getZ(v) - min.z) / cell),
      facing,
    ].join();
    if (!cells.has(key)) {
      cells.set(key, sums.length);
      sums.push({ count: 0, first: v, values: {} });
    }
    const id = cells.get(key),
      sum = sums[id];
    remap[v] = id;
    sum.count++;
    for (const name of names) {
      if (name === "uv") continue;
      const attribute = source.attributes[name];
      const values = (sum.values[name] ??= new Float64Array(
        attribute.itemSize,
      ));
      for (let k = 0; k < attribute.itemSize; k++)
        values[k] += attribute.getComponent(v, k);
    }
  }
  const index = [];
  for (let i = 0; i < count; i += 3) {
    const a = remap[vertexAt(i)],
      b = remap[vertexAt(i + 1)],
      c = remap[vertexAt(i + 2)];
    if (a !== b && b !== c && a !== c) index.push(a, b, c);
  }
  const geometry = new THREE.BufferGeometry();
  for (const name of names) {
    const attribute = source.attributes[name],
      size = attribute.itemSize,
      array = new attribute.array.constructor(sums.length * size);
    sums.forEach((sum, id) => {
      for (let k = 0; k < size; k++)
        array[id * size + k] =
          name === "uv"
            ? attribute.getComponent(sum.first, k)
            : sum.values[name][k] / sum.count;
    });
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(array, size, attribute.normalized),
    );
  }
  // An averaged normal that nearly cancels takes its first vertex's, so no shading turns undefined.
  const normals = geometry.attributes.normal;
  for (let i = 0; i < normals.count; i++) {
    n.fromBufferAttribute(normals, i);
    if (n.length() < 0.5) n.fromBufferAttribute(normal, sums[i].first);
    n.normalize();
    normals.setXYZ(i, n.x, n.y, n.z);
  }
  geometry.setIndex(index);
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  return geometry;
}

function contentKey(geometry, cards) {
  let hash = cards ? 7 : 3;
  for (const attribute of Object.values(geometry.attributes)) {
    const array = attribute.array,
      words = new Uint32Array(
        array.buffer,
        array.byteOffset,
        array.byteLength >> 2,
      );
    for (let i = 0; i < words.length; i++)
      hash = Math.imul(hash ^ words[i], 0x01000193);
    hash = Math.imul(hash ^ array.length, 0x5bd1e995);
  }
  return `${geometry.attributes.position.count}:${hash >>> 0}`;
}

// Leaf cards come in crossed pairs of two-triangle quads; the far level keeps one of each pair.
function thinCards(source) {
  const count = source.attributes.position.count;
  if (source.index || count % 12) return null;
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize,
      array = new attribute.array.constructor((count / 2) * size);
    for (let pair = 0; pair < count / 12; pair++)
      array.set(
        attribute.array.subarray(pair * 12 * size, (pair * 12 + 6) * size),
        pair * 6 * size,
      );
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(array, size, attribute.normalized),
    );
  }
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  return geometry;
}

export class TreeLevels {
  constructor(bands, simplified) {
    this.bands = bands;
    this.simplified = simplified;
    this.eye = new THREE.Vector3();
    this.checked = -Infinity;
  }

  // Equal tree meshes from separate batches share one far level; work pauses between meshes.
  static async build(scene, yieldWork = async () => {}) {
    const groups = new Map(),
      simplified = new Map(),
      byContent = new Map();
    scene.traverse((node) => {
      if (!node.isInstancedMesh || node.name !== NAME) return;
      const spots = node.userData.spots;
      if (!groups.has(spots)) groups.set(spots, []);
      groups.get(spots).push(node);
    });
    if (!groups.size) return null;
    const bands = [];
    for (const [spots, meshes] of groups) {
      const levels = [];
      for (const mesh of meshes) {
        if (!simplified.has(mesh.geometry)) {
          const key = contentKey(
            mesh.geometry,
            mesh.material.userData.canopyLeaf,
          );
          if (!byContent.has(key)) {
            byContent.set(
              key,
              mesh.material.userData.canopyLeaf
                ? thinCards(mesh.geometry)
                : simplify(mesh.geometry),
            );
            await yieldWork();
          }
          simplified.set(mesh.geometry, byContent.get(key));
        }
        if (!simplified.get(mesh.geometry)) continue;
        levels.push({
          mesh,
          near: mesh.geometry,
          far: simplified.get(mesh.geometry),
        });
      }
      const matrix = new THREE.Matrix4(),
        trees = [];
      for (let i = 0; i < meshes[0].count; i++) {
        meshes[0].getMatrixAt(i, matrix);
        trees.push(new THREE.Vector3().setFromMatrixPosition(matrix));
      }
      bands.push({ spots, levels, trees, far: false });
    }
    return new TreeLevels(bands, simplified);
  }

  set(band, far) {
    band.far = far;
    for (const level of band.levels)
      level.mesh.geometry = far ? level.far : level.near;
  }

  // Bands switch to their far level beyond FAR metres and back within NEAR, measured to the nearest tree.
  update(camera) {
    const now = performance.now();
    if (
      now - this.checked < 250 &&
      this.eye.distanceToSquared(camera.position) < 4
    )
      return;
    this.checked = now;
    this.eye.copy(camera.position);
    for (const band of this.bands) {
      let nearest = Infinity;
      for (const tree of band.trees)
        nearest = Math.min(nearest, tree.distanceToSquared(this.eye));
      nearest = Math.sqrt(nearest);
      if (!band.far && nearest > FAR) this.set(band, true);
      else if (band.far && nearest < NEAR) this.set(band, false);
    }
  }

  // Runs `draw` with every band on its far level, so their buffers upload during preparation.
  async prepare(draw) {
    const states = this.bands.map((band) => band.far);
    try {
      for (const band of this.bands) this.set(band, true);
      await draw(this.bands.flatMap((band) => band.levels.map((l) => l.mesh)));
    } finally {
      this.bands.forEach((band, i) => this.set(band, states[i]));
    }
  }

  geometries() {
    return this.bands.flatMap((band) =>
      band.levels.flatMap((level) => [level.near, level.far]),
    );
  }

  telemetry() {
    return {
      bands: this.bands.length,
      far: this.bands.filter((band) => band.far).length,
      triangles: [...this.simplified].map(([near, far]) => [
        (near.index ? near.index.count : near.attributes.position.count) / 3,
        (far.index ? far.index.count : far.attributes.position.count) / 3,
      ]),
    };
  }
}
