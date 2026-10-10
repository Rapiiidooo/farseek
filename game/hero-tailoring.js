import { fitRay } from "./fit-cache.js";

export function attachGarmentDetail(THREE, model) {
  if (model.userData.appearance?.tailoring === "field-finish") return model;
  const shirt = model.getObjectByName("explorerFieldShirt");
  if (!shirt) return model;
  const openNeckline = model.userData.appearance.neckline === "open-v";
  const shift = model.userData.joints.hips.position
    .clone()
    .sub(new THREE.Vector3(0, 0.95, 0));
  const thread = new THREE.MeshStandardMaterial({
    name: "explorer.cloth",
    color: 0x657064,
    roughness: 0.94,
    vertexColors: true,
  });
  const panel = shirt.material.clone();
  panel.color.setHex(openNeckline ? 0x2d4238 : 0x33473b);
  panel.normalScale?.setScalar(openNeckline ? 0.16 : 0.24);
  const hardware = new THREE.MeshStandardMaterial({
    name: "explorer.hardware",
    color: 0x7d877d,
    roughness: 0.52,
    metalness: 0.72,
    vertexColors: true,
  });
  const projectionMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
  });
  const surfaces = [];
  const surface = (source, centerX = 0, sign = 1, centerZ = 0) => {
    const attributes = source.geometry.attributes;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", attributes.position);
    const cells = new Map(),
      cellSize = 0.018;
    for (let i = 0; i < source.geometry.index.count; i += 3) {
      const ids = [0, 1, 2].map((k) => source.geometry.index.getX(i + k));
      const ys = ids.map((id) => attributes.position.getY(id));
      for (
        let y = Math.floor(Math.min(...ys) / cellSize);
        y <= Math.floor(Math.max(...ys) / cellSize);
        y++
      ) {
        if (!cells.has(y)) cells.set(y, []);
        cells.get(y).push(...ids);
      }
    }
    for (const [key, ids] of cells)
      cells.set(key, new THREE.Uint16BufferAttribute(ids, 1));
    const mesh = new THREE.Mesh(geometry, projectionMaterial);
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const sample = (x, y, radial = false) => {
      geometry.index = cells.get(Math.floor((y + shift.y) / cellSize));
      if (!geometry.index)
        throw new Error(`${source.name}: no garment surface at ${x}, ${y}`);
      if (radial) {
        const direction = new THREE.Vector3(sign * Math.sin(x), 0, Math.cos(x));
        const center = new THREE.Vector3(
          centerX + shift.x,
          y + shift.y,
          centerZ + shift.z,
        );
        ray.set(center.addScaledVector(direction, 1), direction.negate());
      } else {
        ray.set(
          new THREE.Vector3(x + shift.x, y + shift.y, 1),
          new THREE.Vector3(0, 0, -1),
        );
      }
      const hit = fitRay(ray, mesh)[0];
      if (!hit)
        throw new Error(`${source.name}: no garment contact at ${x}, ${y}`);
      const ids = [hit.face.a, hit.face.b, hit.face.c];
      const bary = THREE.Triangle.getBarycoord(
        hit.point,
        ...ids.map((id) =>
          new THREE.Vector3().fromBufferAttribute(attributes.position, id),
        ),
        new THREE.Vector3(),
      ).toArray();
      const normal = new THREE.Vector3(),
        uv = new THREE.Vector2(),
        influence = new Array(source.rigNames.length).fill(0);
      for (let v = 0; v < 3; v++) {
        normal.addScaledVector(
          new THREE.Vector3().fromBufferAttribute(attributes.normal, ids[v]),
          bary[v],
        );
        uv.addScaledVector(
          new THREE.Vector2().fromBufferAttribute(attributes.uv, ids[v]),
          bary[v],
        );
        for (let k = 0; k < 4; k++)
          influence[attributes.skinIndex.getComponent(ids[v], k)] +=
            bary[v] * attributes.skinWeight.getComponent(ids[v], k);
      }
      const indices = influence
        .map((_, i) => i)
        .sort((a, b) => influence[b] - influence[a])
        .slice(0, 4);
      const total = indices.reduce((sum, i) => sum + influence[i], 0);
      const weights = indices.map((i) => influence[i] / total);
      while (indices.length < 4) {
        indices.push(0);
        weights.push(0);
      }
      return {
        point: hit.point,
        normal: normal.normalize(),
        uv,
        indices,
        weights,
      };
    };
    const result = { source, geometry, sample };
    surfaces.push(result);
    return result;
  };
  const parts = () => ({
    position: [],
    normal: [],
    uv: [],
    skinIndex: [],
    skinWeight: [],
    index: [],
  });
  const vertex = (part, at, point, normal = at.normal) => {
    part.position.push(...point.toArray());
    part.normal.push(...normal.toArray());
    part.uv.push(...at.uv.toArray());
    part.skinIndex.push(...at.indices);
    part.skinWeight.push(...at.weights);
  };
  const finish = (source, part, material, name) => {
    const geometry = new THREE.BufferGeometry();
    for (const [key, size] of [
      ["position", 3],
      ["normal", 3],
      ["uv", 2],
      ["skinWeight", 4],
    ])
      geometry.setAttribute(
        key,
        new THREE.Float32BufferAttribute(part[key], size),
      );
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(part.skinIndex, 4),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(part.position.length).fill(1),
        3,
      ),
    );
    geometry.setIndex(part.index);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = source.clone(false);
    mesh.name = name;
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.boundingBox = mesh.boundingSphere = null;
    model.add(mesh);
    return mesh;
  };
  const line = (
    part,
    fitted,
    points,
    {
      radial = false,
      radius = 0.00035,
      lift = 0.0012,
      segments = 80,
      dashed = false,
      closed = false,
    } = {},
  ) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, y]) => new THREE.Vector3(x, y, 0)),
      closed,
      "centripetal",
    );
    const samples = [];
    for (let i = 0; i <= segments; i++) {
      const p = curve.getPoint(i / segments);
      samples.push(fitted.sample(p.x, p.y, radial));
    }
    const start = part.position.length / 3,
      columns = radius > 0.001 ? 6 : 4;
    for (let i = 0; i <= segments; i++) {
      const at = samples[i];
      const tangent = samples[Math.min(segments, i + 1)].point
        .clone()
        .sub(samples[Math.max(0, i - 1)].point)
        .normalize();
      const across = tangent.cross(at.normal).normalize();
      for (let col = 0; col < columns; col++) {
        const a = (col / columns) * Math.PI * 2;
        const normal = across
          .clone()
          .multiplyScalar(Math.cos(a))
          .addScaledVector(at.normal, Math.sin(a));
        const point = at.point
          .clone()
          .addScaledVector(at.normal, lift + Math.sin(a) * radius * 0.55)
          .addScaledVector(across, Math.cos(a) * radius);
        vertex(part, at, point, normal.normalize());
      }
    }
    for (let row = 0; row < segments; row++) {
      if (dashed && row % 3 === 2) continue;
      for (let col = 0; col < columns; col++) {
        const a = start + row * columns + col,
          b = start + row * columns + ((col + 1) % columns);
        part.index.push(a, a + columns, b, b, a + columns, b + columns);
      }
    }
  };
  const patch = (
    part,
    fitted,
    sampler,
    { rows = 18, columns = 10, lift = 0.0006, radial = false } = {},
  ) => {
    const start = part.position.length / 3;
    for (let row = 0; row <= rows; row++)
      for (let col = 0; col <= columns; col++) {
        const [x, y] = sampler(col / columns, row / rows);
        const at = fitted.sample(x, y, radial);
        vertex(part, at, at.point.clone().addScaledVector(at.normal, lift));
      }
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const a = start + row * (columns + 1) + col,
          b = a + columns + 1;
        const pa = new THREE.Vector3().fromArray(part.position, a * 3),
          pb = new THREE.Vector3().fromArray(part.position, b * 3),
          pc = new THREE.Vector3().fromArray(part.position, (a + 1) * 3),
          normal = new THREE.Vector3().fromArray(part.normal, a * 3);
        const forward = pb.sub(pa).cross(pc.sub(pa)).dot(normal) > 0;
        if (forward) part.index.push(a, b, a + 1, b, b + 1, a + 1);
        else part.index.push(a, a + 1, b, b, a + 1, b + 1);
      }
  };
  const chest = surface(shirt),
    shirtPanels = parts(),
    shirtSeams = parts(),
    shirtBinding = parts(),
    zipper = parts();
  const neckBorder = model.userData.neck?.border;
  if (neckBorder)
    for (const border of [neckBorder, ...model.userData.neck.armholes]) {
      const a = shirt.geometry.attributes,
        points = border.map((id) =>
          new THREE.Vector3().fromBufferAttribute(a.position, id),
        ),
        lengths = [0];
      for (let i = 0; i < points.length; i++)
        lengths.push(
          lengths.at(-1) +
            points[i].distanceTo(points[(i + 1) % points.length]),
        );
      const count = Math.ceil(lengths.at(-1) / 0.0015),
        samples = [];
      for (let row = 0; row <= count; row++) {
        const distance = (row / count) * lengths.at(-1);
        let edge =
          lengths.findIndex((length, i) => i > 0 && length >= distance) - 1;
        if (edge < 0) edge = border.length - 1;
        const t =
            (distance - lengths[edge]) / (lengths[edge + 1] - lengths[edge]),
          ids = [border[edge], border[(edge + 1) % border.length]],
          influence = new Map();
        for (let v = 0; v < 2; v++)
          for (let k = 0; k < 4; k++) {
            const bone = a.skinIndex.getComponent(ids[v], k),
              weight = a.skinWeight.getComponent(ids[v], k) * (v ? t : 1 - t);
            influence.set(bone, (influence.get(bone) || 0) + weight);
          }
        const selected = [...influence].sort((a, b) => b[1] - a[1]).slice(0, 4),
          total = selected.reduce((sum, [, weight]) => sum + weight, 0);
        while (selected.length < 4) selected.push([0, 0]);
        samples.push({
          point: points[edge]
            .clone()
            .lerp(points[(edge + 1) % points.length], t),
          normal: new THREE.Vector3()
            .fromBufferAttribute(a.normal, ids[0])
            .lerp(new THREE.Vector3().fromBufferAttribute(a.normal, ids[1]), t)
            .normalize(),
          uv: new THREE.Vector2()
            .fromBufferAttribute(a.uv, ids[0])
            .lerp(new THREE.Vector2().fromBufferAttribute(a.uv, ids[1]), t),
          indices: selected.map(([bone]) => bone),
          weights: selected.map(([, weight]) => weight / total),
        });
      }
      for (const [part, radius, lift, dashed] of [
        [shirtBinding, 0.00115, 0.00085, false],
        [shirtSeams, 0.00023, 0.002, true],
      ]) {
        const start = part.position.length / 3,
          columns = 6;
        for (let row = 0; row <= count; row++) {
          const at = samples[row],
            next = samples[(row + 1) % count],
            previous = samples[(row + count - 1) % count],
            across = next.point
              .clone()
              .sub(previous.point)
              .normalize()
              .cross(at.normal)
              .normalize();
          for (let col = 0; col < columns; col++) {
            const angle = (col / columns) * Math.PI * 2,
              normal = across
                .clone()
                .multiplyScalar(Math.cos(angle))
                .addScaledVector(at.normal, Math.sin(angle));
            vertex(
              part,
              at,
              at.point
                .clone()
                .addScaledVector(
                  at.normal,
                  lift + Math.sin(angle) * radius * 0.55,
                )
                .addScaledVector(across, Math.cos(angle) * radius),
              normal.normalize(),
            );
          }
        }
        for (let row = 0; row < count; row++) {
          if (dashed && row % 4 >= 2) continue;
          for (let col = 0; col < columns; col++) {
            const a = start + row * columns + col,
              b = start + row * columns + ((col + 1) % columns);
            part.index.push(a, a + columns, b, b, a + columns, b + columns);
          }
        }
      }
    }
  for (const sign of [-1, 1]) {
    if (openNeckline) {
      if (!model.userData.neck?.armholes) {
        const armhole = [
          [0.143, 1.286],
          [0.157, 1.342],
          [0.143, 1.427],
          [0.108, 1.485],
          [0.079, 1.499],
        ];
        line(
          shirtBinding,
          chest,
          armhole.map(([x, y]) => [sign * x, y]),
          { radius: 0.0011, lift: 0.0013, segments: 140 },
        );
        line(
          shirtSeams,
          chest,
          armhole.map(([x, y]) => [sign * (x - 0.0025), y]),
          { radius: 0.00024, lift: 0.0012, segments: 140, dashed: true },
        );
      }
      for (const [x, y] of [
        [0.141, 1.364],
        [0.112, 1.459],
      ])
        for (let row = 0; row < 4; row++)
          line(
            shirtSeams,
            chest,
            [
              [sign * (x - 0.002), y + row * 0.0008],
              [sign * (x + 0.002), y + row * 0.0008],
            ],
            { radius: 0.0003, lift: 0.0016, segments: 2 },
          );
    }
    patch(
      shirtPanels,
      chest,
      (u, v) => {
        const width = 0.033 * (0.42 + 0.58 * Math.sin(v * Math.PI) ** 0.4);
        return [
          sign * (0.077 + (u - 0.5) * width + 0.012 * Math.sin(v * Math.PI)),
          1.13 + v * 0.275,
        ];
      },
      { rows: 42, columns: 14, lift: 0.00085 },
    );
    const seam = [
      [0.075, 1.39],
      [0.116, 1.31],
      [0.113, 1.2],
      [0.105, 1.073],
    ];
    for (const offset of [-0.0027, 0.0027])
      line(
        shirtSeams,
        chest,
        seam.map(([x, y]) => [sign * (x + offset), y]),
        { lift: 0.0024, radius: 0.00024, segments: 150, dashed: true },
      );
    if (!neckBorder)
      line(
        shirtSeams,
        chest,
        openNeckline
          ? [1.37, 1.405, 1.44, 1.475, 1.488].map((y) => [
              sign * Math.max(0.003, (y - 1.372) / 1.75 + 0.0027),
              y,
            ])
          : [
              [sign * 0.012, 1.432],
              [sign * 0.058, 1.43],
              [sign * 0.091, 1.407],
            ],
        {
          dashed: true,
          segments: openNeckline ? 90 : 45,
          lift: 0.0012,
          radius: 0.0003,
        },
      );
    line(
      shirtSeams,
      chest,
      [
        [sign * 0.02, 1.281],
        [sign * 0.056, 1.267],
        [sign * 0.092, 1.282],
        [sign * 0.111, 1.311],
      ],
      { radius: 0.00022, lift: 0.0011, dashed: true, segments: 60 },
    );
  }
  line(
    shirtSeams,
    chest,
    [
      [0, 1.043],
      [Math.PI / 2, 1.043],
      [Math.PI, 1.043],
      [Math.PI * 1.5, 1.043],
      [Math.PI * 2, 1.043],
    ],
    { radial: true, dashed: true, segments: 210 },
  );
  for (let row = 0; row < (openNeckline ? 32 : 80); row++) {
    const y = 1.273 + row * 0.0029;
    for (const sign of [-1, 1])
      line(
        zipper,
        chest,
        [
          [sign * 0.0006, y],
          [sign * 0.0023, y + 0.0006],
        ],
        { radius: 0.00042, lift: 0.003, segments: 1 },
      );
  }
  finish(shirt, shirtPanels, panel, "nyraShirtInsetPanels");
  finish(shirt, shirtSeams, thread, "nyraShirtTopstitch");
  finish(shirt, zipper, hardware, "nyraZipperTeeth");
  if (shirtBinding.position.length) {
    const binding = shirt.material.clone();
    binding.color.setHex(0x202c26);
    binding.roughness = 0.86;
    finish(shirt, shirtBinding, binding, "nyraShirtBinding");
  }
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    const trousers = model.getObjectByName(side + "FieldTrousers");
    const leg = surface(trousers, sign * 0.1, sign, 0.025),
      seams = parts(),
      pleats = parts(),
      pocket = parts();
    const knee = [
      [-0.53, 0.458],
      [0.53, 0.458],
      [0.67, 0.487],
      [0.66, 0.566],
      [0.51, 0.591],
      [-0.51, 0.591],
      [-0.66, 0.566],
      [-0.67, 0.487],
    ];
    for (const inset of [0, 0.04])
      line(
        seams,
        leg,
        knee.map(([a, y]) => [
          a * (1 - inset),
          0.525 + (y - 0.525) * (1 - inset),
        ]),
        {
          radial: true,
          closed: true,
          lift: 0.0028,
          radius: 0.00028,
          dashed: true,
          segments: 180,
        },
      );
    for (const y of [0.495, 0.521, 0.547])
      line(
        pleats,
        leg,
        [
          [-0.54, y],
          [0, y + 0.003],
          [0.54, y],
        ],
        { radial: true, lift: 0.0022, radius: 0.00165, segments: 40 },
      );
    line(
      seams,
      leg,
      [
        [0.999, 0.674],
        [1.48, 0.674],
        [1.49, 0.777],
        [1.0, 0.777],
      ],
      {
        radial: true,
        closed: true,
        dashed: true,
        radius: 0.0003,
        lift: 0.003,
        segments: 150,
      },
    );
    patch(pocket, leg, (u, v) => [0.96 + u * 0.56, 0.775 + v * 0.019], {
      rows: 5,
      columns: 18,
      radial: true,
      lift: 0.0032,
    });
    line(
      seams,
      leg,
      [
        [1.77, 0.247],
        [1.72, 0.43],
        [1.68, 0.69],
        [1.66, 0.91],
      ],
      { radial: true, dashed: true, segments: 270, lift: 0.0013 },
    );
    for (const y of [0.236, 0.242])
      line(
        seams,
        leg,
        [
          [0, y],
          [Math.PI / 2, y],
          [Math.PI, y],
          [Math.PI * 1.5, y],
          [Math.PI * 2, y],
        ],
        { radial: true, dashed: true, segments: 90 },
      );
    const legPanel = trousers.material.clone();
    legPanel.color.setHex(0x354036);
    legPanel.normalScale?.setScalar(0.2);
    finish(trousers, seams, thread, side + "NyraTrouserStitching");
    finish(trousers, pleats, legPanel, side + "NyraKneePleats");
    finish(trousers, pocket, legPanel, side + "NyraPocketFlap");
    const upper = model.getObjectByName(side + "BootFlex1");
    const boot = surface(upper, sign * 0.1, sign, 0.045),
      bootSeams = parts(),
      bootBinding = parts();
    for (const y of [0.075, 0.079])
      line(
        bootSeams,
        boot,
        [
          [-1.22, y],
          [-0.65, y + 0.003],
          [0, y + 0.006],
          [0.65, y + 0.003],
          [1.22, y],
        ],
        {
          radial: true,
          lift: 0.0021,
          radius: 0.00028,
          dashed: true,
          segments: 140,
        },
      );
    for (const edge of [-1, 1]) {
      line(
        bootSeams,
        boot,
        [
          [edge * 1.58, 0.047],
          [edge * 1.51, 0.092],
          [edge * 1.35, 0.147],
          [edge * 1.16, 0.206],
        ],
        { radial: true, lift: 0.0018, dashed: true, segments: 110 },
      );
      line(
        bootSeams,
        boot,
        [
          [Math.PI + edge * 0.055, 0.045],
          [Math.PI + edge * 0.055, 0.166],
        ],
        { radial: true, lift: 0.0021, dashed: true, segments: 65 },
      );
    }
    line(
      bootBinding,
      boot,
      [
        [0, 0.217],
        [Math.PI / 2, 0.217],
        [Math.PI, 0.217],
        [Math.PI * 1.5, 0.217],
        [Math.PI * 2, 0.217],
      ],
      {
        radial: true,
        radius: 0.0012,
        lift: 0.0011,
        segments: 96,
      },
    );
    line(
      bootSeams,
      boot,
      [
        [2.2, 0.119],
        [Math.PI, 0.13],
        [4.08, 0.119],
      ],
      {
        radial: true,
        dashed: true,
        radius: 0.00028,
        lift: 0.002,
        segments: 90,
      },
    );
    const leather = upper.material.clone();
    leather.color.setHex(0x252f28);
    const bootThread = thread.clone();
    bootThread.color.setHex(0x636a5b);
    finish(upper, bootSeams, bootThread, side + "NyraBootStitching");
    finish(upper, bootBinding, leather, side + "NyraBootCollar");
    const sole = model.getObjectByName(side + "BootSole"),
      treadParts = [];
    const p = sole.geometry.attributes.position;
    for (let row = 1; row < 48; row += 2) {
      const point = new THREE.Vector3().fromBufferAttribute(p, row * 7 + 3),
        next = new THREE.Vector3().fromBufferAttribute(p, (row + 1) * 7 + 3),
        previous = new THREE.Vector3().fromBufferAttribute(
          p,
          (row - 1) * 7 + 3,
        );
      const tangent = next.sub(previous).normalize(),
        geometry = new THREE.BoxGeometry(0.011, 0.005, 0.003);
      geometry.rotateY(Math.atan2(-tangent.z, tangent.x));
      geometry.translate(
        point.x * 0.992,
        Math.max(-0.1105, point.y + 0.0065),
        point.z * 0.992,
      );
      treadParts.push(geometry.toNonIndexed());
      geometry.dispose();
    }
    const tread = new THREE.BufferGeometry();
    for (const [name, size] of [
      ["position", 3],
      ["normal", 3],
      ["uv", 2],
    ])
      tread.setAttribute(
        name,
        new THREE.Float32BufferAttribute(
          treadParts.flatMap((geometry) => [
            ...geometry.attributes[name].array,
          ]),
          size,
        ),
      );
    for (const geometry of treadParts) geometry.dispose();
    tread.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(tread.attributes.position.count * 3).fill(1),
        3,
      ),
    );
    const rubber = sole.material.clone();
    rubber.color.setHex(0x343d34);
    const lugs = new THREE.Mesh(tread, rubber);
    lugs.name = side + "NyraSoleLugs";
    lugs.castShadow = lugs.receiveShadow = true;
    sole.parent.add(lugs);
  }
  for (const fitted of surfaces) fitted.geometry.dispose();
  projectionMaterial.dispose();
  model.userData.appearance.tailoring = "field-finish";
  model.updateMatrixWorld(true);
  return model;
}
