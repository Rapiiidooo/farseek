import { architectureDetail } from "../architecture-detail.js";
import { arcBlock, seeded } from "../ruins-checkpoint-detail.js";
// ruin_rings, candidate A: primitives (closed arc blocks), vertex edits.
// The stonework of the drowned city, still 197 m across: the same three
// concentric ring walls, now broken into standing arcs of varying height
// with breaches between them, fallen blocks at their feet, and thin cyan
// lines of light surviving on some of the arcs. Each arc stands on a wider
// algae-stained footing and steps down to its broken ends; its upper courses
// flank the channel the light ran in, under broken parapets. Four
// causeways still cross the old canals at the cardinal points, several with
// a collapsed span or a lone pier. The wall keeps a clear breach along +Z
// near x=0 on all three rings, the avenue the camera flies down. The rails
// are userData.parts.glow.
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
  const rnd = rng(7331);
  // settle a rotated mesh so its lowest point rests at y=~0, not wherever
  // its own centre happened to land after a tilt
  const groundFit = (mesh, sink = 0) => {
    mesh.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(mesh);
    mesh.position.y += -sink - box.min.y;
    return mesh;
  };

  const STONE = mat(0xcfc6b4, 0.85, "stone", { flatShading: true });
  const ALGAE = mat(0x8f9a86, 0.9, "stone", { flatShading: true });
  const RAIL = mat(0xa8f8ff, 0.3, "glass", {
    emissive: 0x52eeff,
    emissiveIntensity: 2.6,
  });
  const CORAL_A = mat(0xff7a8a, 0.7, "coral", { flatShading: true });
  const CORAL_B = mat(0xf59a55, 0.7, "coral", { flatShading: true });

  const coral = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const r = 0.16 + rnd() * 0.18;
      // every vertex of an icosahedron is exactly r from its centre, so
      // resting the centre at y=r guarantees the lowest vertex touches 0
      const o = put(
        new THREE.IcosahedronGeometry(r, 0),
        i % 2 ? CORAL_A : CORAL_B,
        x + (rnd() - 0.5) * 1.0,
        r,
        z + (rnd() - 0.5) * 1.0,
      );
      o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    }
  };
  const rubble = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const s = 0.7 + rnd() * 1.0;
      const b = put(
        new THREE.BoxGeometry(
          s,
          s * (0.55 + rnd() * 0.5),
          s * (0.7 + rnd() * 0.4),
        ),
        rnd() < 0.4 ? ALGAE : STONE,
        x + (rnd() - 0.5) * 2,
        s * 0.4,
        z + (rnd() - 0.5) * 2,
      );
      b.rotation.set(rnd() * 0.5 - 0.25, rnd() * Math.PI, rnd() * 0.5 - 0.25);
      groundFit(b);
    }
  };

  const arc = (m, r0, r1, a0, a1, y0, y1, parent = g) =>
    put(
      arcBlock(
        THREE,
        r0,
        r1,
        a0,
        a1,
        y0,
        y1,
        Math.max(1, Math.round(((a1 - a0) * r1) / 2.5)),
      ),
      m,
      0,
      0,
      0,
      parent,
    );
  // One standing stretch between phiStart and phiStart + span, h tall at its best. The detail
  // stream R is separate from the layout stream, so the same arcs, heights and rails survive.
  const stretch = (ri, ro, phiStart, span, h, body, dips, rail, R) => {
    const rm = (ri + ro) / 2,
      a1 = phiStart + span;
    const foot = Math.min(0.55, h * 0.35);
    arc(ALGAE, ri - 0.22, ro + 0.22, phiStart, a1, 0, foot);
    if (h <= foot + 0.05) return;
    const walls = h >= 2.2;
    const parH = walls ? Math.min(1.4, Math.max(0.6, h * 0.25)) : 0;
    const b0 = phiStart + (0.25 + R() * 0.5) / rm,
      b1 = a1 - (0.25 + R() * 0.5) / rm;
    const cuts = [b0];
    for (
      let a = b0 + (1.4 + R() * 1.8) / rm;
      a < b1 - 3 / rm;
      a += (3 + R() * 3.5) / rm
    )
      cuts.push(a);
    cuts.push(b1);
    const n = cuts.length - 1,
      tall = 1 + Math.floor(R() * Math.max(1, n - 2));
    let k = 0,
      walk = null;
    for (let i = 0; i < n; i++) {
      const s0 = cuts[i],
        s1 = cuts[i + 1],
        end = n > 1 && i !== tall && (i === 0 || i === n - 1);
      const frac =
        i === tall || n === 1 ? 1 : end ? 0.35 + R() * 0.35 : 0.72 + R() * 0.25;
      const top = foot + (h - parH - foot) * frac,
        mid = foot + (top - foot) * 0.55;
      const c0 = s0 + 0.1 / rm,
        c1 = s1 - 0.1 / rm;
      // algae has climbed the lower course of the pale stretches
      arc(ALGAE, ri, ro, s0, s1, foot, mid);
      if (!end && (!walk || c1 - c0 > walk.c1 - walk.c0))
        walk = { c0, c1, mid };
      for (const [f0, f1, edge] of [
        [rm + 0.35, ro, ro],
        [ri, rm - 0.35, ri],
      ]) {
        const inset = 0.12 + R() * 0.35,
          worn = R() < 0.35 ? (top - mid) * R() * 0.4 : 0;
        const q0 = edge === ro ? f0 : f0 + inset,
          q1 = edge === ro ? f1 - inset : f1,
          q = top - worn;
        arc(body, q0, q1, c0, c1, mid - 0.02, q);
        if (R() < 0.6 && s1 - s0 > 2.5 / rm) {
          const t = c0 + (c1 - c0) * (0.2 + R() * 0.6),
            r = (q0 + q1) / 2 + (R() - 0.5) * (q1 - q0 - 3),
            s = 0.45 + R() * 0.5;
          const b = put(
            new THREE.BoxGeometry(s, s * 0.6, s * 0.8),
            R() < 0.5 ? STONE : ALGAE,
            Math.sin(t) * r,
            q + s * 0.3 - 0.02,
            Math.cos(t) * r,
          );
          b.rotation.set((R() - 0.5) * 0.3, R() * Math.PI, (R() - 0.5) * 0.3);
        }
        if (!walls || end) continue;
        const p0 = edge === ro ? q1 - 1.2 : q0 + 0.08,
          p1 = edge === ro ? q1 - 0.08 : q0 + 1.2;
        for (let a = s0 + 0.2 / p1; a < s1 - 0.6 / p1;) {
          const len = Math.min((2 + R() * 1.4) / p1, s1 - 0.2 / p1 - a);
          if (R() > 0.2) {
            const near = Math.min(a - b0, b1 - a - len) < 3 / p1 ? 0.6 : 1;
            const piece = parH * near * (0.45 + 0.55 * dips[k++ % dips.length]);
            arc(body, p0, p1, a, a + len, q - 0.04, q + Math.max(0.25, piece));
          }
          a += len + 0.12 / p1;
        }
      }
    }
    if (!rail || !walk) return;
    const keep = (walk.c1 - walk.c0) * (0.6 + R() * 0.4),
      from = walk.c0 + (walk.c1 - walk.c0 - keep) * R();
    arc(
      RAIL,
      rm - 0.09,
      rm + 0.09,
      from,
      from + keep,
      walk.mid - 0.025,
      walk.mid + 0.03,
      glow,
    );
  };

  // ---- one broken ring wall: SEG blocks around the circle, some missing,
  // survivors at varying height with a broken top, a breach forced at +Z ---
  const buildRing = (ri, ro, hNom, SEG, seed) => {
    const rn = rng(seed);
    const R = seeded(seed * 7 + 1);
    const full = Math.PI * 2;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * full,
        a1 = ((i + 1) / SEG) * full;
      const cen = (a0 + a1) / 2;
      const d0 = Math.min(cen, full - cen);
      const forcedGap = d0 < (full / SEG) * 0.95;
      const missing = forcedGap || rn() < 0.16;
      if (missing) {
        if (!forcedGap && rn() < 0.55) {
          const t = a0 + (a1 - a0) * rn();
          const rr = ri + (ro - ri) * rn();
          const s = 1.1 + rn() * 1.1;
          const b = put(
            new THREE.BoxGeometry(s, s * 0.65, s * 0.8),
            rn() < 0.5 ? STONE : ALGAE,
            Math.sin(t) * rr,
            s * 0.4,
            Math.cos(t) * rr,
          );
          b.rotation.set(rn() * 0.5 - 0.25, rn() * Math.PI, rn() * 0.5 - 0.25);
          groundFit(b);
        }
        continue;
      }
      const jf = 0.05;
      const phiStart = a0 + (a1 - a0) * jf,
        span = (a1 - a0) * (1 - 2 * jf);
      const hFrac = rn() < 0.3 ? 0.15 + rn() * 0.25 : 0.55 + rn() * 0.45;
      const h = Math.max(0.45, hNom * hFrac);
      const segs = Math.max(3, Math.round(span * 40));
      const dips = Array.from({ length: segs + 1 }, () => rn());
      const body = rn() < 0.3 ? ALGAE : STONE;
      // a thin surviving line of light, only on some arcs
      const rail = rn() < 0.45;
      // the side the rail once took, still drawn so later arcs keep their layout
      if (rail) rn();
      stretch(ri, ro, phiStart, span, h, body, dips, rail, R);
      // a block or two fallen from this stretch, at its own foot outside either face
      if (rn() < 0.35) {
        const t = phiStart + span * rn();
        const side = rn();
        const s = 0.7 + rn() * 0.9;
        // never past the outer ring, which would move the city's measured centre
        const rr =
          side < 0.5 || ro > 90
            ? ri - 0.5 - s * (0.6 + side * 0.5)
            : ro + 0.5 + s * (0.1 + side);
        const b = put(
          new THREE.BoxGeometry(s, s * 0.6, s * 0.7),
          rn() < 0.5 ? STONE : ALGAE,
          Math.sin(t) * rr,
          s * 0.35,
          Math.cos(t) * rr,
        );
        b.rotation.set(rn() * 0.4 - 0.2, rn() * Math.PI, rn() * 0.4 - 0.2);
        groundFit(b);
      }
    }
  };
  buildRing(32, 42, 5, 20, 111);
  buildRing(56, 68, 5.5, 26, 222);
  buildRing(86, 98, 6, 34, 333);

  // ---- four causeways over the canals, some spans collapsed --------------
  const jagEndX = (geo, halfLen, seed) => {
    const rn = rng(seed);
    const N = 5,
      dips = Array.from({ length: N + 1 }, () => rn());
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      if (z > halfLen - 1e-3) {
        const t = Math.max(0, Math.min(1, (x + 3) / 6));
        const idx = Math.round(t * N);
        pos.setZ(i, halfLen - Math.max(0, dips[idx] - 0.25) * halfLen * 0.9);
      }
    }
    pos.needsUpdate = true;
  };
  const pier = (px, pz, h) =>
    put(new THREE.CylinderGeometry(0.8, 0.95, h, 12), STONE, px, h / 2, pz);
  // kerbs along both edges of a deck, z0 to z1 along its length
  const C = seeded(4242);
  const kerbs = (cx, cz, a, z0, z1) => {
    for (const lx of [-2.7, 2.7]) {
      const cut = C() < 0.5 ? z0 + (z1 - z0) * (0.3 + C() * 0.4) : null;
      for (const [p, q] of cut === null
        ? [[z0, z1]]
        : [
            [z0, cut - 0.8],
            [cut + 0.6, z1],
          ]) {
        if (q - p < 0.6) continue;
        const lz = (p + q) / 2;
        const kerb = put(
          new THREE.BoxGeometry(0.5, 0.45, q - p),
          C() < 0.3 ? ALGAE : STONE,
          cx + lx * Math.cos(a) + lz * Math.sin(a),
          5.7,
          cz - lx * Math.sin(a) + lz * Math.cos(a),
        );
        kerb.rotation.y = a;
      }
    }
  };
  for (let b = 0; b < 4; b++) {
    const a = (b * Math.PI) / 2,
      sa = Math.sin(a),
      ca = Math.cos(a);
    for (const [from, to] of [
      [24, 32],
      [42, 56],
      [68, 86],
    ]) {
      const mid = (from + to) / 2,
        span = to - from + 1;
      const roll = rnd();
      if (roll < 0.55) {
        put(
          new THREE.BoxGeometry(6, 1.1, span),
          STONE,
          sa * mid,
          4.95,
          ca * mid,
        ).rotation.y = a;
        kerbs(sa * mid, ca * mid, a, -span / 2 + 0.3, span / 2 - 0.3);
        for (const s of [-2.2, 2.2])
          pier(sa * mid + ca * s, ca * mid - sa * s, 4.4);
      } else if (roll < 0.8) {
        const stubLen = span * (0.4 + rnd() * 0.25);
        const stubMid = from + stubLen / 2 - 0.5;
        const deckGeo = new THREE.BoxGeometry(6, 1.1, stubLen, 5, 1, 1);
        jagEndX(deckGeo, stubLen / 2, 900 + b * 3 + from);
        const deck = put(deckGeo, STONE, sa * stubMid, 4.95, ca * stubMid);
        deck.rotation.y = a;
        kerbs(
          sa * stubMid,
          ca * stubMid,
          a,
          -stubLen / 2 + 0.3,
          -stubLen / 2 + stubLen * 0.55,
        );
        for (const s of [-2.2, 2.2])
          pier(sa * (from + 0.6) + ca * s, ca * (from + 0.6) - sa * s, 4.4);
      } else {
        for (const s of [-2.2, 2.2])
          pier(sa * mid + ca * s, ca * mid - sa * s, 4.2 + rnd() * 1.4);
        if (rnd() < 0.6) {
          const fb = put(
            new THREE.BoxGeometry(5.6, 1.0, 3.2),
            STONE,
            sa * (mid + 1.5),
            0.5,
            ca * (mid + 1.5),
          );
          fb.rotation.set(0.45 + rnd() * 0.3, a + (rnd() - 0.5) * 0.6, 0.08);
          groundFit(fb);
        }
      }
    }
  }

  // ---- coral crust and rubble scattered along the feet of the walls ------
  const spots = [
    [37, 0.4],
    [37, 2.1],
    [37, 3.9],
    [37, 5.3],
    [62, 1.1],
    [62, 2.6],
    [62, 4.4],
    [62, 5.6],
    [92, 0.7],
    [92, 2.2],
    [92, 3.6],
    [92, 5.0],
  ];
  for (const [r, ang] of spots) {
    const x = Math.sin(ang) * r,
      z = Math.cos(ang) * r;
    if (rnd() < 0.6) coral(x, z, 3);
    else rubble(x, z, 3);
  }

  return detail.finish();
}
