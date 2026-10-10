import { refineNature } from "../nature-detail.js";
import { canopyBranches } from "../canopy-leaves.js";
import { canopyMaterial } from "../leaf-surface.js";
import {
  fitBarkUV,
  mossWeights,
  patchNoise,
  ringUV,
  tintMoss,
} from "../forest-sea-nature-bark.js";

// giant_tree, arm C: a second reading, a bole braided from its own roots.
// The eight buttress roots do not stop at the bole: each is one strand, swept from its tip 13 to
// 14 m out, where it is a plank whose underside drops to the ground and flares there, up onto the
// bole where it rounds into a rope, and on up, winding about 100 degrees round the others, so the
// four limbs leave near the four axes and the crown is as deep as it is wide. At 26 m neighbouring
// strands draw together in pairs and each pair runs on as one of the four limbs. Behind the ropes
// stands a lofted core, only seen near the ground between the roots; at the front, where the two
// front roots part to either side, the core is cut back under a pointed arch into the tall hollow,
// with its normals turned down so it reads dark in any light. The crown is not one dome: each limb
// carries its own heap of three cloudy clumps, at its own height, and two more crown the middle;
// each clump is a sphere pushed out into bulges and flattened underneath, its upward faces fern
// green and the rest moss green. Moss on the roots and the lower bole is a skin over the bark that
// surfaces where the strands face up below 11 m, and in a ragged band round the foot of the core in
// the bays between the roots, so its edges wander across the bark instead of following its faces.
// Bark coordinates run along and around each part in metres. Twelve pods, ellipsoids on swept
// threads, hang under the heaps in spore lime, as one mesh: userData.parts.glow.
export default function (THREE) {
  const g = new THREE.Group();

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
  const BARK = mat(0x5a4030, 0.95, "timber");
  const MOSS = mat(0x4f7a3a, 0.9, "foliage");
  const FERN = mat(0x7da04a, 0.85, "foliage");
  const LEAF_MOSS = canopyMaterial(THREE, 0x4f7a3a);
  const LEAF_FERN = canopyMaterial(THREE, 0x7da04a);
  // spore lime is emission only; the base is fern green, so a dimmed pod still reads as a pod
  const SPORE = mat(0x7da04a, 0.55, "foliage", {
    emissive: 0xc3f25a,
    emissiveIntensity: 1.2,
  });

  const TILE = 2.0; // metres of bark per texture tile, coarse plates for a giant

  let seed = 818181;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const rr = (a, b) => a + (b - a) * rnd();
  const D = Math.PI / 180;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Y = V(0, 1, 0);
  const at = (deg, r, y) => V(Math.sin(deg * D) * r, y, Math.cos(deg * D) * r);
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  // a millimetre grid key for a vertex; toFixed would tell -0.000 from 0.000 and split a seam
  const key = (x, y, z) =>
    `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;

  // ---- helpers ----------------------------------------------------------------------------------------
  const buckets = new Map();
  const add = (geo, m) => {
    const o = geo.index ? geo.toNonIndexed() : geo;
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(o);
    return o;
  };
  // smooth normals, with the seam and pole copies of a vertex averaged together
  const weld = (geo) => {
    geo.computeVertexNormals();
    const p = geo.attributes.position,
      n = geo.attributes.normal,
      sum = new Map();
    const k3 = (i) => key(p.getX(i), p.getY(i), p.getZ(i));
    for (let i = 0; i < p.count; i++) {
      const k = k3(i),
        s = sum.get(k) || new THREE.Vector3();
      sum.set(k, s.add(new THREE.Vector3().fromBufferAttribute(n, i)));
    }
    for (let i = 0; i < p.count; i++) {
      const s = sum.get(k3(i)).clone().normalize();
      n.setXYZ(i, s.x, s.y, s.z);
    }
    return geo;
  };
  // a surface through a grid of points, rows P[i], columns P[i][j]; bark takes metric coordinates
  const sheet = (P, bark = false) => {
    const rows = P.length,
      cols = P[0].length,
      pos = [],
      uv = bark ? ringUV(P, TILE) : [],
      idx = [];
    P.forEach((row, i) =>
      row.forEach((q, j) => {
        pos.push(q.x, q.y, q.z);
        if (!bark) uv.push(j / (cols - 1), i / (rows - 1));
      }),
    );
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j,
          b = a + 1,
          c = a + cols,
          d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  };
  const curve = (pts) => new THREE.CatmullRomCurve3(pts, false, "centripetal");
  // sweep a section along a curve: frames carried along the curve from a level side at its start,
  // section(t, centre, side, up) returns the ring of points at t; the ring is closed here
  const sweep = (c, NS, section, bark = true) => {
    const pts = c.getSpacedPoints(NS),
      P = [];
    let S = null;
    for (let k = 0; k <= NS; k++) {
      const T = c.getTangentAt(k / NS);
      S = S
        ? S.addScaledVector(T, -S.dot(T)).normalize()
        : T.clone().cross(Y).normalize();
      const U = S.clone().cross(T).normalize(),
        ring = section(k / NS, pts[k], S, U);
      P.push([...ring, ring[0]]);
    }
    return weld(sheet(P, bark));
  };
  const ring = (n) =>
    Array.from({ length: n }, (_, j) => (j / n) * Math.PI * 2);
  const round = (N, rad) => (t, C, S, U) =>
    ring(N).map((f) =>
      C.clone()
        .addScaledVector(S, Math.sin(f) * rad(t))
        .addScaledVector(U, Math.cos(f) * rad(t)),
    );
  // hand the faces of a non-indexed geometry to one of two materials by a test on each face
  const split = (geo, pick) => {
    const p = geo.attributes.position,
      n = geo.attributes.normal,
      u = geo.attributes.uv;
    const out = [
      { p: [], n: [], u: [] },
      { p: [], n: [], u: [] },
    ];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let f = 0; f < p.count; f += 3) {
      a.fromBufferAttribute(p, f);
      b.fromBufferAttribute(p, f + 1);
      c.fromBufferAttribute(p, f + 2);
      const centre = a.clone().add(b).add(c).divideScalar(3),
        face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const o = out[pick(centre, face) ? 0 : 1];
      for (let k = f; k < f + 3; k++) {
        o.p.push(p.getX(k), p.getY(k), p.getZ(k));
        o.n.push(n.getX(k), n.getY(k), n.getZ(k));
        o.u.push(u.getX(k), u.getY(k));
      }
    }
    return out.map(({ p: P, n: N, u: U }) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
      return geo;
    });
  };
  // bark, mossy wherever it faces up in the lower part of the tree and all round near the ground
  const mossy = (
    geo,
    weight = (p, n) =>
      1.3 * (n.y - 0.12) +
      0.45 * patchNoise(p.x * 0.33, p.y * 0.45, p.z * 0.33) +
      0.2 * patchNoise(p.z * 0.8 + 3, p.x * 0.8, p.y * 0.8) +
      0.6 * (1 - smooth(0.5, 4.5, p.y)) -
      1.2 * smooth(6, 12, p.y),
  ) => add(mossWeights(THREE, geo, weight), BARK);

  // ---- layout --------------------------------------------------------------------------------------------
  // [azimuth on the ground, reach from the axis, curl]; strand i climbs the bole at 22.5 + 45 i
  const ROOTS = [
    [46, 13.4, 6],
    [84, 12.7, -5],
    [122, 14.1, 7],
    [161, 12.9, -5],
    [200, 14.2, 5],
    [238, 12.8, -6],
    [276, 13.7, 5],
    [314, 13.2, -6],
  ];
  // the braid's turn (deg) and radius on the bole; the turn sets the limbs near the four axes
  const TW = 102,
    RC = 3.3;
  const boleAz = (i) => 22.5 + 45 * i;
  // strands (1, 2), (3, 4), (5, 6) and (7, 0) part from the bole together as one limb each
  const LIMBS = [0, 1, 2, 3].map((k) => boleAz(2 * k + 1) + 22.5 + TW);
  const lean = (y) => {
    const s = Math.max(0, y) / 30;
    return V(0.6 * s * s, 0, 0.4 * s * s);
  };

  // ---- the strands ----------------------------------------------------------------------------------------
  const PHI = ring(10);
  ROOTS.forEach(([a, L, curl], i) => {
    const b = boleAz(i),
      k = i % 2 ? i >> 1 : ((i >> 1) + 3) % 4,
      limb = LIMBS[k];
    const side = wrap(b + TW - limb) > 0 ? 1 : -1; // which side of its limb this strand runs on
    // from the root tip, the short way round to the strand's place on the bole, then up the braid
    const pts = [
      at(a + curl, L + 0.4, 0.05),
      at(a + 0.6 * curl, 0.74 * L, 2.6),
      at(a + 0.25 * curl, 0.52 * L, 5.2),
      at(a + 0.55 * wrap(b - a), 5.8, 8.4),
      at(b, 4.2, 11.2),
      at(b + 0.2 * TW, RC, 13.5),
      at(b + 0.53 * TW, RC, 17.8),
      at(b + 0.86 * TW, RC, 22),
      at(limb + side * 8, RC - 0.3, 26.5),
      at(limb + side * 2, 2.3, 29.8),
    ].map((q) => q.add(lean(q.y)));
    const c = curve(pts);
    // a plank low down, whose underside drops straight to the ground and flares there; a round
    // rope from where it reaches the bole
    // the first ring closes the root's end, a blunt cone that meets the ground
    const geo = sweep(c, 28, (t, C, S, U) => {
      const root = 1 - smooth(5.5, 10.5, C.y),
        grow = smooth(0, 0.35, t),
        tip = Math.min(1, t * 28);
      const r = (0.5 + 1.05 * grow - 0.2 * smooth(0.55, 1, t)) * tip,
        w = r + ((0.66 + 0.4 * grow) * tip - r) * root;
      const top = r * (1 + 0.3 * root),
        low = Math.max(r, root * (C.y + 0.5) * tip);
      const down = U.clone().lerp(Y, root).normalize();
      return PHI.map((f) => {
        const cf = Math.cos(f),
          sf = Math.sin(f),
          foot = 1 + 1.6 * root * Math.max(0, -cf) ** 2;
        return C.clone()
          .addScaledVector(S, sf * w * foot)
          .addScaledVector(cf >= 0 ? U : down, cf * (cf >= 0 ? top : low));
      });
    });
    mossy(geo);
  });

  // ---- the core, and the hollow cut into it ---------------------------------------------------------------
  const AW = 1.6,
    AS = 6.4,
    AD = 2.4,
    AR = 2.4 * AW,
    AH = Math.sqrt(AR * AR - (AR - AW) ** 2);
  const archW = (y) =>
    y <= AS
      ? AW
      : y >= AS + AH
        ? 0
        : Math.sqrt(AR * AR - (y - AS) ** 2) - (AR - AW);
  const hollow = (x, y) => {
    const w = archW(y);
    if (w <= 0 || Math.abs(x) >= w) return 0;
    return AD * Math.sqrt(w / AW) * (1 - Math.pow(Math.abs(x) / w, 8));
  };
  const DARK = V(0, -1, -0.3).normalize();
  {
    const COLS = [];
    for (let k = 0; k < 16; k++) COLS.push(-32 + 4 * k);
    for (let k = 0; k < 20; k++) COLS.push(32 + 14.8 * k);
    COLS.push(328);
    const YS = [
      0,
      1,
      2.2,
      3.6,
      5.0,
      AS,
      7.2,
      7.9,
      8.5,
      9.05,
      AS + AH,
      10.6,
      13,
      17,
      21,
      25,
      28,
    ];
    const Rc = (y) => 3.3 + 1.3 * Math.exp(-y / 3.2);
    const P = [],
      deep = [];
    for (const y of YS) {
      const l = lean(y);
      P.push(
        COLS.map((th) => {
          const r = Rc(y),
            d = Math.cos(th * D) > 0.5 ? hollow(Math.sin(th * D) * r, y) : 0;
          deep.push(d / AD);
          return V(
            l.x + Math.sin(th * D) * r,
            y,
            l.z + Math.cos(th * D) * r - d,
          );
        }),
      );
    }
    const l = lean(29);
    P.push(
      COLS.map(() => {
        deep.push(0);
        return V(l.x, 29.5, l.z);
      }),
    );
    const geo = weld(sheet(P, true));
    const n = geo.attributes.normal,
      w = new THREE.Vector3();
    for (let i = 0; i < n.count; i++) {
      if (!deep[i]) continue;
      const k = Math.pow(deep[i], 0.4);
      w.fromBufferAttribute(n, i)
        .multiplyScalar(1 - k)
        .addScaledVector(DARK, k)
        .normalize();
      n.setXYZ(i, w.x, w.y, w.z);
    }
    // a floor for the hollow, in shadow like its walls
    const floor = new THREE.CircleGeometry(4.4, 16)
      .rotateX(-Math.PI / 2)
      .translate(0, 0.02, 0)
      .toNonIndexed();
    const fn = floor.attributes.position.count,
      fp = floor.attributes.position,
      fuv = floor.attributes.uv;
    for (let i = 0; i < fn; i++) fuv.setXY(i, fp.getX(i), -fp.getZ(i));
    floor.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(
        Array.from({ length: fn }, () => [DARK.x, DARK.y, DARK.z]).flat(),
        3,
      ),
    );
    add(floor, BARK);
    // a ragged band of moss round the foot of the core, in the bays between the roots
    mossy(geo, (p) => {
      const az = Math.atan2(p.x, p.z),
        band =
          1.6 +
          2.6 * (0.5 + 0.5 * Math.sin(3 * az + 1.3)) +
          1.0 * Math.sin(7 * az);
      return (
        0.5 +
        (0.8 * band - p.y) / 1.6 +
        0.4 * patchNoise(p.x * 0.45, p.y * 0.6, p.z * 0.45) -
        2 * (1 - smooth(0.6, 0.85, Math.abs(az)))
      );
    });
  }

  // ---- the crown: a heap on each limb, and two clumps over the middle ---------------------------------------
  // [azimuth, distance out, height, radius, half height]
  const CLUMPS = [];
  const LIFT = [0, 1.8, -0.8, 1.0];
  LIMBS.forEach((az, k) => {
    const h = LIFT[k];
    CLUMPS.push(
      [az + 6, 14.3, 42.2 + h, 7.0, 5.0],
      [az - 14, 8.6, 48.4 + h, 6.3, 4.7],
      [az + 36, 12.4, 44.8 + h, 5.6, 4.2],
    );
  });
  CLUMPS.push([60, 3.2, 53.2, 7.0, 4.8], [240, 2.8, 53.8, 6.6, 4.6]);
  const centre = (k) => {
    const [az, r, y] = CLUMPS[k];
    return at(az, r, y).add(lean(30));
  };

  // ---- limbs and branches: swept tubes --------------------------------------------------------------------
  const limbCurves = LIMBS.map((az, k) => {
    const c = curve(
      [
        at(az, 1.2, 26.2),
        at(az, 3.4, 30.4),
        at(az + 3, 7.0, 35.0),
        at(az + 5, 10.4, 38.8),
        at(az + 6, 12.6, 41.2),
      ].map((q) => q.add(lean(30))),
    );
    add(
      sweep(
        c,
        16,
        round(9, (t) => 2.4 - 1.35 * Math.pow(t, 0.8)),
      ),
      BARK,
    );
    for (const [t0, to] of [
      [0.5, 3 * k + 1],
      [0.7, 3 * k + 2],
    ]) {
      const s = c.getPointAt(t0),
        e = s.clone().lerp(centre(to), 0.84),
        m = s
          .clone()
          .lerp(e, 0.5)
          .add(V(0, 1.0, 0));
      add(
        sweep(
          curve([s, m, e]),
          7,
          round(6, (t) => 1.15 - 0.6 * t),
        ),
        BARK,
      );
    }
    // two of the limbs send a branch up to the clumps over the middle
    if (k % 2 === 0) {
      const s = c.getPointAt(0.3),
        e = s.clone().lerp(centre(12 + k / 2), 0.88),
        m = s
          .clone()
          .lerp(e, 0.5)
          .add(V(0, 0, 0));
      add(
        sweep(
          curve([s, m, e]),
          8,
          round(6, (t) => 1.25 - 0.65 * t),
        ),
        BARK,
      );
    }
    return c;
  });

  // ---- clumps: a sphere pushed out into bulges and flattened underneath --------------------------------------
  CLUMPS.forEach(([, , , R, H], k) => {
    const geo = new THREE.SphereGeometry(1, 12, 8);
    const p = geo.attributes.position,
      seen = new Map();
    const bumps = Array.from({ length: 5 }, () => [
      V(rr(-1, 1), rr(0.1, 0.9), rr(-1, 1)).normalize(),
      rr(0.18, 0.34),
    ]);
    const d = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const kk = key(p.getX(i), p.getY(i), p.getZ(i));
      if (!seen.has(kk)) {
        d.fromBufferAttribute(p, i);
        let s = 1 + rr(-0.04, 0.04);
        for (const [dir, amt] of bumps)
          s += amt * Math.pow(Math.max(0, d.dot(dir)), 3);
        let y = d.y * s;
        if (y < -0.45) y = -0.45 + (y + 0.45) * 0.25;
        seen.set(kk, [d.x * s * R, y * H, d.z * s * R]);
      }
      const q = seen.get(kk);
      p.setXYZ(i, q[0], q[1], q[2]);
    }
    const c = centre(k),
      turn = rr(0, 6.28);
    add(
      canopyBranches(THREE, R, H, k * 2.7, geo, "C")
        .rotateY(turn)
        .translate(c.x, c.y, c.z),
      LEAF_FERN,
    );
    geo.scale(0.72, 0.72, 0.72);
    weld(geo.rotateY(turn).translate(c.x, c.y, c.z));
    const [lit, shade] = split(
      geo.toNonIndexed(),
      (m, f) => f.y > 0.32 + 0.1 * Math.sin(m.x * 0.5 + m.z * 0.4),
    );
    add(lit, FERN);
    add(shade, MOSS);
  });

  // ---- pods: ellipsoids on swept threads, under the heaps and along the limbs --------------------------------
  const pods = [];
  const hang = (a, drop, k) => {
    const sw = rr(0, 6.28),
      e = a.clone().add(V(0.4 * Math.sin(sw), -drop, 0.4 * Math.cos(sw)));
    const m = a
      .clone()
      .lerp(e, 0.5)
      .add(V(0.3 * Math.cos(sw), 0, -0.3 * Math.sin(sw)));
    add(
      sweep(
        curve([a, m, e.clone().add(V(0, -0.4 * k, 0))]),
        6,
        round(4, (t) => 0.17 - 0.05 * t),
        false,
      ),
      FERN,
    );
    const c = e.clone().add(V(0, -0.95 * k, 0));
    pods.push(
      weld(
        new THREE.SphereGeometry(1, 8, 6)
          .scale(0.66 * k, 0.95 * k, 0.66 * k)
          .translate(c.x, c.y, c.z),
      ).toNonIndexed(),
    );
  };
  // under the main and side clump of each heap: [clump, azimuth nudge, drop, size]
  for (const [k, da, drop, s] of [
    [0, -5, 5.2, 1.25],
    [2, 4, 3.6, 1.1],
    [3, 5, 6.0, 1.2],
    [5, -4, 3.9, 1.15],
    [6, -6, 4.6, 1.3],
    [8, 5, 3.4, 1.1],
    [9, 4, 5.6, 1.2],
    [11, -5, 4.2, 1.35],
  ]) {
    const [az, r, y, , H] = CLUMPS[k];
    hang(at(az + da, r - 1.3, y - 0.3 * H).add(lean(30)), drop, s);
  }
  // from the undersides of the limbs, nearer the bole
  [
    [0, 0.42, 3.0, 1.05],
    [1, 0.48, 3.4, 1.15],
    [2, 0.4, 2.7, 1.1],
    [3, 0.46, 3.2, 1.2],
  ].forEach(([li, t, drop, s]) => {
    hang(limbCurves[li].getPointAt(t), drop, s);
  });

  // ---- meshes: one per material, and the pods on their own; nothing below the ground ------------------------
  const merge = (geos) => {
    let n = 0;
    for (const x of geos) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2),
      moss = geos.some((x) => x.attributes.moss) ? new Float32Array(n) : null;
    let o = 0;
    for (const x of geos) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      uv.set(x.attributes.uv.array, o * 2);
      if (moss && x.attributes.moss) moss.set(x.attributes.moss.array, o);
      o += x.attributes.position.count;
    }
    for (let i = 1; i < pos.length; i += 3) if (pos[i] < 0) pos[i] = 0;
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    if (moss) out.setAttribute("moss", new THREE.BufferAttribute(moss, 1));
    return out;
  };
  let bark = null;
  for (const [m, geos] of buckets) {
    const geometry = merge(geos);
    if (m === BARK) fitBarkUV(THREE, [geometry], TILE);
    if (m.userData.canopyLeaf)
      geometry.setAttribute("leafUv", geometry.attributes.uv.clone());
    const mesh = new THREE.Mesh(geometry, m);
    if (m === BARK) bark = mesh;
    g.add(mesh);
  }
  const glow = new THREE.Mesh(merge(pods), SPORE);
  glow.name = "glow";
  g.add(glow);

  // ---- place: base on y = 0, centred on x and z -------------------------------------------------------------
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
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
        put(m4.multiplyMatrices(n.matrixWorld, im));
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
  refineNature(THREE, g, "giant_tree");
  tintMoss(THREE, bark, BARK.color, MOSS.color);
  return g;
}
