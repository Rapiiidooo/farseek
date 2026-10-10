import { refineNature } from "../nature-detail.js";

// snow_pine, candidate C (a second reading: boughs, not tiers): the tiers are six whorls
// of separate boughs, hand-built lofts. Each bough is a wide spray of needles with a
// deep keel that leaves the trunk rising a little, arcs over and hangs its tip down;
// along the flat upper part of every bough lies its own slab of snow, domed in
// section, so each tier reads as a ring of laden boughs with gaps between them. A
// slender dark core of inner needles fills the middle, so the gaps show foliage and
// the trunk shows only at the foot. Boughs on the laden side (front-left, -X +Z) hang
// lower and carry longer, thicker slabs. The leader is a lofted tube on a crooked path
// with a last small whorl of three boughs; the trunk is a tapered, ten-sided loft that
// flares into five root spurs. 7.0 m tall, flat shaded. Plain data: userData.trunk,
// measured after placement.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color, roughness, name) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    m.name = name;
    return m;
  };
  const NEEDLE = mat(0x2f4a3e, 0.9, 'foliage');
  const BARK = mat(0x5a4030, 0.92, 'timber');
  const SNOW = mat(0xe9f2f6, 0.8, 'ground');

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Y = V(0, 1, 0);
  const TAU = Math.PI * 2;
  const LADEN = Math.atan2(-1, 1);   // azimuth atan2(x, z) of the laden side: front-left
  const load = (az) => 0.5 + 0.5 * Math.cos(az - LADEN);
  let seed = 41;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() * 2 - 1) * a;
  const lerpTable = (tab, t) => {
    for (let i = 0; i < tab.length - 1; i++) {
      const [t0, a] = tab[i], [t1, b] = tab[i + 1];
      if (t <= t1) return a + ((b - a) * (t - t0)) / (t1 - t0);
    }
    return tab[tab.length - 1][1];
  };

  const newell = (r) => {
    const n = V(0, 0, 0);
    for (let j = 0; j < r.length; j++) {
      const a = r[j], b = r[(j + 1) % r.length];
      n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
    }
    return n;
  };
  const centre = (r) => r.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / r.length);
  // Skins rings into flat-shaded triangles, appended to one material's positions. A ring
  // of one point closes the loft as a fan; `capStart` closes the first ring flat.
  const loft = (rings, arr, capStart = false) => {
    const first = rings[0], lastFull = rings.filter((r) => r.length > 1).pop();
    const dir = centre(lastFull).sub(centre(first));
    const flip = newell(first).dot(dir) < 0;
    const tri = (a, b, c) => {
      if (flip) [b, c] = [c, b];
      arr.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i], B = rings[i + 1], N = A.length;
      for (let j = 0; j < N; j++) {
        const k = (j + 1) % N;
        if (B.length === 1) { tri(A[j], A[k], B[0]); continue; }
        tri(A[j], A[k], B[k]);
        tri(A[j], B[k], B[j]);
      }
    }
    if (capStart) {
      // A fan about the ring's centre, facing back along the loft.
      const c = centre(first);
      for (let j = 0; j < first.length; j++) {
        const k = (j + 1) % first.length;
        if (flip) arr.pos.push(c.x, c.y, c.z, first[j].x, first[j].y, first[j].z, first[k].x, first[k].y, first[k].z);
        else arr.pos.push(c.x, c.y, c.z, first[k].x, first[k].y, first[k].z, first[j].x, first[j].y, first[j].z);
      }
    }
  };
  const bucket = () => ({ pos: [] });
  const needles = bucket(), snow = bucket(), bark = bucket();

  // --- one bough -------------------------------------------------------------------
  // A spray in section, wide in the middle, tapering to its tip. The upper face is flat
  // across its middle, which is where the snow slab sits; the keel below is deep, so a
  // bough seen edge-on from the ground is still a mass.
  const SPRAY = [[1, 0], [0.45, 0.8], [-0.45, 0.8], [-1, 0], [-0.5, -1.0], [0.5, -1.0]];
  const DOME = [[1, 0], [0.62, 0.72], [0, 1], [-0.62, 0.72], [-1, 0]];
  const WIDTH = [[0, 0.45], [0.3, 0.9], [0.62, 1.0], [0.86, 0.68], [1, 0.1]];
  const bough = (base, phi, L, a0, a1, W, TH, reach, deep) => {
    const out = V(Math.sin(phi), 0, Math.cos(phi)), side = V(Math.cos(phi), 0, -Math.sin(phi));
    const angle = (t) => a0 + (a1 - a0) * t ** 1.6;
    // The centreline, integrated in small steps; frame(t) gives the position and the
    // section's up, square to the centreline in the bough's vertical plane.
    const STEPS = 24, line = [base.clone()];
    for (let s = 0; s < STEPS; s++) {
      const a = angle((s + 0.5) / STEPS);
      line.push(line[s].clone().addScaledVector(out, (Math.cos(a) * L) / STEPS).addScaledVector(Y, (Math.sin(a) * L) / STEPS));
    }
    const frame = (t) => {
      const f = t * STEPS, i = Math.min(STEPS - 1, Math.floor(f));
      const p = line[i].clone().lerp(line[i + 1], f - i), a = angle(t);
      return [p, out.clone().multiplyScalar(-Math.sin(a)).addScaledVector(Y, Math.cos(a))];
    };
    const ring = (t, sec, w, h, lift = 0) => {
      const [p, up] = frame(t);
      return sec.map(([s, u]) => p.clone().addScaledVector(side, (s * w) / 2).addScaledVector(up, lift + (u * h) / 2));
    };
    const th = (t) => TH * lerpTable([[0, 1], [0.62, 0.85], [1, 0.4]], t);
    const rings = [0, 0.3, 0.62, 0.86].map((t) => ring(t, SPRAY, W * lerpTable(WIDTH, t), th(t)));
    loft([...rings, [frame(1)[0]]], needles);
    for (const t of [0.36, 0.54, 0.72]) {
      const [p, up] = frame(t), width = W * lerpTable(WIDTH, t) * 0.5;
      for (const sign of [-1, 1]) {
        const a = p.clone().addScaledVector(side, sign * width * 0.7);
        const b = p.clone().addScaledVector(side, sign * width * 1.08).addScaledVector(out, L * 0.055);
        const c = p.clone().addScaledVector(side, sign * width * 0.55).addScaledVector(out, L * 0.16);
        const d = a.clone().lerp(c, 0.5).addScaledVector(up, TH * 0.12);
        for (const q of [a, b, d, b, c, d]) needles.pos.push(q.x, q.y, q.z);
      }
    }

    // The slab: from near the trunk to `reach` along the bough, `deep` thick, on the
    // flat of the upper face and a little narrower than it.
    const ts = [0.05, reach * 0.5, reach];
    const slab = ts.map((t, i) => ring(t, DOME, W * lerpTable(WIDTH, t) * 0.62, deep * (i === 2 ? 0.8 : 1) * 2, th(t) * 0.3));
    const [pe, ue] = frame(Math.min(1, reach + 0.08));
    loft([...slab, [pe.clone().addScaledVector(ue, th(reach) * 0.3)]], snow, true);
  };

  // --- the whorls ------------------------------------------------------------------
  // height on the trunk, bough length, count
  const WHORLS = [
    [1.8, 2.15, 7],
    [2.62, 1.86, 7],
    [3.4, 1.56, 7],
    [4.13, 1.26, 6],
    [4.8, 0.98, 6],
    [5.42, 0.7, 5],
  ];
  const GOLD = 2.39996;
  WHORLS.forEach(([y, L, n], wi) => {
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * TAU + wi * GOLD + jit(0.12);
      const w = load(phi);
      const len = L * (1 + jit(0.06));
      // Rises a little off the trunk, then arcs down; the laden side hangs lower.
      const a0 = (8 + jit(4)) * (Math.PI / 180);
      const a1 = -(38 + 20 * w + jit(5)) * (Math.PI / 180);
      bough(V(0, y + jit(0.05), 0), phi, len, a0, a1, len * 0.55, 0.18 + 0.1 * len, 0.5 + 0.28 * w ** 1.2, 0.09 + 0.12 * w ** 1.5);
    }
  });

  // --- the leader: a tube on a crooked path, with a last whorl of three --------------
  {
    const path = [V(0, 5.3, 0), V(0.03, 5.9, 0), V(0.14, 6.35, 0.02), V(0.32, 6.7, 0.03), V(0.2, 7.0, 0.0)];
    const rad = [0.13, 0.1, 0.075, 0.05, 0];
    const rings = path.map((p, i) => {
      if (rad[i] === 0) return [p];
      const d = (i < path.length - 1 ? path[i + 1].clone().sub(p) : p.clone().sub(path[i - 1])).normalize();
      const e1 = V(0, 0, 0).crossVectors(d, V(0, 0, 1)).normalize(), e2 = V(0, 0, 0).crossVectors(d, e1);
      return Array.from({ length: 6 }, (_, j) => {
        const q = (j / 6) * TAU;
        return p.clone().addScaledVector(e1, Math.cos(q) * rad[i]).addScaledVector(e2, Math.sin(q) * rad[i]);
      });
    });
    loft(rings, needles);
    for (let k = 0; k < 3; k++) {
      const phi = (k / 3) * TAU + 0.9;
      bough(V(0.05, 5.95, 0), phi, 0.42, 0.25, -0.5, 0.26, 0.1, 0.55, 0.07 + 0.06 * load(phi));
    }
  }

  // --- a slender dark core of inner needles, so the gaps show foliage, not bare trunk --
  {
    const levels = [[1.95, 0.5], [3.4, 0.42], [4.8, 0.26], [6.0, 0.07]];
    const rings = levels.map(([y, r]) => Array.from({ length: 8 }, (_, j) => {
      const q = (j / 8) * TAU;
      return V(Math.sin(q) * r, y, Math.cos(q) * r);
    }));
    loft([...rings, [V(0.02, 6.25, 0)]], needles, true);
  }

  // --- the trunk: a ten-sided loft flaring into five root spurs ---------------------
  const TRUNK = { r: 0.22 };
  {
    const levels = [[0, 0.32, 1], [0.12, 0.26, 0.55], [0.42, 0.22, 0.1], [2.8, 0.16, 0], [5.4, 0.07, 0]];
    const rings = levels.map(([y, r, spur]) => Array.from({ length: 10 }, (_, j) => {
      const q = (j / 10) * TAU;
      const rr = r * (1 + spur * 0.6 * (j % 2 === 0 ? 1 : 0));
      return V(Math.sin(q) * rr, y, Math.cos(q) * rr);
    }));
    loft(rings, bark);
  }

  // --- meshes: one per material, flat shaded ------------------------------------------
  // Box-mapped UVs in units of this material's own extent. The game's surfaces multiply
  // UVs by extent over tile size, so every part comes out at the same texel density.
  const boxUV = (pos) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
    const W = Math.max(hi[0] - lo[0], hi[2] - lo[2]), H = hi[1] - lo[1];
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let t = 0; t < pos.length; t += 9) {
      const ax = pos[t + 3] - pos[t], ay = pos[t + 4] - pos[t + 1], az = pos[t + 5] - pos[t + 2];
      const bx = pos[t + 6] - pos[t], by = pos[t + 7] - pos[t + 1], bz = pos[t + 8] - pos[t + 2];
      const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
      for (let k = 0; k < 3; k++) {
        const x = pos[t + 3 * k], y = pos[t + 3 * k + 1], z = pos[t + 3 * k + 2], o = (t / 3 + k) * 2;
        if (ny >= nx && ny >= nz) { uv[o] = x / W; uv[o + 1] = z / H; }
        else if (nx >= nz) { uv[o] = z / W; uv[o + 1] = y / H; }
        else { uv[o] = x / W; uv[o + 1] = y / H; }
      }
    }
    return uv;
  };
  for (const [arr, m] of [[needles, NEEDLE], [snow, SNOW], [bark, BARK]]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(boxUV(new Float32Array(arr.pos)), 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  // --- the six lines -----------------------------------------------------------------
  const box = new THREE.Box3(), v = new THREE.Vector3(), m4 = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position; if (!p) return;
    const put2 = (mat4) => { for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4)); };
    if (n.isInstancedMesh) { for (let c = 0; c < n.count; c++) { n.getMatrixAt(c, im); put2(m4.multiplyMatrices(n.matrixWorld, im)); } return; }
    put2(n.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => { o.position.x -= c.x; o.position.y -= box.min.y; o.position.z -= c.z; });

  // The load pushes the crown's box off the trunk, so say where the trunk stands.
  g.userData.trunk = { base: [+(-c.x).toFixed(3), 0, +(-c.z).toFixed(3)], radius: TRUNK.r };
  return refineNature(THREE, g, "snow_pine");
}
