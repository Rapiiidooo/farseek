import { refineNature } from "../nature-detail.js";

// glow_mushroom, arm B: profiles.
// Four mushrooms, 1.4, 1.0, 0.6 and 0.35 m tall, on a mossy root knob about
// 0.8 m across. The knob is one lathe whose foot swells into six low, rounded
// root flares of different reach; a hand-built moss blanket with a ragged edge
// lies over its crown. Each stem is a lathe profile (a bulb at the foot, a long
// taper, a small flare under the cap) bent along a curve, so it leans out and
// turns back up. Each cap is a lathe from the lip over the drooping rim to the
// top, with lathed spots. Under it the gills are a lathed gill surface whose
// edge shows as a band below the rim, and hand-built fins with a curved lower
// edge; all of them are one spore lime mesh, userData.parts.glow. A second UV
// set carries one gill per stripe of a shared emissive map, out of reach of the
// loader's rescaling of the first, so the underside glows in radial lamellae.
const stripeMaps = new WeakMap();

function gillStripes(THREE) {
  if (!stripeMaps.has(THREE)) {
    const width = 64,
      data = new Uint8Array(width * 4 * 4);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < width; x++) {
        const gap = Math.pow(
          0.5 + 0.5 * Math.cos(((x + 0.5) / width) * Math.PI * 2),
          5,
        );
        const value = Math.round(255 * (1 - 0.55 * gap));
        data.set([value, value, value, 255], (y * width + x) * 4);
      }
    const map = new THREE.DataTexture(data, width, 4);
    map.channel = 1;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.userData.sharedAssetFinish = true;
    map.needsUpdate = true;
    stripeMaps.set(THREE, map);
  }
  return stripeMaps.get(THREE);
}

