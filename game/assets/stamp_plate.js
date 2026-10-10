import { detailBatch } from "../prop-detail.js";

// stamp_plate, arm C: a second reading, as carved masonry.
// A hand-built faceted mesh, flat shaded: a forty-sided night-basalt ring stone with
// two chamfered tiers, a separate field stone of the builders' warmer basalt set
// 3 cm down inside it, and a chalk rim laid as eight arcs. The ticks are read as
// the keys of a seal: eight stepped stamp-ochre clasps that sit in the joints
// between the rim arcs and step down over both tiers to the ground, so they read
// against the black edge as well as the chalk. The dormant crystal inlay lines the
// rim's inner foot as a 45 degree chamfer, its own mesh: its far arc faces a
// third-person camera, where a flat ring would be a hairline at 10 m.
// 1.8 m across, 0.14 m tall; the field is 1.3 m across with its floor 0.07 m up.
export default function (THREE) {
  const g = new THREE.Group();

  // ---- materials --------------------------------------------------------------
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const NIGHT = M(0x2a2830, 'stone', 0.88);
  const BASALT = M(0x3a3531, 'stone', 0.84);
  const CHALK = M(0xc9c2d8, 'plaster', 0.8);
  const OCHRE = M(0xd9a441, 'plaster', 0.72);
  // Dormant crystal with its own material, so the game can light it by raising
  // emissiveIntensity. Unnamed and just under opaque so the loader's procedural
  // surfaces leave it alone.
  const CRYSTAL = new THREE.MeshStandardMaterial({
    color: 0x1d5f63, emissive: 0x39e3d0, emissiveIntensity: 0,
    roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.94,
  });

  // ---- triangle soup per material, flat normals, isotropic planar UVs ------------
  // The loader's surfaces stretch u by a mesh's width and v by its height, and on
  // a plate 0.14 m tall the height clamps. So every face is projected at one scale
  // (metres over the widest side), which keeps the stone within 2:1 when textured.
  const SOUP = new Map();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tri = (mat, a, b, c) => {
    if (!SOUP.has(mat)) SOUP.set(mat, []);
    SOUP.get(mat).push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const planarUv = (pos, n) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
    const s = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    const uv = new Float32Array(n * 2);
    const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0);
    for (let t = 0; t < n; t += 3) {
      a.fromArray(pos, t * 3); b.fromArray(pos, t * 3 + 3); c.fromArray(pos, t * 3 + 6);
      const f = b.sub(a).cross(c.sub(a));
      const ax = Math.abs(f.x), ay = Math.abs(f.y), az = Math.abs(f.z);
      for (let k = t; k < t + 3; k++) {
        const x = pos[k * 3] - lo[0], y = pos[k * 3 + 1] - lo[1], z = pos[k * 3 + 2] - lo[2];
        const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
        uv[k * 2] = u / s; uv[k * 2 + 1] = v / s;
      }
    }
    return new THREE.BufferAttribute(uv, 2);
  };
  const build = (arr) => {
    const pos = new Float32Array(arr), n = pos.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();                 // non-indexed, so every facet is flat
    geo.setAttribute('uv', planarUv(pos, n));
    return geo;
  };

  // ---- polar tools ----------------------------------------------------------------
  // P(r, y, phi) with phi = 0 on +Z, as LatheGeometry does. Profiles are [r, y] and
  // run out along the bottom, up the outside and in along the top, so faces look out.
  const P = (r, y, phi) => V(r * Math.sin(phi), y, r * Math.cos(phi));
  const sweep = (mat, prof, phi0, phi1, n) => {
    for (let i = 0; i < n; i++) {
      const a0 = phi0 + ((phi1 - phi0) * i) / n, a1 = phi0 + ((phi1 - phi0) * (i + 1)) / n;
      for (let j = 0; j < prof.length - 1; j++) {
        const [r0, y0] = prof[j], [r1, y1] = prof[j + 1];
        const A = P(r0, y0, a0), B = P(r0, y0, a1), C = P(r1, y1, a1), D = P(r1, y1, a0);
        if (r0 > 1e-6) tri(mat, A, B, D);
        if (r1 > 1e-6) tri(mat, C, D, B);
      }
    }
  };
  // a flat polygonal disc at height y, facing up or down
  const fan = (mat, r, y, n, up) => {
    const o = V(0, y, 0);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      if (up) tri(mat, o, P(r, y, a0), P(r, y, a1)); else tri(mat, o, P(r, y, a1), P(r, y, a0));
    }
  };

  // ---- layout ------------------------------------------------------------------------
  const R = 0.9, RS = 0.894, DECK = 0.1, FIELD_R = 0.65, FIELD_Y = 0.07, N = 40;
  const RIM_O = 0.82, RIM_I = 0.7, RIM_T = 0.135, CH = 0.015;   // rim 0.12 m wide
  const INL = 0.03;                                             // inlay: 3 cm in, 3 cm up

  // the ring stone: two chamfered tiers, the deck, the recess wall; the deck runs on
  // under the rim and the inlay. The keys stand 6 mm proud of it, out to R.
  sweep(NIGHT, [[RS, 0], [RS, 0.034], [RS - 0.016, 0.05], [0.852, 0.05], [0.852, 0.086], [0.838, DECK],
    [RIM_I - INL, DECK], [FIELD_R, DECK], [FIELD_R, FIELD_Y - 0.01]], 0, Math.PI * 2, N);
  fan(NIGHT, RS, 0, N, false);
  // the field stone, a hair wider than the recess so the wall stands on it
  fan(BASALT, FIELD_R + 0.001, FIELD_Y, N, true);

  // the chalk rim: eight arcs, each stopping inside the next key
  const KEY_W = 0.1;
  const GAP = (KEY_W / 2 - 0.004) / RIM_O;                    // half the gap, as an angle
  const rim = [[RIM_O, DECK], [RIM_O, RIM_T - CH], [RIM_O - CH, RIM_T], [RIM_I + 0.005, RIM_T], [RIM_I, RIM_T - 0.005]];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    sweep(CHALK, rim, a + GAP, a + Math.PI / 4 - GAP, 5);
  }

  // the keys: a stepped outline (r, y) standing 5 to 6 mm proud of all it covers,
  // extruded across the joint and turned onto every 45 degrees, one on +Z
  const key = [[0.8, 0], [R, 0], [R, 0.055], [0.858, 0.055], [0.858, 0.106],
    [RIM_O + 0.006, 0.106], [RIM_O + 0.006, 0.14], [RIM_I - 0.001, 0.14], [RIM_I - 0.001, 0.09], [0.8, 0.09]];
  const outline = key.map(([r, y]) => new THREE.Vector2(r, y));
  const tris = THREE.ShapeUtils.triangulateShape(outline, []);
  const ccw = THREE.ShapeUtils.isClockWise(outline) ? -1 : 1;
  const w = KEY_W / 2;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, s = Math.sin(a), c = Math.cos(a);
    // local: t across the joint, r along the radius
    const L = (t, r, y) => V(t * c + r * s, y, -t * s + r * c);
    for (const [i0, i1, i2] of tris) {
      const p = [key[i0], key[i1], key[i2]];
      // the +t side sees the outline counter-clockwise from outside, the -t side reversed
      const side = (t, flip) => {
        const q = p.map(([r, y]) => L(t, r, y));
        if ((ccw > 0) !== flip) tri(OCHRE, q[0], q[2], q[1]); else tri(OCHRE, q[0], q[1], q[2]);
      };
      side(w, false);
      side(-w, true);
    }
    for (let i = 0; i < key.length; i++) {
      const [r0, y0] = key[i], [r1, y1] = key[(i + 1) % key.length];
      const A = L(-w, r0, y0), B = L(w, r0, y0), C = L(w, r1, y1), D = L(-w, r1, y1);
      if (ccw > 0) { tri(OCHRE, A, B, C); tri(OCHRE, A, C, D); } else { tri(OCHRE, A, D, C); tri(OCHRE, A, C, B); }
    }
  }

  // the inlay: the rim's inner chamfer, from its top edge down to the deck
  sweep(CRYSTAL, [[RIM_I, RIM_T - 0.005], [RIM_I - INL, DECK]], 0, Math.PI * 2, N);
  const inlay = new THREE.Mesh(build(SOUP.get(CRYSTAL)), CRYSTAL);
  inlay.name = 'inlay';
  SOUP.delete(CRYSTAL);
  g.add(inlay);

  for (const [mat, arr] of SOUP) g.add(new THREE.Mesh(build(arr), mat));


  const details = detailBatch(THREE, g);
  for (let i = 0; i < 48; i++) {
    const a = i * Math.PI / 24;
    if (i % 6 === 0) continue;
    const p = (r) => [Math.sin(a) * r, 0.136, Math.cos(a) * r];
    details.line(NIGHT, [p(0.748), p(i % 3 ? 0.768 : 0.791)], 0.0016);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    details.bolt(NIGHT, 0.01, [Math.sin(a) * 0.84, 0.107, Math.cos(a) * 0.84]);
  }
  details.finish();

  // ---- placement: base at y = 0, centred on x and z (measured on vertices) ---------
  const box = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position; if (!p) return;
    const add = (mat) => { for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat)); };
    if (n.isInstancedMesh) { for (let c = 0; c < n.count; c++) { n.getMatrixAt(c, im); add(m.multiplyMatrices(n.matrixWorld, im)); } return; }
    add(n.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => { o.position.x -= c.x; o.position.y -= box.min.y; o.position.z -= c.z; });

  const at = (x, y, z) => [+(x - c.x).toFixed(3), +(y - box.min.y).toFixed(3), +(z - c.z).toFixed(3)];
  g.userData.parts = { inlay };
  g.userData.field = { center: at(0, FIELD_Y, 0), size: 2 * FIELD_R };   // top of the field floor, faces +Y
  return g;
}
