import { refineNature } from "../nature-detail.js";

// lumen_plant, arm C: a second reading, one strand per stalk.
// Each stalk is a single swept tube that starts as a root tip on the ground,
// climbs the mound winding round the centre, so the five strands braid into the
// knotted mound, then rises and arches over, and its pod hangs from the end
// like a lantern. A pod is a translucent lathed bell with a glowing heart inside
// it, both in one mesh: the hearts are listed first, so they draw before the
// shells that blend over them. parts.pods is that mesh, parts.buds the beads;
// load with keepHierarchy to keep them.
export default function (THREE) {
  const g = new THREE.Group();

  // ---- materials --------------------------------------------------------------
  // Stalks and roots are night basalt in colour, but waxy and soft, not stone.
  const STALK = new THREE.MeshStandardMaterial({ color: 0x2a2830, roughness: 0.55, metalness: 0 });
  STALK.name = 'foliage';
  // Lumen lilac is emission only: the pod skin is as dark as the stalks and the
  // light comes from inside, so the game can pulse or dim it and the hue holds
  // at full glow. Unnamed and under 0.95 opacity, so the loader's procedural
  // surfaces leave the translucent skin alone.
  const POD = new THREE.MeshStandardMaterial({
    color: 0x2a2830, emissive: 0xd98cff, emissiveIntensity: 2.6,
    roughness: 0.3, metalness: 0, transparent: true, opacity: 0.8,
  });
  const BUD = new THREE.MeshStandardMaterial({
    color: 0x2a2830, emissive: 0xd98cff, emissiveIntensity: 1.8,
    roughness: 0.4, metalness: 0, transparent: true, opacity: 0.9,
  });

  // ---- helpers --------------------------------------------------------------------
  const buckets = new Map();
  const add = (geo, m) => {
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(geo);
    return geo;
  };
  const merge = (geos) => {
    const flat = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    let n = 0;
    for (const x of flat) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const x of flat) {
      pos.set(x.attributes.position.array, o * 3);
      nor.set(x.attributes.normal.array, o * 3);
      uv.set(x.attributes.uv.array, o * 2);
      o += x.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  };
  const lathe = (pts, seg) => {
    const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    if (seg === 10) {
      const p = geo.attributes.position, height = Math.max(...pts.map(([, y]) => y));
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getX(i), p.getZ(i)), t = p.getY(i) / height;
        const flute = 1 - 0.075 * Math.sin(a * 2.5) ** 2 * Math.sin(t * Math.PI);
        p.setX(i, p.getX(i) * flute); p.setZ(i, p.getZ(i) * flute);
      }
      geo.computeVertexNormals();
    }
    return geo;
  };
  const UP = new THREE.Vector3(0, 1, 0);
  const orient = (geo, p, dir) => geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize())).translate(p.x, p.y, p.z);
  // a tube along a curve whose radius follows rad(t)
  const sweep = (curve, rad, TS, RS) => {
    const tube = new THREE.TubeGeometry(curve, TS, 1, RS, false);
    const p = tube.attributes.position, c = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i <= TS; i++) {
      const t = i / TS, r = rad(t);
      curve.getPointAt(t, c);
      for (let j = 0; j <= RS; j++) {
        const k = i * (RS + 1) + j;
        w.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
        p.setXYZ(k, w.x, w.y, w.z);
      }
    }
    return tube;
  };
  // smooth normals with the seam and pole duplicates of a lathe averaged together
  const weldNormals = (geo) => {
    geo.computeVertexNormals();
    const p = geo.attributes.position, n = geo.attributes.normal, sum = new Map();
    const key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    for (let i = 0; i < p.count; i++) {
      const k = key(i), s = sum.get(k) || new THREE.Vector3();
      sum.set(k, s.add(new THREE.Vector3().fromBufferAttribute(n, i)));
    }
    for (let i = 0; i < p.count; i++) { const s = sum.get(key(i)).clone().normalize(); n.setXYZ(i, s.x, s.y, s.z); }
    return geo;
  };
  let seed = 90210;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const at = (deg, s, y) => { const a = (deg * Math.PI) / 180; return new THREE.Vector3(Math.sin(a) * s, y, Math.cos(a) * s); };

  // ---- a soft, lumpy core the strands wind over ------------------------------------
  {
    const geo = lathe([[0.001, 0], [0.24, 0], [0.235, 0.05], [0.2, 0.12], [0.14, 0.18], [0.07, 0.215], [0.001, 0.225]], 12);
    const p = geo.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(key)) {
        const k = Math.hypot(p.getX(i), p.getZ(i)) > 0.01 ? 0.88 + rnd() * 0.22 : 1;
        seen.set(key, [p.getX(i) * k, p.getY(i) > 0.001 ? p.getY(i) * (0.85 + rnd() * 0.27) : 0, p.getZ(i) * k]);
      }
      const [x, y, z] = seen.get(key);
      p.setXYZ(i, x, y, z);
    }
    add(weldNormals(geo), STALK);
  }
  // knots where the strands cross over the core
  for (const [deg, s, y, r] of [[70, 0.19, 0.15, 0.05], [200, 0.2, 0.14, 0.046], [320, 0.16, 0.2, 0.044]]) {
    add(weldNormals(new THREE.SphereGeometry(r, 8, 5).scale(1.25, 0.8, 1.25)).translate(...at(deg, s, y).toArray()), STALK);
  }

  // ---- five strands: root, braid, stalk, arch, and a hanging pod -----------------
  // [root azimuth deg, apex height, how far the arch reaches out, pod height, pod radius]
  const STRANDS = [
    [20, 1.3, 0.36, 0.225, 0.098],
    [92, 1.12, 0.42, 0.21, 0.091],
    [164, 0.96, 0.44, 0.2, 0.085],
    [236, 0.8, 0.42, 0.19, 0.079],
    [308, 0.64, 0.4, 0.18, 0.074],
  ];
  const hearts = [], shells = [], buds = [];
  STRANDS.forEach(([deg, apex, reach, hp, rp], si) => {
    const turn = 118;                                  // how far each strand winds round the centre
    const up = deg + turn, arch = up + 25;             // it rises here and arches out this way
    // root tip on the ground, hooked sideways; then over the core, round and up
    const curve = new THREE.CatmullRomCurve3([
      at(deg - 20, 0.4, 0.008), at(deg, 0.32, 0.04), at(deg + 40, 0.235, 0.12), at(deg + 75, 0.175, 0.2),
      at(deg + 102, 0.11, 0.27), at(up, 0.06, 0.38), at(up + 8, 0.1, apex * 0.55), at(arch, reach * 0.55, apex - 0.02),
      at(arch, reach * 0.88, apex - 0.07), at(arch, reach, apex - 0.2),
    ], false, 'centripetal');
    // thin at the root tip, thickest where it winds over the core, tapering to the pod
    const rad = (t) => (t < 0.28 ? 0.006 + (0.052 - 0.006) * Math.sin((t / 0.28) * Math.PI / 2) : 0.052 + (0.026 - 0.052) * ((t - 0.28) / 0.72));
    add(sweep(curve, rad, 36, 7), STALK);
    const tip = curve.getPointAt(1), dir = curve.getTangentAt(1);
    // the pod hangs on along the stalk's last direction; a closed calyx at its neck
    add(orient(lathe([[0.001, -0.028], [0.03, -0.018], [0.042, 0.004], [0.036, 0.024], [0.001, 0.03]], 6), tip, dir), STALK);
    const base = tip.clone().addScaledVector(dir, 0.01);
    shells.push(orient(lathe([[0.001, 0.0], [rp * 0.45, 0.012], [rp * 0.8, hp * 0.16], [rp, hp * 0.4], [rp * 0.96, hp * 0.6],
      [rp * 0.78, hp * 0.78], [rp * 0.45, hp * 0.92], [rp * 0.12, hp * 0.985], [0.001, hp]], 10), base, dir));
    const hr = rp * 0.55;   // the heart, a smooth egg in the middle of the bell
    hearts.push(orient(lathe([[0.001, 0], [hr * 0.7, hr * 0.25], [hr, hr * 1.1], [hr * 0.7, hr * 1.95], [0.001, hr * 2.3]], 7), base.clone().addScaledVector(dir, hp * 0.5 - hr * 1.15), dir));
    // one or two beads on the rising stalk, on alternate sides
    for (const [t, s] of si % 2 ? [[0.52, 1]] : [[0.45, 1], [0.6, -1]]) {
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const side = new THREE.Vector3().crossVectors(tan, UP).normalize().applyAxisAngle(tan, s * 1.1 + si);
      const r = rad(t), d = tan.clone().multiplyScalar(0.45).addScaledVector(side, 0.9).normalize();
      buds.push(orient(lathe([[0.001, 0], [0.022, 0.012], [0.028, 0.032], [0.02, 0.052], [0.001, 0.064]], 6), p.addScaledVector(side, r * 0.6), d));
    }
  });

  // ---- meshes: stalks merged; pods (hearts first) and buds their own meshes -------
  for (const [m, geos] of buckets) g.add(new THREE.Mesh(merge(geos), m));
  const podMesh = new THREE.Mesh(merge([...hearts, ...shells]), POD);
  podMesh.name = 'pods';
  const budMesh = new THREE.Mesh(merge(buds), BUD);
  budMesh.name = 'buds';
  g.add(podMesh, budMesh);

  // ---- place: base on y = 0, centred on x and z ----------------------------------
  const box3 = new THREE.Box3(), v = new THREE.Vector3(), m4 = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position; if (!p) return;
    const put = (mat4) => { for (let i = 0; i < p.count; i++) box3.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat4)); };
    if (n.isInstancedMesh) { for (let c = 0; c < n.count; c++) { n.getMatrixAt(c, im); put(m4.multiplyMatrices(n.matrixWorld, im)); } return; }
    put(n.matrixWorld);
  });
  const c = box3.getCenter(new THREE.Vector3());
  g.children.forEach((o) => { o.position.x -= c.x; o.position.y -= box3.min.y; o.position.z -= c.z; });

  g.userData.parts = { pods: podMesh, buds: budMesh };
  return refineNature(THREE, g, "lumen_plant");
}
