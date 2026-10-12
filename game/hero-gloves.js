import gloveData from "./assets/explorer/gloves.js";
import relaxedPose from "./assets/explorer/gloves-relaxed.js";
import fingerRig from "./assets/explorer/gloves-rig.js";

const decode = (value, Type) =>
  new Type(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer);

// An open hand: the fingers almost straight and parted, the thumb away from the index.
const OPEN = {
  flex: [
    [2, 4, 3],
    [3, 4, 2],
    [3, 4, 2],
    [3, 5, 2],
    [4, 5, 3],
  ],
  opposition: -8,
  adduction: [-4, -3, 0, 3, 6],
};

export function attachRefinedGloves(THREE, model) {
  if (model.userData.appearance?.gloves === "anatomical") return model;
  const joints = model.userData.joints;
  const hands = model.userData.hands;
  // The relaxed glove follows its finger bones, found by name again under each copy's hand.
  class Glove extends THREE.SkinnedMesh {
    copy(source, recursive) {
      super.copy(source, recursive);
      this.fingerPoses = source.fingerPoses;
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
  // Each bone's turn in its parent's frame, composed as the glove's generator posed it.
  const direction = new THREE.Vector3(),
    part = new THREE.Quaternion(),
    turn = new THREE.Quaternion();
  const pose = (flex, opposition, adduction) =>
    fingerRig.bones.flatMap((bone, i) => {
      const finger = Math.floor(i / 3),
        segment = i % 3;
      turn.setFromAxisAngle(
        direction.fromArray(bone.axis),
        THREE.MathUtils.degToRad(flex(bone, finger, segment)),
      );
      if (i === 0)
        turn.multiply(
          part.setFromAxisAngle(
            direction.set(0, 1, 0),
            THREE.MathUtils.degToRad(opposition),
          ),
        );
      if (segment === 0 && adduction)
        turn.multiply(
          part.setFromAxisAngle(
            direction.set(0, 0, 1),
            THREE.MathUtils.degToRad(adduction[finger]),
          ),
        );
      return turn.toArray();
    });
  const fingerPoses = {
    relaxed: pose(
      (bone) => bone.relaxed,
      fingerRig.opposition.relaxed,
      fingerRig.adduction,
    ),
    grip: pose((bone) => bone.grip, fingerRig.opposition.grip, null),
    open: pose(
      (bone, finger, segment) => OPEN.flex[finger][segment],
      OPEN.opposition,
      OPEN.adduction,
    ),
  };
  const skinIndex = decode(fingerRig.skinIndex, Uint8Array);
  const skinWeight = Float32Array.from(
    decode(fingerRig.skinWeight, Uint8Array),
    (value) => value / 255,
  );
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
      if (mode === "Grip") {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = side + "AnatomicalGloveGrip";
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        continue;
      }
      geometry.setAttribute(
        "skinIndex",
        new THREE.BufferAttribute(skinIndex, 4),
      );
      geometry.setAttribute(
        "skinWeight",
        new THREE.BufferAttribute(skinWeight, 4),
      );
      // The bones turn in the unscaled source hand, under the scale and frame that fitted it.
      const root = new THREE.Object3D();
      root.name = side + "FingerRoot";
      frame
        .clone()
        .scale(new THREE.Vector3(...fingerRig.scale))
        .decompose(root.position, root.quaternion, root.scale);
      group.add(root);
      root.updateMatrix();
      const bones = [root],
        frames = [root.matrix.clone()];
      fingerRig.bones.forEach((data, i) => {
        const bone = new THREE.Bone();
        bone.name = side + data.name;
        bone.position.fromArray(data.head);
        bone.quaternion.fromArray(fingerPoses.relaxed, i * 4);
        bones[data.parent + 1].add(bone);
        bone.updateMatrix();
        frames.push(frames[data.parent + 1].clone().multiply(bone.matrix));
        bones.push(bone);
      });
      const mesh = new Glove(geometry, material);
      mesh.name = side + "AnatomicalGloveOpen";
      mesh.fingerPoses = fingerPoses;
      mesh.rigNames = bones.map((bone) => bone.name);
      mesh.rigInverses = frames.map((matrix) => matrix.invert());
      mesh.bind(
        new THREE.Skeleton(
          bones,
          mesh.rigInverses.map((matrix) => matrix.clone()),
        ),
        new THREE.Matrix4(),
      );
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      mesh.rigOwner = group;
    }
  }
  model.userData.appearance = {
    ...model.userData.appearance,
    gloves: "anatomical",
  };
  return model;
}
