// Moves a factory's built object tree between threads without changing a value: geometry buffers
// travel as transferables, and objects and materials are rebuilt in their original creation order.
// Anything it cannot carry exactly (own textures, shader hooks, lights, skinning) is refused.
import { sharedTexture } from "./pixel-jobs.js";

export class Unsupported extends Error {}

// A worker answering in another format, such as a cached older script, is ignored.
export const FORMAT = 1;

const NODE_TYPES = new Set([
  "Object3D",
  "Group",
  "Mesh",
  "InstancedMesh",
  "Line",
  "LineSegments",
  "LineLoop",
  "Points",
]);
const NODE_SKIP = new Set([
  "uuid",
  "id",
  "type",
  "parent",
  "children",
  "modelViewMatrix",
  "normalMatrix",
  "matrixWorld",
  "matrixWorldNeedsUpdate",
  "geometry",
  "material",
  "count",
  "instanceMatrix",
  "instanceColor",
  "previousInstanceMatrix",
  "morphTexture",
  "_listeners",
]);
const MATERIAL_SKIP = new Set(["uuid", "id", "version", "_listeners"]);
const GEOMETRY_KEYS = new Set([
  "uuid",
  "id",
  "name",
  "type",
  "index",
  "indirect",
  "indirectOffset",
  "attributes",
  "morphAttributes",
  "morphTargetsRelative",
  "groups",
  "boundingBox",
  "boundingSphere",
  "drawRange",
  "userData",
  "parameters",
  "_transformed",
  "_listeners",
]);
const MATH = [
  ["isColor", "Color", (v) => [v.r, v.g, v.b]],
  ["isVector2", "Vector2", (v) => [v.x, v.y]],
  ["isVector3", "Vector3", (v) => [v.x, v.y, v.z]],
  ["isVector4", "Vector4", (v) => [v.x, v.y, v.z, v.w]],
  ["isQuaternion", "Quaternion", (v) => [v.x, v.y, v.z, v.w]],
  ["isEuler", "Euler", (v) => [v.x, v.y, v.z, v.order]],
  ["isMatrix3", "Matrix3", (v) => [...v.elements]],
  ["isMatrix4", "Matrix4", (v) => [...v.elements]],
  ["isBox3", "Box3", (v) => [...v.min.toArray(), ...v.max.toArray()]],
  ["isSphere", "Sphere", (v) => [...v.center.toArray(), v.radius]],
  ["isPlane", "Plane", (v) => [...v.normal.toArray(), v.constant]],
];

function mathValue(THREE, type, data) {
  switch (type) {
    case "Color":
      return new THREE.Color().setRGB(data[0], data[1], data[2]);
    case "Vector2":
    case "Vector3":
    case "Vector4":
    case "Quaternion":
    case "Matrix3":
    case "Matrix4":
      return new THREE[type]().fromArray(data);
    case "Euler":
      return new THREE.Euler(data[0], data[1], data[2], data[3]);
    case "Box3":
      return new THREE.Box3(
        new THREE.Vector3(data[0], data[1], data[2]),
        new THREE.Vector3(data[3], data[4], data[5]),
      );
    case "Sphere":
      return new THREE.Sphere(
        new THREE.Vector3(data[0], data[1], data[2]),
        data[3],
      );
    case "Plane":
      return new THREE.Plane(
        new THREE.Vector3(data[0], data[1], data[2]),
        data[3],
      );
  }
  throw new Unsupported(type);
}

