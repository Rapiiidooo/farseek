export function sculptAnatomy(THREE, geometry, joints, clothCount) {
  const attributes = geometry.attributes;
  const values = Object.fromEntries(
    Object.entries(attributes).map(([name, attribute]) => [
      name,
      [...attribute.array],
    ]),
  );
  const append = (a, b, t) => {
    const id = values.position.length / 3;
    for (const [name, attribute] of Object.entries(attributes)) {
      if (name === "skinIndex" || name === "skinWeight") continue;
      for (let k = 0; k < attribute.itemSize; k++)
        values[name].push(
          THREE.MathUtils.lerp(
            values[name][a * attribute.itemSize + k],
            values[name][b * attribute.itemSize + k],
            t,
          ),
        );
    }
    const influence = new Map();
    for (const [vertex, share] of [
      [a, 1 - t],
      [b, t],
    ])
      for (let k = 0; k < 4; k++) {
        const bone = values.skinIndex[vertex * 4 + k],
          weight = values.skinWeight[vertex * 4 + k] * share;
        influence.set(bone, (influence.get(bone) || 0) + weight);
      }
    const selected = [...influence].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = selected.reduce((sum, [, weight]) => sum + weight, 0);
    while (selected.length < 4) selected.push([0, 0]);
    values.skinIndex.push(...selected.map(([bone]) => bone));
    values.skinWeight.push(...selected.map(([, weight]) => weight / total));
    return id;
  };
  const midpointCache = new Map();
  const midpoint = (a, b) => {
    const key = Math.min(a, b) + "," + Math.max(a, b);
    if (!midpointCache.has(key)) midpointCache.set(key, append(a, b, 0.5));
    return midpointCache.get(key);
  };
  const subdivided = [],
    collarFaces = [];
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.getX(i),
      b = geometry.index.getX(i + 1),
      c = geometry.index.getX(i + 2),
      ab = midpoint(a, b),
      bc = midpoint(b, c),
      ca = midpoint(c, a);
    collarFaces.push(
      i < clothCount &&
        [a, b, c].some(
          (id) =>
            attributes.color.getX(id) < 0.8 &&
            attributes.position.getY(id) > 1.5,
        ),
    );
    subdivided.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const bell = (value, center, radius) =>
    Math.exp(-(((value - center) / radius) ** 2));
  const angular = (angle, center, radius) =>
    bell(
      Math.atan2(Math.sin(angle - center), Math.cos(angle - center)),
      0,
      radius,
    );
  const shift = joints.hips.position.clone().sub(new THREE.Vector3(0, 0.95, 0));
  const segments = [];
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    const shoulder = joints[side + "UpperArm"]
        .getWorldPosition(new THREE.Vector3())
        .sub(shift),
      elbow = joints[side + "LowerArm"]
        .getWorldPosition(new THREE.Vector3())
        .sub(shift),
      wrist = joints[side + "Hand"]
        .getWorldPosition(new THREE.Vector3())
        .sub(shift);
    for (const [kind, start, end] of [
      ["upper", shoulder, elbow],
      ["forearm", elbow, wrist],
    ]) {
      const delta = end.clone().sub(start),
        axis = delta.clone().normalize(),
        front = new THREE.Vector3(0, 0, 1);
      front.addScaledVector(axis, -front.dot(axis)).normalize();
      const lateral = front
        .clone()
        .cross(axis)
        .multiplyScalar(sign)
        .normalize();
      segments.push({
        kind,
        sign,
        start,
        axis,
        front,
        lateral,
        length: delta.length(),
      });
    }
  }
  const point = new THREE.Vector3(),
    radial = new THREE.Vector3();
  for (let i = 0; i < values.position.length / 3; i++) {
    point.fromArray(values.position, i * 3);
    const x = Math.abs(point.x),
      y = point.y,
      front = THREE.MathUtils.smoothstep(point.z, 0.012, 0.052),
      torso = 1 - THREE.MathUtils.smoothstep(x, 0.13, 0.19);
    const bust = bell(x, 0.075, 0.062) * bell(y, 1.35, 0.077) * front * torso;
    point.z += 0.011 * bust;
    point.z -= 0.014 * bell(point.x, 0, 0.027) * bell(y, 1.381, 0.078) * front;
    const waist =
      bell(y, 1.165, 0.093) * (1 - THREE.MathUtils.smoothstep(x, 0.16, 0.21));
    point.x *= 1 - 0.025 * waist;
    point.z +=
      0.00045 *
      Math.sin(y * 102 + x * 35) *
      bell(y, 1.19, 0.065) *
      THREE.MathUtils.smoothstep(x, 0.08, 0.13) *
      front *
      torso;
    if (x > 0.15) {
      for (const segment of segments) {
        if (Math.sign(point.x) !== segment.sign) continue;
        radial.copy(point).sub(segment.start);
        const t = radial.dot(segment.axis) / segment.length;
        radial.addScaledVector(segment.axis, -t * segment.length);
        const radius = radial.length();
        if (t < -0.16 || t > 1.12 || radius < 0.018 || radius > 0.095) continue;
        const angle = Math.atan2(
          radial.dot(segment.lateral),
          radial.dot(segment.front),
        );
        let relief;
        if (segment.kind === "upper") {
          relief =
            0.0036 * bell(t, 0.45, 0.24) * angular(angle, 0, 0.78) +
            0.0034 * bell(t, 0.44, 0.27) * angular(angle, Math.PI, 0.82) +
            0.0025 * bell(t, 0.035, 0.19) * angular(angle, Math.PI / 2, 1.0) -
            0.0008 * bell(t, 0.24, 0.055) * angular(angle, Math.PI / 2, 0.7) +
            0.0022 * bell(t, 0.98, 0.075) * angular(angle, Math.PI, 0.55);
        } else {
          const wristFade = 1 - THREE.MathUtils.smoothstep(t, 0.79, 0.96);
          relief =
            wristFade *
            (0.0029 * bell(t, 0.27, 0.21) * angular(angle, Math.PI / 2, 0.65) +
              0.0018 * bell(t, 0.43, 0.26) * angular(angle, 0, 0.7) +
              0.00085 *
                bell(t, 0.69, 0.22) *
                (angular(angle, -0.23, 0.075) + angular(angle, 0.27, 0.09)) -
              0.00065 * bell(t, 0.025, 0.04) * angular(angle, 0, 0.55));
        }
        const edge = THREE.MathUtils.smoothstep(x, 0.15, 0.19);
        point.addScaledVector(radial.normalize(), relief * edge);
      }
    }
    values.position.splice(i * 3, 3, point.x, point.y, point.z);
  }
  const planes = [
    (id) =>
      values.position[id * 3 + 1] - 1.372 - 1.75 * values.position[id * 3],
    (id) =>
      values.position[id * 3 + 1] - 1.372 + 1.75 * values.position[id * 3],
    (id) => values.position[id * 3 + 2] - 0.004,
  ];
  const cuts = new Map();
  const clip = (polygon, plane, planeId, inside) => {
    const output = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = plane(a),
        db = plane(b),
        keepA = inside ? da >= 0 : da < 0,
        keepB = inside ? db >= 0 : db < 0;
      if (keepA) output.push(a);
      if (keepA !== keepB) {
        const key = `${Math.min(a, b)},${Math.max(a, b)}:${planeId}`;
        if (!cuts.has(key)) cuts.set(key, append(a, b, da / (da - db)));
        output.push(cuts.get(key));
      }
    }
    return output;
  };
  const cloth = [],
    skin = subdivided.slice(clothCount * 4);
  const fan = (target, polygon) => {
    for (let i = 1; i + 1 < polygon.length; i++)
      target.push(polygon[0], polygon[i], polygon[i + 1]);
  };
  for (let i = 0; i < clothCount * 4; i += 3) {
    if (collarFaces[Math.floor(i / 12)]) continue;
    let polygon = subdivided.slice(i, i + 3);
    if (planes.some((plane) => polygon.every((id) => plane(id) < 0))) {
      cloth.push(...polygon);
      continue;
    }
    for (let p = 0; p < planes.length && polygon.length; p++) {
      fan(cloth, clip(polygon, planes[p], p, false));
      polygon = clip(polygon, planes[p], p, true);
    }
    fan(skin, polygon);
  }
  for (const [name, attribute] of Object.entries(attributes))
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(
        new attribute.array.constructor(values[name]),
        attribute.itemSize,
      ),
    );
  geometry.setIndex([...cloth, ...skin]);
  smoothNormals(THREE, geometry);
  return {
    clothCount: cloth.length,
    vertices: geometry.attributes.position.count,
  };
}