export default function (THREE) {
  const g = new THREE.Group();

  // ---- materials ----------------------------------------------------------------
  const mat = (color, roughness, name, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      ...extra,
    });
    m.name = name;
    return m;
  };
  const BARK = mat(0x5a4030, 0.9, "timber"); // the root knob
  const CAP = mat(0x5a4030, 0.62, "foliage", { side: THREE.DoubleSide }); // open underneath
  const FLESH = mat(0xe6d3ae, 0.78, "foliage"); // stems and spots
  const MOSS = mat(0x4f7a3a, 0.97, "foliage");
  // Spore lime is emission only. The base colour is fern green, so the gills
  // still read as gills if the game dims the glow to nothing.
  const GILL = mat(0x7da04a, 0.55, "foliage", {
    emissive: 0xc3f25a,
    emissiveIntensity: 1.15,
    emissiveMap: gillStripes(THREE),
    side: THREE.DoubleSide,
  });

  // ---- helpers --------------------------------------------------------------------
  const buckets = new Map();
  const add = (geo, m) => {
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(geo);
    return geo;
  };
  const merge = (geos) => {
    const flat = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    const second = flat.every((x) => x.attributes.uv1);
    let n = 0;
    for (const x of flat) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2),
      uv1 = second ? new Float32Array(n * 2) : null;
    let o = 0;
    for (const x of flat) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      uv.set(x.attributes.uv.array, o * 2);
      if (second) uv1.set(x.attributes.uv1.array, o * 2);
      o += x.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    if (second) out.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
    return out;
  };
  const UP = new THREE.Vector3(0, 1, 0);
  const TAU = Math.PI * 2;
  const rad = (d) => (d * Math.PI) / 180;
  const lathe = (pts, seg) =>
    new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
    );
  // smooth normals with the seam and pole duplicates of a lathe averaged together
  const weldNormals = (geo) => {
    geo.computeVertexNormals();
    const p = geo.attributes.position,
      n = geo.attributes.normal,
      sum = new Map();
    const key = (i) =>
      `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    for (let i = 0; i < p.count; i++) {
      const k = key(i),
        s = sum.get(k) || new THREE.Vector3();
      sum.set(k, s.add(new THREE.Vector3().fromBufferAttribute(n, i)));
    }
    for (let i = 0; i < p.count; i++) {
      const s = sum.get(key(i)).clone().normalize();
      n.setXYZ(i, s.x, s.y, s.z);
    }
    return geo;
  };
  const tilt = (az, lean) =>
    new THREE.Vector3(
      Math.sin(rad(az)) * Math.sin(rad(lean)),
      Math.cos(rad(lean)),
      Math.cos(rad(az)) * Math.sin(rad(lean)),
    );
  const qUp = (dir) =>
    new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const onto = (geo, pos, quat) =>
    geo.applyMatrix4(
      new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1)),
    );

  // ---- the root knob: a lathe mound, its foot swelling into low root flares ------
  const KH = 0.2,
    KR = 0.3;
  const knobAt = (rho) =>
    rho >= KR ? 0 : KH * Math.pow(1 - (rho / KR) ** 2, 0.7);
  const ROOTS = [
    [0.35, 1],
    [1.4, 0.72],
    [2.3, 0.95],
    [3.3, 0.68],
    [4.25, 1],
    [5.3, 0.8],
  ]; // [azimuth, reach]
  const lobe = (phi) => {
    let s = 0;
    for (const [p, k] of ROOTS) {
      let d = Math.abs(phi - p) % TAU;
      if (d > Math.PI) d = TAU - d;
      if (d < 0.62)
        s = Math.max(s, k * Math.cos((d / 0.62) * (Math.PI / 2)) ** 2); // a broad rounded swell, no cusp
    }
    return s;
  };
  // the flares die out well below the crown, so the knob stays a mound
  const flare = (y) => 0.32 * Math.max(0, 1 - y / 0.15) ** 2;
  const swell = (phi, y) =>
    1 +
    flare(y) * lobe(phi) +
    0.06 * Math.sin(3 * phi + 0.8) * Math.min(1, y / 0.08);
  {
    const geo = lathe(
      [0.3, 0.288, 0.26, 0.21, 0.13, 0.001].map((r) => [r, knobAt(r)]),
      30,
    );
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        k = swell(Math.atan2(x, z), y);
      p.setXYZ(i, x * k, y, z * k);
    }
    add(weldNormals(geo), BARK);
  }
  // height of the knob's crown at a point (the swell there is small)
  const crownY = (x, z) =>
    knobAt(Math.hypot(x, z) / swell(Math.atan2(x, z), 0.15));

  // moss: a polar grid lying 2.5 cm over the crown, its edge wandering in and
  // out, and a last ring that turns down into the knob so the mat shows its edge
  {
    const COLS = 28,
      ROWS = 3;
    const edge = (phi) =>
      0.235 *
      (1 +
        0.13 * Math.sin(4 * phi + 0.7) +
        0.07 * Math.sin(7 * phi + 2.1) +
        0.04 * Math.sin(11 * phi));
    const pos = [],
      uv = [],
      idx = [];
    for (let i = 0; i <= ROWS + 1; i++) {
      for (let j = 0; j <= COLS; j++) {
        const phi = (j / COLS) * TAU,
          u = Math.min(1, i / ROWS),
          rho = Math.max(0.001, u * edge(phi)) * (i > ROWS ? 1.03 : 1);
        const x = Math.sin(phi) * rho,
          z = Math.cos(phi) * rho;
        pos.push(
          x,
          Math.max(
            0.004,
            crownY(x, z) + (i > ROWS ? -0.03 : 0.026 * (1 - 0.6 * u ** 3)),
          ),
          z,
        );
        uv.push(j / COLS, i / (ROWS + 1));
      }
    }
    for (let i = 0; i < ROWS + 1; i++) {
      for (let j = 0; j < COLS; j++) {
        const a = i * (COLS + 1) + j,
          b = a + COLS + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    add(weldNormals(geo), MOSS);
  }

  // ---- mushrooms --------------------------------------------------------------------
  // base x, z on the crown; lean azimuth (deg from +z toward +x); lean at the foot
  // and at the top (the stem curves back up between them); the cap nods further;
  // H is the top of the cap above the ground; fy deepens or flattens the cap
  const SHROOMS = [
    {
      x: -0.05,
      z: -0.06,
      az: 250,
      l0: 12,
      l1: 4,
      nod: 3,
      H: 1.4,
      R: 0.36,
      fy: 0.85,
      rt: 0.041,
      seg: 21,
      fins: 32,
      spots: 5,
    },
    {
      x: 0.14,
      z: -0.08,
      az: 118,
      l0: 26,
      l1: 12,
      nod: 5,
      H: 1.0,
      R: 0.27,
      fy: 0.95,
      rt: 0.033,
      seg: 18,
      fins: 24,
      spots: 3,
    },
    {
      x: -0.11,
      z: 0.12,
      az: 328,
      l0: 36,
      l1: 20,
      nod: 7,
      H: 0.6,
      R: 0.18,
      fy: 1.05,
      rt: 0.025,
      seg: 14,
      fins: 16,
      spots: 3,
    },
    {
      x: 0.12,
      z: 0.12,
      az: 38,
      l0: 46,
      l1: 28,
      nod: 8,
      H: 0.35,
      R: 0.12,
      fy: 1.15,
      rt: 0.018,
      seg: 12,
      fins: 12,
      spots: 2,
    },
  ];
  // the cap, from the underside of the lip round the rim and over the top to the
  // apex (so the lathe faces outward); r in R, y in R * fy, apex at the origin
  const CAP_PROFILE = [
    [0.88, -0.585],
    [0.955, -0.595],
    [0.995, -0.54],
    [0.962, -0.42],
    [0.872, -0.31],
    [0.72, -0.2],
    [0.5, -0.09],
    [0.25, -0.022],
    [0.001, 0],
  ];
  // the gill surface under it, from inside the stem out to an edge just below the lip
  const GILL_PROFILE = [
    [0.1, -0.3],
    [0.3, -0.4],
    [0.55, -0.46],
    [0.78, -0.54],
    [0.94, -0.69],
  ];
  const gillAt = (r) => {
    const P = GILL_PROFILE;
    for (let i = 1; i < P.length; i++)
      if (r <= P[i][0])
        return (
          P[i - 1][1] +
          ((r - P[i - 1][0]) / (P[i][0] - P[i - 1][0])) *
            (P[i][1] - P[i - 1][1])
        );
    return P[P.length - 1][1];
  };
  const JOIN = -0.22; // where the stem ends inside the cap, above the gills, in R * fy
  const gills = [];

  for (const s of SHROOMS) {
    const { R, fy, rt, seg } = s;
    const d0 = tilt(s.az, s.l0),
      d1 = tilt(s.az, s.l1),
      capAxis = tilt(s.az, s.l1 + s.nod);
    const cq = qUp(capAxis);
    const P0 = new THREE.Vector3(s.x, crownY(s.x, s.z) - 0.035, s.z);

    // cap, spots and gills in the cap frame
    const capGeo = lathe(
      CAP_PROFILE.map(([r, y]) => [r * R, y * R * fy]),
      seg,
    );
    const capPosition = capGeo.attributes.position;
    for (let i = 0; i < capPosition.count; i++) {
      const x = capPosition.getX(i),
        y = capPosition.getY(i),
        z = capPosition.getZ(i);
      const a = Math.atan2(x, z),
        rim = Math.min(1, Math.hypot(x, z) / R);
      const wave =
        Math.sin(a * 5 + s.az) +
        0.6 * Math.sin(a * 3 + 1.7 + s.az * 0.5) +
        0.3 * Math.sin(a * 8 + 0.4);
      const scallop = 1 - 0.018 * rim * rim * (1.9 + wave);
      capPosition.setXYZ(
        i,
        x * scallop,
        y + 0.014 * R * rim * rim * wave,
        z * scallop,
      );
    }
    const spots = [];
    for (let i = 0; i < s.spots; i++) {
      // walk the top of the profile from near the apex toward the shoulder
      const u = 0.2 + (0.6 * (i + 0.5)) / s.spots,
        f = u * 5,
        k = Math.min(7, Math.floor(f)),
        w = f - k;
      const [ra, ya] = CAP_PROFILE[8 - k],
        [rb, yb] = CAP_PROFILE[Math.max(0, 7 - k)];
      const r = (ra + (rb - ra) * w) * R,
        y = (ya + (yb - ya) * w) * R * fy;
      const nr = -(yb - ya) * fy,
        ny = rb - ra,
        nl = Math.hypot(nr, ny);
      const a = i * 2.4 + s.az * 0.03;
      const n = new THREE.Vector3(
        Math.sin(a) * (nr / nl),
        ny / nl,
        Math.cos(a) * (nr / nl),
      ).normalize();
      const sr = R * (0.155 - 0.018 * i);
      const geo = weldNormals(
        lathe(
          [
            [sr, -sr * 0.06],
            [sr * 0.72, sr * 0.24],
            [0.001, sr * 0.34],
          ],
          7,
        )
          .scale(1.2, 1, 0.85)
          .rotateY(i * 1.3),
      );
      spots.push(
        onto(
          geo,
          new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r),
          qUp(n),
        ),
      );
    }
    const gillSurface = lathe(
      GILL_PROFILE.map(([r, y]) => [r * R, y * R * fy]),
      Math.max(8, seg - 4),
    );
    {
      const uv = gillSurface.attributes.uv,
        lines = Math.round(R * 122),
        uv1 = [];
      for (let i = 0; i < uv.count; i++)
        uv1.push(uv.getX(i) * lines, uv.getY(i));
      gillSurface.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
    }
    const gillGeos = [gillSurface];
    // fins, long and short in turn: the top edge bedded just above the gill
    // surface, the lower edge deepest mid-way and still a little deep at the rim
    const D = 0.11 * R * fy;
    for (let i = 0; i < s.fins; i++) {
      const long = i % 2 === 0,
        r0 = long ? rt / R + 0.03 : 0.5,
        r1 = 0.91,
        n = long ? 3 : 2;
      const a = (i / s.fins) * TAU + 0.1,
        sa = Math.sin(a),
        ca = Math.cos(a);
      const pos = [],
        uv = [],
        idx = [];
      for (let j = 0; j <= n; j++) {
        const u = j / n,
          r = r0 + (r1 - r0) * u,
          y = gillAt(r) * R * fy;
        const depth =
          D *
          (long ? 1 : 0.8) *
          (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
        pos.push(
          sa * r * R,
          y + 0.012 * R,
          ca * r * R,
          sa * r * R,
          y - depth,
          ca * r * R,
        );
        uv.push(u, 1, u, 0);
        if (j < n)
          idx.push(
            2 * j,
            2 * j + 1,
            2 * j + 2,
            2 * j + 1,
            2 * j + 3,
            2 * j + 2,
          );
      }
      const fin = new THREE.BufferGeometry();
      fin.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      fin.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      fin.setAttribute(
        "uv1",
        new THREE.Float32BufferAttribute(
          uv.map((value, k) => (k % 2 ? value : 0.5)),
          2,
        ),
      );
      fin.setIndex(idx);
      fin.computeVertexNormals();
      gillGeos.push(fin);
    }

    // stand the cap so its highest point, spots included, is exactly H
    let top = -Infinity;
    const v = new THREE.Vector3();
    for (const geo of [capGeo, ...spots]) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++)
        top = Math.max(top, v.fromBufferAttribute(p, i).applyQuaternion(cq).y);
    }
    const joinY = JOIN * R * fy,
      c = 0.45 * d0.y + 0.55 * d1.y;
    const L = (s.H - top + capAxis.y * joinY - P0.y) / c;
    const P1 = P0.clone().addScaledVector(d0, 0.45 * L),
      P2 = P1.clone().addScaledVector(d1, 0.55 * L);
    const capO = P2.clone().addScaledVector(capAxis, -joinY);
    add(onto(weldNormals(capGeo), capO, cq), CAP);
    for (const geo of spots) add(onto(geo, capO, cq), FLESH);
    for (const geo of gillGeos) gills.push(onto(geo, capO, cq));

    // the stem: a lathe profile along the curve P0 -> P1 -> P2, thick and bulbous
    // at the foot (buried 3.5 cm in the knob), tapering, flaring a little at the cap
    const rows = [0, 0.03, 0.08, 0.16, 0.3, 0.55, 0.85, 1];
    const radius = (y) =>
      rt *
      (1 +
        0.85 * Math.exp(-Math.max(0, y - 0.035) / (3.2 * rt)) +
        0.3 * Math.exp(-(((y - 0.035 - 0.9 * rt) / (1.3 * rt)) ** 2)) +
        0.14 * Math.max(0, (y - (L - 3 * rt)) / (3 * rt)) ** 2);
    const stem = lathe(
      rows.map((t) => [radius(t * L), t * L]),
      s.l0 > 30 ? 7 : 9,
    );
    const bn = new THREE.Vector3(Math.sin(rad(s.az)), 0, Math.cos(rad(s.az)))
      .cross(UP)
      .normalize();
    const p = stem.attributes.position,
      C = new THREE.Vector3(),
      T = new THREE.Vector3(),
      N = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / L,
        x = p.getX(i),
        z = p.getZ(i);
      C.copy(P0)
        .multiplyScalar((1 - t) ** 2)
        .addScaledVector(P1, 2 * (1 - t) * t)
        .addScaledVector(P2, t * t);
      T.copy(P1)
        .sub(P0)
        .multiplyScalar(2 * (1 - t))
        .addScaledVector(P2.clone().sub(P1), 2 * t)
        .normalize();
      N.crossVectors(T, bn);
      C.addScaledVector(N, x).addScaledVector(bn, z);
      p.setXYZ(i, C.x, C.y, C.z);
    }
    add(weldNormals(stem), FLESH);
  }

  // ---- meshes: one per material; the gills are their own mesh -------------------------
  for (const [m, geos] of buckets) g.add(new THREE.Mesh(merge(geos), m));
  const glow = new THREE.Mesh(merge(gills), GILL);
  glow.name = "glow";
  g.add(glow);

  // ---- place: base on y = 0, centred on x and z ---------------------------------------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
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
        put(m.multiplyMatrices(n.matrixWorld, im));
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

  g.userData.parts = { glow };
  return refineNature(THREE, g, "glow_mushroom");
}
