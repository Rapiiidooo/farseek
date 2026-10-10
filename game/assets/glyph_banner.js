// glyph_banner, candidate C (hand-built grid): the cloth is one parametric sheet
// frozen in a breeze (billowing forward, swinging to +X, folds that deepen toward the
// hem), its columns shared out among three tails whose tears open from a point, with
// ragged sides and a zig-zag hem. Bone and burnt sienna bands meet down the middle; the
// raised round patch and its crescent-and-disc device are counterchanged across that
// seam and stitched to both faces. Timber T-pole with a bronze disc finial, rope
// lashing, in a pile of sandstone rubble. 3.6 m tall, front +Z.
export default function (THREE) {
  const g = new THREE.Group();

  const mat = (color, roughness, name, o = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      ...o,
    });
    m.name = name;
    return m;
  };
  const CLOTH_BONE = mat(0xe6d3ae, 0.92, "fabric", { side: THREE.DoubleSide });
  const CLOTH_SIENNA = mat(0x8a5433, 0.94, "fabric", {
    side: THREE.DoubleSide,
  });
  const TIMBER = mat(0x8a6a48, 0.88, "timber");
  const ROPE = mat(0xb49a6a, 0.95, "fabric");
  const BRONZE = mat(0x9a6a35, 0.5, "metal", { metalness: 0.6 });
  const SAND = mat(0xb57f4f, 0.92, "stone"),
    SUN = mat(0xd4a373, 0.88, "stone"),
    SIENNA = mat(0x8a5433, 0.95, "stone");

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0),
    Y = V(0, 1, 0);
  let seed = 61;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() * 2 - 1) * a;
  const add = (geo, m) => {
    const o = new THREE.Mesh(geo, m);
    g.add(o);
    return o;
  };
  const build = (pos, uv, idx) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    if (idx) geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  // --- the cloth: S(u, v, k) with u across (0 left .. 1 right), v down, k the tail
  const W = 1.1,
    TOP = 3.1,
    LEN = 2.42,
    Z0 = 0.13,
    VS = 0.6;
  const PHASE = [0.4, 2.1, 3.9],
    FAN = [-0.16, 0.06, 0.3];
  const S = (u, v, k = -1) => {
    const v2 = v * v,
      q = Math.max(0, v - VS);
    const fold =
      (0.022 + 0.11 * v2) * Math.sin(Math.PI * 2 * (u * 2.3 + v * 0.7) + 0.6);
    let x = (u - 0.5) * W + 0.4 * v2 + 0.05 * Math.sin(v * 5 + u * 2) * v;
    const y = TOP - v * LEN + 0.36 * v2;
    let z =
      Z0 +
      0.46 * Math.sin(Math.PI * 0.5 * v) * v +
      fold +
      0.06 * v2 * Math.sin(u * Math.PI * 3);
    if (k >= 0 && q > 0) {
      x += FAN[k] * q * q * 4;
      z += 0.14 * Math.sin(q * 9 + PHASE[k]) * q * 2.2;
    }
    return V(x, y, z);
  };
  const normal = (u, v, k) => {
    const e = 0.004;
    const du = S(u + e, v, k).sub(S(u - e, v, k)),
      dv = S(u, v + e, k).sub(S(u, v - e, k));
    return du.cross(dv).normalize();
  };
  // ragged side edges: shallow notches and a few deep bites
  const notch = (v, s) =>
    0.014 +
    0.012 * Math.sin(v * 37 + s) +
    0.05 * Math.max(0, Math.sin(v * 11 + s * 3)) ** 6;
  const uL = (v) => notch(v, 0.3),
    uR = (v) => 1 - notch(v, 1.7);
  // Columns: [panel fraction s, tail k, place across the tail e]. The two columns either
  // side of a tear share their s, so above the split they coincide and below it the
  // tear opens from a point.
  const TAILS = [
    [0, 0.3, 0.86],
    [0.3, 0.7, 1.0],
    [0.7, 1, 0.8],
  ];
  const cols = [];
  TAILS.forEach(([sa, sb], k) => {
    const n = Math.round((sb - sa) * 26);
    for (let m = 0; m <= n; m++)
      cols.push({ s: sa + ((sb - sa) * m) / n, k, e: m / n });
  });
  const JS = 14,
    JT = 10;
  const at = (c, j) => {
    const { s, k, e } = c;
    if (j <= JS) {
      const v = (VS * j) / JS;
      return [uL(v) + (uR(v) - uL(v)) * s, v, k];
    }
    const [sa, sb, vend] = TAILS[k];
    const q = (j - JS) / JT;
    let v = VS + (vend - VS) * q;
    if (j === JS + JT) v += 0.035 * Math.sin(e * 9 + k * 2) - 0.02;
    const pa = uL(VS) + (uR(VS) - uL(VS)) * sa,
      pb = uL(VS) + (uR(VS) - uL(VS)) * sb;
    const c0 = (pa + pb) / 2,
      taper = 0.55 * q ** 1.4,
      tear = 0.065 * q;
    const left =
      (k === 0 ? uL(v) : pa) + (c0 - pa) * taper + (k === 0 ? 0 : tear);
    const right =
      (k === 2 ? uR(v) : pb) - (pb - c0) * taper - (k === 2 ? 0 : tear);
    return [left + (right - left) * e, v, k];
  };
  {
    const pos = [],
      uv = [],
      bone = [],
      sienna = [];
    const NJ = JS + JT,
      NC = cols.length;
    for (let j = 0; j <= NJ; j++) {
      for (const c of cols) {
        const [u, v, k] = at(c, j);
        const p = S(u, v, j > JS ? k : -1);
        pos.push(p.x, p.y, p.z);
        uv.push(u, 1 - v);
      }
    }
    for (let j = 0; j < NJ; j++) {
      for (let i = 0; i < NC - 1; i++) {
        if (cols[i].k !== cols[i + 1].k) continue;
        const a = j * NC + i,
          b = a + 1,
          c = a + NC,
          d = c + 1;
        (cols[i].s + cols[i + 1].s < 1 ? bone : sienna).push(a, c, b, b, c, d);
      }
    }
    add(build(pos, uv, bone), CLOTH_BONE);
    add(build(pos, uv, sienna), CLOTH_SIENNA);
  }

  // --- the raised patch and its device, counterchanged, on both faces. Points are in
  // metres about the patch centre; they are carried onto the sheet and lifted off it.
  const PV = 0.3;
  const onSheet = ([x, y], h, side) => {
    const u = 0.5 + x / W,
      v = PV - y / LEN;
    return S(u, v).addScaledVector(normal(u, v), h * side);
  };
  const clip = (poly, keepLeft) => {
    const out = [],
      inside = (p) => (keepLeft ? p[0] <= 0 : p[0] >= 0);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) {
        const t = a[0] / (a[0] - b[0]);
        out.push([0, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  // A flat piece: the outline triangulated, lifted to h1, with a wall down to h0.
  const piece = (poly, h0, h1, side, m) => {
    const pos = [],
      uv = [];
    const top = poly.map((p) => onSheet(p, h1, side)),
      foot = poly.map((p) => onSheet(p, h0, side));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
      poly.map(([x, y]) => new THREE.Vector2(x, y)),
      [],
    )) {
      const tri = side > 0 ? [a, b, c] : [a, c, b];
      if (
        THREE.ShapeUtils.isClockWise(
          poly.map(([x, y]) => new THREE.Vector2(x, y)),
        )
      )
        tri.reverse();
      for (const i of tri) {
        pos.push(top[i].x, top[i].y, top[i].z);
        uv.push(0.5 + poly[i][0], 0.5 + poly[i][1]);
      }
    }
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      for (const p of [top[i], foot[i], top[j], top[j], foot[i], foot[j]]) {
        pos.push(p.x, p.y, p.z);
        uv.push(0, 0);
      }
    }
    add(build(pos, uv), m);
  };
  const circle = (r, cx, cy, n = 28) =>
    Array.from({ length: n }, (_, i) => [
      cx + r * Math.cos((i / n) * Math.PI * 2),
      cy + r * Math.sin((i / n) * Math.PI * 2),
    ]);
  // The patch is the device itself, cut from cloth: a crescent opening upward that
  // cradles a disc, in the proportions carved on the push blocks, counterchanged
  // across the seam (sienna over the bone band, bone over the sienna band).
  const R0 = 0.3,
    R1 = 0.25,
    DY = 0.1,
    CY = -0.1;
  const hy = (R0 * R0 - R1 * R1 + DY * DY) / (2 * DY),
    hx = Math.sqrt(R0 * R0 - hy * hy);
  const aH = Math.atan2(hy, hx),
    bH = Math.atan2(hy - DY, hx);
  const crescent = [];
  for (let i = 0; i <= 18; i++) {
    const a = aH - ((Math.PI + 2 * aH) * i) / 18;
    crescent.push([R0 * Math.cos(a), CY + R0 * Math.sin(a)]);
  }
  for (let i = 1; i < 16; i++) {
    const a = Math.PI - bH + ((Math.PI + 2 * bH) * i) / 16;
    crescent.push([R1 * Math.cos(a), CY + DY + R1 * Math.sin(a)]);
  }
  const disc = circle(0.18, 0, CY + 0.06, 28);
  for (const side of [1, -1]) {
    for (const left of [true, false]) {
      piece(
        clip(crescent, left),
        0.002,
        0.022,
        side,
        left ? CLOTH_SIENNA : CLOTH_BONE,
      );
      piece(
        clip(disc, left),
        0.002,
        0.022,
        side,
        left ? CLOTH_SIENNA : CLOTH_BONE,
      );
    }
  }

  // --- pole, crossbar, finial, sleeve and lashing
  const tube = (a, b, r0, r1, n, m) => {
    const d = V(0, 0, 0).subVectors(b, a).normalize();
    const e1 = V(0, 0, 0)
        .crossVectors(d, Math.abs(d.y) < 0.9 ? Y : X)
        .normalize(),
      e2 = V(0, 0, 0).crossVectors(d, e1);
    const pos = [],
      uv = [];
    const ring = (c, r) =>
      Array.from({ length: n }, (_, i) =>
        c
          .clone()
          .addScaledVector(e1, Math.cos((i / n) * Math.PI * 2) * r)
          .addScaledVector(e2, Math.sin((i / n) * Math.PI * 2) * r),
      );
    const A = ring(a, r0),
      B = ring(b, r1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (const [p, t] of [
        [A[i], [i / n, 0]],
        [B[j], [(i + 1) / n, 1]],
        [B[i], [i / n, 1]],
        [A[i], [i / n, 0]],
        [A[j], [(i + 1) / n, 0]],
        [B[j], [(i + 1) / n, 1]],
      ]) {
        pos.push(p.x, p.y, p.z);
        uv.push(...t);
      }
      for (const [c, R2, rr] of [
        [a, A, -1],
        [b, B, 1],
      ]) {
        const tri = rr > 0 ? [c, R2[i], R2[j]] : [c, R2[j], R2[i]];
        for (const p of tri) {
          pos.push(p.x, p.y, p.z);
          uv.push(0.5, 0.5);
        }
      }
    }
    // (e1, e2, d) is right-handed, so these windings face out along the wall and the ends
    return add(build(pos, uv), m);
  };
  tube(V(0, 0.05, 0), V(0.005, 3.44, -0.004), 0.058, 0.049, 8, TIMBER);
  tube(V(-0.66, 3.19, 0.095), V(0.66, 3.2, 0.095), 0.036, 0.034, 8, TIMBER);
  for (const x of [-1, 1])
    tube(
      V(x * 0.64, 3.195, 0.095),
      V(x * 0.7, 3.195, 0.095),
      0.045,
      0.045,
      10,
      BRONZE,
    );
  tube(V(-0.57, 3.15, 0.11), V(0, 3.15, 0.11), 0.048, 0.048, 10, CLOTH_BONE);
  tube(V(0, 3.15, 0.11), V(0.57, 3.15, 0.11), 0.048, 0.048, 10, CLOTH_SIENNA);
  for (let i = 0; i < 4; i++) {
    const y = 3.1 + i * 0.04;
    tube(V(-0.075, y, 0.04), V(0.075, y + 0.03, 0.04), 0.014, 0.014, 5, ROPE);
  }
  tube(V(0.004, 3.4, -0.004), V(0.005, 3.46, -0.004), 0.066, 0.06, 10, BRONZE);
  tube(V(0.005, 3.46, -0.004), V(0.005, 3.49, -0.004), 0.025, 0.025, 8, BRONZE);
  tube(V(0.005, 3.5, -0.022), V(0.005, 3.5, 0.014), 0.1, 0.1, 20, BRONZE);

  // --- the pile of stones round the foot: small chamfered lumps
  const lump = (c, rx, ry, rz, m) => {
    const rings = [
      [-1, 0.82],
      [-0.62, 1.0],
      [0.5, 1.0],
      [1, 0.7],
    ];
    const n = 6,
      off = Array.from({ length: n }, () => 0.72 + rnd() * 0.5),
      turn = rnd() * 6,
      tilt = [jit(0.4), jit(0.4)];
    const pos = [],
      uv = [];
    const R2 = rings.map(([t, s]) =>
      Array.from({ length: n }, (_, i) => {
        const a = turn + (i / n) * Math.PI * 2,
          x = Math.cos(a) * s * off[i],
          z = Math.sin(a) * s * off[i];
        return V(
          c.x + x * rx,
          c.y + (t + (t > 0 ? x * tilt[0] + z * tilt[1] : 0)) * ry,
          c.z + z * rz,
        );
      }),
    );
    for (let r = 0; r < R2.length - 1; r++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        for (const p of [
          R2[r][i],
          R2[r + 1][j],
          R2[r][j],
          R2[r][i],
          R2[r + 1][i],
          R2[r + 1][j],
        ]) {
          pos.push(p.x, p.y, p.z);
          uv.push(i / n, r / (R2.length - 1));
        }
      }
    }
    for (const [ring, up] of [
      [R2[0], false],
      [R2[R2.length - 1], true],
    ]) {
      const cc = centre(ring);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const tri = up ? [cc, ring[j], ring[i]] : [cc, ring[i], ring[j]];
        for (const p of tri) {
          pos.push(p.x, p.y, p.z);
          uv.push(0.5, 0.5);
        }
      }
    }
    return add(build(pos, uv), m);
  };
  const centre = (r) =>
    r.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / r.length);
  // a cairn: a ring of footing stones, a second course leaning on the pole, a cap
  const stones = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + jit(0.2),
      r = 0.36 + jit(0.05);
    stones.push([
      Math.cos(a) * r,
      0.13,
      Math.sin(a) * r,
      0.2 + jit(0.03),
      0.13,
      0.16 + jit(0.03),
      [SAND, SIENNA, SAND, SUN][i % 4],
    ]);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5 + jit(0.2),
      r = 0.17 + jit(0.03);
    stones.push([
      Math.cos(a) * r,
      0.34,
      Math.sin(a) * r,
      0.16 + jit(0.02),
      0.11,
      0.13,
      [SAND, SUN, SIENNA, SAND, SUN][i],
    ]);
  }
  stones.push([0.03, 0.5, -0.07, 0.12, 0.08, 0.1, SIENNA]);
  for (const [x, y, z, rx, ry, rz, m] of stones)
    lump(V(x, y, z), rx, ry, rz, m);

  // --- the six lines -------------------------------------------------------
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
  return g;
}
