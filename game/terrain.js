import * as THREE from "three";
import { surface } from "./surfaces.js";
import { finishMaterial } from "./asset-finish.js";
import { mineralSurface } from "./mineral-surface.js";
import { weatherStone } from "./stone-weather.js";

// The ruin's rock, floors and sand, built from the height map as merged box faces with
// world-space UVs. Materials carry a small shader patch: strata and a dark foot on rock,
// staggered flagstones on the court floor, ripples in the sand. The rig chains onto these
// hooks, so fog and shadows still apply.

const NOISE = /* glsl */ `
varying vec3 vFDWorld;
varying vec3 vFDNormal;
uniform sampler2D uAO;
uniform vec4 uAOBox;
float fdAO(vec2 xz) { return texture2D(uAO, (xz - uAOBox.xy) / uAOBox.zw).r; }
float fdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fdNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fdHash(i), fdHash(i + vec2(1, 0)), u.x), mix(fdHash(i + vec2(0, 1)), fdHash(i + vec2(1, 1)), u.x), u.y);
}
`;

const TINTS = {
  dressed: /* glsl */ `{
    vec3 p = vFDWorld;
    float grain = fdNoise(p.xz * 11.0 + p.y * 7.0);
    float mineral = fdNoise(p.xy * 1.4 + p.z * 0.35);
    vec3 tint = mix(vec3(0.91, 0.87, 0.82), vec3(1.04, 1.01, 0.96), mineral);
    diffuseColor.rgb *= tint * mix(0.97, 1.02, grain);
  }`,
  rock: /* glsl */ `{
    vec3 p = vFDWorld;
    float warp = fdNoise(p.xz * 0.13) * 1.8 + fdNoise(p.zx * 0.41) * 0.5;
    float band = sin(p.y * 1.7 + warp) * 0.5 + 0.5;
    float fine = sin(p.y * 6.1 + warp * 2.3) * 0.5 + 0.5;
    float n = fdNoise(p.xz * 0.8 + vec2(p.y * 0.6));
    vec3 tint = mix(vec3(0.9, 0.87, 0.83), vec3(1.04, 1.02, 0.98), band * 0.6 + fine * 0.22 + n * 0.18);
    tint *= mix(0.7, 1.0, smoothstep(-1.5, 2.4, p.y));
    diffuseColor.rgb *= tint;
  }`,
  floor: /* glsl */ `{
    vec2 q = vFDWorld.xz * vec2(0.85, 1.15);
    float row = floor(q.y);
    q.x += fdHash(vec2(row, 3.1)) * 0.9;
    vec2 cell = floor(q), f = fract(q);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float seam = smoothstep(0.012, 0.05, edge);
    float h = fdHash(cell);
    vec3 tint = mix(vec3(0.84, 0.78, 0.72), vec3(1.06, 1.0, 0.93), h);
    tint *= mix(0.5, 1.0, seam);
    float drift = smoothstep(0.58, 0.85, fdNoise(vFDWorld.xz * 0.11) + fdNoise(vFDWorld.xz * 0.47) * 0.28);
    tint = mix(tint, vec3(1.13, 1.03, 0.86), drift * 0.75);
    diffuseColor.rgb *= tint * fdAO(vFDWorld.xz);
  }`,
  sand: /* glsl */ `{
    vec2 p = vFDWorld.xz;
    float ripple = sin(p.x * 3.1 + sin(p.y * 0.7) * 2.0 + fdNoise(p * 0.6) * 3.0) * 0.5 + 0.5;
    vec3 tint = mix(vec3(0.9, 0.84, 0.76), vec3(1.06, 1.0, 0.92), ripple);
    diffuseColor.rgb *= tint * mix(0.9, 1.05, fdNoise(p * 0.3)) * mix(1.0, fdAO(p), 0.7);
  }`,
  // Dressed stone: coursed blocks on the faces, worn slabs on top, as the builders cut them.
  masonry: /* glsl */ `{
    vec3 p = vFDWorld;
    vec3 nrm = normalize(vFDNormal);
    vec3 tint;
    if (abs(nrm.y) > 0.5) {
      vec2 q = p.xz * 0.72;
      float row = floor(q.y);
      q.x += fdHash(vec2(row, 7.7)) * 0.8;
      vec2 cell = floor(q), f = fract(q);
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      tint = mix(vec3(0.86, 0.8, 0.74), vec3(1.05, 0.99, 0.92), fdHash(cell));
      tint *= mix(0.6, 1.0, smoothstep(0.01, 0.06, edge));
      tint *= mix(1.0, fdAO(p.xz), 0.6);
    } else {
      float u = abs(nrm.x) > 0.5 ? p.z : p.x;
      float course = floor(p.y / 0.55);
      float len = 1.1 + fdHash(vec2(course, 9.1)) * 0.7;
      float along = (u + fdHash(vec2(course, 1.3)) * 3.0) / len;
      float block = floor(along);
      float fu = fract(along), fv = fract(p.y / 0.55);
      float edge = min(min(fu, 1.0 - fu) * len * 1.8, min(fv, 1.0 - fv));
      float chip = fdNoise(p.xz * 3.0 + p.y * 2.0);
      float seam = smoothstep(0.015, 0.07 + chip * 0.05, edge);
      tint = mix(vec3(0.78, 0.7, 0.62), vec3(1.06, 0.98, 0.9), fdHash(vec2(block, course)));
      tint *= mix(0.5, 1.0, seam);
      tint *= mix(0.72, 1.0, smoothstep(-1.0, 1.4, p.y));
    }
    diffuseColor.rgb *= tint;
  }`,
};

