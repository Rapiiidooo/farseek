import { detailBatch } from "../prop-detail.js";

// crystal_emitter, arm B: profiles.
// The pedestal is one six-sided lathe, so it is hexagonal like the basalt
// columns of this world, and its profile carries everything: plinth, step, a
// shaft cut by three incised rings with a lit band at the floor of each, and a
// capital stepped out twice. A round bronze collar holds a lit dish. The three
// ribs are tubes swept along curves that swell out and close over the crystal,
// tapering into a lathe finial; the crystal is a six-sided lathe, a double
// point, with its facets shaded flat. parts.crystal turns about its own centre,
// which is userData.beam; parts.grooves is the lit rings and dish. Load with
// keepHierarchy to keep them.
export default function (THREE) {
  const g = new THREE.Group();

  // ---- materials --------------------------------------------------------------
  const mat = (color, name, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      metalness: 0,
      ...o,
    });
    if (name) m.name = name;
    return m;
  };
  const BASALT = mat(0x3a3531, "stone", { roughness: 0.84 });
  const NIGHT = mat(0x2a2830, "stone", { roughness: 0.92 });
  const BRONZE = mat(0x9a6a35, "metal", { roughness: 0.5, metalness: 0.6 });
  // Lit parts keep the dormant-crystal body and carry the ancient light as
  // emission, so the game can dim or raise them. Unnamed and just under opaque,
  // so the loader's procedural surfaces leave them alone.
  const lit = (intensity, o = {}) =>
    mat(0x1d5f63, null, {
      emissive: 0x39e3d0,
      emissiveIntensity: intensity,
      roughness: 0.3,
      metalness: 0.05,
      transparent: true,
      opacity: 0.94,
      ...o,
    });
  const CRYSTAL = lit(2.0, { roughness: 0.15, flatShading: true });
  const GLOW = lit(1.0);

  // ---- helpers --------------------------------------------------------------------
  const buckets = new Map();
  const add = (geo, m) => {
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(geo);
    return geo;
  };
  const merge = (geos) => {
    const flat = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    let n = 0;
    for (const x of flat) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2);
    let o = 0;
    for (const x of flat) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      uv.set(x.attributes.uv.array, o * 2);
      o += x.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return out;
  };
  // Profiles are [radius, height] and run bottom, side, top, so faces look out.
  const lathe = (pts, seg, phi = 0) =>
    new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
      phi,
    );
  // A six-segment lathe shades its hexagon round; flat normals make it faceted.
  const facets = (geo) => {
    const f = geo.toNonIndexed();
    f.computeVertexNormals();
    return f;
  };
  const HEX = Math.PI / 6; // a flat face towards +Z

  // ---- pedestal: radii are to the hexagon's corners (across flats = 1.732 r) --
  add(
    facets(
      lathe(
        [
          [0.001, 0],
          [0.577, 0],
          [0.577, 0.12],
          [0.55, 0.15],
          [0.001, 0.15],
        ],
        6,
        HEX,
      ),
    ),
    NIGHT,
  );
  const SH = 0.346,
    NOTCH = 0.035; // shaft 0.6 m across flats
  const RINGS = [
    [0.49, 0.54],
    [0.615, 0.665],
    [0.74, 0.79],
  ];
  const shaft = [];
  for (const [a, b] of RINGS)
    shaft.push([SH, a], [SH - NOTCH, a], [SH - NOTCH, b], [SH, b]);
  add(
    facets(
      lathe(
        [
          [0.001, 0.15],
          [0.5, 0.15],
          [0.5, 0.29],
          [0.47, 0.32],
          [SH, 0.32],
          ...shaft,
          [SH, 0.98],
          [0.41, 0.98],
          [0.41, 1.03],
          [0.462, 1.03],
          [0.462, 1.16],
          [0.43, 1.2],
          [0.001, 1.2],
        ],
        6,
        HEX,
      ),
    ),
    BASALT,
  );
  for (const [a, b] of RINGS) {
    add(
      facets(
        lathe(
          [
            [SH - NOTCH + 0.003, a + 0.007],
            [SH - NOTCH + 0.003, b - 0.007],
          ],
          6,
          HEX,
        ),
      ),
      GLOW,
    );
  }

  // ---- collar and the lit dish under the crystal --------------------------------
  add(
    lathe(
      [
        [0.25, 1.2],
        [0.345, 1.2],
        [0.35, 1.225],
        [0.335, 1.245],
        [0.3, 1.25],
        [0.262, 1.245],
        [0.25, 1.235],
        [0.25, 1.2],
      ],
      32,
    ),
    BRONZE,
  );
  add(
    lathe(
      [
        [0.252, 1.236],
        [0.14, 1.222],
        [0.001, 1.216],
      ],
      32,
    ),
    GLOW,
  );

  // ---- three ribs swept along curves, tapering towards the finial ---------------
  const ribPts = [
    [0.3, 1.2],
    [0.33, 1.3],
    [0.395, 1.47],
    [0.41, 1.66],
    [0.35, 1.84],
    [0.21, 1.965],
    [0.05, 2.02],
  ];
  for (const deg of [60, 180, 300]) {
    const a = (deg * Math.PI) / 180,
      ox = Math.sin(a),
      oz = Math.cos(a);
    const curve = new THREE.CatmullRomCurve3(
      ribPts.map(([s, y]) => new THREE.Vector3(ox * s, y, oz * s)),
      false,
      "centripetal",
    );
    const TS = 30,
      RS = 8;
    const tube = new THREE.TubeGeometry(curve, TS, 1, RS, false);
    const p = tube.attributes.position,
      c = new THREE.Vector3(),
      w = new THREE.Vector3();
    for (let i = 0; i <= TS; i++) {
      const t = i / TS,
        r = 0.042 + (0.026 - 0.042) * t;
      curve.getPointAt(t, c);
      for (let j = 0; j <= RS; j++) {
        const k = i * (RS + 1) + j;
        w.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
        p.setXYZ(k, w.x, w.y, w.z);
      }
    }
    add(tube, BRONZE);
    // a bell-shaped socket where the rib leaves the collar
    add(
      lathe(
        [
          [0.001, 1.24],
          [0.058, 1.24],
          [0.062, 1.27],
          [0.05, 1.3],
          [0.044, 1.315],
          [0.001, 1.315],
        ],
        14,
      ).translate(ox * 0.312, 0, oz * 0.312),
      BRONZE,
    );
  }
  add(
    lathe(
      [
        [0.001, 1.972],
        [0.075, 1.972],
        [0.1, 1.995],
        [0.1, 2.03],
        [0.078, 2.05],
        [0.03, 2.062],
        [0.024, 2.075],
        [0.036, 2.086],
        [0.001, 2.1],
      ],
      18,
    ),
    BRONZE,
  );

  // ---- merge the static parts --------------------------------------------------
  let grooves = null;
  for (const [m, geos] of buckets) {
    const mesh = new THREE.Mesh(merge(geos), m);
    g.add(mesh);
    if (m === GLOW) grooves = mesh;
  }

  // ---- crystal: its own mesh, centred on its own origin so it can spin -------
  const crystal = new THREE.Mesh(
    lathe(
      [
        [0.001, -0.3],
        [0.1, -0.16],
        [0.145, -0.02],
        [0.128, 0.12],
        [0.001, 0.3],
      ],
      6,
    ),
    CRYSTAL,
  );
  crystal.name = "crystal";
  crystal.position.set(0, 1.615, 0);
  g.add(crystal);

  const details = detailBatch(THREE, g);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const p = (r, y, offset = 0) => [
      Math.sin(a) * r + Math.cos(a) * offset,
      y,
      Math.cos(a) * r - Math.sin(a) * offset,
    ];
    details.line(
      NIGHT,
      [
        p(0.4005, 1.065, -0.16),
        p(0.4005, 1.085, -0.09),
        p(0.4005, 1.13, -0.06),
      ],
      0.0025,
    );
  }
  details.finish();

  // ---- place: base on y = 0, centred on x and z ----------------------------------
  const box3 = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mat4) => {
      for (let i = 0; i < p.count; i++)
        box3.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        put(m4.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    put(n.matrixWorld);
  });
  const c = box3.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= box3.min.y;
    o.position.z -= c.z;
  });

  const r3 = (x) => Math.round(x * 1000) / 1000;
  g.userData.parts = { crystal, grooves };
  g.userData.beam = [
    r3(crystal.position.x),
    r3(crystal.position.y),
    r3(crystal.position.z),
  ];
  return g;
}
