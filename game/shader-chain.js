import * as THREE from "three";

const DEFAULT_KEY = THREE.Material.prototype.customProgramCacheKey;
const chained = new WeakMap();

// Adds a shader patch after whatever the material already patches, once per tag. The default
// cache key reads the hook's source, so it is taken from the original hook before wrapping.
export function chainShader(material, tag, patch) {
  const tags = chained.get(material) || new Set();
  if (tags.has(tag)) return false;
  tags.add(tag);
  chained.set(material, tags);
  const hook = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  const base = key === DEFAULT_KEY ? hook.toString() : null;
  material.onBeforeCompile = function (shader, renderer) {
    hook.call(this, shader, renderer);
    patch(shader, renderer);
  };
  material.customProgramCacheKey = function () {
    return (base ?? key.call(this)) + "|" + tag;
  };
  material.needsUpdate = true;
  return true;
}
