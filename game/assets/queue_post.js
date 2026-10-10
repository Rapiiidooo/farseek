import { propDetails } from "../props-detail.js";

// queue_post, arm C: a second reading, still revolved and swept.
// A heavier builders' stanchion: a three-tier basalt base with two incised grooves, a
// slim bronze post ringed by collars at foot and head, and a warden-chalk ball girdled
// by a bronze band that carries the two eyes. The rope is read as rope, not hose: three
// stamp-ochre strands twisted round a catenary, bound by flared bronze ferrules, ending
// in a swept J-hook whose crown sits in the next post's -x eye, 1.4 m along +x.
export default function (THREE) {
  const g = new THREE.Group();
  const details = propDetails(THREE, g);

  // ---- materials --------------------------------------------------------------
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const BASALT = M(0x3a3531, "stone", 0.84);
  const BRONZE = M(0x9a6a35, "metal", 0.45, 0.6);
  const CHALK = M(0xc9c2d8, "plaster", 0.7);
  const OCHRE = M(0xd9a441, "fabric", 0.9);

  // ---- merging: one mesh per material -------------------------------------------
  // UVs are projected from each face's dominant axis over the merged mesh's box, so
  // the loader's surfaces keep one texel density across big and small parts.
  const boxUv = (pos, n) => {
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n * 3; i++) {
      lo[i % 3] = Math.min(lo[i % 3], pos[i]);
      hi[i % 3] = Math.max(hi[i % 3], pos[i]);
    }
    const su = Math.max(hi[0] - lo[0], hi[2] - lo[2]) || 1,
      sv = hi[1] - lo[1] || 1;
    const uv = new Float32Array(n * 2);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let t = 0; t < n; t += 3) {
      a.fromArray(pos, t * 3);
      b.fromArray(pos, t * 3 + 3);
      c.fromArray(pos, t * 3 + 6);
      const f = b.sub(a).cross(c.sub(a));
      const ax = Math.abs(f.x),
        ay = Math.abs(f.y),
        az = Math.abs(f.z);
      for (let k = t; k < t + 3; k++) {
        const x = pos[k * 3] - lo[0],
          y = pos[k * 3 + 1] - lo[1],
          z = pos[k * 3 + 2] - lo[2];
        const [u, v] =
          ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
        uv[k * 2] = u / su;
        uv[k * 2 + 1] = v / sv;
      }
    }
    return new THREE.BufferAttribute(uv, 2);
  };
  const merge = (geos) => {
    const flat = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    let n = 0;
    for (const x of flat) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3);
    let o = 0;
    for (const x of flat) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      o += x.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", boxUv(pos, n));
    return out;
  };
  const PARTS = new Map();
  const put = (mat, geo) => {
    if (!PARTS.has(mat)) PARTS.set(mat, []);
    PARTS.get(mat).push(geo);
    return geo;
  };

  // ---- profile tools --------------------------------------------------------------
  const fixNormals = (geo) => {
    const nr = geo.attributes.normal,
      v = new THREE.Vector3();
    for (let k = 0; k < nr.count; k++) {
      v.fromBufferAttribute(nr, k).normalize();
      nr.setXYZ(k, v.x, v.y, v.z);
    }
    return geo;
  };
  const lathe = (mat, pts, segs, smooth = false) => {
    if (smooth)
      return put(
        mat,
        fixNormals(
          new THREE.LatheGeometry(
            pts.map(([r, y]) => new THREE.Vector2(r, y)),
            segs,
          ),
        ),
      );
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i][0] === 0 && pts[i + 1][0] === 0) continue;
      put(
        mat,
        fixNormals(
          new THREE.LatheGeometry(
            [new THREE.Vector2(...pts[i]), new THREE.Vector2(...pts[i + 1])],
            segs,
          ),
        ),
      );
    }
  };
  const along = (geo, from, dir) => {
    geo.applyMatrix4(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir,
        ),
      ),
    );
    return geo.translate(from.x, from.y, from.z);
  };

  // ---- the stanchion ----------------------------------------------------------------
  // three tiers, an incised groove round the lowest, a raised seat for the post
  lathe(
    BASALT,
    [
      [0.175, 0],
      [0.175, 0.01],
      [0.166, 0.015],
      [0.166, 0.021],
      [0.175, 0.026],
      [0.175, 0.032],
      [0.158, 0.043],
      [0.138, 0.043],
      [0.138, 0.062],
      [0.12, 0.074],
      [0.092, 0.074],
      [0.092, 0.086],
      [0.04, 0.094],
      [0, 0.094],
    ],
    16,
  );
  // post with collars at foot and head
  lathe(
    BRONZE,
    [
      [0.04, 0.094],
      [0.04, 0.104],
      [0.026, 0.114],
      [0.018, 0.13],
      [0.016, 0.8],
      [0.025, 0.81],
      [0.025, 0.826],
      [0.018, 0.834],
      [0.026, 0.846],
      [0.026, 0.86],
      [0.02, 0.866],
      [0.042, 0.894],
      [0, 0.894],
    ],
    8,
  );
  // the ball and its bronze girdle
  const ball = [];
  for (let k = 0; k <= 8; k++) {
    const t = -Math.PI / 2 + (Math.PI * k) / 8;
    ball.push([
      Math.max(0.001, 0.063 * Math.cos(t)),
      0.937 + 0.063 * Math.sin(t),
    ]);
  }
  lathe(CHALK, ball, 12, true);
  lathe(
    BRONZE,
    [
      [0.0625, 0.922],
      [0.067, 0.924],
      [0.067, 0.936],
      [0.0625, 0.938],
    ],
    12,
  );
  const EYE = 0.082,
    EY = 0.93;
  for (const s of [-1, 1]) {
    put(
      BRONZE,
      new THREE.CylinderGeometry(0.009, 0.009, 0.022, 6)
        .rotateZ(Math.PI / 2)
        .translate(s * 0.07, EY, 0),
    );
    put(
      BRONZE,
      new THREE.TorusGeometry(0.017, 0.006, 4, 10)
        .rotateY(Math.PI / 2)
        .translate(s * EYE, EY, 0),
    );
  }

  // ---- the rope: three strands twisted round a catenary ------------------------------
  const SPAN = 1.4,
    SAG = 0.27;
  const A0 = new THREE.Vector3(EYE + 0.03, EY - 0.035, 0);
  const A1 = new THREE.Vector3(SPAN - EYE - 0.05, EY - 0.045, 0);
  const half = (A1.x - A0.x) / 2,
    xm = (A0.x + A1.x) / 2,
    yEnds = (A0.y + A1.y) / 2;
  let lo = 0.05,
    hi = 5;
  for (let i = 0; i < 60; i++) {
    const a = (lo + hi) / 2;
    if (a * (Math.cosh(half / a) - 1) > SAG) lo = a;
    else hi = a;
  }
  const ca = (lo + hi) / 2;
  const cat = (x) =>
    yEnds -
    SAG +
    ca * (Math.cosh((x - xm) / ca) - 1) +
    ((A1.y - A0.y) * (x - xm)) / (A1.x - A0.x);
  const cpts = [];
  for (let i = 0; i <= 30; i++) {
    const x = A0.x + ((A1.x - A0.x) * i) / 30;
    cpts.push(new THREE.Vector3(x, cat(x), 0));
  }
  const core = new THREE.CatmullRomCurve3(cpts);
  const LEN = core.getLength(),
    PITCH = 0.2,
    OFF = 0.0105,
    STRAND = 0.0125,
    STEPS = 96;
  const Z = new THREE.Vector3(0, 0, 1);
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS,
        p = core.getPointAt(u),
        t = core.getTangentAt(u);
      const n = new THREE.Vector3().crossVectors(Z, t).normalize();
      const phi = (2 * Math.PI * u * LEN) / PITCH + (2 * Math.PI * k) / 3;
      pts.push(
        p
          .addScaledVector(n, OFF * Math.cos(phi))
          .addScaledVector(Z, OFF * Math.sin(phi)),
      );
    }
    put(
      OCHRE,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        40,
        STRAND,
        4,
        false,
      ),
    );
  }
  // flared bronze ferrules bind both ends
  const ferrule = (at, dir) => {
    const geo = new THREE.LatheGeometry(
      [
        [0.022, -0.032],
        [0.03, -0.026],
        [0.028, 0.0],
        [0.03, 0.026],
        [0.022, 0.032],
        [0.012, 0.032],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      8,
    );
    put(BRONZE, along(fixNormals(geo), at, dir));
  };
  const t0 = core.getTangentAt(0),
    t1 = core.getTangentAt(1);
  ferrule(A0.clone().addScaledVector(t0, 0.01), t0);
  ferrule(A1.clone().addScaledVector(t1, -0.01), t1);
  put(
    BRONZE,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        A0.clone().addScaledVector(t0, -0.02),
        new THREE.Vector3(EYE + 0.012, EY - 0.014, 0),
        new THREE.Vector3(EYE, EY + 0.004, 0),
      ]),
      6,
      0.006,
      5,
    ),
  );

  // ---- the hook: a J swept from the far ferrule, its crown on the next post's -x eye -----
  const NX = SPAN - EYE;
  const J = [
    A1.clone().addScaledVector(t1, 0.02),
    new THREE.Vector3(NX - 0.024, EY - 0.03, 0),
    new THREE.Vector3(NX - 0.02, EY - 0.008, 0),
    new THREE.Vector3(NX, EY + 0.004, 0),
    new THREE.Vector3(NX + 0.02, EY - 0.008, 0),
    new THREE.Vector3(NX + 0.022, EY - 0.03, 0),
  ];
  put(
    BRONZE,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(J), 12, 0.0065, 4),
  );
  put(
    BRONZE,
    new THREE.SphereGeometry(0.009, 6, 4).translate(J[5].x, J[5].y, 0),
  );

  for (const y of [0.15, 0.19, 0.735, 0.775])
    put(
      BRONZE,
      new THREE.TorusGeometry(0.019, 0.003, 4, 12)
        .rotateX(Math.PI / 2)
        .translate(0, y, 0),
    );
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    put(
      BRONZE,
      new THREE.SphereGeometry(0.006, 6, 4).translate(
        Math.sin(a) * 0.139,
        0.06,
        Math.cos(a) * 0.139,
      ),
    );
    put(
      BRONZE,
      new THREE.BoxGeometry(0.008, 0.031, 0.008).translate(
        Math.sin(a) * 0.042,
        0.976,
        Math.cos(a) * 0.042,
      ),
    );
  }
  for (const [mat, geos] of PARTS) g.add(new THREE.Mesh(merge(geos), mat));

  // ---- placement: base at y = 0, centred on x and z (measured on vertices) ---------
  const bb = new THREE.Box3(),
    v = new THREE.Vector3(),
    m = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const add = (mat) => {
      for (let i = 0; i < p.count; i++)
        bb.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        add(m.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    add(n.matrixWorld);
  });
  const c = bb.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= bb.min.y;
    o.position.z -= c.z;
  });

  // Line posts up by putting the next post's `post` point on this one's `nextPost`.
  const at = (x, y, z) => [
    +(x - c.x).toFixed(3),
    +(y - bb.min.y).toFixed(3),
    +(z - c.z).toFixed(3),
  ];
  g.userData.post = at(0, 0, 0);
  g.userData.nextPost = at(SPAN, 0, 0);
  return details.batch();
}
