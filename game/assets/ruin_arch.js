import { architectureDetail } from "../architecture-detail.js";
import { restOnGround } from "../ruins-checkpoint-detail.js";
// ruin_arch, candidate A: primitives, an extruded shape, vertex edits.
// A half-fallen arched gateway of the drowned city, about 10 m wide and 9 m
// tall: two square piers, the left standing tall with the springing of the
// arch curving up from it and breaking off jagged, the right broken low,
// wedge voussoirs fallen at the foot of both. No glow parts.
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
  const rnd = rng(6677);

  const STONE = mat(0xcfc6b4, 0.85, "stone", { flatShading: true });
  const ALGAE = mat(0x8f9a86, 0.9, "stone", { flatShading: true });
  const CORAL_A = mat(0xff7a8a, 0.7, "coral", { flatShading: true });
  const CORAL_B = mat(0xf59a55, 0.7, "coral", { flatShading: true });

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
  const jagProfile = (lo, hi, amp, seed, n = 6) => {
    const r = rng(seed);
    const c = Array.from({ length: n }, () => r());
    return (coord) => {
      const t = Math.max(0, Math.min(1, (coord - lo) / (hi - lo))) * (n - 1);
      const i0 = Math.min(n - 2, Math.floor(t)),
        fr = t - i0;
      return (c[i0] * (1 - fr) + c[i0 + 1] * fr) * amp;
    };
  };

  // ---- the two piers, a low sill between them ---------------------------
  const PIER_X = 4.4,
    PW = 1.2,
    PD = 1.05;
  put(
    new THREE.BoxGeometry(PIER_X * 2 + PW + 0.6, 0.22, PD + 0.7),
    ALGAE,
    0,
    0.11,
    0,
  );

  const H_LEFT = 6.55,
    H_RIGHT = 4.15;
  const leftGeo = new THREE.BoxGeometry(PW, H_LEFT, PD, 3, 1, 2);
  breakTop(leftGeo, (x, z) => 0.1 + jagProfile(-0.5, 0.5, 0.14, 811)(z));
  put(leftGeo, STONE, -PIER_X, 0.22 + H_LEFT / 2, 0);

  const rightGeo = new THREE.BoxGeometry(PW, H_RIGHT, PD, 3, 1, 2);
  breakTop(
    rightGeo,
    (x, z) =>
      jagProfile(-0.5, 0.5, 0.55, 822)(z) + jagProfile(-0.6, 0.6, 0.3, 823)(x),
  );
  put(rightGeo, STONE, PIER_X, 0.22 + H_RIGHT / 2, 0);

  // ---- the springing of the arch, curving up from the standing pier -----
  // A torus lies natively in the XY plane; placing its centre so the arc
  // passes through the pier top with a vertical tangent there, then sweeping
  // it inward and up, gives the start of a semicircular arch.
  const springY = 0.22 + H_LEFT,
    ARC_R = 3.35,
    ARC_SPAN = 0.74;
  const attachX = -PIER_X + PW / 2;
  const torusCentre = new THREE.Vector3(attachX + ARC_R, springY, 0);
  const sector = (a, b, r0, r1, depth, steps = 1) => {
    const points = [];
    for (let k = 0; k <= steps; k++)
      points.push([a + ((b - a) * k) / steps, r0]);
    for (let k = steps; k >= 0; k--)
      points.push([a + ((b - a) * k) / steps, r1]);
    const geometry = new THREE.ExtrudeGeometry(
      new THREE.Shape(
        points.map(
          ([angle, radius]) =>
            new THREE.Vector2(
              Math.cos(angle) * radius,
              Math.sin(angle) * radius,
            ),
        ),
      ),
      { depth, bevelEnabled: false, steps: 1, curveSegments: 1 },
    );
    return geometry.translate(torusCentre.x, torusCentre.y, -depth / 2);
  };
  for (let i = 0; i < 7; i++) {
    const a = Math.PI - ARC_SPAN + (i * ARC_SPAN) / 7 + 0.004;
    const b = Math.PI - ARC_SPAN + ((i + 1) * ARC_SPAN) / 7 - 0.004;
    // the last stone is cracked across and has lost its outer corner
    const outer = i === 0 ? ARC_R + 0.16 : ARC_R + 0.34;
    detail.add(
      sector(a, b, ARC_R - 0.34, outer, 0.68),
      i % 4 === 0 ? ALGAE : STONE,
    );
  }
  // mortar set back behind the joints, so they read as joints rather than slits of water
  detail.add(
    sector(
      Math.PI - ARC_SPAN + 0.02,
      Math.PI,
      ARC_R - 0.3,
      ARC_R + 0.12,
      0.6,
      7,
    ),
    ALGAE,
  );

  for (const [x, height] of [
    [-PIER_X, 5.9],
    [PIER_X, 3.6],
  ]) {
    for (let y = 0.52; y < height; y += 0.72)
      detail.block(ALGAE, [x, y, 0.529], [1.15, 0.035, 0.023], 0);
    detail.block(STONE, [x, 0.48, 0], [1.38, 0.28, 1.23], 0.07);
  }
  detail.block(STONE, [-PIER_X, 6.665, 0], [1.39, 0.25, 1.2], 0.045);

  // ---- voussoirs fallen at the foot of both piers ------------------------
  const vsh = new THREE.Shape();
  vsh.moveTo(-0.25, 0);
  vsh.lineTo(0.25, 0);
  vsh.lineTo(0.4, 0.6);
  vsh.lineTo(-0.4, 0.6);
  vsh.closePath();
  const voussoirGeo = new THREE.ExtrudeGeometry(vsh, {
    depth: 0.82,
    bevelEnabled: false,
    curveSegments: 1,
  });
  voussoirGeo.translate(0, 0, -0.41);
  const keystoneGeo = new THREE.ExtrudeGeometry(
    (() => {
      const s = new THREE.Shape();
      s.moveTo(-0.3, 0);
      s.lineTo(0.3, 0);
      s.lineTo(0.46, 0.72);
      s.lineTo(-0.46, 0.72);
      s.closePath();
      return s;
    })(),
    { depth: 0.95, bevelEnabled: false, curveSegments: 1 },
  );
  keystoneGeo.translate(0, 0, -0.475);

  // Each lies on its wide back or on a flank, resting on the sill or, past its edge, on the
  // ground; `roll` turns it about its length before it is laid down.
  const drop = (geo, x, z, rotY, roll, onSill) => {
    const o = put(geo, rnd() > 0.35 ? STONE : ALGAE, x, 0, z);
    o.rotation.set(0, rotY, roll, "YXZ");
    return restOnGround(THREE, o, onSill ? -0.22 : 0);
  };
  // the flanks lean 0.245 rad off vertical, so this turn lays one of them flat
  const BACK = Math.PI,
    FLANK = Math.PI / 2 - 0.245;
  drop(voussoirGeo, -3.4, 1.4, 0.4, BACK, false);
  drop(voussoirGeo, -2.5, -0.35, -1.1, FLANK, true);
  drop(voussoirGeo, -1.5, 0.45, 2.2, BACK, true);
  drop(voussoirGeo, 3.0, -0.4, 0.9, -FLANK, true);
  drop(voussoirGeo, 2.4, 1.35, -0.6, BACK, false);
  drop(voussoirGeo, 3.2, 0.45, 2.7, BACK, true);
  drop(keystoneGeo, -0.3, -1.45, 0.5, BACK, false);
  drop(voussoirGeo, 0.75, -1.4, 0.1, FLANK, false);
  drop(voussoirGeo, 1.0, 1.6, 1.6, -FLANK, false);

  // ---- coral crust near the bases ----------------------------------------
  const coral = (x, y, z, n) => {
    for (let i = 0; i < n; i++) {
      const r = 0.07 + rnd() * 0.07;
      const o = put(
        new THREE.IcosahedronGeometry(r, 0),
        i % 2 ? CORAL_A : CORAL_B,
        x + (rnd() - 0.5) * 0.4,
        y + (rnd() - 0.5) * 0.15,
        z + (rnd() - 0.5) * 0.4,
      );
      o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      // grown on the sill's top, never hovering over it
      o.position.z = Math.max(-0.8, Math.min(0.8, o.position.z));
      o.position.y = 0.22 + r * 0.55;
    }
  };
  coral(-4.6, 0.3, 0.7, 3);
  coral(4.7, 0.3, -0.6, 3);

  return detail.finish();
}
