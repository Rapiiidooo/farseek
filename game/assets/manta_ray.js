// manta_ray: a metre across, nose to +Z, wings along ±X with the tips at 0.5 m for the
// shader that flaps them by their distance from the middle.
export default function (THREE) {
  const g = new THREE.Group();
  const glow = new THREE.Group();
  g.add(glow);
  g.userData.parts = { glow };
  const ray = new THREE.Group();
  g.add(ray);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const material = (color, roughness, name, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      side: THREE.DoubleSide,
      ...extra,
    });
    m.name = name;
    return m;
  };
  const TOP = material(0x2e4150, 0.62, "skin");
  // Underwater light reaches the belly only from the water below, which the
  // scene does not model; a faint glow keeps the pale underside readable.
  const BELLY = material(0xe6e8e4, 0.7, "skinBelly", {
    emissive: 0x9fb8bd,
    emissiveIntensity: 0.22,
  });
  const EYE = material(0x0b0e12, 0.28, "eye");
  const put = (geo, mat) => {
    const mesh = new THREE.Mesh(geo, mat);
    ray.add(mesh);
    return mesh;
  };
  // Catmull-Rom through evenly spaced samples of t in [0, 1].
  const curve = (values) => (t) => {
    const f = Math.min(Math.max(t, 0), 1) * (values.length - 1),
      i = Math.min(values.length - 2, Math.floor(f)),
      u = f - i,
      p0 = values[Math.max(0, i - 1)],
      p1 = values[i],
      p2 = values[i + 1],
      p3 = values[Math.min(values.length - 1, i + 2)];
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * u +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
        (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
    );
  };
  // Planform against t = |x| / 0.5, sampled every 0.1.
  const leading = curve([
    0.3, 0.297, 0.285, 0.258, 0.21, 0.15, 0.085, 0.02, -0.045, -0.105, -0.16,
  ]);
  const trailing = curve([
    -0.215, -0.212, -0.19, -0.14, -0.09, -0.06, -0.05, -0.06, -0.085, -0.12,
    -0.16,
  ]);
  const thickness = (x, v) => {
    const t = Math.min(1, Math.abs(x) / 0.5);
    const body = Math.exp(-((x / 0.12) ** 2));
    const airfoil = Math.sin(Math.PI * v ** 1.35) ** 0.75;
    return (0.006 + 0.044 * body) * Math.sqrt(1 - t) * airfoil;
  };
  const camber = (x) => 0.016 * (Math.abs(x) / 0.5) ** 2;
  const surfaceY = (x, v, upper) =>
    camber(x) + (upper ? 1 : -0.72) * thickness(x, v);
  const surfaceZ = (x, v) => {
    const t = Math.abs(x) / 0.5;
    return THREE.MathUtils.lerp(trailing(t), leading(t), v);
  };
  const skin = (upper, rows = 44, cols = 16) => {
    const positions = [],
      uv = [],
      index = [];
    for (let i = 0; i <= rows; i++) {
      const s = (i / rows) * 2 - 1,
        x = 0.5 * Math.sign(s) * Math.abs(s) ** 0.92;
      for (let j = 0; j <= cols; j++) {
        const v = j / cols;
        positions.push(x, surfaceY(x, v, upper), surfaceZ(x, v));
        uv.push(i / rows, v);
      }
    }
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j,
          b = a + cols + 1;
        if (upper) index.push(a, a + 1, b, a + 1, b + 1, b);
        else index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  };
  put(skin(true), TOP);
  put(skin(false), BELLY);
  // A tapering sweep with an elliptical section [half width, half height] at t.
  const sweep = (points, section, segments, sides, mat) => {
    const path = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
    const frames = path.computeFrenetFrames(segments, false);
    const positions = [],
      uv = [],
      index = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments,
        c = path.getPointAt(t),
        [w, h] = section(t);
      const side = V(1, 0, 0)
        .addScaledVector(frames.tangents[i], -frames.tangents[i].x)
        .normalize();
      const up = V().crossVectors(frames.tangents[i], side).normalize();
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const p = c
          .clone()
          .addScaledVector(side, Math.cos(a) * w)
          .addScaledVector(up, Math.sin(a) * h);
        positions.push(p.x, p.y, p.z);
        uv.push(k / sides, t);
      }
    }
    for (let i = 0; i < segments; i++)
      for (let k = 0; k < sides; k++) {
        const a = i * (sides + 1) + k,
          b = a + sides + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return put(geo, mat);
  };
  const head = leading(0.17);
  for (const s of [-1, 1]) {
    sweep(
      [
        [s * 0.084, 0.006, head - 0.045],
        [s * 0.094, 0.001, head + 0.018],
        [s * 0.084, -0.008, head + 0.06],
        [s * 0.063, -0.015, head + 0.078],
      ],
      (t) => [0.025 * (1 - 0.5 * t), 0.012 * (1 - 0.45 * t)],
      14,
      8,
      TOP,
    );
    const eye = new THREE.SphereGeometry(0.0115, 10, 6).scale(0.8, 0.9, 1.1);
    eye.translate(s * 0.104, surfaceY(0.104, 0.9, true) - 0.002, head - 0.03);
    put(eye, EYE);
    for (let i = 0; i < 5; i++) {
      const z = 0.17 - i * 0.04,
        points = [0.045, 0.075, 0.105].map((x) => {
          const v =
            (z - trailing(x / 0.5)) / (leading(x / 0.5) - trailing(x / 0.5));
          return [
            s * x,
            surfaceY(x, v, false) - 0.0012,
            z + (x - 0.075) * 0.25,
          ];
        });
      sweep(points, () => [0.0024, 0.0009], 4, 4, EYE);
    }
  }
  sweep(
    [
      [-0.064, -0.006, head - 0.008],
      [0, -0.008, head + 0.006],
      [0.064, -0.006, head - 0.008],
    ],
    () => [0.0045, 0.0028],
    10,
    5,
    EYE,
  );
  const tailStart = trailing(0) + 0.015;
  sweep(
    [
      [0, 0.002, tailStart],
      [0.004, -0.002, tailStart - 0.12],
      [0.011, -0.006, tailStart - 0.26],
      [0.006, -0.005, -0.62],
    ],
    (t) => [0.011 * (1 - 0.93 * t), 0.009 * (1 - 0.93 * t)],
    18,
    6,
    TOP,
  );
  ray.updateMatrixWorld(true);
  for (const mat of [TOP, BELLY, EYE]) {
    const positions = [],
      normals = [],
      uv = [];
    for (const mesh of [...ray.children]) {
      if (mesh.material !== mat) continue;
      const geo = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrix);
      positions.push(...geo.attributes.position.array);
      normals.push(...geo.attributes.normal.array);
      uv.push(...geo.attributes.uv.array);
      geo.dispose();
      mesh.geometry.dispose();
      ray.remove(mesh);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    put(geo, mat);
  }
  const box = new THREE.Box3().setFromObject(ray),
    size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const scale = new THREE.Vector3(
    0.9987502603949663 / size.x,
    0.08799125091514412 / size.y,
    1.008921703696251 / size.z,
  );
  for (const mesh of ray.children) {
    mesh.geometry
      .translate(-c.x, -box.min.y, -c.z)
      .scale(scale.x, scale.y, scale.z);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  return g;
}
