import { fitRay } from "./fit-cache.js";

export function attachMoonNecklace(THREE, model) {
  if (model.userData.appearance?.jewelry === "bronze-crescent") return model;
  const source = model.getObjectByName("explorerFieldShirt"),
    skin = model.getObjectByName("explorerBareArms"),
    face = model.getObjectByName("explorerFace");
  if (!source || !skin || !face) return model;
  const shift = model.userData.joints.hips.position
    .clone()
    .sub(new THREE.Vector3(0, 0.95, 0));
  const projectionMaterial = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
    }),
    projections = [];
  for (const mesh of [source, skin, face]) {
    mesh.updateWorldMatrix(true, false);
    const attributes = mesh.geometry.attributes,
      position = attributes.position.clone(),
      cells = new Map(),
      geometry = new THREE.BufferGeometry();
    position.applyMatrix4(mesh.matrixWorld);
    geometry.setAttribute("position", position);
    for (let i = 0; i < mesh.geometry.index.count; i += 3) {
      const ids = [0, 1, 2].map((k) => mesh.geometry.index.getX(i + k)),
        ys = ids.map((id) => position.getY(id)),
        xs = ids.map((id) => position.getX(id));
      if (
        Math.max(...ys) < 1.39 ||
        Math.min(...ys) > 1.55 ||
        Math.min(...xs) > 0.11 ||
        Math.max(...xs) < -0.11
      )
        continue;
      for (
        let y = Math.floor(Math.min(...ys) / 0.012);
        y <= Math.floor(Math.max(...ys) / 0.012);
        y++
      ) {
        if (!cells.has(y)) cells.set(y, []);
        cells.get(y).push(...ids);
      }
    }
    for (const [key, ids] of cells)
      cells.set(key, new THREE.Uint16BufferAttribute(ids, 1));
    const projection = new THREE.Mesh(geometry, projectionMaterial);
    projection.updateMatrixWorld(true);
    projections.push({
      projection,
      cells,
      attributes,
      normalMatrix: new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),
      head: mesh === face,
    });
  }
  const ray = new THREE.Raycaster(),
    centerZ = shift.z + (model.userData.neck?.centerZ ?? -0.017);
  const sample = (x, y, radial = false) => {
    if (radial) {
      const direction = new THREE.Vector3(Math.sin(x), 0, Math.cos(x));
      const origin = new THREE.Vector3(shift.x, y + shift.y, centerZ);
      ray.set(origin.addScaledVector(direction, 1), direction.negate());
    } else {
      ray.set(
        new THREE.Vector3(x + shift.x, y + shift.y, 1),
        new THREE.Vector3(0, 0, -1),
      );
    }
    let hit, contact;
    for (const item of projections) {
      item.projection.geometry.index = item.cells.get(
        Math.floor((y + shift.y) / 0.012),
      );
      if (!item.projection.geometry.index) continue;
      const candidate = fitRay(ray, item.projection)[0];
      if (candidate && (!hit || candidate.distance < hit.distance)) {
        hit = candidate;
        contact = item;
      }
    }
    if (!hit) throw new Error(`Necklace has no body contact at ${x}, ${y}`);
    const { attributes, normalMatrix } = contact;
    const ids = [hit.face.a, hit.face.b, hit.face.c],
      bary = THREE.Triangle.getBarycoord(
        hit.point,
        ...ids.map((id) =>
          new THREE.Vector3().fromBufferAttribute(
            contact.projection.geometry.attributes.position,
            id,
          ),
        ),
        new THREE.Vector3(),
      ).toArray(),
      normal = new THREE.Vector3(),
      influence = new Array(source.rigNames.length).fill(0);
    for (let v = 0; v < 3; v++) {
      normal.addScaledVector(
        new THREE.Vector3().fromBufferAttribute(attributes.normal, ids[v]),
        bary[v],
      );
      if (contact.head) influence[source.rigNames.indexOf("head")] += bary[v];
      else
        for (let k = 0; k < 4; k++)
          influence[attributes.skinIndex.getComponent(ids[v], k)] +=
            bary[v] * attributes.skinWeight.getComponent(ids[v], k);
    }
    const indices = influence
        .map((_, i) => i)
        .sort((a, b) => influence[b] - influence[a])
        .slice(0, 4),
      total = indices.reduce((sum, i) => sum + influence[i], 0);
    return {
      point: hit.point,
      normal: normal.applyMatrix3(normalMatrix).normalize(),
      indices,
      weights: indices.map((i) => influence[i] / total),
    };
  };
  const grain = new Uint8Array(64 * 64 * 4),
    roughness = new Uint8Array(grain.length);
  for (let i = 0; i < grain.length; i += 4) {
    const x = (i / 4) % 64,
      y = Math.floor(i / 256),
      n = Math.sin(x * 7.19 + y * 3.71) * Math.cos(x * 2.27 - y * 5.31);
    grain.set(
      [128 + n * 9, 128 + Math.sin(x * 3.17 + y * 4.13) * 9, 254, 255],
      i,
    );
    const shade = 195 + n * 28;
    roughness.set([shade, shade, shade, 255], i);
  }
  const normalMap = new THREE.DataTexture(grain, 64, 64),
    roughnessMap = new THREE.DataTexture(roughness, 64, 64);
  for (const texture of [normalMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(160, 160);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
  const bronze = new THREE.MeshStandardMaterial({
      name: "explorer.jewelry",
      color: 0xb29a70,
      metalness: 0.78,
      roughness: 0.46,
      normalMap,
      normalScale: new THREE.Vector2(0.13, 0.13),
      roughnessMap,
      vertexColors: true,
    }),
    inset = new THREE.MeshStandardMaterial({
      name: "explorer.jewelryInset",
      color: 0x5e4b31,
      metalness: 0.64,
      roughness: 0.56,
    });
  const parts = () => ({
      position: [],
      normal: [],
      uv: [],
      color: [],
      skinIndex: [],
      skinWeight: [],
    }),
    metal = parts(),
    engraving = parts(),
    wear = parts();
  const append = (part, geo, at, matrix, varied = false) => {
    const expanded = geo.index ? geo.toNonIndexed() : geo,
      normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix),
      point = new THREE.Vector3(),
      normal = new THREE.Vector3();
    for (let i = 0; i < expanded.attributes.position.count; i++) {
      const x = expanded.attributes.position.getX(i),
        y = expanded.attributes.position.getY(i),
        tint = varied
          ? 0.96 +
            Math.sin(y * 480 + Math.cos(x * 290)) * 0.045 +
            Math.cos(x * 610 + y * 170) * 0.022
          : 1;
      point
        .fromBufferAttribute(expanded.attributes.position, i)
        .applyMatrix4(matrix);
      normal
        .fromBufferAttribute(expanded.attributes.normal, i)
        .applyMatrix3(normalMatrix)
        .normalize();
      part.position.push(...point.toArray());
      part.normal.push(...normal.toArray());
      part.uv.push(
        expanded.attributes.uv?.getX(i) || 0,
        expanded.attributes.uv?.getY(i) || 0,
      );
      part.color.push(tint, tint, tint);
      part.skinIndex.push(...at.indices);
      part.skinWeight.push(...at.weights);
    }
    if (expanded !== geo) expanded.dispose();
    geo.dispose();
  };
  const frame = (at, tangent = new THREE.Vector3(0, 1, 0), lift = 0.003) => {
    const y = tangent
        .clone()
        .addScaledVector(at.normal, -tangent.dot(at.normal))
        .normalize(),
      x = y.clone().cross(at.normal).normalize();
    return new THREE.Matrix4()
      .makeBasis(x, y, at.normal)
      .setPosition(at.point.clone().addScaledVector(at.normal, lift));
  };
  const guide = [
    sample(0, 1.445),
    sample(0.025, 1.46),
    sample(0.043, 1.48),
    sample(1.2, 1.515, true),
    sample(Math.PI / 2, 1.529, true),
    sample(2.3, 1.531, true),
    sample(Math.PI, 1.532, true),
    sample(4, 1.531, true),
    sample(Math.PI * 1.5, 1.529, true),
    sample(Math.PI * 2 - 1.2, 1.515, true),
    sample(-0.043, 1.48),
    sample(-0.025, 1.46),
  ];
  const guideCurve = new THREE.CatmullRomCurve3(
    guide.map((at) => at.point),
    true,
    "centripetal",
  );
  const projected = Array.from({ length: 480 }, (_, i) => {
    const p = guideCurve.getPointAt(i / 480),
      angle = Math.atan2(p.x - shift.x, p.z - centerZ),
      at = sample(angle, p.y - shift.y, true);
    return at.point.addScaledVector(at.normal, 0.0016);
  });
  const curve = new THREE.CatmullRomCurve3(projected, true, "centripetal"),
    count = Math.ceil(curve.getLength() / 0.00255 / 2) * 2;
  for (let i = 0; i < count; i++) {
    const p = curve.getPointAt(i / count),
      angle = Math.atan2(p.x - shift.x, p.z - centerZ),
      at = sample(angle, p.y - shift.y, true),
      matrix = frame(at, curve.getTangentAt(i / count), 0.0016),
      ring = new THREE.TorusGeometry(0.00105, 0.00022, 6, 14);
    ring.scale(0.87, 1.5, 1);
    ring.rotateY(i % 2 ? Math.PI * 0.48 : -0.08);
    append(metal, ring, at, matrix);
  }
  const at = sample(0, 1.425),
    pendantFrame = frame(at, new THREE.Vector3(0, 1, 0), 0.0038),
    radius = 0.0155,
    inner = 0.0142,
    offset = 0.008,
    tipX = (radius * radius - inner * inner + offset * offset) / (2 * offset),
    tipY = Math.sqrt(radius * radius - tipX * tipX),
    outerAngle = Math.atan2(tipY, tipX),
    innerAngle = Math.atan2(tipY, tipX - offset),
    shape = new THREE.Shape();
  const anchor = guide[0].point
      .clone()
      .addScaledVector(guide[0].normal, 0.0016),
    bailCenter = new THREE.Vector3(0, 0.0171, 0.00065).applyMatrix4(
      pendantFrame,
    );
  pendantFrame.setPosition(
    new THREE.Vector3()
      .setFromMatrixPosition(pendantFrame)
      .add(anchor.sub(bailCenter)),
  );
  at.indices = guide[0].indices;
  at.weights = guide[0].weights;
  shape.moveTo(tipX, tipY);
  shape.absarc(0, 0, radius, outerAngle, Math.PI * 2 - outerAngle, false);
  shape.absarc(offset, 0, inner, -innerAngle, innerAngle - Math.PI * 2, true);
  shape.closePath();
  const moon = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0013,
    bevelEnabled: true,
    bevelThickness: 0.00055,
    bevelSize: 0.0005,
    bevelSegments: 3,
    curveSegments: 28,
    steps: 1,
  });
  append(metal, moon, at, pendantFrame, true);
  const stroke = (
    points,
    radius = 0.00012,
    smooth = false,
    part = engraving,
  ) => {
    const path = points.map(([x, y]) => new THREE.Vector3(x, y, 0.00194));
    let curve;
    if (smooth) curve = new THREE.CatmullRomCurve3(path);
    else {
      curve = new THREE.CurvePath();
      for (let i = 1; i < path.length; i++)
        curve.add(new THREE.LineCurve3(path[i - 1], path[i]));
    }
    append(
      part,
      new THREE.TubeGeometry(
        curve,
        Math.max(12, path.length * 4),
        radius,
        5,
        false,
      ),
      at,
      pendantFrame,
    );
  };
  for (const [from, to] of [
    [0.61, 0.81],
    [0.9, 1.13],
    [1.23, 1.39],
  ])
    stroke(
      Array.from({ length: 17 }, (_, i) => {
        const angle = Math.PI * (from + (i / 16) * (to - from));
        return [
          Math.cos(angle) * (radius - 0.0012),
          Math.sin(angle) * (radius - 0.0012),
        ];
      }),
      0.000095,
      true,
    );
  const dot = (x, y, r = 0.00023) => {
    const sphere = new THREE.SphereGeometry(r, 10, 6);
    sphere.scale(1, 1, 0.32);
    sphere.translate(x, y, 0.00198);
    append(engraving, sphere, at, pendantFrame);
  };
  for (const [x, y, r] of [
    [-0.0011, 0.0127, 0.00018],
    [-0.002, 0.0117, 0.00017],
    [-0.006, 0.0089, 0.00047],
    [-0.007, 0.00855, 0.00035],
    [-0.0097, -0.0067, 0.00063],
  ]) {
    const ring = new THREE.TorusGeometry(r, 0.00011, 5, 14);
    ring.translate(x, y, 0.00196);
    append(engraving, ring, at, pendantFrame);
  }
  stroke([
    [-0.01045, 0.00565],
    [-0.0095, 0.0073],
    [-0.00855, 0.00565],
    [-0.01045, 0.00565],
  ]);
  dot(-0.0095, 0.0062, 0.00016);
  for (let row = 0; row < 3; row++)
    stroke(
      Array.from({ length: 9 }, (_, i) => [
        -0.0132 + (i / 8) * 0.0031,
        0.00285 - row * 0.00066 + Math.sin((i / 8) * Math.PI * 2) * 0.00024,
      ]),
      0.0001,
      true,
    );
  stroke(
    [
      [-0.0127, -0.0019],
      [-0.0108, -0.0029],
      [-0.012, -0.0045],
    ],
    0.000085,
  );
  for (const [x, y] of [
    [-0.0127, -0.0019],
    [-0.0108, -0.0029],
    [-0.012, -0.0045],
  ])
    dot(x, y);
  stroke(
    [
      [-0.0068, -0.0094],
      [-0.0058, -0.0103],
      [-0.00465, -0.00945],
    ],
    0.00012,
  );
  stroke(
    [
      [-0.0061, -0.0106],
      [-0.00515, -0.01135],
      [-0.00415, -0.01065],
    ],
    0.00009,
  );
  for (const [x, y] of [
    [-0.0146, 0.0041],
    [-0.0131, -0.007],
    [-0.001, -0.0139],
  ])
    stroke(
      [
        [x, y],
        [x + 0.00042, y + 0.00055],
      ],
      0.00008,
      false,
      wear,
    );
  const bail = new THREE.TorusGeometry(0.0025, 0.00062, 6, 14);
  bail.scale(0.7, 1, 1);
  bail.translate(0, 0.0171, 0.00065);
  append(metal, bail, at, pendantFrame);
  const claspAt = sample(Math.PI, 1.532, true),
    claspFrame = frame(claspAt);
  const clasp = new THREE.TorusGeometry(0.00165, 0.00032, 6, 14);
  clasp.scale(1.35, 1, 1);
  append(metal, clasp, claspAt, claspFrame);
  const finish = (part, material, name) => {
    const result = new THREE.BufferGeometry();
    for (const [key, size] of [
      ["position", 3],
      ["normal", 3],
      ["uv", 2],
      ["color", 3],
      ["skinWeight", 4],
    ])
      result.setAttribute(
        key,
        new THREE.Float32BufferAttribute(part[key], size),
      );
    result.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(part.skinIndex, 4),
    );
    result.computeBoundingBox();
    result.computeBoundingSphere();
    const mesh = source.clone(false);
    mesh.name = name;
    mesh.geometry = result;
    mesh.material = material;
    mesh.boundingBox = mesh.boundingSphere = null;
    model.add(mesh);
  };
  finish(metal, bronze, "nyraMoonNecklace");
  finish(engraving, inset, "nyraMoonEngraving");
  const polished = bronze.clone();
  polished.color.setHex(0xc4ae83);
  polished.roughness = 0.29;
  finish(wear, polished, "nyraMoonWear");
  for (const { projection } of projections) projection.geometry.dispose();
  projectionMaterial.dispose();
  model.userData.appearance.jewelry = "bronze-crescent";
  model.userData.appearance.necklaceLinks = count;
  model.userData.appearance.pendantSymbols = 7;
  model.updateMatrixWorld(true);
  return model;
}
