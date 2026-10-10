import { refineNature } from "../nature-detail.js";

// icicle_cluster, arm B: profiles.
// Each icicle is a six-segment lathe of a drawn profile (a root flaring into the crust, a
// quick taper, a ripple ring on the long ones, a slow run to the tip), then squeezed a little
// oval, twisted and bent, so no two look turned on one machine. A shorter lathe inside each
// root, turned half a segment, pushes its corners out through every face near the root: the
// deep-ice core. The crust is an eight-point section (flat top, straight back, bevelled front
// and underside) lofted along X, thicker over the roots, its front wandering, closing to a
// rounded point at each end. One pair is fused by a flattened root filling its fork, and one
// icicle is doubled by a spur hanging from a drip on its side.
// The lip is not part of the asset: the crust's top is the plane y = anchor[1] and its back
// the plane z = anchor[2]. Set the anchor on a ledge edge whose face drops away towards +Z.
export default function (THREE) {
  const g = new THREE.Group();
  g.userData.mounts = "top";

  const mat = (hex, rough) =>
    new THREE.MeshStandardMaterial({
      color: hex,
      roughness: rough,
      metalness: 0,
    });
  // Ice has no recipe in the contract's list, so these stay unnamed; the game gives ice its
  // gloss and translucency at load.
  const FROST = mat(0xe9f2f6, 0.85);
  const ICE = mat(0xa9d2e3, 0.35);
  const DEEP = mat(0x5b9bbd, 0.4);
  const bins = new Map([
    [FROST, []],
    [ICE, []],
    [DEEP, []],
  ]);
  const put = (m, geo) =>
    bins.get(m).push(geo.index ? geo.toNonIndexed() : geo);

  let seed = 9240926;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const D = Math.PI / 180;

  const ZB = -0.15; // the crust's back, flush with the rock face; its top is y = 0
  const Y0 = -0.075; // hidden tops of the icicles, inside the crust where it is deepest
  const YC = -0.15; // the crust's underside, where an icicle's length is measured from

  const ICICLES = [
    // x, length below the crust, radius at the crust, z nudge, twist (deg), profile
    [-1.03, 0.36, 0.058, 0.01, 18, "short"],
    [-0.845, 0.72, 0.085, -0.012, -22, "mid"],
    [-0.665, 0.48, 0.07, 0.014, 26, "short"],
    [-0.46, 1.02, 0.105, -0.004, -16, "long"],
    [-0.245, 0.62, 0.078, 0.012, 20, "mid"],
    [-0.06, 1.4, 0.12, 0, 14, "long"],
    [0.14, 0.9, 0.095, -0.01, -24, "mid"],
    [0.28, 0.55, 0.07, 0.012, 22, "short"],
    [0.475, 1.15, 0.11, 0.004, -18, "long"],
    [0.665, 0.42, 0.064, -0.012, 24, "short"],
    [0.845, 0.78, 0.086, 0.01, -20, "mid"],
    [1.035, 0.32, 0.052, -0.008, 16, "short"],
  ];

  // --- the crust: a loft of one section along X ------------------------------------------
  {
    const bulge = (x) =>
      ICICLES.reduce(
        (s, [ix, , r]) => s + 0.6 * r * Math.max(0, 1 - Math.abs(x - ix) / 0.1),
        0,
      );
    // lumps along the row, so the crust sags and swells like snow rather than a sawn board
    const section = (x, s) => {
      const T =
        0.11 +
        0.03 * Math.sin(x * 4.7 + 1.1) +
        0.02 * Math.sin(x * 11.3 + 0.4) +
        bulge(x);
      const zf =
        0.1 +
        0.035 * Math.sin(x * 3.9 + 0.4) +
        0.02 * Math.sin(x * 9.1) +
        0.3 * bulge(x);
      const droop = 0.025 * Math.max(0, Math.sin(x * 6.2 + 1));
      const j = () => (rnd() - 0.5) * 0.02;
      const P = [
        [ZB, 0],
        [zf - 0.07, -0.004 - droop * 0.4],
        [zf - 0.005, -0.04 - droop],
        [zf + 0.008 + j(), -0.5 * T - droop],
        [zf - 0.025, -0.84 * T + j()],
        [zf - 0.08, -T + j()],
        [ZB + 0.06, -0.92 * T + j()],
        [ZB, -0.62 * T],
      ];
      // towards the ends the section shrinks about its middle, top kept under y = 0
      const cz = (ZB + zf) / 2,
        cy = -T / 2;
      return P.map(([z, y]) => [cz + (z - cz) * s, cy + (y - cy) * s]);
    };
    const xs = [
      [-1.2, 0],
      [-1.165, 0.55],
      [-1.1, 0.86],
    ];
    for (let x = -1.02; x < 1.03; x += 0.08) xs.push([x, 1]);
    xs.push([1.1, 0.86], [1.165, 0.55], [1.2, 0]);
    const rings = xs.map(([x, s]) =>
      section(x, s).map(([z, y]) => new THREE.Vector3(x, y, z)),
    );
    const pos = [];
    const tri = (a, b, c) =>
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < rings.length - 1; i++) {
      const R0 = rings[i],
        R1 = rings[i + 1],
        n = R0.length;
      for (let k = 0; k < n; k++) {
        const a = R0[k],
          b = R1[k],
          c = R1[(k + 1) % n],
          d = R0[(k + 1) % n];
        tri(a, d, c);
        tri(a, c, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    put(FROST, geo);
  }

  // --- the icicles: lathes, then squeezed, twisted and bent -----------------------------
  const PROFILES = {
    // fraction of the length from the crust (t), radius as a fraction of the root radius
    long: [
      [1, 0],
      [0.88, 0.1],
      [0.72, 0.22],
      [0.58, 0.34],
      [0.51, 0.45],
      [0.44, 0.43],
      [0.3, 0.54],
      [0.15, 0.72],
      [0, 1],
    ],
    mid: [
      [1, 0],
      [0.78, 0.16],
      [0.56, 0.36],
      [0.32, 0.6],
      [0.14, 0.8],
      [0, 1],
    ],
    short: [
      [1, 0],
      [0.62, 0.3],
      [0.3, 0.62],
      [0, 1],
    ],
  };
  const fAt = (T, t) => {
    for (let i = 0; i < T.length - 1; i++) {
      const [t0, f0] = T[i],
        [t1, f1] = T[i + 1];
      if (t <= t0 && t >= t1) return f1 + ((f0 - f1) * (t - t1)) / (t0 - t1);
    }
    return 1;
  };
  // a warp shared by an icicle's shell and core, so the core stays half a segment round
  const makeWarp = (L, twistDeg) => {
    // the oval runs roughly along the row, so fat roots keep clear of the back plane
    const ovalAt = (rnd() - 0.5) * 0.8,
      tw = twistDeg * D;
    const bx = (rnd() - 0.5) * 0.06 * L,
      bz = (rnd() - 0.5) * 0.03 * L;
    return (lx, y, lz) => {
      const t = Math.max(0, (YC - y) / L);
      // oval: 1.12 along the direction ovalAt from +X, 0.92 across it
      const ca = Math.cos(ovalAt),
        sa = Math.sin(ovalAt);
      let u = lx * ca + lz * sa,
        w = -lx * sa + lz * ca;
      u *= 1.12;
      w *= 0.92;
      let x = u * ca - w * sa,
        z = u * sa + w * ca;
      const a = tw * t,
        c = Math.cos(a),
        s = Math.sin(a);
      [x, z] = [x * c + z * s, -x * s + z * c];
      return [x + bx * t * t, z + bz * t * t];
    };
  };
  const lathe = (m, prof, x, z, spin, warp, sx = 1, sz = 1) => {
    const geo = new THREE.LatheGeometry(
      prof.map(([r, y]) => new THREE.Vector2(r, y)),
      6,
      spin,
    );
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [wx, wz] = warp(p.getX(i) * sx, p.getY(i), p.getZ(i) * sz);
      p.setXYZ(i, x + wx, p.getY(i), z + wz);
    }
    put(m, geo);
  };
  // shell and core for one icicle; points run from the tip up so the faces look outwards
  const icicle = (x, z, L, r, twist, kind) => {
    const T = PROFILES[kind];
    const shell = T.map(([t, f]) => [f * r, YC - t * L]);
    shell.push([1.04 * r, Y0]);
    // the core stands proud of the faces' middles down to about a quarter of the length
    const k = (t) => 1.03 - 0.656 * t;
    const core = [
      [0, YC - 0.45 * L],
      ...[0.3, 0.15, 0].map((t) => [k(t) * fAt(T, t) * r, YC - t * L]),
      [1.06 * r, Y0],
    ];
    const spin = rnd() * (Math.PI / 3),
      warp = makeWarp(L, twist);
    lathe(ICE, shell, x, z, spin, warp);
    lathe(DEEP, core, x, z, spin + Math.PI / 6, warp);
  };
  const ZI = -0.02; // the icicles' line, about the middle of the crust's depth
  for (const [x, L, r, dz, tw, kind] of ICICLES)
    icicle(x, ZI + dz, L, r, tw, kind);

  // the split pair: a flattened root fills the fork between the icicles at 0.14 and 0.28
  {
    const r = 0.085,
      x = 0.212,
      L = 0.2;
    const flat = (lx, y, lz) => [lx, lz];
    const root = [
      [0, YC - L],
      [0.5 * r, YC - 0.66 * L],
      [0.86 * r, YC - 0.28 * L],
      [r, YC],
      [1.04 * r, Y0],
    ];
    lathe(ICE, root, x, ZI, 0.2, flat, 1.45, 0.9);
    const core = [
      [0, YC - 0.55 * L],
      [0.8 * r, YC - 0.14 * L],
      [1.03 * r, YC],
      [1.06 * r, Y0],
    ];
    lathe(DEEP, core, x, ZI, 0.2 + Math.PI / 6, flat, 1.45, 0.9);
  }
  // the doubled one: a drip bulging on the side of the icicle at -0.46, a spur hanging from it
  {
    const x = -0.46 + 0.052,
      y = YC - 0.36,
      rb = 0.042;
    const flat = (lx, yy, lz) => [lx, lz];
    const bulb = [
      [0, y - 1.7 * rb],
      [0.55 * rb, y - 1.15 * rb],
      [0.95 * rb, y - 0.3 * rb],
      [0.8 * rb, y + 0.7 * rb],
      [0.35 * rb, y + 1.5 * rb],
      [0, y + 1.8 * rb],
    ];
    lathe(ICE, bulb, x, ZI, 0.4, flat);
    const Ls = 0.34,
      rs = 0.034,
      y0 = y - 0.3 * rb;
    const spur = [
      [0, y0 - Ls],
      [0.3 * rs, y0 - 0.65 * Ls],
      [0.66 * rs, y0 - 0.3 * Ls],
      [rs, y0],
    ];
    lathe(ICE, spur, x + 0.004, ZI, 0.1, flat);
  }

  // --- merge per material, faceted, with UVs projected over each merged box ---------------
  const A = new THREE.Vector3(),
    B = new THREE.Vector3(),
    C = new THREE.Vector3();
  const E1 = new THREE.Vector3(),
    E2 = new THREE.Vector3();
  for (const [m, geos] of bins) {
    const P = [];
    for (const geo of geos) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        A.fromBufferAttribute(p, i);
        B.fromBufferAttribute(p, i + 1);
        C.fromBufferAttribute(p, i + 2);
        if (E1.subVectors(B, A).cross(E2.subVectors(C, A)).lengthSq() < 1e-14)
          continue;
        P.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
      }
    }
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i++) {
      lo[i % 3] = Math.min(lo[i % 3], P[i]);
      hi[i % 3] = Math.max(hi[i % 3], P[i]);
    }
    const su = Math.max(hi[0] - lo[0], hi[2] - lo[2]) || 1,
      sv = hi[1] - lo[1] || 1;
    const UV = [];
    for (let t = 0; t < P.length; t += 9) {
      A.fromArray(P, t);
      B.fromArray(P, t + 3);
      C.fromArray(P, t + 6);
      E1.subVectors(B, A).cross(E2.subVectors(C, A));
      const fx = Math.abs(E1.x),
        fy = Math.abs(E1.y),
        fz = Math.abs(E1.z);
      for (const q of [A, B, C]) {
        const x = q.x - lo[0],
          y = q.y - lo[1],
          z = q.z - lo[2];
        const [u, v] =
          fy >= fx && fy >= fz ? [x, z] : fx >= fz ? [z, y] : [x, y];
        UV.push(u / su, v / sv);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, m));
  }

  // --- placement: lowest tip on y = 0, centred on x and z (measured on vertices) ----------
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

  // the middle of the crust's top edge on the rock side, after the shift: put this on the lip
  const r3 = (x) => Math.round(x * 1000) / 1000;
  g.userData.anchor = [r3(0 - c.x), r3(0 - box.min.y), r3(ZB - c.z)];
  return refineNature(THREE, g, "icicle_cluster");
}
