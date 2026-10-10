import { architectureDetail } from "../architecture-detail.js";
import { restOnGround, thicken } from "../ruins-checkpoint-detail.js";
// ruin_tower, candidate A: primitives, vertex edits.
// A slender tower of the drowned city, broken off at a slant: a hollow round
// shaft with a jagged sheared top, a few dark window holes, broken lengths of
// it and blocks at its foot, coral crust near the base, and a small glowing crystal shard
// lying in the rubble. The shard is userData.parts.glow.
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
  const rnd = rng(2601);

  const STONE = mat(0xcfc6b4, 0.85, "stone", { flatShading: true });
  const ALGAE = mat(0x8f9a86, 0.9, "stone", { flatShading: true });
  const VOID = mat(0x14181a, 0.9, "stone");
  const CRYSTAL = mat(0xa8f8ff, 0.25, "glass", {
    emissive: 0x52eeff,
    emissiveIntensity: 2.6,
  });
  const CORAL_A = mat(0xff7a8a, 0.7, "coral", { flatShading: true });
  const CORAL_B = mat(0xf59a55, 0.7, "coral", { flatShading: true });

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
  const angIdx = (x, z, n) => {
    let a = Math.atan2(x, z);
    if (a < 0) a += Math.PI * 2;
    return Math.min(n - 1, Math.floor((a / (Math.PI * 2)) * n));
  };

  // ---- the shaft, a hollow wall broken off at a jagged slant --------------
  // A collapsed floor plugs the well below the break, so it reads dark rather than sandy.
  const RSEG = 22,
    R_TOP = 1.05,
    R_BOT = 1.22,
    SH = 16.4,
    WALL = 0.3;
  const shaftGeo = new THREE.CylinderGeometry(R_TOP, R_BOT, SH, RSEG, 1, true);
  const jag = angJag(3311, 18, 1.15);
  const drop = (x, z) =>
    0.5 + Math.max(-0.35, x * 0.42 + z * 0.3 + jag(x, z) - 0.55);
  breakTop(shaftGeo, drop);
  put(thicken(THREE, shaftGeo, WALL, true), STONE, 0, SH / 2, 0);
  {
    let deepest = 0;
    for (let i = 0; i < RSEG; i++) {
      const a = (i / RSEG) * Math.PI * 2;
      deepest = Math.max(
        deepest,
        drop(Math.sin(a) * R_TOP, Math.cos(a) * R_TOP),
      );
    }
    const y = SH - deepest - 1.1,
      r = R_BOT - ((R_BOT - R_TOP) * y) / SH - WALL + 0.04;
    put(new THREE.CircleGeometry(r, RSEG).rotateX(-Math.PI / 2), VOID, 0, y, 0);
  }

  // ---- a few dark window holes, climbing in a loose spiral, set proud
  // enough of the curved wall to read clearly -----------------------------
  const winY = [3.2, 6.6, 10.1, 13.2];
  winY.forEach((y, i) => {
    const a = i * 2.15 + 0.4;
    const r = R_BOT - ((R_BOT - R_TOP) * y) / SH;
    const o = put(
      new THREE.BoxGeometry(0.42, 0.8, 0.22),
      VOID,
      Math.sin(a) * r,
      y,
      Math.cos(a) * r,
    );
    o.rotation.y = a;
  });

  // courses girdling the shaft: bottom, outer and top faces, the inner edge buried in the wall
  for (const y of [0.16, 0.39, 2.1, 5.4, 8.8, 12.1]) {
    const shaft = R_BOT - ((R_BOT - R_TOP) * y) / SH,
      base = y < 0.5;
    const ro = base ? 1.39 : shaft + 0.02,
      ri = shaft - 0.1,
      h = base ? 0.18 : 0.085;
    const band = new THREE.LatheGeometry(
      [
        [ri, -h / 2],
        [ro, -h / 2],
        [ro, h / 2],
        [ri, h / 2],
      ].map(([r, v]) => new THREE.Vector2(r, v)),
      RSEG,
    );
    put(band, base ? ALGAE : STONE, 0, y, 0);
  }
  winY.forEach((y, i) => {
    const a = i * 2.15 + 0.4,
      r = R_BOT - ((R_BOT - R_TOP) * y) / SH + 0.07;
    for (const [dx, dy, w, h] of [
      [-0.275, 0, 0.1, 0.96],
      [0.275, 0, 0.1, 0.96],
      [0, 0.46, 0.64, 0.12],
      [0, -0.45, 0.64, 0.14],
    ])
      detail.block(
        ALGAE,
        [
          Math.sin(a) * r + Math.cos(a) * dx,
          y + dy,
          Math.cos(a) * r - Math.sin(a) * dx,
        ],
        [w, h, 0.16],
        0,
        [0, a, 0],
      );
  });

  // ---- broken lengths of the shaft and blocks lying at the foot, placed as
  // mirrored pairs so the asset stays centred -------------------------------
  const length = (bearing, len, arc, roll) => {
    const geo = new THREE.CylinderGeometry(
      0.98,
      0.98,
      len,
      Math.round(arc * 3.5),
      1,
      true,
      -arc / 2,
      arc,
    );
    const o = put(
      thicken(THREE, geo, WALL, true),
      STONE,
      Math.sin(bearing) * 2.3,
      0,
      Math.cos(bearing) * 2.3,
    );
    o.quaternion
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), bearing + Math.PI / 2)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          Math.PI / 2,
        ),
      )
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          roll,
        ),
      );
    return restOnGround(THREE, o);
  };
  length(1.12, 1.7, 4.1, 1.9);
  length(1.12 + Math.PI, 1.5, 3.6, -1.6);
  for (let i = 0; i < 2; i++) {
    const a0 = rnd() * Math.PI * 2,
      d = 1.8 + rnd() * 1.0;
    // a box and its point-mirror across the origin, so the pair is centred
    for (const flip of [0, Math.PI]) {
      const s = 0.35 + rnd() * 0.35;
      const a = a0 + flip;
      const b = put(
        new THREE.BoxGeometry(
          s,
          s * (0.7 + rnd() * 0.4),
          s * (0.8 + rnd() * 0.4),
        ),
        i % 2 ? ALGAE : STONE,
        Math.sin(a) * d,
        s * 0.4,
        Math.cos(a) * d,
      );
      b.rotation.set(rnd() * 0.5, rnd() * Math.PI, rnd() * 0.5);
      restOnGround(THREE, b);
    }
  }

  // ---- coral crust near the base -----------------------------------------
  const coral = (x, y, z, n) => {
    for (let i = 0; i < n; i++) {
      const r = 0.07 + rnd() * 0.08;
      const o = put(
        new THREE.IcosahedronGeometry(r, 0),
        i % 2 ? CORAL_A : CORAL_B,
        x + (rnd() - 0.5) * 0.5,
        y + (rnd() - 0.5) * 0.2,
        z + (rnd() - 0.5) * 0.5,
      );
      o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      o.position.y = Math.max(o.position.y, r);
    }
  };
  coral(1.1, 0.25, 0.4, 4);
  coral(-1.0, 0.22, -0.4, 3);

  // ---- a small glowing crystal shard lying at the foot, tucked close so
  // it does not skew the footprint -----------------------------------------
  {
    const shard = put(
      new THREE.OctahedronGeometry(0.42, 0).scale(0.4, 1.35, 0.4),
      CRYSTAL,
      1.3,
      0.32,
      0.55,
      glow,
    );
    const dir = new THREE.Vector3(0.6, 0.22, -0.4).normalize();
    shard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    restOnGround(THREE, shard);
  }

  return detail.finish();
}
