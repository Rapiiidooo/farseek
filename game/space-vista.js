import * as THREE from "three";

// The sky beyond the last door, built for the closing shot: a deep sky at infinity, bright
// stars, a distant star's glare, lit planets with their atmospheres and rings, and drifting
// rock. Every material is created here, before the shot, and none of them takes fog.

const NOISE = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  const mat3 TURN = mat3(0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64);
  float fbm4(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = TURN * p * 2.03; a *= 0.5; }
    return s / 0.9375;
  }
  float fbm6(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = TURN * p * 2.03; a *= 0.5; }
    return s / 0.984375;
  }
`;

// Directions are drawn at infinity: only the camera's rotation applies, at the far plane.
const INFINITE = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec3 view = (viewMatrix * modelMatrix * vec4(position, 0.0)).xyz;
    gl_Position = projectionMatrix * vec4(view, 1.0);
    gl_Position.z = gl_Position.w * 0.99999;
  }`;

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

export const SPACE = {
  sun: v3(-0.72, 0.38, -0.25),
  band: v3(0.3, 0.86, -0.41),
  beacon: v3(0.85, 0.124, 0.512),
};

function core(band) {
  const along = v3(-0.55, -0.2, 0.81);
  return along.addScaledVector(band, -along.dot(band)).normalize();
}

