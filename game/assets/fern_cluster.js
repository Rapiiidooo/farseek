import { refineNature } from "../nature-detail.js";

// fern_cluster, candidate C (second reading, hand-built sheets): the leaflets are pleats.
// Each blade is one folded sheet: every pinna is a ridge running out and forward from the
// rachis to a tooth tip, and between two pinnae the sheet dips into a valley that ends in
// a notch, so the zig-zag edge comes with light and shadow stripes that still read when
// the teeth are too small to see. Twelve fronds in two whorls: four young ones standing
// up in a vase in the middle, fern green nearly from the stipe, and eight old ones below
// them spreading out and down, moss green for half their length; every frond drifts a
// little sideways and rolls its blade as it arches. The two fiddleheads are lofted tubes
// that climb a stalk and wind round a logarithmic spiral, beaded where the rolled pinnae
// press out. The crown is a low wavy mound of bark. 1.2 m across, 0.8 m tall.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color, roughness, name) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    m.name = name;
    return m;
  };
  const MOSS = mat(0x4f7a3a, 0.85, "foliage");
  const FERN = mat(0x7da04a, 0.8, "foliage");
  const BARK = mat(0x5a4030, 0.95, "timber");

  let seed = 97;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() * 2 - 1) * a;
  const D = Math.PI / 180;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const bins = new Map();
  const bin = (m) => {
    if (!bins.has(m)) bins.set(m, { pos: [], uv: [], up: [] });
    return bins.get(m);
  };
  // `up` is the blade's upper side for a leaf face, so mirrored halves of a blade shade alike
  const tri = (b, p0, p1, p2, t0, t1, t2, up = null) => {
    b.pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    b.uv.push(t0[0], t0[1], t1[0], t1[1], t2[0], t2[1]);
    b.up.push(up);
  };

  // Widest a third of the way up the blade, the lowest pinnae shorter, a point at the tip.
  const outline = (v) =>
    v < 0.33
      ? 0.42 + 0.58 * Math.sin((v / 0.33) * (Math.PI / 2))
      : Math.pow(Math.max(0, 1 - v) / 0.67, 0.8);

  // A frond's centreline as a function of u in [0, 1]: the point, and a frame of side (s)
  // and upper normal (n), rolled by the twist. t runs from 0 (inner, upright) to 1 (outer,
  // low); the angle above the horizontal falls from th0 to th1, slowly at first.
  const spine = (az, t, L, drift, twist) => {
    const th0 = (86 - 26 * t) * D,
      th1 = (-50 - 24 * t) * D,
      pw = 2.4 - t;
    const theta = (u) => th0 - (th0 - th1) * Math.pow(u, pw);
    const O = V(Math.sin(az), 0, Math.cos(az)),
      S0 = V(Math.cos(az), 0, -Math.sin(az));
    const N = 64,
      pts = [];
    let r = 0.035,
      y = 0.036 - 0.01 * t;
    for (let i = 0; i <= N; i++) {
      if (i) {
        const th = theta((i - 0.5) / N);
        r += (Math.cos(th) * L) / N;
        y += (Math.sin(th) * L) / N;
      }
      const u = i / N;
      pts.push(
        O.clone()
          .multiplyScalar(r)
          .addScaledVector(S0, drift * u * u)
          .setY(y),
      );
    }
    const P = (u) => {
      const f = Math.min(Math.max(u, 0), 1) * N,
        i = Math.min(Math.floor(f), N - 1);
      return pts[i].clone().lerp(pts[i + 1], f - i);
    };
    return (u) => {
      const p = P(u),
        tan = P(u + 0.02)
          .sub(P(u - 0.02))
          .normalize();
      const s = S0.clone().addScaledVector(tan, -S0.dot(tan)).normalize();
      const n = V(0, 0, 0).crossVectors(tan, s);
      const tw = twist * Math.pow(u, 1.5),
        c = Math.cos(tw),
        sn = Math.sin(tw);
      return {
        p,
        s: s.clone().multiplyScalar(c).addScaledVector(n, sn),
        n: n.clone().multiplyScalar(c).addScaledVector(s, -sn),
      };
    };
  };

  const frond = (az, t, young) => {
    const L = (1.12 - 0.44 * t) * (young ? 1.1 : 1.06) * (1 + jit(0.04));
    const twist =
      (young ? 0.35 + 0.3 * rnd() : 0.3 * rnd()) * (rnd() < 0.5 ? -1 : 1);
    const F = spine(az, t, L, jit(0.07), twist);
    const at = (u, x, h) => {
      const f = F(u);
      return f.p.addScaledVector(f.s, x).addScaledVector(f.n, h);
    };
    const US = 0.18,
      NP = 13,
      W = (young ? 0.1 : 0.13) * L;
    const split = Math.round(NP * (young ? 0.2 : 0.55 + 0.1 * t));
    const stem = bin(MOSS);

    // the stipe: a four-sided loft from inside the crown to the start of the blade
    const ring = (u, r) =>
      [
        [r, 0],
        [0, r * 0.8],
        [-r, 0],
        [0, -r * 0.8],
      ].map(([x, h]) => at(u, x, h));
    const rings = [
      ring(0, 0.011),
      ring(US * 0.5, 0.0095),
      ring(US + 0.025, 0.008),
    ];
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < 4; j++) {
        const k = (j + 1) % 4;
        tri(
          stem,
          rings[i][j],
          rings[i + 1][j],
          rings[i + 1][k],
          [j / 4, i / 3],
          [j / 4, (i + 1) / 3],
          [(j + 1) / 4, (i + 1) / 3],
        );
        tri(
          stem,
          rings[i][j],
          rings[i + 1][k],
          rings[i][k],
          [j / 4, i / 3],
          [(j + 1) / 4, (i + 1) / 3],
          [(j + 1) / 4, i / 3],
        );
      }
    }

    // the blade: valleys at a[i] ending in notches, ridges at the pinna middles ending in
    // tooth tips pushed forward; the sheet droops more towards the tip
    const a = Array.from(
      { length: NP + 1 },
      (_, i) => US + (i / NP) * (1 - US),
    );
    const notch = a.map((_, i) =>
      i === NP ? 0 : W * outline(i / NP) * 0.16 + 0.003,
    );
    const tooth = Array.from(
      { length: NP },
      (_, i) => W * outline((i + 0.5) / NP) * (1 + jit(0.06)),
    );
    const th = (u) => 0.006 * (1 - 0.6 * u);
    const uv = (x, u) => [0.5 + x / 0.3, u];
    for (let i = 0; i < NP; i++) {
      const b = bin(i < split ? MOSS : FERN);
      const v = (i + 0.5) / NP,
        droop = 0.18 + 0.22 * v;
      const am = (a[i] + a[i + 1]) / 2,
        at0 = a[i] + 0.12 * (a[i + 1] - a[i]),
        at1 = a[i + 1] + 0.12 * (a[i + 1] - a[i]);
      const tipU = am + 0.48 * (a[i + 1] - a[i]),
        up = F(am).n;
      for (const side of [-1, 1]) {
        const R0 = at(a[i], 0, th(a[i])),
          M = at(am, 0, th(am)),
          R1 = at(a[i + 1], 0, th(a[i + 1]));
        const x0 = notch[i],
          x1 = notch[i + 1],
          xt = tooth[i];
        const N0 = at(at0, side * x0, -(droop + 0.1) * x0);
        if (i === NP - 1) {
          tri(b, R0, N0, R1, uv(0, a[i]), uv(side * x0, at0), uv(0, 1), up);
          continue;
        }
        const N1 = at(
          at1,
          side * x1,
          -(0.18 + (0.22 * (i + 1.5)) / NP + 0.1) * x1,
        );
        const T = at(tipU, side * xt, -(droop - 0.1) * xt);
        tri(
          b,
          R0,
          N0,
          T,
          uv(0, a[i]),
          uv(side * x0, at0),
          uv(side * xt, tipU),
          up,
        );
        tri(b, R0, T, M, uv(0, a[i]), uv(side * xt, tipU), uv(0, am), up);
        tri(
          b,
          M,
          T,
          N1,
          uv(0, am),
          uv(side * xt, tipU),
          uv(side * x1, at1),
          up,
        );
        tri(b, M, N1, R1, uv(0, am), uv(side * x1, at1), uv(0, a[i + 1]), up);
      }
    }
  };

  // four young fronds in the middle, eight old ones round them; the young lean out a little so
  // they show their blades rather than their edges
  const inner = [0.12, 0.22, 0.17, 0.27];
  inner.forEach((t, k) => frond((45 + 90 * k) * D + jit(0.15), t, true));
  const outer = [0.6, 0.9, 0.7, 1, 0.65, 0.95, 0.75, 0.85];
  outer.forEach((t, k) => frond((22.5 + 45 * k) * D + jit(0.12), t, false));

  // --- fiddleheads: a lofted tube up a leaning stalk and round a logarithmic spiral in the
  // stalk's own vertical plane, over the top and winding in; its radius swells in beads.
  // One loft for both, so the stalk and the coil share the ring where they meet.
  const tube = (pts, rad, sides, binAt) => {
    const n = pts.length;
    const T = pts.map((p, i) =>
      pts[Math.min(i + 1, n - 1)]
        .clone()
        .sub(pts[Math.max(i - 1, 0)])
        .normalize(),
    );
    const N = V(1, 0, 0).addScaledVector(T[0], -T[0].x).normalize();
    const rings = [];
    for (let i = 0; i < n; i++) {
      if (i) {
        const axis = V(0, 0, 0).crossVectors(T[i - 1], T[i]),
          sin = axis.length();
        if (sin > 1e-6)
          N.applyAxisAngle(
            axis.normalize(),
            Math.atan2(sin, T[i - 1].dot(T[i])),
          );
        N.addScaledVector(T[i], -N.dot(T[i])).normalize();
      }
      const B = V(0, 0, 0).crossVectors(T[i], N);
      rings.push(
        Array.from({ length: sides }, (_, j) => {
          const q = (j / sides) * Math.PI * 2;
          return pts[i]
            .clone()
            .addScaledVector(N, Math.cos(q) * rad[i])
            .addScaledVector(B, Math.sin(q) * rad[i]);
        }),
      );
    }
    for (let i = 0; i < n - 1; i++) {
      const b = binAt(i);
      for (let j = 0; j < sides; j++) {
        const k = (j + 1) % sides,
          v0 = i / (n - 1),
          v1 = (i + 1) / (n - 1);
        tri(
          b,
          rings[i][j],
          rings[i + 1][j],
          rings[i + 1][k],
          [j / sides, v0],
          [j / sides, v1],
          [(j + 1) / sides, v1],
        );
        tri(
          b,
          rings[i][j],
          rings[i + 1][k],
          rings[i][k],
          [j / sides, v0],
          [(j + 1) / sides, v1],
          [(j + 1) / sides, v0],
        );
      }
    }
    const last = rings[n - 1],
      tipP = pts[n - 1].clone().addScaledVector(T[n - 1], rad[n - 1] * 0.8),
      b = binAt(n - 1);
    for (let j = 0; j < sides; j++)
      tri(b, last[j], last[(j + 1) % sides], tipP, [0, 1], [1, 1], [0.5, 1]);
  };
  const fiddlehead = (az, H, R0, lean) => {
    const O = V(Math.sin(az), 0, Math.cos(az));
    const pt = (out, y) => O.clone().multiplyScalar(out).setY(y);
    const pts = [],
      rad = [];
    for (let i = 0; i <= 6; i++) {
      const f = i / 7;
      pts.push(pt(0.012 + lean * f * f, 0.03 + (H - 0.03) * f));
      rad.push(0.0095 + 0.003 * f);
    }
    const k = 0.3,
      turns = 2.4 * Math.PI,
      NC = 26;
    for (let i = 0; i <= NC; i++) {
      const phi = (i / NC) * turns,
        rho = R0 * Math.exp(-k * phi);
      pts.push(
        pt(0.012 + lean + R0 - rho * Math.cos(phi), H + rho * Math.sin(phi)),
      );
      rad.push(
        (0.022 - 0.013 * (i / NC)) *
          (1 + 0.16 * Math.max(0, Math.sin(phi * 4))),
      );
    }
    // the stalk moss green, the coil fern green
    tube(pts, rad, 5, (i) => bin(i < 7 ? MOSS : FERN));
  };
  fiddlehead(0.26, 0.44, 0.052, 0.03);
  fiddlehead(4.97, 0.36, 0.046, 0.03);

  // --- the crown: a low mound of bark on a polar grid, its wavy rim on the floor
  {
    const R = 0.105,
      NU = 3,
      NT = 12,
      b = bin(BARK);
    const P = (i, j) => {
      const u = i / NU,
        q = (j / NT) * Math.PI * 2,
        w = 1 + 0.1 * Math.sin(3 * q + 0.5) + 0.05 * Math.sin(5 * q + 2);
      return [
        V(
          R * u * w * Math.cos(q),
          0.046 * Math.pow(1 - Math.pow(u, 1.5), 1.6),
          R * u * w * Math.sin(q),
        ),
        [0.5 + (u * Math.cos(q)) / 2, 0.5 + (u * Math.sin(q)) / 2],
      ];
    };
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NT; j++) {
        const [p0, t0] = P(i, j),
          [p1, t1] = P(i + 1, j),
          [p2, t2] = P(i + 1, j + 1),
          [p3, t3] = P(i, j + 1);
        tri(b, p0, p2, p1, t0, t2, t1);
        if (i) tri(b, p0, p3, p2, t0, t3, t2);
      }
    }
  }

  // Leaf normals are summed on the blade's upper side, keep a share of their facet so the pleats
  // still shade, then turn back to their own winding, which double-sided lighting flips by.
  const e1 = V(0, 0, 0),
    e2 = V(0, 0, 0),
    q = V(0, 0, 0),
    sums = new Map();
  const key = (P, i, leaf) =>
    `${leaf ? "l" : "s"}${Math.round(P[i] * 1e5)},${Math.round(P[i + 1] * 1e5)},${Math.round(P[i + 2] * 1e5)}`;
  const faces = new Map();
  for (const [m, b] of bins) {
    const list = [];
    for (let f = 0; f < b.up.length; f++) {
      const P = b.pos,
        o = f * 9,
        up = b.up[f];
      e1.set(P[o + 3] - P[o], P[o + 4] - P[o + 1], P[o + 5] - P[o + 2]);
      e2.set(P[o + 6] - P[o], P[o + 7] - P[o + 1], P[o + 8] - P[o + 2]);
      const n = V(0, 0, 0).crossVectors(e1, e2),
        sign = up && n.dot(up) < 0 ? -1 : 1;
      n.multiplyScalar(sign);
      for (let k = 0; k < 3; k++) {
        const id = key(P, o + 3 * k, up);
        sums.set(id, (sums.get(id) || V(0, 0, 0)).add(n));
      }
      list.push({ n: n.normalize(), sign, leaf: !!up });
    }
    faces.set(m, list);
  }
  for (const [m, b] of bins) {
    const nor = [];
    faces.get(m).forEach(({ n, sign, leaf }, f) => {
      for (let k = 0; k < 3; k++) {
        q.copy(sums.get(key(b.pos, f * 9 + 3 * k, leaf))).normalize();
        if (leaf) q.multiplyScalar(0.65).addScaledVector(n, 0.35).normalize();
        nor.push(q.x * sign, q.y * sign, q.z * sign);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    g.add(new THREE.Mesh(geo, m));
  }

  // --- the six lines -------------------------------------------------------
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
  return refineNature(THREE, g, "fern_cluster");
}
