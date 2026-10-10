import bodyData from "./assets/explorer/previous/body.js";
import shoulderData from "./assets/explorer/previous/shoulders.js";

const decode = (value, Type) =>
  new Type(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer);

const interval = (value, grid) => {
  if (value <= grid[0]) return [0, 0, 0];
  if (value >= grid.at(-1)) return [grid.length - 1, grid.length - 1, 0];
  const hi = grid.findIndex((point) => point >= value),
    lo = hi - 1;
  return [lo, hi, (value - grid[lo]) / (grid[hi] - grid[lo])];
};

export function attachAnatomicalBody(THREE, model) {
  const joints = model.userData.joints;
  const shift = joints.hips.position.clone().sub(new THREE.Vector3(0, 0.95, 0));
  const originalSleeve = model.getObjectByName("leftJacketSleeve");
  const cloth = originalSleeve.material;
  let leather, bronze;
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (mesh.material.name === "explorer.leather") leather ??= mesh.material;
    if (mesh.material.color.getHex() === 0x9a6a35) bronze ??= mesh.material;
  });
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
  for (const side of ["left", "right"]) {
    const lower = joints[side + "LowerArm"];
    const wrist = joints[side + "Hand"].position;
    const axis = wrist.clone().normalize().negate();
    for (const mesh of lower.children) {
      if (!mesh.isMesh || mesh.material.name !== "explorer.leather") continue;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const delta = new THREE.Vector3().fromBufferAttribute(p, i).sub(wrist);
        const length = delta.dot(axis);
        delta.addScaledVector(axis, -length).multiplyScalar(0.8);
        delta.addScaledVector(axis, length * 0.78).add(wrist);
        p.setXYZ(i, ...delta.toArray());
      }
      mesh.geometry.computeVertexNormals();
    }
  }
  class ShoulderSupport extends THREE.Group {
    copy(source, recursive) {
      super.copy(source, recursive);
      this.armName = source.armName;
      this.arm = null;
      return this;
    }
    updateMatrixWorld(force) {
      if (this.parent && (!this.arm || this.arm.parent !== this.parent))
        this.arm = this.parent.getObjectByName(this.armName);
      if (this.arm) {
        this.position.copy(this.arm.position);
        this.quaternion.identity().slerp(this.arm.quaternion, 0.5);
      }
      super.updateMatrixWorld(force);
    }
  }
  const skinJoints = { ...joints };
  for (const side of ["left", "right"]) {
    const support = new ShoulderSupport();
    support.name = side + "ClavicleSkin";
    support.armName = side + "UpperArm";
    joints.spine.add(support);
    skinJoints[support.name] = support;
  }
  model.updateMatrixWorld(true);
  class Garment extends THREE.SkinnedMesh {
    copy(source, recursive) {
      super.copy(source, recursive);
      this.rigNames = [...source.rigNames];
      this.rigInverses = source.rigInverses.map((m) => m.clone());
      this.rigOwner = null;
      return this;
    }
    updateMatrixWorld(force) {
      super.updateMatrixWorld(force);
      if (!this.parent || !this.rigNames) return;
      if (this.rigOwner !== this.parent) {
        const bones = this.rigNames.map((name) =>
          this.parent.getObjectByName(name),
        );
        if (bones.some((bone) => !bone)) return;
        this.skeleton = new THREE.Skeleton(
          bones,
          this.rigInverses.map((m) => m.clone()),
        );
        this.rigOwner = this.parent;
      }
      if (!this.morphTargetInfluences?.length) return;
      this.morphTargetInfluences.fill(0);
      const { pitchGrid, rollGrid, activation } = shoulderData;
      const count = pitchGrid.length * rollGrid.length;
      for (let side = 0; side < 2; side++) {
        const arm = this.skeleton.bones[side ? 4 : 2];
        const pitch = -arm.rotation.x,
          roll = arm.rotation.z * (side ? -1 : 1);
        const [pl, ph, p] = interval(pitch, pitchGrid);
        const [rl, rh, r] = interval(roll, rollGrid);
        const blend = THREE.MathUtils.smoothstep(pitch, ...activation);
        for (const [pi, pw] of [
          [pl, 1 - p],
          [ph, p],
        ])
          for (const [ri, rw] of [
            [rl, 1 - r],
            [rh, r],
          ])
            this.morphTargetInfluences[
              side * count + pi * rollGrid.length + ri
            ] += blend * pw * rw;
      }
    }
  }
  const bind = (name, geometry, material) => {
    geometry.translate(shift.x, shift.y, shift.z);
    const mesh = new Garment(geometry, material);
    mesh.name = name;
    mesh.rigNames = [...bodyData.joints];
    mesh.rigInverses = mesh.rigNames.map((name) =>
      skinJoints[name].matrixWorld.clone().invert(),
    );
    mesh.bind(
      new THREE.Skeleton(
        mesh.rigNames.map((name) => skinJoints[name]),
        mesh.rigInverses.map((m) => m.clone()),
      ),
      new THREE.Matrix4(),
    );
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    model.add(mesh);
    return mesh;
  };
  const geometry = new THREE.BufferGeometry();
  for (const [name, Type, size] of [
    ["position", Float32Array, 3],
    ["uv", Float32Array, 2],
    ["color", Float32Array, 3],
    ["skinIndex", Uint8Array, 4],
    ["skinWeight", Float32Array, 4],
  ])
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(decode(bodyData[name], Type), size),
    );
  geometry.setIndex(
    new THREE.BufferAttribute(decode(bodyData.index, Uint16Array), 1),
  );
  geometry.computeVertexNormals();
  if (geometry.attributes.position.count !== shoulderData.vertexCount)
    throw new Error("Shoulder corrections do not match the shirt geometry");
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [];
  geometry.morphAttributes.normal = [];
  for (const side of ["left", "right"]) {
    const data = shoulderData.sides[side];
    const indices = decode(data.index, Uint16Array);
    for (const [targetIndex, target] of data.targets.entries()) {
      for (const name of ["position", "normal"]) {
        const sparse = decode(target[name], Float32Array);
        const values = new Float32Array(shoulderData.vertexCount * 3);
        for (let i = 0; i < indices.length; i++)
          values.set(sparse.subarray(i * 3, i * 3 + 3), indices[i] * 3);
        const attribute = new THREE.BufferAttribute(values, 3);
        attribute.name = side + "Shoulder" + targetIndex;
        geometry.morphAttributes[name].push(attribute);
      }
    }
  }
  const surfaceGeometry = new THREE.BufferGeometry();
  surfaceGeometry.setAttribute(
    "position",
    geometry.attributes.position.clone(),
  );
  surfaceGeometry.setIndex(geometry.index.clone());
  const surface = new THREE.Mesh(
    surfaceGeometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  surface.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const cellSize = 0.035;
  const triangleBuckets = new Map();
  const projectionPositions = surfaceGeometry.attributes.position;
  const projectionIndices = surfaceGeometry.index.array;
  for (let i = 0; i < projectionIndices.length; i += 3) {
    const ids = [
      projectionIndices[i],
      projectionIndices[i + 1],
      projectionIndices[i + 2],
    ];
    const xs = ids.map((index) => projectionPositions.getX(index));
    const ys = ids.map((index) => projectionPositions.getY(index));
    const minX = Math.floor((Math.min(...xs) - 1e-9) / cellSize);
    const maxX = Math.floor((Math.max(...xs) + 1e-9) / cellSize);
    const minY = Math.floor((Math.min(...ys) - 1e-9) / cellSize);
    const maxY = Math.floor((Math.max(...ys) + 1e-9) / cellSize);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++) {
        const key = x + "," + y;
        if (!triangleBuckets.has(key)) triangleBuckets.set(key, []);
        triangleBuckets.get(key).push(...ids);
      }
  }
  for (const [key, indices] of triangleBuckets)
    triangleBuckets.set(key, new THREE.Uint16BufferAttribute(indices, 1));
  const emptyProjection = new THREE.Uint16BufferAttribute([], 1);
  const projectionHit = () => {
    const x = Math.floor(ray.ray.origin.x / cellSize);
    const y = Math.floor(ray.ray.origin.y / cellSize);
    surfaceGeometry.index = triangleBuckets.get(x + "," + y) || emptyProjection;
    return ray.intersectObject(surface)[0];
  };
  const frontAt = (x, y, lift = 0.003) => {
    ray.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    const hit = projectionHit();
    const point = hit ? hit.point : new THREE.Vector3(x, y, 0.08);
    point.z += lift;
    return point;
  };
  const decorate = (name, geo, material) => {
    const p = geo.attributes.position,
      colors = [],
      uv = [],
      indices = [],
      weights = [];
    const sourcePositions = surface.geometry.attributes.position;
    const sourceIndices = geometry.attributes.skinIndex;
    const sourceWeights = geometry.attributes.skinWeight;
    const corrections = geometry.morphAttributes.position.map(
      () => new Float32Array(p.count * 3),
    );
    let corrected = false;
    for (let i = 0; i < p.count; i++) {
      ray.set(
        new THREE.Vector3(p.getX(i), p.getY(i), 1),
        new THREE.Vector3(0, 0, -1),
      );
      const hit = projectionHit();
      if (hit) {
        const vertices = [hit.face.a, hit.face.b, hit.face.c];
        const barycentric = THREE.Triangle.getBarycoord(
          hit.point,
          ...vertices.map((index) =>
            new THREE.Vector3().fromBufferAttribute(sourcePositions, index),
          ),
          new THREE.Vector3(),
        ).toArray();
        const influence = new Array(bodyData.joints.length).fill(0);
        for (let v = 0; v < 3; v++) {
          const index = vertices[v],
            weight = barycentric[v];
          for (let component = 0; component < 4; component++)
            influence[sourceIndices.array[index * 4 + component]] +=
              sourceWeights.array[index * 4 + component] * weight;
          for (let target = 0; target < corrections.length; target++)
            for (let component = 0; component < 3; component++)
              corrections[target][i * 3 + component] +=
                geometry.morphAttributes.position[target].array[
                  index * 3 + component
                ] * weight;
        }
        const order = influence
          .map((value, index) => index)
          .sort((a, b) => influence[b] - influence[a])
          .slice(0, 4);
        const total = order.reduce((sum, index) => sum + influence[index], 0);
        indices.push(...order);
        weights.push(...order.map((index) => influence[index] / total));
        corrected ||= corrections.some(
          (values) =>
            Math.abs(values[i * 3]) +
              Math.abs(values[i * 3 + 1]) +
              Math.abs(values[i * 3 + 2]) >
            1e-7,
        );
      } else {
        const hip = 1 - THREE.MathUtils.smoothstep(p.getY(i), 1.012, 1.12);
        indices.push(0, 1, 0, 0);
        weights.push(hip, 1 - hip, 0, 0);
      }
      colors.push(1, 1, 1);
      uv.push(p.getX(i) / 0.085, p.getY(i) / 0.085);
    }
    if (corrected) {
      const normals = geo.attributes.normal;
      const normalCorrections = corrections.map((values) => {
        const posed = geo.clone();
        const moved = posed.attributes.position;
        for (let i = 0; i < moved.array.length; i++)
          moved.array[i] += values[i];
        posed.computeVertexNormals();
        const delta = new Float32Array(normals.array.length);
        for (let i = 0; i < delta.length; i++)
          delta[i] = posed.attributes.normal.array[i] - normals.array[i];
        posed.dispose();
        return new THREE.BufferAttribute(delta, 3);
      });
      geo.morphTargetsRelative = true;
      geo.morphAttributes.position = corrections.map((values, index) => {
        const attribute = new THREE.BufferAttribute(values, 3);
        attribute.name = geometry.morphAttributes.position[index].name;
        return attribute;
      });
      geo.morphAttributes.normal = normalCorrections;
    }
    geo.setAttribute("skinIndex", new THREE.Uint8BufferAttribute(indices, 4));
    geo.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(weights, 4),
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return bind(name, geo, material);
  };
  const patch = (name, width, height, x, y, lift, material) => {
    const geo = new THREE.PlaneGeometry(width, height, 12, 16);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const xx = p.getX(i),
        yy = p.getY(i);
      const bulge =
        Math.cos((xx / width) * Math.PI) *
        Math.cos((yy / height) * Math.PI) *
        0.002;
      const point = frontAt(x + xx, y + yy, lift + bulge);
      p.setXYZ(i, ...point.toArray());
    }
    geo.computeVertexNormals();
    return decorate(name, geo, material);
  };
  const tube = (name, points, radius, material, segments = 32) =>
    decorate(
      name,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        segments,
        radius,
        6,
        false,
      ),
      material,
    );
  const shirt = bind("explorerFieldShirt", geometry, cloth);
  patch("explorerPlacket", 0.018, 0.38, 0, 1.245, 0.002, cloth);
  const stitch = cloth.clone();
  stitch.color.multiplyScalar(1.14);
  for (const side of [-1, 1]) {
    patch(
      "explorerChestPocket" + side,
      0.054,
      0.04,
      side * 0.085,
      1.417,
      0.003,
      cloth,
    );
    patch(
      "explorerPocketFlap" + side,
      0.057,
      0.014,
      side * 0.085,
      1.438,
      0.0055,
      cloth,
    );
    const points = [
      frontAt(side * 0.111, 1.432, 0.004),
      frontAt(side * 0.111, 1.398, 0.004),
      frontAt(side * 0.085, 1.395, 0.004),
      frontAt(side * 0.059, 1.398, 0.004),
      frontAt(side * 0.059, 1.432, 0.004),
    ];
    tube("explorerPocketStitch" + side, points, 0.00055, stitch, 32);
    const seam = Array.from({ length: 16 }, (_, i) => {
      const y = 1.08 + (i / 15) * 0.28;
      return frontAt(
        side * (0.102 + Math.sin((i / 15) * Math.PI) * 0.012),
        y,
        0.0018,
      );
    });
    tube("explorerTorsoSeam" + side, seam, 0.0006, stitch);
  }
  for (const y of [1.1, 1.19, 1.28, 1.405]) {
    const geo = new THREE.SphereGeometry(0.0045, 12, 8);
    geo.scale(1, 1, 0.33);
    geo.translate(...frontAt(0.002, y, 0.006).toArray());
    decorate("explorerShirtButton", geo, bronze);
  }
  const strap = new THREE.PlaneGeometry(0.027, 1, 4, 36);
  const sp = strap.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const t = sp.getY(i) + 0.5;
    const y = 1.028 + t * 0.454;
    const x = THREE.MathUtils.lerp(-0.144, 0.067, t) + sp.getX(i);
    sp.setXYZ(i, ...frontAt(x, y, 0.01).toArray());
  }
  strap.computeVertexNormals();
  decorate("explorerSatchelStrap", strap, leather);
  const lens = new THREE.MeshPhysicalMaterial({
    name: "explorer-goggle-lens",
    color: 0x49372b,
    roughness: 0.18,
    metalness: 0.32,
    clearcoat: 0.7,
  });
  for (const sign of [-1, 1]) {
    const center = frontAt(sign * 0.03, 1.449, 0.016);
    const rim = new THREE.TorusGeometry(0.022, 0.0023, 8, 24);
    rim.scale(1.05, 0.92, 1);
    rim.translate(...center.toArray());
    decorate("explorerGoggleRim" + sign, rim, bronze);
    const glass = new THREE.CircleGeometry(0.02, 24);
    glass.scale(1.05, 0.92, 1);
    glass.translate(center.x, center.y, center.z - 0.001);
    decorate("explorerGoggleLens" + sign, glass, lens);
    tube(
      "explorerGoggleCord" + sign,
      [
        frontAt(sign * 0.061, 1.5, 0.003),
        frontAt(sign * 0.058, 1.468, 0.008),
        center.clone().add(new THREE.Vector3(sign * 0.02, 0, 0)),
      ],
      0.0015,
      leather,
      16,
    );
  }
  tube(
    "explorerGoggleBridge",
    [
      frontAt(-0.009, 1.45, 0.016),
      frontAt(0, 1.454, 0.017),
      frontAt(0.009, 1.45, 0.016),
    ],
    0.0017,
    bronze,
    12,
  );
  surface.geometry.dispose();
  surface.material.dispose();
  model.userData.appearance = {
    ...model.userData.appearance,
    version: 8,
    upperBody: "anatomical-continuous",
    shoulders: "pose-corrected",
  };
  model.userData.garment = { shirt };
  return model;
}