// A 1x1 white texture: no occlusion until a level supplies its own.
const NO_AO = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
NO_AO.needsUpdate = true;
export const aoField = { texture: NO_AO, box: new THREE.Vector4(0, 0, 1, 1) };

// `ao: false` for ground outside the first court, which the court's occlusion map does not cover.
export function terrainMaterial(
  kind,
  color,
  roughness = 0.94,
  { ao = true } = {},
) {
  const recipe = kind === "sand" ? "ground" : "stone";
  if (kind === "masonry") roughness = Math.min(roughness, 0.88);
  const s = surface(THREE, recipe, 512);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness,
    map: s.map,
    roughnessMap: s.roughnessMap,
    normalMap: s.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
  m.name = recipe;
  m.userData.tileMeters = s.tileMeters * (kind === "rock" ? 2.2 : 1.6);
  m.userData.rough = kind === "rock";
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uAO = {
      get value() {
        return ao ? aoField.texture : NO_AO;
      },
    };
    shader.uniforms.uAOBox = {
      get value() {
        return aoField.box;
      },
    };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vFDWorld;\nvarying vec3 vFDNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFDWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFDNormal = mat3(modelMatrix) * objectNormal;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + NOISE)
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n" + TINTS[kind],
      );
  };
  m.customProgramCacheKey = () =>
    "fd-terrain-" + kind + (kind === "rock" ? "-mineral-1" : "");
  const material = finishMaterial(
    THREE,
    m,
    kind === "sand" ? "paper" : "stone",
  );
  if (kind !== "rock") return material;
  mineralSurface(THREE, material, {
    source: new URL("./textures/rock-strata-albedo.webp", import.meta.url).href,
    tile: 3.2 / m.userData.tileMeters,
    strength: 1.15,
  });
  return weatherStone(material, { strength: 0.65 });
}

// Collects box faces per material and builds one mesh for each.
export class FaceBuilder {
  constructor(bounds = null) {
    this.buckets = new Map();
    this.mortar = new Map();
    this.bounds = bounds;
  }

  bucket(material) {
    if (!this.buckets.has(material))
      this.buckets.set(material, { pos: [], nor: [], uv: [] });
    return this.buckets.get(material);
  }

  masonryBox(
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    side,
    top = side,
    { bevel = 0.065, roundedTop = true } = {},
  ) {
    const rowHeight = 0.48;
    const first = Math.max(
      minY,
      Math.floor(Math.min(0, maxY - rowHeight) / rowHeight) * rowHeight,
    );
    if (!this.mortar.has(side)) {
      const mortar = side.clone();
      mortar.color.multiplyScalar(0.66);
      mortar.onBeforeCompile = side.onBeforeCompile;
      mortar.customProgramCacheKey = side.customProgramCacheKey;
      this.mortar.set(side, mortar);
    }
    const inset = roundedTop ? bevel : 0.03;
    this.box(
      minX + inset,
      minY,
      minZ + inset,
      maxX - inset,
      maxY - (roundedTop ? bevel : 0.02),
      maxZ - inset,
      this.mortar.get(side),
      top,
      true,
    );
    for (let y = first, row = 0; y < maxY - 0.001; y += rowHeight, row++) {
      const y1 = Math.min(y + rowHeight, maxY),
        last = y1 === maxY;
      const horizontal = maxX - minX >= maxZ - minZ;
      const length = horizontal ? maxX - minX : maxZ - minZ;
      const start = horizontal ? minX : minZ;
      let along = start;
      while (along < start + length - 0.001) {
        const blockLength = 0.85 + hash3(along + row * 0.3, y, minZ) * 0.42;
        const candidate = Math.min(start + length, along + blockLength);
        const end =
          start + length - candidate < 0.18 ? start + length : candidate;
        const x0 = horizontal ? along : minX,
          x1 = horizontal ? end : maxX,
          z0 = horizontal ? minZ : along,
          z1 = horizontal ? maxZ : end;
        const gap = 0.008,
          cap = last && roundedTop;
        const wear = bevel * (0.75 + hash3(along, y + 3, minZ) * 0.5);
        this.chamferedBox(
          x0 + (horizontal && along > start ? gap : 0),
          y + (row ? gap : 0),
          z0 + (!horizontal && along > start ? gap : 0),
          x1 - (horizontal && end < start + length ? gap : 0),
          y1 - (last ? 0 : gap),
          z1 - (!horizontal && end < start + length ? gap : 0),
          side,
          last ? top : side,
          wear,
          cap,
          last,
        );
        along = end;
      }
    }
  }

