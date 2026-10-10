import { refineNature } from "../nature-detail.js";

// ice_spire: five chamfered ice crystals leaning out of a frost-slate mound under snow.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (hex, rough, name) => {
    const m = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: rough,
      metalness: 0,
    });
    if (name) m.name = name;
    return m;
  };
  // Ice has no recipe in the contract's list, so its materials stay unnamed; the game gives
  // ice its gloss and translucency at load.
  const ICE = mat(0xa9d2e3, 0.35);
  const DEEP = mat(0x5b9bbd, 0.4);
  const FROST = mat(0xe9f2f6, 0.85);
  const SLATE = mat(0x3d4654, 0.9, "stone");

  const add = (geo, m) => {
    const mesh = new THREE.Mesh(geo, m);
    g.add(mesh);
    return mesh;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  const D = Math.PI / 180;

  // --- the mound -------------------------------------------------------------------------
  // A sphere cap with base radius rb and height h standing on y = 0. A cap meets the ground
  // at a slope, where a squashed hemisphere stands up like a puck.
  const cap = (rb, h, theta, ws, hs, phi = 0) => {
    const geo = new THREE.SphereGeometry(1, ws, hs, phi, Math.PI * 2, 0, theta);
    geo.translate(0, -Math.cos(theta), 0);
    geo.scale(
      rb / Math.sin(theta),
      h / (1 - Math.cos(theta)),
      rb / Math.sin(theta),
    );
    return geo;
  };
  const capY = (rb, h, theta, rho) => {
    const s = (rho * Math.sin(theta)) / rb;
    return s >= 1
      ? 0
      : Math.max(
          0,
          ((Math.sqrt(1 - s * s) - Math.cos(theta)) * h) /
            (1 - Math.cos(theta)),
        );
  };
  const HX = 0.08,
    HZ = -0.06;
  const surface = (x, z) =>
    Math.max(
      capY(1.3, 0.34, 1.0, Math.hypot(x, z)),
      capY(0.86, 0.62, 1.2, Math.hypot(x - HX, z - HZ)),
    );
  const course = add(cap(1.3, 0.34, 1.0, 12, 3), SLATE);
  const hump = cap(0.86, 0.62, 1.2, 10, 3, 0.3);
  hump.translate(HX, 0, HZ);
  const crown = add(hump, SLATE);
  for (const [az, rho, r, sy, spin, dusted] of [
    [20, 1.0, 0.3, 0.62, 0.4, true],
    [95, 1.04, 0.26, 0.7, 1.3, false],
    [160, 0.97, 0.33, 0.6, 2.2, true],
    [230, 1.03, 0.27, 0.66, 0.9, false],
    [290, 0.99, 0.3, 0.58, 1.8, true],
    [335, 1.08, 0.21, 0.7, 2.7, false],
  ]) {
    const x = Math.sin(az * D) * rho,
      z = Math.cos(az * D) * rho;
    const lift = surface(x, z) * 0.7;
    const place = (geo) => {
      geo.rotateY(spin);
      geo.translate(x, lift, z);
      return geo;
    };
    const b = new THREE.DodecahedronGeometry(r, 0);
    b.rotateX(0.35);
    b.scale(1, sy, 1);
    add(place(b), SLATE);
    if (dusted) {
      const s = new THREE.DodecahedronGeometry(r, 0);
      s.rotateX(0.35);
      s.scale(0.84, sy * 0.6, 0.84);
      s.translate(0, r * sy * 0.43, 0);
      add(place(s), FROST);
    }
  }

  // --- hand-built triangles, one list per material ----------------------------------------
  const soups = new Map([
    [ICE, []],
    [DEEP, []],
    [FROST, []],
  ]);
  const e1 = V(0, 0, 0),
    e2 = V(0, 0, 0);
  const normal = (a, b, c) =>
    V(0, 0, 0)
      .subVectors(b, a)
      .cross(V(0, 0, 0).subVectors(c, a));
  const tri = (m, a, b, c, out) => {
    e1.subVectors(b, a).cross(e2.subVectors(c, a));
    if (e1.lengthSq() < 1e-12) return;
    if (e1.dot(out) < 0) [b, c] = [c, b];
    soups.get(m).push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  // Snow over the mound: a skin over the rock whose thickness turns negative outside a ragged
  // outline, so the rock shows round the rim and the edge has no visible wall.
  {
    const ray = new THREE.Raycaster();
    g.updateMatrixWorld(true);
    const rockAt = (x, z) => {
      ray.set(V(x, 3, z), V(0, -1, 0));
      const hit = ray.intersectObjects([course, crown], false)[0];
      return hit ? hit.point.y : 0;
    };
    const NA = 16,
      RINGS = [0, 0.35, 0.68, 0.95, 1.15, 1.28];
    const pts = RINGS.map((rho) =>
      Array.from({ length: rho ? NA : 1 }, (_, j) => {
        const phi = (j / NA) * Math.PI * 2 + rho * 0.4;
        const x = Math.sin(phi) * rho,
          z = Math.cos(phi) * rho;
        const edge =
          1.04 +
          0.09 * Math.sin(3 * phi + 0.5) +
          0.06 * Math.sin(5 * phi + 1.7) +
          0.04 * Math.sin(8 * phi + 0.3);
        return V(x, rockAt(x, z) + 0.042 * (1 - (rho / edge) ** 3) - 0.007, z);
      }),
    );
    for (let i = 0; i < RINGS.length - 1; i++) {
      const A = pts[i],
        B = pts[i + 1];
      for (let j = 0; j < NA; j++) {
        const k = (j + 1) % NA;
        if (A.length === 1) {
          tri(FROST, A[0], B[j], B[k], UP);
          continue;
        }
        tri(FROST, A[j], B[j], B[k], UP);
        tri(FROST, A[j], B[k], A[k], UP);
      }
    }
  }

  // --- the crystals ----------------------------------------------------------------------
  // az is the lean direction measured from +Z towards +X; top is the apex height; skew moves
  // the apex off the axis, [degrees from the lean, fraction of the top radius].
  const crystal = ({
    rho,
    baseAz,
    az,
    tilt,
    top,
    r,
    tipLen,
    taper = 0.9,
    sink = 0.28,
    skew = [0, 0],
  }) => {
    const a = az * D,
      t = tilt * D;
    const dir = V(
      Math.sin(t) * Math.sin(a),
      Math.cos(t),
      Math.sin(t) * Math.cos(a),
    );
    const bx = Math.sin(baseAz * D) * rho,
      bz = Math.cos(baseAz * D) * rho;
    const base = V(bx, surface(bx, bz) - sink, bz);
    const len = (top - base.y) / Math.cos(t),
      shaft = len - tipLen,
      rt = r * taper;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const lean = V(Math.sin(a), 0, Math.cos(a));
    const world = (p) => p.applyQuaternion(q).add(base);
    const axis = (y) => base.clone().addScaledVector(dir, y);
    const radius = (y) => r + ((rt - r) * y) / shaft;
    const corners = (y, R, turn = 0) =>
      Array.from({ length: 6 }, (_, k) =>
        V(
          Math.sin(a + turn + (k * Math.PI) / 3) * R,
          y,
          Math.cos(a + turn + (k * Math.PI) / 3) * R,
        ),
      );
    // a hexagon whose corners are cut back, so every edge carries a narrow bevel facet
    const ring = (y, R) => {
      const C = corners(y, R);
      return C.flatMap((c, k) => [
        c.clone().lerp(C[(k + 5) % 6], 0.12),
        c.clone().lerp(C[(k + 1) % 6], 0.12),
      ]).map(world);
    };
    const facing = (n) => {
      const h = V(n.x, 0, n.z);
      return h.lengthSq() > 1e-8 ? h.normalize().dot(lean) : 0;
    };
    const R = [
      ring(0, r),
      ring(shaft * 0.5, radius(shaft * 0.5) * (1 + 0.03 * Math.sin(top * 17))),
      ring(shaft, rt),
    ];
    for (let i = 0; i < R.length - 1; i++) {
      const out = axis((shaft * (i + 0.5)) / (R.length - 1));
      for (let v = 0; v < 12; v++) {
        const w = (v + 1) % 12;
        const [p0, p1, p2, p3] = [R[i][v], R[i][w], R[i + 1][w], R[i + 1][v]];
        const hint = p0.clone().add(p2).multiplyScalar(0.5).sub(out);
        // the faces looking down the lean are deep ice
        const m = facing(hint) > 0.55 ? DEEP : ICE;
        tri(m, p0, p1, p2, hint);
        tri(m, p0, p2, p3, hint);
      }
    }
    const [sa, sk] = skew;
    const apex = world(
      V(
        Math.sin(a + sa * D) * rt * sk,
        shaft + tipLen,
        Math.cos(a + sa * D) * rt * sk,
      ),
    );
    const T = R.at(-1);
    const faces = T.map((p, v) => {
      const p1 = T[(v + 1) % 12];
      const n = normal(p, p1, apex);
      const centroid = p
        .clone()
        .add(p1)
        .add(apex)
        .multiplyScalar(1 / 3);
      const hint = centroid.clone().sub(axis(shaft + tipLen * 0.3));
      if (n.dot(hint) < 0) n.negate();
      return { p, p1, n: n.normalize(), hint, main: v % 2 === 1 };
    });
    const tops = faces
      .filter((f) => f.main)
      .map((f) => f.n.y)
      .sort((x, y) => y - x);
    for (const f of faces) {
      const m =
        f.n.y >= tops[1] - 0.01 ? FROST : facing(f.n) > 0.55 ? DEEP : ICE;
      tri(m, f.p, f.p1, apex, f.hint);
    }
    // a darker core whose corners break through the faces near the root
    const C = [
      corners(0, r, Math.PI / 6),
      corners(shaft * 0.6, radius(shaft * 0.6) * 0.8, Math.PI / 6),
    ].map((pts) => pts.map(world));
    for (let v = 0; v < 6; v++) {
      const w = (v + 1) % 6,
        hint = C[0][v]
          .clone()
          .add(C[1][w])
          .multiplyScalar(0.5)
          .sub(axis(shaft * 0.3));
      tri(DEEP, C[0][v], C[0][w], C[1][w], hint);
      tri(DEEP, C[0][v], C[1][w], C[1][v], hint);
    }
    // a drift banked round the root, hugging the crystal above the snow
    let s = 0;
    while (s < shaft && axis(s).y < surface(axis(s).x, axis(s).z)) s += 0.01;
    const hug = ring(s + 0.12 + r * 0.25, radius(s + 0.12 + r * 0.25) * 1.06);
    const foot = axis(s);
    const spread = hug.map((p, v) => {
      const h = V(p.x - foot.x, 0, p.z - foot.z).normalize();
      const k = 1.55 + 0.35 * Math.sin(v * 2.1 + top * 3);
      const x = foot.x + h.x * r * k,
        z = foot.z + h.z * r * k;
      return V(x, surface(x, z) - 0.1, z);
    });
    for (let v = 0; v < 12; v++) {
      const w = (v + 1) % 12;
      const hint = hug[v].clone().add(spread[w]).multiplyScalar(0.5).sub(foot);
      tri(FROST, hug[v], hug[w], spread[w], hint);
      tri(FROST, hug[v], spread[w], spread[v], hint);
    }
  };

  crystal({
    rho: 0.06,
    baseAz: 200,
    az: 200,
    tilt: 5,
    top: 4.0,
    r: 0.44,
    tipLen: 1.0,
    sink: 0.35,
    skew: [150, 0.32],
  });
  crystal({
    rho: 0.46,
    baseAz: 60,
    az: 60,
    tilt: 21,
    top: 2.85,
    r: 0.31,
    tipLen: 0.7,
    skew: [-70, 0.4],
  });
  crystal({
    rho: 0.46,
    baseAz: 218,
    az: 222,
    tilt: 17,
    top: 2.7,
    r: 0.3,
    tipLen: 0.68,
    skew: [100, 0.36],
  });
  crystal({
    rho: 0.62,
    baseAz: 142,
    az: 148,
    tilt: 36,
    top: 1.45,
    r: 0.27,
    tipLen: 0.5,
    taper: 0.94,
    skew: [-120, 0.3],
  });
  crystal({
    rho: 0.6,
    baseAz: 305,
    az: 300,
    tilt: 31,
    top: 1.35,
    r: 0.28,
    tipLen: 0.5,
    taper: 0.94,
    skew: [60, 0.34],
  });

  for (const [m, P] of soups) {
    const UV = [];
    for (let i = 0; i < P.length; i += 3)
      UV.push(P[i] * 0.5 + P[i + 2] * 0.25, P[i + 1] * 0.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
    add(geo, m);
  }

  // --- flat facets -----------------------------------------------------------------------
  // Sphere normals are smooth around the revolution and would shade a facet round;
  // de-indexing and recomputing gives every facet its own normal. Degenerate triangles
  // (sphere poles) are dropped so every vertex carries a real facet normal.
  const a0 = new THREE.Vector3(),
    b0 = new THREE.Vector3(),
    c0 = new THREE.Vector3();
  for (const m of g.children) {
    const flat = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const p = flat.attributes.position,
      uv = flat.attributes.uv,
      P = [],
      U = [];
    for (let i = 0; i < p.count; i += 3) {
      a0.fromBufferAttribute(p, i);
      b0.fromBufferAttribute(p, i + 1);
      c0.fromBufferAttribute(p, i + 2);
      if (b0.sub(a0).cross(c0.sub(a0)).lengthSq() < 1e-12) continue;
      for (let j = i; j < i + 3; j++) {
        P.push(p.getX(j), Math.max(0, p.getY(j)), p.getZ(j));
        U.push(uv.getX(j), uv.getY(j));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    geo.computeVertexNormals();
    m.geometry = geo;
  }

  // --- place: base on y = 0, centred on x and z ------------------------------------------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    mm = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mat4) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        put(mm.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    put(n.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box.min.y;
    o.position.z -= c.z;
  });
  return refineNature(THREE, g, "ice_spire");
}
