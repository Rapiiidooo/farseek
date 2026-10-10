import { detailBatch } from "../prop-detail.js";

/**
 * sun_disc, candidate C: a faceted sunburst cut as one height field.
 *
 * A second part breakdown: the disc is a single flat-shaded polar mesh built
 * by hand, twelve sectors of six columns each, so every ray, step and notch is
 * a cut facet rather than an assembled part. From a chamfered bezel round a
 * cut turquoise gem set 5 mm deep, the faces step down through a basalt-inlaid tier and a
 * bronze tier to a blade that thins to a 6 mm notched edge. Over every tooth
 * a ray rises from the inlay and falls across the tiers, widening towards the
 * rim like sunlight. The leather strap is a chain of facets with two rivets.
 *
 * Lies flat, faces up and down, 0.45 m across and 0.06 m thick at the hub;
 * the strap hangs 1.5 mm below the hub, so the base (y = 0) is the strap.
 */
export default function (THREE) {
  const g = new THREE.Group();
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ---- palette (farseek/docs/style-lock.md) ---------------------------------
  const M = (color, name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const bronze = M(0x9a6a35, "metal", 0.42, 0.7);
  const basalt = M(0x3a3531, "stone", 0.7);
  const leather = M(0x4b2e1e, "fabric", 0.68);
  // Unnamed and just under opaque so the surface pass leaves it alone; the game
  // flares or dims it through emissiveIntensity.
  const glow = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    emissive: 0x39e3d0,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
  });

  // ---- a triangle soup per material, every face turned to face `want` ---------
  const soup = new Map();
  const emit = (mat, pts) => {
    if (!soup.has(mat)) soup.set(mat, []);
    for (const p of pts) soup.get(mat).push(p.x, p.y, p.z);
  };
  // Newell-style normal from the diagonals, so a quad that collapses to a
  // triangle on one side still knows which way it faces.
  const quad = (mat, a, b, c, d, want) => {
    const n = c.clone().sub(a).cross(d.clone().sub(b));
    emit(mat, n.dot(want) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]);
  };
  const tri = (mat, a, b, c, want) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    emit(mat, n.dot(want) >= 0 ? [a, b, c] : [a, c, b]);
  };
  const P = (r, h, a) => V3(r * Math.cos(a), h, r * Math.sin(a));
  const radial = (a) => V3(Math.cos(a), 0, Math.sin(a));

  // ---- the disc: 12 sectors, a notch at each sector's start, a ray at its middle
  const D = Math.PI / 180;
  const COLS = [0, 4, 12.5, 15, 17.5, 26]; // degrees within a sector
  const cols = [];
  for (let k = 0; k < 12; k++)
    for (const c of COLS) cols.push({ a: (k * 30 + c) * D, c });
  const edge = (c) => (c === 0 ? 0.207 : 0.225); // shallow V notch
  // the face, radius by radius: [r, height of the face, height of the ray crest]
  const RINGS = [
    [0.061, 0.03, 0.03],
    [0.078, 0.03, 0.03],
    [0.085, 0.024, 0.028], // bezel; the rays spring from its chamfer
    [0.085, 0.021, 0.028],
    [0.138, 0.021, 0.025], // basalt tier
    [0.138, 0.014, 0.025],
    [0.182, 0.014, 0.019], // bronze tier
    [0.182, 0.008, 0.008], // blade root
  ];
  const onRay = (c) => c === 15;
  for (let j = 0; j < cols.length; j++) {
    const A = cols[j],
      B = cols[(j + 1) % cols.length];
    const a = A.a,
      b = j + 1 === cols.length ? B.a + Math.PI * 2 : B.a;
    const out = radial((a + b) / 2);
    const rayFacet =
      (A.c === 12.5 && B.c === 15) || (A.c === 15 && B.c === 17.5);
    for (const s of [1, -1]) {
      const h = (ring, col) => (onRay(col.c) ? ring[2] : ring[1]) * s;
      for (let i = 0; i < RINGS.length - 1; i++) {
        const R0 = RINGS[i],
          R1 = RINGS[i + 1];
        const p0 = P(R0[0], h(R0, A), a),
          p1 = P(R0[0], h(R0, B), b),
          p2 = P(R1[0], h(R1, B), b),
          p3 = P(R1[0], h(R1, A), a);
        let want;
        if (R0[0] === R1[0]) {
          // a step: faces out where the face drops, in where it rises
          const drop = R0[1] - R1[1] + (R0[2] - R1[2]);
          want = drop >= 0 ? out : out.clone().negate();
        } else want = V3(0, s, 0);
        const inlay =
          R0[0] >= 0.085 && R1[0] <= 0.138 && R0[0] !== R1[0] && !rayFacet;
        quad(inlay ? basalt : bronze, p0, p1, p2, p3, want);
      }
      // blade: thins from the root to a notched edge
      const last = RINGS[RINGS.length - 1];
      quad(
        bronze,
        P(last[0], last[1] * s, a),
        P(last[0], last[1] * s, b),
        P(edge(B.c), 0.003 * s, b),
        P(edge(A.c), 0.003 * s, a),
        V3(0, s, 0).add(out.clone().multiplyScalar(0.3)),
      );
    }
    // outer edge wall, and the wall of the hole the gem sits in
    const ea = P(edge(A.c), 0, a),
      eb = P(edge(B.c), 0, b);
    let edgeOut = V3().crossVectors(eb.clone().sub(ea), V3(0, 1, 0));
    if (edgeOut.dot(out) < 0) edgeOut.negate();
    quad(
      bronze,
      P(edge(A.c), 0.003, a),
      P(edge(B.c), 0.003, b),
      P(edge(B.c), -0.003, b),
      P(edge(A.c), -0.003, a),
      edgeOut,
    );
    quad(
      bronze,
      P(0.061, 0.03, a),
      P(0.061, 0.03, b),
      P(0.061, -0.03, b),
      P(0.061, -0.03, a),
      out.clone().negate(),
    );
  }

  // ---- the gem: a cut twelve-sided double cabochon, 0.12 m across its flats ---
  const ngon = (r, n = 12) =>
    Array.from({ length: n }, (_, i) => {
      const t = (i * Math.PI * 2) / n + Math.PI / n;
      return [r * Math.cos(t), r * Math.sin(t)];
    });
  const gemPos = [];
  {
    const rings = [
      [-0.025, 0.029],
      [-0.011, 0.062],
      [0.011, 0.062],
      [0.025, 0.029],
    ].map(([y, r]) => [y, ngon(r)]);
    const pt = (ring, i) => {
      const [x, z] = ring[1][i % 12];
      return V3(x, ring[0], z);
    };
    const push = (a, b, c, want) => {
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      for (const p of n.dot(want) >= 0 ? [a, b, c] : [a, c, b])
        gemPos.push(p.x, p.y, p.z);
    };
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < 12; i++) {
        const a = pt(rings[k], i),
          b = pt(rings[k], i + 1),
          c = pt(rings[k + 1], i + 1),
          d = pt(rings[k + 1], i);
        const want = a.clone().add(c).multiplyScalar(0.5);
        push(a, b, c, want);
        push(a, c, d, want);
      }
    }
    for (const [ring, s] of [
      [rings[0], -1],
      [rings[rings.length - 1], 1],
    ]) {
      const ctr = V3(0, ring[0], 0);
      for (let i = 0; i < 12; i++)
        push(ctr, pt(ring, i), pt(ring, i + 1), V3(0, s, 0));
    }
  }

  // ---- grip strap: a chain of leather facets sagging under the disc, riveted --
  {
    const Z = -0.1,
      W = 0.04,
      T = 0.007;
    const mid = [
      [-0.118, -0.012],
      [-0.1, -0.021],
      [-0.06, -0.027],
      [0, -0.028],
      [0.06, -0.027],
      [0.1, -0.021],
      [0.118, -0.012],
    ];
    for (let i = 0; i < mid.length - 1; i++) {
      const [x0, y0] = mid[i],
        [x1, y1] = mid[i + 1];
      const t = V3(x1 - x0, y1 - y0, 0).normalize(),
        n = V3(-t.y, t.x, 0);
      const c = (x, y, dn, dz) => V3(x + n.x * dn, y + n.y * dn, Z + dz);
      quad(
        leather,
        c(x0, y0, -T / 2, -W / 2),
        c(x1, y1, -T / 2, -W / 2),
        c(x1, y1, -T / 2, W / 2),
        c(x0, y0, -T / 2, W / 2),
        n.clone().negate(),
      );
      quad(
        leather,
        c(x0, y0, T / 2, -W / 2),
        c(x1, y1, T / 2, -W / 2),
        c(x1, y1, T / 2, W / 2),
        c(x0, y0, T / 2, W / 2),
        n,
      );
      quad(
        leather,
        c(x0, y0, -T / 2, W / 2),
        c(x1, y1, -T / 2, W / 2),
        c(x1, y1, T / 2, W / 2),
        c(x0, y0, T / 2, W / 2),
        V3(0, 0, 1),
      );
      quad(
        leather,
        c(x0, y0, -T / 2, -W / 2),
        c(x1, y1, -T / 2, -W / 2),
        c(x1, y1, T / 2, -W / 2),
        c(x0, y0, T / 2, -W / 2),
        V3(0, 0, -1),
      );
    }
    for (const x of [-0.11, 0.11]) {
      const ring = ngon(0.01, 6),
        y0 = -0.0215,
        y1 = -0.016;
      for (let i = 0; i < 6; i++) {
        const [ax, az] = ring[i],
          [bx, bz] = ring[(i + 1) % 6];
        quad(
          bronze,
          V3(x + ax, y0, Z + az),
          V3(x + bx, y0, Z + bz),
          V3(x + bx * 0.6, y1, Z + bz * 0.6),
          V3(x + ax * 0.6, y1, Z + az * 0.6),
          V3(ax + bx, -0.4, az + bz),
        );
        tri(
          bronze,
          V3(x, y0 - 0.003, Z),
          V3(x + ax, y0, Z + az),
          V3(x + bx, y0, Z + bz),
          V3(0, -1, 0),
        );
      }
    }
  }

  // ---- meshes: one per material, the gem apart ---------------------------------
  const boxUV = (geo) => {
    geo.computeBoundingBox();
    const bb = geo.boundingBox,
      sz = bb.getSize(V3());
    const H = Math.max(sz.x, sz.z, 1e-6),
      VY = Math.max(sz.y, 1e-6);
    const p = geo.attributes.position,
      n = geo.attributes.normal,
      uv = new Float32Array(p.count * 2);
    for (let t = 0; t < p.count; t += 3) {
      let ax = 0,
        ay = 0,
        az = 0;
      for (let k = 0; k < 3; k++) {
        ax += Math.abs(n.getX(t + k));
        ay += Math.abs(n.getY(t + k));
        az += Math.abs(n.getZ(t + k));
      }
      for (let k = t; k < t + 3; k++) {
        const x = p.getX(k) - bb.min.x,
          y = p.getY(k) - bb.min.y,
          z = p.getZ(k) - bb.min.z;
        const [u, v] =
          ay >= ax && ay >= az
            ? [x / H, z / VY]
            : ax >= az
              ? [z / H, y / VY]
              : [x / H, y / VY];
        uv[k * 2] = u;
        uv[k * 2 + 1] = v;
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geo;
  };
  const mesh = (pos, mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(boxUV(geo), mat);
  };
  for (const [mat, pos] of soup) g.add(mesh(pos, mat));
  const lens = mesh(gemPos, glow);
  lens.name = "lens";
  g.add(lens);


  const details = detailBatch(THREE, g);
  for (const side of [-1, 1]) for (let i = 0; i < 24; i++) {
    const a = (i + 0.25) * Math.PI / 12;
    details.line(bronze, [[Math.cos(a) * 0.095, side * 0.0217, Math.sin(a) * 0.095], [Math.cos(a) * (i % 2 ? 0.116 : 0.128), side * 0.0217, Math.sin(a) * (i % 2 ? 0.116 : 0.128)]], 0.0007);
  }
  details.finish();

  // ---- placement: base at y = 0, centred on x and z, measured on vertices -----
  const box = new THREE.Box3(),
    v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position;
    if (!p) return;
    const put = (mat) => {
      for (let i = 0; i < p.count; i++)
        box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat));
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
  const ctr = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => {
    o.position.x -= ctr.x;
    o.position.y -= box.min.y;
    o.position.z -= ctr.z;
  });

  g.userData.parts = { lens };
  return g;
}
