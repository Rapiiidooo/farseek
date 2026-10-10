import { architectureDetail } from "../architecture-detail.js";
import { restOnGround } from "../ruins-checkpoint-detail.js";
// ruin_column, candidate A: primitives, vertex edits.
// A single fluted column of the drowned city, about 6 m tall on a square
// stepped plinth, snapped off with a jagged sheared top, two fallen drums
// lying beside it on the ground. No glow parts.
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
  const rnd = rng(9001);

  const STONE = mat(0xcfc6b4, 0.85, "stone", { flatShading: true });
  const ALGAE = mat(0x8f9a86, 0.9, "stone", { flatShading: true });
  const CORAL_A = mat(0xff7a8a, 0.7, "coral", { flatShading: true });
  const CORAL_B = mat(0xf59a55, 0.7, "coral", { flatShading: true });

  // A smooth deterministic noise around a full circle, keyed by (x,z) angle
  // so vertices sharing a direction (cap ring and side ring alike) agree.
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
  // Move the topmost ring of a geometry (centred at y=0) down by fn(x,z).
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
    return Math.round((a / (Math.PI * 2)) * n) % n;
  };

  // ---- plinth, two stepped courses -------------------------------------
  put(new THREE.BoxGeometry(1.7, 0.32, 1.7), ALGAE, 0, 0.16, 0);
  put(new THREE.BoxGeometry(1.35, 0.26, 1.35), STONE, 0, 0.32 + 0.13, 0);
  const PTOP = 0.58;

  // ---- fluted shaft, snapped at a jagged shear ------------------------
  const RSEG = 20,
    SH = 5.0,
    R_TOP = 0.4,
    R_BOT = 0.46;
  // Both caps stay on: the top cap's rim shares (x,z) with the wall's top
  // ring, so breakTop (keyed only on x,z) carries them down together and
  // the broken top stays watertight, no separate patch needed.
  const shaftGeo = new THREE.CylinderGeometry(R_TOP, R_BOT, SH, RSEG, 1, false);
  {
    const pos = shaftGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      const idx = angIdx(x, z, RSEG);
      const scale = idx % 2 === 0 ? 0.86 : 1; // shallow flutes
      pos.setX(i, x * scale);
      pos.setZ(i, z * scale);
    }
    pos.needsUpdate = true;
  }
  // A slanted break with a few chunks out of its rim; the cap's centre settles
  // among the rim heights so the fracture is a rough face, not a raised crown.
  const jag = angJag(4477, 9, 0.5);
  breakTop(
    shaftGeo,
    (x, z) => 0.18 + Math.max(-0.1, x * 0.28 + z * 0.22 + jag(x, z) - 0.25),
  );
  {
    const pos = shaftGeo.attributes.position,
      rim = [];
    for (let i = 0; i < pos.count; i++)
      if (pos.getY(i) > 0 && Math.hypot(pos.getX(i), pos.getZ(i)) > 0.1)
        rim.push(pos.getY(i));
    const middle = rim.reduce((s, y) => s + y, 0) / rim.length - 0.04;
    for (let i = 0; i < pos.count; i++)
      if (pos.getY(i) > 0 && Math.hypot(pos.getX(i), pos.getZ(i)) < 1e-6)
        pos.setY(i, middle);
    pos.needsUpdate = true;
  }
  put(shaftGeo, STONE, 0, PTOP + SH / 2, 0);

  detail.ring(STONE, 0.62, 0.21, 0.16, 0.67, 0, Math.PI * 2, 20);
  detail.ring(ALGAE, 0.49, 0.05, 0.06, 0.81, 0, Math.PI * 2, 20);
  for (const y of [1.76, 2.97, 4.18])
    detail.ring(
      ALGAE,
      0.46 - (y - PTOP) * 0.012,
      0.065,
      0.022,
      y,
      0,
      Math.PI * 2,
      20,
    );
  for (const sign of [-1, 1]) {
    detail.block(STONE, [sign * 0.59, 0.48, 0.59], [0.16, 0.12, 0.12], 0.025);
    detail.line(
      ALGAE,
      [
        [sign * 0.15, 0.21, 0.852],
        [sign * 0.27, 0.13, 0.853],
        [sign * 0.24, 0.027, 0.852],
      ],
      0.012,
    );
  }

  // ---- two fallen drums on the ground, placed as a mirrored pair so the
  // asset stays centred ---------------------------------------------------
  const drum = (x, z, len, a) => {
    const geo = new THREE.CylinderGeometry(0.44, 0.44, len, RSEG);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i),
        vz = pos.getZ(i);
      const scale = angIdx(vx, vz, RSEG) % 2 === 0 ? 0.86 : 1;
      pos.setX(i, vx * scale);
      pos.setZ(i, vz * scale);
    }
    pos.needsUpdate = true;
    const o = put(geo, STONE, x, 0, z);
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
    );
    return restOnGround(THREE, o);
  };
  drum(1.25, 0.55, 1.0, 0.55);
  drum(-1.25, -0.55, 1.0, 0.55 + Math.PI);

  // ---- coral crust near the base ----------------------------------------
  const coral = (x, y, z, n) => {
    for (let i = 0; i < n; i++) {
      const r = 0.06 + rnd() * 0.06;
      const o = put(
        new THREE.IcosahedronGeometry(r, 0),
        i % 2 ? CORAL_A : CORAL_B,
        x + (rnd() - 0.5) * 0.35,
        y + (rnd() - 0.5) * 0.12,
        z + (rnd() - 0.5) * 0.35,
      );
      o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      o.position.y = Math.max(o.position.y, r);
    }
  };
  coral(0.75, 0.18, -0.6, 3);
  coral(-0.7, 0.18, 0.6, 3);

  return detail.finish();
}
