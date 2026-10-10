// ice_casing: three nested rings of ice slabs round the glyph stela, each slid out until it
// clears the stela by 3 cm and pointed over its crown, raised as far as it must be to clear it.
export default function (THREE) {
  const g = new THREE.Group();

  // ---- the stela it closes round (game/assets/glyph_stela.js) ---------------
  // Boxes [x0, x1, y0, y1, z0, z1] that bound it: two base tiers, the tapering
  // shaft in three slices each as wide as its foot, the lens bezel standing proud
  // of the front, and three crown steps. The bezel is mirrored at the back so the
  // hollow is symmetric.
  const STELA = [
    [-0.65, 0.65, 0, 0.25, -0.34, 0.34],
    [-0.575, 0.575, 0.25, 0.5, -0.32, 0.32],
    [-0.5, 0.5, 0.5, 1.03, -0.3, 0.3],
    [-0.484, 0.484, 1.03, 1.57, -0.3, 0.3],
    [-0.466, 0.466, 1.57, 2.04, -0.3, 0.3],
    [-0.274, 0.274, 1.02, 1.58, -0.337, 0.337],
    [-0.42, 0.42, 2.04, 2.16, -0.26, 0.26],
    [-0.33, 0.33, 2.16, 2.27, -0.21, 0.21],
    [-0.25, 0.25, 2.27, 2.4, -0.16, 0.16],
  ];
  const CLEAR = 0.03;
  const gap = (x, y, z) => {
    let d = Infinity;
    for (const [x0, x1, y0, y1, z0, z1] of STELA) {
      const qx = Math.max(x0 - x, x - x1),
        qy = Math.max(y0 - y, y - y1),
        qz = Math.max(z0 - z, z - z1);
      d = Math.min(
        d,
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) +
          Math.min(Math.max(qx, qy, qz), 0),
      );
    }
    return d;
  };
  // Does a triangle soup keep CLEAR off the stela? Sampled on a grid about 3 cm
  // apart; triangles whose bounds are clear of the stela's are skipped.
  const clears = (t) => {
    for (let i = 0; i < t.length; i += 9) {
      const lo = (k) => Math.min(t[i + k], t[i + k + 3], t[i + k + 6]),
        hi = (k) => Math.max(t[i + k], t[i + k + 3], t[i + k + 6]);
      if (
        lo(0) > 0.7 ||
        hi(0) < -0.7 ||
        lo(1) > 2.43 ||
        lo(2) > 0.37 ||
        hi(2) < -0.37
      )
        continue;
      const ux = t[i + 3] - t[i],
        uy = t[i + 4] - t[i + 1],
        uz = t[i + 5] - t[i + 2];
      const vx = t[i + 6] - t[i],
        vy = t[i + 7] - t[i + 1],
        vz = t[i + 8] - t[i + 2];
      const nu = Math.ceil(Math.hypot(ux, uy, uz) / 0.03),
        nv = Math.ceil(Math.hypot(vx, vy, vz) / 0.03);
      for (let a = 0; a <= nu; a++) {
        const s = a / nu;
        for (let b = 0; b <= nv; b++) {
          const r = (b / nv) * (1 - s);
          if (
            gap(
              t[i] + ux * s + vx * r,
              t[i + 1] + uy * s + vy * r,
              t[i + 2] + uz * s + vz * r,
            ) < CLEAR
          )
            return false;
        }
      }
    }
    return true;
  };
  // the least value in [lo, lo + span] for which ok() holds (ok is monotonic)
  const least = (lo, span, ok) => {
    if (ok(lo)) return lo;
    let a = lo,
      b = lo + span;
    for (let i = 0; i < 9; i++) {
      const m = (a + b) / 2;
      if (ok(m)) b = m;
      else a = m;
    }
    return b;
  };

  // ---- repeatable roughness: the same nudge for the same point ---------------
  const hash = (x, y, z, k) => {
    const s =
      Math.sin(
        Math.round(x * 1000) * 12.9898 +
          Math.round(y * 1000) * 78.233 +
          Math.round(z * 1000) * 37.719 +
          k * 11.13,
      ) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const soup = (geo) =>
    Array.from(
      (geo.index ? geo.toNonIndexed() : geo).attributes.position.array,
    );

  // ---- one crystal ------------------------------------------------------------
  // Built upright in its own frame: x across, z out with the flat face at z = 0,
  // y up. c.at: a ground point [x, z] inside the stela the crystal slides out
  // from; c.face: the facing, degrees from +Z towards +X; w and t: width and
  // thickness at the foot; hk: height of the prism; taper: top size over foot
  // size; lean: inward shear per metre; out: extra distance off the stela; then
  // either hook: [x, y, z] (the point goes over the crown to there, and higher if
  // it must to clear it) or tip: [height, inward skew].
  const crystal = (c, seed) => {
    const f = (c.face * Math.PI) / 180,
      sn = Math.sin(f),
      cs = Math.cos(f);
    const [ax0, az0] = c.at;
    const sx = c.w / 1.902,
      sz = c.t / 1.809,
      TIP = 0.4;
    const body = new THREE.CylinderGeometry(
      c.taper,
      1,
      c.hk,
      5,
      2,
      false,
      0,
    ).translate(0, c.hk / 2, 0);
    const cone = new THREE.ConeGeometry(c.taper, TIP, 5, 1, false, 0).translate(
      0,
      c.hk + TIP / 2,
      0,
    );
    const [lb, lt] = [body, cone].map((geo) => {
      // pull the two side corners of the pentagon in, so the outward ridge is sharp
      const q = geo.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const x = q.getX(i),
          z = q.getZ(i),
          rr = Math.hypot(x, z);
        if (rr > 1e-6 && Math.abs(x) > 0.9 * rr) q.setZ(i, z - 0.25 * rr);
      }
      geo.scale(sx, 1, sz).translate(0, 0, 0.809 * sz);
      const p = soup(geo),
        out = [];
      for (let i = 0; i < p.length; i += 9) {
        // the prism's top and the point's base meet inside the crystal: drop both caps
        if ([1, 4, 7].every((k) => Math.abs(p[i + k] - c.hk) < 1e-6)) continue;
        for (let k = 0; k < 9; k++) out.push(p[i + k]);
      }
      for (let i = 0; i < out.length; i += 3) {
        const x = out[i],
          y = out[i + 1],
          z = out[i + 2];
        if (y > c.hk + 0.1) continue; // the apex is placed below
        out[i] += hash(x, y, z, seed) * 0.04;
        out[i + 2] += hash(x, y, z, seed + 1) * 0.02;
        if (y > 1e-6) out[i + 1] += hash(x, y, z, seed + 2) * 0.08;
      }
      return out;
    });
    const world = (src, d) => {
      const o = new Array(src.length);
      for (let i = 0; i < src.length; i += 3) {
        const x = src[i],
          y = src[i + 1],
          z = src[i + 2] - c.lean * y;
        o[i] = ax0 + sn * d + x * cs + z * sn;
        o[i + 1] = y;
        o[i + 2] = az0 + cs * d - x * sn + z * cs;
      }
      return o;
    };
    // slide out until the prism clears the stela
    const d = least(0, 1.2, (dd) => clears(world(lb, dd))) + (c.out || 0);
    // then the point
    const apex = [];
    for (let i = 0; i < lt.length; i += 3)
      if (lt[i + 1] > c.hk + 0.1) apex.push(i);
    const withApex = (wx, y, wz) => {
      // world -> the crystal's own unsheared frame
      const rx = wx - ax0 - sn * d,
        rz = wz - az0 - cs * d;
      const lx = rx * cs - rz * sn,
        lz = rx * sn + rz * cs + c.lean * y;
      for (const i of apex) {
        lt[i] = lx;
        lt[i + 1] = y;
        lt[i + 2] = lz;
      }
      return world(lt, d);
    };
    let tip;
    if (c.hook) {
      // over the crown: raise the point until it clears
      const [wx, y0, wz] = c.hook;
      const y = least(y0, 1.0, (yy) => clears(withApex(wx, yy, wz)));
      tip = withApex(wx, y, wz);
    } else {
      // beside the shaft: a point over the prism's top, skewed in no further than clears
      const top = world([0, c.hk, 0.809 * sz - c.tip[1]], d),
        y = c.hk + c.tip[0];
      const k = least(0, 0.3, (kk) =>
        clears(withApex(top[0] + sn * kk, y, top[2] + cs * kk)),
      );
      tip = withApex(top[0] + sn * k, y, top[2] + cs * k);
    }
    return [...world(lb, d), ...tip];
  };

  // ---- the three rings ------------------------------------------------------------
  // Laid like a brick bond, each ring's crystals over the joints of the one
  // inside it, so the gap a tapering pair opens is filled from behind. Outer:
  // the tallest and thickest; two crystals on each broad face and one on each
  // end hook in over the crown to points staggered round its centre, and
  // a crystal at two corners stands free with its own point. Middle: one on each
  // broad face over the outer joint and one at each corner, hooking in, short
  // ones on the ends. Inner: deep ice, lowest, its points stopping short of the
  // centre.
  const O = { t: 0.18, taper: 0.78, lean: 0.035, out: 0 };
  const M = { t: 0.15, taper: 0.74, lean: 0.04, out: 0.01 };
  const I = { t: 0.11, taper: 0.7, lean: 0.04, deep: true };
  const RINGS = {
    outer: [
      {
        ...O,
        at: [-0.33, 0],
        face: -3,
        w: 0.64,
        t: 0.23,
        hk: 2.2,
        hook: [-0.05, 2.95, -0.12],
      },
      {
        ...O,
        at: [0.33, 0],
        face: 4,
        w: 0.62,
        t: 0.22,
        hk: 2.14,
        hook: [0.15, 2.72, -0.05],
        deep: true,
      },
      {
        ...O,
        at: [0.5, 0.2],
        face: 55,
        w: 0.42,
        hk: 1.95,
        tip: [0.62, 0.02],
        taper: 0.64,
        lean: 0.02,
      },
      {
        ...O,
        at: [0, 0.02],
        face: 91,
        w: 0.66,
        hk: 2.16,
        hook: [-0.14, 2.86, 0.02],
        lean: 0.07,
      },
      {
        ...O,
        at: [0.33, 0],
        face: 177,
        w: 0.64,
        t: 0.23,
        hk: 2.2,
        hook: [0.06, 2.88, 0.12],
      },
      {
        ...O,
        at: [-0.33, 0],
        face: 184,
        w: 0.62,
        t: 0.22,
        hk: 2.12,
        hook: [-0.08, 2.98, 0.1],
        deep: true,
      },
      {
        ...O,
        at: [-0.5, -0.2],
        face: 235,
        w: 0.42,
        hk: 2.05,
        tip: [0.58, 0.02],
        taper: 0.64,
        lean: 0.02,
      },
      {
        ...O,
        at: [0, -0.02],
        face: 270,
        w: 0.66,
        hk: 2.16,
        hook: [0.15, 2.78, -0.02],
        lean: 0.07,
      },
    ],
    middle: [
      {
        ...M,
        at: [0, 0],
        face: 2,
        w: 0.5,
        t: 0.18,
        hk: 2.12,
        hook: [0.04, 2.72, 0.07],
      },
      {
        ...M,
        at: [0.5, 0.18],
        face: 56,
        w: 0.44,
        hk: 2.02,
        hook: [0.2, 2.62, 0.1],
        deep: true,
      },
      {
        ...M,
        at: [0, -0.02],
        face: 92,
        w: 0.46,
        hk: 1.55,
        tip: [0.52, 0.05],
        lean: 0.08,
      },
      {
        ...M,
        at: [0.5, -0.18],
        face: 125,
        w: 0.44,
        hk: 2.08,
        hook: [0.18, 2.7, -0.1],
      },
      {
        ...M,
        at: [0, 0],
        face: 181,
        w: 0.5,
        t: 0.18,
        hk: 2.12,
        hook: [-0.04, 2.66, -0.08],
        deep: true,
      },
      {
        ...M,
        at: [-0.5, -0.18],
        face: 234,
        w: 0.44,
        hk: 2.0,
        hook: [-0.2, 2.58, -0.1],
      },
      {
        ...M,
        at: [0, 0.02],
        face: 268,
        w: 0.46,
        hk: 1.4,
        tip: [0.5, 0.05],
        deep: true,
        lean: 0.08,
      },
      {
        ...M,
        at: [-0.5, 0.18],
        face: 306,
        w: 0.44,
        hk: 2.06,
        hook: [-0.18, 2.75, 0.08],
      },
    ],
    inner: [
      {
        ...I,
        at: [-0.3, 0],
        face: 2,
        w: 0.42,
        hk: 2.12,
        hook: [-0.15, 2.5, 0.2],
      },
      { ...I, at: [0.3, 0], face: 358, w: 0.4, hk: 1.45, tip: [0.46, 0.04] },
      {
        ...I,
        at: [0, 0.03],
        face: 90,
        w: 0.4,
        hk: 2.1,
        hook: [0.25, 2.48, 0],
        lean: 0.08,
      },
      {
        ...I,
        at: [0.45, -0.15],
        face: 125,
        w: 0.34,
        hk: 1.2,
        tip: [0.42, 0.04],
        deep: false,
      },
      {
        ...I,
        at: [0.3, 0],
        face: 178,
        w: 0.42,
        hk: 2.12,
        hook: [0.15, 2.5, -0.2],
      },
      { ...I, at: [-0.3, 0], face: 182, w: 0.4, hk: 1.6, tip: [0.46, 0.04] },
      {
        ...I,
        at: [0, -0.03],
        face: 270,
        w: 0.4,
        hk: 2.1,
        hook: [-0.25, 2.5, 0.05],
        lean: 0.08,
      },
    ],
  };

  // ---- build ------------------------------------------------------------------
  const pieces = [];
  for (const [ring, specs] of Object.entries(RINGS)) {
    specs.forEach((c, n) =>
      pieces.push({
        ring,
        deep: c.deep,
        t: crystal(c, n * 7 + ring.length * 31),
      }),
    );
  }
  // The loader centres an asset on its own bounds, so the stela ends up at the
  // centre of the casing's bounds. Where one side reaches further than the other,
  // slide the piece that bounds the short side out until they match.
  for (const k of [0, 2]) {
    const lo = (q) => {
      let v = Infinity;
      for (let i = k; i < q.t.length; i += 3) v = Math.min(v, q.t[i]);
      return v;
    };
    const hi = (q) => {
      let v = -Infinity;
      for (let i = k; i < q.t.length; i += 3) v = Math.max(v, q.t[i]);
      return v;
    };
    const a = Math.min(...pieces.map(lo)),
      b = Math.max(...pieces.map(hi)),
      e = a + b;
    for (const q of pieces) {
      if (e > 0 && lo(q) < a + 0.001)
        for (let i = k; i < q.t.length; i += 3) q.t[i] -= e;
      if (e < 0 && hi(q) > b - 0.001)
        for (let i = k; i < q.t.length; i += 3) q.t[i] -= e;
    }
  }
  // Only the gentler upper facets hold frost, so the crown does not read as one white cone.
  const FROST = 0.5;
  const bins = {};
  for (const { ring, deep, t } of pieces) {
    const b = (bins[ring] ||= { ice: [], deep: [], frost: [] });
    for (let i = 0; i < t.length; i += 9) {
      const ux = t[i + 3] - t[i],
        uy = t[i + 4] - t[i + 1],
        uz = t[i + 5] - t[i + 2];
      const vx = t[i + 6] - t[i],
        vy = t[i + 7] - t[i + 1],
        vz = t[i + 8] - t[i + 2];
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      const bin = ny / l > FROST ? b.frost : b[deep ? "deep" : "ice"];
      for (let j = 0; j < 9; j++) bin.push(t[i + j]);
    }
  }

  // ---- meshes: each ring a Group with its own materials, so it can fade alone -
  // Ice is flat colour; the game gives it gloss and translucency at load.
  const COLOURS = {
    ice: [0xa9d2e3, 0.3],
    deep: [0x5b9bbd, 0.35],
    frost: [0xe9f2f6, 0.85],
  };
  const parts = {};
  for (const [name, rb] of Object.entries(bins)) {
    const grp = new THREE.Group();
    grp.name = name;
    for (const [key, arr] of Object.entries(rb)) {
      if (!arr.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      geo.computeVertexNormals();
      const [color, roughness] = COLOURS[key];
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }),
      );
      mesh.name = `${name}_${key}`;
      grp.add(mesh);
    }
    g.add(grp);
    parts[name] = grp;
  }

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

  // The three rings, outermost first: Groups of merged meshes (ice, deep ice,
  // frost), each origin on the ground at the centre, where the stela stands.
  g.userData.parts = {
    outer: parts.outer,
    middle: parts.middle,
    inner: parts.inner,
  };
  return g;
}
