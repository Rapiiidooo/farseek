import { meanLinearColor, mineralDetail } from "./mineral-surface.js";

const caches = new WeakMap();
const readiness = new WeakMap();
const density = 0.5;
const strength = 0.55;

export function barkSurface(THREE, material) {
  if (typeof document === "undefined") return material;
  if (["pending", "ready"].includes(material.userData.barkSurface))
    return material;
  const formerImage = material.map?.image;
  material.userData.barkSurface = "pending";
  if (!caches.has(THREE)) {
    const request = new THREE.TextureLoader()
      .loadAsync(
        new URL("./textures/bark-weathered-albedo.webp", import.meta.url).href,
      )
      .then((map) => {
        map.colorSpace = THREE.SRGBColorSpace;
        map.flipY = false;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.anisotropy = 8;
        map.userData.sharedAssetFinish = true;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 512;
        const context = canvas.getContext("2d");
        context.drawImage(map.image, 0, 0, 512, 512);
        const pixels = context.getImageData(0, 0, 512, 512);
        const maps = { map, ...mineralDetail(THREE, pixels) };
        for (const value of Object.values(maps))
          value.repeat.set(density, density);
        return { maps, mean: meanLinearColor(pixels) };
      })
      .catch(() => {
        caches.delete(THREE);
        return null;
      });
    caches.set(THREE, request);
  }
  const pending = caches.get(THREE).then((surface) => {
    if (
      readiness.get(material) !== pending ||
      material.userData.barkSurface !== "pending"
    )
      return;
    if (!surface) {
      material.userData.barkSurface = "fallback";
      return;
    }
    const formerMean = formerImage?.data ? meanLinearColor(formerImage) : null;
    Object.assign(material, surface.maps);
    material.normalScale.set(strength, strength);
    if (formerMean)
      material.color.multiply(
        new THREE.Color(
          ...formerMean.map(
            (value, channel) => value / Math.max(0.01, surface.mean[channel]),
          ),
        ),
      );
    material.userData.barkSurface = "ready";
  });
  readiness.set(material, pending);
  return material;
}

export function barkSurfaceReady(root, { waitMs = 3500 } = {}) {
  const pending = new Map();
  root.traverse((node) => {
    const materials = node.material
      ? Array.isArray(node.material)
        ? node.material
        : [node.material]
      : [];
    for (const material of materials) {
      const request = readiness.get(material);
      if (request && material.userData.barkSurface === "pending")
        pending.set(material, request);
    }
  });
  if (!pending.size) return Promise.resolve([]);
  let timer;
  const fallback = new Promise((resolve) => {
    timer = setTimeout(() => {
      for (const [material, request] of pending)
        if (
          readiness.get(material) === request &&
          material.userData.barkSurface === "pending"
        )
          material.userData.barkSurface = "fallback";
      resolve([]);
    }, waitMs);
  });
  return Promise.race([Promise.all(pending.values()), fallback]).finally(() =>
    clearTimeout(timer),
  );
}
