import { meanLinearColor, mineralDetail } from "./mineral-surface.js";

const caches = new WeakMap();
const readiness = new WeakMap();
const density = 1;
const strength = 0.45;

export function forestLitter(THREE, material, { waitMs = 3500 } = {}) {
  if (typeof document === "undefined") return material;
  if (["pending", "ready"].includes(material.userData.forestLitter))
    return material;
  const formerImage = material.map?.image;
  material.userData.forestLitter = "pending";
  if (!caches.has(THREE)) {
    const request = new THREE.TextureLoader()
      .loadAsync(
        new URL("./textures/forest-litter-albedo.webp", import.meta.url).href,
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
  let timer;
  const fallback = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (material.userData.forestLitter === "pending")
        material.userData.forestLitter = "fallback";
      resolve();
    }, waitMs);
  });
  const applied = caches.get(THREE).then((surface) => {
    if (
      readiness.get(material) !== pending ||
      material.userData.forestLitter !== "pending"
    )
      return;
    if (!surface) {
      material.userData.forestLitter = "fallback";
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
    material.userData.forestLitter = "ready";
  });
  const pending = Promise.race([applied, fallback]).finally(() =>
    clearTimeout(timer),
  );
  readiness.set(material, pending);
  return material;
}

export function forestLitterReady(material) {
  return readiness.get(material) || Promise.resolve();
}