export function encodeTree(THREE, root) {
  const nodes = [],
    nodeIndex = new Map(),
    geometries = [],
    geometryIndex = new Map(),
    materials = [],
    materialIndex = new Map(),
    attributes = [],
    attributeIndex = new Map(),
    transfer = new Set();
  root.traverse((node) => {
    nodeIndex.set(node, nodes.length);
    nodes.push(node);
  });

  const attribute = (value) => {
    if (!value) return -1;
    if (attributeIndex.has(value)) return attributeIndex.get(value);
    if (!value.isBufferAttribute || value.isInterleavedBufferAttribute)
      throw new Unsupported("attribute");
    let array = value.array;
    if (
      array.byteOffset !== 0 ||
      array.byteLength !== array.buffer.byteLength ||
      transfer.has(array.buffer)
    )
      array = array.slice();
    transfer.add(array.buffer);
    attributeIndex.set(value, attributes.length);
    attributes.push({
      array,
      itemSize: value.itemSize,
      normalized: value.normalized,
      name: value.name,
      usage: value.usage,
      gpuType: value.gpuType,
      instanced: value.isInstancedBufferAttribute ? value.meshPerAttribute : 0,
    });
    return attributeIndex.get(value);
  };

  const encode = (value) => {
    if (value === undefined) return { $: "undefined" };
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string"
    )
      return value;
    if (typeof value === "function" || typeof value === "symbol")
      throw new Unsupported("function value");
    if (ArrayBuffer.isView(value)) return { $: "typed", value: value.slice() };
    if (Array.isArray(value)) return value.map(encode);
    if (value.isObject3D) {
      if (!nodeIndex.has(value)) throw new Unsupported("outside node");
      return { $: "node", index: nodeIndex.get(value) };
    }
    if (value.isMaterial) return { $: "material", index: material(value) };
    if (value.isBufferGeometry)
      return { $: "geometry", index: geometry(value) };
    if (value.isBufferAttribute)
      return { $: "attribute", index: attribute(value) };
    if (value.isTexture) {
      if (!value.userData.sharedTexture) throw new Unsupported("texture");
      return { $: "shared", key: value.userData.sharedTexture };
    }
    for (const [flag, type, data] of MATH)
      if (value[flag]) return { $: "math", type, data: data(value) };
    if (Object.getPrototypeOf(value) !== Object.prototype)
      throw new Unsupported("class instance");
    const plain = {};
    for (const [key, entry] of Object.entries(value))
      plain[key] = encode(entry);
    return { $: "object", value: plain };
  };

  function material(value) {
    if (materialIndex.has(value)) return materialIndex.get(value);
    if (value.isShaderMaterial || !THREE[value.type])
      throw new Unsupported(value.type);
    const props = {};
    materialIndex.set(value, materials.length);
    materials.push(null);
    for (const key of Object.keys(value)) {
      if (MATERIAL_SKIP.has(key)) continue;
      props[key] = encode(value[key]);
    }
    materials[materialIndex.get(value)] = {
      type: value.type,
      id: value.id,
      props,
    };
    return materialIndex.get(value);
  }

  function geometry(value) {
    if (geometryIndex.has(value)) return geometryIndex.get(value);
    for (const key of Object.keys(value))
      if (!GEOMETRY_KEYS.has(key) && !key.startsWith("is"))
        throw new Unsupported(`geometry ${key}`);
    if (value.indirect) throw new Unsupported("indirect geometry");
    geometryIndex.set(value, geometries.length);
    geometries.push(null);
    geometries[geometryIndex.get(value)] = {
      name: value.name,
      type: value.type,
      attributes: Object.entries(value.attributes).map(([name, entry]) => [
        name,
        attribute(entry),
      ]),
      index: attribute(value.index),
      morphAttributes: Object.entries(value.morphAttributes).map(
        ([name, list]) => [name, list.map(attribute)],
      ),
      morphTargetsRelative: value.morphTargetsRelative,
      transformed: value._transformed,
      groups: value.groups.map((group) => ({ ...group })),
      drawRange: { ...value.drawRange },
      boundingBox: encode(value.boundingBox),
      boundingSphere: encode(value.boundingSphere),
      userData: encode(value.userData),
    };
    return geometryIndex.get(value);
  }

  const encoded = nodes.map((node) => {
    if (!NODE_TYPES.has(node.type) || !THREE[node.type])
      throw new Unsupported(node.type);
    if (node.animations?.length) throw new Unsupported("animations");
    const entry = {
      type: node.type,
      id: node.id,
      parent:
        node.parent && nodeIndex.has(node.parent)
          ? nodeIndex.get(node.parent)
          : -1,
      children: node.children.map((child) => nodeIndex.get(child)),
      position: node.position.toArray(),
      quaternion: node.quaternion.toArray(),
      rotation: [
        node.rotation.x,
        node.rotation.y,
        node.rotation.z,
        node.rotation.order,
      ],
      scale: node.scale.toArray(),
      up: node.up.toArray(),
      matrix: [...node.matrix.elements],
      layers: node.layers.mask,
      props: {},
    };
    for (const key of Object.keys(node)) {
      if (
        NODE_SKIP.has(key) ||
        key.startsWith("is") ||
        [
          "position",
          "quaternion",
          "rotation",
          "scale",
          "up",
          "matrix",
          "layers",
        ].includes(key)
      )
        continue;
      entry.props[key] = encode(node[key]);
    }
    if (node.geometry) entry.geometry = geometry(node.geometry);
    if (node.material)
      entry.material = Array.isArray(node.material)
        ? node.material.map(material)
        : material(node.material);
    if (node.isInstancedMesh) {
      entry.count = node.count;
      entry.instanceMatrix = attribute(node.instanceMatrix);
      entry.instanceColor = attribute(node.instanceColor);
      if (node.morphTexture) throw new Unsupported("morph texture");
    }
    return entry;
  });
  return {
    payload: {
      format: FORMAT,
      nodes: encoded,
      geometries,
      materials,
      attributes,
    },
    transfer: [...transfer],
  };
}

