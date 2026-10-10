import bodyData from "./assets/explorer/body.js";
import shoulderData from "./assets/explorer/shoulders.js";
import { sculptAnatomy } from "./hero-sculpt.js";
import { fitNeckline } from "./hero-neckline.js";
import { fitRay } from "./fit-cache.js";

const decode = (value, Type) =>
  new Type(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer);

export function attachAnatomicalBody(THREE, model, { contoured = false } = {}) {
  if (
    shoulderData.schema !== 2 ||
    shoulderData.vertices !== atob(bodyData.position).length / 12 ||
    JSON.stringify(shoulderData.joints) !== JSON.stringify(bodyData.joints) ||
    JSON.stringify(shoulderData.supportFractions) !==
      JSON.stringify(bodyData.supportFractions)
  )
    throw new Error(
      "Shoulder supports do not match the body geometry; rebuild both assets",
    );
  const joints = model.userData.joints;
  const rigNames = contoured ? [...bodyData.joints, "head"] : bodyData.joints;
  const shift = joints.hips.position.clone().sub(new THREE.Vector3(0, 0.95, 0));
  const cloth = model.getObjectByName("leftJacketSleeve").material.clone();
  cloth.name = "explorer.cloth";
  cloth.color.setHex(0x293d36);
  cloth.roughness = 0.83;
  cloth.normalScale.set(0.16, 0.16);
  if (contoured) {
    cloth.roughness = 0.68;
    cloth.normalScale.setScalar(0.12);
    cloth.sheen = 0.28;
  }
  for (const name of ["leftJacketSleeve", "rightJacketSleeve"]) {
    const mesh = model.getObjectByName(name);
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  for (const mesh of [...joints.spine.children]) {
    if (!mesh.isMesh || mesh.material.color.getHex() === 0xa34c39) continue;
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  for (const side of ["left", "right"])
    for (const mesh of [...joints[side + "LowerArm"].children]) {
      if (!mesh.isMesh) continue;
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  class ShoulderSupport extends THREE.Group {
    copy(source, recursive) {
      super.copy(source, recursive);
      this.armName = source.armName;
      this.fraction = source.fraction;
      this.arm = null;
      return this;
    }
    updateMatrixWorld(force) {
      if (this.parent && (!this.arm || this.arm.parent !== this.parent))
        this.arm = this.parent.getObjectByName(this.armName);
      if (this.arm) {
        this.position.copy(this.arm.position);
        this.quaternion.identity().slerp(this.arm.quaternion, this.fraction);
      }
      super.updateMatrixWorld(force);
    }
  }
  const skinJoints = { ...joints };
  for (const side of ["left", "right"])
    shoulderData.supportFractions.forEach((fraction, index) => {
      const support = new ShoulderSupport();
      support.name = side + "ShoulderSkin" + (index + 1);
      support.armName = side + "UpperArm";
      support.fraction = fraction;
      joints.spine.add(support);
      skinJoints[support.name] = support;
    });
  model.updateMatrixWorld(true);
  class Garment extends THREE.SkinnedMesh {
    copy(source, recursive) {
      super.copy(source, recursive);
      this.rigNames = [...source.rigNames];
      this.rigInverses = source.rigInverses.map((matrix) => matrix.clone());
      this.rigOwner = null;
      return this;
    }
    updateMatrixWorld(force) {
      super.updateMatrixWorld(force);
      if (!this.parent || !this.rigNames || this.rigOwner === this.parent)
        return;
      const bones = this.rigNames.map((name) =>
        this.parent.getObjectByName(name),
      );
      if (bones.some((bone) => !bone)) return;
      this.skeleton = new THREE.Skeleton(
        bones,
        this.rigInverses.map((matrix) => matrix.clone()),
      );
      this.rigOwner = this.parent;
    }
  }
  const bind = (name, geometry, material) => {
    geometry.translate(shift.x, shift.y, shift.z);
    const mesh = new Garment(geometry, material);
    mesh.name = name;
    mesh.rigNames = [...rigNames];
    mesh.rigInverses = mesh.rigNames.map((name) =>
      skinJoints[name].matrixWorld.clone().invert(),
    );
    mesh.bind(
      new THREE.Skeleton(
        mesh.rigNames.map((name) => skinJoints[name]),
        mesh.rigInverses.map((matrix) => matrix.clone()),
      ),
      new THREE.Matrix4(),
    );
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    model.add(mesh);
    return mesh;
  };
  const anatomy = new THREE.BufferGeometry();
  for (const [name, Type, size] of [
    ["position", Float32Array, 3],
    ["normal", Float32Array, 3],
    ["uv", Float32Array, 2],
    ["color", Float32Array, 3],
    ["skinIndex", Uint8Array, 4],
    ["skinWeight", Float32Array, 4],
  ])
    anatomy.setAttribute(
      name,
      new THREE.BufferAttribute(decode(bodyData[name], Type), size),
    );
  const allIndices = decode(bodyData.index, Uint16Array);
  anatomy.setIndex(new THREE.BufferAttribute(allIndices, 1));
  anatomy.setAttribute(
    "skinUv",
    new THREE.Float32BufferAttribute(decode(bodyData.skinUv, Float32Array), 2),
  );
  if (bodyData.skinColor)
    anatomy.setAttribute(
      "skinColor",
      new THREE.Float32BufferAttribute(
        decode(bodyData.skinColor, Float32Array),
        3,
      ),
    );
  let clothedIndexCount = bodyData.clothedIndexCount;
  if (contoured)
    clothedIndexCount = sculptAnatomy(
      THREE,
      anatomy,
      joints,
      clothedIndexCount,
    ).clothCount;
  if (contoured) {
    const neck = fitNeckline(
      THREE,
      anatomy,
      joints,
      clothedIndexCount,
      rigNames.length - 1,
    );
    clothedIndexCount = neck.clothCount;
    model.userData.neck = {
      centerZ: neck.centerZ,
      seam: neck.seam,
      border: neck.border,
      armholes: neck.armholes,
      sealedCuts: neck.sealedCuts,
    };
  }
  const fittedIndices = anatomy.index.array;
  const sourcePosition = anatomy.attributes.position;
  const sourceIndices = anatomy.attributes.skinIndex;
  const sourceWeights = anatomy.attributes.skinWeight;
  const projectionGeometry = new THREE.BufferGeometry();
  projectionGeometry.setAttribute("position", sourcePosition);
  projectionGeometry.setIndex(anatomy.index);
  const projection = new THREE.Mesh(
    projectionGeometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  projection.updateMatrixWorld(true);
  const cells = new Map(),
    cellSize = 0.035;
  for (let i = 0; i < fittedIndices.length; i += 3) {
    const ids = [...fittedIndices.slice(i, i + 3)];
    const xs = ids.map((id) => sourcePosition.getX(id)),
      ys = ids.map((id) => sourcePosition.getY(id));
    for (
      let x = Math.floor((Math.min(...xs) - 1e-9) / cellSize);
      x <= Math.floor((Math.max(...xs) + 1e-9) / cellSize);
      x++
    )
      for (
        let y = Math.floor((Math.min(...ys) - 1e-9) / cellSize);
        y <= Math.floor((Math.max(...ys) + 1e-9) / cellSize);
        y++
      ) {
        const key = x + "," + y;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(...ids);
      }
  }
  for (const [key, ids] of cells)
    cells.set(key, new THREE.Uint16BufferAttribute(ids, 1));
  const ray = new THREE.Raycaster(),
    empty = new THREE.Uint16BufferAttribute([], 1);
  const front = (x, y) => {
    projectionGeometry.index =
      cells.get(Math.floor(x / cellSize) + "," + Math.floor(y / cellSize)) ||
      empty;
    ray.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    return fitRay(ray, projection)[0];
  };
  const decorate = (name, geometry, material) => {
    const p = geometry.attributes.position,
      indices = [],
      weights = [],
      colors = [];
    for (let i = 0; i < p.count; i++) {
      const hit = front(p.getX(i), p.getY(i));
      const influence = new Array(rigNames.length).fill(0);
      if (hit) {
        const ids = [hit.face.a, hit.face.b, hit.face.c];
        const bary = THREE.Triangle.getBarycoord(
          hit.point,
          ...ids.map((id) =>
            new THREE.Vector3().fromBufferAttribute(sourcePosition, id),
          ),
          new THREE.Vector3(),
        ).toArray();
        for (let vertex = 0; vertex < 3; vertex++)
          for (let component = 0; component < 4; component++)
            influence[sourceIndices.array[ids[vertex] * 4 + component]] +=
              sourceWeights.array[ids[vertex] * 4 + component] * bary[vertex];
      } else influence[1] = 1;
      const order = influence
        .map((_, index) => index)
        .sort((a, b) => influence[b] - influence[a])
        .slice(0, 4);
      const total = order.reduce((sum, index) => sum + influence[index], 0);
      indices.push(...order);
      weights.push(...order.map((index) => influence[index] / total));
      colors.push(1, 1, 1);
    }
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint8BufferAttribute(indices, 4),
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(weights, 4),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return bind(name, geometry, material);
  };
  const shirtGeometry = anatomy.clone();
  shirtGeometry.setIndex(
    new THREE.BufferAttribute(fittedIndices.slice(0, clothedIndexCount), 1),
  );
  shirtGeometry.deleteAttribute("skinUv");
  shirtGeometry.deleteAttribute("skinColor");
  const color = shirtGeometry.attributes.color;
  for (let i = 0; i < color.count; i++) {
    const x = Math.abs(sourcePosition.getX(i)),
      y = sourcePosition.getY(i);
    const panel =
      THREE.MathUtils.smoothstep(x, 0.11, 0.14) *
      (1 - THREE.MathUtils.smoothstep(y, 1.35, 1.44));
    const shade = (1 - 0.34 * panel) * color.getX(i);
    color.setXYZ(i, shade, shade, shade);
  }
  const shirt = bind("explorerFieldShirt", shirtGeometry, cloth);
  const skinGeometry = anatomy.clone();
  skinGeometry.setIndex(
    new THREE.BufferAttribute(fittedIndices.slice(clothedIndexCount), 1),
  );
  skinGeometry.setAttribute("uv", anatomy.getAttribute("skinUv"));
  if (bodyData.skinColor)
    skinGeometry.setAttribute("color", anatomy.getAttribute("skinColor"));
  const arms = bind(
    "explorerBareArms",
    skinGeometry,
    new THREE.MeshPhysicalMaterial({
      name: "explorer-skin",
      color: 0xbd8867,
      roughness: 0.62,
      specularIntensity: 0.48,
      clearcoat: 0.055,
      clearcoatRoughness: 0.48,
    }),
  );
  skinGeometry.deleteAttribute("skinUv");
  skinGeometry.deleteAttribute("skinColor");
  const zipMaterial = new THREE.MeshStandardMaterial({
    name: "explorer.technicalMetal",
    color: 0x677370,
    metalness: 0.72,
    roughness: 0.4,
  });
  const zipTop = contoured ? 1.368 : 1.53;
  const zipBottom = 1.27;
  const zip = new THREE.PlaneGeometry(0.0035, zipTop - zipBottom, 2, 40);
  for (let i = 0; i < zip.attributes.position.count; i++) {
    const p = zip.attributes.position,
      x = p.getX(i),
      y = p.getY(i) + (zipTop + zipBottom) * 0.5;
    const hit = front(x, y);
    p.setXYZ(i, x, y, (hit?.point.z ?? 0.04) + 0.0025);
  }
  zip.computeVertexNormals();
  decorate("explorerTechZip", zip, zipMaterial);
  const pull = new THREE.BoxGeometry(0.009, 0.018, 0.002);
  const pullHeight = contoured ? 1.362 : 1.509;
  pull.translate(
    0,
    pullHeight,
    (front(0, pullHeight)?.point.z ?? 0.04) + 0.006,
  );
  decorate("explorerTechZipPull", pull, zipMaterial);
  projectionGeometry.dispose();
  projection.material.dispose();
  anatomy.dispose();
  model.userData.appearance = {
    ...model.userData.appearance,
    version: 11,
    upperBody: "sleeveless-technical",
    shoulders: "distributed-anatomical",
    arms: "sculpted-anatomical",
    ...(contoured
      ? { neckline: "open-v", anatomyResolution: "subdivided" }
      : {}),
    ...(contoured ? { neckJoin: "continuous" } : {}),
  };
  model.userData.garment = { shirt, arms };
  return model;
}
