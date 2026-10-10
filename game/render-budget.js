import * as THREE from "three";
import { finishSteps } from "./work-steps.js";

export const RENDER_BUDGETS = {
  high: {
    samples: 4,
    bloom: true,
    bloomScale: 1,
    portalScale: 1,
    portalSamples: 2,
    portalInterval: 0,
    shadowSize: 2048,
    shadowDistance: Infinity,
  },
  balanced: {
    samples: 2,
    bloom: true,
    bloomScale: 0.7,
    portalScale: 0.7,
    portalSamples: 0,
    portalInterval: 1000 / 30,
    shadowSize: 1024,
    shadowDistance: 65,
  },
  fast: {
    samples: 0,
    bloom: false,
    bloomScale: 0.5,
    portalScale: 0.5,
    portalSamples: 0,
    portalInterval: 1000 / 20,
    shadowSize: 512,
    shadowDistance: 28,
  },
};

export function worldPortals(world) {
  return [
    ...new Set([
      world.gate,
      world.arrival,
      world.exitGate,
      world.ring,
      world.isles?.ring,
    ]),
  ].filter(
    (portal) =>
      portal?.target?.isRenderTarget && typeof portal.renderView === "function",
  );
}

export class RenderBudget {
  constructor(renderer, settings, rig) {
    Object.assign(this, { renderer, settings, rig });
    this.entries = new WeakMap();
    this.point = new THREE.Vector3();
  }

  register(world, id) {
    finishSteps(this.registerSteps(world, id));
  }

  // Bounding every shadow caster of a large world takes a while, so it pauses between casters.
  *registerSteps(world, id) {
    if (this.entries.has(world)) return;
    const casters = [],
      lights = [],
      meshes = [];
    world.scene.updateMatrixWorld(true);
    world.scene.traverse((node) => {
      if (node.isLight && node.castShadow)
        lights.push({ node, size: node.shadow.mapSize.clone() });
      if (!node.isMesh || !node.castShadow || node.isSkinnedMesh) return;
      for (let parent = node; parent; parent = parent.parent)
        if (parent.userData.joints) return;
      meshes.push(node);
    });
    for (const node of meshes) {
      const bounds = node.isInstancedMesh ? node : node.geometry;
      bounds.computeBoundingSphere();
      casters.push({ node, sphere: bounds.boundingSphere });
      yield;
    }
    this.entries.set(world, {
      id,
      casters,
      lights,
      quality: null,
      shadowFar: id === "court" ? this.rig.csm?.maxFar : null,
      eye: new THREE.Vector3(Infinity, Infinity, Infinity),
      checked: -Infinity,
    });
    world.beforeRender = (camera) => this.update(world, camera);
    this.apply(world);
  }

  apply(world) {
    const entry = this.entries.get(world);
    if (!entry) return;
    const quality = this.settings.quality || "high";
    const policy = RENDER_BUDGETS[quality] || RENDER_BUDGETS.high;
    const composer =
      entry.id === "court" ? this.rig.post?.composer : world.composer;
    if (composer) {
      for (const target of new Set([
        composer.readBuffer,
        composer.writeBuffer,
      ])) {
        if (target.samples !== policy.samples) {
          target.samples = policy.samples;
          target.dispose();
        }
      }
      const size = this.renderer
        .getSize(new THREE.Vector2())
        .multiplyScalar(this.renderer.getPixelRatio());
      for (const pass of composer.passes) {
        if (pass !== this.rig.post?.bloom && !pass.renderTargetBright) continue;
        pass.enabled = policy.bloom;
        pass.setSize(
          Math.max(1, Math.round(size.x * policy.bloomScale)),
          Math.max(1, Math.round(size.y * policy.bloomScale)),
        );
      }
    }
    for (const portal of worldPortals(world))
      portal.setQuality(
        policy.portalScale,
        policy.portalSamples,
        policy.portalInterval,
      );
    for (const { node, size } of entry.lights) {
      const width = Math.min(size.x, policy.shadowSize),
        height = Math.min(size.y, policy.shadowSize);
      if (node.shadow.mapSize.x === width && node.shadow.mapSize.y === height)
        continue;
      node.shadow.mapSize.set(width, height);
      node.shadow.map?.dispose();
      node.shadow.mapPass?.dispose();
      node.shadow.map = node.shadow.mapPass = null;
    }
    const csm = entry.id === "court" && this.rig.csm;
    if (csm && entry.shadowFar) {
      const far = Math.min(entry.shadowFar, policy.shadowDistance);
      if (csm.maxFar !== far) {
        csm.maxFar = far;
        csm.updateFrustums();
      }
    }
    entry.quality = quality;
    entry.checked = -Infinity;
  }

  update(world, camera) {
    world.treeLevels?.update(camera);
    const entry = this.entries.get(world);
    if (!entry) return;
    if (entry.quality !== (this.settings.quality || "high")) this.apply(world);
    const policy = RENDER_BUDGETS[entry.quality] || RENDER_BUDGETS.high;
    const now = performance.now();
    if (
      now - entry.checked < 180 &&
      entry.eye.distanceToSquared(camera.position) < 0.25
    )
      return;
    entry.checked = now;
    entry.eye.copy(camera.position);
    if (policy.shadowDistance === Infinity) {
      for (const { node } of entry.casters) node.castShadow = true;
      return;
    }
    for (const { node, sphere } of entry.casters) {
      this.point.copy(sphere.center).applyMatrix4(node.matrixWorld);
      const reach =
        policy.shadowDistance +
        sphere.radius * node.matrixWorld.getMaxScaleOnAxis();
      node.castShadow =
        this.point.distanceToSquared(camera.position) <= reach * reach;
    }
  }

  telemetry(world) {
    const entry = this.entries.get(world);
    return entry
      ? {
          quality: entry.quality,
          casters: entry.casters.length,
          activeCasters: entry.casters.filter(({ node }) => node.castShadow)
            .length,
          portalInterval: RENDER_BUDGETS[entry.quality]?.portalInterval || 0,
          shadowFar: entry.id === "court" ? this.rig.csm?.maxFar : null,
          portalSizes: worldPortals(world).map((portal) => [
            portal.target.width,
            portal.target.height,
          ]),
        }
      : null;
  }
}
