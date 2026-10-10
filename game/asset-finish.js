import { barkSurface } from "./bark-surface.js";
import { finishCanopy } from "./leaf-surface.js";
import { mineralSurface } from "./mineral-surface.js";
import { weatherStone } from "./stone-weather.js";
import { detailPixels } from "./detail-pixels.js";
import { deferPixels } from "./pixel-jobs.js";

const mineralAssets = new Set([
  "basalt_spire",
  "boulder_cluster",
  "broken_column",
  "court_gallery",
  "fallen_head",
  "far_gate",
  "floating_isle",
  "glyph_stela",
  "guardian_colossus",
  "hill_castle",
  "light_pylon",
  "push_block",
  "rubble_pile",
  "ruin_arch",
  "ruin_column",
  "ruin_house",
  "ruin_rings",
  "ruin_temple",
  "ruin_tower",
  "stamp_plate",
  "temple_facade",
]);
export function mineralAsset(id) {
  return mineralAssets.has(id);
}
const mineralTile = 1.1;
const mineralStrength = 0.55;
const masonryAssets = new Set([
  "court_gallery",
  "hill_castle",
  "ruin_house",
  "ruin_tower",
]);
const erodedAssets = new Set([
  "basalt_spire",
  "boulder_cluster",
  "floating_isle",
  "rubble_pile",
]);

const archived = new Set([
  "hero_first",
  "hero_second",
  "hero_previous",
  "hero_explorer",
]);
const caches = new WeakMap();
const sharedSources = new WeakMap();
const sourcePixels = new WeakMap();
const noise = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function substance(id, mesh, material) {
  const name = `${mesh.name} ${material.name}`.toLowerCase();
  if (
    material.transparent ||
    (material.emissive?.getHex() > 0 && id !== "sea_kelp") ||
    /hair|eye|pupil|lens|glass|iris|teeth|mouth/.test(name)
  )
    return null;
  if (
    id === "hero_realistic" &&
    /skin|face|bare|anatom|head|brow|lash/.test(name)
  )
    return null;
  if (id === "reef_fish") return /scales|bands/.test(name) ? "scales" : null;
  if (id === "manta_ray") return "dentine";
  if (id === "forest_bird") return "feather";
  if (id === "forest_deer")
    return material.name === "stone" || /antler|horn|hoof/.test(name)
      ? "stone"
      : "fur";
  if (id === "frost_lynx") return /nose|skin/.test(name) ? "dentine" : "fur";
  if (id === "forest_boar")
    return /tusk|skin/.test(name)
      ? "dentine"
      : /hoof/.test(name)
        ? "stone"
        : "boar-coat";
  if (id === "sea_coral") return "coral";
  if (id === "field_scroll") return "paper";
  if (id === "clay_urns") return "ceramic";
  if (
    /fabric|canvas|scarf|strap|rope|thread|cloth|outfit|trouser|garment|shirt|pants|lace/.test(
      name,
    )
  )
    return "fabric";
  if (/timber|wood|bark/.test(name)) return "timber";
  if (/rubber|grip|boot|glove/.test(name)) return "rubber";
  if (material.metalness > 0.3 || material.name === "metal") return "metal";
  if (
    /ice|icicle|frozen/.test(id) ||
    (id === "snow_pine" && material.name !== "foliage")
  )
    return "ice";
  if (material.name === "foliage" || /agave|fern|grass|kelp/.test(id))
    return "leaf";
  if (material.name === "fabric" || /tent|scarf|rope|banner/.test(id))
    return "fabric";
  if (id === "twin_pistol")
    return material.roughness > 0.75 ? "rubber" : "metal";
  return "stone";
}

function pixels(texture) {
  const source = texture?.image;
  if (source?.data) return source;
  if (source?.getContext)
    return source
      .getContext("2d")
      .getImageData(0, 0, source.width, source.height);
  return null;
}

