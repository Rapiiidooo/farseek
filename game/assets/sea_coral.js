import { refineNature } from "../nature-detail.js";

// The meander map is laid out from the top of each boulder outward, so it never pinches where a
// sphere's own coordinates gather; the opposite pole sits in the sand.
const meanderMaps = new WeakMap();

function meanders(THREE) {
  if (!meanderMaps.has(THREE)) {
    const size = 256,
      TAU = Math.PI * 2;
    // whole-number frequencies keep every term periodic over one tile
    const field = (u, v, waves) => {
      let n = 0;
      for (const [p, q, a, f] of waves)
        n += a * Math.sin(TAU * (p * u + q * v) + f);
      return n;
    };
    const W1 = [
        [1, 2, 0.6, 0.3],
        [2, -1, 0.5, 1.9],
        [-1, 3, 0.3, 2.6],
        [3, 1, 0.25, 4.1],
      ],
      W2 = [
        [2, 1, 0.6, 1.1],
        [-1, 2, 0.5, 0.4],
        [3, -1, 0.3, 3.3],
        [1, 3, 0.25, 5.0],
      ],
      W3 = [
        [1, 1, 0.7, 0.5],
        [1, -2, 0.5, 2.2],
        [2, 1, 0.35, 4.4],
      ];
    // two sets of warped ridges running different ways, handed over by a third field, read as a maze
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size,
          v = y / size;
        const a = Math.sqrt(
            0.5 + 0.5 * Math.sin(TAU * (7 * u + 1.1 * field(u, v, W1))),
          ),
          b = Math.sqrt(
            0.5 + 0.5 * Math.sin(TAU * (7 * v + 1.1 * field(u, v, W2))),
          );
        let m = Math.min(1, Math.max(0, (field(u, v, W3) + 0.25) / 0.5));
        m = m * m * (3 - 2 * m);
        height[y * size + x] = a * (1 - m) + b * m;
      }
    const at = (x, y) =>
      height[((y + size) % size) * size + ((x + size) % size)];
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const nx = (at(x - 1, y) - at(x + 1, y)) * 2.5,
          ny = (at(x, y - 1) - at(x, y + 1)) * 2.5,
          l = Math.hypot(nx, ny, 1);
        data.set(
          [
            (nx / l) * 127.5 + 127.5,
            (ny / l) * 127.5 + 127.5,
            (1 / l) * 127.5 + 127.5,
            255,
          ],
          (y * size + x) * 4,
        );
      }
    const map = new THREE.DataTexture(data, size, size);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 4;
    map.userData.sharedAssetFinish = true;
    map.needsUpdate = true;
    meanderMaps.set(THREE, map);
  }
  return meanderMaps.get(THREE);
}

