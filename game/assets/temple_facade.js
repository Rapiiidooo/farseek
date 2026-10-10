import { architectureDetail } from "../architecture-detail.js";
// temple_facade, arm A: primitives.
// A rock-cut temple front assembled from boxes, tapered boxes (the stepped,
// chamfered slabs), cylinders and a clamped sphere for the slit mask. Uncut cliff
// blocks are boxes with jittered front vertices, flat shaded so they read as
// split rock. Front faces +Z; the back is flat and mounts against the cliff.
export default function (THREE) {
  const g = new THREE.Group();
  const detail = architectureDetail(THREE, g);
  g.userData.mounts = "back";

  const mat = (hex, rough) => {
    const m = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: rough,
      metalness: 0,
    });
    m.name = "stone";
    return m;
  };
  const SUNLIT = mat(0xd4a373, 0.86);
  const SAND = mat(0xb57f4f, 0.9);
  const SIENNA = mat(0x8a5433, 0.94);
  const BONE = mat(0xe6d3ae, 0.8);
  const BASALT = mat(0x3a3531, 0.96);

  let seed = 424242;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const rr = (a, b) => a + (b - a) * rnd();

  const add = (geo, m) => {
    const mesh = new THREE.Mesh(geo, m);
    g.add(mesh);
    return mesh;
  };

  // Axis-aligned box from its extents, given in any order, so mirrored calls
  // never produce a negative size (which would turn the box inside out).
  // flare > 0 widens the top face (a corbelled capital), < 0 narrows it (a
  // plinth); either way the sloped sides act as the chamfer.
  const box = (xa, xb, ya, yb, za, zb, m, flare = 0, flareZ = flare) => {
    const x0 = Math.min(xa, xb),
      x1 = Math.max(xa, xb);
    const y0 = Math.min(ya, yb),
      y1 = Math.max(ya, yb);
    const z0 = Math.min(za, zb),
      z1 = Math.max(za, zb);
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    if (flare || flareZ) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) <= 0) continue;
        p.setX(i, p.getX(i) + Math.sign(p.getX(i)) * flare);
        p.setZ(i, p.getZ(i) + Math.sign(p.getZ(i)) * flareZ);
      }
      geo.computeVertexNormals();
    }
    const mesh = add(geo, m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return mesh;
  };
  const both = (fn) => {
    fn(1);
    fn(-1);
  };

  // A box whose front vertical edges are chamfered by c: a second depth segment
  // is moved to the crease and its front vertices pulled in, so the cut is real
  // geometry on the primitive rather than a painted line.
  const pier = (x0, x1, y0, y1, z0, z1, m, c, cutLeft, cutRight) => {
    const d = z1 - z0;
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, d, 1, 1, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      if (Math.abs(z) < 1e-6) p.setZ(i, d / 2 - c);
      else if (z > 0 && ((x > 0 && cutRight) || (x < 0 && cutLeft)))
        p.setX(i, x - Math.sign(x) * c);
    }
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    const mesh = add(flat, m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return mesh;
  };

  // A disc facing +Z whose front edge is chamfered by the radius difference.
  const disc = (x, y, z0, z1, rFront, rBack, m, seg = 28) => {
    const geo = new THREE.CylinderGeometry(rFront, rBack, z1 - z0, seg);
    geo.rotateX(Math.PI / 2); // the cylinder's top (+Y) becomes its front (+Z)
    const mesh = add(geo, m);
    mesh.position.set(x, y, (z0 + z1) / 2);
    return mesh;
  };

  // --- key planes ----------------------------------------------------------
  const BACK = -1.5; // flat back
  const CORE = 0.05; // the dressed rock face behind everything carved
  const WALL = 0.45; // the dressed wall plane between the pillars
  const CARVE = 6.25; // half width of the carved front
  const DW = 1.75,
    DH = 6.0; // doorway clear half width and height
  const DOOR_FRONT = 0.8; // front of the bone frame
  const DOOR_BACK = DOOR_FRONT - 2.0;
  const PILLARS = [3.55, 5.45];
  const PW = 0.45; // pillar half width
  const LINTEL = [7.3, 8.75];
  const TIERS = [
    [6.25, 0.98],
    [5.2, 0.72],
    [4.15, 0.46],
  ]; // half width, front
  const TIER_H = 1.05;

  // --- solid rock behind the carving ----------------------------------------
  both((s) => box(s * (DW + 0.3), s * CARVE, 0, 11.95, BACK, CORE, SAND));
  box(-DW - 0.3, DW + 0.3, DH + 0.3, 11.95, BACK, CORE, SAND);
  box(-DW - 0.3, DW + 0.3, 0, DH + 0.3, BACK, DOOR_BACK - 0.06, SAND);
  box(-7.95, 7.95, 0, 12.3, BACK, -1.32, SAND); // closes every gap between cliff blocks

  // --- doorway: bone frame, two recessed orders, a 2 m tunnel, dark interior -
  both((s) => {
    box(s * (DW + 0.6), s * (DW + 1.05), 0, 7.05, 0.1, DOOR_FRONT, BONE); // frame post
    box(s * (DW + 0.3), s * (DW + 0.6), 0, 6.6, CORE, 0.5, SAND); // order 2
    box(s * DW, s * (DW + 0.3), 0, 6.3, DOOR_BACK - 0.06, 0.2, SIENNA); // order 1 and tunnel
  });
  box(-DW - 1.05, DW + 1.05, 6.6, 7.05, 0.1, DOOR_FRONT, BONE);
  box(-DW - 0.6, DW + 0.6, 6.3, 6.6, CORE, 0.5, SAND);
  box(-DW - 0.3, DW + 0.3, DH, 6.3, DOOR_BACK - 0.06, 0.2, SIENNA);
  const dark = box(-DW, DW, 0, DH, DOOR_BACK - 0.06, DOOR_BACK, BASALT);
  dark.name = "doorway_dark";
  box(-DW, DW, 0, 0.05, DOOR_BACK, DOOR_FRONT, SIENNA); // worn threshold
  box(-DW - 1.05, DW + 1.05, 7.05, LINTEL[0], CORE, WALL, SAND);

  // --- dressed wall between the elements, a tall stepped niche in each bay --
  both((s) => {
    box(s * (DW + 1.05), s * (PILLARS[0] - PW), 0, LINTEL[0], CORE, WALL, SAND);
    const b0 = PILLARS[0] + PW,
      b1 = PILLARS[1] - PW; // the bay
    const n0 = b0 + 0.2,
      n1 = b1 - 0.2; // the niche
    box(s * b0, s * n0, 0, LINTEL[0], CORE, WALL, SAND);
    box(s * n1, s * b1, 0, LINTEL[0], CORE, WALL, SAND);
    box(s * n0, s * n1, 0, 1.2, CORE, WALL, SAND);
    box(s * n0, s * (n0 + 0.1), 5.5, LINTEL[0], CORE, WALL, SAND);
    box(s * (n1 - 0.1), s * n1, 5.5, LINTEL[0], CORE, WALL, SAND);
    box(s * (n0 + 0.1), s * (n1 - 0.1), 5.75, LINTEL[0], CORE, WALL, SAND);
    box(s * n0, s * n1, 1.2, 5.75, CORE, CORE + 0.02, SIENNA); // niche back
    box(s * (PILLARS[1] + PW), s * CARVE, 0, LINTEL[0], CORE, WALL, SAND);
    box(s * (DW + 1.05), s * CARVE, 0, 0.9, WALL, 0.62, SIENNA, -0.05, -0.05); // weathered plinth
  });

  // --- four engaged square pillars: one broad channel, stepped capitals -----
  for (const cx0 of PILLARS)
    both((s) => {
      const cx = s * cx0;
      box(cx - 0.7, cx + 0.7, 0, 0.4, CORE, 1.4, SIENNA, -0.07, -0.07);
      box(cx - 0.58, cx + 0.58, 0.4, 0.8, CORE, 1.28, SAND, -0.05, -0.05);
      box(cx - PW, cx + PW, 0.8, 6.4, CORE, 1.0, SAND);
      pier(cx - PW, cx - 0.12, 0.8, 6.4, 1.0, 1.16, SAND, 0.09, true, false);
      pier(cx + 0.12, cx + PW, 0.8, 6.4, 1.0, 1.16, SAND, 0.09, false, true);
      box(cx - 0.12, cx + 0.12, 0.8, 6.4, 1.0, 1.02, SIENNA); // channel floor
      for (const y of [5.7, 5.95])
        box(cx - PW - 0.01, cx + PW + 0.01, y, y + 0.1, 1.0, 1.17, SIENNA); // collar grooves
      box(cx - PW, cx + PW, 6.4, 6.7, CORE, 1.16, SAND, 0.09, 0.09);
      box(cx - 0.62, cx + 0.62, 6.7, 7.0, CORE, 1.27, SAND, 0.07, 0.07);
      box(cx - 0.76, cx + 0.76, 7.0, LINTEL[0], CORE, 1.36, SUNLIT, 0.05, 0.05);
    });

  // --- lintel band with a row of round medallions ---------------------------
  box(-CARVE, CARVE, LINTEL[0], LINTEL[1], CORE, 1.25, BONE);
  const MED_Y = (LINTEL[0] + LINTEL[1]) / 2;
  const medallion = (x, r) => {
    disc(x, MED_Y, 1.25, 1.28, r + 0.1, r + 0.1, SIENNA); // the sunk ring around it
    disc(x, MED_Y, 1.25, 1.39, r, r + 0.04, SAND);
  };
  medallion(0, 0.55);
  const ring = add(new THREE.TorusGeometry(0.34, 0.065, 8, 32), BONE);
  ring.position.set(0, MED_Y, 1.4);
  disc(0, MED_Y, 1.39, 1.5, 0.12, 0.17, SUNLIT, 20);
  both((s) => {
    // a tilted crescent: a bone disc two thirds covered by a proud sand disc
    const x = s * 1.78;
    medallion(x, 0.42);
    disc(x, MED_Y, 1.39, 1.43, 0.28, 0.28, BONE);
    disc(x + s * 0.1, MED_Y + 0.07, 1.39, 1.46, 0.23, 0.23, SAND);
    medallion(s * 3.55, 0.42); // twin circles
    for (const dx of [-0.14, 0.14])
      disc(s * 3.55 + dx, MED_Y, 1.39, 1.48, 0.09, 0.12, BONE, 16);
    medallion(s * 5.45, 0.42); // plain disc
    disc(s * 5.45, MED_Y, 1.39, 1.47, 0.2, 0.24, BONE, 20);
  });

  // --- stepped crown: three tiers, each narrower and set further back -------
  TIERS.forEach(([hw, front], i) => {
    const y0 = LINTEL[1] + i * TIER_H,
      y1 = y0 + TIER_H - 0.15;
    const m = i === 0 ? SAND : SUNLIT;
    box(-hw, hw, y0, y0 + 0.38, CORE, front, m);
    box(-hw, hw, y0 + 0.38, y0 + 0.52, CORE, front - 0.15, SIENNA); // channel
    box(-hw, hw, y0 + 0.52, y1, CORE, front, m);
    box(-hw, hw, y1, y1 + 0.15, CORE, front + 0.02, BONE, 0.06, 0.04);
  });

  // featureless mask with one vertical slit: an egg, broad at the brow, with a
  // flat face, so it reads as a face rather than an eye
  {
    const geo = new THREE.SphereGeometry(1, 24, 16);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      p.setXYZ(i, 0.8 * x * (1 + 0.14 * y), 1.1 * y, Math.min(0.46 * z, 0.34));
    }
    geo.computeVertexNormals();
    const mask = add(geo, BONE);
    mask.position.set(0, 10.72, 0.66);
    box(-0.08, 0.08, 10.3, 11.28, 0.8, 1.015, BASALT);
  }

  // --- uncut cliff rock around the sides and top ----------------------------
  const rock = (x0, x1, y0, y1, zFront, m) => {
    const w = x1 - x0,
      h = y1 - y0,
      zBack = -1.45,
      d = zFront - zBack;
    const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 1);
    const p = geo.attributes.position;
    const moved = new Map();
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i),
        ly = p.getY(i),
        lz = p.getZ(i);
      const key = `${lx.toFixed(3)},${ly.toFixed(3)},${lz.toFixed(3)}`;
      if (!moved.has(key)) {
        let nx = lx,
          ny = ly,
          nz = lz;
        if (lz > 0) {
          nx += rr(-0.14, 0.14);
          ny += rr(-0.16, 0.16);
          nz -= rr(0, 0.34);
          if (Math.abs(lx) < 1e-3 && Math.abs(ly) < 1e-3) nz += rr(0.05, 0.25);
        }
        // keep the silhouette inside the brief's 16 x 13 x 3 m
        const cx = x0 + w / 2,
          cy = y0 + h / 2;
        nx = Math.max(-8, Math.min(8, cx + nx)) - cx;
        ny = Math.min(13, Math.max(0, cy + ny)) - cy;
        moved.set(key, [nx, ny, Math.min(d / 2, nz)]);
      }
      const [a, b, c] = moved.get(key);
      p.setXYZ(i, a, b, c);
    }
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    const mesh = add(flat, m);
    mesh.position.set(x0 + w / 2, y0 + h / 2, zBack + d / 2);
    return mesh;
  };
  const toneAt = (y) => {
    const t = rnd();
    if (y < 2.4) return t < 0.75 ? SIENNA : SAND;
    if (y > 10.2) return t < 0.55 ? SUNLIT : SAND;
    return t < 0.8 ? SAND : t < 0.9 ? SUNLIT : SIENNA;
  };
  // side columns in irregular courses, one or two blocks across
  both((s) => {
    const span = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    let y = 0;
    while (y < 11.9) {
      const h = Math.min(rr(1.3, 2.3), 12.4 - y);
      const y1 = y + h;
      if (rnd() < 0.45) {
        const xm = rr(6.9, 7.3);
        rock(
          ...span(rr(6.1, 6.2), xm),
          y,
          y1 + 0.05,
          rr(1.0, 1.5),
          toneAt(y + h / 2),
        );
        rock(
          ...span(xm - 0.05, 8),
          y + rr(-0.1, 0.25),
          y1 + rr(-0.1, 0.1),
          rr(0.8, 1.3),
          toneAt(y + h / 2),
        );
      } else {
        rock(
          ...span(rr(6.1, 6.2), 8),
          y,
          y1 + 0.05,
          rr(0.95, 1.5),
          toneAt(y + h / 2),
        );
      }
      y = y1;
    }
    rock(...span(6.45, 7.3), 0, rr(0.55, 0.8), 1.5, SIENNA); // fallen block
  });
  // the top: a broken skyline across the full width, overhanging the crown
  {
    let x = -8;
    while (x < 7.9) {
      let w = rr(1.5, 2.6);
      if (8 - (x + w) < 1.0) w = 8 - x;
      const x1 = Math.min(8, x + w + 0.05);
      const mid = Math.abs((x + x1) / 2);
      rock(
        x,
        x1,
        11.9,
        rr(12.45, 13.0),
        mid < 4.5 ? rr(0.6, 1.05) : rr(0.9, 1.35),
        toneAt(12.5),
      );
      x = x1 - 0.05;
    }
  }

  for (const sign of [-1, 1]) {
    for (const y of [1.15, 2.35, 3.55, 4.75, 5.95]) {
      detail.block(SIENNA, [sign * 2.575, y, 0.805], [0.4, 0.027, 0.018], 0);
      detail.block(
        SAND,
        [sign * 2.925, y - 0.32, 0.463],
        [0.35, 0.62, 0.038],
        0.012,
      );
    }
    for (const x of PILLARS)
      for (const y of [1.6, 2.75, 3.9, 5.05])
        detail.block(SIENNA, [sign * x, y, 1.167], [0.88, 0.025, 0.018], 0);
    detail.line(
      SIENNA,
      [
        [sign * 5.93, 9.02, 0.985],
        [sign * 5.72, 9.23, 0.985],
        [sign * 5.77, 9.49, 0.985],
      ],
      0.019,
    );
  }
  // Worn flags in two staggered rows, so the threshold does not read as planks.
  for (const [x0, x1, z0, z1, t] of [
    [-1.6, -0.52, 0.02, 0.72, 0.016],
    [-0.5, 0.46, 0.02, 0.72, 0.012],
    [0.48, 1.6, 0.02, 0.72, 0.018],
    [-1.6, -0.82, -1.0, 0, 0.013],
    [-0.8, 0.12, -1.0, 0, 0.017],
    [0.14, 0.88, -1.0, 0, 0.012],
    [0.9, 1.6, -1.0, 0, 0.015],
  ])
    detail.block(
      SAND,
      [(x0 + x1) / 2, 0.05 + t / 2, (z0 + z1) / 2],
      [x1 - x0, t, z1 - z0],
      0,
    );

  // --- bake transforms, then place: base on y = 0, centred on x and z --------
  // Baking leaves every mesh translation-only, so the loader's Box3.setFromObject
  // agrees with the vertex bounds and the doorway data below holds in both modes.
  for (const m of g.children) {
    m.updateMatrix();
    m.geometry = m.geometry.clone().applyMatrix4(m.matrix);
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
  }
  const bb = new THREE.Box3(),
    v = new THREE.Vector3(),
    mm = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mat4) => {
      for (let i = 0; i < p.count; i++)
        bb.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4));
    };
    if (n.isInstancedMesh) {
      for (let c = 0; c < n.count; c++) {
        n.getMatrixAt(c, im);
        put(mm.multiplyMatrices(n.matrixWorld, im));
      }
      return;
    }
    put(n.matrixWorld);
  });
  const c = bb.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= c.x;
    o.position.y -= bb.min.y;
    o.position.z -= c.z;
  });

  // Plain data, measured after the shift: the clear doorway opening (3.5 x 6 m,
  // 2 m deep from the frame front to the dark interior) and its threshold.
  const r3 = (a) => a.map((n) => Math.round(n * 1000) / 1000);
  g.userData.doorway = {
    center: r3([-c.x, DH / 2 - bb.min.y, (DOOR_FRONT + DOOR_BACK) / 2 - c.z]),
    size: [2 * DW, DH, DOOR_FRONT - DOOR_BACK],
    threshold: r3([-c.x, 0.05 - bb.min.y, DOOR_FRONT - c.z]),
  };
  return detail.finish();
}
