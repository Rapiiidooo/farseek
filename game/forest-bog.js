// The spore bog: a sunken hollow across the avenue before the grove, flooded with water the
// pods have seeded. It burns, so the trail crosses it on stones.

export const BOG = {
  x: -0.6,
  z: -87.6,
  // Half extents of the rounded footprint; its middle runs under both rocky banks.
  ax: 17,
  az: 7.7,
  level: 2.55,
};

// Mud mounds left dry for the pods that seed the water: [x, z, radius].
export const BOG_ISLANDS = [
  [-5.6, -86.6, 1.5],
  [5.2, -90.8, 1.5],
];

// Stones from the near shore to the far one: [x, z, radius, height above the water, yaw].
// About 1.5 m of water separates their walkable tops and the banks' lips, so every jump
// from a lip, from a tapped standing hop to a held running leap, lands on the next top.
export const BOG_STONES = [
  [0.1, -81.2, 1.5, 0.42, 0.4],
  [-0.25, -85.35, 1.5, 0.52, 2.1],
  [0.2, -89.35, 1.5, 0.6, 4.2],
  [-0.15, -93.4, 1.58, 0.68, 1.3],
];

// Signed distance in metres from the footprint's rim, negative inside. The rim wanders so
// the shore reads as a hollow rather than a cut.
export function bogEdge(x, z) {
  const dx = x - BOG.x,
    dz = z - BOG.z;
  const u = Math.abs(dx) / BOG.ax,
    v = Math.abs(dz) / BOG.az;
  const angle = Math.atan2(dz, dx);
  return (
    ((u ** 2.6 + v ** 2.6) ** (1 / 2.6) - 1) * BOG.az +
    0.55 * Math.sin(angle * 3 + 1.1) +
    0.35 * Math.sin(angle * 7 + 2.3) +
    0.2 * Math.sin(x * 0.9 + z * 0.4)
  );
}

// How far the hollow lowers the forest floor at a point whose natural height is `h`.
export function bogDepression(x, z, h) {
  const edge = bogEdge(x, z);
  if (edge > 2.2) return 0;
  const k = Math.min(1, Math.max(0, (2.2 - edge) / 3));
  let mask = k * k * (3 - 2 * k);
  const floor = BOG.level - 0.9 - 0.7 * mask * mask;
  for (const [ix, iz, radius] of BOG_ISLANDS) {
    const d = Math.hypot(x - ix, z - iz) / radius;
    if (d < 1.6) mask *= Math.min(1, Math.max(0, (d - 0.55) / 1.05)) ** 2;
  }
  return Math.max(0, h - floor) * mask;
}

// Whether a point lies over the bog's water rather than its banks.
export function overBog(x, z, ground) {
  return ground < BOG.level + 0.02 && bogEdge(x, z) < 2.2;
}

const lattices = new Map();
function lattice(period) {
  if (!lattices.has(period)) {
    let seed = 1013 + period * 7919;
    const values = new Float32Array(period * period);
    for (let i = 0; i < values.length; i++)
      values[i] = (seed = (seed * 16807) % 2147483647) / 2147483647;
    lattices.set(period, values);
  }
  return lattices.get(period);
}

// Tileable value noise on a `period` lattice.
function noise(x, y, period) {
  const values = lattice(period);
  const i = Math.floor(x),
    j = Math.floor(y);
  const fx = x - i,
    fy = y - j;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const i0 = ((i % period) + period) % period,
    j0 = ((j % period) + period) % period;
  const i1 = (i0 + 1) % period,
    j1 = (j0 + 1) % period;
  const a = values[j0 * period + i0],
    b = values[j0 * period + i1],
    c = values[j1 * period + i0],
    d = values[j1 * period + i1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, period, octaves = 4) {
  let sum = 0,
    amplitude = 0.5,
    scale = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * scale, y * scale, period * scale) * amplitude;
    amplitude *= 0.5;
    scale *= 2;
  }
  return sum / (1 - 0.5 ** octaves);
}