export default function (THREE) {
  const root = new THREE.Group();
  root.name = "Brain coral and staghorn";
  const glow = new THREE.Group();
  root.add(glow);
  root.userData.parts = { glow };
  const coral = new THREE.MeshStandardMaterial({
    color: 0xf2e6e0,
    roughness: 0.81,
    normalMap: meanders(THREE),
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
  coral.name = "coral";
  const add = (geometry) => root.add(new THREE.Mesh(geometry, coral));
  // metres of boulder surface per repeat of the meander map, seven ridges across
  const TILE = 0.6;

  for (const [x, y, z, r, sx, sy, sz, seed] of [
    [0, 0.32, 0, 0.45, 1.1, 0.7, 1, 0],
    [0.42, 0.24, 0.18, 0.3, 1, 0.8, 1.1, 2],
    [-0.38, 0.22, -0.2, 0.26, 1.1, 0.75, 1, 4],
  ]) {
    const geometry = new THREE.SphereGeometry(r, 16, 9),
      p = geometry.attributes.position,
      uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i),
        py = p.getY(i),
        pz = p.getZ(i),
        a = Math.atan2(pz, px),
        h = py / r;
      const lobe =
        0.045 * Math.sin(a * 3 + seed * 1.7 + h * 2) +
        0.03 * Math.sin(a * 5 - seed + h * 3.1);
      const scale = 1 + lobe * Math.sqrt(Math.max(0, 1 - h * h));
      const polar = Math.acos(Math.max(-1, Math.min(1, h))),
        reach = (polar * r) / TILE;
      uv.setXY(
        i,
        0.5 + seed * 0.21 + Math.cos(a) * reach,
        0.5 + seed * 0.13 + Math.sin(a) * reach,
      );
      p.setXYZ(
        i,
        px * scale * sx + x,
        Math.max(0, py * scale * sy + y),
        pz * scale * sz + z,
      );
    }
    geometry.computeVertexNormals();
    const n = geometry.attributes.normal,
      sum = new Map();
    const key = (i) =>
      `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    for (let i = 0; i < p.count; i++) {
      const s = sum.get(key(i)) || new THREE.Vector3();
      sum.set(key(i), s.add(new THREE.Vector3().fromBufferAttribute(n, i)));
    }
    for (let i = 0; i < p.count; i++) {
      const s = sum.get(key(i)).clone().normalize();
      n.setXYZ(i, s.x, s.y, s.z);
    }
    add(geometry);
  }

  // a branch as rings swept along a curve, closed by a rounded tip
  const SIDES = 5;
  const branch = (points, radius, rows) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((q) => new THREE.Vector3(...q)),
    );
    const frames = curve.computeFrenetFrames(rows, false),
      pos = [],
      tex = [],
      index = [],
      c = new THREE.Vector3(),
      d = new THREE.Vector3(),
      length = curve.getLength();
    const ring = (centre, n, b, r, v) => {
      for (let j = 0; j < SIDES; j++) {
        const t = (j / SIDES) * Math.PI * 2;
        d.copy(n)
          .multiplyScalar(Math.cos(t))
          .addScaledVector(b, Math.sin(t))
          .multiplyScalar(r)
          .add(centre);
        pos.push(d.x, d.y, d.z);
        tex.push(((j / SIDES) * Math.PI * 2 * radius) / TILE, v);
      }
    };
    for (let i = 0; i <= rows; i++) {
      curve.getPointAt(i / rows, c);
      const taper = 1 - 0.5 * (i / rows) ** 0.8;
      ring(
        c,
        frames.normals[i],
        frames.binormals[i],
        radius * taper,
        ((i / rows) * length) / TILE,
      );
    }
    const end = radius * 0.5,
      tangent = frames.tangents[rows];
    c.addScaledVector(tangent, end * 0.55);
    ring(
      c,
      frames.normals[rows],
      frames.binormals[rows],
      end * 0.72,
      (length + end * 0.55) / TILE,
    );
    c.addScaledVector(tangent, end * 0.45);
    pos.push(c.x, c.y, c.z);
    tex.push(0, (length + end) / TILE);
    const k = SIDES;
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j < SIDES; j++) {
        const a = i * k + j,
          b = i * k + ((j + 1) % k);
        index.push(a, b, a + k, b, b + k, a + k);
      }
    const apex = (rows + 2) * k;
    for (let j = 0; j < SIDES; j++)
      index.push((rows + 1) * k + j, (rows + 1) * k + ((j + 1) % k), apex);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(tex, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    add(geometry);
  };
  for (const [i, [x, z, h, lean]] of [
    [0.12, 0.3, 0.55, 0.2],
    [-0.2, 0.28, 0.45, -0.25],
    [0.3, -0.25, 0.5, 0.3],
    [-0.05, -0.35, 0.4, -0.15],
  ].entries()) {
    const dx = Math.sin(i * 1.7) * 0.1,
      tip = [x - lean * 0.25, 0.3 + h, z + dx];
    branch(
      [
        [x, 0.26, z],
        [x, 0.46, z],
        [x - lean * 0.2, 0.3 + h * 0.72, z + dx * 0.6],
        tip,
      ],
      0.052,
      5,
    );
    for (const side of [-1, 1])
      branch(
        [
          [x, 0.39 + h * 0.12, z],
          [x + side * 0.095, 0.42 + h * 0.3, z + side * 0.04],
          [x + side * 0.14, 0.43 + h * 0.55, z + side * 0.06],
        ],
        0.026,
        4,
      );
  }
  return refineNature(THREE, root, "sea_coral");
}
