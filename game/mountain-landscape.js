import * as THREE from "three";
import mountainRidge from "./assets/mountain_ridge.js";
import { mineralSurface, mineralSurfaceReady } from "./mineral-surface.js";
import { weatherStone } from "./stone-weather.js";
import { projectStone } from "./stone-projection.js";
import { prebuild, prebuiltTree } from "./offload.js";

const RIDGE = new URL("./assets/mountain_ridge.js", import.meta.url).href;
const ridgeOptions = (id) => ({
  segments: id === "court" || id === "two" ? [80, 64] : [144, 112],
});
for (const id of ["court", "four"]) prebuild(RIDGE, ridgeOptions(id));

export const LANDSCAPE_RANGES = {
  court: [
    [[15, -18, -150], [2.4, 1.6, 1.4], 0.1, 0xa68f74, null, 0.0032],
    [[-180, -24, -65], [1.9, 1.6, 1.3], 1.1, 0x9b866f, null, 0.0038],
  ],
  two: [[[0, -25, -225], [2.4, 1.9, 1.3], 0.25, 0x50495b, null, 0.0036]],
  four: [
    [[-90, -20, -340], [2.8, 3.1, 1.7], 0.15, 0x566273, 0xe9f2f6, 0.0021],
    [[235, -26, -72], [1.7, 2.2, 1.8], 1.57, 0x647182, 0xe9f2f6, 0.0027],
    [[-245, -22, -85], [1.8, 2.4, 1.9], -1.57, 0x566273, 0xe9f2f6, 0.0027],
    [[65, -28, -650], [3.5, 4.5, 1.7], -0.2, 0x7b8697, 0xe9f2f6, 0.0026],
  ],
  five: [
    [[-30, -12, -580], [4.6, 2.7, 1.8], 0.02, 0x8d9481, null, 0.002],
    [[-420, -15, -340], [2.1, 2.2, 1.8], 0.5, 0x747e68, null, 0.0024],
  ],
};

function distanceHaze(material, color, density) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  material.fog = false;
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.landscapeHazeColor = { value: color };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vLandscapeDistance;",
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvLandscapeDistance = length(mvPosition.xyz);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 landscapeHazeColor;\nvarying float vLandscapeDistance;",
      )
      .replace(
        "#include <fog_fragment>",
        `float landscapeHaze = min(0.86, 1.0 - exp(-pow(vLandscapeDistance * ${density.toFixed(5)}, 2.0)));
       gl_FragColor.rgb = mix(gl_FragColor.rgb, landscapeHazeColor, landscapeHaze);`,
      );
  };
  material.customProgramCacheKey = () =>
    `${key()}|fd-landscape-haze-1:${density}`;
}

export function buildMountainRanges(scene, id) {
  const root = new THREE.Group();
  root.name = `${id}-mountain-landscape`;
  for (const [
    position,
    scale,
    yaw,
    rockHex,
    snowHex,
    density,
  ] of LANDSCAPE_RANGES[id] || []) {
    const ridge =
      prebuiltTree(RIDGE, ridgeOptions(id)) ??
      mountainRidge(THREE, ridgeOptions(id));
    const mesh = ridge.children[0],
      geometry = mesh.geometry;
    const p = geometry.attributes.position,
      n = geometry.attributes.normal,
      c = geometry.attributes.color;
    const rock = new THREE.Color(rockHex),
      snow = new THREE.Color(snowHex ?? rockHex),
      tint = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const high = THREE.MathUtils.smoothstep(
        p.getY(i) + Math.sin(p.getX(i) * 0.19 + p.getZ(i) * 0.13) * 4,
        24,
        43,
      );
      const cover = snowHex
        ? high * THREE.MathUtils.smoothstep(n.getY(i), 0.35, 0.8)
        : 0;
      tint.copy(rock).lerp(snow, cover).multiplyScalar(c.getY(i));
      c.setXYZ(i, tint.r, tint.g, tint.b);
    }
    mesh.material.color.set(0xffffff);
    mesh.material.side = THREE.FrontSide;
    mineralSurface(THREE, mesh.material, {
      source: new URL("./textures/rock-strata-albedo.webp", import.meta.url)
        .href,
      strength: 0.8,
    });
    weatherStone(mesh.material, { strength: 0.45 });
    projectStone(mesh.material, 8.5);
    distanceHaze(
      mesh.material,
      scene.fog?.color || new THREE.Color(0xaab8ad),
      density,
    );
    ridge.position.fromArray(position);
    ridge.scale.fromArray(scale);
    ridge.rotation.y = yaw;
    mesh.castShadow = mesh.receiveShadow = false;
    root.add(ridge);
  }
  root.userData.landscape = {
    revision: 1,
    id,
    ranges: root.children.length,
    triangles: root.children.reduce(
      (total, ridge) => total + ridge.userData.landscape.triangles,
      0,
    ),
  };
  scene.add(root);
  return root;
}

export async function finishWorldLandscape(instance, id) {
  if (instance.landscapeReady) return;
  if (id === "court" || id === "two")
    instance.ranges = buildMountainRanges(instance.scene, id);
  if (id === "four") {
    const material = instance.frozen.mat.rock;
    mineralSurface(THREE, material, {
      source: new URL("./textures/rock-strata-albedo.webp", import.meta.url)
        .href,
      tile: 3.2 / 2.4,
      strength: 1.15,
    });
    weatherStone(material, { strength: 0.6 });
  }
  await mineralSurfaceReady(instance.scene);
  instance.landscapeReady = true;
}
