import gloveData from "./assets/explorer/gloves.js";
import relaxedPose from "./assets/explorer/gloves-relaxed.js";

const decode = (value, Type) =>
  new Type(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer);

export function attachRefinedGloves(THREE, model) {
  if (model.userData.appearance?.gloves === "anatomical") return model;
  const joints = model.userData.joints;
  const hands = model.userData.hands;
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    const hand = joints[side + "Hand"];
    const material = hand.children.find(
      (mesh) => mesh.isMesh && mesh.material.name === "explorer.leather",
    )?.material;
    if (!material) throw new Error("Explorer glove leather is missing");
    const axis = hand.position.clone().normalize();
    const palm = new THREE.Vector3(
      -sign * Math.cos(Math.PI / 9),
      0,
      -Math.sin(Math.PI / 9),
    );
    palm.addScaledVector(axis, -palm.dot(axis)).normalize();
    const across = new THREE.Vector3().crossVectors(
      sign > 0 ? palm : axis,
      sign > 0 ? axis : palm,
    );
    const frame = new THREE.Matrix4().makeBasis(across, axis, palm);
    for (const mesh of [...hand.children]) {
      if (!mesh.isMesh) continue;
      hand.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const mode of ["Open", "Grip"]) {
      const group = hands[side + mode];
      for (const mesh of [...group.children]) {
        group.remove(mesh);
        if (mesh.isMesh) mesh.geometry.dispose();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          decode(mode === "Open" ? relaxedPose : gloveData.grip, Float32Array),
          3,
        ),
      );
      geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(decode(gloveData.uv, Float32Array), 2),
      );
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      colors.fill(1);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const indices = decode(gloveData.index, Uint16Array);
      if (frame.determinant() < 0)
        for (let i = 0; i < indices.length; i += 3)
          [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.applyMatrix4(frame);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if (mode === "Open") {
        const relaxed = geometry.clone();
        relaxed.setAttribute(
          "position",
          new THREE.BufferAttribute(decode(gloveData.grip, Float32Array), 3),
        );
        relaxed.applyMatrix4(frame);
        relaxed.computeVertexNormals();
        relaxed.attributes.position.name = "relax";
        geometry.morphAttributes.position = [relaxed.attributes.position];
        geometry.morphAttributes.normal = [relaxed.attributes.normal];
        relaxed.dispose();
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = side + "AnatomicalGlove" + mode;
      if (mode === "Open") mesh.morphTargetInfluences[0] = 0;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  model.userData.appearance = {
    ...model.userData.appearance,
    gloves: "anatomical",
  };
  return model;
}
