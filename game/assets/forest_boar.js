export default function generate(THREE) {
  const root = new THREE.Group();
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const mat = (color, name, roughness = 0.94) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness });
    material.name = name;
    return material;
  };
  const fur = mat(0x62503f, "boar-fur");
  const mane = mat(0x3c3026, "boar-fur");
  const shank = mat(0x4a3b2e, "boar-fur");
  const tips = mat(0x89715a, "boar-fur");
  const skin = mat(0x514239, "boar-skin", 0.76);
  const recess = mat(0x241b17, "mouth", 0.8);
  const hoof = mat(0x34302a, "hoof", 0.66);
  const ivory = mat(0xd5c4a2, "tusk", 0.46);
  const eye = mat(0x181410, "eye", 0.18);
  const iris = mat(0x926839, "iris", 0.32);
  const joints = {};
  const joint = (parent, name, at) => {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(...at);
    parent.add(node);
    joints[name] = node;
    return node;
  };
  const body = joint(root, "body", [0, 0, 0]);
  const head = joint(body, "head", [0, 0.84, 0.37]);
  const buckets = new Map();
  const part = (
    parent,
    material,
    geometry,
    at = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
  ) => {
    const transformed = geometry.index
      ? geometry.toNonIndexed()
      : geometry.clone();
    transformed.applyMatrix4(
      new THREE.Matrix4().compose(
        V(...at),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        V(...scale),
      ),
    );
    if (!buckets.has(parent)) buckets.set(parent, new Map());
    const materials = buckets.get(parent);
    if (!materials.has(material)) materials.set(material, []);
    materials.get(material).push(transformed);
    geometry.dispose();
  };
  const ellipsoid = (parent, material, at, scale, width = 24, height = 16) =>
    part(
      parent,
      material,
      new THREE.SphereGeometry(1, width, height),
      at,
      [0, 0, 0],
      scale,
    );
  const profiles = {
    body: [
      [-0.88, 0.69, 0.015, 0.025],
      [-0.78, 0.68, 0.23, 0.23],
      [-0.59, 0.71, 0.31, 0.29],
      [-0.34, 0.76, 0.34, 0.32],
      [-0.08, 0.81, 0.355, 0.35],
      [0.17, 0.84, 0.37, 0.355],
      [0.34, 0.84, 0.325, 0.325],
      [0.5, 0.8, 0.21, 0.25],
      [0.61, 0.8, 0.018, 0.04],
    ],
    head: [
      [-0.16, 0.025, 0.075, 0.13],
      [-0.04, 0.03, 0.21, 0.225],
      [0.13, 0.012, 0.275, 0.25],
      [0.29, -0.025, 0.24, 0.21],
      [0.46, -0.08, 0.2, 0.16],
      [0.63, -0.135, 0.172, 0.115],
      [0.76, -0.145, 0.168, 0.108],
    ],
  };
  const interpolate = (name, z) => {
    const rows = profiles[name];
    let row = 0;
    while (row < rows.length - 2 && z > rows[row + 1][0]) row++;
    const t = THREE.MathUtils.clamp(
      (z - rows[row][0]) / (rows[row + 1][0] - rows[row][0]),
      0,
      1,
    );
    return [1, 2, 3].map((column) => {
      const p0 = rows[Math.max(0, row - 1)][column],
        p1 = rows[row][column],
        p2 = rows[row + 1][column],
        p3 = rows[Math.min(rows.length - 1, row + 2)][column];
      const value =
        0.5 *
        (2 * p1 +
          (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      return column === 1 ? value : Math.max(0.008, value);
    });
  };
  const section = (name, z) => interpolate(name, z);
  const sample = (name, z, angle) => {
    const [y, rx, ry] = section(name, z);
    return V(Math.cos(angle) * rx, y + Math.sin(angle) * ry, z);
  };
  const loft = (name, rows = 32, sides = 36) => {
    const start = profiles[name][0][0],
      end = profiles[name].at(-1)[0];
    const positions = [],
      uv = [],
      indices = [];
    for (let row = 0; row <= rows; row++)
      for (let side = 0; side <= sides; side++) {
        positions.push(
          ...sample(
            name,
            start + ((end - start) * row) / rows,
            (side / sides) * Math.PI * 2,
          ).toArray(),
        );
        uv.push(side / sides, row / rows);
      }
    for (let row = 0; row < rows; row++)
      for (let side = 0; side < sides; side++) {
        const a = row * (sides + 1) + side,
          b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    for (const row of [0, rows]) {
      const z = row === 0 ? start : end,
        center = positions.length / 3;
      positions.push(0, section(name, z)[0], z);
      uv.push(0.5, row / rows);
      for (let side = 0; side < sides; side++) {
        const a = row * (sides + 1) + side;
        indices.push(...(row === 0 ? [center, a + 1, a] : [center, a, a + 1]));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const normals = geometry.attributes.normal;
    for (let row = 0; row <= rows; row++) {
      const first = row * (sides + 1),
        last = first + sides;
      const normal = V()
        .fromBufferAttribute(normals, first)
        .add(V().fromBufferAttribute(normals, last))
        .normalize();
      normals.setXYZ(first, normal.x, normal.y, normal.z);
      normals.setXYZ(last, normal.x, normal.y, normal.z);
    }
    return geometry;
  };
  part(body, fur, loft("body"));
  part(head, fur, loft("head", 32, 36));
  const hair = (
    parent,
    point,
    normal,
    length,
    width,
    material,
    curl = 0,
    flow = V(curl, -0.15, -1),
  ) => {
    const tangent = flow
      .clone()
      .addScaledVector(normal, -flow.dot(normal))
      .normalize();
    const lateral = V().crossVectors(normal, tangent).normalize();
    const positions = [],
      uv = [],
      indices = [];
    for (let row = 0; row < 4; row++) {
      const t = row / 3,
        taper = row === 3 ? 0.035 : row === 0 ? 0.65 : 1 - t * 0.45;
      const center = point
        .clone()
        .addScaledVector(tangent, length * t)
        .addScaledVector(normal, 0.003 + Math.sin(t * Math.PI) * length * 0.17);
      for (let side = 0; side < 4; side++) {
        const angle = (side * Math.PI) / 2;
        const p = center
          .clone()
          .addScaledVector(lateral, Math.cos(angle) * width * taper)
          .addScaledVector(normal, Math.sin(angle) * width * taper * 0.3);
        positions.push(...p.toArray());
        uv.push(side / 4, t);
      }
    }
    for (let row = 0; row < 3; row++)
      for (let side = 0; side < 4; side++) {
        const a = row * 4 + side,
          b = row * 4 + ((side + 1) % 4);
        indices.push(a, b, a + 4, b, b + 4, a + 4);
      }
    indices.push(0, 2, 1, 0, 3, 2, 12, 13, 14, 12, 14, 15);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    part(parent, material, geometry);
  };
  for (const [name, parent, rows, sides, start, end] of [
    ["body", body, 26, 26, -0.78, 0.49],
    ["head", head, 12, 20, -0.035, 0.58],
  ])
    for (let row = 0; row < rows; row++)
      for (let side = 0; side < sides; side++) {
        const hash = (offset) => {
          const value =
            Math.sin(row * 127.1 + side * 311.7 + offset * 53.3) * 43758.5453;
          return value - Math.floor(value);
        };
        const z = start + ((end - start) * (row + hash(1) * 0.9)) / rows;
        const angle =
          -0.42 +
          ((side + (hash(2) - 0.5) * 0.85) / (sides - 1)) * (Math.PI + 0.84);
        if (
          name === "head" &&
          z > 0.09 &&
          z < 0.27 &&
          Math.abs(Math.sin(angle)) < 0.28
        )
          continue;
        const [, rx, ry] = section(name, z),
          normal = V(Math.cos(angle) / rx, Math.sin(angle) / ry, 0).normalize();
        const random = hash(3);
        const crest = name === "body" && Math.sin(angle) > 0.94;
        hair(
          parent,
          sample(name, z, angle),
          normal,
          (crest ? 0.092 : name === "body" ? 0.06 : 0.039) *
            (0.8 + random * 0.35),
          0.003 + random * 0.0035,
          crest ? mane : hash(4) < 0.1 ? tips : fur,
          (hash(5) - 0.5) * 0.55,
        );
      }
  // The coat rows stop short of the rump, which was left bare.
  for (let row = 0; row < 4; row++)
    for (let side = 0; side < 16; side++) {
      const hash = (offset) => {
        const value =
          Math.sin(row * 71.3 + side * 157.9 + offset * 29.1) * 43758.5453;
        return value - Math.floor(value);
      };
      const z = -0.866 + ((row + hash(1) * 0.8) / 4) * 0.084;
      const angle =
        -0.6 + ((side + (hash(2) - 0.5) * 0.8) / 15) * (Math.PI + 1.2);
      const point = sample("body", z, angle);
      const normal = V()
        .crossVectors(
          sample("body", z, angle + 0.01).sub(sample("body", z, angle - 0.01)),
          sample("body", z + 0.005, angle).sub(
            sample("body", z - 0.005, angle),
          ),
        )
        .normalize();
      if (normal.dot(V(Math.cos(angle), Math.sin(angle), -0.5)) < 0)
        normal.negate();
      hair(
        body,
        point,
        normal,
        0.05 * (0.8 + hash(3) * 0.35),
        0.003 + hash(3) * 0.003,
        hash(4) < 0.1 ? tips : fur,
        0,
        V((hash(5) - 0.5) * 0.4, -0.7, -1),
      );
    }
  ellipsoid(head, fur, [0, -0.19, 0.49], [0.178, 0.087, 0.25]);
  const nose = new THREE.Shape();
  nose.absellipse(0, 0, 0.17, 0.107, 0, Math.PI * 2, false, 0);
  for (const side of [-1, 1]) {
    const opening = new THREE.Path();
    opening.absellipse(
      side * 0.064,
      0.007,
      0.029,
      0.035,
      0,
      Math.PI * 2,
      true,
      side * -0.25,
    );
    nose.holes.push(opening);
  }
  part(
    head,
    skin,
    new THREE.ExtrudeGeometry(nose, {
      depth: 0.023,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      curveSegments: 24,
      steps: 1,
    }),
    [0, -0.145, 0.756],
  );
  const tube = (
    parent,
    material,
    points,
    radius,
    segments = 24,
    sides = 8,
    taper = false,
  ) => {
    const path = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
    const geometry = new THREE.TubeGeometry(
      path,
      segments,
      radius,
      sides,
      false,
    );
    if (taper) {
      const positions = geometry.attributes.position;
      for (let row = 0; row <= segments; row++) {
        const center = path.getPointAt(row / segments),
          factor = Math.max(0.025, (1 - row / segments) ** 0.8);
        for (let side = 0; side <= sides; side++) {
          const i = row * (sides + 1) + side;
          const p = V()
            .fromBufferAttribute(positions, i)
            .sub(center)
            .multiplyScalar(factor)
            .add(center);
          positions.setXYZ(i, p.x, p.y, p.z);
        }
      }
      geometry.computeVertexNormals();
    }
    part(parent, material, geometry);
  };
  tube(
    head,
    recess,
    [
      [-0.155, -0.235, 0.5],
      [-0.16, -0.235, 0.61],
      [0, -0.25, 0.746],
      [0.16, -0.235, 0.61],
      [0.155, -0.235, 0.5],
    ],
    0.004,
  );
  const earShell = (inner) => {
    const positions = [],
      uv = [],
      indices = [],
      rows = 12,
      sides = 12;
    for (let row = 0; row <= rows; row++)
      for (let side = 0; side <= sides; side++) {
        const t = row / rows,
          u = (side / sides) * 2 - 1,
          width =
            (inner ? 0.063 : 0.091) *
            (1 - t) ** 0.72 *
            Math.min(1, 0.62 + t * 3);
        positions.push(
          u * width,
          t * (inner ? 0.188 : 0.235),
          0.014 +
            (inner ? 0.012 : 0) +
            (1 - u * u) * Math.sin(t * Math.PI) * 0.045,
        );
        uv.push(side / sides, t);
      }
    for (let row = 0; row < rows; row++)
      for (let side = 0; side < sides; side++) {
        const a = row * (sides + 1) + side,
          b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };
  for (const side of [-1, 1]) {
    ellipsoid(
      head,
      recess,
      [side * 0.064, -0.139, 0.756],
      [0.032, 0.038, 0.012],
      16,
      12,
    );
    ellipsoid(
      head,
      eye,
      [side * 0.256, 0.042, 0.17],
      [0.024, 0.026, 0.034],
      20,
      14,
    );
    ellipsoid(
      head,
      iris,
      [side * 0.274, 0.042, 0.177],
      [0.0045, 0.014, 0.021],
      16,
      12,
    );
    ellipsoid(
      head,
      eye,
      [side * 0.278, 0.042, 0.18],
      [0.003, 0.011, 0.01],
      16,
      10,
    );
    tube(
      head,
      mane,
      [
        [side * 0.244, 0.047, 0.134],
        [side * 0.261, 0.07, 0.166],
        [side * 0.251, 0.051, 0.205],
      ],
      0.012,
      16,
      6,
    );
    tube(
      head,
      skin,
      [
        [side * 0.245, 0.039, 0.135],
        [side * 0.264, 0.016, 0.166],
        [side * 0.25, 0.03, 0.203],
      ],
      0.008,
      16,
      6,
    );
    const ear = joint(head, side > 0 ? "leftEar" : "rightEar", [
      side * 0.19,
      0.195,
      -0.033,
    ]);
    const earMaterial = fur.clone();
    earMaterial.side = THREE.DoubleSide;
    const innerMaterial = skin.clone();
    innerMaterial.side = THREE.DoubleSide;
    part(
      ear,
      earMaterial,
      earShell(false),
      [0, 0, 0],
      [-0.27, side * -0.12, side * -0.31],
    );
    part(
      ear,
      innerMaterial,
      earShell(true),
      [0, 0.022, 0.006],
      [-0.27, side * -0.12, side * -0.31],
    );
    tube(
      head,
      ivory,
      [
        [side * 0.17, -0.182, 0.51],
        [side * 0.247, -0.16, 0.593],
        [side * 0.282, -0.066, 0.644],
        [side * 0.27, 0.039, 0.645],
        [side * 0.241, 0.122, 0.607],
      ],
      0.041,
      32,
      12,
      true,
    );
    for (let i = 0; i < 6; i++)
      tube(
        head,
        tips,
        [
          [side * 0.158, -0.18 + i * 0.014, 0.57],
          [side * (0.205 + i * 0.004), -0.168 + i * 0.009, 0.588],
          [side * (0.242 + i * 0.004), -0.156 + i * 0.009, 0.595],
        ],
        0.0013,
        8,
        3,
        true,
      );
  }
  const limbAt = (rows, y) => {
    let row = 0;
    while (row < rows.length - 2 && y < rows[row + 1][0]) row++;
    const t = THREE.MathUtils.clamp(
      (rows[row][0] - y) / (rows[row][0] - rows[row + 1][0]),
      0,
      1,
    );
    return rows[row].map((_, column) => {
      if (column === 0) return y;
      const p0 = rows[Math.max(0, row - 1)][column],
        p1 = rows[row][column],
        p2 = rows[row + 1][column],
        p3 = rows[Math.min(rows.length - 1, row + 2)][column];
      return (
        0.5 *
        (2 * p1 +
          (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
      );
    });
  };
  // A closed tube down a leg segment through elliptical rows, top to bottom.
  const limb = (parent, material, rows, sides, steps = 3) => {
    const heights = [];
    for (let row = 0; row < rows.length - 1; row++)
      for (let step = 0; step < steps; step++)
        heights.push(
          rows[row][0] + ((rows[row + 1][0] - rows[row][0]) * step) / steps,
        );
    heights.push(rows.at(-1)[0]);
    const positions = [],
      uv = [],
      indices = [],
      span = rows[0][0] - rows.at(-1)[0];
    for (const y of heights) {
      const [, cz, rx, rz] = limbAt(rows, y);
      for (let side = 0; side <= sides; side++) {
        const angle = (side / sides) * Math.PI * 2;
        positions.push(Math.cos(angle) * rx, y, cz + Math.sin(angle) * rz);
        uv.push(side / sides, (rows[0][0] - y) / span);
      }
    }
    const ring = sides + 1;
    for (let row = 0; row < heights.length - 1; row++)
      for (let side = 0; side < sides; side++) {
        const a = row * ring + side,
          b = a + ring;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    for (const [row, top] of [
      [0, true],
      [heights.length - 1, false],
    ]) {
      const [y, cz] = limbAt(rows, heights[row]);
      const center = positions.length / 3;
      positions.push(0, y, cz);
      uv.push(0.5, top ? 0 : 1);
      for (let side = 0; side < sides; side++) {
        const a = row * ring + side;
        indices.push(...(top ? [center, a + 1, a] : [center, a, a + 1]));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const normals = geometry.attributes.normal;
    for (let row = 0; row < heights.length; row++) {
      const first = row * ring,
        last = first + sides;
      const normal = V()
        .fromBufferAttribute(normals, first)
        .add(V().fromBufferAttribute(normals, last))
        .normalize();
      normals.setXYZ(first, normal.x, normal.y, normal.z);
      normals.setXYZ(last, normal.x, normal.y, normal.z);
    }
    part(parent, material, geometry);
  };
  // The gait plants the sole at this height and splits the hoof mesh at y = -0.29.
  const SOLE = -0.40325;
  // One digit of a cloven hoof, heel to tip along +Z, flat sole, D-shaped section.
  const toe = (parent, half) => {
    const sections = 11,
      around = 12,
      positions = [],
      uv = [],
      indices = [];
    for (let i = 0; i <= sections; i++) {
      const t = i / sections,
        z = -0.01 + t * 0.116;
      const bottom =
        SOLE +
        (t < 0.16 ? 0.012 * (1 - t / 0.16) ** 2 : 0) +
        (t > 0.86 ? 0.014 * ((t - 0.86) / 0.14) ** 2 : 0);
      const top = -0.316 - 0.066 * t ** 1.5;
      const height = Math.max(0.009, top - bottom),
        width = Math.max(
          0.006,
          0.0225 * (1 - t ** 2.4) * (0.86 + 0.24 * Math.sin(Math.PI * t)),
        ),
        x = half * (0.0205 + 0.007 * t);
      for (let k = 0; k <= around; k++) {
        const angle = (k / around) * Math.PI * 2,
          c = Math.cos(angle),
          s = Math.sin(angle);
        const inner = c * half < 0;
        positions.push(
          x + width * Math.sign(c) * Math.abs(c) ** (inner ? 0.45 : 0.85),
          bottom +
            height * 0.5 +
            height * 0.5 * Math.sign(s) * Math.abs(s) ** (s < 0 ? 0.35 : 0.9),
          z,
        );
        uv.push(k / around, t);
      }
    }
    const ring = around + 1;
    for (let i = 0; i < sections; i++)
      for (let k = 0; k < around; k++) {
        const a = i * ring + k,
          b = a + ring;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    for (const [i, heel] of [
      [0, true],
      [sections, false],
    ]) {
      let cx = 0,
        cy = 0;
      for (let k = 0; k < around; k++) {
        cx += positions[(i * ring + k) * 3];
        cy += positions[(i * ring + k) * 3 + 1];
      }
      const center = positions.length / 3;
      positions.push(cx / around, cy / around, positions[i * ring * 3 + 2]);
      uv.push(0.5, heel ? 0 : 1);
      for (let k = 0; k < around; k++) {
        const a = i * ring + k;
        indices.push(...(heel ? [center, a + 1, a] : [center, a, a + 1]));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    part(parent, hoof, geometry);
  };
  // Small dewclaws tucked behind the pastern, above the gait's hoof split.
  const dewclaw = (parent, half) => {
    const direction = V(half * 0.2, -0.92, -0.33).normalize(),
      base = V(half * 0.023, -0.256, -0.023);
    const geometry = new THREE.ConeGeometry(0.0105, 0.022, 7, 1);
    geometry.translate(0, 0.011, 0);
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        base,
        new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), direction),
        V(1, 1, 1),
      ),
    );
    part(parent, hoof, geometry);
  };
  for (const [name, side, z, hind] of [
    ["frontLeft", 1, 0.3, false],
    ["frontRight", -1, 0.3, false],
    ["backLeft", 1, -0.56, true],
    ["backRight", -1, -0.56, true],
  ]) {
    const upper = joint(body, name, [side * 0.255, 0.72, z]);
    const lower = joint(upper, name + "Lower", [
      0,
      -0.29,
      hind ? 0.065 : -0.035,
    ]);
    // [height, centre z, half width, half depth] down each segment
    const upperRows = hind
      ? [
          [0.08, 0, 0.04, 0.055],
          [0.05, 0.008, 0.098, 0.125],
          [-0.03, 0.018, 0.112, 0.14],
          [-0.12, 0.034, 0.094, 0.112],
          [-0.2, 0.05, 0.072, 0.08],
          [-0.265, 0.062, 0.06, 0.064],
          [-0.315, 0.065, 0.042, 0.046],
        ]
      : [
          [0.11, 0, 0.045, 0.06],
          [0.05, 0, 0.08, 0.1],
          [-0.04, -0.004, 0.094, 0.11],
          [-0.13, -0.012, 0.082, 0.094],
          [-0.21, -0.022, 0.066, 0.074],
          [-0.27, -0.03, 0.058, 0.062],
          [-0.315, -0.035, 0.042, 0.046],
        ];
    limb(upper, fur, upperRows, 20);
    ellipsoid(
      lower,
      shank,
      [0, -0.006, 0.002],
      [0.054, 0.058, hind ? 0.064 : 0.06],
      18,
      10,
    );
    limb(
      lower,
      shank,
      [
        [0.045, 0, 0.04, 0.044],
        [0.01, hind ? -0.006 : 0, 0.057, hind ? 0.067 : 0.063],
        [-0.05, 0.004, 0.051, 0.056],
        [-0.13, 0.008, 0.043, 0.048],
        [-0.2, 0.012, 0.04, 0.045],
        [-0.255, 0.016, 0.042, 0.048],
        [-0.3, 0.024, 0.034, 0.039],
        [-0.342, 0.03, 0.025, 0.028],
      ],
      16,
    );
    for (const half of [-1, 1]) {
      toe(lower, half);
      dewclaw(lower, half);
    }
    for (let row = 0; row < 6; row++)
      for (let column = 0; column < 7; column++) {
        const hash = (offset) => {
          const value =
            Math.sin(row * 91.7 + column * 47.3 + side * 13.1 + offset * 7.9) *
            43758.5453;
          return value - Math.floor(value);
        };
        const y = -0.02 - (row + hash(1) * 0.8) * 0.04;
        const [, cz, rx, rz] = limbAt(upperRows, y);
        const angle = (column / 6 - 0.5) * 3.6 + (hash(2) - 0.5) * 0.4;
        const outward = side > 0 ? angle : Math.PI - angle;
        const normal = V(
          Math.cos(outward) / rx,
          0,
          Math.sin(outward) / rz,
        ).normalize();
        hair(
          upper,
          V(Math.cos(outward) * rx, y, cz + Math.sin(outward) * rz),
          normal,
          0.03 + hash(3) * 0.016,
          0.003 + hash(4) * 0.0025,
          fur,
          0,
          V((hash(6) - 0.5) * 0.3, -1, 0.12),
        );
      }
  }
  const tail = joint(body, "tail", [0, 0.78, -0.77]);
  tube(
    tail,
    fur,
    [
      [0, 0, 0],
      [0, -0.028, -0.1],
      [0.047, -0.063, -0.177],
      [0.081, -0.055, -0.15],
    ],
    0.015,
    24,
    8,
    true,
  );
  for (let i = 0; i < 7; i++)
    hair(
      tail,
      V(0.071 + i * 0.002, -0.057, -0.157),
      V(1, 0.1, 0),
      0.045,
      0.003,
      mane,
    );
  for (const [parent, materials] of buckets)
    for (const [material, chunks] of materials) {
      const positions = [],
        normals = [],
        uv = [];
      for (const geometry of chunks) {
        positions.push(...geometry.attributes.position.array);
        normals.push(...geometry.attributes.normal.array);
        uv.push(...geometry.attributes.uv.array);
        geometry.dispose();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(normals, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = parent.name + "-" + material.name;
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
    }
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3(),
    point = V();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const positions = node.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      bounds.expandByPoint(
        point.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld),
      );
  });
  const center = bounds.getCenter(V()),
    scale = 1.15 / (bounds.max.y - bounds.min.y);
  for (const child of root.children) {
    child.position
      .sub(V(center.x, bounds.min.y, center.z))
      .multiplyScalar(scale);
    child.scale.multiplyScalar(scale);
  }
  root.userData.joints = joints;
  root.userData.parts = { body, head, tail };
  root.userData.nativeHeight = 1.15;
  root.userData.animal = "wild-boar";
  return root;
}
