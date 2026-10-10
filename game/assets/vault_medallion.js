/**
 * vault_medallion, candidate A: turned profiles.
 *
 * The builders' rounded medallion, set flush into a wall of the vault: a
 * stepped sandstone disc turned as one lathe about the facing axis, a bone
 * limestone rim carrying four crescent notches, an aged bronze ring with
 * rivets, a turquoise channel ring between the bronze and the field (its own
 * mesh and material, dormant until the game lights it), and a recessed bone
 * field where the game sets one address glyph.
 *
 * Front +Z, up +Y, base on y = 0, about 1.7 m across and 0.36 m deep. The back
 * is flat because it mounts against masonry.
 */
export default function (THREE) {
  const g = new THREE.Group();
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const sandstone = M(0xb57f4f, "stone", 0.88);
  const sienna = M(0x8a5433, "stone", 0.92);
  const bone = M(0xe6d3ae, "stone", 0.82);
  const bronze = M(0x9a6a35, "metal", 0.45, 0.65);
  const basalt = M(0x3a3531, "stone", 0.8);
  const channel = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    emissive: 0x39e3d0,
    emissiveIntensity: 0,
    roughness: 0.3,
    metalness: 0.1,
  });

  const R = 0.85,
    CY = 0.85;
  const face = new THREE.Group();
  face.position.set(0, CY, 0);
  g.add(face);

  // Profiles are [radius, depth] pairs turned about +Z: the lathe turns about Y, then tips.
  const turned = (points, material, segments = 64) => {
    const geo = new THREE.LatheGeometry(
      points.map(([r, d]) => new THREE.Vector2(r, d)),
      segments,
    );
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    face.add(mesh);
    return mesh;
  };
  // The body: a chamfered back plate, a stepped shoulder and the rim's outer wall.
  turned(
    [
      [0.001, 0],
      [R, 0],
      [R, 0.1],
      [R - 0.04, 0.14],
      [R - 0.06, 0.14],
      [R - 0.06, 0.22],
      [R - 0.1, 0.26],
    ],
    sienna,
  );
  // The bone rim: a rounded lip falling inward to the bronze seat.
  turned(
    [
      [R - 0.1, 0.26],
      [R - 0.12, 0.33],
      [R - 0.17, 0.36],
      [R - 0.23, 0.35],
      [R - 0.26, 0.3],
      [R - 0.26, 0.24],
    ],
    bone,
  );
  // The sandstone step inside the bronze ring, down to the recessed field.
  turned(
    [
      [R - 0.26, 0.24],
      [0.56, 0.24],
      [0.53, 0.2],
      [0.5, 0.2],
      [0.5, 0.15],
    ],
    sandstone,
  );
  // The field the glyph is cut into.
  turned(
    [
      [0.5, 0.15],
      [0.47, 0.17],
      [0.001, 0.17],
    ],
    bone,
  );

  // The bronze ring seated on the step, with eight rivets.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(R - 0.29, 0.032, 10, 72),
    bronze,
  );
  ring.position.z = 0.25;
  face.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rivet = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 10, 6),
      bronze,
    );
    rivet.position.set(
      Math.cos(a) * (R - 0.165),
      Math.sin(a) * (R - 0.165),
      0.35,
    );
    face.add(rivet);
  }

  // The channel ring that lights when the medallion wakes.
  const glowRing = new THREE.Mesh(
    new THREE.RingGeometry(0.505, 0.545, 72, 1),
    channel,
  );
  glowRing.position.z = 0.205;
  glowRing.name = "ring";
  face.add(glowRing);

  // Four crescent notches cut into the rim at the diagonals, each a raised basalt crescent.
  const crescent = new THREE.Shape();
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const a = 0.9 + ((Math.PI * 2 - 1.8) * i) / n;
    const x = Math.cos(a) * 0.07,
      y = Math.sin(a) * 0.07;
    if (i) crescent.lineTo(x, y);
    else crescent.moveTo(x, y);
  }
  for (let i = n - 1; i > 0; i--) {
    const a = 0.9 + ((Math.PI * 2 - 1.8) * i) / n;
    crescent.lineTo(Math.cos(a) * 0.05 + 0.025, Math.sin(a) * 0.05);
  }
  const crescentGeo = new THREE.ExtrudeGeometry(crescent, {
    depth: 0.02,
    bevelEnabled: false,
  });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const mark = new THREE.Mesh(crescentGeo, basalt);
    mark.position.set(Math.cos(a) * (R - 0.2), Math.sin(a) * (R - 0.2), 0.345);
    mark.rotation.z = a + Math.PI;
    face.add(mark);
  }
  // Incised notches all round the outer edge, so the rim reads from the side as well.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const notch = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.03, 0.09),
      basalt,
    );
    notch.position.set(
      Math.cos(a) * (R + 0.004),
      Math.sin(a) * (R + 0.004),
      0.05,
    );
    notch.rotation.z = a + Math.PI / 2;
    face.add(notch);
  }
  // Three short incised channels fall from the bottom of the rim, as on the vault's walls.
  for (const x of [-0.12, 0, 0.12]) {
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.2, 0.03),
      basalt,
    );
    groove.position.set(x, -R + 0.13, 0.13);
    face.add(groove);
  }

  // Static pieces under a node are welded into one mesh per material, so the asset draws in a
  // handful of calls even when loaded with its hierarchy; `keep` spares the parts that move or glow.
  const bake = (root, keep = () => false) => {
    root.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map(),
      done = [];
    root.traverse((o) => {
      if (!o.isMesh || o === root) return;
      for (let p = o; p && p !== root; p = p.parent) if (keep(p)) return;
      const geo = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      geo.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld),
      );
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(geo);
      done.push(o);
    });
    for (const o of done) o.removeFromParent();
    for (const [material, geos] of buckets) {
      const count = geos.reduce(
        (n, geo) => n + geo.attributes.position.count,
        0,
      );
      const pos = new Float32Array(count * 3),
        nor = new Float32Array(count * 3),
        uv = new Float32Array(count * 2);
      let at = 0;
      for (const geo of geos) {
        pos.set(geo.attributes.position.array, at * 3);
        nor.set(geo.attributes.normal.array, at * 3);
        if (geo.attributes.uv) uv.set(geo.attributes.uv.array, at * 2);
        at += geo.attributes.position.count;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      root.add(new THREE.Mesh(merged, material));
    }
  };
  bake(face, (o) => o.name === "ring");

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });

  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((node) => {
    const p = node.isMesh && node.geometry.attributes.position;
    if (!p) return;
    const put = (mat) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat));
    };
    if (node.isInstancedMesh) {
      for (let c = 0; c < node.count; c++) {
        node.getMatrixAt(c, im);
        put(m.multiplyMatrices(node.matrixWorld, im));
      }
      return;
    }
    put(node.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box.min.y;
    o.position.z -= c.z;
  });
  const field = [-c.x, CY - box.min.y, 0.171 - c.z];
  g.userData.parts = { ring: glowRing };
  g.userData.field = { center: field, size: 0.78 };
  g.userData.mounts = "back";
  return g;
}
