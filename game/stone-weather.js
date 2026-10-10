export function weatherStone(material, { strength = 0.2, moss = 0 } = {}) {
  if (material.userData.stoneWeather) return material;
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vStonePosition;\nvarying vec3 vStoneNormal;",
      )
      .replace(
        "#include <defaultnormal_vertex>",
        "#include <defaultnormal_vertex>\nvStoneNormal = inverseTransformDirection(transformedNormal, viewMatrix);",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 stonePosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          stonePosition = instanceMatrix * stonePosition;
        #endif
        vStonePosition = (modelMatrix * stonePosition).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vStonePosition;
        varying vec3 vStoneNormal;
        float stoneHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float stoneNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(stoneHash(i), stoneHash(i + vec3(1,0,0)), f.x), mix(stoneHash(i + vec3(0,1,0)), stoneHash(i + vec3(1,1,0)), f.x), f.y), mix(mix(stoneHash(i + vec3(0,0,1)), stoneHash(i + vec3(1,0,1)), f.x), mix(stoneHash(i + vec3(0,1,1)), stoneHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float stoneMacro = stoneNoise(vStonePosition * 0.43);
        float stoneStreak = stoneNoise(vStonePosition * vec3(1.5, 0.055, 1.5));
        float stoneFlake = stoneNoise(vStonePosition * 4.7);
        float stoneWeather = clamp(stoneMacro * 0.5 + stoneStreak * 0.36 + stoneFlake * 0.14, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.62 + stoneWeather * 0.56, ${strength.toFixed(4)});
        float stoneMoss = smoothstep(0.44, 0.73, stoneMacro + stoneStreak * 0.18) * (0.35 + 0.65 * max(vStoneNormal.y, 0.0)) * ${moss.toFixed(4)};
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.54, 0.72, 0.36), stoneMoss);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (1.0 - stoneWeather) * ${Math.min(0.2, strength * 0.24).toFixed(4)} + stoneMoss * 0.12, 0.45, 1.0);`,
      );
  };
  material.customProgramCacheKey = () =>
    `${key()}|fd-stone-weather-1:${strength}:${moss}`;
  material.userData.stoneWeather = { revision: 1, strength, moss };
  return material;
}
