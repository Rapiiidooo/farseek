// reef_fish: a metre long, nose to +Z, the tail towards -Z for the vertex shader that
// beats it. The game tints every material lighter than HSL 0.5 (`swimmers()` in
// atlantis.js), so only the body is pale and the bands, eyes and fin edge stay dark.
export default function (THREE) {
  const g = new THREE.Group();
  const glow = new THREE.Group();
  g.add(glow);
  g.userData.parts = { glow };
  const fish = new THREE.Group();
  g.add(fish);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const mat = (color, roughness, name, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      ...extra,
    });
    m.name = name;
    return m;
  };
  const SCALES = mat(0xd6e2e8, 0.38, "scales", {
    metalness: 0.15,
    side: THREE.DoubleSide,
  });
  const INK = mat(0x1a2030, 0.55, "bands", { side: THREE.DoubleSide });
  const RING = mat(0x5c6b74, 0.4, "eyeRing");
  const PUPIL = mat(0x0a0d10, 0.25, "pupil", { metalness: 0.1 });
  const put = (geo, m) => {
    const mesh = new THREE.Mesh(geo, m);
    fish.add(mesh);
    return mesh;
  };
  const indexed = (positions, index, uv) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        uv || new Array((positions.length / 3) * 2).fill(0),
        2,
      ),
    );
    if (index) geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  };

  // Body sections [z, half height, half width, centre height], nose to peduncle.
  const ROWS = [
    [0.5, 0.004, 0.003, -0.022],
    [0.47, 0.042, 0.02, -0.016],
    [0.42, 0.094, 0.035, -0.006],
    [0.35, 0.152, 0.048, 0.004],
    [0.27, 0.204, 0.057, 0.011],
    [0.18, 0.238, 0.061, 0.014],
    [0.08, 0.244, 0.06, 0.012],
    [-0.02, 0.228, 0.055, 0.008],
    [-0.1, 0.19, 0.045, 0.005],
    [-0.16, 0.136, 0.034, 0.003],
    [-0.2, 0.088, 0.024, 0.002],
    [-0.235, 0.056, 0.016, 0],
  ];
  const at = (z) => {
    let i = 0;
    while (i < ROWS.length - 2 && z < ROWS[i + 1][0]) i++;
    const u = THREE.MathUtils.clamp(
      (ROWS[i][0] - z) / (ROWS[i][0] - ROWS[i + 1][0]),
      0,
      1,
    );
    return [1, 2, 3].map((c) => {
      const p0 = ROWS[Math.max(0, i - 1)][c],
        p1 = ROWS[i][c],
        p2 = ROWS[i + 1][c],
        p3 = ROWS[Math.min(ROWS.length - 1, i + 2)][c];
      return (
        0.5 *
        (2 * p1 +
          (-p0 + p2) * u +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
          (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
      );
    });
  };
  const SIDES = 12;
  // A point on the skin at z, angle a from the top of the back towards +X.
  const skin = (z, a, grow = 0) => {
    const [h, w, yc] = at(z),
      s = Math.cos(a),
      c = Math.sin(a);
    return V(
      (w + grow) * Math.sign(c) * Math.abs(c) ** 0.85,
      yc + (h + grow) * Math.sign(s) * Math.abs(s) ** 1.12,
      z,
    );
  };
  const loft = (zs, grow, m, cap) => {
    const positions = [],
      uv = [],
      index = [];
    zs.forEach((z, i) => {
      for (let k = 0; k <= SIDES; k++) {
        positions.push(...skin(z, (k / SIDES) * Math.PI * 2, grow).toArray());
        uv.push(k / SIDES, i / (zs.length - 1));
      }
    });
    const ring = SIDES + 1;
    for (let i = 0; i < zs.length - 1; i++)
      for (let k = 0; k < SIDES; k++) {
        const a = i * ring + k,
          b = a + ring;
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    if (cap) {
      for (const [i, z, front] of [
        [0, zs[0] + 0.002, true],
        [zs.length - 1, zs.at(-1), false],
      ]) {
        const [, , yc] = at(z),
          tip = positions.length / 3;
        positions.push(0, yc, z);
        uv.push(0.5, front ? 0 : 1);
        for (let k = 0; k < SIDES; k++) {
          const a = i * ring + k;
          index.push(...(front ? [tip, a + 1, a] : [tip, a, a + 1]));
        }
      }
    }
    const geo = indexed(positions, index, uv);
    const n = geo.attributes.normal;
    for (let i = 0; i < zs.length; i++) {
      const first = i * ring,
        last = first + SIDES;
      const v = V()
        .fromBufferAttribute(n, first)
        .add(V().fromBufferAttribute(n, last))
        .normalize();
      n.setXYZ(first, v.x, v.y, v.z);
      n.setXYZ(last, v.x, v.y, v.z);
    }
    return put(geo, m);
  };
  const bodyZ = Array.from({ length: 19 }, (_, i) => 0.497 - (i / 18) * 0.732);
  loft(bodyZ, 0, SCALES, true);
  for (const [z, half] of [
    [0.26, 0.016],
    [0.07, 0.019],
    [-0.15, 0.015],
  ])
    loft([z + half, z, z - half], 0.0025, INK, false);

  // Fins are flat shapes in the mid-plane, drawn as (z, y).
  const shape = (points) => {
    const s = new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (const p of points.slice(1))
      if (p.length === 2) s.lineTo(...p);
      else if (p.length === 4) s.quadraticCurveTo(...p);
      else s.bezierCurveTo(...p);
    s.closePath();
    return s;
  };
  const fin = (points, m, segments = 4) =>
    put(
      new THREE.ShapeGeometry(shape(points), segments).rotateY(-Math.PI / 2),
      m,
    );
  const top = (z) => at(z)[0] + at(z)[2],
    bottom = (z) => at(z)[2] - at(z)[0];
  fin(
    [
      [0.17, top(0.17) - 0.012],
      [0.11, 0.33, 0.03, 0.43],
      [-0.05, 0.42, -0.12, 0.35, -0.175, top(-0.175) + 0.035],
      [-0.06, top(-0.06) - 0.01, 0.17, top(0.17) - 0.012],
    ],
    SCALES,
  );
  fin(
    [
      [0.03, bottom(0.03) + 0.012],
      [-0.02, -0.29, -0.085, -0.325],
      [-0.14, -0.3, -0.175, bottom(-0.175) - 0.03],
      [-0.08, bottom(-0.08) + 0.01, 0.03, bottom(0.03) + 0.012],
    ],
    SCALES,
  );
  // The dark trailing edge rings the pale fin, so the two never overlap and z-fight.
  const tailPale = [
    [-0.215, 0.032],
    [-0.33, 0.12, -0.45, 0.19],
    [-0.4, 0.09, -0.355, 0.0],
    [-0.4, -0.09, -0.45, -0.19],
    [-0.33, -0.12, -0.215, -0.032],
  ];
  const tailDark = [
    [-0.215, 0.032],
    [-0.35, 0.14, -0.5, 0.21],
    [-0.44, 0.1, -0.39, 0.0],
    [-0.44, -0.1, -0.5, -0.21],
    [-0.35, -0.14, -0.215, -0.032],
  ];
  fin(tailPale, SCALES);
  {
    const outer = shape(tailDark).getPoints(10),
      inner = shape(tailPale).getPoints(10),
      positions = [];
    for (let i = 0; i < outer.length - 1; i++)
      for (const p of [
        outer[i],
        outer[i + 1],
        inner[i + 1],
        outer[i],
        inner[i + 1],
        inner[i],
      ])
        positions.push(0, p.y, p.x);
    put(indexed(positions), INK);
  }
  for (const s of [-1, 1]) {
    const geo = new THREE.ShapeGeometry(
      shape([
        [0, 0.02],
        [-0.05, 0.03, -0.12, -0.005],
        [-0.1, -0.035, -0.05, -0.05],
        [-0.02, -0.035, 0, 0.02],
      ]),
      3,
    ).rotateY(-Math.PI / 2);
    geo.rotateZ(s * 0.25).rotateY(-s * 0.55);
    const base = skin(0.25, s * Math.PI * 0.6, -0.002);
    geo.translate(base.x, base.y, base.z);
    put(geo, SCALES);
  }

  const normalAt = (z, a) =>
    V()
      .crossVectors(
        skin(z, a + 0.01).sub(skin(z, a - 0.01)),
        skin(z + 0.01, a).sub(skin(z - 0.01, a)),
      )
      .normalize();
  for (const s of [-1, 1]) {
    const a = s * Math.PI * 0.36,
      base = skin(0.365, a),
      n = normalAt(0.365, a);
    if (n.x * s < 0) n.negate();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), n);
    const disc = (profile, m, segments) => {
      const geo = new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        segments,
      );
      geo.applyQuaternion(q).translate(base.x, base.y, base.z);
      put(geo, m);
    };
    disc(
      [
        [0.026, -0.004],
        [0.022, 0.002],
        [0.014, 0.0042],
        [0.0001, 0.0045],
      ],
      RING,
      12,
    );
    disc(
      [
        [0.0125, 0.003],
        [0.008, 0.0062],
        [0.0001, 0.0068],
      ],
      PUPIL,
      10,
    );
    const line = [-0.62, -0.4, -0.12, 0.18, 0.42].map((t, i) =>
      skin(
        0.292 + Math.sin(((i + 0.5) / 5) * Math.PI) * 0.026,
        s * (Math.PI / 2 - t),
        0.002,
      ),
    );
    const tube = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(line),
      8,
      0.0035,
      3,
      false,
    );
    put(tube, INK);
  }
  put(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        skin(0.478, Math.PI * 0.62, 0.001),
        V(0, at(0.492)[2] - 0.012, 0.492),
        skin(0.478, -Math.PI * 0.62, 0.001),
      ]),
      6,
      0.004,
      4,
      false,
    ),
    INK,
  );

  fish.updateMatrixWorld(true);
  const parts = new Map();
  for (const mesh of [...fish.children]) {
    const geometry = (
      mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    ).applyMatrix4(mesh.matrix);
    if (!parts.has(mesh.material)) parts.set(mesh.material, []);
    parts.get(mesh.material).push(geometry);
    fish.remove(mesh);
    mesh.geometry.dispose();
  }
  for (const [material, geometries] of parts) {
    const positions = [],
      normals = [],
      uv = [];
    for (const geometry of geometries) {
      positions.push(...geometry.attributes.position.array);
      normals.push(...geometry.attributes.normal.array);
      uv.push(
        ...(geometry.attributes.uv?.array ||
          new Float32Array(geometry.attributes.position.count * 2)),
      );
      geometry.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    put(merged, material);
  }
  fish.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fish);
  const c = box.getCenter(new THREE.Vector3()),
    k = 1 / box.getSize(new THREE.Vector3()).z;
  for (const mesh of fish.children)
    mesh.geometry.translate(-c.x, -box.min.y, -c.z).scale(k, k, k);
  return g;
}
