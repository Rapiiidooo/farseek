import { detailBatch } from "../prop-detail.js";

// mira_scarf, candidate B (profiles): a rounded frost-slate boulder turned from a lathe profile
// and pushed out of round by a few angular harmonics, with a long knitted scarf thrown over it
// on the diagonal, from the front left to the back right. The scarf is one band swept along
// its path by hand: a ten-point section (flat faces with chamfered edges and a crease down the
// middle) whose thickness alternates ring by ring, so the knit shows as shallow ribs across
// the width. Its path is laid out in plan, then draped: rays cast down onto the boulder give
// the support across the width, the band hangs off the edge no steeper than about 66 degrees,
// flares onto the ground and bunches once in the back tail. Where it rests on the boulder the
// section bends across its width to follow the stone. Two stamp-ochre stripes near each end,
// each end a fringe of five lathed tassels with knotted roots. Frost: a skin over the boulder's
// upper rings with a ragged lower edge, and flecks folded over the rib crests of the upper
// folds. About 1.36 m by 0.98 m, 0.33 m tall, front +Z.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color, name, roughness, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...o });
    m.name = name;
    return m;
  };
  const SLATE = mat(0x3d4654, 'stone', 0.9, { flatShading: true });
  const FROST = mat(0xe9f2f6, 'ground', 0.8, { flatShading: true, side: THREE.DoubleSide });
  const WOOL = mat(0xc2412d, 'fabric', 0.95, { flatShading: true, side: THREE.DoubleSide });
  const OCHRE = mat(0xd9a441, 'fabric', 0.95, { flatShading: true, side: THREE.DoubleSide });

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const UP = V(0, 1, 0);
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); g.add(o); return o; };
  const build = (pos, uv) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  };

  // --- the boulder ---------------------------------------------------------------------------------
  const PROFILE = [[0, 0], [0.235, 0], [0.28, 0.03], [0.3, 0.085], [0.29, 0.15], [0.25, 0.21], [0.175, 0.255], [0.08, 0.277], [0, 0.283]];
  const SEG = 10;
  const stoneGeo = new THREE.LatheGeometry(PROFILE.map(([r, y]) => V2(r, y)), SEG);
  const bulge = (a) => 1 + 0.06 * Math.sin(2 * a + 0.5) + 0.035 * Math.sin(3 * a + 1.9) + 0.025 * Math.sin(5 * a + 0.3);
  {
    const p = stoneGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), m = bulge(a);
      p.setXYZ(i, x * m, y * (1 + 0.09 * Math.sin(a + 2.2) * Math.min(1, Math.hypot(x, z) / 0.1)), z * m * 0.82);
    }
    stoneGeo.computeVertexNormals();
  }
  const stone = add(stoneGeo, SLATE);
  // Frost on the boulder: a skin over its upper rings, 3 mm proud of the facets it copies and
  // split along the same diagonals (the quads are not flat), with a ragged lower edge: each
  // corner of the lowest ring is pulled up towards the next by a random share. Built first, so
  // the scarf lies on it.
  const NP = PROFILE.length, J0 = 5;
  const cap = (() => {
    const sp = stoneGeo.attributes.position, sn = stoneGeo.attributes.normal;
    const at = (i, j) => V(sp.getX(i * NP + j), sp.getY(i * NP + j), sp.getZ(i * NP + j));
    const rag = Array.from({ length: SEG }, () => rnd() * 0.85);
    const pt = (i, j) => {
      let q = at(i, j);
      if (j === J0) q.lerp(at(i, j + 1), rag[i % SEG]);
      const nrm = j === NP - 1 ? UP : V(sn.getX(i * NP + j), sn.getY(i * NP + j), sn.getZ(i * NP + j));
      return q.addScaledVector(nrm, 0.003);
    };
    const pos = [], uv = [];
    for (let i = 0; i < SEG; i++) {
      for (let j = J0; j < NP - 1; j++) {
        const q = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
        const u = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => [a / SEG, (b - J0) / (NP - 1 - J0)]);
        for (const t of [0, 1, 3, 2, 3, 1]) { pos.push(q[t].x, q[t].y, q[t].z); uv.push(...u[t]); }
      }
    }
    return add(build(pos, uv), FROST);
  })();
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const DOWN = V(0, -1, 0);
  const heightAt = (x, z) => {
    ray.set(V(x, 1, z), DOWN);
    const hit = ray.intersectObjects([stone, cap], false)[0];
    return hit ? hit.point.y : 0;
  };

  // --- the scarf's path: laid out in plan, then draped -----------------------------------------------
  const HW = 0.1, HT = 0.012, RIB = 0.2, STEP = 0.018, SLOPE = 2.25;
  const G = HT * (1 + RIB); // centre line height on the ground, where the rib crests touch it
  const plan = new THREE.CatmullRomCurve3([
    [-0.575, 0.43], [-0.56, 0.345], [-0.51, 0.27], [-0.43, 0.205], [-0.3, 0.14], [-0.15, 0.07], [0, 0],
    [0.15, -0.07], [0.3, -0.14], [0.42, -0.2], [0.505, -0.255], [0.565, -0.325], [0.585, -0.41],
  ].map(([x, z]) => V(x, 0, z)), false, 'centripetal');
  const PL = plan.getLength(), NS = Math.ceil(PL / 0.01);
  const across = (t) => V(-t.z, 0, t.x).normalize(); // horizontal, square to the path
  const samp = [];
  for (let i = 0; i <= NS; i++) {
    const u = i / NS, p = plan.getPointAt(u), w = across(plan.getTangentAt(u));
    let s = 0;
    for (const f of [-1, -0.5, 0, 0.5, 1]) s = Math.max(s, heightAt(p.x + w.x * f * HW, p.z + w.z * f * HW));
    samp.push({ sig: u * PL, s });
  }
  // the envelope: the support, or hanging from it no steeper than SLOPE
  for (const a of samp) a.e = Math.max(0, ...samp.map((b) => b.s - SLOPE * Math.abs(a.sig - b.sig)));
  // the centre line in (distance along the plan, height): the envelope pushed out by half the
  // thickness along its normal, kept moving outward where that folds a concave corner back
  let prof = samp.map((a, i) => {
    const b0 = samp[Math.max(0, i - 1)], b1 = samp[Math.min(samp.length - 1, i + 1)];
    const ds = b1.sig - b0.sig, dy = b1.e - b0.e, l = Math.hypot(ds, dy);
    const o = HT * (1 + RIB) + 0.001;
    return a.e > 0 ? [a.sig - (dy / l) * o, a.e + (ds / l) * o] : [a.sig, G];
  });
  const outward = (list, dir) => {
    let last = -dir * 99;
    return list.filter(([x]) => (dir * x > dir * last ? ((last = x), true) : false));
  };
  const peak = prof.reduce((bi, q, i) => (q[1] > prof[bi][1] ? i : bi), 0);
  prof = [...outward(prof.slice(0, peak + 1).reverse(), -1).reverse(), ...outward(prof.slice(peak + 1), 1)];
  // the hem flares onto the ground (soften the low part upward, never downward), and the back
  // tail bunches into one soft fold a little way past where it lands
  const landing = prof.filter(([, y]) => y > G + 0.0005).pop()[0];
  for (let pass = 0; pass < 3; pass++) {
    prof = prof.map(([x, y], i) => {
      if (y > 0.08) return [x, y];
      const w = prof.slice(Math.max(0, i - 3), i + 4);
      return [x, Math.max(y, w.reduce((s, q) => s + q[1], 0) / w.length)];
    });
  }
  prof = prof.map(([x, y]) => [x, Math.max(y, G) + 0.03 * Math.exp(-(((x - landing - 0.13) / 0.045) ** 2))]);
  const path = new THREE.CatmullRomCurve3(prof.filter((q, i) => i % 2 === 0 || i === prof.length - 1).map(([x, y]) => {
    const p = plan.getPointAt(Math.min(1, Math.max(0, x / PL)));
    return V(p.x, y, p.z);
  }), false, 'centripetal');
  const L = path.getLength(), NR = Math.round(L / STEP);

  // --- rings: a frame per ring, and how far each point of the width drops onto the stone -------
  // The section: [across, through] in units of HW and HT; the chamfered edges and a crease.
  const SEC = [[-1, 0.35], [-0.8, 1], [0, 1], [0.8, 1], [1, 0.35], [1, -0.35], [0.8, -1], [0, -1], [-0.8, -1], [-1, -0.35]];
  const rings = [];
  for (let k = 0; k <= NR; k++) {
    const u = k / NR, p = path.getPointAt(u), t = path.getTangentAt(u);
    p.y = Math.max(p.y, G);
    const w = V(0, 0, 0).crossVectors(t, UP).normalize();
    const n = V(0, 0, 0).crossVectors(w, t).normalize();
    // the underside's lowest points are the rib crests, HT * (1 + RIB) below the centre line
    const dn = HT * (1 + RIB);
    const hs = [-1, -0.5, 0, 0.5, 1].map((f) => heightAt(p.x + w.x * f * HW - n.x * dn, p.z + w.z * f * HW - n.z * dn));
    const under = p.y - dn * n.y;
    const contact = n.y > 0.5 && under - Math.max(...hs) < 0.01; // lying on the stone, not hanging
    rings.push({ p, t, w, n, hs, under, contact, rib: k % 2 ? 1 - RIB : 1 + RIB });
  }
  // the drop at a point across the width, where the ring rests on the stone
  const dropRaw = (r, f) => {
    if (!r.contact) return 0;
    const x = (f + 1) * 2, i = Math.min(3, Math.floor(x)), s = x - i;
    const h = r.hs[i] * (1 - s) + r.hs[i + 1] * s;
    return Math.max(-0.03, Math.min(0, h + 0.002 - r.under));
  };
  const FS = [-1, -0.8, 0, 0.8, 1];
  rings.forEach((r) => (r.raw = FS.map((f) => dropRaw(r, f))));
  // soften the drops along the scarf so the band eases into and out of them
  rings.forEach((r, k) => {
    const near = rings.slice(Math.max(0, k - 2), k + 3);
    r.drop = FS.map((f, j) => Math.min(r.raw[j], near.reduce((s, q) => s + q.raw[j], 0) / near.length));
  });
  const dropAt = (r, f) => r.drop[FS.indexOf(f)];
  const point = (r, f, h) => r.p.clone().addScaledVector(r.w, f * HW).addScaledVector(r.n, h * HT * r.rib).addScaledVector(UP, dropAt(r, f));

  // --- the band --------------------------------------------------------------------------------------
  const out = { wool: { pos: [], uv: [] }, ochre: { pos: [], uv: [] } };
  const put = (o, a, ua) => { o.pos.push(a.x, a.y, a.z); o.uv.push(...ua); };
  for (let k = 0; k < NR; k++) {
    // two stripes near each end: three rings of ochre, three of red, three of ochre
    const e = Math.min(k, NR - 1 - k);
    const o = (e >= 3 && e <= 5) || (e >= 9 && e <= 11) ? out.ochre : out.wool;
    const r0 = rings[k], r1 = rings[k + 1];
    for (let j = 0; j < SEC.length; j++) {
      const [fa, ha] = SEC[j], [fb, hb] = SEC[(j + 1) % SEC.length];
      const a = point(r0, fa, ha), b = point(r0, fb, hb), c = point(r1, fa, ha), d = point(r1, fb, hb);
      const ua = [(fa + 1) / 2, k / NR], ub = [(fb + 1) / 2, k / NR], uc = [(fa + 1) / 2, (k + 1) / NR], ud = [(fb + 1) / 2, (k + 1) / NR];
      put(o, a, ua); put(o, b, ub); put(o, c, uc);
      put(o, b, ub); put(o, d, ud); put(o, c, uc);
    }
  }
  // end caps, fanned from the middle of the section
  for (const k of [0, NR]) {
    const r = rings[k], m = r.p.clone().addScaledVector(UP, dropAt(r, 0));
    for (let j = 0; j < SEC.length; j++) {
      const [fa, ha] = SEC[j], [fb, hb] = SEC[(j + 1) % SEC.length];
      put(out.wool, m, [0.5, 0.5]); put(out.wool, point(r, fa, ha), [(fa + 1) / 2, 0]); put(out.wool, point(r, fb, hb), [(fb + 1) / 2, 0]);
    }
  }
  add(build(out.wool.pos, out.wool.uv), WOOL);
  add(build(out.ochre.pos, out.ochre.uv), OCHRE);

  // --- the fringes: lathed tassels, a knot at the root and a flared skirt, lying on the ground ----
  const TASSEL = [[0, 0], [0.0125, 0.008], [0.0085, 0.017], [0.0135, 0.064], [0, 0.072]].map(([r, y]) => V2(r, y));
  for (const [r, sign] of [[rings[0], -1], [rings[NR], 1]]) {
    const dirOut = r.t.clone().multiplyScalar(sign).setY(0).normalize();
    for (let k = 0; k < 5; k++) {
      const geo = new THREE.LatheGeometry(TASSEL, 5, rnd() * 2);
      const len = 0.8 + rnd() * 0.35;
      geo.scale(1, len, 1);
      const dir = dirOut.clone().applyAxisAngle(UP, sign * ((k - 2) * 0.12 + (rnd() - 0.5) * 0.1));
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
      const root = r.p.clone().addScaledVector(dirOut, -0.004).addScaledVector(r.w, (k - 2) * 0.04 + (rnd() - 0.5) * 0.008);
      geo.translate(root.x, 0.0135, root.z);
      add(geo, WOOL);
    }
  }

  // --- frost on the upper folds -------------------------------------------------------------------
  // Flecks folded over a rib crest like a small tent: the ridge a little above the crest, the
  // two flanks resting on the slopes either side.
  {
    const pos = [], uv = [];
    const lerpDrop = (r, f) => {
      const i = f < -0.8 ? 0 : f < 0 ? 1 : f < 0.8 ? 2 : 3;
      const a = FS[i], b = FS[i + 1], s = (f - a) / (b - a);
      return r.drop[i] * (1 - s) + r.drop[i + 1] * s;
    };
    rings.forEach((r, k) => {
      if (r.rib < 1 || r.p.y < 0.17 || r.n.y < 0.6 || k === 0 || k === NR) return;
      for (let m = 0; m < (r.n.y > 0.92 ? 2 : 1); m++) {
        if (rnd() < 0.4) continue;
        const len = 0.012 + rnd() * rnd() * 0.05, f0 = (rnd() * 2 - 1) * (0.8 - len / HW / 2) - len / HW / 2;
        const d = 0.006, dh = HT * (1 + RIB - (2 * RIB * d) / STEP);
        const at = (f, dt, h) => r.p.clone().addScaledVector(r.w, f * HW).addScaledVector(r.t, dt).addScaledVector(r.n, h).addScaledVector(UP, lerpDrop(r, f));
        const f1 = f0 + len / HW;
        const A = at(f0, 0, HT * (1 + RIB) + 0.0016), B = at(f1, 0, HT * (1 + RIB) + 0.0016);
        const Af = at(f0 + 0.03, -d, dh + 0.001), Bf = at(f1 - 0.03, -d, dh + 0.001);
        const Ab = at(f0 + 0.03, d, dh + 0.001), Bb = at(f1 - 0.03, d, dh + 0.001);
        for (const q of [[A, B, Bf, Af], [A, Ab, Bb, B]]) {
          for (const t of [0, 1, 2, 0, 2, 3]) { pos.push(q[t].x, q[t].y, q[t].z); uv.push(t === 1 || t === 2 ? 1 : 0, t >= 2 ? 1 : 0); }
        }
      }
    });
    if (pos.length) add(build(pos, uv), FROST);
  }


  const details = detailBatch(THREE, g);
  for (const edge of [-0.8, 0.8]) {
    for (let k = 2; k < NR - 2; k += 2) {
      const a = point(rings[k], edge, 1).addScaledVector(rings[k].n, 0.0007);
      const b = point(rings[k + 1], edge, 1).addScaledVector(rings[k + 1].n, 0.0007);
      details.line(OCHRE, [a.toArray(), b.toArray()], 0.00065);
    }
  }
  details.finish();

  // --- the six lines -------------------------------------------------------------------------------
  const box = new THREE.Box3(), v = new THREE.Vector3(), m4 = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((nd) => {
    const p = nd.isMesh && nd.geometry.attributes.position; if (!p) return;
    const put2 = (mat4) => { for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4)); };
    if (nd.isInstancedMesh) { for (let c = 0; c < nd.count; c++) { nd.getMatrixAt(c, im); put2(m4.multiplyMatrices(nd.matrixWorld, im)); } return; }
    put2(nd.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => { o.position.x -= c.x; o.position.y -= box.min.y; o.position.z -= c.z; });
  return g;
}
