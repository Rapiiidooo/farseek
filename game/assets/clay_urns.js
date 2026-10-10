import { propDetails } from "../props-detail.js";

// clay_urns, candidate C: a second reading, urns cut in the ruins' own language. Each
// urn is a hand-built ten-sided loft through a stepped, chamfered profile, flat shaded
// like the hero and a touch uneven and leaning, with deep square channels for the
// incised rings and square-section handles. The smallest has a real fracture: above a
// jagged line every column of the wall closes onto its break, so the break shows the
// wall's thickness, and its three shards are thick pieces of that same wall.
// 0.5, 0.75 and 1.0 m tall.
export default function (THREE) {
  const g = new THREE.Group();
  const details = propDetails(THREE, g);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const mat = (color, name, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0,
      ...o,
    });
    m.name = name;
    return m;
  };
  // Named plaster so the surface pass keeps fired clay smooth: by colour alone
  // terracotta classifies as timber and would grow wood grain.
  const CLAY = mat(0xa8603a, "plaster", { roughness: 0.85 });
  const INSIDE = mat(0x8a5433, "plaster", {
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const CHANNEL = mat(0x8a5433, "plaster", { roughness: 0.9 });

  let seed = 31;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const N = 10;

  // --- triangle soup, faceted, with planar UVs --------------------------------------------------------
  const soup = () => {
    const pos = [];
    return {
      quad(a, b, c, d) {
        pos.push(
          a.x,
          a.y,
          a.z,
          b.x,
          b.y,
          b.z,
          c.x,
          c.y,
          c.z,
          a.x,
          a.y,
          a.z,
          c.x,
          c.y,
          c.z,
          d.x,
          d.y,
          d.z,
        );
      },
      tri(a, b, c) {
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      },
      mesh(m) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        const uv = [];
        for (let i = 0; i < pos.length; i += 3)
          uv.push(
            Math.atan2(pos[i], pos[i + 2]) * 0.3 + pos[i] * 0.2,
            pos[i + 1],
          );
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, m);
      },
    };
  };

  // --- an urn ---------------------------------------------------------------------------------------
  // prof: [r, y, tag] from the foot round the rim and down the inside; tags: c clay, g channel
  // floor, i inside. `top` is the index of the rim's highest point, where outside turns inside.
  const urn = ({
    prof,
    handles = [],
    wob = 0.02,
    broken = null,
    n: N = 10,
  }) => {
    const u = new THREE.Group();
    const top = prof.findIndex((p) => p[2] === "i") - 1;
    const noise = Array.from({ length: N }, () => 1 + (rnd() - 0.5) * 2 * wob);
    const ang = (i) => ((i + 0.5) / N) * Math.PI * 2;
    // wall radius by height, outside or inside, for the break
    const radiusAt = (y, inside) => {
      const pts = inside ? prof.slice(top).reverse() : prof.slice(0, top + 1);
      for (let k = 0; k < pts.length - 1; k++) {
        const [r0, y0] = pts[k],
          [r1, y1] = pts[k + 1];
        if ((y - y0) * (y - y1) <= 0 && y0 !== y1)
          return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      }
      return pts[pts.length - 1][0];
    };
    const yb = (i) => (broken ? broken(i) : Infinity);
    const P = (i, k) => {
      let [r, y] = prof[k];
      const b = yb(((i % N) + N) % N);
      if (y > b) {
        y = b;
        r = radiusAt(b, k > top);
      }
      r *= noise[((i % N) + N) % N];
      const a = ang(i);
      return V(Math.sin(a) * r, y, Math.cos(a) * r);
    };
    const S = { c: soup(), g: soup(), i: soup() };
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < prof.length - 1; k++) {
        // the rim's inner edge stays clay, so a fracture shows the fired body, not the dark inside
        const tag =
          prof[k][2] === "g" && prof[k + 1][2] === "g"
            ? "g"
            : k > top
              ? "i"
              : "c";
        S[tag].quad(P(i, k), P(i + 1, k), P(i + 1, k + 1), P(i, k + 1));
      }
    }
    // close the foot underneath and the floor inside
    for (let i = 0; i < N; i++) {
      S.c.tri(V(0, 0, 0), P(i + 1, 0), P(i, 0));
      const last = prof.length - 1;
      S.i.tri(V(0, prof[last][1], 0), P(i, last), P(i + 1, last));
    }
    u.add(S.c.mesh(CLAY), S.g.mesh(CHANNEL), S.i.mesh(INSIDE));
    // handles: square-section tubes whose ends sink into the wall
    for (const { a, pts, r = 0.02 } of handles) {
      const curve = new THREE.CatmullRomCurve3(
        pts.map(([dr, y, da = 0]) => {
          const rr = radiusAt(y, false) + dr,
            aa = a + da;
          return V(Math.sin(aa) * rr, y, Math.cos(aa) * rr);
        }),
      );
      const geo = new THREE.TubeGeometry(curve, 8, r, 4, false).toNonIndexed();
      geo.computeVertexNormals();
      u.add(new THREE.Mesh(geo, CLAY));
    }
    const decoration = soup();
    for (let i = 0; i < N; i++)
      for (const y of [0.17, 0.21, 0.61]) {
        if (y + 0.02 > Math.min(yb(i), yb((i + 1) % N), prof[top][1] - 0.12))
          continue;
        const point = (t, dy) => {
          const yy = y + dy,
            r = radiusAt(yy, false);
          const a = V(
            Math.sin(ang(i)) * r * noise[i],
            yy,
            Math.cos(ang(i)) * r * noise[i],
          );
          const b = V(
            Math.sin(ang(i + 1)) * r * noise[(i + 1) % N],
            yy,
            Math.cos(ang(i + 1)) * r * noise[(i + 1) % N],
          );
          const p = a.lerp(b, t);
          return p.addScaledVector(V(p.x, 0, p.z).normalize(), 0.0008);
        };
        decoration.quad(
          point(0.38, 0),
          point(0.5, -0.012),
          point(0.62, 0),
          point(0.5, 0.012),
        );
      }
    u.add(decoration.mesh(CHANNEL));
    return { u, P, radiusAt };
  };
  // stand an urn at (x, z), turned and leaning a little, its lowest point on the ground
  const stand = (o, x, z, yaw, lean) => {
    o.rotation.set(lean[0], yaw, lean[1], "YXZ");
    o.position.set(x, 0, z);
    g.add(o);
    o.updateMatrixWorld(true);
    let low = Infinity;
    const w = new THREE.Vector3();
    o.traverse((n) => {
      const p = n.isMesh && n.geometry.attributes.position;
      if (!p) return;
      for (let i = 0; i < p.count; i++)
        low = Math.min(
          low,
          w.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld).y,
        );
    });
    o.position.y -= low;
  };

  // --- the tall urn: stepped foot, full belly, a ledge at the shoulder, a heavy square rim ----------
  const ch = (r, y, d = 0.018, w = 0.012) => [
    [r, y - w],
    [r - d, y - w, "g"],
    [r - d, y + w, "g"],
    [r, y + w],
  ];
  const big = urn({
    prof: [
      [0.13, 0],
      [0.145, 0.015],
      [0.145, 0.05],
      [0.125, 0.065],
      [0.16, 0.1],
      [0.23, 0.2],
      ...ch(0.275, 0.3),
      [0.3, 0.42],
      ...ch(0.298, 0.5),
      ...ch(0.294, 0.56),
      [0.275, 0.64],
      [0.265, 0.68],
      [0.22, 0.69],
      [0.205, 0.74],
      [0.16, 0.8],
      [0.115, 0.84],
      [0.11, 0.9],
      [0.14, 0.91],
      [0.14, 0.975],
      [0.125, 1.0],
      [0.09, 1.0],
      [0.085, 0.97, "i"],
      [0.09, 0.86, "i"],
      [0.14, 0.78, "i"],
      [0.2, 0.7, "i"],
    ].map(([r, y, t]) => [r, y, t || "c"]),
    handles: [-1, 1].map((s) => ({
      a: (s * Math.PI) / 2,
      pts: [
        [-0.01, 0.875],
        [0.06, 0.885],
        [0.11, 0.84],
        [0.105, 0.76],
        [0.05, 0.705],
        [-0.012, 0.7],
      ],
    })),
  });
  stand(big.u, -0.26, -0.16, 0.3, [0.02, -0.015]);

  // --- the middle urn: squat, a wide stepped shoulder, two lugs --------------------------------------
  const mid = urn({
    prof: [
      [0.105, 0],
      [0.12, 0.015],
      [0.12, 0.04],
      [0.105, 0.05],
      [0.15, 0.1],
      [0.2, 0.2],
      [0.225, 0.3],
      ...ch(0.222, 0.36, 0.016),
      ...ch(0.212, 0.41, 0.016),
      [0.19, 0.47],
      [0.18, 0.5],
      [0.14, 0.51],
      [0.12, 0.58],
      [0.095, 0.62],
      [0.092, 0.67],
      [0.125, 0.68],
      [0.125, 0.73],
      [0.11, 0.75],
      [0.075, 0.75],
      [0.072, 0.72, "i"],
      [0.078, 0.62, "i"],
      [0.12, 0.54, "i"],
    ].map(([r, y, t]) => [r, y, t || "c"]),
    handles: [-1, 1].map((s) => ({
      a: (s * Math.PI) / 2,
      r: 0.018,
      pts: [
        [-0.01, 0.44, -0.2],
        [0.04, 0.445, -0.12],
        [0.055, 0.44, 0],
        [0.04, 0.445, 0.12],
        [-0.01, 0.44, 0.2],
      ],
    })),
  });
  stand(mid.u, 0.36, -0.2, -0.5, [-0.015, 0.02]);

  // --- the small urn, broken open on its front ---------------------------------------------------------
  const smallProf = [
    [0.08, 0],
    [0.092, 0.012],
    [0.092, 0.035],
    [0.08, 0.045],
    [0.12, 0.1],
    [0.158, 0.18],
    ...ch(0.168, 0.24, 0.014, 0.01),
    ...ch(0.162, 0.28, 0.014, 0.01),
    [0.14, 0.34],
    [0.13, 0.36],
    [0.1, 0.37],
    [0.08, 0.42],
    [0.078, 0.45],
    [0.1, 0.455],
    [0.1, 0.49],
    [0.088, 0.5],
    [0.06, 0.5],
    [0.058, 0.47, "i"],
    [0.062, 0.42, "i"],
    [0.1, 0.35, "i"],
    [0.14, 0.26, "i"],
    [0.135, 0.16, "i"],
    [0.09, 0.08, "i"],
    [0.0, 0.06, "i"],
  ].map(([r, y, t]) => [r, y, t || "c"]);
  // the columns facing +z are broken away: a deep bite on one side, a long ragged
  // slope up the other, teeth all along
  const NS = 14;
  const jag = Array.from(
    { length: NS },
    (_, i) => (i % 2 ? 1 : -1) * (0.02 + rnd() * 0.035),
  );
  const brk = (i) => {
    const a = ((i + 0.5) / NS) * Math.PI * 2,
      t = (Math.atan2(Math.sin(a), Math.cos(a)) + 0.35) / 1.6;
    if (Math.abs(t) >= 1) return Infinity;
    return 0.15 + 0.3 * (t < 0 ? (-t) ** 1.6 : t ** 0.8) + jag[i];
  };
  const small = urn({
    prof: smallProf,
    broken: brk,
    wob: 0.015,
    n: NS,
    handles: [
      {
        a: Math.PI,
        r: 0.015,
        pts: [
          [-0.01, 0.43],
          [0.045, 0.435],
          [0.065, 0.39],
          [0.045, 0.33],
          [0.01, 0.31],
          [-0.01, 0.31],
        ],
      },
    ],
  });
  stand(small.u, 0.08, 0.33, 0.25, [0.0, 0.0]);

  // --- three shards: thick pieces of the small urn's wall, lying about -------------------------------
  const shard = (y0, y1, a0, a1, jagTop) => {
    const S = soup(),
      rO = (y) => small.radiusAt(y, false),
      rI = (y) => small.radiusAt(y, true);
    const pt = (a, y, r) => V(Math.sin(a) * r, y, Math.cos(a) * r);
    const cols = 3,
      ys = [y0, (y0 + y1) / 2, y1];
    const top = (c) => y1 + (c % 2 ? jagTop : -jagTop);
    const grid = (inside) =>
      Array.from({ length: cols + 1 }, (_, c) => {
        const a = a0 + ((a1 - a0) * c) / cols;
        return ys.map((y, k) => {
          const yy = k === 2 ? top(c) : y;
          return pt(a, yy, inside ? rI(yy) : rO(yy));
        });
      });
    const O = grid(false),
      I = grid(true);
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < 2; k++) {
        S.quad(O[c][k], O[c + 1][k], O[c + 1][k + 1], O[c][k + 1]);
        S.quad(I[c][k + 1], I[c + 1][k + 1], I[c + 1][k], I[c][k]);
      }
      S.quad(O[c][2], O[c + 1][2], I[c + 1][2], I[c][2]); // top fracture
      S.quad(I[c][0], I[c + 1][0], O[c + 1][0], O[c][0]); // bottom fracture
    }
    for (const [c, s] of [
      [0, -1],
      [cols, 1],
    ]) {
      for (let k = 0; k < 2; k++) {
        const q = [O[c][k], O[c][k + 1], I[c][k + 1], I[c][k]];
        if (s < 0) S.quad(q[0], q[1], q[2], q[3]);
        else S.quad(q[3], q[2], q[1], q[0]);
      }
    }
    const m = S.mesh(CLAY);
    m.material = mat(0xa8603a, "plaster", {
      roughness: 0.86,
      side: THREE.DoubleSide,
    });
    const box = new THREE.Box3().setFromObject(m),
      c = box.getCenter(new THREE.Vector3());
    m.geometry.translate(-c.x, -c.y, -c.z);
    const holder = new THREE.Group();
    holder.add(m);
    return holder;
  };
  const pieces = [
    [0.24, 0.36, -0.35, 0.3, 0.012, 0.36, 0.52, 1.8, [1.35, 0.2]],
    [0.28, 0.38, 0.1, 0.62, 0.01, 0.5, 0.3, -0.7, [-1.4, 0.1]],
    [0.17, 0.26, -0.2, 0.3, 0.012, -0.1, 0.58, 2.6, [1.3, -0.2]],
  ];
  for (const [y0, y1, a0, a1, jt, x, z, yaw, lean] of pieces)
    stand(shard(y0, y1, a0, a1, jt), x, z, yaw, lean);

  // --- placement: base on y = 0, centred on x and z --------------------------------------------------
  const bb = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mm) => {
      for (let i = 0; i < p.count; i++)
        bb.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mm));
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
  const ctr = bb.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= ctr.x;
    o.position.y -= bb.min.y;
    o.position.z -= ctr.z;
  });
  return details.batch();
}