export function spaceSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBand: { value: SPACE.band.clone() },
      uCore: { value: core(SPACE.band) },
      uSun: { value: SPACE.sun.clone() },
    },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: INFINITE,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform vec3 uBand; uniform vec3 uCore; uniform vec3 uSun;
      varying vec3 vDir;
      vec3 stars(vec3 d, float scale, float keep, float size) {
        vec3 p = d * scale;
        vec3 cell = floor(p);
        float h = hash13(cell);
        if (h > keep) return vec3(0.0);
        vec3 at = cell + vec3(hash13(cell + 17.3), hash13(cell + 41.9), hash13(cell + 73.1)) * 0.6 + 0.2;
        float dist = length(p - normalize(at) * scale);
        float sigma = max(size, length(fwidth(p)) * 0.6);
        float light = exp(-dist * dist / (sigma * sigma)) * size * size / (sigma * sigma);
        float t = hash13(cell + 5.7);
        vec3 tint = t < 0.22 ? vec3(1.0, 0.76, 0.56) : t < 0.62 ? vec3(1.0, 0.95, 0.88) : vec3(0.72, 0.84, 1.0);
        return tint * light * (0.12 + pow(h / keep, 3.0) * 1.7);
      }
      vec3 nebula(vec3 d, vec3 centre, float spread, vec3 outer, vec3 inner, float seed) {
        float mask = exp(-(1.0 - dot(d, centre)) / spread);
        if (mask < 0.003) return vec3(0.0);
        vec3 q = d * 3.4 + seed;
        float w = fbm4(q * 1.3);
        float n = fbm6(q * 2.4 + w * 2.2);
        float wisps = smoothstep(0.36, 0.86, n) * mask;
        float heart = smoothstep(0.58, 0.95, n) * mask * mask;
        return outer * wisps + inner * heart;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = dot(d, uBand);
        float halo = exp(-h * h * 6.5);
        float lane = exp(-h * h * 36.0);
        float bulge = exp(-dot(d - uCore, d - uCore) * 3.0);
        vec3 col = vec3(0.0022, 0.0034, 0.0095) + vec3(0.007, 0.009, 0.02) * halo;
        if (halo > 0.004) {
          vec3 q = d * 2.6;
          float w = fbm4(q * 1.7);
          float clouds = fbm6(q * 3.1 + w * 1.6);
          float lanes = fbm4(q * 6.0 + vec3(3.1, 7.7, 1.3) + w);
          float body = lane * smoothstep(0.3, 0.8, clouds) * (0.55 + bulge * 1.8)
            + halo * 0.16 * clouds;
          float across = (h + (w - 0.5) * 0.09) * 20.0;
          float dust = lane * smoothstep(0.42, 0.7, lanes) * exp(-across * across);
          vec3 tint = mix(vec3(0.5, 0.58, 0.8), vec3(1.0, 0.78, 0.55), clamp(bulge * 1.4, 0.0, 1.0));
          col += tint * body * 0.2;
          col *= 1.0 - dust * 0.82;
        }
        col += nebula(d, normalize(vec3(0.6, -0.1, 0.79)), 0.085,
          vec3(0.2, 0.025, 0.09), vec3(0.42, 0.16, 0.24), 1.7);
        col += nebula(d, normalize(vec3(0.62, -0.08, -0.78)), 0.05,
          vec3(0.05, 0.04, 0.2), vec3(0.16, 0.2, 0.42), 9.1);
        col += nebula(d, normalize(vec3(-0.18, 0.42, -0.89)), 0.035,
          vec3(0.012, 0.09, 0.09), vec3(0.08, 0.26, 0.24), 4.3);
        col += vec3(1.0, 0.86, 0.66) * pow(max(dot(d, uSun), 0.0), 24.0) * 0.05;
        float crowd = 0.5 + lane * 0.9 + bulge;
        col += stars(d, 150.0, 0.012 * crowd, 0.075);
        col += stars(d, 420.0, 0.006 * crowd, 0.09) * 0.55;
        gl_FragColor = vec4(col, 1.0);
        ${OUTPUT}
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  sky.name = "Starfield";
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

function random(seed) {
  return () =>
    ((seed = (Math.imul(1664525, seed) + 1013904223) | 0) >>> 0) / 4294967296;
}

// The brightest stars, as points that stay round and steady at every resolution.
export function brightStars(count = 900) {
  const rand = random(40213);
  const positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    sizes = new Float32Array(count);
  const d = new THREE.Vector3();
  for (let i = 0; i < count;) {
    d.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    const length = d.length();
    if (length > 1 || length < 0.1) continue;
    d.multiplyScalar(1 / length);
    const band = Math.exp(-((d.dot(SPACE.band) * 3.4) ** 2));
    if (rand() > 0.35 + band * 0.65) continue;
    d.toArray(positions, i * 3);
    const magnitude = rand() ** 4;
    sizes[i] = 1.4 + magnitude * 5.2;
    const t = rand();
    const tint =
      t < 0.2 ? [1, 0.74, 0.52] : t < 0.6 ? [1, 0.94, 0.86] : [0.7, 0.82, 1];
    const light = 0.35 + magnitude * 2.4;
    colors.set(
      tint.map((c) => c * light),
      i * 3,
    );
    i++;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color;
      uniform float uTime; uniform float uPixel;
      varying vec3 vColor; varying float vSpike;
      void main() {
        vec3 view = (viewMatrix * modelMatrix * vec4(position, 0.0)).xyz;
        gl_Position = projectionMatrix * vec4(view, 1.0);
        gl_Position.z = gl_Position.w * 0.99999;
        float twinkle = 0.86 + 0.14 * sin(uTime * (1.1 + size * 0.4) + position.x * 91.0 + position.z * 37.0);
        vColor = color * twinkle;
        vSpike = smoothstep(4.6, 6.2, size);
        gl_PointSize = size * uPixel * (1.0 + vSpike * 3.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vSpike;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float k = 1.0 + vSpike * 3.0;
        float r = length(c) * k;
        float light = exp(-r * r * 40.0) + exp(-r * r * 9.0) * 0.18;
        light += vSpike * 0.35 * (exp(-abs(c.x) * 90.0) * exp(-abs(c.y) * 9.0)
          + exp(-abs(c.y) * 90.0) * exp(-abs(c.x) * 9.0));
        gl_FragColor = vec4(vColor * light, 1.0);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Bright stars";
  points.frustumCulled = false;
  points.renderOrder = -9;
  return points;
}

// A distant star's glare, at infinity in its own direction; planets pass in front of it.
export function starGlare(
  direction,
  { size = 0.3, color = 0xd6e6ff, power = 2.6 } = {},
) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDir: { value: direction.clone() },
      uSize: { value: size },
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: /* glsl */ `
      uniform vec3 uDir; uniform float uSize;
      varying vec2 vUv;
      void main() {
        vUv = position.xy;
        vec3 centre = (viewMatrix * vec4(uDir, 0.0)).xyz;
        gl_Position = projectionMatrix * vec4(centre + vec3(position.xy * uSize, 0.0), 1.0);
        gl_Position.z = gl_Position.w * 0.99998;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uPower;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float light = exp(-r * r * 1400.0) * 9.0
          + exp(-r * r * 90.0) * 0.55
          + exp(-r * 7.0) * 0.16;
        light += exp(-abs(vUv.y) * 260.0) * exp(-abs(vUv.x) * 4.5) * 0.4;
        light += (exp(-abs(vUv.x) * 300.0) * exp(-abs(vUv.y) * 10.0)
          + exp(-abs(vUv.y) * 300.0) * exp(-abs(vUv.x) * 10.0)) * 0.5;
        light *= smoothstep(1.0, 0.55, r);
        gl_FragColor = vec4(uColor * light * uPower, 1.0);
      }`,
  });
  const glare = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  glare.name = "Distant star";
  glare.frustumCulled = false;
  glare.renderOrder = -8;
  return glare;
}

const RING = /* glsl */ `
  float ringDensity(float x) {
    float d = 0.56 + 0.22 * sin(x * 92.0) + 0.14 * sin(x * 241.0 + 1.3) + 0.12 * sin(x * 31.0 + 0.4);
    d *= smoothstep(0.0, 0.04, x) * smoothstep(1.0, 0.93, x);
    float wide = (x - 0.63) * 38.0, narrow = (x - 0.3) * 70.0;
    d *= 1.0 - 0.9 * exp(-wide * wide);
    d *= 1.0 - 0.55 * exp(-narrow * narrow);
    return clamp(d, 0.0, 1.0);
  }`;

const SURFACE_VERTEX = /* glsl */ `
  varying vec3 vPoint; varying vec3 vNormal; varying vec3 vWorld;
  void main() {
    vPoint = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

// Kinds: 0 an ocean world, 1 a banded giant, 2 a volcanic world, 3 a cratered moon.
export function planet({
  name,
  kind,
  radius,
  at,
  tilt = 0,
  seed = 0,
  ring = null,
}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(at);
  const uniforms = {
    uKind: { value: kind },
    uSun: { value: SPACE.sun.clone() },
    uTime: { value: 0 },
    uSeed: { value: seed },
    uCentre: { value: at.clone() },
    uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
    uRingSpan: { value: new THREE.Vector2(0, 0) },
  };
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 64),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SURFACE_VERTEX,
      fragmentShader: /* glsl */ `
        ${NOISE}
        ${RING}
        uniform float uKind; uniform vec3 uSun; uniform float uTime; uniform float uSeed;
        uniform vec3 uCentre; uniform vec3 uRingNormal; uniform vec2 uRingSpan;
        varying vec3 vPoint; varying vec3 vNormal; varying vec3 vWorld;
        void main() {
          vec3 p = normalize(vPoint) + uSeed;
          vec3 n = normalize(vNormal);
          vec3 v = normalize(cameraPosition - vWorld);
          float ndl = dot(n, uSun);
          float day = max(ndl, 0.0);
          float limb = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
          vec3 col;
          vec3 air;
          if (uKind < 0.5) {
            float w = fbm4(p * 2.1);
            float h = fbm6(p * 3.0 + w * 0.9);
            float land = smoothstep(0.53, 0.56, h);
            vec3 sea = mix(vec3(0.006, 0.035, 0.11), vec3(0.02, 0.12, 0.24), smoothstep(0.36, 0.53, h));
            vec3 ground = mix(vec3(0.11, 0.2, 0.08), vec3(0.4, 0.33, 0.2), smoothstep(0.57, 0.72, h));
            ground = mix(ground, vec3(0.46, 0.44, 0.42), smoothstep(0.74, 0.84, h));
            float ice = smoothstep(0.8, 0.93, abs(normalize(vPoint).y) + (h - 0.5) * 0.2);
            vec3 surface = mix(mix(sea, ground, land), vec3(0.82, 0.88, 0.93), ice);
            float cloud = smoothstep(0.54, 0.76, fbm6(p * 4.2 + vec3(uTime * 0.006, 0.0, 0.0) + w * 1.3));
            col = surface * day * 1.25 * (1.0 - cloud * 0.55);
            col += vec3(0.86, 0.9, 0.95) * cloud * day * 1.15;
            col += vec3(0.004, 0.01, 0.022) * (1.0 - day);
            vec3 halfway = normalize(uSun + v);
            col += vec3(1.0, 0.86, 0.66) * pow(max(dot(n, halfway), 0.0), 70.0)
              * (1.0 - land) * (1.0 - cloud) * 1.4 * step(0.0, ndl);
            air = vec3(0.28, 0.56, 1.0);
          } else if (uKind < 1.5) {
            vec3 q = normalize(vPoint);
            float swirl = fbm4(q * vec3(2.2, 9.0, 2.2) + vec3(uTime * 0.01, 0.0, uSeed));
            float lat = q.y + (swirl - 0.5) * 0.09;
            float bands = 0.5 + 0.5 * sin(lat * 23.0 + swirl * 2.4);
            float fine = 0.5 + 0.5 * sin(lat * 71.0 + swirl * 5.0);
            vec3 surface = mix(vec3(0.24, 0.13, 0.08), vec3(0.6, 0.44, 0.28), bands);
            surface = mix(surface, vec3(0.72, 0.62, 0.48), fine * 0.2);
            vec2 eye = vec2(atan(q.z, q.x + 1e-5) - 0.9, (q.y + 0.24) * 3.2);
            float storm = exp(-dot(eye, eye) * 22.0);
            surface = mix(surface, vec3(0.55, 0.22, 0.11), storm * 0.75);
            float soft = smoothstep(-0.12, 0.6, ndl);
            col = surface * soft * (0.55 + 0.45 * dot(n, v)) * 1.1;
            float across = dot(uSun, uRingNormal);
            float t = abs(across) > 1e-4 ? dot(uCentre - vWorld, uRingNormal) / across : -1.0;
            if (t > 0.0 && uRingSpan.y > 0.0) {
              float span = length(vWorld + uSun * t - uCentre);
              float x = (span - uRingSpan.x) / (uRingSpan.y - uRingSpan.x);
              if (x > 0.0 && x < 1.0) col *= 1.0 - ringDensity(x) * 0.75;
            }
            air = vec3(0.75, 0.6, 0.42);
          } else if (uKind < 2.5) {
            float w = fbm4(p * 1.5);
            float h = fbm6(p * 1.9 + w * 0.7);
            float crack = 1.0 - abs(fbm4(p * 4.0 + w * 2.0) * 2.0 - 1.0);
            vec3 surface = mix(vec3(0.24, 0.1, 0.055), vec3(0.56, 0.26, 0.12), smoothstep(0.3, 0.62, h));
            surface = mix(surface, vec3(0.72, 0.52, 0.36), smoothstep(0.68, 0.84, h));
            surface *= 0.9 + fbm4(p * 9.0) * 0.2;
            float frost = smoothstep(0.86, 0.96, abs(normalize(vPoint).y) + (h - 0.5) * 0.25);
            surface = mix(surface, vec3(0.8, 0.76, 0.74), frost);
            col = surface * smoothstep(-0.08, 0.5, ndl) * 1.1;
            float lava = smoothstep(0.93, 0.99, crack) * smoothstep(0.48, 0.34, h);
            col += vec3(1.3, 0.32, 0.06) * lava * smoothstep(0.1, -0.25, ndl);
            air = vec3(0.85, 0.5, 0.36);
          } else {
            float h = fbm6(p * 4.0);
            float pits = smoothstep(0.62, 0.7, fbm4(p * 9.0)) * 0.35;
            vec3 surface = mix(vec3(0.24, 0.23, 0.22), vec3(0.56, 0.54, 0.5), h) * (1.0 - pits);
            col = surface * day * 1.2;
            air = vec3(0.0);
          }
          float dusk = exp(-ndl * ndl * 30.0);
          col += air * limb * smoothstep(-0.25, 0.45, ndl) * 0.9;
          col += vec3(0.7, 0.32, 0.12) * dusk * 0.05 * step(0.01, length(air));
          gl_FragColor = vec4(col, 1.0);
          ${OUTPUT}
        }`,
    }),
  );
  body.name = `${name} surface`;
  body.rotation.z = tilt;
  group.add(body);
  if (kind !== 3) {
    const air = {
      0: [0.32, 0.6, 1.0],
      1: [0.8, 0.62, 0.42],
      2: [0.9, 0.45, 0.22],
    }[kind];
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.12, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uSun: uniforms.uSun,
          uColor: { value: new THREE.Color(...air) },
          uLimb: { value: Math.sqrt(1 - 1 / 1.12 ** 2) },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: SURFACE_VERTEX,
        fragmentShader: /* glsl */ `
          uniform vec3 uSun; uniform vec3 uColor; uniform float uLimb;
          varying vec3 vNormal; varying vec3 vWorld;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(cameraPosition - vWorld);
            float edge = smoothstep(0.0, uLimb, -dot(n, v));
            float glow = pow(edge, 2.4) * smoothstep(-0.3, 0.35, dot(n, uSun));
            gl_FragColor = vec4(uColor * glow * 0.55, 1.0);
            ${OUTPUT}
          }`,
      }),
    );
    shell.name = `${name} atmosphere`;
    group.add(shell);
  }
  if (ring) {
    const [inner, outer] = ring.span;
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(ring.turn);
    uniforms.uRingNormal.value.copy(normal);
    uniforms.uRingSpan.value.set(inner, outer);
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 192, 1),
      new THREE.ShaderMaterial({
        uniforms: {
          uSun: uniforms.uSun,
          uCentre: uniforms.uCentre,
          uPlanet: { value: radius },
          uSpan: { value: new THREE.Vector2(inner, outer) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        vertexShader: /* glsl */ `
          varying vec3 vWorld; varying vec3 vNormal; varying float vSpan;
          void main() {
            vSpan = length(position.xy);
            vNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }`,
        fragmentShader: /* glsl */ `
          ${RING}
          uniform vec3 uSun; uniform vec3 uCentre; uniform float uPlanet; uniform vec2 uSpan;
          varying vec3 vWorld; varying vec3 vNormal; varying float vSpan;
          void main() {
            float x = (vSpan - uSpan.x) / (uSpan.y - uSpan.x);
            float density = ringDensity(x);
            vec3 o = vWorld - uCentre;
            float b = dot(o, uSun);
            float shade = (b < 0.0 && b * b - dot(o, o) + uPlanet * uPlanet > 0.0) ? 0.1 : 1.0;
            vec3 v = normalize(cameraPosition - vWorld);
            float through = dot(vNormal, uSun) * dot(vNormal, v) < 0.0 ? 0.4 : 1.0;
            vec3 tint = mix(vec3(0.36, 0.28, 0.2), vec3(0.7, 0.6, 0.47), 0.5 + 0.5 * sin(x * 17.0 + 0.6));
            gl_FragColor = vec4(tint * shade * through, density * 0.72);
            ${OUTPUT}
          }`,
      }),
    );
    disc.name = `${name} rings`;
    disc.rotation.copy(ring.turn);
    group.add(disc);
  }
  group.userData.uniforms = uniforms;
  group.userData.body = body;
  return group;
}

function rockNoise(seed) {
  const rand = random(seed);
  const table = Array.from({ length: 512 }, () => rand());
  const at = (x, y, z) =>
    table[(((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % 512];
  const smooth = (t) => t * t * (3 - 2 * t);
  const value = (x, y, z) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      iz = Math.floor(z);
    const fx = smooth(x - ix),
      fy = smooth(y - iy),
      fz = smooth(z - iz);
    const lerp = (a, b, t) => a + (b - a) * t;
    const plane = (dz) =>
      lerp(
        lerp(at(ix, iy, iz + dz), at(ix + 1, iy, iz + dz), fx),
        lerp(at(ix, iy + 1, iz + dz), at(ix + 1, iy + 1, iz + dz), fx),
        fy,
      );
    return lerp(plane(0), plane(1), fz);
  };
  return (x, y, z) =>
    value(x, y, z) * 0.55 +
    value(x * 2.1, y * 2.1, z * 2.1) * 0.3 +
    value(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}

function rockGeometry(seed, stretch) {
  const noise = rockNoise(seed);
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    const n = noise(v.x * 1.7 + 4, v.y * 1.7 + 4, v.z * 1.7 + 4);
    const bumps = noise(v.x * 5 + 9, v.y * 5 + 9, v.z * 5 + 9);
    const r = 0.72 + n * 0.55 + bumps * 0.12;
    v.multiplyScalar(r).multiply(stretch);
    position.setXYZ(i, v.x, v.y, v.z);
    const shade = 0.55 + n * 0.55;
    colors.set([shade * 1.02, shade * 0.97, shade * 0.92], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Rock adrift at every depth, lit by the sun; each piece tumbles on its own axis.
export function asteroidField() {
  const rand = random(9071);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6e665e,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    fog: false,
  });
  const shapes = [
    new THREE.Vector3(1.3, 0.85, 0.95),
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(1.6, 0.7, 0.8),
    new THREE.Vector3(1.1, 0.9, 1.25),
  ].map((stretch, i) => rockGeometry(311 + i * 97, stretch));
  const rocks = [];
  const orbit = v3(-0.59, 0.14, -0.8);
  const point = new THREE.Vector3();
  const place = (count, near, far, small, large, flat) => {
    for (let placed = 0; placed < count;) {
      const angle = rand() * Math.PI * 2;
      const distance = near + (far - near) * Math.sqrt(rand());
      const x = Math.cos(angle) * distance,
        z = Math.sin(angle) * distance,
        y = (rand() - 0.5) * distance * flat - distance * 0.06;
      // Keep clear the camera's way out of the door, the lights' meeting and the line the
      // camera looks back along.
      if (Math.abs(x) < 10 && z < 6 && z > -48 && Math.abs(y - 1) < 8) continue;
      point.set(x, y, z);
      const along = THREE.MathUtils.clamp(point.dot(orbit), 0, 90);
      if (
        point.distanceTo(orbit.clone().multiplyScalar(along)) <
        10 + along * 0.08
      )
        continue;
      if (point.length() < 9) continue;
      rocks.push({
        at: new THREE.Vector3(x, y, z),
        size: small + (large - small) * rand() ** 2.2,
        axis: new THREE.Vector3(
          rand() - 0.5,
          rand() - 0.5,
          rand() - 0.5,
        ).normalize(),
        spin: (0.04 + rand() * 0.16) * (rand() < 0.5 ? -1 : 1),
        phase: rand() * Math.PI * 2,
        shape: Math.floor(rand() * shapes.length),
      });
      placed++;
    }
  };
  place(12, 10, 26, 0.08, 0.5, 0.8);
  place(34, 30, 100, 0.4, 2.4, 0.5);
  place(24, 120, 240, 2.5, 9, 0.4);
  const counts = shapes.map(() => 0);
  for (const rock of rocks) rock.slot = counts[rock.shape]++;
  const meshes = shapes.map((geometry, i) => {
    const mesh = new THREE.InstancedMesh(geometry, material, counts[i]);
    mesh.name = "Drifting rock";
    mesh.frustumCulled = false;
    return mesh;
  });
  const group = new THREE.Group();
  group.name = "Asteroid field";
  for (const mesh of meshes) group.add(mesh);
  const matrix = new THREE.Matrix4(),
    turn = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  const update = (time) => {
    for (const rock of rocks) {
      turn.setFromAxisAngle(rock.axis, rock.phase + time * rock.spin);
      matrix.compose(rock.at, turn, scale.setScalar(rock.size));
      meshes[rock.shape].setMatrixAt(rock.slot, matrix);
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  group.userData.animate = (time) => {
    update(time);
    group.rotation.y = time * 0.004;
  };
  return group;
}

// Fine dust close to the camera: the nearest depth cue while the shot moves.
export function spaceDust(count = 520) {
  const rand = random(5521);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++)
    positions.set(
      [(rand() - 0.5) * 90, (rand() - 0.5) * 40, (rand() - 0.5) * 90 - 10],
      i * 3,
    );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uPixel;
      varying float vLight;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.05 + position.z), cos(uTime * 0.04 + position.x), 0.0) * 0.6;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        float depth = -view.z;
        vLight = smoothstep(0.6, 3.0, depth) * smoothstep(60.0, 20.0, depth);
        gl_PointSize = clamp(9.0 / depth, 1.0, 3.5) * uPixel;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      varying float vLight;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(0.62, 0.66, 0.72) * smoothstep(0.5, 0.0, r) * vLight * 0.35, 1.0);
        ${OUTPUT}
      }`,
  });
  const dust = new THREE.Points(geometry, material);
  dust.name = "Space dust";
  dust.frustumCulled = false;
  return dust;
}
