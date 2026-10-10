import { refineNature } from "../nature-detail.js";

// basalt_spire, arm B: profiles.
// Each column is a six-segment lathe, so its cross-section is a hexagon while
// its profile carries the form: a flared root that melts into the others,
// V-notched joint rings, a slow taper and a sheared fracture with a glassy face.
// The whole column then turns slowly about its own axis, which columnar basalt
// never does on Earth. Ash-lilac streaks are extruded flame-shaped outlines on
// the faces that tilt towards the sky, with thinner seams on the shaded side, and
// a lumpy lathed mound of cooled lava fuses the roots.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (hex, rough) => {
    const m = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: rough,
      metalness: 0,
    });
    m.name = "stone";
    return m;
  };
  const BASALT = mat(0x2a2830, 0.8);
  const GLASS = mat(0x2a2830, 0.28); // fresh fracture: the same rock, glassy
  const LILAC = mat(0x8c7fa3, 0.92);

  let seed = 31337;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const rr = (a, b) => a + (b - a) * rnd();
  const UP = new THREE.Vector3(0, 1, 0);
  const add = (geo, m) => {
    const mesh = new THREE.Mesh(geo, m);
    g.add(mesh);
    return mesh;
  };
  const axis = (tilt, az) =>
    new THREE.Vector3(
      Math.sin(tilt) * Math.cos(az),
      Math.cos(tilt),
      Math.sin(tilt) * Math.sin(az),
    );
  const place = (geo, base, dir, turn) => {
    geo.rotateY(turn);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
    geo.translate(base.x, base.y, base.z);
    return geo;
  };
  // points are [radius, height] from the root upwards; six segments make a hexagon
  const lathe = (pts, seg = 6) =>
    new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
    );
  const shear = (geo, yFrom, slope, ang) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < yFrom - 1e-4) continue;
      p.setY(
        i,
        p.getY(i) +
          slope * (p.getX(i) * Math.cos(ang) + p.getZ(i) * Math.sin(ang)),
      );
    }
    return geo;
  };
  // extruded flame: narrow at the root, widest near the top, thin in depth
  const flame = (len, w, n = 10) => {
    const s = new THREE.Shape();
    const side = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      side.push([
        w * Math.pow(Math.sin(Math.PI * t), 0.6) * (0.4 + 0.6 * t),
        t * len,
      ]);
    }
    s.moveTo(0, 0);
    side.forEach(([x, y]) => s.lineTo(x * 0.5, y));
    for (let i = side.length - 1; i >= 0; i--)
      s.lineTo(-side[i][0] * 0.5, side[i][1]);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.14,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -0.1); // mostly buried, 2 to 6 cm proud of the tapering face
    geo.rotateY(Math.PI / 2); // lie on a face that looks towards +x
    return geo;
  };

  // turn every vertex about the column's own axis in proportion to its height
  const twistGeo = (geo, twist, len) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = (twist * Math.max(0, p.getY(i))) / len,
        x = p.getX(i),
        z = p.getZ(i);
      p.setX(i, x * Math.cos(a) - z * Math.sin(a));
      p.setZ(i, x * Math.sin(a) + z * Math.cos(a));
    }
    return geo;
  };

  const column = ({
    base,
    tilt,
    az,
    len,
    r,
    notches,
    slope,
    cutAz,
    twist,
    streaks,
  }) => {
    const dir = axis(tilt, az),
      turn = Math.PI - az; // turn: the +x face ends up facing the sky
    const rad = (y) => r * (1 - (0.1 * Math.max(0, y)) / len);
    const pts = [
      [0, -0.9],
      [1.55 * r, -0.9],
      [1.42 * r, -0.1],
      [1.18 * r, 0.5],
      [rad(1.1), 1.1],
    ];
    for (const f of notches) {
      const y = f * len,
        rj = rad(y);
      pts.push([rj, y - 0.06], [rj * 0.9, y], [rj, y + 0.06]);
    }
    const top = len - 0.3,
      rt = rad(top);
    pts.push([rt, top]);
    // body, break and streaks share one twist, so the streaks stay on their faces
    const finish = (geo, m) =>
      add(place(twistGeo(geo, twist, len), base.clone(), dir, turn), m);
    finish(
      shear(lathe([...pts, [rt * 0.001, top]]), top, slope, cutAz),
      BASALT,
    );
    finish(
      shear(
        lathe([
          [rt, top],
          [rt * 0.96, top + 0.03],
          [0, top + 0.03],
        ]),
        top - 0.01,
        slope,
        cutAz,
      ),
      GLASS,
    );
    // face 0 is the one looking at the sky once tilted; -1 and 1 are its neighbours
    // a streak must stop below the lowest point of the sloping break, or it pokes out
    const toMax = (top - slope * rt - 0.15) / len;
    for (const [face, from, to0, off, w] of streaks) {
      const to = Math.min(to0, toMax);
      const geo = flame((to - from) * len, w, Math.abs(face) > 1 ? 6 : 10);
      geo.translate(
        rad(((from + to) / 2) * len) * Math.cos(Math.PI / 6),
        from * len,
        off,
      );
      geo.rotateY((-face * Math.PI) / 3);
      finish(geo, LILAC);
    }
  };

  // faces 2, -2 and 3 are the shaded side
  column({
    base: new THREE.Vector3(-0.2, 0, 0.1),
    tilt: 0.12,
    az: 0.35,
    len: 9.1,
    r: 0.8,
    notches: [0.19, 0.31, 0.46, 0.57, 0.72, 0.87],
    slope: 0.62,
    cutAz: 2.4,
    twist: 0.36,
    streaks: [
      [0, 0.42, 0.98, 0.02, 0.5],
      [1, 0.55, 0.94, -0.04, 0.22],
      [-1, 0.62, 0.92, 0.06, 0.18],
      [3, 0.58, 0.9, 0.0, 0.22],
      [-2, 0.7, 0.93, 0.03, 0.14],
    ],
  });
  column({
    base: new THREE.Vector3(0.5, 0, -0.45),
    tilt: 0.25,
    az: -1.1,
    len: 6.9,
    r: 0.65,
    notches: [0.22, 0.43, 0.58, 0.8],
    slope: 0.75,
    cutAz: 0.4,
    twist: -0.3,
    streaks: [
      [0, 0.36, 0.98, 0.0, 0.42],
      [-1, 0.5, 0.92, 0.04, 0.18],
      [2, 0.52, 0.88, -0.02, 0.17],
    ],
  });
  column({
    base: new THREE.Vector3(-0.55, 0, -0.5),
    tilt: 0.31,
    az: 3.7,
    len: 5.2,
    r: 0.58,
    notches: [0.32, 0.53, 0.8],
    slope: 0.5,
    cutAz: -1.2,
    twist: 0.28,
    streaks: [
      [0, 0.33, 0.97, 0.0, 0.38],
      [1, 0.55, 0.92, 0.0, 0.16],
      [3, 0.5, 0.86, 0.02, 0.15],
    ],
  });

  // a mound of cooled lava fusing the roots: a lathed dome with a jittered rim
  {
    const geo = lathe(
      [
        [0, 0],
        [2.0, 0],
        [1.92, 0.14],
        [1.62, 0.34],
        [1.3, 0.6],
        [1.0, 0.9],
        [0.62, 1.15],
        [0, 1.25],
      ],
      11,
    );
    const p = geo.attributes.position,
      seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(key)) {
        const rad = Math.hypot(p.getX(i), p.getZ(i));
        const k = rad > 1e-3 ? rr(0.8, 1.1) : 1;
        seen.set(key, [
          p.getX(i) * k,
          p.getY(i) > 1e-3 ? p.getY(i) * rr(0.75, 1.3) : 0,
          p.getZ(i) * k,
        ]);
      }
      const [x, y, z] = seen.get(key);
      p.setXYZ(i, x, y, z);
    }
    geo.scale(1, 1, 0.92);
    geo.translate(0.05, 0, -0.2);
    add(geo, BASALT);
  }
  // broken stubs around the foot, some tipped over, with glassy or ash-skinned breaks
  for (const [ang, dist, r, h, tip] of [
    [0.3, 1.62, 0.38, 0.95, 0.1],
    [1.5, 1.6, 0.3, 0.5, 0.35],
    [2.4, 1.68, 0.42, 1.25, 0.05],
    [3.6, 1.6, 0.33, 0.65, 0.25],
    [4.6, 1.55, 0.36, 0.8, 0.15],
    [5.5, 1.72, 0.26, 0.4, 0.4],
  ]) {
    const top = h - 0.2,
      slope = rr(0.3, 0.8),
      cut = rr(0, 6.28),
      turn = rr(0, 1);
    const body = lathe([
      [0, -0.2],
      [r * 1.25, -0.2],
      [r * 1.08, 0.12],
      [r, 0.3],
      [r * 0.96, top],
      [0.001, top],
    ]);
    const cap = lathe([
      [r * 0.96, top],
      [r * 0.92, top + 0.025],
      [0, top + 0.025],
    ]);
    const dir = axis(tip, ang),
      base = new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    add(place(shear(body, top, slope, cut), base, dir, turn), BASALT);
    add(
      place(shear(cap, top - 0.01, slope, cut), base, dir, turn),
      ang === 1.5 ? LILAC : GLASS,
    );
  }

  // --- flat facets, flatten what went below the ground, fix the height ------
  // Lathe normals are smooth around the revolution and would shade a hexagon
  // round; de-indexing and recomputing gives every facet its own normal.
  // Lathes close at the axis with zero-area triangles, and pressing buried
  // walls onto the ground flattens them into lines; both are dropped so every
  // remaining vertex carries a real facet normal.
  const solid = (geo) => {
    const p = geo.attributes.position,
      uv = geo.attributes.uv,
      P = [],
      U = [];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-12) continue;
      for (let j = i; j < i + 3; j++) {
        P.push(p.getX(j), p.getY(j), p.getZ(j));
        U.push(uv.getX(j), uv.getY(j));
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    return out;
  };
  const bb = new THREE.Box3(),
    v = new THREE.Vector3();
  for (const m of g.children) {
    const flat = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const fp = flat.attributes.position;
    for (let i = 0; i < fp.count; i++) if (fp.getY(i) < 0) fp.setY(i, 0);
    const geo = solid(flat);
    geo.computeVertexNormals();
    m.geometry = geo;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++)
      bb.expandByPoint(v.fromBufferAttribute(p, i));
  }
  const k = 9 / bb.max.y;
  for (const m of g.children) m.geometry.scale(k, k, k);

  // --- place: base on y = 0, centred on x and z -----------------------------
  const box = new THREE.Box3(),
    mm = new THREE.Matrix4(),
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
        put(mm.multiplyMatrices(n.matrixWorld, im));
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
  return refineNature(THREE, g, "basalt_spire");
}
