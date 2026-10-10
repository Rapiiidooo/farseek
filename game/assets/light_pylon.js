import { detailBatch } from "../prop-detail.js";

// light_pylon, arm A: primitives.
// Every part is a stock Three.js primitive placed by hand. Stone: boxes and square
// frustums (four-sided cylinders, flat shaded), each tier and the bone band capped
// by chamfer frustums, the grooves as slices set in. Bronze: boxes and square
// frustums for the yoke, round cylinders for its trunnions, a torus for the ring
// (its section redrawn as a chamfered bar), discs for the bezel, half spheres for
// the rivets. Crystal: a round rim between two sphere caps, and a bar in the plate.
// The ring's foot sits in the yoke's hub: with the ring 0.9 m across and its centre
// at 2.35 m (so its top is the 2.8 m of the brief), its lowest 0.14 m is below the
// shaft's top at 2.0 m. The lens clears the hub.
// 1.16 x 2.8 x 1.65 m with the yoke's bosses and the threshold plate.
export default function (THREE) {
  const g = new THREE.Group();

  // ---- materials --------------------------------------------------------------
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const SAND = M(0xb57f4f, 'stone', 0.9);
  const SUNLIT = M(0xd4a373, 'stone', 0.86);
  const SIENNA = M(0x8a5433, 'stone', 0.94);
  const BONE = M(0xe6d3ae, 'stone', 0.84);
  const BRONZE = M(0x9a6a35, 'metal', 0.48, 0.62);
  // Dormant crystal, one material per part so the game can light the lens and the
  // slot separately by raising emissiveIntensity. Unnamed and just under opaque so
  // the loader's procedural surfaces leave it alone.
  const crystal = () => new THREE.MeshStandardMaterial({
    color: 0x1d5f63, emissive: 0x39e3d0, emissiveIntensity: 0,
    roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.94,
  });

  // ---- merging: one mesh per material -------------------------------------------
  // UVs are projected from each face's dominant axis over the merged mesh's box, so
  // the loader's surfaces keep one texel density across big and small parts.
  const boxUv = (pos, n) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
    const su = Math.max(hi[0] - lo[0], hi[2] - lo[2]) || 1, sv = hi[1] - lo[1] || 1;
    const uv = new Float32Array(n * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < n; t += 3) {
      a.fromArray(pos, t * 3); b.fromArray(pos, t * 3 + 3); c.fromArray(pos, t * 3 + 6);
      const f = b.sub(a).cross(c.sub(a));
      const ax = Math.abs(f.x), ay = Math.abs(f.y), az = Math.abs(f.z);
      for (let k = t; k < t + 3; k++) {
        const x = pos[k * 3] - lo[0], y = pos[k * 3 + 1] - lo[1], z = pos[k * 3 + 2] - lo[2];
        const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
        uv[k * 2] = u / su; uv[k * 2 + 1] = v / sv;
      }
    }
    return new THREE.BufferAttribute(uv, 2);
  };
  const merge = (geos) => {
    const flat = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    let n = 0;
    for (const x of flat) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for (const x of flat) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      o += x.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', boxUv(pos, n));
    return out;
  };
  const buckets = new Map();
  const put = (mat, geo) => { if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push(geo); return geo; };

  // ---- primitive tools --------------------------------------------------------------
  // flat normals, so a four-sided cylinder shades as a square and not a soft blob
  const facet = (geo) => { const f = geo.index ? geo.toNonIndexed() : geo; f.computeVertexNormals(); return f; };
  // turn a geometry inside out (the bezel's inner wall, which faces the lens)
  const flip = (geo) => {
    const f = geo.index ? geo.toNonIndexed() : geo;
    const p = f.attributes.position.array, nr = f.attributes.normal.array;
    for (let t = 0; t < p.length; t += 9) {
      for (let k = 0; k < 3; k++) {
        [p[t + 3 + k], p[t + 6 + k]] = [p[t + 6 + k], p[t + 3 + k]];
        [nr[t + 3 + k], nr[t + 6 + k]] = [nr[t + 6 + k], nr[t + 3 + k]];
      }
    }
    for (let i = 0; i < nr.length; i++) nr[i] = -nr[i];
    return f;
  };
  // axis-aligned box between two corners
  const block = (mat, x0, x1, y0, y1, z0, z1) => put(mat, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
    .translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  // square frustum on (x, z): half-width a at y0, b at y1; sz stretches it along z
  const frustum = (mat, a, b, y0, y1, x = 0, z = 0, sz = 1) => {
    const geo = new THREE.CylinderGeometry(b * Math.SQRT2, a * Math.SQRT2, y1 - y0, 4, 1, false, Math.PI / 4);
    geo.scale(1, 1, sz).translate(x, (y0 + y1) / 2, z);
    return put(mat, facet(geo));
  };
  // round primitives on the Z axis: a (possibly conical) wall from z0 to z1 and a flat annulus
  const zwall = (r0, r1, z0, z1, segs) => new THREE.CylinderGeometry(r1, r0, z1 - z0, segs, 1, true)
    .rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2);
  const zdisc = (ri, ro, z, segs, back = false) => {
    const geo = new THREE.RingGeometry(ri, ro, segs, 1);
    if (back) geo.rotateY(Math.PI);
    return geo.translate(0, 0, z);
  };
  // round cylinder on the X axis centred at (x, y, z)
  const xcyl = (r, len, x, y, z, segs) => new THREE.CylinderGeometry(r, r, len, segs).rotateZ(-Math.PI / 2).translate(x, y, z);
  // A torus whose round section is redrawn as a chamfered rectangle 2a wide and 2b
  // deep: flat faces front, back, in and out, 45 degree chamfers c between them.
  // Normals stay flat across the section and smooth round the ring.
  const barRing = (R, a, b, c, segs) => {
    const geo = new THREE.TorusGeometry(R, 0.01, 8, segs);
    const p = geo.attributes.position;
    const sec = [[a, c - b], [a, b - c], [a - c, b], [c - a, b], [-a, b - c], [-a, c - b], [c - a, -b], [a - c, -b]];
    for (let k = 0; k < p.count; k++) {
      const [d, z] = sec[Math.floor(k / (segs + 1)) % 8];
      const x = p.getX(k), y = p.getY(k), l = Math.hypot(x, y);
      p.setXYZ(k, (x / l) * (R + d), (y / l) * (R + d), z);
    }
    const f = geo.toNonIndexed();
    const P = f.attributes.position, N = f.attributes.normal;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (let t = 0; t < P.count; t += 3) {
      A.fromBufferAttribute(P, t); B.fromBufferAttribute(P, t + 1); C.fromBufferAttribute(P, t + 2);
      const cx = (A.x + B.x + C.x) / 3, cy = (A.y + B.y + C.y) / 3, cl = Math.hypot(cx, cy);
      B.sub(A).cross(C.sub(A)).normalize();
      let nr = (B.x * cx + B.y * cy) / cl, nz = B.z;
      const nl = Math.hypot(nr, nz); nr /= nl; nz /= nl;
      for (let k = t; k < t + 3; k++) {
        const x = P.getX(k), y = P.getY(k), l = Math.hypot(x, y);
        N.setXYZ(k, (nr * x) / l, (nr * y) / l, nz);
      }
    }
    return f;
  };

  // ---- plinth: sienna footing, sandstone tier, sunlit upper tier ------------------------
  block(SIENNA, -0.55, 0.55, 0, 0.12, -0.55, 0.55);            // footing course, 1.1 m square
  block(SAND, -0.53, 0.53, 0.12, 0.27, -0.53, 0.53);           // lower tier, set back 2 cm
  frustum(SUNLIT, 0.53, 0.495, 0.27, 0.3);                     // its chamfered top
  block(SAND, -0.425, 0.425, 0.3, 0.465, -0.425, 0.425);       // upper tier, 0.85 m square
  frustum(SUNLIT, 0.425, 0.39, 0.465, 0.5);

  // ---- shaft: 1.5 m, tapering 0.5 -> 0.36 m, two grooves and a bone band -------------------
  const PT = 0.5, ST = 2.0;
  const hw = (y) => 0.25 - (0.07 * (y - PT)) / (ST - PT);
  const slice = (mat, y0, y1, d = 0) => frustum(mat, hw(y0) + d, hw(y1) + d, y0, y1);
  const GD = 0.035;                                             // groove depth
  slice(SAND, PT, 1.26);
  slice(SIENNA, 1.26, 1.33, -GD);
  slice(SAND, 1.33, 1.41);
  slice(SIENNA, 1.41, 1.48, -GD);
  slice(SAND, 1.48, ST);                                        // runs on behind the band to the top
  const BO = 0.02, B0 = 1.66, B1 = 1.79, BC = 0.012;            // band 2 cm proud, chamfered
  frustum(BONE, hw(B0) + BO - BC, hw(B0) + BO, B0, B0 + BC);
  frustum(BONE, hw(B0 + BC) + BO, hw(B1 - BC) + BO, B0 + BC, B1 - BC);
  frustum(BONE, hw(B1 - BC) + BO, hw(B1) + BO - BC, B1 - BC, B1);

  // ---- yoke: a stepped hub capping the shaft, a beam out of each side, two short arms -------------
  // The hub's top stops at the lens's lowest point; the ring's foot sits inside it.
  const RC = 2.35, LR = 0.31;                                   // ring centre, lens radius
  frustum(BRONZE, 0.22, 0.22, 1.895, 1.935);                    // lower step, 0.44 m square
  frustum(BRONZE, 0.2, 0.2, 1.935, 2.02);
  frustum(BRONZE, 0.2, 0.175, 2.02, 2.04);                      // chamfered top
  for (const s of [-1, 1]) {
    const X = s * 0.515;                                        // arm axis
    // beam and upright each end inside the other, so no two faces share a plane
    block(BRONZE, s < 0 ? -0.56 : 0.2, s < 0 ? -0.2 : 0.56, 1.95, 2.02, -0.065, 0.065);   // beam
    frustum(BRONZE, 0.05, 0.037, 1.955, RC, X, 0, 1.5);         // upright, 0.10 x 0.15 m at its foot
    put(BRONZE, xcyl(0.062, 0.09, X, RC, 0, 16));               // trunnion eye, a knuckle proud of the arm
    put(BRONZE, xcyl(0.024, 0.07, s * 0.465, RC, 0, 12));       // pin into the ring
    put(BRONZE, xcyl(0.044, 0.02, s * 0.57, RC, 0, 16));        // boss outside the arm
    // gusset in the inner corner: a square turned 45 degrees, mostly buried in beam and upright
    const gi = X - s * (0.05 - 0.013 * (0.07 / (RC - 1.95)));
    put(BRONZE, new THREE.BoxGeometry(0.1, 0.1, 0.09).rotateZ(Math.PI / 4).translate(gi, 2.02, 0));
  }

  // ---- ring: 0.9 m across and 0.1 m thick, a chamfered bar round a flat bezel ------------------
  const ring = [barRing(0.4, 0.05, 0.05, 0.016, 64)];
  const BZ = 0.028;                                             // bezel faces, each side
  ring.push(zdisc(LR, 0.372, BZ, 56), zdisc(LR, 0.372, -BZ, 56, true));
  ring.push(flip(zwall(LR, LR, -BZ, BZ, 56)));
  // four rivets on each face, on the diagonals
  for (const sz of [1, -1]) {
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const r = new THREE.SphereGeometry(0.028, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      r.scale(1, 0.65, 1).rotateX((sz * Math.PI) / 2).translate(0.4 * Math.cos(a), 0.4 * Math.sin(a), sz * 0.047);
      ring.push(r);
    }
  }
  for (const geo of ring) put(BRONZE, geo.translate(0, RC, 0));

  // ---- lens: its own mesh, centred on its own origin -------------------------------------------
  const LT = 0.016, LD = 0.024;                                 // half rim thickness, dome rise
  const RS = (LR * LR + LD * LD) / (2 * LD), TH = Math.asin(LR / RS);
  const cap = (sz) => new THREE.SphereGeometry(RS, 48, 4, 0, Math.PI * 2, 0, TH)
    .translate(0, LT - RS * Math.cos(TH), 0).rotateX((sz * Math.PI) / 2);
  const lens = new THREE.Mesh(merge([zwall(LR, LR, -LT, LT, 48), cap(1), cap(-1)]), crystal());
  lens.name = 'lens';
  lens.position.set(0, RC, 0);
  g.add(lens);

  // ---- threshold plate in front (+Z): 1.1 x 0.55 x 0.04 m, a crystal slot along its front edge ------
  const PZ0 = 0.55, PZ1 = 1.1, PH = 0.04, PB = 0.022;           // plate from z0 to z1, top, step
  const SW = 0.06, SL = 0.8, SZ1 = PZ1 - 0.045, SZ0 = SZ1 - SW; // slot, 4.5 cm in from the front
  block(BRONZE, -0.55, 0.55, 0, PB, PZ0, PZ1);                   // base slab
  const E = 0.022;                                               // top layer stepped in at front and sides
  block(BRONZE, -0.55 + E, 0.55 - E, PB, PH, PZ0, SZ0);
  block(BRONZE, -0.55 + E, 0.55 - E, PB, PH, SZ1, PZ1 - E);
  block(BRONZE, -0.55 + E, -SL / 2, PB, PH, SZ0, SZ1);
  block(BRONZE, SL / 2, 0.55 - E, PB, PH, SZ0, SZ1);
  const slot = new THREE.Mesh(merge([new THREE.BoxGeometry(SL, PH + 0.003 - PB, SW)]), crystal());
  slot.name = 'slot';
  slot.position.set(0, (PB + PH + 0.003) / 2, (SZ0 + SZ1) / 2);
  g.add(slot);

  for (const [mat, geos] of buckets) g.add(new THREE.Mesh(merge(geos), mat));


  const details = detailBatch(THREE, g);
  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2;
    for (const x of [-0.145, 0.145]) details.line(BRONZE, [[x * Math.cos(angle) + hw(0.62) * Math.sin(angle), 0.62, hw(0.62) * Math.cos(angle) - x * Math.sin(angle)], [x * Math.cos(angle) + hw(1.2) * Math.sin(angle), 1.2, hw(1.2) * Math.cos(angle) - x * Math.sin(angle)]], 0.004);
  }
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    details.line(SIENNA, [[Math.sin(a) * 0.325, RC + Math.cos(a) * 0.325, 0.029], [Math.sin(a) * (i % 3 ? 0.337 : 0.353), RC + Math.cos(a) * (i % 3 ? 0.337 : 0.353), 0.029]], 0.0014);
  }
  for (const x of [-0.46, 0.46]) for (const z of [0.64, 0.92]) details.bolt(SIENNA, 0.013, [x, PH + 0.001, z]);
  details.finish();

  // ---- placement: base at y = 0, centred on x and z (measured on vertices) ---------
  const bb = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const q = n.isMesh && n.geometry.attributes.position; if (!q) return;
    const add = (mat) => { for (let i = 0; i < q.count; i++) bb.expandByPoint(v.fromBufferAttribute(q, i).applyMatrix4(mat)); };
    if (n.isInstancedMesh) { for (let c = 0; c < n.count; c++) { n.getMatrixAt(c, im); add(m.multiplyMatrices(n.matrixWorld, im)); } return; }
    add(n.matrixWorld);
  });
  const c = bb.getCenter(new THREE.Vector3());
  g.children.forEach((o) => { o.position.x -= c.x; o.position.y -= bb.min.y; o.position.z -= c.z; });

  const r3 = (x, y, z) => [+(x - c.x).toFixed(3), +(y - bb.min.y).toFixed(3), +(z - c.z).toFixed(3)];
  g.userData.parts = { lens, slot };
  g.userData.lens = { center: r3(0, RC, 0), radius: LR };      // middle of the lens, faces +Z
  g.userData.emit = r3(0, PH, SZ1);                             // slot's front edge, plate top
  return g;
}