function smoothNormals(THREE, geometry) {
  geometry.computeVertexNormals();
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    shared = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)]
      .map((value) => Math.round(value * 1e6))
      .join(",");
    if (!shared.has(key))
      shared.set(key, { indices: [], normal: new THREE.Vector3() });
    const group = shared.get(key);
    group.indices.push(i);
    group.normal.add(new THREE.Vector3().fromBufferAttribute(n, i));
  }
  for (const { indices, normal } of shared.values()) {
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();
    for (const i of indices) n.setXYZ(i, ...normal.toArray());
  }
}

export function shapeCombatBoots(THREE, model) {
  model.updateMatrixWorld(true);
  for (const side of ["left", "right"]) {
    const foot = model.userData.joints[side + "Foot"].getWorldPosition(
      new THREE.Vector3(),
    );
    for (const mesh of model.children) {
      if (
        !mesh.isSkinnedMesh ||
        !(
          mesh.name.startsWith(side + "Boot") ||
          mesh.name === side + "WarriorBootGuard"
        )
      )
        continue;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const fit = THREE.MathUtils.smoothstep(p.getY(i), 0.085, 0.205);
        p.setX(i, foot.x + (p.getX(i) - foot.x) * (1 - fit * 0.105));
        p.setZ(i, foot.z + (p.getZ(i) - foot.z) * (1 - fit * 0.045));
      }
      smoothNormals(THREE, mesh.geometry);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
      mesh.boundingBox = mesh.boundingSphere = null;
      mesh.material = mesh.material.clone();
      const material = mesh.material;
      if (/Eyelets/.test(mesh.name)) {
        material.color.setHex(0x867660);
        material.roughness = 0.36;
      } else if (/Laces/.test(mesh.name)) {
        material.color.setHex(0x697469);
        material.roughness = 0.84;
      } else {
        material.color.setHex(
          mesh.name.includes("Tongue") ? 0x26302b : 0x2d3730,
        );
        material.roughness = 0.62;
        material.normalScale?.setScalar(0.085);
        if ("clearcoat" in material) {
          material.clearcoat = 0.09;
          material.clearcoatRoughness = 0.5;
        }
      }
    }
  }
  model.userData.appearance.bootFinish = "fitted-leather";
  return model;
}
