import { architectureDetail } from "../architecture-detail.js";
import { restOnGround, seeded } from "../ruins-checkpoint-detail.js";
// ruin_house, candidate A: primitives, vertex edits.
// A roofless house of the drowned city, about 4 m square: four hollow-shell
// walls of different heights with jagged broken tops, an empty doorway on the
// front (+Z), two empty window holes, the back-right corner collapsed into a
// heap of blocks, and a fallen copper roof beam leaning inside. No glow parts.
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
  const rnd = rng(4201);

  const STONE = mat(0xcfc6b4, 0.85, "stone", { flatShading: true });
  const ALGAE = mat(0x8f9a86, 0.9, "stone", { flatShading: true });
  const COPPER = mat(0x5e9e8e, 0.55, "metal", { flatShading: true });
  const CORAL_A = mat(0xff7a8a, 0.7, "coral", { flatShading: true });
  const CORAL_B = mat(0xf59a55, 0.7, "coral", { flatShading: true });

  // Move the topmost ring of a geometry (built centred at y=0) down by fn(x,z).
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
  // A smooth deterministic erosion profile along one world axis, 0..amp.
  const jagProfile = (lo, hi, amp, seed, n = 7) => {
    const r = rng(seed);
    const c = Array.from({ length: n }, () => r());
    return (coord) => {
      const t = Math.max(0, Math.min(1, (coord - lo) / (hi - lo))) * (n - 1);
      const i0 = Math.min(n - 2, Math.floor(t)),
        fr = t - i0;
      return (c[i0] * (1 - fr) + c[i0 + 1] * fr) * amp;
    };
  };
  // A wall segment: w(x) x h(y) x d(z) box, bottom at y0, optionally jagged
  // along world axis 'x' or 'z' by a profile fn already in world coordinates.
  const PLINTH = 0.28;
  const wallSeg = (w, h, d, x, y0, z, m, axis, prof) => {
    // only the pieces that actually reach the broken skyline need extra
    // width/depth segments to carve a jagged top; a sill or a lintel piece
    // stays a plain 12-triangle box
    const ws = prof && axis === "x" ? Math.max(2, Math.round(w * 2.5)) : 1;
    const ds = prof && axis === "z" ? Math.max(2, Math.round(d * 2.5)) : 1;
    const geo = new THREE.BoxGeometry(w, h, d, ws, 1, ds);
    if (prof) {
      const offX = axis === "x" ? x : 0,
        offZ = axis === "z" ? z : 0;
      breakTop(geo, (lx, lz) => prof(axis === "x" ? lx + offX : lz + offZ));
    }
    return put(geo, m, x, PLINTH + y0 + h / 2, z);
  };

  // ---- foundation -----------------------------------------------------
  put(new THREE.BoxGeometry(4.34, PLINTH, 4.34), ALGAE, 0, PLINTH / 2, 0);
  put(new THREE.BoxGeometry(1.5, 0.14, 0.6), STONE, 0, PLINTH + 0.07, 2.28); // doorstep

  // ---- front wall (+Z), doorway 1.2 wide x 2.1 tall, height 3.6 -------
  const Hf = 3.6,
    frontJag = jagProfile(-2, 2, Hf * 0.32, 71);
  wallSeg(1.4, Hf, 0.3, -1.3, 0, 2.0, STONE, "x", frontJag);
  wallSeg(1.4, Hf, 0.3, 1.3, 0, 2.0, STONE, "x", frontJag);
  wallSeg(1.2, Hf - 2.1, 0.3, 0, 2.1, 2.0, STONE, "x", frontJag);

  // ---- left wall (-X), window 1.0 wide, sill 1.0, lintel 2.2, height 5.0
  const Hl = 5.0,
    leftJag = jagProfile(-1.7, 1.7, Hl * 0.3, 133);
  wallSeg(0.3, 1.0, 3.4, -1.85, 0, 0, STONE, "z", null);
  wallSeg(0.3, Hl - 2.2, 3.4, -1.85, 2.2, 0, STONE, "z", leftJag);
  wallSeg(0.3, 1.2, 1.2, -1.85, 1.0, -1.1, STONE, "z", null);
  wallSeg(0.3, 1.2, 1.2, -1.85, 1.0, 1.1, STONE, "z", null);

  // ---- right wall (+X), shortened at the back for the collapsed corner,
  // window 0.7 wide, height 3.9 -----------------------------------------
  const Hr = 3.9,
    rightJag = jagProfile(-0.8, 1.7, Hr * 0.3, 205);
  wallSeg(0.3, 1.0, 2.5, 1.85, 0, 0.45, STONE, "z", null);
  wallSeg(0.3, Hr - 2.1, 2.5, 1.85, 2.1, 0.45, STONE, "z", rightJag);
  wallSeg(0.3, 1.1, 0.9, 1.85, 1.0, -0.25, STONE, "z", null);
  wallSeg(0.3, 1.1, 0.6, 1.85, 1.0, 1.4, STONE, "z", null);

  // ---- back wall (-Z), most ruined, one small breach, no window, height 2.3
  const Hb = 2.3,
    backJag = jagProfile(-2, 1.1, Hb * 0.4, 309);
  wallSeg(1.55, Hb, 0.3, -1.22, 0, -1.85, ALGAE, "x", backJag);
  wallSeg(0.85, Hb * 0.7, 0.3, 0.53, 0, -1.85, ALGAE, "x", backJag);

  // ---- the collapsed back-right corner: both walls step down into a heap of
  // their own blocks, which spills over the plinth onto the sand -----------
  for (const [m, x0, x1, z0, z1, h] of [
    [STONE, 1.7, 2.0, -1.25, -0.8, 0.95],
    [STONE, 1.7, 2.0, -1.5, -1.25, 0.5],
    [ALGAE, 0.955, 1.3, -2.0, -1.7, 0.85],
    [ALGAE, 1.3, 1.52, -2.0, -1.7, 0.42],
  ])
    put(
      new THREE.BoxGeometry(x1 - x0, h, z1 - z0),
      m,
      (x0 + x1) / 2,
      PLINTH + h / 2,
      (z0 + z1) / 2,
    );
  const heap = seeded(4207);
  for (const [x, z, base, s] of [
    [1.3, -1.3, PLINTH, 0.52],
    [1.72, -1.95, PLINTH, 0.48],
    [1.55, -1.7, PLINTH, 0.46],
    [1.0, -1.15, PLINTH, 0.38],
    [1.45, -1.52, PLINTH + 0.33, 0.44],
    [1.85, -1.68, PLINTH + 0.3, 0.4],
    [1.62, -1.62, PLINTH + 0.62, 0.34],
    [2.32, -1.85, 0, 0.42],
    [1.9, -2.38, 0, 0.38],
    [2.36, -2.36, 0, 0.3],
  ]) {
    const b = put(
      new THREE.BoxGeometry(
        s,
        s * (0.62 + heap() * 0.2),
        s * (0.8 + heap() * 0.3),
      ),
      heap() < 0.35 ? ALGAE : STONE,
      x,
      0,
      z,
    );
    b.rotation.set(
      (heap() - 0.5) * 0.4,
      heap() * Math.PI,
      (heap() - 0.5) * 0.4,
    );
    restOnGround(THREE, b, -base);
  }

  // ---- a couple of fallen blocks inside, near the doorway --------------
  {
    const b1 = put(
      new THREE.BoxGeometry(0.5, 0.32, 0.42),
      STONE,
      0.35,
      PLINTH + 0.16,
      1.2,
    );
    b1.rotation.y = 0.4;
    const b2 = put(
      new THREE.BoxGeometry(0.38, 0.3, 0.34),
      ALGAE,
      -0.7,
      PLINTH + 0.15,
      0.3,
    );
    b2.rotation.y = -0.7;
  }

  // ---- the fallen copper roof beam, leaning inside ---------------------
  {
    const a0 = new THREE.Vector3(-1.55, PLINTH + 0.11, 0.5);
    const a1 = new THREE.Vector3(0.95, PLINTH + 2.55, -0.6);
    const mid = a0.clone().add(a1).multiplyScalar(0.5);
    const len = a0.distanceTo(a1);
    const beam = put(
      new THREE.BoxGeometry(0.2, 0.2, len),
      COPPER,
      mid.x,
      mid.y,
      mid.z,
    );
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      a1.clone().sub(a0).normalize(),
    );
  }

  for (const sign of [-1, 1]) {
    for (let y = 0.55; y < 2.75; y += 0.68)
      detail.panel(
        STONE,
        sign < 0 ? -1.92 : 0.68,
        sign < 0 ? -0.68 : 1.92,
        y,
        y + 0.62,
        2.163,
        0.66,
        0.62,
        0.025,
      );
    detail.block(ALGAE, [sign * 0.69, 1.39, 2.18], [0.16, 2.08, 0.12], 0.028);
  }
  detail.block(STONE, [0, 2.47, 2.17], [1.52, 0.19, 0.12], 0.026);
  for (const sign of [-1, 1]) {
    detail.block(
      ALGAE,
      [sign * 2.006, 1.26, 0],
      [0.13, 0.16, sign < 0 ? 1.26 : 0.88],
      0.024,
    );
    for (const z of [-0.56, 0.56])
      detail.block(STONE, [-2.003, 1.91, z], [0.12, 1.25, 0.15], 0.023);
  }
  detail.line(
    ALGAE,
    [
      [1.36, 2.95, 2.162],
      [1.19, 2.73, 2.168],
      [1.25, 2.49, 2.168],
    ],
    0.018,
  );

  // ---- coral crust patches ----------------------------------------------
  const coral = (x, y, z, n) => {
    for (let i = 0; i < n; i++) {
      const r = 0.06 + rnd() * 0.07;
      const o = put(
        new THREE.IcosahedronGeometry(r, 0),
        i % 2 ? CORAL_A : CORAL_B,
        x + (rnd() - 0.5) * 0.3,
        y + (rnd() - 0.5) * 0.15,
        z + (rnd() - 0.5) * 0.3,
      );
      o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    }
  };
  coral(-1.9, 0.35, -0.6, 4);
  coral(1.7, 0.3, -1.6, 3);
  // on the front wall's face beside the door, not in the doorway
  coral(0.95, PLINTH + 0.4, 2.17, 3);

  return detail.finish();
}
