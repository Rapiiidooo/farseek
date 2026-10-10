// frost_lynx: the pale lynx of the frozen reach, candidate B of verification-combat-growth, with
// nineteen joints pivoting where the animal bends and the coat split by surface region.
export default function generate(THREE) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const root = new THREE.Group();
  const paint = (color, name, roughness = 0.9) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness });
    material.name = name;
    return material;
  };
  const coat = paint(0xadb3b8, "lynx-coat");
  const pale = paint(0xe1e6e9, "lynx-coat");
  const dusk = paint(0x737c86, "lynx-coat");
  const ink = paint(0x292d32, "lynx-coat");
  const inner = paint(0x9b9397, "lynx-skin", 0.78);
  const nose = paint(0x4a3f45, "nose", 0.5);
  const mouth = paint(0x2a1f22, "mouth", 0.7);
  const teeth = paint(0xe6e0d2, "teeth", 0.4);
  const eye = paint(0x0b0d0e, "eye", 0.12);
  const iris = paint(0xb0c497, "iris", 0.3);

  const joints = {};
  const buckets = new Map();
  const joint = (parent, name, at, rotation = [0, 0, 0]) => {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(...at);
    node.rotation.set(...rotation);
    parent.add(node);
    joints[name] = node;
    return node;
  };
  const add = (parent, material, geometry) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!buckets.has(parent)) buckets.set(parent, new Map());
    const byMaterial = buckets.get(parent);
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(flat);
  };
  const placed = (geometry, at, rotation = [0, 0, 0], scale = [1, 1, 1]) =>
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        V(...at),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        V(...scale),
      ),
    );
  const ellipsoid = (parent, material, at, scale, rotation, w = 18, h = 12) =>
    add(
      parent,
      material,
      placed(new THREE.SphereGeometry(1, w, h), at, rotation, scale),
    );
  // A cone from `base` whose tip points along `dir`.
  const spike = (parent, material, base, dir, length, radius, sides = 6) => {
    const geometry = new THREE.ConeGeometry(radius, length, sides, 1);
    geometry.translate(0, length / 2, 0);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        V(0, 1, 0),
        V(...dir).normalize(),
      ),
    );
    geometry.translate(...base);
    add(parent, material, geometry);
  };
  // A flattened patch lying on a surface point, its thin axis along the normal.
  const patch = (parent, material, point, normal, size) => {
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    geometry.scale(size[0], size[1], 0.006);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        V(0, 0, 1),
        normal.clone().normalize(),
      ),
    );
    const at = point
      .clone()
      .addScaledVector(normal.clone().normalize(), -0.002);
    geometry.translate(at.x, at.y, at.z);
    add(parent, material, geometry);
  };

  // A tube through rings { c, rx, ry }; `choose(row, angle)` names each face's material. Angle 0
  // faces the ring's side axis, a quarter turn its lift axis.
  const sweep = (parent, rings, sides, choose) => {
    const n = rings.length;
    const centres = rings.map((ring) => V(...ring.c));
    const frames = [];
    const positions = [];
    const uvs = [];
    for (let i = 0; i < n; i++) {
      const t = centres[Math.min(n - 1, i + 1)]
        .clone()
        .sub(centres[Math.max(0, i - 1)])
        .normalize();
      const up = Math.abs(t.y) < 0.8 ? V(0, 1, 0) : V(0, 0, 1);
      const side = t.clone().cross(up).normalize();
      const lift = side.clone().cross(t).normalize();
      frames.push({ t, side, lift });
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const p = centres[i]
          .clone()
          .addScaledVector(side, Math.cos(a) * rings[i].rx)
          .addScaledVector(lift, Math.sin(a) * rings[i].ry);
        positions.push(p.x, p.y, p.z);
        uvs.push(s / sides, i / (n - 1));
      }
    }
    const row = sides + 1;
    const faces = [];
    for (let i = 0; i < n - 1; i++)
      for (let s = 0; s < sides; s++) {
        const a = i * row + s,
          b = a + 1,
          c = a + row,
          d = c + 1;
        const material = choose(i + 0.5, ((s + 0.5) / sides) * Math.PI * 2);
        faces.push([a, d, b, material], [a, c, d, material]);
      }
    for (const [end, ring] of [
      [0, 0],
      [1, n - 1],
    ]) {
      const centre = positions.length / 3;
      const tip = centres[ring]
        .clone()
        .addScaledVector(
          frames[ring].t,
          (end ? 1 : -1) * 0.35 * Math.min(rings[ring].rx, rings[ring].ry),
        );
      positions.push(tip.x, tip.y, tip.z);
      uvs.push(0.5, end);
      const material = choose(ring, Math.PI / 2);
      for (let s = 0; s < sides; s++) {
        const a = ring * row + s;
        faces.push(
          end ? [centre, a + 1, a, material] : [centre, a, a + 1, material],
        );
      }
    }
    const whole = new THREE.BufferGeometry();
    whole.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    whole.setIndex(faces.flatMap(([a, b, c]) => [a, b, c]));
    whole.computeVertexNormals();
    const normal = whole.attributes.normal;
    for (let i = 0; i < n; i++) {
      const a = i * row,
        b = a + sides;
      const x = normal.getX(a) + normal.getX(b),
        y = normal.getY(a) + normal.getY(b),
        z = normal.getZ(a) + normal.getZ(b);
      const length = Math.hypot(x, y, z) || 1;
      normal.setXYZ(a, x / length, y / length, z / length);
      normal.setXYZ(b, x / length, y / length, z / length);
    }
    const byMaterial = new Map();
    for (const [a, b, c, material] of faces) {
      if (!byMaterial.has(material)) byMaterial.set(material, []);
      byMaterial.get(material).push(a, b, c);
    }
    for (const [material, list] of byMaterial) {
      const p = [],
        q = [],
        u = [];
      for (const index of list) {
        p.push(
          ...whole.attributes.position.array.slice(index * 3, index * 3 + 3),
        );
        q.push(normal.getX(index), normal.getY(index), normal.getZ(index));
        u.push(uvs[index * 2], uvs[index * 2 + 1]);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(q, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
      add(parent, material, geometry);
    }
    // Where a point at fraction `f` along the tube and angle `a` lies, with its outward normal.
    return (f, a) => {
      const k = Math.min(n - 1.001, Math.max(0, f * (n - 1)));
      const i = Math.floor(k),
        w = k - i;
      const centre = centres[i].clone().lerp(centres[i + 1], w);
      const { side, lift } = frames[i];
      const rx = rings[i].rx + (rings[i + 1].rx - rings[i].rx) * w,
        ry = rings[i].ry + (rings[i + 1].ry - rings[i].ry) * w;
      return {
        point: centre
          .clone()
          .addScaledVector(side, Math.cos(a) * rx)
          .addScaledVector(lift, Math.sin(a) * ry),
        normal: side
          .clone()
          .multiplyScalar(Math.cos(a) * ry)
          .addScaledVector(lift, Math.sin(a) * rx)
          .normalize(),
      };
    };
  };
  const near = (angle, target, width) =>
    Math.abs(Math.atan2(Math.sin(angle - target), Math.cos(angle - target))) <
    width;
  const TOP = Math.PI / 2,
    BOTTOM = -Math.PI / 2;
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // The torso, from the rump to the base of the neck: [z, centre y, half width, half height].
  // Compact and deep in the chest, the haunches carried a little higher than the withers.
  const body = joint(root, "body", [0, 0.6, 0]);
  const profile = [
    [-0.445, 0.1, 0.02, 0.025],
    [-0.415, 0.105, 0.085, 0.095],
    [-0.36, 0.11, 0.135, 0.145],
    [-0.27, 0.095, 0.15, 0.158],
    [-0.16, 0.06, 0.137, 0.148],
    [-0.05, 0.04, 0.14, 0.158],
    [0.06, 0.035, 0.155, 0.178],
    [0.16, 0.04, 0.158, 0.186],
    [0.25, 0.06, 0.14, 0.168],
    [0.32, 0.09, 0.105, 0.125],
    [0.365, 0.12, 0.055, 0.065],
    [0.385, 0.14, 0.015, 0.02],
  ];
  const sectionAt = (z) => {
    let i = 0;
    while (i < profile.length - 2 && z > profile[i + 1][0]) i++;
    const t = Math.min(
      1,
      Math.max(0, (z - profile[i][0]) / (profile[i + 1][0] - profile[i][0])),
    );
    return [1, 2, 3].map((column) => {
      const p0 = profile[Math.max(0, i - 1)][column],
        p1 = profile[i][column],
        p2 = profile[i + 1][column],
        p3 = profile[Math.min(profile.length - 1, i + 2)][column];
      return (
        0.5 *
        (2 * p1 +
          (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
      );
    });
  };
  const torsoRings = [];
  for (let i = 0; i <= 24; i++) {
    const z = -0.445 + (i / 24) * 0.83;
    const [cy, rx, ry] = sectionAt(z);
    torsoRings.push({
      c: [0, cy, z],
      rx: Math.max(0.01, rx),
      ry: Math.max(0.01, ry),
    });
  }
  const torso = sweep(body, torsoRings, 30, (row, angle) => {
    const z = torsoRings[Math.min(24, Math.round(row))].c[2];
    if (near(angle, TOP, 0.38)) return dusk;
    if (near(angle, BOTTOM, z > -0.3 ? 1.0 : 0.6)) return pale;
    return coat;
  });
  // Faint spots on the haunches and the lower flanks.
  for (let k = 0; k < 18; k++) {
    const f = 0.1 + random() * 0.55;
    const a = -0.55 + random() * 1.1;
    for (const angle of [a, Math.PI - a]) {
      const { point, normal } = torso(f, angle);
      patch(body, dusk, point, normal, [
        0.009 + random() * 0.008,
        0.007 + random() * 0.006,
      ]);
    }
  }

  for (const side of [-1, 1]) {
    ellipsoid(
      body,
      coat,
      [side * 0.082, 0.0, 0.2],
      [0.066, 0.115, 0.09],
      [0.15, 0, 0],
      28,
      20,
    );
    ellipsoid(
      body,
      coat,
      [side * 0.078, 0.06, -0.3],
      [0.08, 0.12, 0.125],
      [-0.2, 0, 0],
      28,
      20,
    );
  }
  // A short thick neck, and a broad head on it.
  const neck = joint(body, "neck", [0, 0.1, 0.29]);
  sweep(
    neck,
    [
      { c: [0, -0.05, -0.06], rx: 0.105, ry: 0.125 },
      { c: [0, 0.0, 0.02], rx: 0.1, ry: 0.112 },
      { c: [0, 0.06, 0.08], rx: 0.09, ry: 0.098 },
      { c: [0, 0.1, 0.12], rx: 0.07, ry: 0.075 },
      { c: [0, 0.115, 0.14], rx: 0.03, ry: 0.034 },
    ],
    20,
    (row, angle) =>
      near(angle, BOTTOM, 1.2) ? pale : near(angle, TOP, 0.35) ? dusk : coat,
  );
  for (const x of [-0.06, 0, 0.06])
    spike(neck, pale, [x, -0.07, 0.05], [x * 2, -1, 0.35], 0.075, 0.026);
  const head = joint(neck, "head", [0, 0.11, 0.13]);
  ellipsoid(
    head,
    coat,
    [0, 0.022, -0.008],
    [0.104, 0.094, 0.11],
    [0, 0, 0],
    22,
    16,
  );
  ellipsoid(head, coat, [0, 0.014, 0.108], [0.032, 0.028, 0.055]);
  ellipsoid(
    head,
    pale,
    [0, -0.024, 0.104],
    [0.055, 0.046, 0.06],
    [0, 0, 0],
    18,
    12,
  );
  for (const side of [-1, 1]) {
    ellipsoid(head, pale, [side * 0.056, -0.014, 0.036], [0.062, 0.056, 0.066]);
    ellipsoid(
      head,
      pale,
      [side * 0.024, -0.033, 0.14],
      [0.026, 0.022, 0.024],
      [0, 0, 0],
      12,
      8,
    );
    ellipsoid(
      head,
      dusk,
      [side * 0.04, 0.068, 0.066],
      [0.028, 0.012, 0.032],
      [0, 0, side * 0.3],
      10,
      6,
    );
    // The eye: a dark ball, a pale iris and a slit pupil.
    ellipsoid(
      head,
      eye,
      [side * 0.046, 0.035, 0.091],
      [0.02, 0.02, 0.02],
      [0, 0, 0],
      12,
      8,
    );
    const look = V(side * 0.42, 0.05, 1).normalize();
    patch(head, iris, V(side * 0.0532, 0.0365, 0.1078), look, [0.0152, 0.0152]);
    patch(head, eye, V(side * 0.0546, 0.0368, 0.1095), look, [0.004, 0.0125]);
    // Whiskers.
    for (const lift of [-0.006, 0.002, 0.01])
      spike(
        head,
        pale,
        [side * 0.037, -0.033 + lift, 0.142],
        [side, lift * 4, 0.35],
        0.09,
        0.0016,
        3,
      );
    // The cheek ruff, barred with two dark locks.
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      spike(
        head,
        k === 2 || k === 5 ? ink : pale,
        [side * (0.082 + 0.014 * u), -0.018 - 0.045 * u, 0.05 - 0.07 * u],
        [side * (0.45 + 0.2 * u), -0.85, -0.3 - 0.3 * u],
        0.1 + 0.03 * (1 - Math.abs(u - 0.5) * 2),
        0.027,
      );
    }
    // Tall ears, dark behind with a pale spot, a black tuft at the tip.
    const ear = joint(
      head,
      side > 0 ? "leftEar" : "rightEar",
      [side * 0.064, 0.076, -0.022],
      [-0.12, 0, -side * 0.26],
    );
    add(
      ear,
      dusk,
      placed(
        new THREE.ConeGeometry(0.05, 0.135, 14, 1),
        [0, 0.0675, 0],
        [0, 0, 0],
        [1, 1, 0.42],
      ),
    );
    add(
      ear,
      ink,
      placed(
        new THREE.ConeGeometry(0.0225, 0.062, 14, 1),
        [0, 0.106, -0.0015],
        [0, 0, 0],
        [1, 1, 0.5],
      ),
    );
    add(
      ear,
      inner,
      placed(
        new THREE.ConeGeometry(0.04, 0.11, 14, 1),
        [0, 0.056, 0.012],
        [0, 0, 0],
        [1, 1, 0.3],
      ),
    );
    patch(ear, pale, V(0, 0.05, -0.0198), V(0, 0, -1), [0.016, 0.022]);
    spike(ear, ink, [0, 0.125, 0], [0, 1, 0.08], 0.085, 0.009, 5);
  }
  ellipsoid(
    head,
    nose,
    [0, 0.003, 0.16],
    [0.021, 0.014, 0.012],
    [0, 0, 0],
    12,
    8,
  );
  ellipsoid(
    head,
    mouth,
    [0, -0.05, 0.096],
    [0.033, 0.013, 0.05],
    [0, 0, 0],
    12,
    8,
  );
  for (const side of [-1, 1])
    spike(
      head,
      teeth,
      [side * 0.018, -0.044, 0.136],
      [0, -1, 0.1],
      0.024,
      0.0045,
      5,
    );
  const jaw = joint(head, "jaw", [0, -0.05, 0.04]);
  ellipsoid(
    jaw,
    pale,
    [0, -0.01, 0.055],
    [0.04, 0.022, 0.06],
    [0, 0, 0],
    14,
    10,
  );
  spike(jaw, pale, [0, -0.024, 0.05], [0, -1, -0.4], 0.045, 0.018);

  // Legs: a thick forearm over a short pastern in front, a heavy thigh over a bent shin and hock
  // behind; wide snowshoe paws.
  const leg = (name, side, at, upper, lower, paw, hind) => {
    const top = joint(body, name, at);
    const thick = (ring) => ({
      ...ring,
      rx: ring.rx * 1.12,
      ry: ring.ry * 1.1,
    });
    sweep(top, upper.rings.map(thick), 16, (row, angle) =>
      near(angle, side > 0 ? 0 : Math.PI, 1.1) ? pale : coat,
    );
    const knee = joint(top, name + "Lower", upper.end);
    sweep(knee, lower.rings.map(thick), 14, () => coat);
    const foot = joint(knee, name + "Paw", lower.end);
    ellipsoid(foot, coat, [0, -0.021, paw[2] * 0.38], paw, [0, 0, 0], 16, 10);
    for (const [x, z] of [
      [-0.032, 0.066],
      [-0.012, 0.08],
      [0.012, 0.08],
      [0.032, 0.066],
    ])
      ellipsoid(
        foot,
        coat,
        [x * (paw[0] / 0.055), -0.031, z * (paw[2] / 0.072)],
        [0.019, 0.015, 0.02],
        [0, 0, 0],
        8,
        6,
      );
    if (hind) {
      ellipsoid(
        knee,
        coat,
        [0, -0.15, -0.106],
        [0.028, 0.036, 0.03],
        [0, 0, 0],
        10,
        8,
      );
      for (const y of [0.06, -0.02, -0.1])
        spike(top, coat, [0, y, -0.07 + y * 0.2], [0, -0.6, -1], 0.06, 0.03);
    } else spike(top, coat, [0, -0.13, -0.035], [0, -0.7, -1], 0.05, 0.022);
  };
  for (const side of [1, -1]) {
    leg(
      side > 0 ? "frontLeft" : "frontRight",
      side,
      [side * 0.095, -0.04, 0.2],
      {
        rings: [
          { c: [0, 0.1, 0.012], rx: 0.055, ry: 0.078 },
          { c: [0, 0.0, 0.0], rx: 0.062, ry: 0.082 },
          { c: [0, -0.1, -0.012], rx: 0.052, ry: 0.062 },
          { c: [0, -0.19, -0.02], rx: 0.043, ry: 0.048 },
          { c: [0, -0.27, -0.022], rx: 0.038, ry: 0.042 },
        ],
        end: [0, -0.27, -0.022],
      },
      {
        rings: [
          { c: [0, 0.03, -0.003], rx: 0.038, ry: 0.042 },
          { c: [0, -0.08, 0.006], rx: 0.034, ry: 0.036 },
          { c: [0, -0.16, 0.014], rx: 0.033, ry: 0.035 },
          { c: [0, -0.205, 0.019], rx: 0.039, ry: 0.042 },
          { c: [0, -0.232, 0.024], rx: 0.046, ry: 0.05 },
        ],
        end: [0, -0.235, 0.022],
      },
      [0.058, 0.035, 0.076],
      false,
    );
    leg(
      side > 0 ? "backLeft" : "backRight",
      side,
      [side * 0.09, 0.03, -0.3],
      {
        rings: [
          { c: [0, 0.1, -0.03], rx: 0.07, ry: 0.095 },
          { c: [0, 0.0, 0.0], rx: 0.08, ry: 0.115 },
          { c: [0, -0.11, 0.035], rx: 0.07, ry: 0.092 },
          { c: [0, -0.21, 0.068], rx: 0.052, ry: 0.062 },
          { c: [0, -0.29, 0.088], rx: 0.041, ry: 0.045 },
        ],
        end: [0, -0.29, 0.088],
      },
      {
        rings: [
          { c: [0, 0.03, 0.006], rx: 0.042, ry: 0.046 },
          { c: [0, -0.07, -0.048], rx: 0.036, ry: 0.041 },
          { c: [0, -0.15, -0.094], rx: 0.031, ry: 0.036 },
          { c: [0, -0.22, -0.103], rx: 0.03, ry: 0.033 },
          { c: [0, -0.258, -0.104], rx: 0.038, ry: 0.042 },
          { c: [0, -0.282, -0.1], rx: 0.044, ry: 0.048 },
        ],
        end: [0, -0.285, -0.1],
      },
      [0.054, 0.035, 0.07],
      true,
    );
  }

  // A short blunt tail with a black tip.
  const tail = joint(body, "tail", [0, 0.11, -0.415], [-0.55, 0, 0]);
  sweep(
    tail,
    [
      { c: [0, 0.0, 0.04], rx: 0.05, ry: 0.058 },
      { c: [0, -0.025, -0.03], rx: 0.048, ry: 0.052 },
      { c: [0, -0.055, -0.085], rx: 0.041, ry: 0.043 },
      { c: [0, -0.08, -0.13], rx: 0.037, ry: 0.038 },
      { c: [0, -0.095, -0.155], rx: 0.016, ry: 0.016 },
    ],
    14,
    (row, angle) => (row > 2.5 ? ink : near(angle, BOTTOM, 0.9) ? pale : coat),
  );

  for (const [parent, byMaterial] of buckets)
    for (const [material, parts] of byMaterial) {
      const merged = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"]) {
        const size = name === "uv" ? 2 : 3;
        const total = parts.reduce(
          (sum, part) => sum + part.attributes.position.count,
          0,
        );
        const array = new Float32Array(total * size);
        let offset = 0;
        for (const part of parts) {
          const attribute = part.attributes[name];
          if (attribute) array.set(attribute.array, offset);
          offset += part.attributes.position.count * size;
        }
        merged.setAttribute(name, new THREE.BufferAttribute(array, size));
      }
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${parent.name}-${material.name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
    }

  const box = new THREE.Box3(),
    v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const p = node.isMesh && node.geometry.attributes.position;
    if (!p) return;
    for (let i = 0; i < p.count; i++)
      box.expandByPoint(
        v.fromBufferAttribute(p, i).applyMatrix4(node.matrixWorld),
      );
  });
  const centre = box.getCenter(new THREE.Vector3());
  for (const child of root.children) {
    child.position.x -= centre.x;
    child.position.y -= box.min.y;
    child.position.z -= centre.z;
  }
  root.userData.joints = joints;
  root.userData.parts = { body, neck, head, jaw, tail };
  root.userData.nativeHeight = box.max.y - box.min.y;
  root.userData.animal = "frost-lynx";
  return root;
}
