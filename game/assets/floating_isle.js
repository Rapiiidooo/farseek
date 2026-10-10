import { refineNature } from "../nature-detail.js";

// floating_isle, candidate B (profiles): the isle is one stepped, chamfered profile turned
// on a lathe in two pieces, a dawn limestone cap with a gently domed top and a chamfered,
// overhanging rim, and an inverted cone of five isle-rock tiers down to a point 9 m below
// the top. After turning, every vertex is pushed out by one irregular plan shared by all
// tiers and the lower tiers drift sideways, so the cone reads as rock rather than a cake.
// Flat shaded. The three fragments below are smaller lathes of the same kind, tilted;
// grass tufts are extruded fans of blades crossed in pairs, and the two boulders are
// fractured lumps of isle rock sunk into the dome.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color, name, roughness) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
    });
    m.name = name;
    return m;
  };
  const LIME = mat(0xeadcc0, "stone", 0.9);
  const ROCK = mat(0x9b7658, "stone", 0.92);
  const SAGE = mat(0x7a8766, "foliage", 0.85);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const V2 = (x, y) => new THREE.Vector2(x, y);
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const PARTS = new Map();
  const put = (m, geo) => {
    const o = geo.index ? geo.toNonIndexed() : geo;
    o.computeVertexNormals();
    if (!PARTS.has(m)) PARTS.set(m, []);
    PARTS.get(m).push(o);
  };

  // a profile given top-down as [r, y], turned on SEG sides, then warped by plan(theta, y)
  // (a radius factor) and drift(y) (a sideways offset); the lathe wants it bottom-up. With
  // taper, no ring may grow wider than the ring above it, so a step can never turn inside out.
  const turn = (prof, seg, plan, drift, matrix, taper = false) => {
    const n = prof.length;
    const geo = new THREE.LatheGeometry(
      prof
        .slice()
        .reverse()
        .map(([r, y]) => V2(r, y)),
      seg,
    );
    const p = geo.attributes.position;
    for (let i = 0; i <= seg; i++) {
      let above = Infinity;
      for (let j = n - 1; j >= 0; j--) {
        const q = i * n + j,
          x = p.getX(q),
          y = p.getY(q),
          z = p.getZ(q);
        const r = Math.hypot(x, z),
          a = Math.atan2(z, x);
        let rr = r * plan(a, y);
        if (taper && r > 1e-6) {
          rr = Math.min(rr, above * 0.985);
          above = rr;
        }
        const k = r > 1e-6 ? rr / r : 1,
          [dx, dz] = drift(y);
        p.setXYZ(q, x * k + dx, y, z * k + dz);
      }
    }
    if (matrix) geo.applyMatrix4(matrix);
    return geo;
  };

  // --- the isle: top centre at y = 0 -------------------------------------------------------
  // one plan for the cap; below it every tier turns its own lobes, so the steps run wide and narrow
  const TIER_AT = [-3.73, -5.61, -7.29];
  const plan = (a, y) => {
    const k = TIER_AT.filter((t) => y < t).length,
      ph = k * 1.9;
    return (
      1 +
      0.07 * Math.sin(3 * a + 0.5 + 0.3 * ph) +
      (0.045 + 0.012 * k) * Math.sin(5 * a + 1.3 + ph) +
      0.03 * Math.sin(7 * a + 2.1 - ph)
    );
  };
  const drift = (y) => {
    const t = Math.max(0, -y - 1.8) / 7.2;
    return [0.75 * t * t, -0.45 * t * t];
  };
  const DOME = [
    [0, 0],
    [1.6, -0.03],
    [3.2, -0.11],
    [4.6, -0.22],
    [5.8, -0.35],
    [6.45, -0.46],
  ];
  const CAP = [
    ...DOME,
    [6.9, -0.78],
    [6.9, -1.56],
    [6.62, -1.8],
    [6.25, -1.84],
  ];
  const BODY = [
    [6.25, -1.84],
    [6.0, -3.4],
    [5.5, -3.72],
    [4.6, -3.74],
    [4.38, -5.3],
    [3.95, -5.6],
    [3.2, -5.62],
    [3.0, -7.0],
    [2.6, -7.28],
    [1.95, -7.3],
    [1.75, -8.2],
    [1.35, -8.42],
    [0, -9.0],
  ];
  const SEG = 16;
  put(LIME, turn(CAP, SEG, plan, drift));
  put(ROCK, turn(BODY, SEG, plan, drift, null, true));
  // height of the domed top at radius r in plan units
  const domeAt = (r) => {
    for (let i = 0; i < DOME.length - 1; i++) {
      const [r0, y0] = DOME[i],
        [r1, y1] = DOME[i + 1];
      if (r <= r1) return y0 + ((y1 - y0) * (r - r0)) / (r1 - r0);
    }
    return DOME[DOME.length - 1][1];
  };

  // --- three fragments floating below, each a small stepped lathe, tilted -----------------
  const frag = (s, capped, o, tilt, spin, seg) => {
    const lp = (a) =>
      1 + 0.1 * Math.sin(3 * a + spin) + 0.06 * Math.sin(4 * a + 2 * spin);
    const m4 = new THREE.Matrix4().compose(
      o,
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(tilt[0], spin, tilt[1]),
      ),
      V(s, s, s),
    );
    const top = [
      [0, 0],
      [0.8, -0.04],
      [0.96, -0.14],
      [1.0, -0.3],
      [0.9, -0.42],
    ];
    const body = [
      [0.9, -0.42],
      [0.84, -0.92],
      [0.62, -1.08],
      [0.5, -1.12],
      [0.44, -1.5],
      [0, -1.95],
    ];
    if (capped)
      put(
        LIME,
        turn(top, seg, lp, () => [0, 0], m4),
      );
    put(
      ROCK,
      turn(
        capped ? body : [[0, 0], [0.8, -0.05], [0.95, -0.2], ...body.slice(1)],
        seg,
        lp,
        () => [0, 0],
        m4,
      ),
    );
  };
  frag(1.15, true, V(0.9, -10.05, -0.55), [0.08, -0.1], 0.7, 11);
  frag(0.8, false, V(5.6, -6.2, 1.9), [0.2, 0.14], 2.1, 9);
  frag(0.55, false, V(-5.2, -4.8, -3.6), [-0.16, 0.22], 4.0, 8);

  // --- the top: tufts of sage grass and two boulders, the centre left clear ----------------
  const fan = () => {
    const pts = [V2(-0.09, 0)];
    const blades = [
      [-0.85, 0.38],
      [-0.28, 0.48],
      [0.3, 0.46],
      [0.88, 0.36],
    ];
    blades.forEach(([a, l], i) => {
      pts.push(V2(Math.sin(a) * l, Math.cos(a) * l));
      if (i < blades.length - 1) {
        const b = (a + blades[i + 1][0]) / 2;
        pts.push(V2(Math.sin(b) * 0.1, 0.07 + Math.cos(b) * 0.04));
      }
    });
    pts.push(V2(0.09, 0));
    return new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth: 0.035,
      bevelEnabled: false,
    }).translate(0, 0, -0.0175);
  };
  const tuft = (x, z, s, yaw) => {
    const a = Math.atan2(z, x),
      r = Math.hypot(x, z) / plan(a, 0);
    const y = domeAt(r) - 0.03;
    for (const k of [0, 1]) {
      const geo = fan();
      geo.applyMatrix4(
        new THREE.Matrix4().compose(
          V(x, y, z),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, yaw + (k * Math.PI) / 2, 0),
          ),
          V(s, s * (0.85 + 0.3 * rnd()), s),
        ),
      );
      put(SAGE, geo);
    }
  };
  // six patches of tufts round the rim, the centre left clear
  const TUFTS = [];
  for (const [px, pz, sp, n] of [
    [3.7, 1.5, 0.9, 4],
    [-2.3, 4.0, 0.8, 4],
    [-4.9, -0.7, 0.75, 3],
    [1.6, -4.9, 0.8, 3],
    [5.3, -2.1, 0.5, 2],
    [-3.5, -4.0, 0.65, 3],
  ]) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.3,
        r = sp * Math.sqrt(rnd());
      TUFTS.push([px + Math.cos(a) * r, pz + Math.sin(a) * r]);
    }
  }
  for (const [x, z] of TUFTS) tuft(x, z, 1.1 + 0.5 * rnd(), rnd() * 3);
  // A lumpy rock split along three fracture planes, its top worn flat, a third sunk into the dome.
  const boulder = (x, z, w, h, yaw) => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const cuts = [0, 1, 2].map((k) => {
      const a = (k * Math.PI * 2) / 3 + rnd() * 1.4;
      return [
        V(Math.cos(a), (rnd() - 0.5) * 0.5, Math.sin(a)).normalize(),
        0.58 + 0.16 * rnd(),
      ];
    });
    const p = geo.attributes.position,
      seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(key)) {
        const q = V(p.getX(i), p.getY(i), p.getZ(i)).multiplyScalar(
          0.8 + 0.36 * rnd(),
        );
        for (const [n, d] of cuts) {
          const over = q.dot(n) - d;
          if (over > 0) q.addScaledVector(n, -over);
        }
        seen.set(key, [q.x, Math.min(0.72, q.y), q.z]);
      }
      p.setXYZ(i, ...seen.get(key));
    }
    geo.scale(w * 1.2, h, w * 0.9);
    geo.rotateY(yaw);
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    const a = Math.atan2(z, x),
      r = Math.hypot(x, z) / plan(a, 0);
    geo.translate(x, domeAt(r) - min.y - 0.35 * (max.y - min.y), z);
    put(ROCK, geo);
  };
  boulder(-3.4, 1.6, 0.62, 0.42, 0.4);
  boulder(2.9, -3.0, 0.42, 0.3, 1.9);

  // --- merge per material, UVs projected over each merged box --------------------------
  const merged = (geos) => {
    let n = 0;
    for (const x of geos) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3);
    let o = 0;
    for (const x of geos) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      o += x.attributes.position.count;
    }
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n * 3; i++) {
      lo[i % 3] = Math.min(lo[i % 3], pos[i]);
      hi[i % 3] = Math.max(hi[i % 3], pos[i]);
    }
    const su = Math.max(hi[0] - lo[0], hi[2] - lo[2]) || 1,
      sv = hi[1] - lo[1] || 1;
    const uv = new Float32Array(n * 2);
    for (let t = 0; t < n; t += 3) {
      const a = V(pos[t * 3], pos[t * 3 + 1], pos[t * 3 + 2]);
      const f = V(pos[t * 3 + 3], pos[t * 3 + 4], pos[t * 3 + 5])
        .sub(a)
        .cross(V(pos[t * 3 + 6], pos[t * 3 + 7], pos[t * 3 + 8]).sub(a));
      const fx = Math.abs(f.x),
        fy = Math.abs(f.y),
        fz = Math.abs(f.z);
      for (let k = t; k < t + 3; k++) {
        const x = pos[k * 3] - lo[0],
          y = pos[k * 3 + 1] - lo[1],
          z = pos[k * 3 + 2] - lo[2];
        const [u, v] =
          fy >= fx && fy >= fz ? [x, z] : fx >= fz ? [z, y] : [x, y];
        uv[k * 2] = u / su;
        uv[k * 2 + 1] = v / sv;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geo;
  };
  const meshes = new Map();
  for (const [m, geos] of PARTS) {
    const me = new THREE.Mesh(merged(geos), m);
    meshes.set(m, me);
    g.add(me);
  }

  // --- placement: lowest point on y = 0, centred on x and z (measured on vertices) -------
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

  // the walkable top at the asset's centre (x = z = 0 after the shift), cast down onto the cap
  g.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(
    V(0, box.max.y - box.min.y + 5, 0),
    V(0, -1, 0),
  ).intersectObject(meshes.get(LIME), false)[0];
  g.userData.top = hit ? Math.round(hit.point.y * 1000) / 1000 : null;
  return refineNature(THREE, g, "floating_isle");
}