  chamferedBox(
    x0,
    y0,
    z0,
    x1,
    y1,
    z1,
    side,
    top,
    bevel,
    roundedTop,
    exposedTop = true,
  ) {
    const cut = Math.min(
      bevel,
      (x1 - x0) * 0.2,
      (z1 - z0) * 0.2,
      (y1 - y0) * 0.3,
    );
    const ring = (inset, y) => {
      const a = x0 + inset,
        b = x1 - inset,
        c = z0 + inset,
        d = z1 - inset;
      const r = Math.max(0.001, cut - inset * 0.5);
      return [
        [a + r, y, c],
        [b - r, y, c],
        [b, y, c + r],
        [b, y, d - r],
        [b - r, y, d],
        [a + r, y, d],
        [a, y, d - r],
        [a, y, c + r],
      ];
    };
    const low = ring(0, y0),
      high = ring(0, y1 - (roundedTop ? cut : 0)),
      cap = ring(roundedTop ? cut * 0.6 : 0, y1);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const face = [low[j], low[i], high[i], high[j]];
      this.quad(side, faceNormal(face), face);
      if (roundedTop) {
        const rim = [high[j], high[i], cap[i], cap[j]];
        this.quad(top, faceNormal(rim), rim);
      }
    }
    if (!exposedTop) return;
    const bucket = this.bucket(top),
      tile = top.userData.tileMeters || 1.7;
    for (let i = 1; i < 7; i++)
      for (const point of [cap[0], cap[i + 1], cap[i]]) {
        bucket.pos.push(...point);
        bucket.nor.push(0, 1, 0);
        bucket.uv.push(point[0] / tile, -point[2] / tile);
      }
  }

  box(minX, minY, minZ, maxX, maxY, maxZ, side, top = side, skipTop = false) {
    const faces = [
      [
        side,
        [0, -1, 0],
        [
          [minX, minY, minZ],
          [maxX, minY, minZ],
          [maxX, minY, maxZ],
          [minX, minY, maxZ],
        ],
      ],
      [
        side,
        [1, 0, 0],
        [
          [maxX, minY, maxZ],
          [maxX, minY, minZ],
          [maxX, maxY, minZ],
          [maxX, maxY, maxZ],
        ],
      ],
      [
        side,
        [-1, 0, 0],
        [
          [minX, minY, minZ],
          [minX, minY, maxZ],
          [minX, maxY, maxZ],
          [minX, maxY, minZ],
        ],
      ],
      [
        side,
        [0, 0, 1],
        [
          [minX, minY, maxZ],
          [maxX, minY, maxZ],
          [maxX, maxY, maxZ],
          [minX, maxY, maxZ],
        ],
      ],
      [
        side,
        [0, 0, -1],
        [
          [maxX, minY, minZ],
          [minX, minY, minZ],
          [minX, maxY, minZ],
          [maxX, maxY, minZ],
        ],
      ],
    ];
    if (!skipTop)
      faces.push([
        top,
        [0, 1, 0],
        [
          [minX, maxY, maxZ],
          [maxX, maxY, maxZ],
          [maxX, maxY, minZ],
          [minX, maxY, minZ],
        ],
      ]);
    const o = this.bounds;
    for (const [mat, n, quad] of faces) {
      if (o) {
        const p = quad[0];
        if ((n[0] < 0 && p[0] <= o.minX) || (n[0] > 0 && p[0] >= o.maxX))
          continue;
        if ((n[2] < 0 && p[2] <= o.minZ) || (n[2] > 0 && p[2] >= o.maxZ))
          continue;
      }
      this.quad(mat, n, quad);
    }
  }

  quad(mat, n, quad) {
    const b = this.bucket(mat);
    const tile = mat.userData.tileMeters || 1.7;
    const uvOf = ([x, y, z]) =>
      n[0]
        ? [z / tile, y / tile]
        : n[2]
          ? [x / tile, y / tile]
          : [x / tile, -z / tile];
    const [a, , c] = [quad[0], quad[1], quad[2]];
    const width = Math.hypot(quad[1][0] - a[0], quad[1][2] - a[2]),
      height = c[1] - quad[1][1];
    // Rock faces are cut into facets and pressed inward by a strata-aligned noise, so a
    // cliff reads as weathered stone rather than a box. Borders stay straight: ledges and
    // corners keep the edge the explorer's hands and the neighbouring faces rely on.
    if (!mat.userData.rough || n[1] !== 0 || width < 1.2 || height < 1.2) {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        b.pos.push(...quad[i]);
        b.nor.push(...n);
        b.uv.push(...uvOf(quad[i]));
      }
      return;
    }
    const nu = Math.max(2, Math.round(width / 0.95)),
      nv = Math.max(2, Math.round(height / 0.95));
    const p0 = quad[0],
      pu = [quad[1][0] - p0[0], 0, quad[1][2] - p0[2]];
    const grid = [];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        let u = i / nu,
          v = j / nv;
        // Interior points jitter so the facets are irregular.
        if (i > 0 && i < nu)
          u += (hash3(p0[0] + i, p0[1] + j, p0[2]) - 0.5) * (0.6 / nu);
        if (j > 0 && j < nv)
          v += (hash3(p0[0] - j, p0[1] + i, p0[2] + 7) - 0.5) * (0.6 / nv);
        const x = p0[0] + pu[0] * u,
          y = p0[1] + height * v,
          z = p0[2] + pu[2] * u;
        const edge = Math.min(
          u * width,
          (1 - u) * width,
          v * height,
          (1 - v) * height,
        );
        const d = rockDepth(x, y, z) * smoothstep(0, 0.7, edge);
        grid.push([x - n[0] * d, y, z - n[2] * d]);
      }
    const at = (i, j) => grid[j * (nu + 1) + i];
    const normalGrid = new Map();
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const a = at(Math.max(0, i - 1), j),
          b = at(Math.min(nu, i + 1), j);
        const c = at(i, Math.max(0, j - 1)),
          d = at(i, Math.min(nv, j + 1));
        const normal = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
          .cross(new THREE.Vector3(d[0] - c[0], d[1] - c[1], d[2] - c[2]))
          .normalize();
        const edge = Math.min(
          (i / nu) * width,
          ((nu - i) / nu) * width,
          (j / nv) * height,
          ((nv - j) / nv) * height,
        );
        normal
          .lerp(new THREE.Vector3(...n), 1 - smoothstep(0, 0.7, edge))
          .normalize();
        normalGrid.set(at(i, j), normal);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        for (const tri of [
          [q[0], q[1], q[2]],
          [q[0], q[2], q[3]],
        ]) {
          for (const pt of tri) {
            b.pos.push(...pt);
            b.nor.push(...normalGrid.get(pt).toArray());
            b.uv.push(...uvOf(pt));
          }
        }
      }
  }

  build(group) {
    for (const [mat, b] of this.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

// Merges equal-height cells into rectangles, row runs first.
export function greedyRects(map, heightOf, skip = () => false) {
  const rows = map.length,
    cols = map[0].length;
  const used = map.map((r) => [...r].map(() => false));
  const rects = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (used[j][i] || skip(map[j][i])) continue;
      const ch = map[j][i];
      let i1 = i;
      while (i1 + 1 < cols && !used[j][i1 + 1] && map[j][i1 + 1] === ch) i1++;
      let j1 = j;
      grow: while (j1 + 1 < rows) {
        for (let k = i; k <= i1; k++)
          if (used[j1 + 1][k] || map[j1 + 1][k] !== ch) break grow;
        j1++;
      }
      for (let jj = j; jj <= j1; jj++)
        for (let k = i; k <= i1; k++) used[jj][k] = true;
      rects.push({ i0: i, i1, j0: j, j1, ch, h: heightOf(ch) });
    }
  return rects;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function noise3(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = x - xi,
    yf = y - yi,
    zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf),
    v = s(yf),
    w = s(zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

// How far a rock face is worn back at a point: broad weathering plus horizontal strata.
function rockDepth(x, y, z) {
  const broad =
    noise3(x * 0.3, y * 0.45, z * 0.3) * 0.65 +
    noise3(x * 0.9, y * 1.1, z * 0.9) * 0.35;
  const strata = Math.pow(Math.abs(Math.sin(y * 1.55 + broad * 2.2)), 4);
  return 0.08 + 0.38 * broad + 0.16 * strata;
}

function faceNormal([a, b, c]) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
