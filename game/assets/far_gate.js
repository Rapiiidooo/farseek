import { detailBatch } from "../prop-detail.js";

// far_gate, arm A: revolved profiles.
// The ring, its bone lip, the crystal groove inlays and the three medallions are
// LatheGeometry sweeps of (radius, depth) profiles about the ring axis, one lathe
// per profile edge so every chamfer and channel stays crisp. The dais is two
// chamfered tiers stepped on all four sides; the buttresses are extruded cradles
// whose inner face follows the ring's outer circle.
// 12 x 9 x 6 m. Ring 9 m across (radii 4.5 / 3.5, 1.1 m deep), centre 4.5 m up,
// so the opening meets the dais top at 1.0 m. The floor sits 2 cm higher so the
// opening crosses it instead of grazing it, which z-fights along the threshold.
// The dais and buttresses are one declared `base` node that a world may replace;
// `{ base: false }` builds the ring alone, its opening closed all the way round.
export default function (THREE, { base = true } = {}) {
  const g = new THREE.Group();

  // ---- materials ------------------------------------------------------------
  const stone = (color, roughness = 0.9) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
    });
    m.name = "stone";
    return m;
  };
  const basalt = stone(0x3a3531, 0.78);
  const bone = stone(0xe6d3ae, 0.82);
  const sand = stone(0xb57f4f);
  const sunlit = stone(0xd4a373, 0.86);
  const sienna = stone(0x8a5433, 0.94);
  // Dormant crystal, one material per lit part so each lights on its own (raise
  // emissiveIntensity). Unnamed and just under opaque so the loader's procedural
  // surfaces leave it alone rather than swapping in one shared textured copy.
  const crystal = () =>
    new THREE.MeshStandardMaterial({
      color: 0x1d5f63,
      emissive: 0x39e3d0,
      emissiveIntensity: 0,
      roughness: 0.28,
      metalness: 0.05,
      transparent: true,
      opacity: 0.94,
    });

  // ---- static parts are merged per material, so the gate stays a handful of
  // draw calls even when the game loads it with keepHierarchy ----------------
  const buckets = new Map(),
    daisBuckets = new Map();
  const add = (geo, mat, into = buckets) => {
    if (!into.has(mat)) into.set(mat, []);
    into.get(mat).push(geo);
  };
  const dais = (geo, mat) => add(geo, mat, daisBuckets);
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
      if (x.attributes.uv) uv.set(x.attributes.uv.array, o * 2);
      o += x.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return out;
  };

  // ---- revolved profiles ----------------------------------------------------
  // Points are [radius, depth] and run counter-clockwise round the solid in that
  // plane, which is what makes LatheGeometry face outward. LatheGeometry leaves
  // the last normal of a profile unnormalised, so every normal is renormalised.
  const lathe = (pts, segs, phiStart = 0, phiLength = Math.PI * 2) => {
    const out = [],
      v = new THREE.Vector3();
    for (let i = 0; i < pts.length - 1; i++) {
      const geo = new THREE.LatheGeometry(
        [
          new THREE.Vector2(pts[i][0], pts[i][1]),
          new THREE.Vector2(pts[i + 1][0], pts[i + 1][1]),
        ],
        segs,
        phiStart,
        phiLength,
      );
      const nr = geo.attributes.normal;
      for (let k = 0; k < nr.count; k++) {
        v.fromBufferAttribute(nr, k).normalize();
        nr.setXYZ(k, v.x, v.y, v.z);
      }
      geo.rotateX(Math.PI / 2); // lathe axis Y becomes the ring axis Z, phi 0 at the bottom
      out.push(geo);
    }
    return out;
  };

  const CY = 4.5; // ring centre height
  const RI = 3.5,
    RO = 4.5,
    RL = 4.42; // opening, outer edge, inner edge of the bone lip
  const FACE = 0.5,
    LIP = 0.55; // basalt face and lip half-depths
  const SEG = 128;
  const GROOVES = [3.775, 3.985, 4.195],
    HW = 0.045,
    DEP = 0.07;

  // basalt body: front face with three channels, chamfered opening, back face
  const front = [[RL, FACE]];
  for (const c of [...GROOVES].reverse()) {
    front.push(
      [c + HW, FACE],
      [c + HW, FACE - DEP],
      [c - HW, FACE - DEP],
      [c - HW, FACE],
    );
  }
  front.push([RI + 0.05, FACE]);
  const back = front.map(([r, z]) => [r, -z]).reverse();
  const rim = [
    [RI + 0.05, FACE],
    [RI, FACE - 0.05],
    [RI, -FACE + 0.05],
    [RI + 0.05, -FACE],
  ];
  // The opening's chamfers and wall skip their lowest 12 degrees: that sliver is
  // buried a few cm under the floor, nearly parallel to it, and bleeds through.
  const SKIP = base ? (6 * Math.PI) / 180 : 0;
  for (const geo of [
    ...lathe(front, SEG),
    ...lathe(back, SEG),
    ...lathe(rim, base ? SEG - 4 : SEG, SKIP, Math.PI * 2 - 2 * SKIP),
  ]) {
    geo.translate(0, CY, 0);
    add(geo, basalt);
  }

  // bone lip: wraps the outer edge and stands 5 cm proud of both faces
  const lip = [
    [RL, -FACE],
    [RL, -LIP],
    [RO - 0.03, -LIP],
    [RO, -LIP + 0.03],
    [RO, LIP - 0.03],
    [RO - 0.03, LIP],
    [RL, LIP],
    [RL, FACE],
  ];
  for (const geo of lathe(lip, SEG)) {
    geo.translate(0, CY, 0);
    add(geo, bone);
  }

  // crystal inlays in the channel floors, 3.5 cm below the face, both faces
  const grooves = new THREE.Group();
  grooves.name = "grooves";
  grooves.position.set(0, CY, 0);
  const INLAY = FACE - DEP + 0.035;
  GROOVES.forEach((c, i) => {
    const a = c - HW + 0.004,
      b = c + HW - 0.004;
    const m = new THREE.Mesh(
      merge([
        ...lathe(
          [
            [b, INLAY],
            [a, INLAY],
          ],
          SEG,
        ),
        ...lathe(
          [
            [a, -INLAY],
            [b, -INLAY],
          ],
          SEG,
        ),
      ]),
      crystal(),
    );
    m.name = `groove${i + 1}`;
    grooves.add(m);
  });
  g.add(grooves);

  // medallions: crystal plugs through the ring, flush with both faces, each with
  // a low central boss; placed at 12, 4 and 8 o'clock as seen from the front
  const RM = 3.965;
  const plug = [
    [0, -0.528],
    [0.29, -0.528],
    [0.3, -0.512],
    [0.438, -0.512],
    [0.45, -0.5],
    [0.45, 0.5],
    [0.438, 0.512],
    [0.3, 0.512],
    [0.29, 0.528],
    [0, 0.528],
  ];
  const medallion = (name, deg) => {
    const m = new THREE.Mesh(merge(lathe(plug, 48)), crystal());
    const a = (deg * Math.PI) / 180;
    m.position.set(RM * Math.cos(a), CY + RM * Math.sin(a), 0);
    m.name = name;
    g.add(m);
    return m;
  };
  const medallionTop = medallion("medallionTop", 90);
  const medallionRight = medallion("medallionRight", -30);
  const medallionLeft = medallion("medallionLeft", 210);

  // ---- chamfered boxes for the dais ----------------------------------------
  // Built face by face (6 faces, 12 edge strips, 8 corner triangles). Each face
  // is sorted round its centroid and wound away from the box centre.
  const polyGeo = (faces, half) => {
    const P = [],
      N = [],
      U = [];
    const c = new THREE.Vector3(),
      n0 = new THREE.Vector3(),
      u = new THREE.Vector3(),
      w = new THREE.Vector3();
    const e1 = new THREE.Vector3(),
      e2 = new THREE.Vector3(),
      n = new THREE.Vector3(),
      d = new THREE.Vector3();
    for (const f of faces) {
      const pts = f.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      c.set(0, 0, 0);
      for (const p of pts) c.add(p);
      c.multiplyScalar(1 / pts.length);
      n0.copy(c).normalize();
      u.subVectors(pts[0], c);
      u.addScaledVector(n0, -u.dot(n0)).normalize();
      w.crossVectors(n0, u);
      const ang = (p) => {
        d.subVectors(p, c);
        return Math.atan2(d.dot(w), d.dot(u));
      };
      pts.sort((p, q) => ang(p) - ang(q));
      for (let i = 1; i < pts.length - 1; i++) {
        const tri = [pts[0], pts[i], pts[i + 1]];
        n.crossVectors(
          e1.subVectors(tri[1], tri[0]),
          e2.subVectors(tri[2], tri[0]),
        ).normalize();
        const ax =
          Math.abs(n.x) > Math.abs(n.y)
            ? Math.abs(n.x) > Math.abs(n.z)
              ? 0
              : 2
            : Math.abs(n.y) > Math.abs(n.z)
              ? 1
              : 2;
        const [ua, va] = [
          [1, 2],
          [0, 2],
          [0, 1],
        ][ax];
        for (const p of tri) {
          P.push(p.x, p.y, p.z);
          N.push(n.x, n.y, n.z);
          const a = p.toArray();
          U.push(
            (a[ua] + half[ua]) / (2 * half[ua]),
            (a[va] + half[va]) / (2 * half[va]),
          );
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    return geo;
  };
  const cbox = (w, h, d, ch, x, y, z) => {
    const H = [w / 2, h / 2, d / 2],
      S = [-1, 1];
    const p = (s, full) => s.map((k, i) => k * (i === full ? H[i] : H[i] - ch));
    const faces = [];
    for (let i = 0; i < 3; i++)
      for (const s of S) {
        const f = [];
        for (const a of S)
          for (const b of S) {
            const sg = [];
            sg[i] = s;
            sg[(i + 1) % 3] = a;
            sg[(i + 2) % 3] = b;
            f.push(p(sg, i));
          }
        faces.push(f);
      }
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3,
        k = (i + 2) % 3;
      for (const si of S)
        for (const sj of S) {
          const f = [];
          for (const sk of S) {
            const sg = [];
            sg[i] = si;
            sg[j] = sj;
            sg[k] = sk;
            f.push(p(sg, i), p(sg, j));
          }
          faces.push(f);
        }
    }
    for (const sx of S)
      for (const sy of S)
        for (const sz of S)
          faces.push([0, 1, 2].map((i) => p([sx, sy, sz], i)));
    const geo = polyGeo(faces, H);
    geo.translate(x, y, z);
    return geo;
  };

  // ---- dais: 12 x 6 x 1.0 m, two 0.5 m tiers stepped on all four sides -------
  const TX = 11,
    TZ = 4.4,
    FLOOR = 1.02;
  if (base) {
    dais(cbox(12, 0.2, 6, 0.05, 0, 0.1, 0), sienna); // weathered footing course
    dais(cbox(11.94, 0.3, 5.94, 0.05, 0, 0.35, 0), sand);
    dais(cbox(TX, 0.22, TZ, 0.05, 0, 0.61, 0), sand);
    dais(cbox(TX - 0.06, 0.08, TZ - 0.06, 0.01, 0, 0.76, 0), basalt); // recessed contrast band
    dais(cbox(TX, FLOOR - 0.8, TZ, 0.05, 0, (0.8 + FLOOR) / 2, 0), sunlit); // dressed capping course, the floor
  }

  // ---- buttresses: extruded cradles on the top tier, left and right ----------
  const RA = 4.48; // bites 2 cm into the lip so no hairline shows
  const arc = (yTop, yBot, n = 14) => {
    const a0 = Math.asin((yTop - CY) / RA),
      a1 = Math.asin((yBot - CY) / RA),
      out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([RA * Math.cos(a), CY + RA * Math.sin(a)]);
    }
    return out;
  };
  // ExtrudeGeometry's bevel grows the profile outward; bevelOffset -bev pulls the
  // walls back onto the drawn outline so the bevel becomes a true chamfer.
  const prism = (pts, sx, z0, z1, bev) => {
    const shape = new THREE.Shape(
      pts.map(([x, y]) => new THREE.Vector2(sx * x, y)),
    );
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: z1 - z0 - 2 * bev,
      bevelEnabled: bev > 0,
      bevelThickness: bev,
      bevelSize: bev,
      bevelOffset: -bev,
      bevelSegments: 1,
      curveSegments: 1,
    });
    geo.translate(0, 0, z0 + bev);
    return geo;
  };
  const XO = TX / 2,
    ZB = 1.3;
  if (base)
    for (const sx of [-1, 1]) {
      dais(
        prism([[XO, FLOOR], [XO, 2.5], ...arc(2.5, FLOOR)], sx, -ZB, ZB, 0.06),
        sand,
      );
      dais(
        prism(
          [[XO - 0.06, 2.5], [XO - 0.06, 2.62], ...arc(2.62, 2.5, 2)],
          sx,
          -ZB + 0.06,
          ZB - 0.06,
          0,
        ),
        sienna,
      );
      dais(
        prism(
          [[XO, 2.62], [XO, 3.2], [XO - 0.1, 3.3], ...arc(3.3, 2.62, 6)],
          sx,
          -ZB,
          ZB,
          0.06,
        ),
        sunlit,
      );
      dais(
        prism(
          [[5.1, 3.3], [5.1, 3.8], [5.0, 3.9], ...arc(3.9, 3.3, 5)],
          sx,
          -0.95,
          0.95,
          0.06,
        ),
        sunlit,
      );
    }

  for (const [mat, geos] of buckets) g.add(new THREE.Mesh(merge(geos), mat));
  const footing = base ? new THREE.Group() : null;
  if (footing) {
    footing.name = "base";
    for (const [mat, geos] of daisBuckets)
      footing.add(new THREE.Mesh(merge(geos), mat));
    g.add(footing);
  }

  const details = detailBatch(THREE, g);
  const carving = footing && detailBatch(THREE, footing);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 48; i++) {
      const a = (i * Math.PI) / 24;
      if (
        [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6].some(
          (c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) < 0.14,
        )
      )
        continue;
      details.line(
        bone,
        [
          [Math.cos(a) * 4.3, CY + Math.sin(a) * 4.3, side * 0.505],
          [
            Math.cos(a) * (i % 4 ? 4.35 : 4.4),
            CY + Math.sin(a) * (i % 4 ? 4.35 : 4.4),
            side * 0.505,
          ],
        ],
        0.008,
      );
    }
    if (!carving) continue;
    for (let x = -5; x <= 5; x += 1)
      carving.box(sienna, [0.018, 0.17, 0.008], [x, 0.37, side * 2.971]);
    for (const x of [-4.75, 4.75]) {
      carving.box(sienna, [0.035, 1.12, 0.012], [x, 1.72, side * 1.302]);
      for (const y of [1.24, 1.68, 2.14])
        carving.box(sienna, [0.55, 0.018, 0.012], [x, y, side * 1.302]);
    }
  }
  details.finish();
  carving?.finish();

  // ---- placement: base at y = 0, centred on x and z (measured on vertices) ---
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mat) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat));
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

  g.userData.parts = { grooves, medallionTop, medallionLeft, medallionRight };
  g.userData.portal = {
    center: [
      +(0 - c.x).toFixed(3),
      +(CY - box.min.y).toFixed(3),
      +(0 - c.z).toFixed(3),
    ],
    radius: RI,
  };
  if (footing) g.userData.base = footing;
  return g;
}
