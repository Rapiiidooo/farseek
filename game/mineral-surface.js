import { meanLinearColor, mineralPixels } from "./detail-pixels.js";
import { deferPixels } from "./pixel-jobs.js";

export { meanLinearColor };

export function mineralDetail(THREE, source, size = 512) {
  const input = {
    data: source.data,
    width: source.width,
    height: source.height,
  };
  const image = deferPixels("mineral", { source: input, size }, () =>
    mineralPixels(input, size),
  );
  const texture = (name) => {
    const texture = new THREE.DataTexture(null, size, size);
    texture.image = image(name, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.userData.sharedAssetFinish = true;
    texture.needsUpdate = true;
    return texture;
  };
  return { normalMap: texture("normal"), roughnessMap: texture("roughness") };
}

const mineralCaches = new WeakMap();
const mineralSources = new WeakMap();
const mineralReadiness = new WeakMap();
const mineralPictures = new WeakMap();
const mineralTimeouts = new WeakSet();
const flatCaches = new WeakMap();
const imageMeans = new WeakMap();

export function mineralSurface(
  THREE,
  material,
  {
    strength = 0.5,
    tile = 1,
    source = new URL("./textures/stone-mineral-albedo.webp", import.meta.url)
      .href,
  } = {},
) {
  if (typeof document === "undefined") return material;
  const key = source + "|" + tile;
  if (
    ["pending", "ready"].includes(material.userData.mineralSurface) &&
    material.userData.mineralKey === key
  )
    return material;
  if (!material.map || !material.normalMap || !material.roughnessMap) {
    if (!flatCaches.has(THREE)) {
      const maps = Object.fromEntries(
        [
          ["map", [255, 255, 255, 255]],
          ["normalMap", [128, 128, 255, 255]],
          ["roughnessMap", [255, 255, 255, 255]],
        ].map(([name, data]) => {
          const texture = new THREE.DataTexture(new Uint8Array(data), 1, 1);
          texture.userData.sharedAssetFinish = true;
          texture.needsUpdate = true;
          return [name, texture];
        }),
      );
      maps.map.colorSpace = THREE.SRGBColorSpace;
      flatCaches.set(THREE, maps);
    }
    for (const [name, texture] of Object.entries(flatCaches.get(THREE)))
      material[name] ??= texture;
  }
  const formerImage = material.map.image,
    storedMean = material.userData.mineralMean;
  // Read once the surface arrives, so a worker can finish the former pixels meanwhile.
  const former = () => {
    let mean = storedMean || imageMeans.get(formerImage);
    if (!mean) {
      const formerPixels = formerImage.data
        ? formerImage
        : formerImage
            .getContext?.("2d")
            ?.getImageData?.(0, 0, formerImage.width, formerImage.height);
      mean = formerPixels?.data ? meanLinearColor(formerPixels) : null;
      if (mean && formerImage && typeof formerImage === "object")
        imageMeans.set(formerImage, mean);
    }
    return mean;
  };
  material.userData.mineralSurface = "pending";
  material.userData.mineralKey = key;
  if (!mineralCaches.has(THREE)) mineralCaches.set(THREE, new Map());
  if (!mineralSources.has(THREE)) mineralSources.set(THREE, new Map());
  const cache = mineralCaches.get(THREE),
    sources = mineralSources.get(THREE);
  if (!cache.has(key)) {
    if (!sources.has(source))
      sources.set(
        source,
        new THREE.TextureLoader()
          .loadAsync(source)
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
            return { maps, mean: meanLinearColor(pixels) };
          })
          .catch(() => {
            sources.delete(source);
            return null;
          }),
      );
    const request = sources.get(source).then((surface) => {
      mineralTimeouts.delete(request);
      if (!surface) {
        cache.delete(key);
        return null;
      }
      const maps = Object.fromEntries(
        Object.entries(surface.maps).map(([name, original]) => {
          const texture = original.clone();
          texture.repeat.set(1 / tile, 1 / tile);
          return [name, texture];
        }),
      );
      return { maps, mean: surface.mean };
    });
    cache.set(key, request);
  }
  const picture = cache.get(key);
  if (mineralTimeouts.has(picture)) {
    material.userData.mineralSurface = "fallback";
    return material;
  }
  const pending = picture.then((surface) => {
    if (
      mineralReadiness.get(material) !== pending ||
      material.userData.mineralSurface !== "pending"
    )
      return;
    if (!surface) {
      material.userData.mineralSurface = "fallback";
      return;
    }
    const formerMean = former();
    Object.assign(material, surface.maps);
    material.userData.mineralMean = surface.mean;
    material.normalScale.set(strength, strength);
    if (formerMean) {
      const gain = formerMean.map(
        (value, channel) => value / Math.max(0.01, surface.mean[channel]),
      );
      material.userData.mineralGain = gain.map(
        (value, channel) =>
          value * (material.userData.mineralGain?.[channel] ?? 1),
      );
      material.color.multiply(new THREE.Color(...gain));
    }
    material.userData.mineralSurface = "ready";
  });
  mineralReadiness.set(material, pending);
  mineralPictures.set(material, picture);
  return material;
}

export function mineralColor(material, color) {
  const value = material.color.clone().set(color),
    gain = material.userData.mineralGain;
  if (gain) {
    value.r *= gain[0];
    value.g *= gain[1];
    value.b *= gain[2];
  }
  return value;
}

export function mineralBaseColor(material) {
  const value = material.color.clone(),
    gain = material.userData.mineralGain;
  if (gain) {
    value.r /= gain[0];
    value.g /= gain[1];
    value.b /= gain[2];
  }
  return value;
}

export function mineralSurfaceReady(root, { waitMs = 3500 } = {}) {
  const pending = new Map();
  root.traverse((node) => {
    for (const material of node.material
      ? Array.isArray(node.material)
        ? node.material
        : [node.material]
      : []) {
      const request = mineralReadiness.get(material);
      if (request && material.userData.mineralSurface === "pending")
        pending.set(material, request);
    }
  });
  if (!pending.size) return Promise.resolve([]);
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      for (const [material, request] of pending)
        if (
          mineralReadiness.get(material) === request &&
          material.userData.mineralSurface === "pending"
        ) {
          material.userData.mineralSurface = "fallback";
          mineralTimeouts.add(mineralPictures.get(material));
        }
      resolve([]);
    }, waitMs);
  });
  return Promise.race([Promise.all(pending.values()), deadline]).finally(() =>
    clearTimeout(timer),
  );
}