// A broken film of spores drifting on the water: thin filaments and a few denser drifts.
function scumTexture(THREE, size = 256) {
  const data = new Uint8Array(size * size * 4);
  const period = 6;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * period,
        v = (y / size) * period;
      const wu = u + 1.6 * fbm(u + 3.1, v + 7.7, period),
        wv = v + 1.6 * fbm(u + 8.3, v + 2.9, period);
      const ridge = 1 - Math.abs(2 * fbm(wu, wv, period, 5) - 1);
      const filament = Math.max(0, ridge - 0.78) / 0.22;
      const drift =
        Math.max(0, fbm(wu * 0.5, wv * 0.5, period / 2) - 0.6) / 0.4;
      const glow = Math.min(1, filament ** 1.6 * 0.75 + drift * 0.55);
      const i = (y * size + x) * 4;
      data[i] = Math.round(176 * glow);
      data[i + 1] = Math.round(232 * glow);
      data[i + 2] = Math.round(80 * glow);
      data[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1.3);
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function rippleTexture(THREE, size = 128) {
  const height = new Float32Array(size * size);
  const turn = Math.PI * 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      height[y * size + x] =
        Math.sin(turn * (4 * u + 3 * v) + Math.sin(turn * v) * 0.7) * 0.4 +
        Math.sin(turn * (9 * u - 2 * v) + Math.sin(turn * u) * 0.5) * 0.2 +
        Math.sin(turn * (2 * u - 7 * v) + 2.1) * 0.25;
    }
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 2.2,
        ny = (at(x, y - 1) - at(x, y + 1)) * 2.2;
      const length = Math.hypot(nx, ny, 1);
      data.set(
        [
          Math.round(((nx / length) * 0.5 + 0.5) * 255),
          Math.round(((ny / length) * 0.5 + 0.5) * 255),
          Math.round(((1 / length) * 0.5 + 0.5) * 255),
          255,
        ],
        (y * size + x) * 4,
      );
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 5);
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// The water, its rising bubbles and the low glowing haze over it.
export function buildBog(THREE, scene) {
  const width = BOG.ax * 2 + 2,
    depth = BOG.az * 2 + 6;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      name: "forest-spore-bog",
      color: 0x1b2613,
      roughness: 0.55,
      metalness: 0,
      envMapIntensity: 0.3,
      normalMap: rippleTexture(THREE),
      normalScale: new THREE.Vector2(0.12, 0.12),
      emissive: 0xffffff,
      emissiveMap: scumTexture(THREE),
      emissiveIntensity: 0.55,
    }),
  );
  water.name = "forest-spore-bog";
  water.position.set(BOG.x, BOG.level, BOG.z);
  water.receiveShadow = true;
  scene.add(water);

  const uniforms = { uTime: { value: 0 } };
  let seed = 917;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const inside = (scale) => {
    for (;;) {
      const x = BOG.x + (rand() * 2 - 1) * BOG.ax * scale,
        z = BOG.z + (rand() * 2 - 1) * BOG.az * scale;
      if (bogEdge(x, z) < -1.2) return [x, z];
    }
  };
  const BUBBLES = 140,
    bubble = new Float32Array(BUBBLES * 3),
    rate = new Float32Array(BUBBLES * 2);
  for (let i = 0; i < BUBBLES; i++) {
    const [x, z] = inside(0.95);
    bubble.set([x, BOG.level, z], i * 3);
    rate.set([rand(), 0.35 + rand() * 0.55], i * 2);
  }
  const bubbleGeometry = new THREE.BufferGeometry();
  bubbleGeometry.setAttribute("position", new THREE.BufferAttribute(bubble, 3));
  bubbleGeometry.setAttribute("rate", new THREE.BufferAttribute(rate, 2));
  const bubbles = new THREE.Points(
    bubbleGeometry,
    new THREE.ShaderMaterial({
      name: "forest-bog-bubbles",
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute vec2 rate;
        varying float vLife;
        void main() {
          float life = fract(uTime * rate.y + rate.x * 7.0);
          vLife = life;
          vec3 p = position;
          p.y += 0.015 + life * 0.05;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (14.0 + 26.0 * life) * (0.6 + rate.x * 0.8) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float ring = smoothstep(0.62, 0.86, d) * (1.0 - smoothstep(0.86, 1.0, d));
          float dome = (1.0 - smoothstep(0.0, 0.9, d)) * 0.35;
          float fade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.82, 1.0, vLife));
          vec3 colour = mix(vec3(0.36, 0.45, 0.2), vec3(0.85, 1.0, 0.5), ring);
          gl_FragColor = vec4(colour, (ring * 0.9 + dome) * fade);
        }`,
    }),
  );
  bubbles.name = "forest-bog-bubbles";
  bubbles.frustumCulled = false;
  scene.add(bubbles);

  const HAZE = 46,
    haze = new Float32Array(HAZE * 3),
    drift = new Float32Array(HAZE);
  for (let i = 0; i < HAZE; i++) {
    const [x, z] = inside(1.05);
    haze.set([x, BOG.level + 0.25 + rand() * 0.45, z], i * 3);
    drift[i] = rand();
  }
  const hazeGeometry = new THREE.BufferGeometry();
  hazeGeometry.setAttribute("position", new THREE.BufferAttribute(haze, 3));
  hazeGeometry.setAttribute("drift", new THREE.BufferAttribute(drift, 1));
  const mist = new THREE.Points(
    hazeGeometry,
    new THREE.ShaderMaterial({
      name: "forest-bog-haze",
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float drift;
        varying float vShade;
        void main() {
          vec3 p = position;
          float t = uTime * (0.05 + drift * 0.05) + drift * 40.0;
          p.x += sin(t) * 1.4;
          p.z += cos(t * 0.8) * 0.9;
          p.y += sin(t * 1.7) * 0.08;
          vShade = 0.6 + 0.4 * sin(uTime * 0.6 + drift * 12.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(420.0, (900.0 + drift * 700.0) / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vShade;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = pow(max(0.0, 1.0 - d), 2.2) * 0.11 * vShade;
          gl_FragColor = vec4(vec3(0.6, 0.76, 0.36), a);
        }`,
    }),
  );
  mist.name = "forest-bog-haze";
  mist.frustumCulled = false;
  scene.add(mist);

  const material = water.material;
  return {
    update(time, surge = 0) {
      uniforms.uTime.value = time;
      material.normalMap.offset.set((time * 0.006) % 1, (time * 0.004) % 1);
      material.emissiveMap.offset.set((time * 0.0035) % 1, (-time * 0.002) % 1);
      material.emissiveIntensity =
        0.5 + 0.08 * Math.sin(time * 0.9) + 0.45 * surge;
    },
  };
}
