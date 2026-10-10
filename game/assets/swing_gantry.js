// swing_gantry, candidate B (profiles and sweeps): each pole is one lathe of an irregular
// profile (swollen knots, a slight taper, a worn top) laid along its axis; every rope is a
// tube swept along a curve: a helix of turns round the crossing, sagging back-stays and foot
// rope, wound bindings; the footings are bevelled extrusions and the ring a lathed section.
// Front faces +Z, over the drop. userData.anchor is the ground point between the feet,
// userData.pivot the bottom of the ring, userData.feet the two pole feet.
export default function (THREE) {
  const g = new THREE.Group();
  const mat = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const TIMBER = mat(0x8a6a48, "timber", 0.9);
  const ROPE = mat(0xa9845a, "fabric", 0.95);
  const BRONZE = mat(0x9a6a35, "metal", 0.45, 0.6);
  const RED = mat(0xa34c39, "fabric", 0.9);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const UP = V(0, 1, 0);
  const PARTS = new Map();
  const put = (m, geo) => {
    if (!PARTS.has(m)) PARTS.set(m, []);
    PARTS.get(m).push(geo.index ? geo.toNonIndexed() : geo);
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // A pole: a lathe of radius against height, stood on `a` and pointed at `b`.
  const pole = (a, b, r0, r1) => {
    const len = a.distanceTo(b);
    const prof = [V2(0, 0)];
    const knots = [0.23, 0.51, 0.77].map((t) => t + (rnd() - 0.5) * 0.08);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      let r = r0 + (r1 - r0) * t;
      for (const k of knots) r += 0.011 * Math.max(0, 1 - Math.abs(t - k) * 22);
      if (t > 0.985) r *= 0.82;
      prof.push(V2(r, t * len));
    }
    prof.push(V2(0, len));
    const geo = new THREE.LatheGeometry(prof, 12);
    geo.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        UP,
        b.clone().sub(a).normalize(),
      ),
    );
    geo.translate(a.x, a.y, a.z);
    put(TIMBER, geo);
  };
  const tube = (m, pts, r, seg = 64, radial = 6) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    put(m, new THREE.TubeGeometry(curve, seg, r, radial, false));
  };
  // Turns of rope wound round an axis through `c`, `turns` of them over `span`.
  const binding = (c, axis, r, span, turns, tubeR = 0.016) => {
    const n = axis.clone().normalize();
    const u =
      Math.abs(n.y) < 0.9 ? V(0, 1, 0).cross(n).normalize() : V(1, 0, 0);
    const w = n.clone().cross(u);
    const pts = [];
    for (let i = 0; i <= turns * 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pts.push(
        c
          .clone()
          .addScaledVector(n, -span / 2 + (span * i) / (turns * 14))
          .addScaledVector(u, Math.cos(a) * r)
          .addScaledVector(w, Math.sin(a) * r),
      );
    }
    tube(ROPE, pts, tubeR, turns * 20, 5);
  };

  const APEX = V(0, 6.75, 3.0);
  const legs = [-1, 1].map((s) => {
    const foot = V(s * 1.25, 0.14, 0);
    const cross = APEX.clone().add(V(0, 0, s * 0.085));
    const dir = cross.clone().sub(foot).normalize();
    return {
      s,
      foot,
      cross,
      dir,
      top: cross.clone().addScaledVector(dir, 0.45),
    };
  });
  for (const { s, foot, top, dir } of legs) {
    pole(foot, top, 0.088, 0.066);
    // a bevelled footing block
    const shape = new THREE.Shape();
    shape.moveTo(-0.22, -0.26);
    shape.lineTo(0.22, -0.26);
    shape.lineTo(0.22, 0.26);
    shape.lineTo(-0.22, 0.26);
    shape.lineTo(-0.22, -0.26);
    const block = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    });
    block.rotateX(-Math.PI / 2);
    block.rotateY(s * 0.1);
    block.translate(foot.x, 0.02, foot.z + 0.04);
    put(TIMBER, block);
    binding(foot.clone().addScaledVector(dir, 0.22), dir, 0.095, 0.12, 4);
  }
  // a foot rope between the poles, swept with a little slack; nothing spans the frame above
  {
    const a = legs[0].foot.clone().addScaledVector(legs[0].dir, 0.12),
      b = legs[1].foot.clone().addScaledVector(legs[1].dir, 0.12);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(
        a
          .clone()
          .lerp(b, t)
          .add(V(0, -0.28 * t * (1 - t), 0.03)),
      );
    }
    tube(ROPE, pts, 0.016, 16, 6);
  }
  // the crossing: a helix round both poles, then frapping turns between them
  {
    const pts = [];
    for (let i = 0; i <= 7 * 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      pts.push(
        APEX.clone().add(
          V(
            Math.cos(a) * 0.2,
            -0.13 + (0.26 * i) / (7 * 18),
            Math.sin(a) * 0.14,
          ),
        ),
      );
    }
    tube(ROPE, pts, 0.019, 200, 5);
    binding(APEX, V(0, 0, 1), 0.075, 0.08, 3);
  }
  // back-stays: tubes along a slight catenary to stakes behind the feet
  for (const s of [-1, 1]) {
    const stake = V(s * 1.6, 0, -2.6);
    pole(stake, stake.clone().add(V(-s * 0.06, 0.48, 0.08)), 0.05, 0.035);
    binding(
      stake.clone().add(V(-s * 0.04, 0.34, 0.05)),
      UP,
      0.055,
      0.06,
      2,
      0.013,
    );
    const from = stake.clone().add(V(-s * 0.04, 0.36, 0.05));
    const to = APEX.clone().add(V(s * 0.12, -0.08, -0.09));
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(
        from
          .clone()
          .lerp(to, t)
          .add(V(0, -0.5 * t * (1 - t), 0)),
      );
    }
    tube(ROPE, pts, 0.016, 24, 6);
  }
  // the ring: a lathed round section, on a short sling of rope
  const RING = APEX.clone().add(V(0, -0.27, 0));
  tube(
    ROPE,
    [APEX.clone().add(V(0, -0.1, 0)), RING.clone().add(V(0, 0.06, 0))],
    0.018,
    4,
  );
  {
    const prof = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      prof.push(V2(0.065 + Math.cos(a) * 0.017, Math.sin(a) * 0.017));
    }
    const ring = new THREE.LatheGeometry(prof, 20);
    ring.rotateZ(Math.PI / 2);
    ring.translate(RING.x, RING.y, RING.z);
    put(BRONZE, ring);
  }
  // a vermilion strip: a thin ribbon swept down from the lashing
  {
    const curve = new THREE.CatmullRomCurve3([
      APEX.clone().add(V(0.15, -0.1, 0.14)),
      APEX.clone().add(V(0.18, -0.35, 0.17)),
      APEX.clone().add(V(0.2, -0.62, 0.24)),
    ]);
    const shape = new THREE.Shape();
    shape.moveTo(-0.004, -0.035);
    shape.lineTo(0.004, -0.035);
    shape.lineTo(0.004, 0.035);
    shape.lineTo(-0.004, 0.035);
    shape.lineTo(-0.004, -0.035);
    put(
      RED,
      new THREE.ExtrudeGeometry(shape, { steps: 12, extrudePath: curve }),
    );
  }

  const merged = (geos) => {
    let n = 0;
    for (const x of geos) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3);
    let o = 0;
    for (const x of geos) {
      if (!x.attributes.normal) x.computeVertexNormals();
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      o += x.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return geo;
  };
  for (const [m, geos] of PARTS) g.add(new THREE.Mesh(merged(geos), m));

  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const add = (mm) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mm));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        add(m4.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    add(n.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box.min.y;
    o.position.z -= c.z;
  });
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const shift = (p) => [r3(p.x - c.x), r3(p.y - box.min.y), r3(p.z - c.z)];
  g.userData.anchor = shift(V(0, 0, 0));
  g.userData.pivot = shift(RING.clone().add(V(0, -0.082, 0)));
  g.userData.feet = legs.map((l) => shift(V(l.foot.x, 0, l.foot.z)));
  return g;
}
