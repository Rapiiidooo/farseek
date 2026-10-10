// castle-growth.js wraps this round each tower with z off the wall, and reads every 36 foliage
// vertices as one leaf, so each leaf stays a 12-triangle fan.
export default function (THREE) {
  const root = new THREE.Group();
  const materials = [
    new THREE.MeshStandardMaterial({
      color: 0x597447,
      roughness: 0.88,
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    new THREE.MeshStandardMaterial({ color: 0x65533a, roughness: 0.98 }),
  ];
  materials[0].name = "foliage";
  materials[1].name = "bark";
  const leaves = { p: [], uv: [], c: [] },
    stems = [];
  let seed = 719;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const RING = [
    [0, -1],
    [-0.32, -0.62],
    [-0.82, -0.18],
    [-0.9, 0.25],
    [-0.64, 0.58],
    [-0.25, 0.55],
    [0, 0.22],
    [0.25, 0.55],
    [0.64, 0.58],
    [0.9, 0.25],
    [0.82, -0.18],
    [0.32, -0.62],
  ];
  const turn = new THREE.Matrix4(),
    tilt = new THREE.Matrix4();
  // a leaf hanging from `p` on a short stalk, tipped a little off the wall so neighbours catch the
  // light differently; young leaves are smaller and paler
  const leaf = (p, size, angle, young = 0) => {
    const center = new THREE.Vector3(0, -0.03 * size, 0.06 * size);
    const points = RING.map(
      ([x, y]) =>
        new THREE.Vector3(
          x * size,
          y * size * 1.15,
          Math.sin(x * 3 + y * 2) * size * 0.05 - y * size * 0.12,
        ),
    );
    tilt.makeRotationX((rand() - 0.5) * 0.5);
    const transform = new THREE.Matrix4()
      .makeRotationZ(angle)
      .multiply(tilt.multiply(turn.makeRotationY((rand() - 0.5) * 0.6)))
      .setPosition(p);
    const tint = (0.72 + rand() * 0.34) * (1 + 0.22 * young);
    const hue = 0.98 + rand() * 0.05 + 0.06 * young;
    for (let i = 0; i < points.length; i++) {
      const next = (i + 1) % points.length;
      for (const v of [center, points[next], points[i]]) {
        leaves.uv.push((v.x / size + 1) / 2, (v.y / (size * 1.15) + 1) / 2);
        const q = v.clone().applyMatrix4(transform);
        leaves.p.push(q.x, q.y, Math.max(0.02, q.z));
        leaves.c.push(tint, tint * hue, tint * (0.94 - 0.04 * young));
      }
    }
  };
  const vine = (points, radius, segments) => {
    const curve = new THREE.CatmullRomCurve3(points);
    stems.push(
      new THREE.TubeGeometry(curve, segments, radius, 4, false).toNonIndexed(),
    );
    return curve;
  };
  // leaves alternating along a curve from `from` to `to`, shrinking towards the tip
  const dress = (curve, count, size, from, to, side0) => {
    for (let k = 0; k < count; k++) {
      const t = from + ((to - from) * (k + 0.8)) / count,
        p = curve.getPointAt(t),
        side = (k + side0) % 2 ? 1 : -1,
        young = Math.max(0, (t - 0.72) / 0.28);
      p.x += side * size * 0.55;
      p.z += 0.045 + rand() * 0.035;
      leaf(
        p,
        size * (0.75 + rand() * 0.4) * (1 - 0.45 * young),
        side * (0.45 + rand() * 0.35) + (rand() - 0.5) * 0.5,
        young,
      );
    }
  };
  for (let runner = 0; runner < 4; runner++) {
    const height = [6.0, 6.5, 5.6, 6.2][runner],
      drift = (runner - 1.5) * 0.115,
      phase = rand() * 6.3,
      points = [];
    for (let j = 0; j <= 14; j++) {
      const y = (height * j) / 14;
      points.push(
        new THREE.Vector3(
          drift * y +
            Math.sin(y * 1.4 + runner + phase) * 0.12 +
            Math.sin(y * 3.7 + phase) * 0.035,
          y,
          Math.sin(y * 2 + runner) * 0.02,
        ),
      );
    }
    const main = vine(points, 0.018, 16);
    dress(main, 14, 0.13, 0.06, 1, runner);
    for (let j = 1; j <= 7; j++) {
      const at = main.getPointAt(j / 8.4),
        side = j % 2 ? 1 : -1;
      const reach = (0.3 + rand() * 0.72) * (1 - j / 12);
      const end = at
        .clone()
        .add(new THREE.Vector3(side * reach, 0.12 + rand() * 0.38, 0.015));
      const branch = vine(
        [
          at,
          at
            .clone()
            .lerp(end, 0.5)
            .add(new THREE.Vector3(0, 0.06 + rand() * 0.05, 0.01)),
          end,
        ],
        0.009,
        6,
      );
      dress(
        branch,
        7 + Math.floor(rand() * 4),
        0.16 + 0.04 * (1 - j / 7),
        0,
        1,
        j,
      );
    }
  }
  const leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(leaves.p, 3),
  );
  leafGeometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(leaves.uv, 2),
  );
  leafGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(leaves.c, 3),
  );
  leafGeometry.computeVertexNormals();
  const stemGeometry = new THREE.BufferGeometry();
  for (const [name, size] of [
    ["position", 3],
    ["normal", 3],
    ["uv", 2],
  ])
    stemGeometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(
        stems.flatMap((g) => Array.from(g.attributes[name].array)),
        size,
      ),
    );
  root.add(
    new THREE.Mesh(leafGeometry, materials[0]),
    new THREE.Mesh(stemGeometry, materials[1]),
  );
  const box = new THREE.Box3().setFromObject(root),
    center = box.getCenter(new THREE.Vector3());
  for (const mesh of root.children)
    mesh.geometry.translate(-center.x, -box.min.y, -center.z);
  root.userData.growth = {
    height: box.max.y - box.min.y,
    width: box.max.x - box.min.x,
    leaves: leaves.p.length / 108,
  };
  return root;
}
