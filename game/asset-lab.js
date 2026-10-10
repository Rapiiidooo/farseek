import { barkSurfaceReady } from "./bark-surface.js";
import { leafSurfaceReady } from "./leaf-surface.js";
import { mineralSurfaceReady } from "./mineral-surface.js";
import * as THREE from "three";
import { applySurfaces } from "./surfaces.js";
import { finishAsset } from "./asset-finish.js";

export function describeAsset(model) {
  const bounds = new THREE.Box3().setFromObject(model);
  let meshes = 0,
    triangles = 0,
    vertices = 0;
  const materials = new Set();
  model.traverse((node) => {
    if (!node.isMesh) return;
    meshes++;
    const count = node.isInstancedMesh ? node.count : 1;
    vertices += node.geometry.attributes.position.count * count;
    triangles +=
      ((node.geometry.index?.count ?? node.geometry.attributes.position.count) /
        3) *
      count;
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      materials.add(material);
  });
  const parts = [];
  for (const section of ["joints", "parts", "secondary"])
    for (const [name, node] of Object.entries(model.userData[section] || {}))
      if (node?.isObject3D) parts.push({ name, section, node });
  return {
    bounds,
    size: bounds.getSize(new THREE.Vector3()),
    meshes,
    triangles,
    vertices,
    materials: materials.size,
    parts,
  };
}

export class AssetPreviewStore {
  constructor({ limit = 3, loadModule = (path) => import(path) } = {}) {
    this.limit = limit;
    this.loadModule = loadModule;
    this.cache = new Map();
    this.pending = new Map();
    this.active = null;
    this.generation = 0;
    this.disposed = { models: 0, geometries: 0, materials: 0, textures: 0 };
  }

  async load(entry, surfaces = true) {
    const key = `${entry.id}:${surfaces}`;
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const generation = this.generation;
    const pending = this.build(entry, surfaces)
      .then((value) => {
        if (generation !== this.generation) {
          this.dispose(value);
          return value;
        }
        this.cache.set(key, value);
        this.trim();
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === pending) this.pending.delete(key);
      });
    this.pending.set(key, pending);
    return pending;
  }

  async build(entry, surfaces) {
    const module = await this.loadModule(entry.path);
    const factory = module.default || module.build || module.create;
    if (typeof factory !== "function")
      throw new Error(`No asset factory: ${entry.id}`);
    const built = factory(THREE);
    if (!built?.isObject3D) throw new Error(`Invalid asset: ${entry.id}`);
    built.updateMatrixWorld(true);
    const info = describeAsset(built);
    if (
      !info.meshes ||
      info.bounds.isEmpty() ||
      !info.size.toArray().every(Number.isFinite)
    )
      throw new Error(`Empty asset: ${entry.id}`);
    const resources = {
      geometries: new Set(),
      materials: new Set(),
      textures: new Set(),
    };
    const collect = (ownTextures) =>
      built.traverse((node) => {
        if (node.geometry) resources.geometries.add(node.geometry);
        for (const material of node.material
          ? Array.isArray(node.material)
            ? node.material
            : [node.material]
          : []) {
          resources.materials.add(material);
          if (ownTextures)
            for (const value of Object.values(material))
              if (value?.isTexture && !value.userData.sharedAssetFinish)
                resources.textures.add(value);
        }
      });
    collect(true);
    if (
      surfaces &&
      !["twin_pistol", "forest_boar", "sea_coral"].includes(entry.id)
    )
      applySurfaces(THREE, built);
    finishAsset(THREE, built, entry.id, { textures: surfaces });
    await Promise.all([
      barkSurfaceReady(built),
      leafSurfaceReady(built),
      mineralSurfaceReady(built),
    ]);
    collect(false);
    const center = info.bounds.getCenter(new THREE.Vector3());
    built.position.add(
      new THREE.Vector3(-center.x, -info.bounds.min.y, -center.z),
    );
    const model = new THREE.Group();
    model.userData = { ...built.userData };
    model.add(built);
    model.traverse((node) => {
      if (node.isMesh) node.castShadow = node.receiveShadow = true;
    });
    model.updateMatrixWorld(true);
    return {
      key: `${entry.id}:${surfaces}`,
      entry,
      model,
      info: describeAsset(model),
      resources,
    };
  }

  trim() {
    for (const [key, preview] of this.cache) {
      if (this.cache.size <= this.limit) break;
      if (key === this.active) continue;
      this.dispose(preview);
      this.cache.delete(key);
    }
  }

  dispose(preview) {
    if (preview.disposed) return;
    preview.disposed = true;
    preview.model.removeFromParent();
    for (const [kind, resources] of Object.entries(preview.resources))
      for (const resource of resources) {
        resource.dispose();
        this.disposed[kind]++;
      }
    this.disposed.models++;
  }

  clear() {
    this.generation++;
    this.active = null;
    for (const preview of this.cache.values()) this.dispose(preview);
    this.cache.clear();
    this.pending.clear();
  }
}
