import { propDetails } from "../props-detail.js";

// expedition_tent, candidate C: a second reading, the tent left standing too long.
// The canvas is one hand-built faceted sheet draped over a ridge pole that has
// sagged: slack valleys hang between the hem pegs, the hem scallops, and the back
// left corner has torn free where its guy line snapped. One door flap is gathered
// and tied to the pole, the other thrown back over the roof and tied down. Patches,
// seams, sod cloth and binding follow the same surface. Front faces +Z; 2.6 m long
// with the pegs, 1.8 m wide, 1.6 m to the crossed pole tips.
export default function (THREE) {
  const g = new THREE.Group();
  const details = propDetails(THREE, g);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0),
    ZW = V(0, 0, 1);

  const mat = (color, name, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0,
      ...o,
    });
    m.name = name;
    return m;
  };
  // Every fabric is double sided: the surface pass shares materials by colour,
  // so a single-sided twin would silently lose the inside of the canvas.
  // Redder than rope khaki: the court's blue shade turns a yellower canvas mint.
  const CANVAS = mat(0xb88a5c, "fabric", {
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const ROPE = mat(0xb49a6a, "fabric", {
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const GRIME = mat(0x8a6a48, "fabric", {
    roughness: 0.97,
    side: THREE.DoubleSide,
  });
  const BLANKET = mat(0x8a5433, "fabric", {
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const LEATHER = mat(0x4b2e1e, "fabric", {
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const TIMBER = mat(0x8a6a48, "timber", { roughness: 0.9 });
  const BRONZE = mat(0x9a6a35, "metal", { roughness: 0.5, metalness: 0.6 });

  // --- builders: faceted triangle soup with planar UVs, sheets, lofts, rods ------------------
  const mesh = (geo, m, parent = g) => {
    const me = new THREE.Mesh(geo, m);
    parent.add(me);
    return me;
  };
  const flat = (geo) => {
    const o = geo.index ? geo.toNonIndexed() : geo;
    o.computeVertexNormals();
    return o;
  };
  const soup = () => {
    const pos = [];
    const tri = (a, b, c) =>
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    return {
      tri,
      quad: (a, b, c, d) => {
        tri(a, b, c);
        tri(a, c, d);
      },
      geo: () => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        const uv = [];
        for (let i = 0; i < pos.length; i += 3)
          uv.push(pos[i] + pos[i + 2], pos[i + 1]);
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.computeVertexNormals();
        return geo;
      },
    };
  };
  // Cloth shades soft: coincident corners are welded so normals average across faces.
  const soft = (geo) => {
    const p = geo.attributes.position,
      t = geo.attributes.uv,
      ids = new Map(),
      pos = [],
      uv = [],
      index = [];
    for (let i = 0; i < p.count; i++) {
      const key = [p.getX(i), p.getY(i), p.getZ(i)]
        .map((x) => Math.round(x * 1e4))
        .join();
      if (!ids.has(key)) {
        ids.set(key, pos.length / 3);
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        uv.push(t.getX(i), t.getY(i));
      }
      index.push(ids.get(key));
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(index);
    out.computeVertexNormals();
    geo.dispose();
    return out;
  };
  const sheet = (fn, nu, nv, m, parent) => {
    const S = soup(),
      P = [];
    for (let i = 0; i <= nu; i++) {
      P.push([]);
      for (let j = 0; j <= nv; j++) P[i].push(fn(i / nu, j / nv));
    }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++)
        S.quad(P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]);
    return mesh(soft(S.geo()), m, parent);
  };
  const orient = (from, to) =>
    new THREE.Quaternion().setFromUnitVectors(from, to.clone().normalize());
  // a faceted loft along a -> b; rows are [radius, fraction], a little irregular
  const loft = (a, b, rows, sides, m, wob = 0.1, parent = g) => {
    const d = b.clone().sub(a),
      L = d.length(),
      q = orient(UP, d),
      S = soup();
    const R = rows.map(([r, f], k) =>
      Array.from({ length: sides }, (_, i) => {
        const th = (i / sides) * Math.PI * 2 + k * 0.5;
        const rr = r * (1 + wob * Math.sin(3 * th + k * 1.7));
        return V(Math.cos(th) * rr, f * L, -Math.sin(th) * rr)
          .applyQuaternion(q)
          .add(a);
      }),
    );
    for (let k = 0; k < R.length - 1; k++) {
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        S.quad(R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]);
      }
    }
    return mesh(soft(S.geo()), m, parent);
  };
  const rod = (a, b, r, m, seg = 6, rTop = r, parent = g) => {
    const d = b.clone().sub(a);
    const me = mesh(
      flat(new THREE.CylinderGeometry(rTop, r, d.length(), seg)),
      m,
      parent,
    );
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.copy(orient(UP, d));
    return me;
  };
  const rope = (pts, r = 0.011, m = ROPE) => {
    const curve =
      pts.length === 3
        ? new THREE.QuadraticBezierCurve3(...pts)
        : new THREE.CatmullRomCurve3(pts);
    return mesh(
      new THREE.TubeGeometry(curve, pts.length === 3 ? 10 : 18, r, 4, false),
      m,
    );
  };

  // --- the frame and the canvas surface ------------------------------------------------------
  const HW = 0.8,
    ZL = 0.98,
    XF = 0.74,
    YC = 1.41,
    RP = 0.036,
    ZA = ZL + 0.07,
    RS = 0.045;
  const YR = YC + RP / Math.sin(Math.atan2(XF, YC)); // ridge pole seated in the crotch
  const ridgeY = (z) => YR - RS * (1 - (z / ZA) ** 2); // and sagging between the frames
  const PEGZ = [-ZL, -0.33, 0.33, ZL];
  const slack = (z) => {
    for (let k = 0; k < 3; k++) {
      if (z >= PEGZ[k] - 1e-9 && z <= PEGZ[k + 1] + 1e-9)
        return Math.sin((Math.PI * (z - PEGZ[k])) / (PEGZ[k + 1] - PEGZ[k]));
    }
    return 0;
  };
  // u: -1 left hem, 0 ridge, +1 right hem; v: 0 back edge, 1 front edge
  const Pc = (u, v) => {
    const s = u < 0 ? -1 : 1,
      t = 1 - Math.abs(u),
      z = -ZL + 2 * ZL * v;
    const top = ridgeY(z) + RP + 0.005;
    const el = Math.hypot(HW, top);
    const tx = (-s * HW) / el,
      ty = top / el; // up the slope
    const nx = (-s * top) / el,
      ny = -HW / el; // into the tent
    const bw = slack(z),
      mid = 1 - (z / ZL) ** 2;
    const sag = (0.02 + 0.03 * mid + 0.05 * bw) * Math.sin(Math.PI * t);
    const lift = 0.06 * bw * Math.max(0, 1 - t / 0.3) ** 2;
    const p = V(
      s * HW * (1 - t) + nx * sag + tx * (lift / ty),
      top * t + ny * sag + lift,
      z,
    );
    if (s < 0) {
      // the torn corner curls up and out
      const k = Math.max(0, 1 - t / 0.36) ** 2 * Math.max(0, 1 - v / 0.26) ** 2;
      p.x -= 0.12 * k;
      p.y += 0.28 * k;
      p.z -= 0.06 * k;
    }
    return p;
  };
  const Nc = (u, v) => {
    const e = 1e-3;
    const du = Pc(Math.min(1, u + e), v).sub(Pc(Math.max(-1, u - e), v));
    const dv = Pc(u, Math.min(1, v + e)).sub(Pc(u, Math.max(0, v - e)));
    const n = du.cross(dv).normalize();
    return n.dot(V(Math.sign(u), 0.6, 0)) < 0 ? n.negate() : n;
  };
  const Po = (u, v, off) => Pc(u, v).addScaledVector(Nc(u, v), off);

  const NU = 9,
    NV = 18;
  // two slopes, so the ridge keeps its crease
  sheet((a, b) => Pc(-1 + a, b), NU, NV, CANVAS);
  sheet((a, b) => Pc(a, b), NU, NV, CANVAS);
  // the back gable, billowing inward a little
  sheet(
    (a, b) => {
      const p = Pc(-(1 - b), 0).lerp(Pc(1 - b, 0), a);
      p.z += 0.05 * Math.sin(Math.PI * a) * Math.sin(Math.PI * b) ** 0.7;
      return p;
    },
    8,
    8,
    CANVAS,
  );
  // a vent near the top of the back gable, bound in darker tape
  {
    // between the crossed poles, below the lashing, so it shows from behind
    const S = soup(),
      z = -ZL - 0.014;
    const c = V(0, 1.12, z),
      a = V(-0.15, 0.9, z),
      b = V(0.15, 0.9, z),
      d = V(0, 0.7, z);
    S.tri(c, a, d);
    S.tri(c, d, b);
    mesh(S.geo(), GRIME);
  }
  // sod cloth along both hems, ridge band, and the seams over the pegs
  for (const s of [-1, 1])
    sheet((a, b) => Po(s * (1 - 0.085 * a), b, 0.007), 2, NV, GRIME);
  sheet((a, b) => Po(-0.045 + 0.09 * a, b, 0.006), 2, NV, GRIME);
  for (const z of [-0.33, 0.33]) {
    const v0 = (z + ZL) / (2 * ZL);
    sheet(
      (a, b) => Po(-1 + 2 * a, v0 - 0.009 + 0.018 * b, 0.005),
      2 * NU,
      1,
      GRIME,
    );
  }
  // two darker patches, hand cut, sewn onto the slopes
  const patch = (c, m) =>
    sheet(
      (a, b) => {
        const u =
          (c[0][0] * (1 - a) + c[1][0] * a) * (1 - b) +
          (c[3][0] * (1 - a) + c[2][0] * a) * b;
        const v =
          (c[0][1] * (1 - a) + c[1][1] * a) * (1 - b) +
          (c[3][1] * (1 - a) + c[2][1] * a) * b;
        return Po(u, v, 0.009);
      },
      3,
      3,
      m,
    );
  patch(
    [
      [0.3, 0.17],
      [0.6, 0.19],
      [0.58, 0.41],
      [0.32, 0.4],
    ],
    BLANKET,
  );
  patch(
    [
      [-0.66, 0.5],
      [-0.42, 0.52],
      [-0.44, 0.71],
      [-0.64, 0.69],
    ],
    GRIME,
  );

  // running stitches round both patches, flat dashes lying on the patch
  const stitches = soup();
  const stitch = (ua, va, ub, vb) => {
    const a = Po(ua, va, 0.0105),
      b = Po(ub, vb, 0.0105);
    const side = Nc((ua + ub) / 2, (va + vb) / 2)
      .cross(b.clone().sub(a))
      .normalize()
      .multiplyScalar(0.00175);
    stitches.quad(
      a.clone().sub(side),
      a.clone().add(side),
      b.clone().add(side),
      b.clone().sub(side),
    );
  };
  for (const [u0, u1, v0, v1] of [
    [0.3, 0.6, 0.18, 0.4],
    [-0.65, -0.43, 0.52, 0.69],
  ])
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      for (const v of [v0, v1])
        stitch(
          u0 + (u1 - u0) * t,
          v - 0.003,
          u0 + (u1 - u0) * (t + 0.055),
          v + 0.004,
        );
      for (const u of [u0, u1])
        stitch(
          u - 0.004,
          v0 + (v1 - v0) * t,
          u + 0.004,
          v0 + (v1 - v0) * (t + 0.055),
        );
    }
  mesh(stitches.geo(), CANVAS);
  for (const sign of [-1, 1])
    for (const z of [-0.9, -0.33, 0.33, 0.9]) {
      const u = sign * 0.93,
        v = (z + ZL) / (2 * ZL),
        at = Po(u, v, 0.012);
      const eyelet = new THREE.TorusGeometry(0.012, 0.0035, 3, 8);
      eyelet
        .applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), Nc(u, v)),
        )
        .translate(...at.toArray());
      details.add(eyelet, BRONZE);
    }

  // the frame: an A of two poles lashed where they cross, the ridge pole sagging between
  const ridge = [];
  for (let k = 0; k <= 8; k++) {
    const z = -ZA - 0.08 + ((2 * ZA + 0.16) * k) / 8;
    ridge.push(V(0, ridgeY(Math.max(-ZA, Math.min(ZA, z))), z));
  }
  mesh(
    flat(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(ridge),
        16,
        RP,
        7,
        false,
      ),
    ),
    TIMBER,
  );
  for (const e of [-1, 1]) {
    rod(V(0, YR, e * (ZA + 0.08)), V(0, YR, e * (ZA + 0.085)), RP, TIMBER, 7); // end grain
    for (const s of [-1, 1]) {
      const d = V(-s * XF, YC, 0).normalize();
      const z = e * ZA + s * RP;
      const foot = V(s * XF, 0, z).addScaledVector(
        d,
        (RP * Math.abs(d.x)) / d.y,
      );
      rod(foot, V(0, YC, z).addScaledVector(d, 0.16), RP, TIMBER, 6, RP * 0.82);
    }
    loft(
      V(0, YC, e * ZA - 0.075),
      V(0, YC, e * ZA + 0.075),
      [
        [0, 0],
        [0.045, 0.05],
        [0.056, 0.3],
        [0.05, 0.5],
        [0.056, 0.7],
        [0.045, 0.95],
        [0, 1],
      ],
      7,
      ROPE,
      0.05,
    );
  }

  // --- the door: left flap gathered and tied to the pole, right flap thrown back ---------------
  {
    const bot = V(-(HW * (1 - 0.06 / 1.53) - 0.1), 0.06, ZL + 0.03);
    const top = V(-(HW * (1 - 1.4 / 1.53) - 0.02), 1.4, ZL + 0.03);
    loft(
      bot,
      top,
      [
        [0, 0],
        [0.1, 0.02],
        [0.115, 0.1],
        [0.09, 0.3],
        [0.042, 0.46],
        [0.075, 0.6],
        [0.06, 0.8],
        [0.03, 0.95],
        [0, 1],
      ],
      7,
      CANVAS,
      0.16,
    );
    const tie = bot.clone().lerp(top, 0.46);
    loft(
      tie.clone().addScaledVector(top.clone().sub(bot).normalize(), -0.025),
      tie.clone().addScaledVector(top.clone().sub(bot).normalize(), 0.025),
      [
        [0.05, 0],
        [0.056, 0.5],
        [0.05, 1],
      ],
      7,
      LEATHER,
      0,
    );
    rope(
      [
        tie.clone().add(V(-0.03, 0, 0.02)),
        tie.clone().add(V(-0.08, -0.06, 0.05)),
        tie.clone().add(V(-0.1, -0.2, 0.06)),
      ],
      0.009,
    );
  }
  {
    // hinged on the front edge and folded back onto the right slope; C is its free corner
    const A = [0.03, 1],
      B = [0.985, 1],
      C = [0.79, 0.64],
      n = 5;
    const S = soup(),
      at = (i, j) => {
        const k = n - i - j,
          u = (A[0] * i + B[0] * j + C[0] * k) / n,
          v = (A[1] * i + B[1] * j + C[1] * k) / n;
        return Po(u, v, 0.013 + 0.03 * (k / n) ** 2);
      };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        S.tri(at(i, j), at(i + 1, j), at(i, j + 1));
        if (i + j < n - 1) S.tri(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
      }
    }
    mesh(soft(S.geo()), CANVAS);
    // binding tape along the two free edges
    const tape = (P0, P1) =>
      sheet(
        (a, b) => {
          const u = P0[0] + (P1[0] - P0[0]) * b,
            v = P0[1] + (P1[1] - P0[1]) * b;
          const cu = (A[0] + B[0] + C[0]) / 3,
            cv = (A[1] + B[1] + C[1]) / 3;
          const f = 0.05 * a;
          const k = Math.max(
            0,
            1 -
              Math.hypot(u - C[0], v - C[1]) /
                Math.hypot(A[0] - C[0], A[1] - C[1]),
          );
          return Po(u + (cu - u) * f, v + (cv - v) * f, 0.017 + 0.03 * k ** 2);
        },
        1,
        6,
        GRIME,
      );
    tape(A, C);
    tape(C, B);
  }

  // --- pegs and guy ropes; the back left line has snapped ------------------------------------
  const peg = (x, z, lean, out) => {
    out = out.clone().setY(0).normalize();
    const dir = out
      .clone()
      .multiplyScalar(Math.sin(lean))
      .addScaledVector(UP, Math.cos(lean));
    const base = V(x, 0.018 * Math.sin(lean) + 0.001, z);
    rod(base, base.clone().addScaledVector(dir, 0.15), 0.018, TIMBER, 5, 0.022);
    rod(
      base.clone().addScaledVector(dir, 0.13),
      base.clone().addScaledVector(dir, 0.175),
      0.032,
      TIMBER,
      5,
      0.026,
    );
    return base.addScaledVector(dir, 0.11);
  };
  const guy = (a, b, sag) =>
    rope([
      a,
      a
        .clone()
        .lerp(b, 0.5)
        .add(V(0, -sag, 0)),
      b,
    ]);
  const cross = (e) => V(0, YC + 0.07, e * ZA);
  guy(cross(1).add(V(0.03, 0, 0)), peg(0.86, 1.26, 0.3, V(0.86, 0, 0.9)), 0.05);
  guy(
    cross(1).add(V(-0.03, 0, 0)),
    peg(-0.86, 1.26, 0.3, V(-0.86, 0, 0.9)),
    0.05,
  );
  guy(
    cross(-1).add(V(0.03, 0, 0)),
    peg(0.86, -1.26, 0.3, V(0.86, 0, -0.9)),
    0.05,
  );
  // snapped: a frayed stub still knotted on its peg, the rest hanging from the frame
  const stub = peg(-0.86, -1.26, 0.3, V(-0.86, 0, -0.9));
  rope([stub, stub.clone().add(V(0.06, -0.05, 0.05)), V(-0.74, 0.013, -1.17)]);
  const hang = [
    cross(-1).add(V(-0.03, -0.02, 0)),
    V(-0.07, 1.0, -1.11),
    V(-0.12, 0.45, -1.15),
    V(-0.16, 0.08, -1.19),
    V(-0.26, 0.012, -1.24),
    V(-0.4, 0.012, -1.2),
    V(-0.52, 0.012, -1.3),
  ];
  rope(hang);
  for (const [end, dir] of [
    [V(-0.74, 0.013, -1.17), V(0.4, 0, 1)],
    [V(-0.52, 0.012, -1.3), V(-1, 0, -0.3)],
  ]) {
    for (const a of [-0.5, 0, 0.5]) {
      const d = dir.clone().normalize().applyAxisAngle(UP, a);
      rod(
        end,
        end
          .clone()
          .addScaledVector(d, 0.065)
          .add(V(0, 0.003, 0)),
        0.0045,
        ROPE,
        3,
      );
    }
  }
  // hem loops to their pegs, except the corner that tore free
  for (const s of [-1, 1]) {
    for (const z of PEGZ) {
      if (s < 0 && z === -ZL) continue;
      const v = (z + ZL) / (2 * ZL);
      const top = peg(s * (HW + 0.075), z, 0.25, V(s, 0, 0));
      rope(
        [
          Po(s * 0.985, v, 0.01),
          Po(s * 0.985, v, 0.01)
            .lerp(top, 0.5)
            .add(V(0, -0.005, 0)),
          top,
        ],
        0.009,
      );
    }
  }
  // the right flap's free corner, tied down to the hem peg beside it
  rope(
    [
      Po(0.79, 0.64, 0.05),
      Po(0.86, 0.66, 0.05),
      peg(0.875, 0.33, 0.25, V(1, 0, 0)).add(V(0, 0.02, 0)),
    ],
    0.009,
  );

  // --- inside: a ground sheet and the bedroll, still strapped --------------------------------
  const sheetIn = mesh(flat(new THREE.BoxGeometry(1.3, 0.01, 1.78)), LEATHER);
  sheetIn.position.set(0.01, 0.005, -0.02);
  sheetIn.rotation.y = 0.025;
  const BY = 0.01 + 0.108,
    BZ = -0.36;
  loft(
    V(-0.4, BY, BZ),
    V(0.4, BY, BZ),
    [
      [0, 0],
      [0.085, 0.004],
      [0.108, 0.04],
      [0.112, 0.5],
      [0.108, 0.96],
      [0.085, 0.996],
      [0, 1],
    ],
    8,
    BLANKET,
    0.05,
  );
  loft(
    V(-0.412, BY, BZ),
    V(0.412, BY, BZ),
    [
      [0, 0],
      [0.06, 0.002],
      [0.06, 0.998],
      [0, 1],
    ],
    8,
    CANVAS,
    0,
  );
  for (const x of [-0.22, 0.22])
    loft(
      V(x - 0.02, BY, BZ),
      V(x + 0.02, BY, BZ),
      [
        [0.116, 0],
        [0.12, 0.5],
        [0.116, 1],
      ],
      8,
      LEATHER,
      0,
    );

  // --- folded camp stool leaning on the front left pole, beside the door --------------------
  const stool = new THREE.Group();
  const FA = 0.11;
  for (const [x, a] of [
    [-0.165, FA],
    [0.165, FA],
    [-0.125, -FA],
    [0.125, -FA],
  ]) {
    const leg = mesh(
      flat(new THREE.BoxGeometry(0.036, 0.54, 0.026)),
      TIMBER,
      stool,
    );
    leg.position.set(x, 0.275, 0);
    leg.rotation.x = a;
  }
  const rz = 0.27 * Math.sin(FA);
  rod(V(-0.185, 0.52, rz), V(0.185, 0.52, rz), 0.02, TIMBER, 6, 0.02, stool);
  rod(V(-0.145, 0.52, -rz), V(0.145, 0.52, -rz), 0.02, TIMBER, 6, 0.02, stool);
  const sl = soup();
  const U = [
    [rz, 0.52],
    [rz * 0.9, 0.41],
    [0, 0.345],
    [-rz * 0.9, 0.41],
    [-rz, 0.52],
  ];
  for (let k = 0; k < U.length - 1; k++) {
    sl.quad(
      V(-0.125, U[k][1], U[k][0]),
      V(0.125, U[k][1], U[k][0]),
      V(0.125, U[k + 1][1], U[k + 1][0]),
      V(-0.125, U[k + 1][1], U[k + 1][0]),
    );
  }
  mesh(sl.geo(), BLANKET, stool);
  for (const x of [-0.145, 0.145])
    rod(
      V(x, 0.275, -0.034),
      V(x, 0.275, 0.034),
      0.013,
      BRONZE,
      6,
      0.013,
      stool,
    );
  // foot on the ground, rails resting against the pole; the seat faces out, front left
  const foot = V(-0.78, 0, ZA + 0.2),
    rest = V(-0.5, 0.52, ZA - 0.01);
  const Y1 = rest.clone().sub(foot).normalize();
  const H = V(-Y1.x, 0, -Y1.z);
  const Zp = H.addScaledVector(Y1, -H.dot(Y1)).normalize();
  stool.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(Y1.clone().cross(Zp), Y1, Zp),
  );
  stool.position.copy(foot).setY(0.045 * Math.hypot(Y1.x, Y1.z));
  g.add(stool);

  // --- placement: base on y = 0, centred on x and z ----------------------------------------
  const b3 = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mm) => {
      for (let i = 0; i < p.count; i++)
        b3.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mm));
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
  const c = b3.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= b3.min.y;
    o.position.z -= c.z;
  });
  return details.batch();
}
