import { refineNature } from "../nature-detail.js";

// frost_cairn: five uneven frost-slate slabs stacked off the axis with snow on their ledges, and
// a leaning timber stake carrying a vermilion strip. About 1.1 m of stone, the stake 1.3 m.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color, name, roughness, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      ...o,
    });
    m.name = name;
    return m;
  };
  const SLATE = mat(0x3d4654, "stone", 0.9, { flatShading: true });
  const SNOW = mat(0xe9f2f6, "ground", 0.8);
  const TIMBER = mat(0x8a6a48, "timber", 0.9, { flatShading: true });
  const CLOTH = mat(0xc2412d, "fabric", 0.92, { side: THREE.DoubleSide });

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  const add = (parent, geo, m) => {
    const o = new THREE.Mesh(geo, m);
    parent.add(o);
    return o;
  };

  // A flat stone in its unit frame: an undercut foot, a body and a chamfered top, its outline
  // wavering and its top tipped, so no two read as pucks from one mould.
  const TAU = Math.PI * 2;
  const rough = (n, seed, r) => (k) => {
    const a = (k / n) * TAU;
    return (
      r *
      (1 +
        0.1 * Math.sin(2 * a + seed) +
        0.06 * Math.sin(3 * a + seed * 1.7) +
        0.04 * Math.sin(5 * a + seed * 2.3))
    );
  };
  const lean = (seed, t) => (k, n) =>
    0.07 * t * Math.cos((k / n) * TAU - seed * 0.9);
  const ringAt = (n, R, y, cx, cz, tip = () => 0) =>
    Array.from({ length: n }, (_, k) => {
      const a = (k / n) * TAU;
      return V(cx + Math.cos(a) * R(k), y + tip(k, n), cz + Math.sin(a) * R(k));
    });
  const skinRings = (rings, out) => {
    const pos = [];
    const e1 = V(0, 0, 0),
      e2 = V(0, 0, 0);
    const put = (a, b, c, hint) => {
      e1.subVectors(b, a).cross(e2.subVectors(c, a));
      if (e1.lengthSq() < 1e-14) return;
      if (e1.dot(hint) < 0) [b, c] = [c, b];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i],
        B = rings[i + 1],
        n = A.length;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        if (B.length === 1) {
          put(A[k], A[j], B[0], out(A[k], B[0]));
          continue;
        }
        if (A.length === 1) {
          put(A[0], B[k], B[j], out(B[k], A[0]));
          continue;
        }
        const hint = out(A[k], B[j]);
        put(A[k], A[j], B[j], hint);
        put(A[k], B[j], B[k], hint);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const uv = [];
    for (let i = 0; i < pos.length; i += 3)
      uv.push(pos[i] * 0.5 + 0.5, pos[i + 1] * 2 + pos[i + 2] * 0.5);
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  };
  const slab = (
    parent,
    n,
    t,
    seed,
    { cx = 0, cz = 0, r = 1, y0 = 0, top = t } = {},
  ) => {
    const R = rough(n, seed, r),
      tip = lean(seed, t),
      c0 = 0.2 * t,
      c1 = 0.25 * t;
    const scaled = (f) => (k) => R(k) * f;
    const rings = [
      [V(cx, y0, cz)],
      ringAt(n, scaled(0.8), y0, cx, cz),
      ringAt(n, scaled(1.0), y0 + c0, cx, cz),
      ringAt(n, scaled(0.95), top - c1, cx, cz, (k, m) => tip(k, m) * 0.6),
      ringAt(n, scaled(0.68), top, cx, cz, tip),
      [V(cx, top + 0.01 * t, cz)],
    ];
    const centre = V(cx, (y0 + top) / 2, cz);
    add(
      parent,
      skinRings(rings, (p, q) =>
        p.clone().add(q).multiplyScalar(0.5).sub(centre),
      ),
      SLATE,
    );
    return { R, tip, c1, top, cx, cz };
  };
  // Snow lodged on a stone's top: a pillow that spills over the chamfer on the lee side.
  const ledge = (parent, n, s, deep, lee, base, spill) => {
    const { R, tip, c1, top, cx, cz } = s;
    const outer = Array.from({ length: n }, (_, k) => {
      const a = (k / n) * TAU,
        f = base + spill * Math.max(0, Math.cos(a - lee)),
        along = (f - 0.68) / 0.27;
      return V(
        cx + Math.cos(a) * R(k) * f,
        top - c1 * along + tip(k, n) * (1 - 0.4 * along) + 0.004,
        cz + Math.sin(a) * R(k) * f,
      );
    });
    const at = (f, rise) => ringAt(n, (k) => R(k) * f, top + rise, cx, cz, tip);
    add(
      parent,
      skinRings(
        [
          outer,
          at(0.55, deep * 0.7),
          at(0.3, deep),
          [V(cx, top + deep * 1.1, cz)],
        ],
        () => V(0, 1, 0),
      ),
      SNOW,
    );
  };
  const WIND = Math.PI;

  // --- the stones, bottom to top ------------------------------------------------------------
  // rx, rz half-widths; t thickness; x, z drift off the axis; yaw; n sides; tx, tz tilt;
  // lobe: a second, lower slab [angle, distance, radius, height] in the stone's unit frame,
  // shifted so it pushes out on one side as a ledge.
  const STONES = [
    {
      rx: 0.42,
      rz: 0.34,
      t: 0.28,
      x: 0,
      z: 0,
      yaw: 0.3,
      n: 7,
      tx: 0,
      tz: 0,
      lobe: [2.6, 0.17, 0.9, 0.66],
    },
    {
      rx: 0.35,
      rz: 0.3,
      t: 0.25,
      x: -0.035,
      z: 0.03,
      yaw: 1.45,
      n: 6,
      tx: 0.03,
      tz: -0.025,
    },
    {
      rx: 0.3,
      rz: 0.25,
      t: 0.23,
      x: 0.03,
      z: -0.02,
      yaw: 2.25,
      n: 7,
      tx: -0.035,
      tz: 0.02,
      lobe: [-0.6, 0.17, 0.9, 0.68],
    },
    {
      rx: 0.245,
      rz: 0.21,
      t: 0.21,
      x: -0.04,
      z: 0.025,
      yaw: 0.85,
      n: 6,
      tx: 0.02,
      tz: 0.035,
    },
    {
      rx: 0.2,
      rz: 0.17,
      t: 0.18,
      x: -0.012,
      z: 0.05,
      yaw: 2.6,
      n: 5,
      tx: -0.03,
      tz: -0.02,
    },
  ];
  const SEAT = 0.02; // each stone settles this far into the one below
  let y = 0;
  STONES.forEach((s, i) => {
    const holder = new THREE.Group();
    holder.position.set(s.x, y, s.z);
    holder.rotation.set(s.tx, 0, s.tz);
    const f = new THREE.Group();
    f.rotation.y = s.yaw;
    f.scale.set(s.rx, 1, s.rz);
    holder.add(f);
    const n = s.n + 2,
      lee = WIND + s.yaw,
      last = i === STONES.length - 1;
    const stone = slab(f, n, s.t, i * 2.3 + 0.7);
    ledge(
      f,
      n,
      stone,
      last ? 0.034 : 0.02,
      lee,
      last ? 0.86 : 0.84,
      last ? 0.08 : 0.1,
    );
    if (s.lobe) {
      const [a, d, r, h] = s.lobe;
      const lobe = slab(f, n, s.t, i * 1.9 + 2.1, {
        cx: Math.cos(a) * d,
        cz: Math.sin(a) * d,
        r,
        y0: 0.01,
        top: h * s.t,
      });
      ledge(f, n, lobe, 0.016, lee, 0.86, 0.08);
    }
    g.add(holder);
    y += s.t - SEAT;
  });
  // snow banked round the foot, deepest on the lee side
  {
    const drift = add(
      g,
      new THREE.SphereGeometry(1, 12, 3, 0, Math.PI * 2, 0, Math.PI / 2),
      SNOW,
    );
    drift.position.set(Math.cos(WIND) * 0.1, 0, Math.sin(WIND) * 0.1);
    drift.scale.set(0.36, 0.075, 0.31);
  }

  // --- the stake: beside the base stone, leaning out to +X and back ------------------------------
  const LEAN = (9.5 * Math.PI) / 180,
    AZ = (-28 * Math.PI) / 180,
    R0 = 0.037,
    L = 1.3;
  const dir = V(
    Math.sin(LEAN) * Math.cos(AZ),
    Math.cos(LEAN),
    Math.sin(LEAN) * Math.sin(AZ),
  );
  const foot = V(0.46, R0 * Math.sin(LEAN), -0.1);
  const along = (s) => foot.clone().addScaledVector(dir, s);
  const stake = new THREE.Group();
  stake.position.copy(foot);
  stake.quaternion.setFromUnitVectors(UP, dir);
  const HEAD = 0.035;
  const shaft = add(
    stake,
    new THREE.CylinderGeometry(0.032, R0, L - HEAD, 6),
    TIMBER,
  );
  shaft.position.y = (L - HEAD) / 2;
  // battered head, splayed a little where it was driven
  const head = add(
    stake,
    new THREE.CylinderGeometry(0.026, 0.034, HEAD, 6),
    TIMBER,
  );
  head.position.y = L - HEAD / 2;
  shaft.rotation.y = head.rotation.y = 0.4;
  g.add(stake);
  // snow heaped round the foot, which also hides the cut end
  const heap = add(
    g,
    new THREE.SphereGeometry(1, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2),
    SNOW,
  );
  heap.position.set(foot.x, 0, foot.z);
  heap.scale.set(0.1, 0.034, 0.09);

  // --- the cloth: a band wound round the top, a knot on the outer side, two tails -------------
  const WRAP = 1.19;
  const band = add(
    stake,
    new THREE.CylinderGeometry(0.044, 0.046, 0.07, 8),
    CLOTH,
  );
  band.position.y = WRAP;
  const turn = add(stake, new THREE.TorusGeometry(0.041, 0.011, 4, 10), CLOTH);
  turn.position.y = WRAP + 0.045;
  turn.rotation.set(Math.PI / 2 + 0.3, 0.2, 0);
  // outward from the stake axis toward the lean, where the knot sits
  const out = V(Math.cos(AZ), 0, Math.sin(AZ));
  out.addScaledVector(dir, -out.dot(dir)).normalize();
  const K = along(WRAP).addScaledVector(out, 0.05);
  const knot = add(g, new THREE.SphereGeometry(0.03, 7, 5), CLOTH);
  knot.position.copy(K);
  knot.scale.set(1, 0.8, 0.9);

  // one straight piece of strip from a to b, w wide, its width turned tw about the vertical
  const strip = (a, b, w, tw, th = 0.007) => {
    const yv = b.clone().sub(a),
      len = yv.length();
    yv.normalize();
    const xv = V(Math.cos(tw), 0, Math.sin(tw));
    xv.addScaledVector(yv, -xv.dot(yv)).normalize();
    const zv = V(0, 0, 0).crossVectors(xv, yv);
    const o = add(g, new THREE.BoxGeometry(w, len + 0.012, th), CLOTH);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(xv, yv, zv),
    );
    return { xv };
  };
  // the long tail hangs plumb from the knot, turning a little as it falls
  const W = 0.1;
  const P = [K.clone().add(V(0.004, -0.012, 0.008))];
  for (const d of [
    [0.012, -0.17, 0.016],
    [0.022, -0.16, -0.006],
    [0.03, -0.14, 0.018],
  ]) {
    P.push(P[P.length - 1].clone().add(V(...d)));
  }
  const TW = [0.05, -0.15, -0.35];
  let last;
  for (let i = 0; i < 3; i++) last = strip(P[i], P[i + 1], W, TW[i]);
  // the torn end: two narrow ribbons of unequal length
  for (const [side, len, dx, dz] of [
    [-1, 0.06, -0.006, 0.008],
    [1, 0.04, 0.008, 0.004],
  ]) {
    const a = P[3].clone().addScaledVector(last.xv, side * W * 0.26);
    strip(a, a.clone().add(V(dx, -len, dz)), W * 0.46, TW[2] + side * 0.08);
  }
  // the short tail, cocked out from the knot
  const Q0 = K.clone().add(V(0.012, -0.01, 0.018));
  const Q1 = Q0.clone().add(V(0.03, -0.09, 0.032));
  const Q2 = Q1.clone().add(V(0.012, -0.075, 0.012));
  strip(Q0, Q1, 0.075, 1.4);
  strip(Q1, Q2, 0.07, 1.75);

  // --- the six lines -------------------------------------------------------------------------
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
  return refineNature(THREE, g, "frost_cairn");
}
