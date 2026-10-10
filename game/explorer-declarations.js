export function preserveExplorerDeclarations(THREE, source) {
  class ExplorerGroup extends THREE.Group {
    copy(original, recursive = true) {
      super.copy(
        Object.assign(Object.create(original), { userData: {} }),
        recursive,
      );
      const copies = new Map();
      const pair = (from, to) => {
        copies.set(from, to);
        for (let i = 0; i < to.children.length; i++)
          pair(from.children[i], to.children[i]);
      };
      pair(original, this);
      const copyData = (value) => {
        if (value?.isObject3D) return copies.get(value);
        if (Array.isArray(value)) return value.map(copyData);
        if (value && typeof value === "object")
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, copyData(item)]),
          );
        return value;
      };
      this.userData = copyData(original.userData);
      return this;
    }
  }
  const group = new ExplorerGroup().copy(source, false);
  group.userData = source.userData;
  group.add(...source.children);
  return group;
}
