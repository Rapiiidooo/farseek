import { weatherStone } from "./stone-weather.js";

export function projectStone(material, tile = 3.2) {
  if (material.userData.stoneProjection) return material;
  if (!material.userData.stoneWeather) weatherStone(material);
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_fragment>",
        `vec3 stoneSurfaceNormal = normalize(vStoneNormal);
        vec3 stoneWeights = pow(abs(stoneSurfaceNormal), vec3(4.0));
        stoneWeights /= max(dot(stoneWeights, vec3(1.0)), 0.0001);
        vec3 stoneCoordinates = vStonePosition / ${tile.toFixed(4)};
        vec2 stoneUvX = stoneCoordinates.zy * vec2(sign(stoneSurfaceNormal.x), 1.0);
        vec2 stoneUvY = stoneCoordinates.xz * vec2(1.0, -sign(stoneSurfaceNormal.y));
        vec2 stoneUvZ = stoneCoordinates.xy * vec2(-sign(stoneSurfaceNormal.z), 1.0);
        #ifdef USE_MAP
          diffuseColor *= texture2D(map, stoneUvX) * stoneWeights.x + texture2D(map, stoneUvY) * stoneWeights.y + texture2D(map, stoneUvZ) * stoneWeights.z;
        #endif`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          roughnessFactor *= texture2D(roughnessMap, stoneUvX).g * stoneWeights.x + texture2D(roughnessMap, stoneUvY).g * stoneWeights.y + texture2D(roughnessMap, stoneUvZ).g * stoneWeights.z;
        #endif`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 stoneNx = texture2D(normalMap, stoneUvX).xyz * 2.0 - 1.0;
          vec3 stoneNy = texture2D(normalMap, stoneUvY).xyz * 2.0 - 1.0;
          vec3 stoneNz = texture2D(normalMap, stoneUvZ).xyz * 2.0 - 1.0;
          stoneNx.xy *= normalScale; stoneNy.xy *= normalScale; stoneNz.xy *= normalScale;
          normal = normalize(getTangentFrame(-vViewPosition, normal, stoneUvX) * stoneNx * stoneWeights.x + getTangentFrame(-vViewPosition, normal, stoneUvY) * stoneNy * stoneWeights.y + getTangentFrame(-vViewPosition, normal, stoneUvZ) * stoneNz * stoneWeights.z);
        #endif`,
      );
  };
  material.customProgramCacheKey = () =>
    `${key()}|fd-stone-projection-1:${tile}`;
  material.userData.stoneProjection = { revision: 1, tile };
  return material;
}
