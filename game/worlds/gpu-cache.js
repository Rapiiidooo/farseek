import { worldPortals } from "../render-budget.js";

export function worldComposer(world) {
  return world.composer || world.services?.rig?.post?.composer;
}

function textureSet(material, textures) {
  const add = (value) => {
    if (value?.isTexture) textures.add(value);
    else if (Array.isArray(value)) value.forEach(add);
  };
  Object.values(material).forEach(add);
  for (const uniform of Object.values(material.uniforms || {}))
    add(uniform.value);
}

export function collectWorldResources(world) {
  const geometries = new Set(),
    attributes = new Set(),
    textures = new Set(),
    instances = new Set(),
    shadows = new Set();
  // Distance levels not drawn at the moment still hold uploads.
  for (const geometry of world.treeLevels?.geometries() ?? []) {
    geometries.add(geometry);
    for (const attribute of [
      geometry.index,
      ...Object.values(geometry.attributes),
    ])
      if (attribute) attributes.add(attribute);
  }
  for (const scene of [world.scene, world.epilogue?.scene]) {
    scene?.traverse((node) => {
      if (node.geometry) {
        geometries.add(node.geometry);
        for (const attribute of [
          node.geometry.index,
          ...Object.values(node.geometry.attributes),
          ...Object.values(node.geometry.morphAttributes).flat(),
        ])
          if (attribute)
            attributes.add(
              attribute.isInterleavedBufferAttribute
                ? attribute.data
                : attribute,
            );
      }
      for (const material of node.material ? [node.material].flat() : [])
        textureSet(material, textures);
      if (node.shadow) shadows.add(node.shadow);
      if (node.isInstancedMesh) instances.add(node);
    });
  }
  return { geometries, attributes, textures, shadows, instances };
}

function sharedAttributes(geometry, protectedAttributes) {
  return [
    geometry.index,
    ...Object.values(geometry.attributes),
    ...Object.values(geometry.morphAttributes).flat(),
  ].some(
    (attribute) =>
      attribute &&
      protectedAttributes.has(
        attribute.isInterleavedBufferAttribute ? attribute.data : attribute,
      ),
  );
}

export class WorldGPUCache {
  constructor(yieldWork = async () => {}) {
    this.yieldWork = yieldWork;
    this.released = {
      worlds: 0,
      geometries: 0,
      textures: 0,
      targets: 0,
      instances: 0,
    };
  }

  async release(world, protectedWorlds, { targetsOnly = false } = {}) {
    if (targetsOnly) {
      world.gpuResident = false;
      this.releaseTargets(world);
      return;
    }
    const protectedResources = {
      geometries: new Set(),
      attributes: new Set(),
      textures: new Set(),
    };
    for (const retained of protectedWorlds) {
      const resources = collectWorldResources(retained);
      for (const key of Object.keys(protectedResources))
        for (const resource of resources[key])
          protectedResources[key].add(resource);
      await this.yieldWork();
    }
    world.gpuResident = false;
    const resources = collectWorldResources(world);
    for (const instance of resources.instances) {
      instance.dispose();
      this.released.instances++;
      await this.yieldWork();
    }
    for (const geometry of resources.geometries) {
      if (
        !protectedResources.geometries.has(geometry) &&
        !sharedAttributes(geometry, protectedResources.attributes)
      ) {
        geometry.dispose();
        this.released.geometries++;
      }
      await this.yieldWork();
    }
    for (const texture of resources.textures) {
      if (
        !texture.isRenderTargetTexture &&
        !protectedResources.textures.has(texture)
      ) {
        texture.dispose();
        this.released.textures++;
      }
      await this.yieldWork();
    }
    for (const shadow of resources.shadows) {
      shadow.map?.dispose();
      shadow.mapPass?.dispose();
      shadow.map = shadow.mapPass = null;
    }
    this.releaseTargets(world);
  }

  releaseTargets(world) {
    const composer = worldComposer(world);
    composer?.setSize(1, 1);
    for (const portal of worldPortals(world)) {
      portal.target.setSize(1, 1);
      this.released.targets++;
    }
    this.released.worlds++;
  }
}