// A map's readable pixels, copied once per source version, with a key naming their content.
function readPixels(texture) {
  const source = texture?.source;
  if (!source) return null;
  const known = sourcePixels.get(source);
  if (known?.version === source.version) return known.pixels;
  const image = pixels(texture);
  let value = null;
  if (image) {
    value = {
      data: image.data.slice(),
      width: image.width,
      height: image.height,
    };
    const words = new Uint32Array(
      value.data.buffer,
      0,
      value.data.byteLength >> 2,
    );
    let a = 0x9e3779b9,
      b = 0x85ebca6b;
    for (let i = 0; i < words.length; i++) {
      a = Math.imul(a ^ words[i], 0x01000193);
      b = Math.imul((b ^ words[i]) + i, 0x5bd1e995);
      b ^= b >>> 15;
    }
    for (let i = words.length * 4; i < value.data.length; i++)
      a = Math.imul(a ^ value.data[i], 0x01000193);
    value.key = `${value.width}x${value.height}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
  }
  sourcePixels.set(source, { version: source.version, pixels: value });
  return value;
}

// Each map's pixels depend on its substance and its own source alone (albedo only on the source),
// so maps over equal pixels share one source and one upload.
function detailSource(THREE, output, kind, size, input) {
  if (!sharedSources.has(THREE)) sharedSources.set(THREE, new Map());
  const sources = sharedSources.get(THREE),
    key = `${output}:${output === "albedo" ? "any" : kind}:${size}:${input?.key ?? "none"}`;
  if (!sources.has(key)) {
    const image = deferPixels(
      "detail",
      { output, kind, size, source: input },
      () => detailPixels(output, kind, size, input),
    );
    sources.set(key, new THREE.Source(image("pixels", size)));
  }
  return sources.get(key);
}

function detailMaps(THREE, kind, material) {
  if (!caches.has(THREE)) caches.set(THREE, new Map());
  const cache = caches.get(THREE);
  const base = material.normalMap;
  const key = `${kind}:${base?.uuid || "flat"}:${material.map?.uuid || "plain"}:${material.roughnessMap?.uuid || "rough"}`;
  if (cache.has(key)) return cache.get(key);
  const size = ["leaf", "fur", "boar-coat", "feather", "dentine"].includes(kind)
    ? 256
    : 512;
  const original = readPixels(base),
    color = readPixels(material.map),
    rough = readPixels(material.roughnessMap);
  const texture = (output, reference, input) => {
    const value = new THREE.DataTexture(null, size, size);
    value.source = detailSource(THREE, output, kind, size, input);
    value.wrapS = value.wrapT = THREE.RepeatWrapping;
    value.magFilter = THREE.LinearFilter;
    value.minFilter = THREE.LinearMipmapLinearFilter;
    value.generateMipmaps = true;
    value.anisotropy = 4;
    if (reference) {
      value.repeat.copy(reference.repeat);
      value.offset.copy(reference.offset);
      value.center.copy(reference.center);
      value.rotation = reference.rotation;
    }
    value.userData.sharedAssetFinish = true;
    // A shared source already uploaded keeps its version, so it is not uploaded again.
    if (value.source.version === 0) value.needsUpdate = true;
    else value.version++;
    return value;
  };
  const result = {
    normalMap: base && !original ? base : texture("normal", base, original),
    roughnessMap:
      material.roughnessMap && !rough
        ? material.roughnessMap
        : texture("roughness", material.roughnessMap, rough),
  };
  if (!material.map || color) {
    result.map = texture("albedo", material.map, color);
    result.map.colorSpace = THREE.SRGBColorSpace;
  }
  cache.set(key, result);
  return result;
}

export function finishMaterial(THREE, original, kind = "stone") {
  if (original.userData.surfaceFinish === 2) return original;
  const material = original.clone();
  material.onBeforeCompile = original.onBeforeCompile;
  material.customProgramCacheKey = original.customProgramCacheKey;
  Object.assign(material, detailMaps(THREE, kind, original));
  const strength = ["fur", "boar-coat", "dentine", "paper"].includes(kind)
    ? 0.3
    : 0.65;
  material.normalScale = original.normalMap
    ? original.normalScale.clone()
    : new THREE.Vector2(strength, strength);
  material.userData.surfaceFinish = 2;
  return material;
}

function mappedGeometry(THREE, source, tile, matrix) {
  if (source.attributes.uv && !matrix) return source.clone();
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const positions = geometry.attributes.position;
  const uv = new Float32Array(positions.count * 2);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    if (matrix) {
      a.applyMatrix4(matrix);
      b.applyMatrix4(matrix);
      c.applyMatrix4(matrix);
    }
    b.sub(a);
    c.sub(a);
    normal.crossVectors(b, c).normalize();
    const x = Math.abs(normal.x),
      y = Math.abs(normal.y),
      z = Math.abs(normal.z);
    for (let j = i; j < i + 3; j++) {
      a.fromBufferAttribute(positions, j);
      if (matrix) a.applyMatrix4(matrix);
      const [u, v] =
        x >= y && x >= z
          ? [-a.z * (Math.sign(normal.x) || 1), a.y]
          : y >= z
            ? [a.x, -a.z * (Math.sign(normal.y) || 1)]
            : [a.x * (Math.sign(normal.z) || 1), a.y];
      uv[j * 2] = u / tile;
      uv[j * 2 + 1] = v / tile;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

export function finishAsset(
  THREE,
  root,
  id,
  { textures = true, mineral = textures } = {},
) {
  if (archived.has(id) || root.userData.assetFinish?.revision === 2)
    return root;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const extent = Math.max(...size.toArray(), 0.1);
  const materials = new Map();
  const kinds = new Set();
  const point = new THREE.Vector3();
  let meshes = 0;
  root.traverse((mesh) => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const original = mesh.material;
    const paletteBase =
      id === "boulder_cluster" && original.userData.boulderPaletteBase
        ? new THREE.Color(original.userData.boulderPaletteBase)
        : null;
    if (original.userData.canopyLeaf) {
      finishCanopy(THREE, mesh, { textures });
      kinds.add("canopy");
      meshes++;
      return;
    }
    const kind = substance(id, mesh, original);
    if (!kind) return;
    const detailedStone =
      mineral &&
      mineralAsset(id) &&
      kind === "stone" &&
      original.name === "stone" &&
      original.roughness >= 0.5;
    const geometry = mappedGeometry(
      THREE,
      mesh.geometry,
      detailedStone ? mineralTile : original.userData.tileMeters || 0.75,
      detailedStone ? mesh.matrixWorld : null,
    );
    kinds.add(kind);
    const key = `${original.uuid}:${kind}`;
    if (!materials.has(key)) {
      const material =
        textures && geometry.attributes.uv
          ? finishMaterial(THREE, original, kind)
          : original.clone();
      material.onBeforeCompile = original.onBeforeCompile;
      material.customProgramCacheKey = original.customProgramCacheKey;
      material.vertexColors = true;
      if (paletteBase) material.color.copy(paletteBase);
      if (
        textures &&
        kind === "timber" &&
        ["wild_tree", "giant_tree", "snow_pine"].includes(id)
      )
        barkSurface(THREE, material);
      if (detailedStone) {
        const masonry = masonryAssets.has(id),
          eroded = erodedAssets.has(id),
          // Fallen dressed blocks keep the dressed stone; strata read as split timber on them.
          court = id === "court_gallery" || id === "rubble_pile";
        mineralSurface(THREE, material, {
          strength: court
            ? 0.82
            : masonry
              ? 1.1
              : eroded
                ? 0.9
                : mineralStrength,
          tile: court
            ? 2.4 / mineralTile
            : masonry
              ? 3.1 / mineralTile
              : eroded
                ? 2.5 / mineralTile
                : 1,
          ...(masonry || eroded
            ? {
                source: new URL(
                  court
                    ? "./textures/court-sandstone-albedo.webp"
                    : masonry
                      ? "./textures/masonry-aged-albedo.webp"
                      : "./textures/rock-strata-albedo.webp",
                  import.meta.url,
                ).href,
              }
            : {}),
        });
        weatherStone(material, {
          strength: masonry ? 0.65 : 0.35,
          moss: id === "hill_castle" ? 0.55 : 0,
        });
      }
      if (textures && id === "wall_vine" && kind === "leaf")
        mineralSurface(THREE, material, {
          source: new URL("./textures/ivy-leaf-albedo.webp", import.meta.url)
            .href,
          strength: 0.55,
        });
      materials.set(key, material);
    }
    const positions = geometry.attributes.position;
    const previous = geometry.attributes.color;
    const paletteGain = paletteBase
      ? [
          original.color.r / paletteBase.r,
          original.color.g / paletteBase.g,
          original.color.b / paletteBase.b,
        ]
      : [1, 1, 1];
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      const vertical = (point.y - bounds.min.y) / Math.max(0.01, size.y);
      const wave =
        Math.sin((point.x * 19) / extent + Math.sin((point.z * 11) / extent)) *
        Math.cos((point.y * 13) / extent);
      const wear = ["stone", "ceramic", "timber"].includes(kind)
        ? 0.025 * (1 - vertical)
        : 0;
      const value = 0.985 + wave * 0.022 - wear;
      colors[i * 3] = (previous?.getX(i) ?? 1) * value * paletteGain[0];
      colors[i * 3 + 1] = (previous?.getY(i) ?? 1) * value * paletteGain[1];
      colors[i * 3 + 2] = (previous?.getZ(i) ?? 1) * value * paletteGain[2];
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    mesh.geometry = geometry;
    mesh.material = materials.get(key);
    meshes++;
  });
  root.userData.assetFinish = { revision: 2, id, meshes, kinds: [...kinds] };
  return root;
}
