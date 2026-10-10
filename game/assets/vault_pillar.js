/**
 * vault_pillar, candidate A: stacked chamfered blocks.
 *
 * A pillar of the builders' vault: a stepped plinth of three courses, a square
 * chamfered shaft cut on every face by two incised channels, a bone limestone
 * band carrying a rounded medallion boss on the front and back, and a capital
 * that widens in steps under a crescent-cut abacus. The front channels hold a
 * turquoise inlay, its own mesh and material, dark until the game lights it.
 *
 * Front +Z, up +Y, base on y = 0: about 1.9 m wide, 7 m tall.
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
  const bone = M(0xe6d3ae, "stone", 0.8);
  const basalt = M(0x3a3531, "stone", 0.8);
  const bronze = M(0x9a6a35, "metal", 0.45, 0.65);
  const inlay = new THREE.MeshStandardMaterial({
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
  // A square block with chamfered vertical edges and a chamfered top and bottom.
  const block = (w, h, bevel) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + bevel, -w / 2);
    s.lineTo(w / 2 - bevel, -w / 2);
    s.lineTo(w / 2, -w / 2 + bevel);
    s.lineTo(w / 2, w / 2 - bevel);
    s.lineTo(w / 2 - bevel, w / 2);
    s.lineTo(-w / 2 + bevel, w / 2);
    s.lineTo(-w / 2, w / 2 - bevel);
    s.lineTo(-w / 2, -w / 2 + bevel);
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

  // Plinth: three stepped courses.
  add(block(1.9, 0.4, 0.06), sienna, 0, 0);
  add(block(1.66, 0.36, 0.06), sandstone, 0, 0.4);
  add(block(1.42, 0.3, 0.05), sunlit, 0, 0.76);
  // Shaft in two drums with a joint between them.
  const W = 1.16;
  add(block(W, 2.5, 0.07), sandstone, 0, 1.06);
  add(block(W, 2.6, 0.07), sandstone, 0, 3.56);
  // Two channels on each face; on the front and back, an inlay of light in each.
  const channels = new THREE.Group();
  channels.name = "channels";
  g.add(channels);
  for (let face = 0; face < 4; face++) {
    const a = (face * Math.PI) / 2;
    const nx = Math.sin(a),
      nz = Math.cos(a);
    for (const off of [-0.2, 0.2]) {
      const tx = Math.cos(a) * off,
        tz = -Math.sin(a) * off;
      const groove = add(
        new THREE.BoxGeometry(
          face % 2 ? 0.06 : 0.11,
          4.6,
          face % 2 ? 0.11 : 0.06,
        ),
        basalt,
        nx * (W / 2 - 0.01) + tx,
        3.55,
        nz * (W / 2 - 0.01) + tz,
      );
      groove.castShadow = false;
      if (face % 2 === 0) {
        const glow = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 4.3, 0.025),
          inlay,
        );
        glow.position.set(
          nx * (W / 2 + 0.018) + tx,
          3.55,
          nz * (W / 2 + 0.018) + tz,
        );
        channels.add(glow);
      }
    }
  }
  // The bone band with a medallion boss front and back.
  add(block(W + 0.14, 0.42, 0.04), bone, 0, 6.16);
  for (const side of [-1, 1]) {
    const boss = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.34, 0.12, 32),
      bone,
    );
    boss.rotation.x = Math.PI / 2;
    boss.position.set(0, 5.5, side * (W / 2 + 0.05));
    g.add(boss);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.025, 6, 32),
      bronze,
    );
    ring.position.set(0, 5.5, side * (W / 2 + 0.115));
    g.add(ring);
  }
  // Capital: three widening steps and an abacus cut with a crescent on each face.
  add(block(1.3, 0.22, 0.04), sunlit, 0, 6.58);
  add(block(1.5, 0.2, 0.04), sandstone, 0, 6.8);
  add(block(1.78, 0.26, 0.05), bone, 0, 7.0);
  const crescent = new THREE.Shape();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = Math.PI + (Math.PI * i) / n;
    const x = Math.cos(t) * 0.36,
      y = Math.sin(t) * 0.36;
    if (i) crescent.lineTo(x, y);
    else crescent.moveTo(x, y);
  }
  for (let i = n - 1; i > 0; i--) {
    const t = Math.PI + (Math.PI * i) / n;
    crescent.lineTo(Math.cos(t) * 0.27, Math.sin(t) * 0.2 + 0.03);
  }
  const crescentGeo = new THREE.ExtrudeGeometry(crescent, {
    depth: 0.04,
    bevelEnabled: false,
  });
  for (let face = 0; face < 4; face++) {
    const a = (face * Math.PI) / 2;
    const mark = new THREE.Mesh(crescentGeo, sienna);
    mark.position.set(Math.sin(a) * 0.885, 7.21, Math.cos(a) * 0.885);
    mark.rotation.y = a;
    g.add(mark);
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
  bake(g, (o) => o === channels);
  bake(channels);

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
  g.userData.parts = { channels };
  return g;
}
