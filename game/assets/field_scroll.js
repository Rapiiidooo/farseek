import { detailBatch } from "../prop-detail.js";

// field_scroll, arm B: profiles.
// The parchment is one profile swept 0.3 m along X: a spiral of four turns that is the roll,
// running out from under it as the flat sheet towards +Z and curling up again at its free end,
// with real thickness, so both ends of the roll show the rolled layers and the curl reads as a
// hook from the side. A dark fan just inside each end shows through the gaps between the turns.
// The map is ink swept along its strokes as a raised bead, a lathed ring and an extruded cross;
// the cord is a tube swept twice round the middle of the roll, a lathed knot and two loose ends
// that hang down the back and fray out on the ground. About 0.5 m from the cord's ends to the curl.
// Front faces +Z: the map reads upright from the front, with the roll along its top edge.
export default function (THREE) {
  const g = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  const mat = (color, name, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
    m.name = name;
    return m;
  };
  const PARCH = mat(0xe6d3ae, 'fabric', { roughness: 0.86 });
  const INK = mat(0x4b2e1e, 'fabric', { roughness: 0.8 });
  const CORD = mat(0xb49a6a, 'fabric', { roughness: 0.93 });

  // --- triangle soup with explicit normals; each triangle is wound to agree with its normals -----
  const soup = () => {
    const pos = [], nor = [], uv = [];
    const e1 = V(0, 0, 0), e2 = V(0, 0, 0), fn = V(0, 0, 0), mn = V(0, 0, 0);
    const tri = (a, b, c) => {
      e1.subVectors(b.p, a.p); e2.subVectors(c.p, a.p); fn.crossVectors(e1, e2);
      mn.copy(a.n).add(b.n).add(c.n);
      if (fn.dot(mn) < 0) [b, c] = [c, b];
      for (const q of [a, b, c]) { pos.push(q.p.x, q.p.y, q.p.z); nor.push(q.n.x, q.n.y, q.n.z); uv.push(q.u[0], q.u[1]); }
    };
    const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
    const geo = () => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return geom;
    };
    return { tri, quad, geo };
  };
  const vx = (p, n, u = [0, 0]) => ({ p, n, u });

  // --- the parchment profile, in the (z, y) plane ------------------------------------------------
  const T = 0.0035;                 // thickness of the sheet
  const P = 0.009, NT = 4;          // radial pitch per turn and number of turns in the roll
  const RC = 0.045 + P / 2 - T / 2; // centreline radius of the outer turn where it leaves the roll
  const CY = RC + T / 2;            // height of the roll's axis: the outer turn touches the ground
  const W = 0.3, X0 = -W / 2, X1 = W / 2;
  const LS = 0.34;                  // flat run from the roll's contact line to the start of the curl
  const prof = [];
  // s is the angle wound in from where the sheet leaves the roll. Steps follow arc length, so the
  // tight inner turns get fewer segments than the outer one, within 9 to 18 a turn.
  const sList = [0], SMAX = 2 * Math.PI * NT;
  for (;;) {
    const s = sList[sList.length - 1], r = RC - (P * s) / (2 * Math.PI);
    const ds = Math.min((2 * Math.PI) / 9, Math.max((2 * Math.PI) / 18, 0.017 / r));
    if (SMAX - s < 1.4 * ds) { sList.push(SMAX); break; }
    sList.push(s + ds);
  }
  sList.reverse();
  const NS = sList.length - 1;
  // the roll, from the innermost edge outwards; the angle climbs, so it winds anticlockwise in
  // (z, y) and arrives at the bottom of the roll heading +Z, straight into the flat sheet
  for (const s of sList) {
    const r = RC - (P * s) / (2 * Math.PI), al = 1.5 * Math.PI - s;
    prof.push([r * Math.cos(al), CY + r * Math.sin(al)]);
  }
  prof.push([LS, T / 2]);
  // the curl: up at the front and back over towards the roll, tightening as it goes
  const RC0 = 0.025, RCQ = 0.012, CA = 1.42 * Math.PI, NC = 12;
  for (let j = 1; j <= NC; j++) {
    const b = (CA * j) / NC, rc = RC0 - (RCQ * b) / (2 * Math.PI), al = -Math.PI / 2 + b;
    prof.push([LS + rc * Math.cos(al), T / 2 + RC0 + rc * Math.sin(al)]);
  }
  const n = prof.length;
  const tan = prof.map((_, i) => {
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)];
    const dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy);
    return [dz / l, dy / l];
  });
  // left of the direction of travel: towards the axis in the roll, up on the flat, inside the curl.
  // That is the inked face, which is how a map is rolled.
  const nrm = tan.map(([tz, ty]) => [-ty, tz]);
  const off = (i, x, d) => V(x, prof[i][1] + nrm[i][1] * d, prof[i][0] + nrm[i][0] * d);
  const N3 = (i, s) => V(0, s * nrm[i][1], s * nrm[i][0]);
  const arc = [0];
  for (let i = 1; i < n; i++) arc.push(arc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));

  {
    const S = soup();
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      for (const s of [1, -1]) {
        const d = (s * T) / 2;
        S.quad(vx(off(i, X0, d), N3(i, s), [arc[i], 0]), vx(off(j, X0, d), N3(j, s), [arc[j], 0]),
          vx(off(j, X1, d), N3(j, s), [arc[j], W]), vx(off(i, X1, d), N3(i, s), [arc[i], W]));
      }
      for (const x of [X0, X1]) {
        const nx = V(Math.sign(x), 0, 0), uv = (k) => [prof[k][0], prof[k][1]];
        S.quad(vx(off(i, x, T / 2), nx, uv(i)), vx(off(j, x, T / 2), nx, uv(j)),
          vx(off(j, x, -T / 2), nx, uv(j)), vx(off(i, x, -T / 2), nx, uv(i)));
      }
    }
    // the two cut edges: the innermost one inside the roll and the tip of the curl
    for (const [i, s] of [[0, -1], [n - 1, 1]]) {
      const nt = V(0, s * tan[i][1], s * tan[i][0]);
      S.quad(vx(off(i, X0, T / 2), nt, [0, 0]), vx(off(i, X0, -T / 2), nt, [0, T]),
        vx(off(i, X1, -T / 2), nt, [W, T]), vx(off(i, X1, T / 2), nt, [W, 0]));
    }
    g.add(new THREE.Mesh(S.geo(), PARCH));
  }
  {
    // a dark fan a few millimetres inside each end, bounded by the outer turn's inner face, so the
    // gaps between the turns read as shadow rather than as more lit parchment
    const S = soup(), first = Math.max(0, sList.findIndex((s) => s <= 2 * Math.PI * 1.15) - 1);
    for (const x of [X0 + 0.004, X1 - 0.004]) {
      const nx = V(Math.sign(x), 0, 0), c = V(x, CY, 0);
      for (let i = first; i < NS; i++) S.tri(vx(c, nx), vx(off(i, x, T / 2 + 0.0004), nx), vx(off(i + 1, x, T / 2 + 0.0004), nx));
    }
    g.add(new THREE.Mesh(S.geo(), INK));
  }

  // --- the map: ink swept as a raised bead along each stroke, "up" towards the roll ---------------
  const HI = 0.0017, WB = 0.0092, WT = 0.0052;
  {
    const S = soup();
    const faceOut = (a, b, c, ref) => {
      const f = V(0, 0, 0).subVectors(b, a).cross(V(0, 0, 0).subVectors(c, a)).normalize();
      const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(ref);
      return f.dot(mid) < 0 ? f.negate() : f;
    };
    const bead = (pts) => {
      const m = pts.length, dirs = [];
      for (let k = 0; k < m - 1; k++) {
        const dx = pts[k + 1][0] - pts[k][0], dz = pts[k + 1][1] - pts[k][1], l = Math.hypot(dx, dz);
        dirs.push([dx / l, dz / l]);
      }
      const ring = (k) => {
        // mitred at the joints: the average direction, widened by the half-angle
        const a = dirs[Math.max(0, k - 1)], b = dirs[Math.min(m - 2, k)];
        let tx = a[0] + b[0], tz = a[1] + b[1];
        const l = Math.hypot(tx, tz); tx /= l; tz /= l;
        const sc = 1 / Math.max(0.6, tx * b[0] + tz * b[1]);
        const sx = -tz * sc, sz = tx * sc, [x, z] = pts[k];
        return [V(x - (sx * WB) / 2, T, z - (sz * WB) / 2), V(x - (sx * WT) / 2, T + HI, z - (sz * WT) / 2),
          V(x + (sx * WT) / 2, T + HI, z + (sz * WT) / 2), V(x + (sx * WB) / 2, T, z + (sz * WB) / 2)];
      };
      const rings = pts.map((_, k) => ring(k));
      for (let k = 0; k < m - 1; k++) {
        const ref = V((pts[k][0] + pts[k + 1][0]) / 2, T + HI * 0.3, (pts[k][1] + pts[k + 1][1]) / 2);
        for (let e = 0; e < 3; e++) {
          const a = rings[k][e], b = rings[k][e + 1], c = rings[k + 1][e + 1], d = rings[k + 1][e];
          const f = faceOut(a, b, c, ref);
          S.quad(vx(a, f), vx(b, f), vx(c, f), vx(d, f));
        }
      }
      for (const [k, s] of [[0, -1], [m - 1, 1]]) {
        const d = dirs[Math.min(Math.max(k - 1, 0), m - 2)], f = V(s * d[0], 0, s * d[1]);
        const r = rings[k];
        S.quad(vx(r[0], f), vx(r[1], f), vx(r[2], f), vx(r[3], f));
      }
    };
    // a river meandering down the left side of the sheet
    const river = [];
    for (let i = 0; i <= 9; i++) {
      const u = i / 9;
      river.push([-0.082 + 0.026 * Math.sin(u * Math.PI * 2.6 + 0.4) - 0.02 * u, 0.084 + 0.236 * u]);
    }
    bead(river);
    // three peaks along the top right
    for (const [px, pz, s] of [[0.03, 0.08, 1], [0.071, 0.07, 1.2], [0.112, 0.083, 0.9]]) {
      bead([[px - 0.017 * s, pz + 0.028 * s], [px, pz], [px + 0.017 * s, pz + 0.028 * s]]);
    }
    // a dashed trail from the circle down to the cross
    const trail = [[0.05, 0.2], [0.028, 0.232], [0.02, 0.265], [0.03, 0.296]];
    for (let i = 0; i < trail.length - 1; i++) {
      const [ax, az] = trail[i], [bx, bz] = trail[i + 1];
      bead([[ax + (bx - ax) * 0.2, az + (bz - az) * 0.2], [ax + (bx - ax) * 0.75, az + (bz - az) * 0.75]]);
    }
    g.add(new THREE.Mesh(S.geo(), INK));
  }
  {
    // the circle: a trapezoid section lathed round
    const r0 = 0.026, v2 = (x, y) => new THREE.Vector2(x, y);
    const ring = new THREE.Mesh(new THREE.LatheGeometry([v2(r0 + WB / 2, 0), v2(r0 + WT / 2, HI), v2(r0 - WT / 2, HI), v2(r0 - WB / 2, 0)], 18), INK);
    ring.position.set(0.07, T, 0.168);
    g.add(ring);
  }
  {
    // the cross: an X outline extruded to the height of the ink
    const a = 0.029, w = 0.0048, sh = new THREE.Shape();
    const pts = [[a, -w], [a, w], [w, w], [w, a], [-w, a], [-w, w], [-a, w], [-a, -w], [-w, -w], [-w, -a], [w, -a], [w, -w]];
    pts.forEach(([x, y], i) => {
      const c = Math.SQRT1_2, px = (x - y) * c, py = (x + y) * c;
      if (i) sh.lineTo(px, py); else sh.moveTo(px, py);
    });
    const cross = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: HI, bevelEnabled: false }), INK);
    cross.rotation.x = -Math.PI / 2;   // the extrusion rises along +Y
    cross.position.set(0.055, T, 0.3);
    g.add(cross);
  }

  // --- the cord: swept tubes ------------------------------------------------------------------
  const RCD = 0.0048, SIDES = 5;
  const C = soup();
  const tube = (pts) => {
    const m = pts.length;
    const tg = pts.map((_, i) => pts[Math.min(m - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
    // parallel transport keeps the section from twisting along the path
    const nn = Math.abs(tg[0].y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    const rings = [];
    for (let i = 0; i < m; i++) {
      nn.addScaledVector(tg[i], -nn.dot(tg[i])).normalize();
      const bb = V(0, 0, 0).crossVectors(tg[i], nn), ring = [];
      for (let k = 0; k < SIDES; k++) {
        const a = (k / SIDES) * Math.PI * 2;
        const dv = nn.clone().multiplyScalar(Math.cos(a)).addScaledVector(bb, Math.sin(a));
        ring.push(vx(pts[i].clone().addScaledVector(dv, RCD), dv, [i * 0.02, k / SIDES]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < m - 1; i++) {
      for (let k = 0; k < SIDES; k++) C.quad(rings[i][k], rings[i][(k + 1) % SIDES], rings[i + 1][(k + 1) % SIDES], rings[i + 1][k]);
    }
    for (const [i, s] of [[0, -1], [m - 1, 1]]) {
      const nt = tg[i].clone().multiplyScalar(s);
      for (let k = 1; k < SIDES - 1; k++) C.tri(vx(rings[i][0].p, nt), vx(rings[i][k].p, nt), vx(rings[i][k + 1].p, nt));
    }
  };
  // the roll's outer face at angle al (in the (z, y) plane): the outer turn shrinks by one pitch
  // on its way round, so the cord follows the spiral instead of a circle
  const rollOut = (al) => {
    const s = (((1.5 * Math.PI - al) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return RC - (P * s) / (2 * Math.PI) + T / 2;
  };
  const onRoll = (x, al, lift) => {
    const r = rollOut(al) + RCD + lift;
    return V(x, Math.max(CY + r * Math.sin(al), RCD + 0.0003), r * Math.cos(al));
  };
  const AK = (118 / 180) * Math.PI;   // the knot, on the upper back of the roll
  {
    // two turns round the middle, starting and ending under the knot
    const pts = [], NW = 26;
    for (let i = 0; i <= NW; i++) pts.push(onRoll(-0.0072 + (0.0144 * i) / NW, AK - (4 * Math.PI * i) / NW, 0.0012));
    tube(pts);
  }
  const ends = [
    [V(0.006, 0, 0).add(onRoll(0, AK, 0.0035)), V(0.012, 0.0757, -0.0455), V(0.019, 0.0446, -0.0562), V(0.028, 0.0052, -0.068), V(0.045, 0.0052, -0.09), V(0.062, 0.0052, -0.108)],
    [V(-0.006, 0, 0).add(onRoll(0, AK, 0.0035)), V(-0.01, 0.0765, -0.0462), V(-0.017, 0.045, -0.0572), V(-0.026, 0.0052, -0.071), V(-0.048, 0.0052, -0.088), V(-0.074, 0.0052, -0.099)],
  ];
  for (const ctrl of ends) {
    const pts = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal').getPoints(9);
    for (const p of pts) p.y = Math.max(p.y, RCD + 0.0003);   // a spline can dip; the ground cannot
    tube(pts);
    // the frayed tip: three fibres splaying out flat on the ground
    const b = pts[pts.length - 1], dir = b.clone().sub(pts[pts.length - 2]).setY(0).normalize();
    for (const turn of [-0.42, 0, 0.42]) {
      const f = dir.clone().applyAxisAngle(UP, turn), cone = new THREE.Mesh(new THREE.ConeGeometry(0.0024, 0.024, 4), CORD);
      const a0 = b.clone().addScaledVector(dir, -0.003), a1 = b.clone().addScaledVector(f, 0.021);
      cone.position.copy(a0).add(a1).multiplyScalar(0.5);
      cone.quaternion.setFromUnitVectors(UP, a1.clone().sub(a0).normalize());
      g.add(cone);
    }
  }
  g.add(new THREE.Mesh(C.geo(), CORD));
  {
    // the knot: a lathed bead lying across the two turns
    const v2 = (x, y) => new THREE.Vector2(x, y);
    const knot = new THREE.Mesh(new THREE.LatheGeometry([v2(0.0004, -0.012), v2(0.0062, -0.0095), v2(0.0092, -0.004),
      v2(0.0092, 0.004), v2(0.0062, 0.0095), v2(0.0004, 0.012)], 6), CORD);
    knot.position.copy(onRoll(0, AK, 0.0042));
    knot.rotation.set(-AK, 0, Math.PI / 2, 'YXZ');   // axis along X, local Z squashed radially
    knot.scale.set(1, 1, 0.8);
    g.add(knot);
  }


  const details = detailBatch(THREE, g);
  for (let row = 0; row < 6; row++) details.line(INK, [[-0.025, T + 0.0006, 0.115 + row * 0.008], [0.012 + (row % 3) * 0.009, T + 0.0006, 0.115 + row * 0.008]], 0.00045);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    details.line(INK, [[0.094, T + 0.0008, 0.247], [0.094 + Math.cos(a) * (i % 2 ? 0.012 : 0.02), T + 0.0008, 0.247 + Math.sin(a) * (i % 2 ? 0.012 : 0.02)]], 0.00065);
  }
  details.ring(INK, 0.013, 0.0006, [0.094, T + 0.0008, 0.247]);
  for (let row = 0; row < 3; row++) details.line(INK, Array.from({length: 10}, (_, i) => [0.012 + i * 0.012, T + 0.0005, 0.043 + row * 0.006 + Math.sin(i * 0.8 + row) * 0.006]), 0.00035);
  details.finish();

  // --- placement: base on y = 0, centred on x and z -----------------------------------------------
  const box = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((nd) => {
    const p = nd.isMesh && nd.geometry.attributes.position; if (!p) return;
    const add = (mat4) => { for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4)); };
    if (nd.isInstancedMesh) { for (let c = 0; c < nd.count; c++) { nd.getMatrixAt(c, im); add(m.multiplyMatrices(nd.matrixWorld, im)); } return; }
    add(nd.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => { o.position.x -= c.x; o.position.y -= box.min.y; o.position.z -= c.z; });
  return g;
}
