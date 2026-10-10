// Closed masonry pieces for the drowned city's ruins: curved wall blocks with real ends, shells
// with thickness, and resting debris on the ground.

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A solid ring sector between radii r0 < r1, angles a0 < a1 (0 on +Z, as LatheGeometry) and
// heights y0 < y1, closed on all six sides. Faces are wound outwards and flat shaded.
export function arcBlock(THREE, r0, r1, a0, a1, y0, y1, segs = 2) {
  const pos = [],
    uv = [];
  const P = (r, a, y) => new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a));
  const n = new THREE.Vector3(),
    e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3();
  const quad = (q, out, uvOf) => {
    n.crossVectors(e1.subVectors(q[1], q[0]), e2.subVectors(q[2], q[0]));
    if (n.dot(out) < 0) q = [q[0], q[3], q[2], q[1]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(q[i].x, q[i].y, q[i].z);
      uv.push(...uvOf(q[i]));
    }
  };
  const side = (p) => [Math.atan2(p.x, p.z) * Math.hypot(p.x, p.z), p.y];
  const flat = (p) => [p.x, p.z];
  for (let i = 0; i < segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs,
      b = a0 + ((a1 - a0) * (i + 1)) / segs,
      m = (a + b) / 2;
    const radial = new THREE.Vector3(Math.sin(m), 0, Math.cos(m));
    quad(
      [P(r1, a, y0), P(r1, b, y0), P(r1, b, y1), P(r1, a, y1)],
      radial,
      side,
    );
    quad(
      [P(r0, a, y0), P(r0, b, y0), P(r0, b, y1), P(r0, a, y1)],
      radial.clone().negate(),
      side,
    );
    quad(
      [P(r0, a, y1), P(r1, a, y1), P(r1, b, y1), P(r0, b, y1)],
      new THREE.Vector3(0, 1, 0),
      flat,
    );
    quad(
      [P(r0, a, y0), P(r1, a, y0), P(r1, b, y0), P(r0, b, y0)],
      new THREE.Vector3(0, -1, 0),
      flat,
    );
  }
  const end = (a, sign) => {
    const out = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(
      sign,
    );
    quad([P(r0, a, y0), P(r1, a, y0), P(r1, a, y1), P(r0, a, y1)], out, (p) => [
      Math.hypot(p.x, p.z),
      p.y,
    ]);
  };
  end(a0, -1);
  end(a1, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

// A shell of the given thickness from an open indexed surface: the inner face is offset towards
// the axis (radially only, or towards the origin) and every open edge is closed by a wall.
export function thicken(THREE, geometry, thickness, radialOnly = false) {
  const source = geometry.attributes.position;
  const count = source.count;
  const positions = new Float32Array(count * 6);
  const uv = new Float32Array(count * 4);
  const point = new THREE.Vector3();
  const welded = new Map(),
    ids = [],
    edges = new Map();
  const sourceUv = geometry.attributes.uv;
  for (let i = 0; i < count; i++) {
    point.fromBufferAttribute(source, i);
    point.toArray(positions, i * 3);
    const key = point
      .toArray()
      .map((v) => Math.round(v * 1e5))
      .join(",");
    if (!welded.has(key)) welded.set(key, welded.size);
    ids.push(welded.get(key));
    const direction = point.clone();
    if (radialOnly) direction.y = 0;
    point.addScaledVector(direction.normalize(), -thickness);
    point.toArray(positions, (count + i) * 3);
    for (const offset of [i * 2, (count + i) * 2]) {
      uv[offset] = sourceUv ? sourceUv.getX(i) : 0;
      uv[offset + 1] = sourceUv ? sourceUv.getY(i) : 0;
    }
  }
  const outer = Array.from(geometry.index.array),
    index = [...outer];
  for (let i = 0; i < outer.length; i += 3) {
    const [a, b, c] = outer.slice(i, i + 3);
    index.push(c + count, b + count, a + count);
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      if (ids[from] === ids[to]) continue;
      const key = [ids[from], ids[to]].sort((x, y) => x - y).join(",");
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { from, to, count: 1 });
    }
  }
  for (const { from, to, count: uses } of edges.values())
    if (uses === 1)
      index.push(to, from, from + count, to, from + count, to + count);
  const solid = new THREE.BufferGeometry();
  solid.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  solid.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  solid.setIndex(index);
  solid.computeVertexNormals();
  geometry.dispose();
  return solid;
}

// Moves a placed mesh up or down so its lowest vertex sits `sink` below y = 0 of its parent.
export function restOnGround(THREE, mesh, sink = 0) {
  mesh.updateMatrix();
  const p = mesh.geometry.attributes.position,
    v = new THREE.Vector3();
  let low = Infinity;
  for (let i = 0; i < p.count; i++)
    low = Math.min(
      low,
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrix).y,
    );
  mesh.position.y += -sink - low;
  return mesh;
}
