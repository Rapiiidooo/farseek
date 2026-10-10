export function createShaderPreview(source, looks, where) {
  const copies = new Map();
  const copy = (node) => {
    const clone = new node.constructor();
    const declarationFree = Object.assign(Object.create(node), {
      userData: {},
    });
    clone.copy(declarationFree, false);
    copies.set(node, clone);
    for (const child of node.children) clone.add(copy(child));
    return clone;
  };
  const model = copy(source);
  for (const [node, clone] of copies) {
    if (node.isSkinnedMesh) {
      clone.skeleton = node.skeleton.clone();
      clone.skeleton.bones = node.skeleton.bones.map((bone) =>
        copies.get(bone),
      );
      clone.bind(clone.skeleton, node.bindMatrix);
    }
    // The explorer's own depth materials, so the shadow programs this preparation compiles
    // (keyed by the next world's lights) are the ones she holds when she arrives there.
    if (node.customDepthMaterial)
      clone.customDepthMaterial = node.customDepthMaterial;
    const look = looks.get(node);
    if (look) clone.material = where === "court" ? look.court : look.plain;
  }
  model.updateMatrixWorld(true);
  return {
    model,
    dispose() {
      model.removeFromParent();
      const skeletons = new Set();
      model.traverse((node) => {
        if (node.isSkinnedMesh) skeletons.add(node.skeleton);
      });
      for (const skeleton of skeletons) skeleton.dispose();
    },
  };
}
