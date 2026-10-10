/**
 * vault_door, candidate A: extruded masses.
 *
 * The builders' sealed round door at the heart of the vault. A sandstone wall
 * slab is extruded from its outline with a round hole and chamfered edges; a
 * bone limestone frame is turned about the facing axis around the hole; two
 * half-disc leaves fill the hole and slide apart into the slab; a turquoise
 * slit glows where the leaves meet. Two stepped piers carry incised channels,
 * basalt bands cross the lower course, a stepped crown carries a crescent, and
 * six basalt sockets in an arch over the hole seat the six medallions. The back
 * repeats the frame in plain sandstone with its own channels.
 *
 * Front +Z, up +Y, base on y = 0: about 14.6 m wide, 12.5 m tall, 2.7 m deep.
 * The opening's bottom is a low threshold 0.18 m above the base.
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
  const basalt = M(0x3a3531, "stone", 0.78);
  const bronze = M(0x9a6a35, "metal", 0.45, 0.65);
  const light = () =>
    new THREE.MeshStandardMaterial({
      color: 0x1d5f63,
      emissive: 0x39e3d0,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.1,
    });
  const add = (geo, material, x = 0, y = 0, z = 0, parent = g) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const chamfered = (w, h, d, bevel = 0.06) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + bevel, -h / 2);
    s.lineTo(w / 2 - bevel, -h / 2);
    s.lineTo(w / 2, -h / 2 + bevel);
    s.lineTo(w / 2, h / 2 - bevel);
    s.lineTo(w / 2 - bevel, h / 2);
    s.lineTo(-w / 2 + bevel, h / 2);
    s.lineTo(-w / 2, h / 2 - bevel);
    s.lineTo(-w / 2, -h / 2 + bevel);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: d - 2 * bevel,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
    });
    geo.translate(0, 0, -(d - 2 * bevel) / 2);
    return geo;
  };
  const crescentShape = (r, inner, lift) => {
    const s = new THREE.Shape();
    const n = 32;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (Math.PI * i) / n;
      const px = Math.cos(a) * r,
        py = Math.sin(a) * r;
      if (i) s.lineTo(px, py);
      else s.moveTo(px, py);
    }
    for (let i = n - 1; i > 0; i--) {
      const a = Math.PI + (Math.PI * i) / n;
      s.lineTo(Math.cos(a) * r * inner, Math.sin(a) * r * inner * 0.8 + lift);
    }
    s.closePath();
    return s;
  };

  const CY = 3.9,
    RO = 3.72,
    SLAB = 1.6,
    W = 12.8,
    H = 11;
  const FRONT = SLAB / 2;

  // The wall slab with its round hole, lifted on a base course.
  const outline = new THREE.Shape();
  outline.moveTo(-W / 2, 0);
  outline.lineTo(W / 2, 0);
  outline.lineTo(W / 2, H);
  outline.lineTo(-W / 2, H);
  outline.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, CY, RO + 0.03, 0, Math.PI * 2, true);
  outline.holes.push(hole);
  const slab = new THREE.ExtrudeGeometry(outline, {
    depth: SLAB - 0.16,
    bevelEnabled: true,
    bevelSize: 0.08,
    bevelThickness: 0.08,
    bevelSegments: 1,
    curveSegments: 40,
  });
  slab.translate(0, 0, -(SLAB - 0.16) / 2);
  add(slab, sandstone);
  add(chamfered(W + 1.6, 0.18, SLAB + 1.0, 0.05), sienna, 0, 0.09, 0);
  add(chamfered(W - 3, 0.12, 0.7, 0.04), sienna, 0, 0.06, FRONT + 0.85);
  add(chamfered(W - 3, 0.12, 0.7, 0.04), sienna, 0, 0.06, -FRONT - 0.85);

  // The turned bone frame around the hole, chamfered towards the viewer, and its plainer back.
  const turned = (points, material, z) => {
    const geo = new THREE.LatheGeometry(
      points.map(([r, d]) => new THREE.Vector2(r, d)),
      72,
    );
    geo.rotateX(Math.PI / 2);
    const mesh = add(geo, material, 0, CY, z);
    mesh.rotation.z = Math.PI / 72;
    return mesh;
  };
  turned(
    [
      [RO + 0.02, 0],
      [RO + 0.02, 0.12],
      [RO + 0.14, 0.3],
      [RO + 0.62, 0.3],
      [RO + 0.78, 0.16],
      [RO + 0.84, -0.02],
    ],
    bone,
    FRONT,
  );
  turned(
    [
      [RO + 0.6, 0.02],
      [RO + 0.5, -0.2],
      [RO + 0.12, -0.2],
      [RO + 0.02, -0.08],
      [RO + 0.02, 0],
    ],
    sunlit,
    -FRONT,
  );
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(RO + 0.38, 0.05, 8, 96),
    bronze,
  );
  band.position.set(0, CY, FRONT + 0.31);
  g.add(band);
  const grooves = new THREE.Group();
  grooves.name = "grooves";
  g.add(grooves);
  const grooveLight = light();
  add(
    new THREE.RingGeometry(RO + 0.92, RO + 1.0, 96, 1),
    grooveLight,
    0,
    CY,
    FRONT + 0.012,
    grooves,
  );

  // Two stepped piers with incised channels, each with a channel of light in its middle groove.
  for (const side of [-1, 1]) {
    const x = side * (W / 2 + 0.05);
    add(chamfered(1.5, 0.7, 2.2, 0.07), sienna, x, 0.35, 0);
    add(
      chamfered(1.2, H - 1.2, 1.8, 0.06),
      sandstone,
      x,
      0.7 + (H - 1.2) / 2,
      0,
    );
    add(chamfered(1.5, 0.5, 2.1, 0.06), sunlit, x, H - 0.25, 0);
    add(chamfered(1.75, 0.36, 2.3, 0.05), bone, x, H + 0.18, 0);
    for (const face of [-1, 1])
      for (const dx of [-0.32, 0, 0.32]) {
        const strip = add(
          new THREE.BoxGeometry(0.1, H - 2.6, 0.05),
          basalt,
          x + dx,
          H / 2,
          face * 0.91,
        );
        strip.castShadow = false;
      }
    add(
      new THREE.BoxGeometry(0.05, H - 3, 0.02),
      grooveLight,
      x,
      H / 2,
      0.945,
      grooves,
    );
    // Basalt bands across the lower course, interrupted by the hole.
    add(
      chamfered(W / 2 - 3.4, 0.3, 0.12, 0.03),
      basalt,
      side * (W / 4 + 1.7),
      1.55,
      FRONT + 0.05,
    );
  }

  // The stepped crown with its crescent.
  add(chamfered(W + 0.4, 0.5, SLAB + 0.3, 0.06), sunlit, 0, H + 0.25, 0);
  add(chamfered(6.4, 0.42, SLAB, 0.05), bone, 0, H + 0.71, 0);
  const crescentGeo = new THREE.ExtrudeGeometry(
    crescentShape(0.62, 0.74, 0.1),
    {
      depth: 0.32,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
      bevelSegments: 1,
    },
  );
  crescentGeo.translate(0, 0, -0.16);
  add(crescentGeo, bone, 0, H + 0.92 + 0.62, 0);

  // Six sockets in an arch over the hole, where the medallions are seated.
  const sockets = [];
  for (let i = 0; i < 6; i++) {
    const a = THREE.MathUtils.degToRad(145 - i * 22);
    const sx = Math.cos(a) * 5.75,
      sy = CY + Math.sin(a) * 5.75;
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.0, 0.12, 48),
      basalt,
    );
    seat.rotation.x = Math.PI / 2;
    seat.position.set(sx, sy, FRONT + 0.02);
    g.add(seat);
    sockets.push([sx, sy, FRONT + 0.08]);
  }

  // The two leaves: half discs that meet at the slit and slide apart into the slab.
  const leaves = {},
    slits = {};
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.name = side < 0 ? "leafLeft" : "leafRight";
    leaf.position.set(0, CY, 0);
    g.add(leaf);
    const r = RO + 0.05;
    const half = new THREE.Shape();
    half.moveTo(0, -r);
    half.absarc(0, 0, r, -Math.PI / 2, Math.PI / 2, side < 0);
    half.lineTo(0, -r);
    const geo = new THREE.ExtrudeGeometry(half, {
      depth: 0.42,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      bevelSegments: 1,
      curveSegments: 36,
    });
    geo.translate(0, 0, -0.21);
    add(geo, sandstone, side * 0.015, 0, 0, leaf);
    for (const face of [-1, 1]) {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(2.6, 0.045, 8, 48, Math.PI),
        bronze,
      );
      rim.rotation.z = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      rim.position.z = face * 0.27;
      leaf.add(rim);
    }
    const relief = new THREE.Mesh(crescentGeo, sienna);
    relief.scale.set(1.4, 1.9, 0.4);
    relief.rotation.z = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    relief.position.set(side * 1.7, 0, 0.21);
    leaf.add(relief);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.38, 0.1, 32),
      bone,
    );
    disc.rotation.x = Math.PI / 2;
    disc.position.set(side * 0.95, 0, 0.27);
    leaf.add(disc);
    add(
      new THREE.BoxGeometry(0.09, 2 * r - 0.5, 0.5),
      bronze,
      side * 0.06,
      0,
      0,
      leaf,
    );
    const glow = add(
      new THREE.BoxGeometry(0.05, 2 * r - 1.1, 0.04),
      light(),
      side * 0.026,
      0,
      0.255,
      leaf,
    );
    glow.name = side < 0 ? "slitLeft" : "slitRight";
    leaves[leaf.name] = leaf;
    slits[glow.name] = glow;
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
  bake(
    g,
    (o) => o === grooves || o.name === "leafLeft" || o.name === "leafRight",
  );
  bake(grooves);
  for (const leaf of Object.values(leaves))
    bake(leaf, (o) => o.name.startsWith("slit"));

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
  const at = ([x, y, z]) => [
    +(x - c.x).toFixed(3),
    +(y - box.min.y).toFixed(3),
    +(z - c.z).toFixed(3),
  ];
  g.userData.joints = leaves;
  g.userData.parts = { grooves, ...slits };
  g.userData.sockets = sockets.map(at);
  g.userData.opening = { center: at([0, CY, FRONT]), radius: RO };
  return g;
}
