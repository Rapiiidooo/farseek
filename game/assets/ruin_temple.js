import { architectureDetail } from "../architecture-detail.js";
import { arcBlock, seeded } from "../ruins-checkpoint-detail.js";
// ruin_temple, candidate A: primitives, vertex edits.
// The domed temple at the heart of the drowned city, now ruined: the same
// round island of three chipped steps; a ring of sixteen columns, half of
// them broken off at different jagged heights, with fallen drums on the
// steps; the round sanctum with a wide breach on its front where its wall
// collapsed course by course, rubble spilling from the gap; the ribbed
// copper dome torn open from its empty oculus in a wide ragged gash showing
// its hollow inside, with smaller holes behind; the lantern fallen and
// cracked on the steps; and one crystal still glowing on a plinth inside the
// sanctum, seen through the breach. Coral crusts patch the lower courses.
// The crystal is userData.parts.glow.
export default function (THREE) {
  const g = new THREE.Group();
  const detail = architectureDetail(THREE, g);
  const mat = (color, roughness, name, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      ...extra,
    });
    m.name = name;
    return m;
  };
  const glow = new THREE.Group();
  g.add(glow);
  g.userData.parts = { glow };
  const put = (geo, m, x, y, z, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const rnd = rng(5150);

  const STONE = mat(0xcfc6b4, 0.85, "stone", { flatShading: true });
  const ALGAE = mat(0x8f9a86, 0.9, "stone", { flatShading: true });
  const COPPER = mat(0x5e9e8e, 0.55, "metal", { flatShading: true });
  const CRYSTAL = mat(0xa8f8ff, 0.25, "glass", {
    emissive: 0x52eeff,
    emissiveIntensity: 2.6,
  });
  const CORAL_A = mat(0xff7a8a, 0.7, "coral", { flatShading: true });
  const CORAL_B = mat(0xf59a55, 0.7, "coral", { flatShading: true });

  // A smooth deterministic 0..spread noise around a full circle, keyed by
  // the (x,z) angle so any two vertices that share a direction agree.
  const angJag = (seed, n, spread) => {
    const r = rng(seed);
    const c = Array.from({ length: n }, () => r());
    return (x, z) => {
      let a = Math.atan2(x, z);
      if (a < 0) a += Math.PI * 2;
      const f = (a / (Math.PI * 2)) * n;
      const i0 = Math.floor(f) % n,
        i1 = (i0 + 1) % n,
        fr = f - Math.floor(f);
      return (c[i0] * (1 - fr) + c[i1] * fr) * spread;
    };
  };
  // Move the topmost ring of a geometry (built centred at y=0) down by
  // fn(x,z); works for a closed cylinder because the cap's rim shares (x,z)
  // with the wall's top ring and both move together.
  const breakTop = (geo, fn) => {
    geo.computeBoundingBox();
    const maxY = geo.boundingBox.max.y;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      if (y > maxY - 1e-3) pos.setY(i, maxY - fn(x, z));
    }
    pos.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  };
  const thicken = (geometry, thickness, radialOnly = false) => {
    const source = geometry.attributes.position;
    const count = source.count;
    const positions = new Float32Array(count * 6);
    const uv = new Float32Array(count * 4);
    const point = new THREE.Vector3();
    const welded = new Map(),
      ids = [],
      edges = new Map();
    for (let i = 0; i < count; i++) {
      point.fromBufferAttribute(source, i);
      point.toArray(positions, i * 3);
      const key = point
        .toArray()
        .map((v) => Math.round(v * 1e5))
        .join(",");
      if (!welded.has(key)) welded.set(key, welded.size);
      ids.push(welded.get(key));
      const direction = point.clone();
      if (radialOnly) direction.y = 0;
      point.addScaledVector(direction.normalize(), -thickness);
      point.toArray(positions, (count + i) * 3);
      const sourceUv = geometry.attributes.uv;
      for (const offset of [i * 2, (count + i) * 2]) {
        uv[offset] = sourceUv.getX(i);
        uv[offset + 1] = sourceUv.getY(i);
      }
    }
    const outer = Array.from(geometry.index.array),
      index = [...outer];
    for (let i = 0; i < outer.length; i += 3) {
      const [a, b, c] = outer.slice(i, i + 3);
      index.push(c + count, b + count, a + count);
      for (const [from, to] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        if (ids[from] === ids[to]) continue;
        const key = [ids[from], ids[to]].sort((x, y) => x - y).join(",");
        const edge = edges.get(key);
        if (edge) edge.count++;
        else edges.set(key, { from, to, count: 1 });
      }
    }
    for (const { from, to, count: uses } of edges.values())
      if (uses === 1)
        index.push(to, from, from + count, to, from + count, to + count);
    const solid = new THREE.BufferGeometry();
    solid.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    solid.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    solid.setIndex(index);
    solid.computeVertexNormals();
    geometry.dispose();
    return solid;
  };
  const orient = (mesh, dir) => {
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    return mesh;
  };
  const coral = (x, y, z, n, spread = 0.4) => {
    for (let i = 0; i < n; i++) {
      const r = 0.14 + rnd() * 0.16;
      const o = put(
        new THREE.IcosahedronGeometry(r, 0),
        i % 2 ? CORAL_A : CORAL_B,
        x + (rnd() - 0.5) * spread,
        y + (rnd() - 0.5) * spread * 0.4,
        z + (rnd() - 0.5) * spread,
      );
      o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    }
  };

  // ---- the island of three steps, chipped at the edges -------------------
  for (const [r, h, m] of [
    [24, 3, ALGAE],
    [20, 6, ALGAE],
    [16, 9, STONE],
  ]) {
    const geo = new THREE.CylinderGeometry(r, r + 0.8, h, 64);
    const chip = angJag(r * 7 + 3, 24, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      if (y > h / 2 - 0.35) {
        const bite = Math.max(0, chip(x, z) - 0.55) * 1.6;
        const s = 1 - bite / r;
        pos.setX(i, x * s);
        pos.setZ(i, z * s);
      }
    }
    pos.needsUpdate = true;
    put(geo, m, 0, h / 2, 0);
  }

  // ---- the ring of sixteen columns, half broken at jagged heights --------
  const colState = [];
  for (let i = 0; i < 16; i++) {
    const broken = i % 2 === 1;
    const h = broken ? 2.6 + rnd() * 4.4 : 10.7 + rnd() * 0.5;
    colState.push({ broken, h });
  }
  colState.forEach(({ broken, h }, i) => {
    const a = (i / 16) * Math.PI * 2;
    const geo = new THREE.CylinderGeometry(0.78, 0.95, h, 12, 1, false);
    const j = angJag(900 + i, 6, broken ? 1.1 : 0.28);
    breakTop(geo, (x, z) =>
      Math.max(0, j(x, z) - 0.25 * (broken ? 1.1 : 0.28)),
    );
    const x = Math.sin(a) * 13,
      z = Math.cos(a) * 13;
    const o = put(geo, STONE, x, 9 + h / 2, z);
    if (broken && rnd() < 0.45) {
      o.rotation.x = (rnd() - 0.5) * 0.09;
      o.rotation.z = (rnd() - 0.5) * 0.09;
    }
  });
  // a few fallen drums scattered on the steps
  const stepDrums = [
    [14.5, 4.4, 1.8, 0.55, 0.55, 0.08],
    [-17.5, 8.5, 1.6, 0.5, -1.2, -0.05],
    [11.2, -12.5, 2.0, 0.6, 2.4, 0.06],
    [-9.8, -15.6, 1.7, 0.55, -2.0, -0.07],
    [21.5, 3.0, 1.5, 0.5, 1.0, 0.05],
    [-22.0, -3.5, 1.6, 0.52, -0.6, -0.06],
  ];
  const groundYAt = (x, z) => {
    const r = Math.hypot(x, z);
    return r < 16 ? 9 : r < 20 ? 6 : r < 24 ? 3 : 0;
  };
  for (const [x, z, len, rr, a, tilt] of stepDrums) {
    const geo = new THREE.CylinderGeometry(rr, rr * 1.05, len, 12);
    const o = put(geo, STONE, x, groundYAt(x, z) + rr, z);
    orient(o, new THREE.Vector3(Math.sin(a), tilt, Math.cos(a)));
  }

  // ---- the round sanctum, a wide breach on the front (+Z) -----------------
  const SANC_R = 8.5,
    SANC_H = 11,
    SANC_Y0 = 9;
  const GAP = 1.5; // radians, centred on +Z (theta = 0)
  const sancGeo = new THREE.CylinderGeometry(
    SANC_R,
    SANC_R,
    SANC_H,
    40,
    1,
    true,
    GAP / 2,
    Math.PI * 2 - GAP,
  );
  const sJag = angJag(4242, 24, 1.3);
  breakTop(sancGeo, (x, z) => Math.max(0, sJag(x, z) - 0.35));
  put(thicken(sancGeo, 0.65, true), STONE, 0, SANC_Y0 + SANC_H / 2, 0);
  // the breach's sides step back course by course, the lowest reaching furthest
  const breach = seeded(777);
  for (const side of [1, -1]) {
    const edge = (side * GAP) / 2;
    const wallTop =
      SANC_Y0 +
      SANC_H -
      Math.max(0, sJag(Math.sin(edge), Math.cos(edge)) - 0.35);
    for (let c = 0; SANC_Y0 + c * 1.1 < wallTop - 0.3; c++) {
      const y0 = SANC_Y0 + c * 1.1,
        y1 = Math.min(y0 + 1.1, wallTop);
      const reach =
        (0.4 * Math.pow(1 - (y0 - SANC_Y0) / SANC_H, 1.4) + 0.03) *
        (0.6 + 0.7 * breach());
      const [a0, a1] = side > 0 ? [edge - reach, edge] : [edge, edge + reach];
      put(
        arcBlock(
          THREE,
          SANC_R - 0.65,
          SANC_R,
          a0,
          a1,
          y0,
          y1,
          Math.max(1, Math.round(reach * 8)),
        ),
        c % 3 === 0 ? ALGAE : STONE,
        0,
        0,
        0,
      );
    }
  }
  // rubble spilling from the breach, onto the top step platform
  for (let i = 0; i < 9; i++) {
    const t = (i / 8 - 0.5) * GAP * 1.7;
    const rr = SANC_R + 0.6 + rnd() * 2.6;
    const x = Math.sin(t) * rr,
      z = Math.cos(t) * rr;
    const s = 0.5 + rnd() * 0.7;
    const b = put(
      new THREE.BoxGeometry(
        s,
        s * (0.6 + rnd() * 0.5),
        s * (0.8 + rnd() * 0.4),
      ),
      i % 3 ? STONE : ALGAE,
      x,
      9 + s * 0.35,
      z,
    );
    b.rotation.set(rnd() * 0.6 - 0.3, rnd() * Math.PI, rnd() * 0.6 - 0.3);
  }

  // ---- the crystal, glowing on a plinth inside the sanctum ----------------
  put(new THREE.CylinderGeometry(1.1, 1.3, 1.0, 16), STONE, 0, 9.5, 0);
  put(
    new THREE.OctahedronGeometry(1, 0).scale(1.3, 2.8, 1.3),
    CRYSTAL,
    0,
    12.6,
    0,
    glow,
  );

  // ---- the entablature, still mostly intact ------------------------------
  detail.ring(
    STONE,
    14.2,
    14.2 - (SANC_R - 0.65),
    1.8,
    20.9,
    0,
    Math.PI * 2,
    64,
  );

  // ---- the copper dome, torn open towards the front --------------------------
  // The tear is off dead-centre-front so a head-on view reads as an asymmetric
  // rent rather than a symmetric split.
  const DOME_R = 13.4,
    DOME_Y = 21.8,
    DCEN = Math.PI / 2 - 0.35;
  const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
  const panel = (a, th) => {
    const h =
      Math.sin(
        Math.floor(a / (Math.PI / 20)) * 127.1 +
          Math.floor(th / (Math.PI / 28)) * 311.7,
      ) * 43758.5453;
    return h - Math.floor(h);
  };
  // a and th as SphereGeometry measures them: a = atan2(z, -x), th down from the crown
  const torn = (a, th) => {
    if (th < 0.17) return true;
    const t = th / (Math.PI / 2);
    if (
      t < 0.93 &&
      Math.abs(wrap(a - DCEN)) <
        0.92 * Math.pow(1 - t, 0.7) + 0.24 + (panel(a, th) - 0.5) * 0.34
    )
      return true;
    return [
      [DCEN + 2.6, 0.75, 0.2],
      [DCEN - 2.2, 1.12, 0.14],
    ].some(
      ([ha, ht, hr]) =>
        Math.abs(wrap(a - ha)) < hr * (0.8 + panel(a, th) * 0.5) &&
        Math.abs(th - ht) < hr * 0.9,
    );
  };
  const domeGeo = new THREE.SphereGeometry(
    DOME_R,
    40,
    14,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  {
    const pos = domeGeo.attributes.position,
      index = domeGeo.index.array,
      kept = [];
    const c = new THREE.Vector3(),
      v = new THREE.Vector3();
    for (let i = 0; i < index.length; i += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++)
        c.add(v.fromBufferAttribute(pos, index[i + k]));
      c.multiplyScalar(1 / 3);
      let a = Math.atan2(c.z, -c.x);
      if (a < 0) a += Math.PI * 2;
      if (!torn(a, Math.acos(Math.min(1, c.y / c.length()))))
        kept.push(index[i], index[i + 1], index[i + 2]);
    }
    domeGeo.setIndex(kept);
  }
  put(thicken(domeGeo, 0.18), COPPER, 0, DOME_Y, 0);
  {
    const P = [],
      dir = (a, th, r) =>
        new THREE.Vector3(
          -Math.cos(a) * Math.sin(th) * r,
          Math.cos(th) * r,
          Math.sin(a) * Math.sin(th) * r,
        );
    const STEPS = 14,
      HW = 0.24,
      RISE = 0.26,
      BASE = DOME_R - 0.06;
    const tri3 = (a, b, c) =>
      P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 2,
        at = a % (Math.PI * 2);
      const ring = (th) => {
        const d = HW / (DOME_R * Math.sin(th));
        return [
          dir(a + d, th, BASE),
          dir(a, th, BASE + RISE),
          dir(a - d, th, BASE),
        ];
      };
      for (let k = STEPS; k > 2; k--) {
        const t0 = (k / STEPS) * (Math.PI / 2),
          t1 = ((k - 1) / STEPS) * (Math.PI / 2);
        if (torn(at, (t0 + t1) / 2)) continue;
        const [l0, m0, r0] = ring(t0),
          [l1, m1, r1] = ring(t1);
        tri3(l0, l1, m1);
        tri3(l0, m1, m0);
        tri3(m0, m1, r1);
        tri3(m0, r1, r0);
        const below =
          k === STEPS || torn(at, (t0 + ((k + 1) / STEPS) * (Math.PI / 2)) / 2);
        const above =
          k === 3 || torn(at, (t1 + ((k - 2) / STEPS) * (Math.PI / 2)) / 2);
        if (below) tri3(l0, m0, r0);
        if (above) tri3(l1, r1, m1);
      }
    }
    const ribs = new THREE.BufferGeometry();
    ribs.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    ribs.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(new Float32Array((P.length / 3) * 2), 2),
    );
    ribs.computeVertexNormals();
    put(ribs, COPPER, 0, DOME_Y, 0);
  }
  // a couple of fallen dome-shell fragments (curved shell hinted by a
  // shallow box), resting on the entablature and the top step
  const shellChunk = (x, y, z, s, rx, rz) => {
    const o = put(
      new THREE.BoxGeometry(s, s * 0.22, s * 0.75),
      COPPER,
      x,
      y,
      z,
    );
    o.rotation.set(rx, rnd() * Math.PI, rz);
    return o;
  };
  shellChunk(4.0, 21.9, 3.5, 2.6, 0.15, 0.3);
  shellChunk(-6.5, 21.9, -1.0, 2.2, -0.1, -0.2);
  shellChunk(7.0, 9.6, 13.5, 1.9, 1.1, 0.3);
  shellChunk(-12.0, 9.6, 10.0, 2.1, 1.2, -0.25);

  // ---- the lantern, fallen and cracked on the steps ------------------------
  {
    const lant = new THREE.Group();
    put(
      new THREE.CylinderGeometry(2.6, 2.6, 0.5, 16),
      COPPER,
      0,
      0.25,
      0,
      lant,
    );
    put(
      new THREE.CylinderGeometry(2.45, 2.45, 0.5, 16),
      COPPER,
      0,
      3.75,
      0,
      lant,
    );
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2,
        len = i === 5 ? 1.3 : 3.1;
      put(
        new THREE.BoxGeometry(0.5, len, 0.5),
        COPPER,
        Math.sin(a) * 2.2,
        0.45 + len / 2,
        Math.cos(a) * 2.2,
        lant,
      ).rotation.y = a;
    }
    put(new THREE.ConeGeometry(2.55, 6, 16), COPPER, 0.15, 4 + 3, 0.1, lant);
    // lying on the collar and the cone's rim, so its axis is almost level
    lant.position.set(-4.5, 9 + 2.56, 16.5);
    orient(lant, new THREE.Vector3(0.25, -0.012, 0.96));
    g.add(lant);
  }

  for (const [radius, y, height] of [
    [24.3, 1.45, 2.7],
    [20.2, 4.45, 2.7],
    [16.12, 7.45, 2.7],
  ]) {
    const count = Math.round(radius * 1.8);
    for (let i = 0; i < count; i++) {
      const start = (i / count) * Math.PI * 2 + 0.003;
      detail.ring(
        i % 11 === 0 ? ALGAE : STONE,
        radius,
        0.22,
        height,
        y,
        start,
        (Math.PI * 2) / count - 0.006,
        2,
      );
    }
  }
  colState.forEach(({ broken, h }, i) => {
    const a = (i / 16) * Math.PI * 2,
      center = [Math.sin(a) * 13, Math.cos(a) * 13];
    detail.ring(ALGAE, 1.12, 0.35, 0.22, 9.11, 0, Math.PI * 2, 16, center);
    detail.ring(STONE, 0.98, 0.23, 0.2, 9.34, 0, Math.PI * 2, 16, center);
    for (let y = 11; y < 9 + h - 0.6; y += 2.1)
      detail.ring(
        ALGAE,
        0.91 - (y - 9) * 0.015,
        0.065,
        0.045,
        y,
        0,
        Math.PI * 2,
        12,
        center,
      );
    if (!broken)
      detail.ring(STONE, 1.08, 0.44, 0.62, 19.78, 0, Math.PI * 2, 16, center);
  });
  for (let i = 0; i < 28; i++) {
    const a = (i * Math.PI * 2) / 28;
    detail.block(
      ALGAE,
      [Math.sin(a) * 13.45, 20.02, Math.cos(a) * 13.45],
      [0.5, 0.25, 0.52],
      0.045,
      [0, a, 0],
    );
  }
  for (const y of [11.1, 13.25, 15.4, 17.55, 19.6])
    detail.ring(
      ALGAE,
      SANC_R + 0.027,
      0.065,
      0.045,
      y,
      GAP / 2,
      Math.PI * 2 - GAP,
      40,
    );

  // ---- coral crust patches -------------------------------------------------
  coral(23.5, 1.0, 6.0, 4);
  coral(-20.0, 1.0, -10.0, 4);
  coral(9.0, 9.4, 10.0, 3, 0.5);
  coral(-6.0, 3.6, 18.5, 3, 0.5);
  coral(15.0, 6.4, -14.0, 3, 0.5);
  coral(0, 9.4, 12.5, 3, 0.6);

  return detail.finish();
}
