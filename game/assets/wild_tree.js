import { refineNature } from "../nature-detail.js";
import { canopyBranches } from "../canopy-leaves.js";
import { canopyMaterial } from "../leaf-surface.js";
import {
  fitBarkUV,
  gridRings,
  mossWeights,
  patchNoise,
  ringUV,
  tintMoss,
} from "../forest-sea-nature-bark.js";

// wild_tree, arm B: built from profiles.
// The bole is a loft: rings of a five-lobed section, swollen at the foot, that turn about the
// axis as they rise, so the flutes wind up the trunk. Each buttress root follows a side profile,
// tall against the bole and falling in a concave curve to the ground 3 m out: a rounded crest
// whose flanks flare down to the ground, curving a little in plan and running on past the tip
// as a sinking surface root. Limbs, branches and vines are tubes swept along curves with a
// tapering radius; the vine leaves are extruded blades. The crown is eleven cushions turned on a
// lathe and pushed into lumps, fern green high up and moss green lower down. Bark coordinates run
// along and around every part in metres; moss tints the bark where it faces up near the ground.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color, roughness, name) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
    });
    m.name = name;
    return m;
  };
  const BARK = mat(0x5a4030, 0.95, "timber");
  const MOSS = mat(0x4f7a3a, 0.9, "foliage");
  const FERN = mat(0x7da04a, 0.85, "foliage");
  const LEAF_MOSS = canopyMaterial(THREE, 0x4f7a3a);
  const LEAF_FERN = canopyMaterial(THREE, 0x7da04a);
  const TILE = 0.8; // metres of bark per texture tile

  let seed = 240926;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const rr = (a, b) => a + (b - a) * rnd();
  const D = Math.PI / 180;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  const at = (deg, r, y) => V(Math.sin(deg * D) * r, y, Math.cos(deg * D) * r);
  // a millimetre grid key for a vertex; toFixed would tell -0.000 from 0.000 and split a seam
  const key = (x, y, z) =>
    `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;

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
  // a tube along a curve whose radius follows rad(t); bark takes metric coordinates
  const sweep = (curve, rad, TS, RS, bark = false) => {
    const tube = new THREE.TubeGeometry(curve, TS, 1, RS, false);
    const p = tube.attributes.position,
      c = new THREE.Vector3(),
      w = new THREE.Vector3();
    for (let i = 0; i <= TS; i++) {
      const t = i / TS,
        r = rad(t);
      curve.getPointAt(t, c);
      for (let j = 0; j <= RS; j++) {
        const k = i * (RS + 1) + j;
        w.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
        p.setXYZ(k, w.x, w.y, w.z);
      }
    }
    if (bark)
      tube.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          ringUV(gridRings(THREE, tube, RS + 1), TILE),
          2,
        ),
      );
    return tube;
  };
  const curve = (pts) => new THREE.CatmullRomCurve3(pts, false, "centripetal");

  // ---- the bole: a lofted, five-lobed section that turns as it rises -------------------------
  const TOP = 8.8,
    TW = 0.12,
    PH = 14 * D; // top, twist (rad per m), first flute at the foot
  const lean = (y) => {
    const s = Math.max(0, y) / TOP;
    return V(0.24 * s * s, 0, -0.16 * s * s);
  };
  const Rb = (y) => 0.6 + 0.2 * (1 - y / TOP) + 0.45 * Math.exp(-y / 0.6);
  const Ab = (y) => 0.07 + 0.2 * Math.exp(-y / 1.1);
  const YS = [
    0, 0.18, 0.42, 0.75, 1.15, 1.65, 2.3, 3.1, 4.0, 5.0, 6.0, 7.0, 7.9, 8.8,
  ];
  const RS = 20;
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  {
    const rings = [],
      idx = [];
    const rows = YS.length + 1; // and a last row gathered to a point on top
    for (let i = 0; i < rows; i++) {
      const y = i < YS.length ? YS[i] : TOP + 0.3,
        l = lean(y),
        ring = [];
      for (let j = 0; j <= RS; j++) {
        const th = (j / RS) * Math.PI * 2;
        const r =
          i < YS.length
            ? Rb(y) * (1 + Ab(y) * Math.cos(5 * (th - PH - TW * y)))
            : 0;
        ring.push(V(l.x + Math.sin(th) * r, y, l.z + Math.cos(th) * r));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < RS; j++) {
        const a = i * (RS + 1) + j,
          b = a + 1,
          c = a + RS + 1,
          d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        rings.flat().flatMap((q) => [q.x, q.y, q.z]),
        3,
      ),
    );
    geo.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(ringUV(rings, TILE), 2),
    );
    geo.setIndex(idx);
    // moss round the foot, climbing higher on one side, in patches
    const foot = (p) => {
      const side = 0.5 + 0.5 * Math.sin(Math.atan2(p.x, p.z) + 0.8);
      return (
        0.85 * (1 - smooth(0.2, 1.1 + 0.9 * side, p.y)) +
        0.5 * patchNoise(p.x * 1.6, p.y * 1.3, p.z * 1.6) -
        0.3
      );
    };
    add(mossWeights(THREE, weld(geo), foot), BARK);
  }

  // ---- buttress roots: a rounded crest swept down a concave side profile -----------------------------
  // [azimuth, height against the bole, reach]; each sits on a flute, where it meets the bole.
  // Rounded flanks keep the buttresses solid where trunk collisions are measured from them.
  const ROOTS = [
    [22, 4.0, 3.2],
    [95, 3.6, 3.0],
    [167, 4.2, 3.35],
    [237, 3.5, 3.05],
    [310, 3.9, 3.2],
  ];
  const DEPTHS = [1, 0.55, 0.22],
    ARC = 5,
    GROUND = -0.18;
  const rootMoss = (p, n) =>
    1.4 * (n.y - 0.35) +
    0.4 * (1 - smooth(0.1, 1.0, p.y)) +
    0.5 * patchNoise(p.x * 1.4, p.y * 1.2, p.z * 1.4) -
    0.6 * smooth(1.5, 3, p.y);
  ROOTS.forEach(([deg, H, L], i) => {
    const crest = new THREE.CubicBezierCurve(
      new THREE.Vector2(0.28, H),
      new THREE.Vector2(0.95, 0.6 * H),
      new THREE.Vector2(1.5, 0.75),
      new THREE.Vector2(L, 0.16),
    );
    const NS = 13,
      curl = i % 2 ? -10 : 10,
      sections = [];
    for (let k = 0; k <= NS; k++) {
      const t = k / NS,
        q =
          t < 0.8
            ? crest.getPoint(t / 0.8)
            : new THREE.Vector2(
                L + ((t - 0.8) / 0.2) * 0.85,
                0.2 - ((t - 0.8) / 0.2) * 0.14,
              );
      const az = (deg + curl * t * t) * D,
        side = V(Math.cos(az), 0, -Math.sin(az)),
        C = V(Math.sin(az) * q.x, q.y, Math.cos(az) * q.x);
      const rc = 0.24 - 0.12 * t,
        wb = rc + (0.42 - 0.3 * t) * (1 - smooth(0.75, 1, t));
      const across = [];
      const flank = (s, sign) => {
        const y = C.y - rc - (C.y - rc - GROUND) * s;
        across.push([sign * (rc + (wb - rc) * s ** 2.5), y]);
      };
      for (const s of DEPTHS) flank(s, -1);
      for (let a = 0; a <= ARC - 1; a++) {
        const th = Math.PI * (1 - a / (ARC - 1));
        across.push([rc * Math.cos(th), C.y - rc + rc * Math.sin(th)]);
      }
      for (const s of [...DEPTHS].reverse()) flank(s, 1);
      sections.push(
        across.map(([x, y]) =>
          V(C.x + side.x * x, Math.max(GROUND, y), C.z + side.z * x),
        ),
      );
    }
    const cols = sections[0].length,
      pos = [],
      uvs = [],
      idx = [];
    let along = 0;
    sections.forEach((row, k) => {
      if (k)
        along += row[(cols - 1) >> 1].distanceTo(
          sections[k - 1][(cols - 1) >> 1],
        );
      let s = 0;
      row.forEach((q, j) => {
        if (j) s += q.distanceTo(row[j - 1]);
        pos.push(q.x, q.y, q.z);
        uvs.push(s, along);
      });
    });
    for (let k = 0; k < NS; k++)
      for (let j = 0; j < cols - 1; j++) {
        const a = k * cols + j,
          b = a + cols,
          c = a + 1,
          d = b + 1;
        idx.push(a, b, c, c, b, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    add(mossWeights(THREE, geo, rootMoss), BARK);
  });

  // ---- the crown: [azimuth, distance out, height, radius, half height, fern?] -------------------
  const CLUMPS = [
    [34, 4.4, 11.5, 2.7, 1.6, 0],
    [156, 4.4, 11.2, 2.8, 1.6, 0],
    [272, 4.5, 11.7, 2.7, 1.6, 0], // limb ends
    [96, 4.7, 10.6, 2.2, 1.3, 0],
    [214, 4.8, 10.4, 2.2, 1.3, 1],
    [334, 4.7, 10.8, 2.3, 1.35, 0], // low rim
    [70, 2.4, 13.3, 2.5, 1.5, 1],
    [190, 2.5, 13.1, 2.5, 1.5, 1],
    [310, 2.3, 13.5, 2.4, 1.45, 1], // upper
    [128, 3.0, 12.3, 2.0, 1.2, 1],
    [0, 0.4, 14.7, 2.3, 1.2, 1], // between, top
  ];
  const centre = (k) => {
    const [deg, r, y] = CLUMPS[k];
    return at(deg, r, y);
  };

  // ---- limbs and branches: swept tubes -------------------------------------------------------------
  // [azimuth, clumps fed (its own end first)]
  const LIMBS = [
    [34, [0, 3, 6, 10]],
    [156, [1, 4, 7, 9]],
    [272, [2, 5, 8]],
  ];
  const limbCurves = LIMBS.map(([deg, feeds]) => {
    const c = curve(
      [
        at(deg - 18, 0.05, 6.9),
        at(deg - 14, 0.6, 8.5),
        at(deg - 9, 1.5, 9.6),
        at(deg - 5, 2.5, 10.4),
        at(deg - 1, 3.4, 11.0),
        at(deg + 1, 3.9, 11.3),
      ].map((q) => q.add(lean(TOP))),
    );
    add(
      sweep(c, (t) => 0.52 - 0.36 * Math.pow(t, 0.85), 22, 8, true),
      BARK,
    );
    feeds.slice(1).forEach((k, j) => {
      const s = c.getPointAt(0.42 + 0.1 * j),
        e = s.clone().lerp(centre(k), 0.82);
      const m = s
        .clone()
        .lerp(e, 0.5)
        .add(V(0, 0.35, 0));
      add(
        sweep(curve([s, m, e]), (t) => 0.21 - 0.14 * t, 8, 6, true),
        BARK,
      );
    });
    return c;
  });

  // ---- clumps: cushions turned on a lathe, then pushed into lumps ---------------------------------
  const PROF = [
    [0, -0.62],
    [0.45, -0.66],
    [0.8, -0.44],
    [1, -0.02],
    [0.92, 0.42],
    [0.66, 0.76],
    [0.33, 0.95],
    [0, 1],
  ];
  for (const [deg, r, y, R, H, fern] of CLUMPS) {
    const geo = new THREE.LatheGeometry(
      PROF.map(([a, b]) => new THREE.Vector2(a, b)),
      11,
    );
    const p = geo.attributes.position,
      seen = new Map(),
      f1 = rr(0, 6.28),
      f2 = rr(0, 6.28);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        yy = p.getY(i),
        z = p.getZ(i);
      const k = key(x, yy, z);
      if (!seen.has(k)) {
        const a = Math.atan2(x, z);
        const lob =
          1 +
          0.13 * Math.sin(3 * a + f1) +
          0.07 * Math.sin(5 * a + f2) +
          rr(-0.06, 0.06);
        seen.set(k, [x * lob * R, (yy + rr(-0.07, 0.07)) * H, z * lob * R]);
      }
      const q = seen.get(k);
      p.setXYZ(i, q[0], q[1], q[2]);
    }
    const c = at(deg, r, y),
      turn = rr(0, 6.28);
    add(
      canopyBranches(THREE, R, H, deg, geo, "C")
        .rotateY(turn)
        .translate(c.x, c.y, c.z),
      fern ? LEAF_FERN : LEAF_MOSS,
    );
    geo.scale(0.72, 0.72, 0.72);
    add(weld(geo.rotateY(turn).translate(c.x, c.y, c.z)), fern ? FERN : MOSS);
  }

  // ---- vines: swept tubes hanging from the limbs, with extruded leaf blades ------------------------
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.17, 0.16, 0, 0.46);
  leafShape.quadraticCurveTo(-0.17, 0.16, 0, 0);
  const LEAF = new THREE.ExtrudeGeometry(leafShape, {
    depth: 0.035,
    bevelEnabled: false,
    curveSegments: 3,
  })
    .translate(0, 0, -0.0175)
    .scale(1.35, 1.3, 1);
  [
    [0, 0.64],
    [1, 0.5],
    [1, 0.7],
    [2, 0.6],
  ].forEach(([li, t], i) => {
    const top = limbCurves[li].getPointAt(t),
      drop = 3.4 + 0.2 * i,
      sw = rr(0, 6.28);
    const pts = [top.clone().add(V(0, 0.2, 0))];
    for (let k = 1; k <= 5; k++)
      pts.push(
        top
          .clone()
          .add(
            V(
              0.2 * Math.sin(k * 1.3 + sw),
              (-drop * k) / 5,
              0.2 * Math.cos(k * 1.1 + sw),
            ),
          ),
      );
    const c = curve(pts);
    add(
      sweep(c, (t2) => 0.1 - 0.04 * t2, 18, 5),
      FERN,
    );
    for (let k = 0; k < 7; k++) {
      const q = c.getPointAt(Math.min(1, 0.16 + 0.135 * k + rr(-0.03, 0.03))),
        a = k * 2.4 + sw;
      const dir = V(Math.cos(a), -1.1, Math.sin(a)).normalize();
      const leaf = LEAF.clone().applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(UP, dir),
      );
      add(leaf.translate(q.x, q.y, q.z), FERN);
    }
  });

  // ---- meshes: one per material; nothing below the ground -------------------------------------------
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

  // ---- place: base on y = 0, centred on x and z -------------------------------------------------------
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
  refineNature(THREE, g, "wild_tree");
  tintMoss(THREE, bark, BARK.color, MOSS.color);
  return g;
}
