import { barkSurfaceReady } from "./bark-surface.js";
import { leafSurfaceReady } from "./leaf-surface.js";
import { mineralSurfaceReady } from "./mineral-surface.js";
import { ASSET } from "./assetlib.js";
import * as THREE from "three";
import { finishAsset } from "./asset-finish.js";
import { runtimeAsset } from "./asset-catalog.js";
import { prebuild, prebuiltModule } from "./offload.js";

// Import-free factories whose first build took over 25 ms on the main thread, in world order,
// none of them needed by the title's court; a worker builds them at startup and the loader
// rebuilds their trees from its buffers.
export const OFFLOADED_ASSETS = [
  "warden",
  "basalt_spire",
  "ruin_rings",
  "ruin_temple",
  "ice_casing",
  "frozen_falls",
  "ice_spire",
  "wild_tree",
  "giant_tree",
  "forest_boar",
  "forest_deer",
  "forest_bird",
  "manta_ray",
];

async function loadRuntimeAsset(url, options) {
  // ASSET converts failed imports into empty groups, hiding a network outage as missing geometry.
  await import(url);
  return ASSET((await prebuiltModule(url)) || url, options);
}

export class AssetStore {
  constructor(
    load = loadRuntimeAsset,
    yieldWork = () => {},
    onFailure = () => {},
  ) {
    this.load = load;
    this.yieldWork = yieldWork;
    this.onFailure = onFailure;
    this.available = new Map();
    this.pending = new Map();
    this.failures = new Map();
    this.failedErrors = new WeakSet();
    this.offload = load === loadRuntimeAsset;
  }

  // Worker builds start once the title's court is done, so they do not compete with it.
  prefetch() {
    if (!this.offload) return;
    this.offload = false;
    for (const name of OFFLOADED_ASSETS) prebuild(runtimeAsset(name).path);
  }

  // Downloads together the modules of assets a build then makes one after another, each
  // otherwise a round trip of its own; none runs before it is made, so builds keep their order.
  preload(names) {
    if (this.load !== loadRuntimeAsset) return;
    for (const name of new Set(names)) {
      const href = runtimeAsset(name).path;
      if (document.head.querySelector(`link[href="${href}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "modulepreload";
      link.href = href;
      document.head.append(link);
    }
  }

  has(name) {
    return this.available.get(name) === true;
  }

  async request(name, phase, options) {
    const asset = runtimeAsset(name);
    try {
      const model = await this.load(asset.path, options);
      this.failures.delete(name);
      return model;
    } catch (error) {
      const failure = {
        name,
        path: asset.path,
        phase,
        message: String(error?.message || error),
        stack: String(error?.stack || error),
      };
      if (error && typeof error === "object") this.failedErrors.add(error);
      this.failures.delete(name);
      this.failures.set(name, failure);
      if (this.failures.size > 16)
        this.failures.delete(this.failures.keys().next().value);
      try {
        this.onFailure(failure);
      } catch {}
      throw error;
    }
  }

  async probe(name) {
    const asset = runtimeAsset(name);
    if (this.available.has(name)) return this.has(name);
    if (!this.pending.has(name)) {
      const request = Promise.resolve().then(async () => {
        try {
          const model = await this.request(name, "probe", {
            keepHierarchy: asset.keepHierarchy,
            surfaces: false,
          });
          let meshes = 0;
          model.traverse((node) => node.isMesh && meshes++);
          this.available.set(name, meshes > 0);
        } finally {
          this.pending.delete(name);
        }
        return this.has(name);
      });
      this.pending.set(name, request);
    }
    return this.pending.get(name);
  }

  async make(name, options = {}) {
    await this.yieldWork();
    const asset = runtimeAsset(name);
    if (!(await this.probe(name))) return null;
    await this.yieldWork();
    const model = await this.request(name, "instantiate", {
      surfaces: !["twin_pistol", "forest_boar", "frost_lynx"].includes(
        asset.id,
      ),
      keepHierarchy: asset.keepHierarchy,
      ...options,
    });
    finishAsset(THREE, model, asset.id, {
      textures: asset.id === "hero_realistic" || options.surfaces !== false,
      mineral: options.mineral,
    });
    await Promise.all([
      barkSurfaceReady(model),
      leafSurfaceReady(model),
      mineralSurfaceReady(model),
    ]);
    return model;
  }
}