export function decodeTree(
  THREE,
  { nodes, geometries, materials, attributes },
) {
  const attributeObjects = attributes.map((entry) => {
    const value = entry.instanced
      ? new THREE.InstancedBufferAttribute(
          entry.array,
          entry.itemSize,
          entry.normalized,
          entry.instanced,
        )
      : new THREE.BufferAttribute(
          entry.array,
          entry.itemSize,
          entry.normalized,
        );
    value.name = entry.name;
    value.usage = entry.usage;
    if (entry.gpuType !== undefined) value.gpuType = entry.gpuType;
    return value;
  });
  const geometryObjects = [],
    materialObjects = [],
    nodeObjects = [];
  const decode = (value) => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(decode);
    switch (value.$) {
      case "undefined":
        return undefined;
      case "typed":
        return value.value;
      case "node":
        return nodeObjects[value.index];
      case "material":
        return materialObjects[value.index];
      case "geometry":
        return geometryObjects[value.index];
      case "attribute":
        return attributeObjects[value.index];
      case "math":
        return mathValue(THREE, value.type, value.data);
      case "shared": {
        const texture = sharedTexture(THREE, value.key);
        if (!texture) throw new Unsupported(value.key);
        return texture;
      }
      case "object":
        return Object.fromEntries(
          Object.entries(value.value).map(([key, entry]) => [
            key,
            decode(entry),
          ]),
        );
    }
    throw new Unsupported(String(value.$));
  };
  // Materials and objects are created in their original order: ids break render sort ties.
  const materialOrder = materials
    .map((entry, index) => [entry.id, index])
    .sort((a, b) => a[0] - b[0]);
  for (const [, index] of materialOrder)
    materialObjects[index] = new THREE[materials[index].type]();
  for (const entry of geometries) {
    const geometry = new THREE.BufferGeometry();
    geometryObjects.push(geometry);
    geometry.name = entry.name;
    geometry.type = entry.type;
    for (const [name, index] of entry.attributes)
      geometry.setAttribute(name, attributeObjects[index]);
    if (entry.index >= 0) geometry.setIndex(attributeObjects[entry.index]);
    for (const [name, list] of entry.morphAttributes)
      geometry.morphAttributes[name] = list.map(
        (index) => attributeObjects[index],
      );
    geometry.morphTargetsRelative = entry.morphTargetsRelative;
    if (entry.transformed !== undefined)
      geometry._transformed = entry.transformed;
    for (const group of entry.groups)
      geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.setDrawRange(entry.drawRange.start, entry.drawRange.count);
  }
  const order = nodes
    .map((entry, index) => [entry.id, index])
    .sort((a, b) => a[0] - b[0]);
  for (const [, index] of order) {
    const entry = nodes[index];
    const material = Array.isArray(entry.material)
      ? entry.material.map((i) => materialObjects[i])
      : materialObjects[entry.material];
    const geometry = geometryObjects[entry.geometry];
    nodeObjects[index] =
      entry.type === "InstancedMesh"
        ? new THREE.InstancedMesh(geometry, material, entry.count)
        : entry.geometry !== undefined
          ? new THREE[entry.type](geometry, material)
          : new THREE[entry.type]();
  }
  geometries.forEach((entry, index) => {
    const geometry = geometryObjects[index];
    geometry.boundingBox = decode(entry.boundingBox);
    geometry.boundingSphere = decode(entry.boundingSphere);
    geometry.userData = decode(entry.userData);
  });
  materials.forEach((entry, index) => {
    const material = materialObjects[index];
    for (const [key, value] of Object.entries(entry.props))
      material[key] = decode(value);
  });
  nodes.forEach((entry, index) => {
    const node = nodeObjects[index];
    node.position.fromArray(entry.position);
    node.scale.fromArray(entry.scale);
    node.up.fromArray(entry.up);
    // Rotation and quaternion are both copied as stored, so neither is rederived from the other.
    node.rotation._x = entry.rotation[0];
    node.rotation._y = entry.rotation[1];
    node.rotation._z = entry.rotation[2];
    node.rotation._order = entry.rotation[3];
    node.quaternion._x = entry.quaternion[0];
    node.quaternion._y = entry.quaternion[1];
    node.quaternion._z = entry.quaternion[2];
    node.quaternion._w = entry.quaternion[3];
    node.matrix.fromArray(entry.matrix);
    node.layers.mask = entry.layers;
    for (const [key, value] of Object.entries(entry.props))
      node[key] = decode(value);
    if (entry.type === "InstancedMesh") {
      node.instanceMatrix = attributeObjects[entry.instanceMatrix];
      node.instanceColor =
        entry.instanceColor >= 0 ? attributeObjects[entry.instanceColor] : null;
      node.count = entry.count;
    }
  });
  nodes.forEach((entry, index) => {
    for (const child of entry.children) {
      const node = nodeObjects[child];
      node.parent = nodeObjects[index];
      nodeObjects[index].children.push(node);
    }
  });
  return nodeObjects[0];
}
