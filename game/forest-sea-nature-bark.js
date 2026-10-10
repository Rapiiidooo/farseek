// Bark texture coordinates for a grid of rings, each closing on its first point: v runs along the
// part in metres, u around it in metres rounded to whole tiles so the closing seam meets itself.
export function ringUV(rings, tile) {
  const centre = (ring) => {
    let x = 0,
      y = 0,
      z = 0;
    const n = ring.length - 1;
    for (let j = 0; j < n; j++) {
      x += ring[j].x;
      y += ring[j].y;
      z += ring[j].z;
    }
    return [x / n, y / n, z / n];
  };
  const lengths = rings.map((ring) => {
    const out = [0];
    for (let j = 1; j < ring.length; j++)
      out.push(out[j - 1] + ring[j].distanceTo(ring[j - 1]));
    return out;
  });
  const mean =
    lengths.reduce((sum, l) => sum + l[l.length - 1], 0) / lengths.length;
  const turns = Math.max(1, Math.round(mean / tile)) * tile;
  const uv = [];
  let along = 0,
    last = centre(rings[0]);
  rings.forEach((ring, i) => {
    const c = centre(ring);
    along += Math.hypot(c[0] - last[0], c[1] - last[1], c[2] - last[2]);
    last = c;
    const l = lengths[i],
      total = l[l.length - 1];
    for (let j = 0; j < ring.length; j++)
      uv.push(
        (total > 1e-6 ? l[j] / total : j / (ring.length - 1)) * turns,
        along,
      );
  });
  return uv;
}

// The rings of a TubeGeometry or LatheGeometry, laid out row by row with `columns` points each.
export function gridRings(THREE, geometry, columns) {
  const p = geometry.attributes.position,
    rings = [];
  for (let i = 0; i < p.count; i += columns)
    rings.push(
      Array.from({ length: columns }, (_, j) =>
        new THREE.Vector3().fromBufferAttribute(p, i + j),
      ),
    );
  return rings;
}

// The loader stretches each mesh's UVs by its size (surfaces.js scaleUVs, timber at 0.5 m) and the
// bark texture repeats every two units (bark-surface.js); dividing that out keeps one tile per `tile` m.
export function fitBarkUV(THREE, geometries, tile) {
  const box = new THREE.Box3(),
    v = new THREE.Vector3();
  for (const geometry of geometries) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.y = Math.max(0, v.y);
      box.expandByPoint(v);
    }
  }
  const size = box.getSize(new THREE.Vector3());
  const su = 2 / (tile * Math.max(1, Math.max(size.x, size.z) * 2)),
    sv = 2 / (tile * Math.max(1, size.y * 2));
  for (const geometry of geometries) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
  }
}

// Moss as a share of each vertex, from weight(position, normal), kept until tintMoss reads it.
export function mossWeights(THREE, geometry, weight) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    out = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const w = Math.min(
      1,
      Math.max(
        0,
        weight(a.fromBufferAttribute(p, i), b.fromBufferAttribute(n, i)),
      ),
    );
    out[i] = w * w * (3 - 2 * w);
  }
  geometry.setAttribute("moss", new THREE.BufferAttribute(out, 1));
  return geometry;
}

// Vertex colours multiply the material colour, so a gain of moss over bark turns the bark green
// under its own texture, with soft edges and no added faces.
export function tintMoss(THREE, mesh, bark, moss, amount = 0.85) {
  const geometry = mesh.geometry,
    share = geometry.attributes.moss,
    color = geometry.attributes.color;
  if (!share) return;
  const gain = [moss.r / bark.r, moss.g / bark.g, moss.b / bark.b];
  if (color)
    for (let i = 0; i < color.count; i++) {
      const k = share.getX(i) * amount;
      color.setXYZ(
        i,
        color.getX(i) * (1 + (gain[0] - 1) * k),
        color.getY(i) * (1 + (gain[1] - 1) * k),
        color.getZ(i) * (1 + (gain[2] - 1) * k),
      );
    }
  geometry.deleteAttribute("moss");
}

// Smooth noise in three dimensions, roughly within [-1, 1], for patchy growth.
export function patchNoise(x, y, z) {
  return (
    0.5 * Math.sin(x * 1.13 + Math.sin(z * 0.71) * 1.7) * Math.cos(y * 0.83) +
    0.3 * Math.sin(z * 1.91 + x * 0.37 + Math.cos(y * 1.37) * 1.2) +
    0.2 * Math.sin(y * 2.71 - z * 0.53 + Math.sin(x * 2.3))
  );
}
