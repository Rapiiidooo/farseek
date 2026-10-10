import { mineralDetail } from "./mineral-surface.js";
import { shareTextures } from "./pixel-jobs.js";

const fallbackCache = new WeakMap();
const imageCache = new WeakMap();
const readiness = new WeakMap();
const pictures = new WeakMap();
const timedOut = new WeakSet();

export function leafMean(pixels) {
  const totals = [0, 0, 0];
  let weight = 0;
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i + 3] < 128) continue;
    const alpha = pixels.data[i + 3] / 255;
    weight += alpha;
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels.data[i + channel] / 255;
      totals[channel] +=
        alpha *
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    }
  }
  return weight ? totals.map((value) => value / weight) : null;
}

function fallback(THREE) {
  if (fallbackCache.has(THREE)) return fallbackCache.get(THREE);
  const size = 128,
    data = new Uint8Array(size * size * 4),
    blades = [];
  for (let i = 0; i < 10; i++) {
    const t = 0.16 + i * 0.074,
      side = i % 2 ? 1 : -1;
    blades.push({
      x: 0.15 + t * 0.68 + side * 0.09,
      y: 0.14 + t * 0.72 - side * 0.08,
      angle: side * 0.7 + 0.75,
      length: 0.11 + (i % 3) * 0.011,
      width: 0.043,
    });
  }
  const stemLength = Math.hypot(0.68, 0.72);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size,
        v = (y + 0.5) / size,
        t = ((u - 0.15) * 0.68 + (v - 0.14) * 0.72) / stemLength ** 2;
      let cover =
        t >= 0 && t <= 1
          ? Math.max(
              0,
              1 -
                Math.abs((u - 0.15) * 0.72 - (v - 0.14) * 0.68) /
                  (stemLength * 0.007),
            )
          : 0;
      for (const blade of blades) {
        const dx = u - blade.x,
          dy = v - blade.y,
          along = dx * Math.cos(blade.angle) + dy * Math.sin(blade.angle),
          across = -dx * Math.sin(blade.angle) + dy * Math.cos(blade.angle),
          distance = (along / blade.length) ** 2 + (across / blade.width) ** 2;
        cover = Math.max(cover, Math.min(1, Math.max(0, (1 - distance) * 18)));
      }
      const variation =
        0.9 + 0.07 * Math.sin(u * 73 + v * 21) + 0.03 * Math.sin(v * 91);
      data.set(
        [150 * variation, 173 * variation, 112 * variation, 255 * cover],
        (y * size + x) * 4,
      );
    }
  const map = new THREE.DataTexture(data, size, size),
    pixels = { data, width: size, height: size },
    maps = { map, ...mineralDetail(THREE, pixels) };
  map.colorSpace = THREE.SRGBColorSpace;
  for (const [slot, texture] of Object.entries(maps)) {
    texture.userData.sharedTexture = `canopy-fallback:${slot}`;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.userData.sharedAssetFinish = true;
    texture.needsUpdate = true;
  }
  const result = { maps, mean: leafMean(pixels) };
  fallbackCache.set(THREE, result);
  return result;
}

shareTextures("canopy-fallback", (THREE) => fallback(THREE).maps);

export function canopyMaterial(THREE, color) {
  const surface = fallback(THREE),
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      metalness: 0,
      ...surface.maps,
      normalScale: new THREE.Vector2(0.3, 0.3),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
    });
  material.name = "foliage";
  material.userData.canopyLeaf = true;
  material.userData.canopyColor = color;
  material.userData.leafSurface = "procedural";
  material.color.multiply(
    new THREE.Color(...surface.mean.map((value) => 1 / Math.max(0.01, value))),
  );
  return material;
}

export function finishCanopy(THREE, mesh, { textures = true } = {}) {
  const geometry = mesh.geometry.clone();
  if (geometry.attributes.leafUv) {
    geometry.setAttribute("uv", geometry.attributes.leafUv.clone());
    geometry.deleteAttribute("leafUv");
  }
  mesh.geometry = geometry;
  const original = mesh.material,
    material = canopyMaterial(THREE, original.userData.canopyColor);
  material.vertexColors = !!geometry.attributes.color;
  mesh.material = material;
  if (!textures || typeof document === "undefined") return material;
  material.userData.leafSurface = "pending";
  if (!imageCache.has(THREE)) {
    const request = new THREE.TextureLoader()
      .loadAsync(
        new URL("./textures/beech-leaves-albedo.webp", import.meta.url).href,
      )
      .then((map) => {
        map.colorSpace = THREE.SRGBColorSpace;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 512;
        const context = canvas.getContext("2d");
        context.drawImage(map.image, 0, 0, 512, 512);
        const pixels = context.getImageData(0, 0, 512, 512),
          maps = { map, ...mineralDetail(THREE, pixels) };
        for (const texture of Object.values(maps)) {
          texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.flipY = false;
          texture.anisotropy = 8;
          texture.userData.sharedAssetFinish = true;
        }
        const mean = leafMean(pixels);
        if (!mean) throw Error("No opaque foliage pixels");
        timedOut.delete(request);
        return { maps, mean };
      })
      .catch(() => {
        imageCache.delete(THREE);
        timedOut.delete(request);
        return null;
      });
    imageCache.set(THREE, request);
  }
  const picture = imageCache.get(THREE);
  if (timedOut.has(picture)) {
    material.userData.leafSurface = "fallback";
    return material;
  }
  const pending = picture.then((surface) => {
    if (
      readiness.get(material) !== pending ||
      material.userData.leafSurface !== "pending"
    )
      return;
    if (!surface) {
      material.userData.leafSurface = "fallback";
      return;
    }
    const former = fallback(THREE);
    Object.assign(material, surface.maps);
    material.color.multiply(
      new THREE.Color(
        ...former.mean.map(
          (value, channel) => value / Math.max(0.01, surface.mean[channel]),
        ),
      ),
    );
    material.userData.leafSurface = "ready";
  });
  readiness.set(material, pending);
  pictures.set(material, picture);
  return material;
}

export function leafSurfaceReady(root, { waitMs = 3500 } = {}) {
  const pending = new Map();
  root.traverse((node) => {
    for (const material of node.material
      ? Array.isArray(node.material)
        ? node.material
        : [node.material]
      : []) {
      const request = readiness.get(material);
      if (request && material.userData.leafSurface === "pending")
        pending.set(material, request);
    }
  });
  if (!pending.size) return Promise.resolve([]);
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      for (const [material, request] of pending)
        if (
          readiness.get(material) === request &&
          material.userData.leafSurface === "pending"
        ) {
          material.userData.leafSurface = "fallback";
          timedOut.add(pictures.get(material));
        }
      resolve([]);
    }, waitMs);
  });
  return Promise.race([Promise.all(pending.values()), deadline]).finally(() =>
    clearTimeout(timer),
  );
}
