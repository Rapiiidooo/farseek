import { mineralColor, mineralBaseColor } from "./mineral-surface.js";

const FIELD = /* glsl */ `
varying vec3 vFDFrostWorld;
varying vec3 vFDFrostNormal;
float fdFrostHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fdFrostNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fdFrostHash(cell), fdFrostHash(cell + vec2(1.0, 0.0)), f.x),
    mix(fdFrostHash(cell + vec2(0.0, 1.0)), fdFrostHash(cell + vec2(1.0)), f.x), f.y);
}
`;

const COVER = /* glsl */ `
vec3 fdFrostPoint = vFDFrostWorld;
float fdFrostDrift = fdFrostNoise(fdFrostPoint.xz * 0.72 + fdFrostPoint.y * 0.17);
float fdFrostGrain = fdFrostNoise(fdFrostPoint.xz * 34.0);
float fdFrostSlope = smoothstep(0.28, 0.78, normalize(vFDFrostNormal).y);
float fdFrostCover = clamp(fdFrostSlope * (0.88 + fdFrostDrift * 0.12)
  + smoothstep(0.67, 0.9, fdFrostDrift) * 0.09, 0.0, 1.0);
vec3 fdFrostPowder = vec3(0.77, 0.85, 0.91) * (0.96 + fdFrostGrain * 0.04);
diffuseColor.rgb = mix(diffuseColor.rgb, fdFrostPowder, fdFrostCover);
`;

export function frostStone(root) {
  const materials = new Map();
  root.traverse((mesh) => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const original = mesh.material;
    if (
      !original.isMeshStandardMaterial ||
      original.transparent ||
      original.emissive.getHex() ||
      original.metalness > 0.3 ||
      original.userData.frostStone
    )
      return;
    if (!materials.has(original)) {
      const material = original.clone();
      const hook = original.onBeforeCompile;
      const key = original.customProgramCacheKey;
      const cold = mineralColor(original, 0x667885);
      const brightness = Math.max(...mineralBaseColor(original).toArray());
      material.color.lerp(cold, brightness > 0.1 ? 0.38 : 0.1);
      material.onBeforeCompile = function (shader, renderer) {
        hook.call(this, shader, renderer);
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vFDFrostWorld;\nvarying vec3 vFDFrostNormal;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvFDFrostWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFDFrostNormal = mat3(modelMatrix) * objectNormal;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\n" + FIELD)
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\n" + COVER,
          )
          .replace(
            "#include <roughnessmap_fragment>",
            "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, fdFrostCover);",
          )
          .replace(
            "#include <normal_fragment_maps>",
            "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, fdFrostCover * 0.74));",
          );
      };
      material.customProgramCacheKey = () =>
        key.call(original) + "|fd-frost-stone-v1";
      material.userData.frostStone = true;
      materials.set(original, material);
    }
    mesh.material = materials.get(original);
  });
  return root;
}
