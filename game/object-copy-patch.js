// Object3D.copy round-trips userData through JSON; declared parts then serialize whole subtrees and their geometry on every clone.

const isResource = (value) =>
  value.isObject3D ||
  value.isBufferGeometry ||
  value.isMaterial ||
  value.isTexture;

function holdsResource(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return false;
  if (isResource(value)) return true;
  if (ArrayBuffer.isView(value)) return false;
  if (Array.isArray(value))
    return value.some(
      (item) =>
        item && typeof item === "object" && holdsResource(item, depth + 1),
    );
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  for (const key in value)
    if (holdsResource(value[key], depth + 1)) return true;
  return false;
}

function copyData(value, copies) {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === "function" || type === "symbol") return undefined;
  if (type === "number") return Number.isFinite(value) ? value : null;
  if (type !== "object") return value;
  if (isResource(value))
    return value.isObject3D ? (copies.get(value) ?? value) : value;
  if (Array.isArray(value))
    return value.map((item) => copyData(item, copies) ?? null);
  if (Object.getPrototypeOf(value) !== Object.prototype)
    return JSON.parse(JSON.stringify(value));
  const out = {};
  for (const key of Object.keys(value)) {
    const item = copyData(value[key], copies);
    if (item !== undefined) out[key] = item;
  }
  return out;
}

function pair(from, to, copies) {
  copies.set(from, to);
  if (from.children.length !== to.children.length) return;
  for (let i = 0; i < from.children.length; i++)
    pair(from.children[i], to.children[i], copies);
}

export function installObjectCopy(THREE) {
  const nativeCopy = THREE.Object3D.prototype.copy;
  THREE.Object3D.prototype.copy = function copy(source, recursive = true) {
    if (!holdsResource(source.userData))
      return nativeCopy.call(this, source, recursive);
    nativeCopy.call(
      this,
      Object.assign(Object.create(source), { userData: {} }),
      recursive,
    );
    const copies = new Map();
    pair(source, this, copies);
    this.userData = copyData(source.userData, copies);
    return this;
  };
}
