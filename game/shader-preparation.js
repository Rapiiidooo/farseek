export function prepareVisuals(owner, on, changes) {
  if (on) {
    owner.compileSnapshot ??= changes.map(([object, key]) => [
      object,
      key,
      object[key],
    ]);
    for (const [object, key, value] of changes) object[key] = value;
  } else if (owner.compileSnapshot) {
    for (const [object, key, value] of owner.compileSnapshot)
      object[key] = value;
    owner.compileSnapshot = null;
  }
}
