import * as Engine from "three";
import headData from "./assets/explorer/head.js";
import hairData from "./assets/explorer/hair.js";
import browData from "./assets/explorer/brows.js";
import leftEyeData from "./assets/explorer/left-eye.js";
import rightEyeData from "./assets/explorer/right-eye.js";

const maps = {};
if (typeof document !== "undefined") {
  const loader = new Engine.TextureLoader();
  await Promise.all(
    ["skin", "hair", "brows", "eyes"].map(async (name) => {
      const map = await loader.loadAsync(
        new URL(`./assets/explorer/${name}.webp`, import.meta.url).href,
      );
      map.colorSpace = Engine.SRGBColorSpace;
      map.anisotropy = 8;
      maps[name] = map;
    }),
  );
}

function decode(value, Type) {
  const bytes = Uint8Array.from(atob(value), (character) =>
    character.charCodeAt(0),
  );
  return new Type(bytes.buffer);
}

function geometry(THREE, data) {
  const geo = new THREE.BufferGeometry();
  const position = decode(data.position, Float32Array);
  for (let i = 1; i < position.length; i += 3) position[i] -= 1.52;
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geo.setAttribute(
    "normal",
    new THREE.BufferAttribute(decode(data.normal, Int16Array), 3, true),
  );
  geo.setAttribute(
    "uv",
    new THREE.BufferAttribute(decode(data.uv, Uint16Array), 2, true),
  );
  geo.setIndex(new THREE.BufferAttribute(decode(data.index, Uint16Array), 1));
  for (const [name, values] of Object.entries(data.morphs)) {
    const offsets = decode(values, Int32Array);
    const target = new Float32Array(position.length);
    for (let i = 0; i < offsets.length; i += 4)
      for (let axis = 0; axis < 3; axis++)
        target[offsets[i] * 3 + axis] = offsets[i + axis + 1] / 1000000;
    const attribute = new THREE.BufferAttribute(target, 3);
    attribute.name = name;
    (geo.morphAttributes.position ??= []).push(attribute);
  }
  geo.morphTargetsRelative = true;
  return geo;
}

function skinDetail(THREE) {
  const size = 512;
  const values = new Uint8Array(size * size * 4);
  let seed = 74183;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < values.length; i += 4) {
    values[i] = 128 + Math.round((random() - 0.5) * 44);
    values[i + 1] = 128 + Math.round((random() - 0.5) * 44);
    values[i + 2] = 254;
    values[i + 3] = 255;
  }
  const normal = new THREE.DataTexture(values, size, size);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(5, 5);
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.magFilter = THREE.LinearFilter;
  normal.generateMipmaps = true;
  normal.needsUpdate = true;
  return normal;
}

function softenExpression(THREE, geo) {
  const position = geo.getAttribute("position");
  const bell = (value, center, radius) =>
    Math.exp(-(((value - center) / radius) ** 2));
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i),
      across = Math.abs(x),
      front = THREE.MathUtils.smoothstep(z, 0.035, 0.065),
      browBand =
        bell(y, 0.123, 0.017) *
        THREE.MathUtils.smoothstep(y, 0.112, 0.121) *
        front,
      innerBrow = bell(across, 0.014, 0.026),
      arch = bell(across, 0.037, 0.013);
    position.setXYZ(
      i,
      x,
      y + (innerBrow * 0.005 - arch * 0.0016) * browBand,
      z - innerBrow * browBand * 0.0008,
    );
  }
  return geo;
}

export function attachRealisticFace(THREE, model, { friendly = false } = {}) {
  const head = model.userData.joints.head;
  for (const child of [...head.children]) head.remove(child);
  const skin = new THREE.MeshPhysicalMaterial({
    name: "explorer-skin",
    color: maps.skin ? 0xf1d4ba : 0xbd8867,
    map: maps.skin || null,
    roughness: 0.54,
    metalness: 0,
    normalMap: skinDetail(THREE),
    normalScale: new THREE.Vector2(0.19, 0.19),
    sheen: 0.13,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0xaa6654),
    specularIntensity: 0.48,
    clearcoat: 0.055,
    clearcoatRoughness: 0.48,
  });
  const faceGeometry = geometry(THREE, headData);
  if (friendly) softenExpression(THREE, faceGeometry);
  const face = new THREE.Mesh(faceGeometry, skin);
  face.name = "explorerFace";
  head.add(face);
  const hairMaterial = new THREE.MeshPhysicalMaterial({
    name: "explorer-hair",
    color: 0xbaa18b,
    map: maps.hair || null,
    alphaTest: 0.4,
    alphaToCoverage: true,
    roughness: 0.73,
    specularIntensity: 0.25,
    sheen: 0.28,
    sheenColor: new THREE.Color(0x8d6450),
    sheenRoughness: 0.65,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const hair = new THREE.Mesh(geometry(THREE, hairData), hairMaterial);
  hair.name = "explorerHair";
  head.add(hair);
  (model.userData.secondary ??= {}).hairTail = hair;
  const browGeometry = geometry(THREE, browData);
  if (friendly) softenExpression(THREE, browGeometry);
  const brows = new THREE.Mesh(
    browGeometry,
    new THREE.MeshStandardMaterial({
      name: "explorer-brows",
      color: 0xbc9670,
      map: maps.brows || null,
      alphaTest: 0.03,
      transparent: true,
      opacity: friendly ? 0.64 : 0.88,
      alphaToCoverage: true,
      roughness: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  brows.name = "explorerBrows";
  head.add(brows);
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    name: "explorer-eyes",
    color: 0xf2e7dd,
    map: maps.eyes || null,
    roughness: 0.15,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    specularIntensity: 1,
    alphaTest: 0.05,
  });
  const eyes = {};
  for (const [side, sign, data] of [
    ["left", 1, leftEyeData],
    ["right", -1, rightEyeData],
  ]) {
    const pivot = new THREE.Group();
    pivot.name = side + "Eye";
    pivot.position.set(
      sign * 0.30775 * 0.09,
      7.28415 * 0.09 + 0.975983 - 1.52,
      1.24535 * 0.09 - 0.054,
    );
    const geo = geometry(THREE, data);
    geo.translate(-pivot.position.x, -pivot.position.y, -pivot.position.z);
    pivot.add(new THREE.Mesh(geo, eyeMaterial));
    head.add(pivot);
    eyes[side + "Eye"] = pivot;
  }
  model.userData.face = {
    ...eyes,
    leftUpperLid: face,
    rightUpperLid: face,
    skin: face,
  };
  model.userData.appearance = {
    ...model.userData.appearance,
    face: "anatomical",
    expressions: ["blink", "effort", "breathe"],
    ...(friendly ? { restExpression: "friendly" } : {}),
  };
  head.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.material.alphaTest > 0 || node.morphTargetInfluences)
      node.customDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: node.material.map,
        alphaTest: node.material.alphaTest,
        side: node.material.side,
      });
  });
  if (friendly) brows.castShadow = false;
  return model;
}
