/**
 * builder_mask, candidate A: stacked chamfered masses with a turned mask.
 *
 * A watcher of the builders: a stepped sandstone plinth of three courses, a
 * short chamfered neck, a sandstone disc standing behind the head like a halo,
 * an aged bronze crescent collar cradling the mask, and the mask itself, a tall
 * rounded bone limestone form with no features except a single vertical slit.
 * The slit is its own mesh and material, dark until the game lights it.
 *
 * Front +Z, up +Y, base on y = 0: about 1.7 m wide, 3.4 m tall, 1.5 m deep.
 */
export default function (THREE) {
  const g = new THREE.Group();
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const sunlit = M(0xd4a373, "stone", 0.86);
  const sandstone = M(0xb57f4f, "stone", 0.88);
  const sienna = M(0x8a5433, "stone", 0.92);
  const bone = M(0xe6d3ae, "stone", 0.78);
  const basalt = M(0x3a3531, "stone", 0.8);
  const bronze = M(0x9a6a35, "metal", 0.45, 0.65);
  const slitLight = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    emissive: 0x39e3d0,
    emissiveIntensity: 0,
    roughness: 0.3,
    metalness: 0.1,
  });
  const add = (geo, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const block = (w, h, d, bevel) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + bevel, -d / 2);
    s.lineTo(w / 2 - bevel, -d / 2);
    s.lineTo(w / 2, -d / 2 + bevel);
    s.lineTo(w / 2, d / 2 - bevel);
    s.lineTo(w / 2 - bevel, d / 2);
    s.lineTo(-w / 2 + bevel, d / 2);
    s.lineTo(-w / 2, d / 2 - bevel);
    s.lineTo(-w / 2, -d / 2 + bevel);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: h - 2 * bevel,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, bevel, 0);
    return geo;
  };

  // Three stepped courses, the lowest darkest, with a basalt band on the middle one.
  add(block(1.7, 0.34, 1.5, 0.05), sienna, 0, 0, 0);
  add(block(1.42, 0.3, 1.24, 0.05), sandstone, 0, 0.34, 0);
  add(block(1.46, 0.06, 1.28, 0.02), basalt, 0, 0.5, 0);
  add(block(1.16, 0.32, 1.0, 0.05), sunlit, 0, 0.64, 0);
  // Incised channels down the front of the top course.
  for (const x of [-0.3, -0.15, 0, 0.15, 0.3])
    add(new THREE.BoxGeometry(0.035, 0.24, 0.03), basalt, x, 0.8, 0.5);
  // The neck, chamfered and narrowing.
  add(block(0.62, 0.55, 0.52, 0.06), sandstone, 0, 0.96, 0);

  // The halo: a sandstone disc behind the head with a bronze rim.
  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.82, 0.16, 48),
    sandstone,
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 2.45, -0.36);
  g.add(halo);
  const haloRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.04, 8, 64),
    bronze,
  );
  haloRim.position.set(0, 2.45, -0.27);
  g.add(haloRim);

  // The mask: a lathe turned upright, squashed into a tall rounded form, front face flattened.
  const profile = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = -0.82 + t * 1.64;
    const r = Math.max(
      0.001,
      Math.sqrt(Math.max(0, 1 - (y / 0.82) ** 2)) * 0.5,
    );
    profile.push(new THREE.Vector2(r, y));
  }
  const maskGeo = new THREE.LatheGeometry(profile, 40);
  maskGeo.scale(1, 1, 0.48);
  const p = maskGeo.attributes.position;
  for (let i = 0; i < p.count; i++)
    if (p.getZ(i) > 0.17) p.setZ(i, 0.17 + (p.getZ(i) - 0.17) * 0.35);
  maskGeo.computeVertexNormals();
  add(maskGeo, bone, 0, 2.42, -0.02);
  // The slit: the mask's only feature.
  const slit = add(
    new THREE.BoxGeometry(0.06, 0.92, 0.05),
    slitLight,
    0,
    2.48,
    0.19,
  );
  slit.name = "slit";
  const groove = add(
    new THREE.BoxGeometry(0.1, 1.0, 0.03),
    basalt,
    0,
    2.48,
    0.175,
  );
  groove.castShadow = false;

  // The bronze crescent collar under the mask, horns rising either side.
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.07, 10, 40, Math.PI * 0.86),
    bronze,
  );
  collar.rotation.z = Math.PI + Math.PI * 0.07;
  collar.position.set(0, 2.18, 0.06);
  g.add(collar);
  // A bone disc at the collar's foot, the crescent-and-disc motif.
  const boss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.12, 0.08, 24),
    bone,
  );
  boss.rotation.x = Math.PI / 2;
  boss.position.set(0, 1.58, 0.28);
  g.add(boss);

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
  bake(g, (o) => o.name === "slit");

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });

  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((node) => {
    const pos = node.isMesh && node.geometry.attributes.position;
    if (!pos) return;
    const put = (mat) => {
      for (let i = 0; i < pos.count; i++)
        box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mat));
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
  g.userData.parts = { slit };
  g.userData.slit = [
    +(0 - c.x).toFixed(3),
    +(2.48 - box.min.y).toFixed(3),
    +(0.215 - c.z).toFixed(3),
  ];
  return g;
}
