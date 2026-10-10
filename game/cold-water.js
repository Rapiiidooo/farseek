export function coldWaterMaterial(THREE) {
  const size = 128;
  const height = new Float32Array(size * size);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      height[y * size + x] =
        Math.sin(tau * (3 * u + 2 * v) + Math.sin(tau * v) * 0.6) * 0.48 +
        Math.sin(tau * (7 * u - v) + Math.sin(tau * u) * 0.35) * 0.18 +
        Math.sin(tau * (u - 4 * v) + 1.3) * 0.22;
    }
  const data = new Uint8Array(size * size * 4);
  const sample = (x, y) =>
    height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (sample(x - 1, y) - sample(x + 1, y)) * 3;
      const ny = (sample(x, y - 1) - sample(x, y + 1)) * 3;
      const length = Math.hypot(nx, ny, 1);
      data.set(
        [
          Math.round(((nx / length) * 0.5 + 0.5) * 255),
          Math.round(((ny / length) * 0.5 + 0.5) * 255),
          Math.round(((1 / length) * 0.5 + 0.5) * 255),
          Math.round((sample(x, y) * 0.35 + 0.5) * 255),
        ],
        (y * size + x) * 4,
      );
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "frozen-water-ripples";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 10);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    name: "frozen-water",
    color: 0x1b4258,
    emissive: 0x153447,
    emissiveIntensity: 0.25,
    roughness: 0.22,
    metalness: 0.08,
    envMapIntensity: 0.85,
    normalMap: texture,
    normalScale: new THREE.Vector2(0.45, 0.45),
  });
  material.customProgramCacheKey = () => "fd-cold-water";
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float fdWaterRipple = texture2D(normalMap, vNormalMapUv).a;
      diffuseColor.rgb *= 0.9 + fdWaterRipple * 0.2;
      totalEmissiveRadiance *= 0.8 + fdWaterRipple * 0.4;`,
    );
  };
  return material;
}

export function setColdWaterTime(material, time) {
  const texture = material.normalMap;
  texture.offset.set(
    (((time * 0.008) % 1) + 1) % 1,
    (((time * 0.005) % 1) + 1) % 1,
  );
}
