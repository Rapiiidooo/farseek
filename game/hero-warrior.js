import { fitRay } from "./fit-cache.js";

const TAU = Math.PI * 2;
const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function attachModernWarrior(THREE, model) {
  if (model.userData.appearance?.outfit === "modern-warrior") return model;
  const J = model.userData.joints;
  const trousers = ["left", "right"].map((side) =>
    model.getObjectByName(side + "FieldTrousers"),
  );
  if (trousers.some((mesh) => !mesh?.isSkinnedMesh)) return model;
  const shift = J.hips.position.clone().sub(new THREE.Vector3(0, 0.95, 0));
  const waist = new THREE.Box3();
  const torso = model.getObjectByName("explorerFieldShirt");
  for (const index of torso.geometry.index.array) {
    const point = new THREE.Vector3()
      .fromBufferAttribute(torso.geometry.attributes.position, index)
      .sub(shift);
    if (Math.abs(point.y - 1.02) < 0.008) waist.expandByPoint(point);
  }
  const waistFit = {
    x: Math.max(Math.abs(waist.min.x), waist.max.x) / 0.178,
    front: waist.max.z / 0.116,
    back: -waist.min.z / 0.116,
  };
  const cloth = trousers[0].material.clone();
  cloth.name = "explorer.cloth";
  cloth.color.setHex(0x424b45);
  cloth.roughness = 0.94;
  cloth.normalScale.setScalar(0.12);
  cloth.sheen = 0.16;
  cloth.sheenColor.setHex(0x303936);
  const panel = cloth.clone();
  panel.color.setHex(0x282f2e);
  const webbing = panel.clone();
  webbing.color.setHex(0x202726);
  webbing.normalScale.setScalar(0.18);
  const packMaterial = cloth.clone();
  packMaterial.color.setHex(0x3b4841);
  const signal = cloth.clone();
  signal.color.setHex(0xa64d3c);
  const metal = new THREE.MeshStandardMaterial({
    name: "explorer.hardware",
    color: 0x67716c,
    metalness: 0.75,
    roughness: 0.48,
  });
  const blackMetal = metal.clone();
  blackMetal.color.setHex(0x303937);
  const remove = (mesh) => {
    mesh.removeFromParent();
    mesh.traverse((node) => node.geometry?.dispose());
  };
  const clearMeshes = (parent) => {
    for (const child of [...parent.children]) if (child.isMesh) remove(child);
  };
  clearMeshes(J.hips);
  clearMeshes(J.scarfTail);
  for (const mesh of [...J.spine.children])
    if (
      mesh.isMesh &&
      !Array.isArray(mesh.material) &&
      mesh.material.color.getHex() === 0xa34c39
    )
      remove(mesh);
  const secondary = model.userData.secondary;
  clearMeshes(secondary.backpack);
  clearMeshes(secondary.satchel);
  const gloveMaterials = new Map();
  for (const side of ["left", "right"])
    J[side + "Hand"].traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (!gloveMaterials.has(mesh.material)) {
        const material = mesh.material.clone();
        material.color.setHex(0x29302e);
        material.roughness = 0.88;
        material.clearcoat = 0;
        gloveMaterials.set(mesh.material, material);
      }
      mesh.material = gloveMaterials.get(mesh.material);
    });
  model.updateMatrixWorld(true);

  const finish = (geometry) => {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  };
  const copySkin = (source, geometry, material, name) => {
    const mesh = source.clone(false);
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.name = name;
    mesh.boundingBox = null;
    mesh.boundingSphere = null;
    model.add(mesh);
    return mesh;
  };
  const clippedPanels = (source, regions) => {
    const attributes = Object.entries(source.attributes);
    const values = Object.fromEntries(attributes.map(([name]) => [name, []]));
    const vertex = (index) =>
      Object.fromEntries(
        attributes.map(([name, a]) => [
          name,
          Array.from(
            a.array.slice(index * a.itemSize, (index + 1) * a.itemSize),
          ),
        ]),
      );
    const mix = (a, b, t) =>
      Object.fromEntries(
        attributes.map(([name]) => [
          name,
          a[name].map((v, i) => v + (b[name][i] - v) * t),
        ]),
      );
    for (let i = 0; i < source.index.count; i += 3) {
      const triangle = [0, 1, 2].map((k) => vertex(source.index.getX(i + k)));
      for (const planes of regions) {
        let polygon = triangle;
        for (const distance of planes) {
          const clipped = [];
          for (let edge = 0; edge < polygon.length; edge++) {
            const a = polygon[edge],
              b = polygon[(edge + 1) % polygon.length];
            const da = distance(a.position),
              db = distance(b.position);
            if (da >= 0) clipped.push(a);
            if (da >= 0 !== db >= 0) clipped.push(mix(a, b, da / (da - db)));
          }
          polygon = clipped;
        }
        for (let corner = 1; corner < polygon.length - 1; corner++)
          for (const point of [
            polygon[0],
            polygon[corner],
            polygon[corner + 1],
          ])
            for (const [name] of attributes) values[name].push(...point[name]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of attributes)
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(
          new attribute.array.constructor(values[name]),
          attribute.itemSize,
          attribute.normalized,
        ),
      );
    geometry.setIndex(
      Array.from({ length: geometry.attributes.position.count }, (_, i) => i),
    );
    return geometry;
  };
  const sample = (geometry, y, angle, sign, direct = false) => {
    const p = geometry.attributes.position;
    let row = 0;
    while (row < 79 && p.getY((row + 1) * 49) - shift.y > y) row++;
    const top = p.getY(row * 49) - shift.y,
      bottom = p.getY((row + 1) * 49) - shift.y;
    const t = THREE.MathUtils.clamp((top - y) / (top - bottom), 0, 1);
    let a = direct
      ? angle
      : sign > 0
        ? angle + Math.PI / 2
        : Math.PI * 1.5 - angle;
    a = direct
      ? THREE.MathUtils.clamp(a, 0, TAU - 1e-8)
      : ((a % TAU) + TAU) % TAU;
    const column = (a / TAU) * 48,
      lo = Math.floor(column),
      u = column - lo;
    const references = [
      row * 49 + lo,
      row * 49 + lo + 1,
      (row + 1) * 49 + lo,
      (row + 1) * 49 + lo + 1,
    ];
    const factors = [(1 - t) * (1 - u), (1 - t) * u, t * (1 - u), t * u];
    const point = new THREE.Vector3(),
      normal = new THREE.Vector3(),
      weights = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      point.addScaledVector(
        new THREE.Vector3().fromBufferAttribute(p, references[i]),
        factors[i],
      );
      normal.addScaledVector(
        new THREE.Vector3().fromBufferAttribute(
          geometry.attributes.normal,
          references[i],
        ),
        factors[i],
      );
      for (let component = 0; component < 4; component++)
        weights[component] +=
          geometry.attributes.skinWeight.array[references[i] * 4 + component] *
          factors[i];
    }
    return { point, normal: normal.normalize(), weights };
  };
  const fittedPatch = (
    source,
    sign,
    name,
    y0,
    y1,
    bearing,
    width,
    material,
  ) => {
    const positions = [],
      normals = [],
      uv = [],
      colors = [],
      weights = [],
      indices = [],
      skinIndices = [];
    const rows = 14,
      columns = 12;
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        const v = row / rows,
          u = column / columns;
        const rounded = 0.74 + 0.26 * Math.sin(v * Math.PI) ** 0.4;
        const at = sample(
          source.geometry,
          y0 + v * (y1 - y0),
          bearing + (u - 0.5) * width * rounded,
          sign,
        );
        positions.push(
          ...at.point.addScaledVector(at.normal, 0.0017).toArray(),
        );
        normals.push(...at.normal.toArray());
        uv.push(u, v * 1.5);
        colors.push(0.98, 0.98, 0.98);
        weights.push(...at.weights);
        skinIndices.push(0, 1, 2, 3);
      }
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const a = row * (columns + 1) + column,
          b = a + columns + 1;
        if (sign > 0) indices.push(a, a + 1, b, b, a + 1, b + 1);
        else indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geometry = new THREE.BufferGeometry();
    for (const [key, values, size] of [
      ["position", positions, 3],
      ["normal", normals, 3],
      ["uv", uv, 2],
      ["color", colors, 3],
      ["skinWeight", weights, 4],
    ])
      geometry.setAttribute(
        key,
        new THREE.Float32BufferAttribute(values, size),
      );
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(skinIndices, 4),
    );
    geometry.setIndex(indices);
    return copySkin(source, geometry, material, name);
  };
  const bootMaterials = new Map();
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    clearMeshes(J[side + "UpperLeg"]);
    const pants = model.getObjectByName(side + "FieldTrousers");
    const geometry = pants.geometry.clone(),
      p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) - shift.y;
      const lower = 1 - smooth(0.3, 0.46, y);
      const x = p.getX(i) - shift.x - sign * 0.1;
      const z = p.getZ(i) - shift.z + 0.004;
      p.setXYZ(
        i,
        shift.x + sign * 0.1 + x * (1 - lower * 0.12),
        p.getY(i) - lower * 0.086,
        shift.z - 0.004 + z * (1 - lower * 0.1),
      );
      const fittedWaist = smooth(0.93, 1.004, y);
      const nativeZ = p.getZ(i) - shift.z;
      p.setY(i, p.getY(i) + fittedWaist * 0.022);
      p.setX(
        i,
        shift.x + (p.getX(i) - shift.x) * (1 + (waistFit.x - 1) * fittedWaist),
      );
      p.setZ(
        i,
        shift.z +
          nativeZ *
            (1 +
              ((nativeZ >= 0 ? waistFit.front : waistFit.back) - 1) *
                fittedWaist),
      );
      const inset = 0.003 * smooth(1.005, 1.025, p.getY(i) - shift.y);
      const radial = Math.hypot(p.getX(i) - shift.x, p.getZ(i) - shift.z);
      if (inset > 0 && radial > inset) {
        p.setX(i, shift.x + (p.getX(i) - shift.x) * (1 - inset / radial));
        p.setZ(i, shift.z + (p.getZ(i) - shift.z) * (1 - inset / radial));
      }
    }
    finish(geometry);
    pants.geometry.dispose();
    pants.geometry = geometry;
    pants.boundingBox = null;
    pants.boundingSphere = null;
    pants.material = cloth;
    fittedPatch(
      pants,
      sign,
      side + "WarriorKneePanel",
      0.445,
      0.605,
      0,
      1.55,
      panel,
    );
    fittedPatch(
      pants,
      sign,
      side + "WarriorThighPanel",
      0.655,
      0.795,
      1.24,
      0.6,
      side === "left" ? panel : webbing,
    );
    for (const mesh of [...model.children]) {
      if (!mesh.isMesh || !mesh.name.startsWith(side + "Boot")) continue;
      const geo = mesh.geometry.clone(),
        position = geo.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i) - shift.y;
        const top = smooth(0.16, 0.32, y);
        const x = position.getX(i) - shift.x - sign * 0.1;
        const z = position.getZ(i) - shift.z;
        const lowered = y <= 0.15 ? y : 0.15 + (y - 0.15) * 0.43;
        position.setXYZ(
          i,
          shift.x + sign * 0.1 + x * (1 - top * 0.1),
          shift.y + lowered,
          shift.z + z * (1 - top * 0.06),
        );
      }
      finish(geo);
      mesh.geometry.dispose();
      mesh.geometry = geo;
      mesh.boundingBox = null;
      mesh.boundingSphere = null;
      if (!bootMaterials.has(mesh.material)) {
        const material = mesh.material.clone();
        material.color.setHex(
          mesh.name.endsWith("Laces")
            ? 0x747e75
            : mesh.name.endsWith("Eyelets")
              ? 0x4b5551
              : mesh.name.endsWith("Tongue")
                ? 0x252e2b
                : 0x343d39,
        );
        material.roughness = mesh.name.endsWith("Eyelets") ? 0.54 : 0.89;
        if (material.clearcoat !== undefined) material.clearcoat = 0;
        bootMaterials.set(mesh.material, material);
      }
      mesh.material = bootMaterials.get(mesh.material);
    }
    const sole = model.getObjectByName(side + "BootSole");
    sole.material = sole.material.clone();
    sole.material.color.setHex(0x1e2523);
    const upper = model.getObjectByName(side + "BootFlex1");
    const guard = clippedPanels(upper.geometry, [
        [(p) => shift.y + 0.077 - p[1], (p) => p[2] - shift.z - 0.093],
        [
          (p) => p[1] - shift.y - 0.07,
          (p) => shift.y + 0.16 - p[1],
          (p) => shift.z - 0.025 - p[2],
        ],
      ]),
      gp = guard.attributes.position,
      gn = guard.attributes.normal;
    for (let i = 0; i < gp.count; i++)
      gp.setXYZ(
        i,
        gp.getX(i) + gn.getX(i) * 0.001,
        gp.getY(i) + gn.getY(i) * 0.001,
        gp.getZ(i) + gn.getZ(i) * 0.001,
      );
    copySkin(upper, guard, webbing, side + "WarriorBootGuard");
  }

  const pieces = [];
  const meshAt = (
    parent,
    name,
    geometry,
    material,
    position,
    rotation = [0, 0, 0],
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    pieces.push(mesh);
    return mesh;
  };
  const rounded = (width, height, depth, radius) => {
    const shape = new THREE.Shape(),
      x = -width / 2,
      y = -height / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(
      x + width,
      y + height,
      x + width - radius,
      y + height,
    );
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    const bevel = Math.min(0.003, depth * 0.22);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bevel * 2,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 2,
      curveSegments: 4,
    });
    geometry.center();
    return geometry;
  };
  const tube = (points, radius, segments = 24, closed = false) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        points.map((p) => new THREE.Vector3(...p)),
        closed,
      ),
      segments,
      radius,
      6,
      closed,
    );
  const beltPositions = [],
    beltIndices = [],
    beltUv = [],
    beltWeights = [],
    beltBones = [];
  const beltRig = ["hips", "spine", "leftUpperLeg", "rightUpperLeg"];
  const fittingMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
  });
  const waistSurfaces = [torso, ...trousers].map((source) => {
    const geometry = new THREE.BufferGeometry(),
      cells = new Map();
    const p = source.geometry.attributes.position;
    geometry.setAttribute("position", p);
    for (let i = 0; i < source.geometry.index.count; i += 3) {
      const ids = [0, 1, 2].map((k) => source.geometry.index.getX(i + k));
      const ys = ids.map((id) => p.getY(id));
      if (Math.max(...ys) < 0.975 + shift.y || Math.min(...ys) > 1.04 + shift.y)
        continue;
      for (
        let cell = Math.floor(Math.min(...ys) / 0.015);
        cell <= Math.floor(Math.max(...ys) / 0.015);
        cell++
      ) {
        if (!cells.has(cell)) cells.set(cell, []);
        cells.get(cell).push(...ids);
      }
    }
    for (const [cell, ids] of cells)
      cells.set(cell, new THREE.Uint16BufferAttribute(ids, 1));
    const mesh = new THREE.Mesh(geometry, fittingMaterial);
    mesh.updateMatrixWorld(true);
    return { source, mesh, geometry, cells };
  });
  const waistRay = new THREE.Raycaster(),
    emptyWaistCell = new THREE.Uint16BufferAttribute([], 1);
  const waistEnvelope = (y, angle) => {
    const direction = new THREE.Vector3(
      Math.sin(angle + 1e-5),
      0,
      Math.cos(angle + 1e-5),
    );
    waistRay.set(new THREE.Vector3(shift.x, y + shift.y, shift.z), direction);
    let surface = null,
      hit = null;
    for (const candidate of waistSurfaces) {
      candidate.geometry.index =
        candidate.cells.get(Math.floor((y + shift.y) / 0.015)) ||
        emptyWaistCell;
      for (const point of fitRay(waistRay, candidate.mesh, "farthest"))
        if (!hit || point.distance > hit.distance) {
          hit = point;
          surface = candidate.source;
        }
    }
    if (!hit)
      throw new Error(
        `The tactical belt has no waist surface at ${y}, ${angle}`,
      );
    const ids = [hit.face.a, hit.face.b, hit.face.c],
      attributes = surface.geometry.attributes;
    const bary = THREE.Triangle.getBarycoord(
      hit.point,
      ...ids.map((id) =>
        new THREE.Vector3().fromBufferAttribute(attributes.position, id),
      ),
      new THREE.Vector3(),
    ).toArray();
    const weights = [0, 0, 0, 0];
    for (let vertex = 0; vertex < 3; vertex++)
      for (let component = 0; component < 4; component++) {
        const name =
          surface.rigNames[
            attributes.skinIndex.array[ids[vertex] * 4 + component]
          ];
        const bone = Math.max(0, beltRig.indexOf(name));
        weights[bone] +=
          bary[vertex] *
          attributes.skinWeight.array[ids[vertex] * 4 + component];
      }
    return { point: hit.point, direction, weights };
  };
  const section = [
    [0, -0.025],
    [0.004, -0.025],
    [0.006, -0.023],
    [0.006, -0.01],
    [0.006, 0],
    [0.006, 0.01],
    [0.006, 0.023],
    [0.004, 0.025],
    [0, 0.025],
    [-0.001, 0.023],
    [-0.001, 0],
    [-0.001, -0.023],
  ];
  const profileCount = section.length;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    for (const [out, y] of section) {
      const at = waistEnvelope(1.0085 + y, a);
      const point = at.point.addScaledVector(at.direction, out * 0.5 + 0.0015);
      beltPositions.push(...point.toArray());
      beltWeights.push(...at.weights);
      beltBones.push(0, 1, 2, 3);
      beltUv.push((i / 64) * 8, y * 12);
    }
  }
  for (const surface of waistSurfaces) surface.geometry.dispose();
  fittingMaterial.dispose();
  for (let i = 0; i < 64; i++)
    for (let j = 0; j < profileCount; j++) {
      const a = i * profileCount + j,
        b = i * profileCount + ((j + 1) % profileCount);
      beltIndices.push(
        a,
        a + profileCount,
        b,
        b,
        a + profileCount,
        b + profileCount,
      );
    }
  const belt = new THREE.BufferGeometry();
  belt.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(beltPositions, 3),
  );
  belt.setAttribute("uv", new THREE.Float32BufferAttribute(beltUv, 2));
  belt.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(beltWeights, 4),
  );
  belt.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(beltBones, 4));
  belt.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(beltPositions.length).fill(1),
      3,
    ),
  );
  belt.setIndex(beltIndices);
  for (let i = 0; i < profileCount; i++) {
    const first = i,
      last = i + 64 * profileCount;
    for (const name of ["position", "skinWeight"]) {
      const attribute = belt.attributes[name];
      for (let component = 0; component < attribute.itemSize; component++) {
        const a = first * attribute.itemSize + component,
          b = last * attribute.itemSize + component;
        attribute.array[a] = attribute.array[b] =
          (attribute.array[a] + attribute.array[b]) * 0.5;
      }
    }
  }
  belt.computeVertexNormals();
  const utilityBelt = copySkin(
    trousers[0],
    belt,
    webbing,
    "warriorUtilityBelt",
  );
  utilityBelt.rigNames = beltRig;
  utilityBelt.rigInverses = beltRig.map((name) =>
    J[name].matrixWorld.clone().invert(),
  );
  utilityBelt.rigOwner = null;
  meshAt(
    J.hips,
    "warriorBuckle",
    rounded(0.041, 0.032, 0.011, 0.005),
    blackMetal,
    [0.006, 0.0585, waist.max.z + 0.007],
  );
  meshAt(
    J.hips,
    "warriorBuckleLatch",
    rounded(0.016, 0.018, 0.003, 0.003),
    metal,
    [0.006, 0.0585, waist.max.z + 0.014],
  );
  const pouch = secondary.satchel;
  pouch.position.set(-0.04, -0.012, -0.115);
  pouch.rotation.set(0, Math.PI, 0);
  meshAt(
    pouch,
    "warriorHipPouch",
    rounded(0.073, 0.097, 0.033, 0.016),
    packMaterial,
    [0, -0.012, 0],
  );
  meshAt(
    pouch,
    "warriorHipPouchLid",
    rounded(0.065, 0.022, 0.006, 0.006),
    webbing,
    [0, 0.016, 0.02],
  );
  meshAt(
    pouch,
    "warriorSignalLoop",
    rounded(0.01, 0.034, 0.003, 0.003),
    signal,
    [-0.025, 0.034, 0.011],
  );
  meshAt(
    J.hips,
    "warriorRearPouch",
    rounded(0.087, 0.057, 0.027, 0.012),
    packMaterial,
    [0.095, 0.015, -0.113],
    [0, Math.PI + 0.5, 0],
  );
  const carabiner = [
    [-0.01, 0.02, 0],
    [0.009, 0.017, 0],
    [0.01, -0.011, 0],
    [0.001, -0.022, 0],
    [-0.011, -0.015, 0],
  ];
  meshAt(
    J.hips,
    "warriorCarabiner",
    tube(carabiner, 0.0018, 24, true),
    metal,
    [0.13, 0.011, 0.092],
    [0, 0.6, -0.15],
  );
  meshAt(
    J.hips,
    "warriorBeltLoop",
    rounded(0.012, 0.034, 0.004, 0.002),
    webbing,
    [0.128, 0.048, 0.094],
    [0, 0.6, 0],
  );
  const shirt = model.getObjectByName("explorerFieldShirt");
  const sourcePoints = shirt.geometry.attributes.position;
  const bodyIndex = new THREE.Uint16BufferAttribute(
    [
      ...shirt.geometry.index.array,
      ...model.getObjectByName("explorerBareArms").geometry.index.array,
    ],
    1,
  );
  const projectionGeometry = new THREE.BufferGeometry();
  projectionGeometry.setAttribute("position", sourcePoints);
  const cells = new Map(),
    heightCells = new Map(),
    verticalCells = new Map(),
    cellSize = 0.035;
  for (let i = 0; i < bodyIndex.count; i += 3) {
    const ids = [0, 1, 2].map((k) => bodyIndex.getX(i + k));
    const xs = ids.map((id) => sourcePoints.getX(id)),
      ys = ids.map((id) => sourcePoints.getY(id)),
      zs = ids.map((id) => sourcePoints.getZ(id));
    for (
      let y = Math.floor(Math.min(...ys) / cellSize);
      y <= Math.floor(Math.max(...ys) / cellSize);
      y++
    ) {
      if (!heightCells.has(y)) heightCells.set(y, []);
      heightCells.get(y).push(...ids);
    }
    for (
      let x = Math.floor(Math.min(...xs) / cellSize);
      x <= Math.floor(Math.max(...xs) / cellSize);
      x++
    )
      for (
        let z = Math.floor(Math.min(...zs) / cellSize);
        z <= Math.floor(Math.max(...zs) / cellSize);
        z++
      ) {
        const key = x + "," + z;
        if (!verticalCells.has(key)) verticalCells.set(key, []);
        verticalCells.get(key).push(...ids);
      }
    for (
      let x = Math.floor(Math.min(...xs) / cellSize);
      x <= Math.floor(Math.max(...xs) / cellSize);
      x++
    )
      for (
        let y = Math.floor(Math.min(...ys) / cellSize);
        y <= Math.floor(Math.max(...ys) / cellSize);
        y++
      ) {
        const key = x + "," + y;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(...ids);
      }
  }
  for (const [key, ids] of cells)
    cells.set(key, new THREE.Uint16BufferAttribute(ids, 1));
  for (const buckets of [heightCells, verticalCells])
    for (const [key, ids] of buckets)
      buckets.set(key, new THREE.Uint16BufferAttribute(ids, 1));
  const projection = new THREE.Mesh(
    projectionGeometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  projection.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(),
    empty = new THREE.Uint16BufferAttribute([], 1);
  const sampleSurface = (point, mode = "radial") => {
    const p = point.clone().add(shift);
    if (mode === "front" || mode === "back") {
      projectionGeometry.index =
        cells.get(
          Math.floor(p.x / cellSize) + "," + Math.floor(p.y / cellSize),
        ) || empty;
      ray.set(
        new THREE.Vector3(p.x, p.y, mode === "front" ? 1 : -1),
        new THREE.Vector3(0, 0, mode === "front" ? -1 : 1),
      );
    } else {
      if (mode === "over" || (mode === "radial" && point.y > 1.455)) {
        projectionGeometry.index =
          verticalCells.get(
            Math.floor(p.x / cellSize) + "," + Math.floor(p.z / cellSize),
          ) || empty;
        ray.set(new THREE.Vector3(p.x, 2, p.z), new THREE.Vector3(0, -1, 0));
      } else {
        projectionGeometry.index =
          heightCells.get(Math.floor(p.y / cellSize)) || empty;
        const center = new THREE.Vector3(shift.x, p.y, shift.z);
        ray.set(center, p.clone().sub(center).normalize());
      }
    }
    const hits = fitRay(ray, projection);
    const hit = hits[0];
    if (!hit)
      throw new Error(
        "Equipment surface has no contact at " + point.toArray().join(","),
      );
    const ids = [hit.face.a, hit.face.b, hit.face.c],
      a = shirt.geometry.attributes;
    const bary = THREE.Triangle.getBarycoord(
      hit.point,
      ...ids.map((id) =>
        new THREE.Vector3().fromBufferAttribute(sourcePoints, id),
      ),
      new THREE.Vector3(),
    ).toArray();
    const influence = new Array(shirt.rigNames.length).fill(0),
      normal = new THREE.Vector3();
    for (let v = 0; v < 3; v++) {
      normal.addScaledVector(
        new THREE.Vector3().fromBufferAttribute(a.normal, ids[v]),
        bary[v],
      );
      for (let c = 0; c < 4; c++)
        influence[a.skinIndex.array[ids[v] * 4 + c]] +=
          bary[v] * a.skinWeight.array[ids[v] * 4 + c];
    }
    const order = influence
      .map((_, i) => i)
      .sort((a, b) => influence[b] - influence[a])
      .slice(0, 4);
    const total = order.reduce((sum, i) => sum + influence[i], 0);
    return {
      point: hit.point,
      normal: normal.normalize(),
      indices: order,
      weights: order.map((i) => influence[i] / total),
    };
  };
  const fitted = (name, geometry, material, mode) => {
    const p = geometry.attributes.position,
      n = geometry.attributes.normal,
      indices = [],
      weights = [];
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(p, i),
        depth = point.z;
      const at = sampleSurface(point, mode);
      const normal = new THREE.Vector3().fromBufferAttribute(n, i);
      if (Math.abs(at.normal.z) > 0.15) {
        normal.x += (at.normal.x / at.normal.z) * normal.z;
        normal.y += (at.normal.y / at.normal.z) * normal.z;
      }
      normal.normalize();
      n.setXYZ(i, ...normal.toArray());
      p.setXYZ(
        i,
        at.point.x,
        at.point.y,
        at.point.z + depth + (mode === "front" ? 0.002 : -0.002),
      );
      indices.push(...at.indices);
      weights.push(...at.weights);
    }
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(indices, 4),
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(weights, 4),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(p.count * 3).fill(1),
        3,
      ),
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return copySkin(shirt, geometry, material, name);
  };
  secondary.backpack.position.set(0, 0.23, -0.105);
  secondary.backpack.rotation.set(0, 0, 0);
  const packShape = new THREE.BoxGeometry(0.19, 0.267, 0.058, 10, 14, 4);
  const pp = packShape.attributes.position,
    pn = packShape.attributes.normal;
  for (let i = 0; i < pp.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(pp, i);
    const center = point
      .clone()
      .clamp(
        new THREE.Vector3(-0.081, -0.1195, -0.015),
        new THREE.Vector3(0.081, 0.1195, 0.015),
      );
    const normal = point.clone().sub(center).normalize();
    point.copy(center).addScaledVector(normal, 0.014);
    point.x *= 1 - 0.12 * smooth(-0.01, 0.13, point.y);
    pp.setXYZ(i, ...point.toArray());
    pn.setXYZ(i, ...normal.toArray());
  }
  packShape.translate(0, 1.302, -0.029);
  fitted("warriorHydrationPack", packShape, packMaterial, "back");
  const outerPanel = rounded(0.131, 0.176, 0.008, 0.024);
  outerPanel.translate(0, 1.29, -0.061);
  fitted("warriorPackPanel", outerPanel, panel, "back");
  for (const sign of [-1, 1]) {
    const pad = rounded(0.032, 0.228, 0.008, 0.014);
    pad.translate(sign * 0.052, 1.302, -0.002);
    fitted("warriorPackContactPad" + sign, pad, webbing, "back");
  }
  fitted(
    "warriorPackZip",
    tube(
      [
        [-0.064, 1.39, -0.061],
        [0, 1.411, -0.061],
        [0.064, 1.39, -0.061],
      ],
      0.0015,
    ),
    blackMetal,
    "back",
  );
  const pull = rounded(0.007, 0.019, 0.003, 0.003);
  pull.translate(0.06, 1.382, -0.066);
  fitted("warriorPackPull", pull, signal, "back");
  for (const sign of [-1, 1]) {
    const control = [
      [sign * 0.069, 1.411, -0.077],
      [sign * 0.094, 1.468, -0.05],
      [sign * 0.099, 1.493, -0.013],
      [sign * 0.104, 1.469, 0.042],
      [sign * 0.112, 1.412, 0.1],
      [sign * 0.137, 1.285, 0.09],
      [sign * 0.164, 1.198, 0.024],
      [sign * 0.151, 1.176, -0.049],
      [sign * 0.074, 1.178, -0.075],
    ];
    const curve = new THREE.CatmullRomCurve3(
      control.map((p) => new THREE.Vector3(...p)),
    );
    const positions = [],
      normals = [],
      uv = [],
      indices = [],
      weights = [],
      bones = [];
    const rows = 72,
      columns = 4;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows,
        point = curve.getPoint(t),
        mode = point.y > 1.455 ? "over" : "side",
        at = sampleSurface(point, mode),
        tangent = curve.getTangent(t);
      const across = tangent.clone().cross(at.normal).normalize();
      const width = t < 0.57 ? 0.022 : 0.014;
      for (let column = 0; column <= columns; column++) {
        const u = column / columns,
          target = at.point
            .clone()
            .sub(shift)
            .addScaledVector(across, (u - 0.5) * width);
        const fitted = sampleSurface(target, mode),
          thickness = 0.0026 + 0.0015 * Math.sin(u * Math.PI);
        positions.push(
          ...fitted.point.addScaledVector(fitted.normal, thickness).toArray(),
        );
        normals.push(...fitted.normal.toArray());
        bones.push(...fitted.indices);
        weights.push(...fitted.weights);
        uv.push(u, t * 8);
      }
    }
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const a = row * (columns + 1) + col,
          b = a + columns + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const strap = new THREE.BufferGeometry();
    for (const [name, values, size] of [
      ["position", positions, 3],
      ["normal", normals, 3],
      ["uv", uv, 2],
      ["skinWeight", weights, 4],
    ])
      strap.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
    strap.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(bones, 4));
    strap.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(positions.length).fill(1),
        3,
      ),
    );
    strap.setIndex(indices);
    copySkin(shirt, strap, webbing, "warriorHarness" + sign);
    const adjuster = rounded(0.025, 0.03, 0.006, 0.004);
    adjuster.translate(sign * 0.122, 1.355, 0.007);
    fitted("warriorHarnessAdjuster" + sign, adjuster, blackMetal, "front");
    const latch = rounded(0.014, 0.007, 0.003, 0.0015);
    latch.translate(sign * 0.122, 1.355, 0.012);
    fitted("warriorHarnessLatch" + sign, latch, metal, "front");
    const seam = tube(
      [
        [sign * 0.075, 1.39, 0.001],
        [sign * 0.116, 1.31, 0.001],
        [sign * 0.113, 1.2, 0.001],
        [sign * 0.105, 1.073, 0.001],
      ],
      0.00075,
      38,
    );
    fitted("warriorTorsoSeam" + sign, seam, webbing, "front");
  }
  projectionGeometry.dispose();
  projection.material.dispose();
  model.userData.palmNormals = {};
  model.userData.palmFingers = {};
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    const axis = J[side + "Hand"].position.clone().normalize();
    const normal = new THREE.Vector3(
      -sign * Math.cos(Math.PI / 9),
      0,
      -Math.sin(Math.PI / 9),
    );
    normal.addScaledVector(axis, -normal.dot(axis)).normalize();
    model.userData.palmNormals[side] = normal.toArray();
    model.userData.palmFingers[side] = axis.toArray();
  }
  const glasses = new THREE.Group();
  glasses.name = "warriorSunglasses";
  glasses.position.set(0, -0.0105, -0.013);
  J.head.add(glasses);
  const frameMaterial = new THREE.MeshStandardMaterial({
    name: "explorer.eyewearFrame",
    color: 0x182320,
    roughness: 0.33,
    metalness: 0.38,
  });
  const lensMaterial = new THREE.MeshPhysicalMaterial({
    name: "explorer.eyewearLens",
    color: 0x233c33,
    roughness: 0.14,
    metalness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    transparent: true,
    opacity: 0.91,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const framePieces = [],
    lensPieces = [];
  const contour = [
    [-0.023, 0.009],
    [-0.018, 0.016],
    [0.018, 0.014],
    [0.024, 0.008],
    [0.02, -0.012],
    [-0.016, -0.015],
    [-0.024, -0.006],
  ];
  for (const sign of [-1, 1]) {
    const rim = contour.map(([x, y]) => [
      sign * 0.032 + x,
      0.119 + y,
      0.096 - Math.pow(Math.abs(sign * 0.032 + x) / 0.06, 2) * 0.012,
    ]);
    framePieces.push(tube(rim, 0.00165, 42, true));
    const positions = [],
      uv = [],
      indices = [];
    const center = new THREE.Vector3(sign * 0.032, 0.119, 0.096 - 0.0034);
    positions.push(...center.toArray());
    uv.push(0.5, 0.5);
    for (const p of rim) {
      positions.push(...p);
      uv.push(
        (p[0] - sign * 0.032) / 0.052 + 0.5,
        (p[1] - 0.119) / 0.034 + 0.5,
      );
    }
    for (let i = 0; i < rim.length; i++)
      indices.push(0, i + 1, ((i + 1) % rim.length) + 1);
    const lens = new THREE.BufferGeometry();
    lens.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    lens.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    lens.setIndex(indices);
    lens.computeVertexNormals();
    lensPieces.push(lens);
    framePieces.push(
      tube(
        [
          [sign * 0.056, 0.127, 0.086],
          [sign * 0.071, 0.13, 0.046],
          [sign * 0.078, 0.125, -0.004],
          [sign * 0.074, 0.113, -0.019],
        ],
        0.0018,
        24,
      ),
    );
    const hinge = rounded(0.004, 0.006, 0.004, 0.001);
    hinge.translate(sign * 0.058, 0.13, 0.085);
    framePieces.push(hinge);
    const pad = new THREE.SphereGeometry(1, 10, 8);
    pad.scale(0.002, 0.0035, 0.0015);
    pad.translate(sign * 0.006, 0.128, 0.1);
    framePieces.push(pad);
  }
  framePieces.push(
    tube(
      [
        [-0.009, 0.131, 0.096],
        [0, 0.135, 0.099],
        [0.009, 0.131, 0.096],
      ],
      0.0014,
      18,
    ),
  );
  const mergeDetails = (geometries, name, material, parent) => {
    const positions = [],
      normals = [],
      uv = [],
      colors = [];
    for (const [part, source] of geometries.entries()) {
      const geometry = source.index ? source.toNonIndexed() : source;
      positions.push(...geometry.attributes.position.array);
      normals.push(...geometry.attributes.normal.array);
      uv.push(...geometry.attributes.uv.array);
      const shade = 0.88 + 0.06 * (part % 4);
      for (let i = 0; i < geometry.attributes.position.count; i++)
        colors.push(shade, shade, shade);
      if (geometry !== source) geometry.dispose();
      source.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, values, size] of [
      ["position", positions, 3],
      ["normal", normals, 3],
      ["uv", uv, 2],
      ["color", colors, 3],
    ])
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(values, size),
      );
    return meshAt(parent, name, geometry, material, [0, 0, 0]);
  };
  mergeDetails(framePieces, "warriorSunglassFrame", frameMaterial, glasses);
  mergeDetails(lensPieces, "warriorSunglassLenses", lensMaterial, glasses);
  const watch = new THREE.Group();
  watch.name = "nyraFieldWatch";
  const forearm = J.leftLowerArm;
  const wristAxis = J.leftHand.position.clone().normalize();
  const watchNormal = new THREE.Vector3(...model.userData.palmNormals.left)
    .applyQuaternion(J.leftHand.quaternion)
    .negate();
  watchNormal
    .addScaledVector(wristAxis, -watchNormal.dot(wristAxis))
    .normalize();
  const watchAcross = new THREE.Vector3()
    .crossVectors(wristAxis, watchNormal)
    .normalize();
  watch.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(watchAcross, wristAxis, watchNormal),
  );
  watch.position.copy(J.leftHand.position).multiplyScalar(0.825);
  forearm.add(watch);
  model.updateMatrixWorld(true);
  const wristGeometry = model
    .getObjectByName("explorerBareArms")
    .geometry.clone();
  wristGeometry.applyMatrix4(
    watch.matrixWorld.clone().invert().multiply(model.matrixWorld),
  );
  const wristSurface = new THREE.Mesh(
    wristGeometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const wristIndices = [];
  for (let i = 0; i < wristGeometry.index.count; i += 3) {
    const ids = [0, 1, 2].map((k) => wristGeometry.index.getX(i + k));
    const a = wristGeometry.attributes.position;
    if (
      ids.every(
        (id) => Math.abs(a.getX(id)) < 0.08 && Math.abs(a.getZ(id)) < 0.08,
      ) &&
      ids.some((id) => Math.abs(a.getY(id)) < 0.04)
    )
      wristIndices.push(...ids);
  }
  wristGeometry.setIndex(wristIndices);
  wristSurface.updateMatrixWorld(true);
  const watchRay = new THREE.Raycaster();
  const wristRadius = (y, angle) => {
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    watchRay.set(new THREE.Vector3(0, y, 0), direction);
    const hit = fitRay(watchRay, wristSurface)[0];
    if (!hit) throw new Error("Nyra's watch has no wrist surface");
    return hit.distance;
  };
  const strapPoints = [],
    strapIndices = [],
    strapUv = [];
  const strapSection = [
    [0.00045, -0.009],
    [0.0019, -0.009],
    [0.0023, -0.0078],
    [0.0023, 0.0078],
    [0.0019, 0.009],
    [0.00045, 0.009],
  ];
  const watchContacts = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * TAU;
    for (const [lift, y] of strapSection) {
      const radius = wristRadius(y, angle) + lift;
      strapPoints.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      strapUv.push((i / 64) * 5, y * 50 + 0.5);
    }
    if (i < 64 && i % 4 === 0) {
      const radius = wristRadius(0, angle);
      watchContacts.push([
        Math.sin(angle) * radius,
        0,
        Math.cos(angle) * radius,
      ]);
    }
  }
  const profile = strapSection.length;
  for (let i = 0; i < 64; i++)
    for (let j = 0; j < profile; j++) {
      const a = i * profile + j,
        b = i * profile + ((j + 1) % profile);
      strapIndices.push(a, a + profile, b, b, a + profile, b + profile);
    }
  const strapGeometry = new THREE.BufferGeometry();
  strapGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(strapPoints, 3),
  );
  strapGeometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(strapUv, 2),
  );
  strapGeometry.setIndex(strapIndices);
  strapGeometry.computeVertexNormals();
  meshAt(watch, "nyraWatchStrap", strapGeometry, webbing, [0, 0, 0]);
  const dial = new THREE.Group();
  dial.name = "nyraWatchDial";
  dial.rotation.z = Math.PI / 2;
  dial.position.z =
    Math.max(wristRadius(-0.009, 0), wristRadius(0, 0), wristRadius(0.009, 0)) +
    0.0008;
  watch.add(dial);
  const dialPixels = new Uint8Array(256 * 256 * 4),
    brushPixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const dx = (x - 127.5) / 127.5,
        dy = (y - 127.5) / 127.5,
        r = Math.hypot(dx, dy),
        a = Math.atan2(dy, dx);
      const noise = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
      const grain = Math.sin(a * 420 + Math.sin(r * 25) * 0.18) * 0.023;
      const light = 1.1 - Math.min(1, r) * 0.17 + grain + noise * 0.02;
      const i = (y * 256 + x) * 4;
      dialPixels.set(
        [
          Math.round(24 * light),
          Math.round(34 * light),
          Math.round(39 * light),
          255,
        ],
        i,
      );
      const slope = Math.sin(a * 420 + Math.sin(r * 25) * 0.18) * 2.4;
      brushPixels.set(
        [
          Math.round(128 - Math.sin(a) * slope),
          Math.round(128 + Math.cos(a) * slope),
          255,
          255,
        ],
        i,
      );
    }
  const dialMap = new THREE.DataTexture(dialPixels, 256, 256),
    brushMap = new THREE.DataTexture(brushPixels, 256, 256);
  dialMap.colorSpace = THREE.SRGBColorSpace;
  for (const map of [dialMap, brushMap]) {
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
  }
  const titanium = new THREE.MeshStandardMaterial({
    name: "explorer.watchTitanium",
    color: 0x89918e,
    metalness: 0.86,
    roughness: 0.38,
  });
  const polished = titanium.clone();
  polished.color.setHex(0xb3b9b5);
  polished.roughness = 0.23;
  const dialInk = new THREE.MeshStandardMaterial({
    name: "explorer.watchFace",
    map: dialMap,
    normalMap: brushMap,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughness: 0.46,
    metalness: 0.3,
  });
  const lume = new THREE.MeshStandardMaterial({
    name: "explorer.watchIndices",
    color: 0xbec8bd,
    roughness: 0.39,
    metalness: 0.42,
  });
  const secondsMaterial = new THREE.MeshStandardMaterial({
    name: "explorer.watchSeconds",
    color: 0x98654f,
    metalness: 0.3,
    roughness: 0.51,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: "explorer.watchGlass",
    color: 0xd1dfe0,
    roughness: 0.065,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
  });
  const revolve = (points, segments = 64) =>
    new THREE.LatheGeometry(
      points.map(([r, z]) => new THREE.Vector2(r, z)),
      segments,
    ).rotateX(Math.PI / 2);
  meshAt(
    dial,
    "nyraWatchCase",
    revolve([
      [0, 0],
      [0.0158, 0],
      [0.0176, 0.0007],
      [0.018, 0.0015],
      [0.018, 0.0042],
      [0.0177, 0.0048],
      [0.01665, 0.00575],
      [0.0161, 0.0059],
    ]),
    titanium,
    [0, 0, 0],
  );
  meshAt(
    dial,
    "nyraWatchBezel",
    revolve([
      [0.0161, 0.00565],
      [0.01635, 0.00595],
      [0.01615, 0.00615],
      [0.0156, 0.00615],
      [0.0155, 0.00595],
    ]),
    polished,
    [0, 0, 0],
  );
  meshAt(
    dial,
    "nyraWatchFace",
    new THREE.CircleGeometry(0.01565, 64),
    dialInk,
    [0, 0, 0.00485],
  );
  meshAt(
    dial,
    "nyraWatchChapterRing",
    revolve([
      [0.0145, 0.00485],
      [0.01555, 0.0052],
      [0.0156, 0.0055],
    ]),
    dialInk,
    [0, 0, 0],
  );
  const minuteMarks = [],
    hourMarks = [];
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * TAU;
    const marker = new THREE.BoxGeometry(
      i % 5 ? 0.00016 : 0.00022,
      i % 5 ? 0.00042 : 0.00065,
      0.00013,
    );
    marker.rotateZ(-angle);
    marker.translate(
      Math.sin(angle) * 0.0141,
      Math.cos(angle) * 0.0141,
      0.0053,
    );
    minuteMarks.push(marker);
    if (i % 5 === 0) {
      const hour = new THREE.BoxGeometry(0.0005, 0.00155, 0.00023);
      hour.rotateZ(-angle);
      hour.translate(
        Math.sin(angle) * 0.0124,
        Math.cos(angle) * 0.0124,
        0.00525,
      );
      hourMarks.push(hour);
    }
  }
  for (const [angle, length, width] of [
    [-Math.PI / 3, 0.0074, 0.00085],
    [Math.PI / 3, 0.0108, 0.00058],
  ]) {
    const shape = new THREE.Shape();
    shape.moveTo(-width * 0.38, -0.0011);
    shape.lineTo(-width * 0.5, length * 0.65);
    shape.lineTo(0, length);
    shape.lineTo(width * 0.5, length * 0.65);
    shape.lineTo(width * 0.38, -0.0011);
    shape.closePath();
    const hand = new THREE.ExtrudeGeometry(shape, {
      depth: 0.00018,
      bevelEnabled: false,
    });
    hand.rotateZ(-angle);
    hand.translate(0, 0, 0.00565);
    hourMarks.push(hand);
  }
  mergeDetails(minuteMarks, "nyraWatchMinuteTrack", lume, dial);
  mergeDetails(hourMarks, "nyraWatchIndices", lume, dial);
  const seconds = new THREE.BoxGeometry(0.00016, 0.0139, 0.00012);
  seconds.translate(0, 0.0047, 0);
  seconds.rotateZ(2.62);
  seconds.translate(0, 0, 0.00605);
  meshAt(dial, "nyraWatchSecondHand", seconds, secondsMaterial, [0, 0, 0]);
  meshAt(
    dial,
    "nyraWatchPivot",
    new THREE.SphereGeometry(0.00053, 12, 8),
    polished,
    [0, 0, 0.0061],
  );
  const crystal = new THREE.SphereGeometry(
    0.01558,
    64,
    12,
    0,
    TAU,
    0,
    Math.PI / 2,
  );
  crystal.scale(1, 0.025, 1);
  crystal.rotateX(Math.PI / 2);
  crystal.translate(0, 0, 0.0062);
  meshAt(dial, "nyraWatchGlass", crystal, glass, [0, 0, 0]);
  const crownParts = [];
  const crown = new THREE.CylinderGeometry(0.00135, 0.00135, 0.0018, 24);
  crown.rotateZ(Math.PI / 2);
  crown.translate(0.01825, 0, 0.0027);
  crownParts.push(crown);
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * TAU,
      groove = new THREE.BoxGeometry(0.00125, 0.00012, 0.00022);
    groove.rotateX(angle);
    groove.translate(
      0.0183,
      Math.cos(angle) * 0.00134,
      0.0027 + Math.sin(angle) * 0.00134,
    );
    crownParts.push(groove);
  }
  mergeDetails(crownParts, "nyraWatchCrown", titanium, dial);
  for (const sign of [-1, 1])
    for (const across of [-1, 1]) {
      const lug = rounded(0.0022, 0.0056, 0.0022, 0.0009),
        p = lug.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + across * 0.0077,
          y = p.getY(i) + sign * 0.0176;
        watchRay.set(
          new THREE.Vector3(-y, x, 0.08),
          new THREE.Vector3(0, 0, -1),
        );
        const skin = fitRay(watchRay, wristSurface)[0];
        const fit = (skin?.point.z ?? 0.006) - dial.position.z + 0.0027;
        const z =
          p.getZ(i) +
          0.0013 +
          (fit - 0.0013) * smooth(0.016, 0.0204, Math.abs(y));
        p.setXYZ(i, x, y, z);
      }
      lug.computeVertexNormals();
      meshAt(dial, `nyraWatchLug${sign}:${across}`, lug, titanium, [0, 0, 0]);
    }
  const strapMaterial = new THREE.MeshPhysicalMaterial({
    name: "explorer.watchStrap",
    color: 0x202522,
    roughness: 0.74,
    normalMap: webbing.normalMap,
    normalScale: new THREE.Vector2(0.07, 0.07),
    clearcoat: 0.025,
    clearcoatRoughness: 0.8,
  });
  watch.getObjectByName("nyraWatchStrap").material = strapMaterial;
  const stitches = [];
  for (const side of [-1, 1])
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU,
        y = side * 0.0071,
        points = [];
      for (const offset of [-0.024, 0, 0.024]) {
        const angle = a + offset,
          r = wristRadius(y, angle) + 0.00242;
        points.push([Math.sin(angle) * r, y, Math.cos(angle) * r]);
      }
      stitches.push(tube(points, 0.00013, 3));
    }
  const thread = new THREE.MeshStandardMaterial({
    name: "explorer.watchStitch",
    color: 0x4f5751,
    roughness: 0.94,
  });
  mergeDetails(stitches, "nyraWatchStitching", thread, watch);
  const buckleHeight = -wristRadius(0, Math.PI) - 0.0031;
  meshAt(
    watch,
    "nyraWatchBuckle",
    tube(
      [
        [-0.0068, -0.009, 0],
        [0.0068, -0.009, 0],
        [0.0075, 0.009, 0],
        [-0.0075, 0.009, 0],
      ],
      0.00062,
      16,
      true,
    ),
    titanium,
    [0, 0, buckleHeight],
  );
  meshAt(
    watch,
    "nyraWatchBucklePin",
    new THREE.BoxGeometry(0.00055, 0.014, 0.00065),
    titanium,
    [0, -0.001, buckleHeight],
  );
  for (const side of [-1, 1]) {
    const radius = wristRadius(side * 0.005, Math.PI);
    meshAt(
      watch,
      "nyraWatchKeeper" + side,
      rounded(0.0185, 0.0023, 0.0012, 0.0005),
      strapMaterial,
      [0, side * 0.005, -radius - 0.0029],
    );
  }
  watch.userData.contactSamples = watchContacts;
  watch.userData.segment = "leftLowerArm";
  wristGeometry.dispose();
  wristSurface.material.dispose();
  const hair = model.getObjectByName("explorerHair"),
    hairGeometries = [];
  const hairProjection = new THREE.Mesh(
    hair.geometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  hairProjection.updateMatrixWorld(true);
  const hairRay = new THREE.Raycaster(),
    center = new THREE.Vector3(0, 0.134, -0.014);
  for (let lock = 0; lock < 23; lock++) {
    const lateral = (lock - 11) / 11 + Math.sin(lock * 2.37) * 0.018,
      x = lateral * 0.062;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(
        x,
        0.182 - 0.019 * Math.abs(lateral),
        0.064 - 0.033 * Math.abs(lateral),
      ),
      new THREE.Vector3(x * 0.84, 0.226 - 0.032 * Math.abs(lateral), -0.006),
      new THREE.Vector3(x * 0.6, 0.205, -0.07),
      new THREE.Vector3(x * 0.16, 0.168, -0.109),
    ]);
    const points = [];
    for (let i = 0; i <= 22; i++) {
      const point = curve.getPoint(i / 22),
        direction = point.clone().sub(center).normalize();
      hairRay.set(
        center.clone().addScaledVector(direction, 0.35),
        direction.clone().negate(),
      );
      const hit = fitRay(hairRay, hairProjection)[0];
      if (hit) points.push(hit.point.addScaledVector(direction, 0.0001));
    }
    if (points.length < 8) continue;
    const path = new THREE.CatmullRomCurve3(points),
      geometry = new THREE.TubeGeometry(path, 36, 0.0003, 5, false),
      p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / 6) / 36,
        origin = path.getPointAt(t),
        taper = 0.24 + 0.76 * Math.sin(t * Math.PI) ** 0.45;
      const point = new THREE.Vector3()
        .fromBufferAttribute(p, i)
        .sub(origin)
        .multiplyScalar(taper)
        .add(origin);
      p.setXYZ(i, ...point.toArray());
    }
    geometry.computeVertexNormals();
    hairGeometries.push(geometry);
  }
  const hairDetailMaterial = new THREE.MeshPhysicalMaterial({
    name: "explorer-hair",
    color: 0x322016,
    roughness: 0.82,
    specularIntensity: 0.2,
    sheen: 0.25,
    sheenColor: new THREE.Color(0x906947),
    sheenRoughness: 0.63,
    vertexColors: true,
  });
  mergeDetails(hairGeometries, "warriorHairLocks", hairDetailMaterial, hair);
  hairProjection.material.dispose();
  for (const mesh of pieces) {
    const count = mesh.geometry.attributes.position.count;
    mesh.geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3),
    );
  }
  model.userData.appearance = {
    ...model.userData.appearance,
    outfit: "modern-warrior",
    boots: "combat",
    legs: "tailored",
  };
  model.updateMatrixWorld(true);
  return model;
}
