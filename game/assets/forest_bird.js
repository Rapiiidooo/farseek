// forest_bird, arm B: profiles.
// A plump gliding bird 0.7 m across the wings. Body and head are one lathe
// turned about the bird's length, a fat spindle with a neck dip and a round
// head, sheared so the head rides above the back; its front-lower sector is
// cut out as the stamp-ochre breast and throat. The beak is a small lathe bent
// down into a hook. Each wing is an extruded planform whose outline carries
// five primary fingers and a scalloped trailing edge, in moss green, with a
// fern-green covert layer extruded above and below its leading half. The tail
// is one extruded fork with long outer streamers.
//
// Front +Z, up +Y, the bird's left is +X. Each wing is a Group at its shoulder,
// inside the body, with zero rotation at rest and the wing spread level; its
// geometry starts at the pivot so nothing swings out of the far side of the
// body. rotation.z = +a raises the left wing, rotation.z = -a the right one.
// Parts are baked into one mesh per material per joint.
export default function (THREE) {
  const g = new THREE.Group();
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ---- palette (farseek/docs/style-lock.md) --------------------------------
  // Every material is double-sided: the extruded blades are thin open-edged
  // slabs seen from both sides, and the game's surface pass shares one clone
  // per colour and roughness whatever the side.
  const M = (color, roughness, name) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    m.name = name;
    return m;
  };
  const FERN = M(0x7da04a, 0.8, "fabric"); // body, head, wing coverts
  const MOSS = M(0x4f7a3a, 0.84, "fabric"); // flight feathers, tail
  const OCHRE = M(0xd9a441, 0.78, "fabric"); // breast and throat
  const BASALT = M(0x3a3531, 0.45, "stone"); // beak, eyes

  // ---- joints ------------------------------------------------------------------
  // The shoulder sits inside the body so the root chord of the wing stays
  // buried at every flap angle and the joint never opens a gap.
  const SHOULDER = V(0.028, 0.022, 0.02);
  const body = g;
  const leftWing = new THREE.Group();
  leftWing.name = "leftWing";
  leftWing.position.copy(SHOULDER);
  const rightWing = new THREE.Group();
  rightWing.name = "rightWing";
  rightWing.position.set(-SHOULDER.x, SHOULDER.y, SHOULDER.z);
  g.add(leftWing, rightWing);

  // ---- geometry buckets, baked per joint and material at the end ---------------
  const buckets = new Map();
  const add = (joint, mat, geo) => {
    if (!buckets.has(joint)) buckets.set(joint, new Map());
    const byMat = buckets.get(joint);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
  };

  // Scale x and y, then shear y by f(z), carrying the normals through the same
  // map so a bent lathe stays smooth.
  const warp = (geo, sx, sy, f = () => 0, df = () => 0) => {
    const p = geo.attributes.position,
      n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      p.setXYZ(i, p.getX(i) * sx, p.getY(i) * sy + f(z), z);
      const nx = n.getX(i) / sx,
        ny = n.getY(i) / sy,
        nz = n.getZ(i) - df(z) * ny;
      const l = Math.hypot(nx, ny, nz) || 1;
      n.setXYZ(i, nx / l, ny / l, nz / l);
    }
    return geo;
  };
  const step = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const dstep = (e0, e1, x) => {
    const t = (x - e0) / (e1 - e0);
    return t <= 0 || t >= 1 ? 0 : (6 * t * (1 - t)) / (e1 - e0);
  };

  // A lathe of [axial, radius] pairs turned about +Z (tail to head order keeps
  // the normals outward).
  const latheZ = (profile, segments) =>
    new THREE.LatheGeometry(
      profile.map(([u, r]) => new THREE.Vector2(r, u)),
      segments,
    ).rotateX(Math.PI / 2);

  // Split a non-indexed geometry's triangles by a test on their centroid.
  const split = (geo, test) => {
    const p = geo.attributes.position,
      names = Object.keys(geo.attributes);
    const keep = [[], []];
    for (let t = 0; t < p.count; t += 3) {
      const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
      const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
      const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
      keep[test(cx, cy, cz) ? 0 : 1].push(t);
    }
    return keep.map((tris) => {
      const out = new THREE.BufferGeometry();
      for (const k of names) {
        const a = geo.attributes[k],
          s = a.itemSize,
          arr = new Float32Array(tris.length * 3 * s);
        tris.forEach((t, i) =>
          arr.set(a.array.subarray(t * s, (t + 3) * s), i * 3 * s),
        );
        out.setAttribute(k, new THREE.BufferAttribute(arr, s));
      }
      return out;
    });
  };

  // An extruded planform lying flat: outline in [x, z], thickness t, centred on y0.
  const slab = (outline, t, y0, bevel = 0) => {
    const shape = new THREE.Shape(
      outline.map(([x, z]) => new THREE.Vector2(x, z)),
    );
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: t,
      steps: 1,
      curveSegments: 1,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
    });
    // Shape y becomes +Z and the extrusion runs down -Y.
    return geo.rotateX(Math.PI / 2).translate(0, y0 + t / 2, 0);
  };

  // ---- body and head: one lathe, sheared so the head rides high ---------------------
  const LIFT = 0.03;
  const lift = (z) => LIFT * step(0.05, 0.13, z);
  const dlift = (z) => LIFT * dstep(0.05, 0.13, z);
  const bodyGeo = latheZ(
    [
      [-0.13, 0],
      [-0.121, 0.022],
      [-0.103, 0.039],
      [-0.075, 0.055],
      [-0.04, 0.066],
      [-0.004, 0.071],
      [0.03, 0.071],
      [0.058, 0.065],
      [0.081, 0.055],
      [0.1, 0.047],
      [0.12, 0.048],
      [0.142, 0.05],
      [0.162, 0.045],
      [0.177, 0.034],
      [0.187, 0.018],
      [0.191, 0],
    ],
    18,
  ).toNonIndexed();
  // The breast: the lower half of the chest between the rings at 0.03 and 0.1,
  // narrowing to a third of the round on the belly behind it and the throat in
  // front, chosen before the shear while the lathe's axis is still straight.
  // The lathe's 30 degree segments start at the keel, so these limits fall
  // between segments and the bib's edge follows them cleanly.
  const [breast, rest] = split(bodyGeo, (x, y, z) => {
    const a = Math.atan2(Math.abs(x), -y);
    if (z > 0.03 && z < 0.1) return a < 1.48;
    return z > -0.04 && z < 0.142 && a < 0.96;
  });
  add(body, OCHRE, warp(breast, 0.95, 1.05, lift, dlift));
  add(body, FERN, warp(rest, 0.95, 1.05, lift, dlift));

  // ---- beak: a short lathe bent down into a hook ---------------------------------------
  const BL = 0.046;
  const beak = latheZ(
    [
      [0, 0.0165],
      [0.012, 0.0155],
      [0.024, 0.0125],
      [0.034, 0.0085],
      [0.041, 0.0045],
      [0.046, 0],
    ],
    8,
  );
  warp(
    beak,
    0.8,
    1.1,
    (z) => -0.02 * (z / BL) ** 3,
    (z) => (-0.06 * z * z) / BL ** 3,
  );
  add(body, BASALT, beak.translate(0, 0.027, 0.174));

  // ---- eyes: lathed beads on the sides of the head --------------------------------------
  for (const s of [1, -1]) {
    const bead = latheZ(
      [
        [-0.0095, 0],
        [-0.0048, 0.0082],
        [0.0048, 0.0082],
        [0.0095, 0],
      ],
      6,
    );
    add(body, BASALT, bead.translate(0.036 * s, lift(0.148) + 0.03, 0.148));
  }

  // ---- tail: one fork, the outer streamers longest ---------------------------------------
  const half = [
    [0.026, 0.015],
    [0.036, -0.05],
    [0.06, -0.14],
    [0.086, -0.228],
    [0.064, -0.214],
    [0.04, -0.16],
    [0.018, -0.126],
  ];
  const tailOutline = [
    [0, 0.02],
    ...half,
    [0, -0.112],
    ...half
      .slice()
      .reverse()
      .map(([x, z]) => [-x, z]),
  ];
  add(body, MOSS, slab(tailOutline, 0.006, 0.004, 0.002).translate(0, 0, -0.1));

  // ---- left wing, in the shoulder's frame: x outward, z forward --------------------
  // The tips reach x = 0.32 from a shoulder 0.028 off the centre line: 0.7 m across.
  // The blade is the whole wing: leading edge, five primary fingers, scalloped secondaries.
  add(
    leftWing,
    MOSS,
    slab(
      [
        [0, 0.058],
        [0.06, 0.066],
        [0.12, 0.068],
        [0.165, 0.062],
        [0.21, 0.05],
        [0.25, 0.036],
        [0.27, 0.032],
        [0.316, 0.028],
        [0.322, 0.018],
        [0.316, 0.009],
        [0.288, 0.004],
        [0.316, -0.001],
        [0.319, -0.011],
        [0.311, -0.019],
        [0.282, -0.017],
        [0.307, -0.025],
        [0.307, -0.036],
        [0.298, -0.042],
        [0.271, -0.035],
        [0.291, -0.05],
        [0.287, -0.06],
        [0.277, -0.064],
        [0.254, -0.051],
        [0.268, -0.069],
        [0.261, -0.079],
        [0.25, -0.079],
        [0.234, -0.068],
        [0.215, -0.078],
        [0.2, -0.07],
        [0.18, -0.085],
        [0.162, -0.076],
        [0.14, -0.09],
        [0.12, -0.08],
        [0.098, -0.093],
        [0.078, -0.083],
        [0.056, -0.094],
        [0.035, -0.084],
        [0.015, -0.09],
        [0, -0.08],
      ],
      0.01,
      0,
    ),
  );
  // Coverts over the leading half, top and bottom, their rear edge in rows.
  const coverts = [
    [0, 0.062],
    [0.06, 0.071],
    [0.12, 0.073],
    [0.165, 0.067],
    [0.21, 0.055],
    [0.25, 0.041],
    [0.276, 0.032],
    [0.274, 0.014],
    [0.256, 0.006],
    [0.24, -0.006],
    [0.22, -0.004],
    [0.2, -0.02],
    [0.18, -0.016],
    [0.16, -0.032],
    [0.14, -0.026],
    [0.12, -0.04],
    [0.1, -0.034],
    [0.08, -0.048],
    [0.06, -0.042],
    [0.04, -0.053],
    [0.02, -0.048],
    [0, -0.056],
  ];
  add(leftWing, FERN, slab(coverts, 0.006, 0.0075));
  // The under layer is set back from the leading edge so it never shows from above.
  add(
    leftWing,
    FERN,
    slab(
      coverts.map(([x, z], i) => [x, i < 7 ? z - 0.009 : z]),
      0.006,
      -0.0075,
    ),
  );

  const feather = (joint, material, x, z, length, width, y, sweep = 0) => {
    const geo = slab(
      [
        [x - width * 0.34, z],
        [x + width * 0.34, z],
        [x + width * 0.5 + sweep * 0.3, z - length * 0.46],
        [x + sweep, z - length],
        [x - width * 0.5 + sweep * 0.3, z - length * 0.46],
      ],
      0.0015,
      y,
    );
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = THREE.MathUtils.clamp((z - p.getZ(i)) / length, 0, 1);
      p.setY(i, p.getY(i) + Math.sin(t * Math.PI) * 0.002);
    }
    geo.computeVertexNormals();
    add(joint, material, geo);
  };
  const hash = (i, k) => {
    const value = Math.sin(i * 91.7 + k * 37.3) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let i = 0; i < 14; i++) {
    const x = 0.024 + i * 0.018 + (hash(i, 1) - 0.5) * 0.006;
    feather(
      leftWing,
      hash(i, 2) < 0.2 ? MOSS : FERN,
      x,
      0.047 - 0.075 * x + (hash(i, 3) - 0.5) * 0.006,
      (0.09 - x * 0.1) * (0.88 + hash(i, 4) * 0.24),
      0.021,
      0.0125,
      0.004 + hash(i, 5) * 0.006,
    );
  }
  for (let i = 0; i < 9; i++)
    feather(
      leftWing,
      MOSS,
      0.035 + i * 0.025,
      0.015 - 0.08 * i * 0.025,
      0.072 - i * 0.002,
      0.015,
      0.01,
      -0.002,
    );
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.008;
    feather(
      body,
      i % 2 ? FERN : MOSS,
      x,
      -0.112,
      0.12 + Math.abs(i - 3) * 0.021,
      0.01,
      0.01,
      x * 0.7,
    );
  }
  for (const s of [-1, 1]) {
    const ring = new THREE.TorusGeometry(0.0085, 0.0016, 4, 10).rotateY(
      Math.PI / 2,
    );
    add(body, OCHRE, ring.translate(s * 0.04, lift(0.148) + 0.031, 0.148));
  }

  // The layers thin towards the trailing edge and the tip, so the wing reads as
  // one tapered surface instead of stacked slabs; the arch then lifts the hand.
  for (const geos of buckets.get(leftWing).values())
    for (const geo of geos) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = THREE.MathUtils.clamp(p.getX(i) / 0.322, 0, 1);
        const chord = THREE.MathUtils.clamp((p.getZ(i) + 0.09) / 0.16, 0, 1);
        const taper = (0.32 + 0.68 * chord ** 0.8) * (1 - 0.45 * u * u);
        p.setY(
          i,
          p.getY(i) * taper + 0.019 * Math.sin(Math.PI * u) - 0.004 * u * u,
        );
      }
      geo.computeVertexNormals();
    }

  // ---- right wing: the left one reflected ------------------------------------------
  // A reflection turns every triangle inside out, and a double-sided material
  // then lights it from behind, so two corners of each triangle are swapped back.
  const mirrorX = (geo) => {
    const q = geo.clone();
    const attrs = [q.attributes.position, q.attributes.normal, q.attributes.uv];
    for (let i = 0; i < attrs[0].count; i++) {
      attrs[0].setX(i, -attrs[0].getX(i));
      attrs[1].setX(i, -attrs[1].getX(i));
    }
    for (const a of attrs) {
      const arr = a.array,
        k = a.itemSize;
      for (let t = 0; t < a.count; t += 3) {
        for (let c = 0; c < k; c++) {
          const tmp = arr[(t + 1) * k + c];
          arr[(t + 1) * k + c] = arr[(t + 2) * k + c];
          arr[(t + 2) * k + c] = tmp;
        }
      }
    }
    return q;
  };
  for (const [mat, geos] of buckets.get(leftWing))
    for (const geo of geos) add(rightWing, mat, mirrorX(geo));

  // ---- bake: one mesh per material per joint ------------------------------------------
  const merge = (geos) => {
    let n = 0;
    for (const q of geos) n += q.attributes.position.count;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2);
    let o = 0;
    for (const q of geos) {
      pos.set(q.attributes.position.array, o * 3);
      nor.set(q.attributes.normal.array, o * 3);
      uv.set(q.attributes.uv.array, o * 2);
      o += q.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return out;
  };
  // ---- wing shapes: the hand folds back and down on the upstroke and flexes up under the
  // downstroke. Each is a morph target bending about the wrist (fold) or the elbow (flex),
  // weighted smoothly along the span so the wing bends instead of hinging.
  const WRIST = 0.15,
    ELBOW = 0.1;
  const bend = (geo, sign) => {
    const p = geo.attributes.position,
      n = geo.attributes.normal;
    const targets = { fold: [[], []], flex: [[], []] };
    const v = V(),
      rot = new THREE.Quaternion(),
      euler = new THREE.Euler();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        span = Math.abs(x);
      const shapes = [
        ["fold", WRIST, step(WRIST - 0.03, WRIST + 0.05, span)],
        ["flex", ELBOW, step(ELBOW + 0.02, 0.32, span)],
      ];
      for (const [name, pivot, w] of shapes) {
        const fold = name === "fold";
        euler.set(
          0,
          fold ? sign * 0.55 * w : 0,
          fold ? -sign * 0.62 * w : sign * 0.42 * w,
          "YZX",
        );
        rot.setFromEuler(euler);
        v.set((x - sign * pivot) * (fold ? 1 - 0.18 * w : 1), y, z)
          .applyQuaternion(rot)
          .add(V(sign * pivot, 0, 0));
        targets[name][0].push(v.x, v.y, v.z);
        v.set(n.getX(i), n.getY(i), n.getZ(i)).applyQuaternion(rot);
        targets[name][1].push(v.x, v.y, v.z);
      }
    }
    geo.morphAttributes.position = [];
    geo.morphAttributes.normal = [];
    for (const [name, [position, normal]] of Object.entries(targets)) {
      const a = new THREE.Float32BufferAttribute(position, 3);
      a.name = name;
      geo.morphAttributes.position.push(a);
      const b = new THREE.Float32BufferAttribute(normal, 3);
      b.name = name;
      geo.morphAttributes.normal.push(b);
    }
    return geo;
  };
  for (const [joint, byMat] of buckets)
    for (const [mat, geos] of byMat) {
      const geo = merge(geos);
      const sign = joint === leftWing ? 1 : joint === rightWing ? -1 : 0;
      joint.add(new THREE.Mesh(sign ? bend(geo, sign) : geo, mat));
    }

  // ---- placement: base at y = 0, centred on x and z, measured on vertices -----------
  // The shift moves the root's children, wing Groups included, so the pivots
  // travel with the body and stay at the shoulders.
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
  g.updateMatrixWorld(true);

  g.userData.parts = { leftWing, rightWing };
  g.userData.wingShapes = ["fold", "flex"];
  return g;
}
