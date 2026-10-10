import { clumps } from "./grass.js";
import { forestRoute } from "./forest-route.js";

export function forestFloorNoise(x, z) {
  const hash = (x, z) => {
    const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const sx = x - ix,
    sz = z - iz;
  const u = sx * sx * (3 - 2 * sx),
    v = sz * sz * (3 - 2 * sz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function castleMeadowSpots(forest, world, gate) {
  let seed = 113;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const centres = [];
  for (let i = 0; i < 40; i++) {
    const z = -221 - rand() * 41,
      route = forestRoute(z);
    centres.push([
      route.x + (i % 2 ? 1 : -1) * (3.5 + rand() * 2.4),
      z,
      0.8 + rand() * 0.8,
      3 + Math.floor(rand() * 3),
    ]);
  }
  const ground = (x, z) => {
    if (
      Math.abs(x - forestRoute(z).x) < 2.45 ||
      Math.hypot(x - gate.center.x, z - gate.center.z) < 7
    )
      return null;
    const y = forest.surfaceAt(x, z);
    if (world.occupied(x, z, 0.5, y + 0.04, y + 0.7)) return null;
    return y;
  };
  return clumps(centres, ground, rand, [0.55, 0.82]);
}

export function forestFloor(THREE, size = 128) {
  const heights = new Float32Array(size * size);
  const map = new Uint8Array(size * size * 4);
  const normals = new Uint8Array(map.length);
  const roughness = new Uint8Array(map.length);
  const wrap = (value, period) => ((value % period) + period) % period;
  const hash = (x, y, period) => {
    const value =
      Math.sin(wrap(x, period) * 127.1 + wrap(y, period) * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const noise = (x, y, period) => {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const sx = x - ix,
      sy = y - iy;
    const u = sx * sx * (3 - 2 * sx),
      v = sy * sy * (3 - 2 * sy);
    const a = hash(ix, iy, period),
      b = hash(ix + 1, iy, period);
    const c = hash(ix, iy + 1, period),
      d = hash(ix + 1, iy + 1, period);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const coarse = noise(u * 8, v * 8, 8);
      const grain = noise(u * 32, v * 32, 32);
      const grit = noise(u * 64, v * 64, 64);
      const tone = Math.round(234 + coarse * 11 + grain * 9);
      const index = (x + y * size) * 4;
      map.set([tone, tone, Math.max(0, tone - 3), 255], index);
      heights[x + y * size] = coarse * 0.006 + grain * 0.006 + grit * 0.0015;
      const rough = Math.round(226 + grain * 26);
      roughness.set([rough, rough, rough, 255], index);
    }
  }
  for (let i = 0; i < 52; i++) {
    const cx = Math.floor(hash(i, 1, 128) * size);
    const cy = Math.floor(hash(i, 7, 128) * size);
    const angle = hash(i, 19, 128) * Math.PI * 2;
    const extent = 2.3 + hash(i, 31, 128) * 4;
    const bound = Math.ceil(extent + 1);
    for (let y = -bound; y <= bound; y++) {
      for (let x = -bound; x <= bound; x++) {
        const along = Math.abs(x * Math.cos(angle) + y * Math.sin(angle));
        const across = Math.abs(y * Math.cos(angle) - x * Math.sin(angle));
        const mask = Math.max(0, 1 - along / extent) * Math.max(0, 1 - across);
        if (!mask) continue;
        const index = wrap(cx + x, size) + wrap(cy + y, size) * size;
        heights[index] += mask * 0.0012;
        for (let channel = 0; channel < 3; channel++)
          map[index * 4 + channel] = Math.round(
            map[index * 4 + channel] - mask * 12,
          );
      }
    }
  }
  const height = (x, y) => heights[wrap(x, size) + wrap(y, size) * size];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((height(x + 1, y) - height(x - 1, y)) * size) / 4;
      const dy = ((height(x, y + 1) - height(x, y - 1)) * size) / 4;
      const length = Math.hypot(dx, dy, 1);
      const channel = (value) =>
        Math.round(((value / length) * 0.5 + 0.5) * 255);
      normals.set(
        [channel(-dx), channel(-dy), channel(1), 255],
        (x + y * size) * 4,
      );
    }
  }
  const texture = (data, color = false) => {
    const value = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    value.wrapS = value.wrapT = THREE.RepeatWrapping;
    value.minFilter = THREE.LinearMipmapLinearFilter;
    value.magFilter = THREE.LinearFilter;
    value.generateMipmaps = true;
    if (color) value.colorSpace = THREE.SRGBColorSpace;
    value.needsUpdate = true;
    return value;
  };
  return {
    map: texture(map, true),
    normalMap: texture(normals),
    roughnessMap: texture(roughness),
    tile: 2,
  };
}
