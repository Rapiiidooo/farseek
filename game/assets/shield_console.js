import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export default function buildShieldConsole(THREE) {
  const root = new THREE.Group();
  root.name = "airShieldConsole";
  const stone = new THREE.MeshStandardMaterial({
    color: 0x89a296,
    roughness: 0.83,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: 0x9b8058,
    roughness: 0.47,
    metalness: 0.66,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x132d32,
    roughness: 0.34,
    metalness: 0.22,
  });
  const signal = new THREE.MeshStandardMaterial({
    color: 0x267b80,
    emissive: 0x39e3d0,
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });
  const parts = new Map(
    [stone, bronze, dark, signal].map((material) => [material, []]),
  );
  const add = (material, geometry) =>
    parts
      .get(material)
      .push(geometry.index ? geometry.toNonIndexed() : geometry);
  const block = (material, size, at) =>
    add(material, new THREE.BoxGeometry(...size).translate(...at));
  block(stone, [1.3, 0.12, 0.92], [0, 0.06, 0]);
  add(
    stone,
    new THREE.CylinderGeometry(0.47, 0.61, 0.82, 4)
      .rotateY(Math.PI / 4)
      .scale(1, 1, 0.68)
      .translate(0, 0.53, 0),
  );
  block(bronze, [0.94, 0.055, 0.68], [0, 0.16, 0]);
  // The pedestal's faces lean in: 0.0817 m per metre front and back, 0.1207 at the sides.
  // Fittings are tilted to match and sunk 6 mm into them.
  const front = (material, [w, h, d], [x, y], back = false) => {
    const lean = Math.atan(0.0817),
      face = 0.293 - 0.0817 * (y - 0.12),
      out = d / 2 - 0.006;
    const geometry = new THREE.BoxGeometry(w, h, d)
      .rotateX(-lean)
      .translate(x, y + out * Math.sin(lean), face + out * Math.cos(lean));
    add(material, back ? geometry.rotateY(Math.PI) : geometry);
  };
  const flank = (material, [w, h, d], [z, y], side) => {
    const lean = Math.atan(0.1207),
      face = 0.431 - 0.1207 * (y - 0.12),
      out = d / 2 - 0.006;
    const geometry = new THREE.BoxGeometry(d, h, w)
      .rotateZ(lean)
      .translate(face + out * Math.cos(lean), y + out * Math.sin(lean), z);
    add(material, side < 0 ? geometry.rotateY(Math.PI) : geometry);
  };
  front(dark, [0.19, 0.52, 0.025], [0, 0.57]);
  for (const side of [-1, 1]) {
    block(bronze, [0.044, 0.71, 0.07], [side * 0.338, 0.57, 0.222]);
    for (let row = 0; row < 4; row++)
      front(dark, [0.15, 0.027, 0.04], [side * 0.222, 0.34 + row * 0.092]);
    for (let row = 0; row < 3; row++)
      flank(dark, [0.3, 0.026, 0.03], [0, 0.42 + row * 0.1], side);
  }
  front(dark, [0.3, 0.42, 0.02], [0, 0.55], true);
  for (const [w, h, x, y] of [
    [0.36, 0.035, 0, 0.775],
    [0.36, 0.035, 0, 0.325],
    [0.035, 0.42, -0.165, 0.55],
    [0.035, 0.42, 0.165, 0.55],
  ])
    front(bronze, [w, h, 0.035], [x, y], true);
  for (const y of [0.42, 0.68])
    front(bronze, [0.05, 0.06, 0.05], [0.18, y], true);
  add(
    bronze,
    new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16)
      .rotateX(Math.atan(0.0817) - Math.PI / 2)
      .translate(0, 0.6, -(0.293 - 0.0817 * 0.48) - 0.024),
  );
  // a wedge follows the desk's underside, which otherwise rests on air behind its front edge
  {
    const z0 = -0.226,
      z1 = 0.2118,
      x = 0.3,
      top = (z) => 1.0278 - 0.4145 * z - 0.012;
    const shape = new THREE.Shape([
      new THREE.Vector2(z0, 0.93),
      new THREE.Vector2(z1, 0.93),
      new THREE.Vector2(z0, top(z0)),
    ]);
    add(
      stone,
      new THREE.ExtrudeGeometry(shape, { depth: 2 * x, bevelEnabled: false })
        .translate(0, 0, -x)
        .rotateY(-Math.PI / 2),
    );
  }
  const deck = (geometry) =>
    geometry.rotateX(Math.PI / 8).translate(0, 1.09, 0);
  const pad = (material, size, at) =>
    add(material, deck(new THREE.BoxGeometry(...size).translate(...at)));
  pad(bronze, [1.14, 0.115, 0.78], [0, 0, 0]);
  pad(dark, [1.052, 0.018, 0.69], [0, 0.067, 0]);
  pad(stone, [1.17, 0.066, 0.053], [0, 0.085, -0.364]);
  for (const side of [-1, 1])
    pad(bronze, [0.042, 0.052, 0.73], [side * 0.551, 0.08, 0]);
  pad(signal, [0.53, 0.007, 0.011], [-0.12, 0.081, -0.263]);
  for (let index = 0; index < 3; index++)
    pad(signal, [0.067, 0.008, 0.015], [-0.304 + index * 0.096, 0.083, 0.226]);
  add(
    bronze,
    deck(
      new THREE.TorusGeometry(0.187, 0.01, 6, 40)
        .rotateX(Math.PI / 2)
        .translate(-0.12, 0.091, -0.035),
    ),
  );
  // the shield's sign: a dome of light over the ground line, its beacon at the centre
  add(
    signal,
    deck(
      new THREE.TorusGeometry(0.148, 0.005, 5, 40, Math.PI)
        .rotateX(-Math.PI / 2)
        .translate(-0.12, 0.094, -0.035),
    ),
  );
  pad(signal, [0.3, 0.007, 0.01], [-0.12, 0.093, -0.035]);
  add(
    signal,
    deck(
      new THREE.CylinderGeometry(0.024, 0.024, 0.009, 16).translate(
        -0.12,
        0.095,
        -0.062,
      ),
    ),
  );
  for (const z of [-0.195, -0.055, 0.085]) {
    add(
      bronze,
      deck(
        new THREE.CylinderGeometry(0.055, 0.064, 0.016, 20).translate(
          0.367,
          0.088,
          z,
        ),
      ),
    );
    add(
      signal,
      deck(
        new THREE.CylinderGeometry(0.035, 0.035, 0.009, 20).translate(
          0.367,
          0.101,
          z,
        ),
      ),
    );
  }
  for (const x of [-0.49, 0.49])
    for (const z of [-0.293, 0.293])
      add(
        bronze,
        deck(
          new THREE.CylinderGeometry(0.013, 0.013, 0.009, 10).translate(
            x,
            0.083,
            z,
          ),
        ),
      );
  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = mesh.receiveShadow = true;
    if (material === signal) {
      mesh.name = "consoleDisplay";
      root.userData.parts = { display: mesh };
    }
    root.add(mesh);
  }
  root.userData.interaction = [0, 1.3, 0];
  return root;
}
