export default function (THREE, { segments = [144, 112] } = {}) {
  const root = new THREE.Group();
  const hash = (x, z) => {
    const value = Math.sin(x * 127.1 + z * 311.7 + 29.4) * 43758.5453;
    return value - Math.floor(value);
  };
  const noise = (x, z) => {
    const ix = Math.floor(x),
      iz = Math.floor(z),
      fx = x - ix,
      fz = z - iz;
    const a = fx * fx * (3 - 2 * fx),
      b = fz * fz * (3 - 2 * fz);
    return (
      (hash(ix, iz) * (1 - a) + hash(ix + 1, iz) * a) * (1 - b) +
      (hash(ix, iz + 1) * (1 - a) + hash(ix + 1, iz + 1) * a) * b
    );
  };
  const smooth = (a, b, t) => {
    const s = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return s * s * (3 - 2 * s);
  };
  const peaks = [
    [-64, -11, 43, 29, 25],
    [-20, 3, 70, 27, 35],
    [23, -25, 52, 26, 32],
    [57, 8, 61, 29, 25],
  ];
  const height = (x, z) => {
    const px = x + (noise(x * 0.024, z * 0.024) - 0.5) * 22;
    const pz = z + (noise(x * 0.03 + 21, z * 0.025) - 0.5) * 17;
    let broad = 0;
    for (const [index, [cx, cz, h, rx, rz]] of peaks.entries()) {
      const dx = (px - cx) / rx,
        dz = (pz - cz) / rz,
        bearing = Math.atan2(dz, dx);
      // Lobed footprints stretch each peak into an uneven massif, and spurs and gullies
      // radiate from the summit, so no peak stands as a plain cone.
      const d =
        Math.hypot(dx, dz) /
        (1 +
          0.22 * Math.sin(2 * bearing + index * 1.7) +
          0.12 * Math.sin(3 * bearing + index));
      const turn =
        bearing + (noise(x * 0.045 + index * 7, z * 0.045) - 0.5) * 1.6;
      // Whole lobe counts keep the bearing's wrap seamless, and a rounded profile across each
      // spur keeps its crest from aliasing into teeth on the grid.
      const gully = Math.sin(turn * [3, 4, 5, 3][index] + index) ** 2;
      const slope = smooth(0.12, 0.55, d) * (1 - smooth(1.3, 2.1, d));
      broad = Math.max(
        broad,
        h * Math.exp(-Math.pow(d, 1.3)) * (1 - 0.34 * gully * slope),
      );
    }
    let mountain = 0,
      amplitude = 0.29,
      frequency = 0.02;
    for (let i = 0; i < 5; i++) {
      const ridge =
        1 -
        Math.abs(
          noise(px * frequency + i * 9, pz * frequency - i * 13) * 2 - 1,
        );
      mountain += ridge * ridge * amplitude;
      amplitude *= 0.51;
      frequency *= 2.13;
    }
    const terrain = broad * (0.6 + mountain);
    const edge = Math.min(
      1,
      Math.max(0, (100 - Math.abs(x)) / 16),
      Math.max(0, (80 - Math.abs(z)) / 19),
    );
    return Math.max(0, terrain) * edge * edge * (3 - 2 * edge);
  };
  const geometry = new THREE.PlaneGeometry(200, 160, ...segments).rotateX(
    -Math.PI / 2,
  );
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv,
    colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      y = height(x, z);
    p.setY(i, y);
    uv.setXY(i, x / 3.2, -z / 3.2);
    const value = 0.75 + noise(x * 0.07 + 9, z * 0.07) * 0.22;
    colors.set([value * 1.015, value, value * 0.97], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0x9b927f,
    roughness: 0.96,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  material.name = "stone";
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "eroded-mountain-relief";
  root.add(mesh);
  root.userData.landscape = {
    width: 200,
    depth: 160,
    tile: 3.2,
    triangles: segments[0] * segments[1] * 2,
  };
  return root;
}
