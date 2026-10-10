import headData from "./assets/explorer/head.js";

const decode = (value, Type) =>
  new Type(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer);

function boundary(THREE, geometry, minimum = 1.48, maximum = 1.535) {
  const p = geometry.attributes.position,
    welded = new Map(),
    ids = [],
    aliases = new Map(),
    edges = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)]
      .map((x) => Math.round(x * 1e6))
      .join(",");
    if (!welded.has(key)) welded.set(key, i);
    const id = welded.get(key);
    ids.push(id);
    if (!aliases.has(id)) aliases.set(id, []);
    aliases.get(id).push(i);
  }
  for (let i = 0; i < geometry.index.count; i += 3)
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const u = ids[geometry.index.getX(i + a)],
        v = ids[geometry.index.getX(i + b)];
      if (u === v) continue;
      const key = Math.min(u, v) + "," + Math.max(u, v);
      if (!edges.has(key)) edges.set(key, { u, v, count: 0 });
      edges.get(key).count++;
    }
  const neighbors = new Map();
  for (const { u, v, count } of edges.values()) {
    if (count !== 1) continue;
    for (const [a, b] of [
      [u, v],
      [v, u],
    ]) {
      if (!neighbors.has(a)) neighbors.set(a, []);
      neighbors.get(a).push(b);
    }
  }
  const seen = new Set(),
    loops = [];
  for (const first of neighbors.keys()) {
    if (seen.has(first)) continue;
    const stack = [first],
      component = [];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      component.push(id);
      stack.push(...neighbors.get(id));
    }
    if (component.some((id) => neighbors.get(id).length !== 2)) continue;
    const low = Math.min(...component.map((id) => p.getY(id))),
      high = Math.max(...component.map((id) => p.getY(id)));
    if (low < minimum || high > maximum) continue;
    const ordered = [first];
    let previous = first,
      current = neighbors.get(first)[0];
    while (current !== first) {
      ordered.push(current);
      const next = neighbors.get(current).find((id) => id !== previous);
      previous = current;
      current = next;
    }
    let area = 0;
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i],
        b = ordered[(i + 1) % ordered.length];
      area += p.getX(a) * p.getZ(b) - p.getZ(a) * p.getX(b);
    }
    if (area < 0) ordered.reverse();
    const centerX =
      ordered.reduce((sum, id) => sum + p.getX(id), 0) / ordered.length;
    let start = 0,
      best = -Infinity;
    for (let i = 0; i < ordered.length; i++) {
      const score = p.getZ(ordered[i]) - Math.abs(p.getX(ordered[i]) - centerX);
      if (score > best) {
        start = i;
        best = score;
      }
    }
    loops.push([...ordered.slice(start), ...ordered.slice(0, start)]);
  }
  loops.sort((a, b) => b.length - a.length);
  if (!loops.length) throw new Error("Anatomical neck boundary is missing");
  const loop = loops[0],
    points = loop.map((id) => new THREE.Vector3().fromBufferAttribute(p, id)),
    distance = [0];
  for (let i = 0; i < points.length; i++)
    distance.push(
      distance.at(-1) +
        Math.hypot(
          points[(i + 1) % points.length].x - points[i].x,
          points[(i + 1) % points.length].z - points[i].z,
        ),
    );
  return {
    loop,
    points,
    fractions: distance.map((x) => x / distance.at(-1)),
    aliases,
    loops,
    directions: new Map([...edges].filter(([, edge]) => edge.count === 1)),
  };
}

export function fitNeckline(THREE, geometry, joints, clothCount, headIndex) {
  const attributes = geometry.attributes,
    values = Object.fromEntries(
      Object.entries(attributes).map(([name, attribute]) => [
        name,
        [...attribute.array],
      ]),
    ),
    original = attributes.position.array.slice(),
    shift = joints.hips.position.clone().sub(new THREE.Vector3(0, 0.95, 0)),
    headGeometry = new THREE.BufferGeometry(),
    headPosition = decode(headData.position, Float32Array),
    point = new THREE.Vector3();
  for (let i = 0; i < headPosition.length; i += 3) {
    point.fromArray(headPosition, i);
    point.y -= 1.52;
    point.applyMatrix4(joints.head.matrixWorld).sub(shift);
    headPosition.set(point.toArray(), i);
  }
  headGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(headPosition, 3),
  );
  headGeometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(decode(headData.normal, Int16Array), 3, true),
  );
  headGeometry.setAttribute(
    "uv",
    new THREE.BufferAttribute(decode(headData.uv, Uint16Array), 2, true),
  );
  headGeometry.setIndex(
    new THREE.BufferAttribute(decode(headData.index, Uint16Array), 1),
  );
  const head = boundary(THREE, headGeometry);
  const blendInfluences = (rows) => {
    const influence = new Map();
    for (const [indices, weights, amount] of rows)
      for (let k = 0; k < 4; k++)
        influence.set(
          indices[k],
          (influence.get(indices[k]) || 0) + weights[k] * amount,
        );
    const selected = [...influence].sort((a, b) => b[1] - a[1]).slice(0, 4);
    while (selected.length < 4) selected.push([0, 0]);
    const total = selected.reduce((sum, [, weight]) => sum + weight, 0);
    return {
      skinIndex: selected.map(([bone]) => bone),
      skinWeight: selected.map(([, weight]) => weight / total),
    };
  };
  const vertex = (id) =>
    Object.fromEntries(
      Object.entries(attributes).map(([name, attribute]) => [
        name,
        values[name].slice(
          id * attribute.itemSize,
          (id + 1) * attribute.itemSize,
        ),
      ]),
    );
  const mix = (a, b, t) => {
    const result = {};
    for (const name of Object.keys(attributes)) {
      if (name === "skinIndex" || name === "skinWeight") continue;
      result[name] = a[name].map((value, k) =>
        THREE.MathUtils.lerp(value, b[name][k], t),
      );
    }
    return Object.assign(
      result,
      blendInfluences([
        [a.skinIndex, a.skinWeight, 1 - t],
        [b.skinIndex, b.skinWeight, t],
      ]),
    );
  };
  const append = (row) => {
    const id = values.position.length / 3;
    for (const name of Object.keys(attributes)) values[name].push(...row[name]);
    return id;
  };
  const cuts = new Map();
  const cut = (a, b, t, plane) => {
    if (t < 1e-9) return a;
    if (t > 1 - 1e-9) return b;
    const key = `${Math.min(a, b)},${Math.max(a, b)}:${plane}`;
    if (!cuts.has(key)) cuts.set(key, append(mix(vertex(a), vertex(b), t)));
    return cuts.get(key);
  };
  const fan = (target, polygon) => {
    for (let i = 1; i + 1 < polygon.length; i++) {
      const ids = [polygon[0], polygon[i], polygon[i + 1]];
      if (new Set(ids).size < 3) continue;
      const [a, b, c] = ids.map((id) =>
        new THREE.Vector3().fromArray(values.position, id * 3),
      );
      if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-24) continue;
      target.push(...ids);
    }
  };
  const clip = (polygon, level, plane, inside) => {
    const result = [];
    for (let k = 0; k < polygon.length; k++) {
      const a = polygon[k],
        b = polygon[(k + 1) % polygon.length],
        rawA = level(a),
        rawB = level(b),
        da = Math.abs(rawA) < 1e-6 ? 0 : rawA,
        db = Math.abs(rawB) < 1e-6 ? 0 : rawB,
        keepA = inside ? da >= 0 : da <= 0,
        keepB = inside ? db >= 0 : db <= 0;
      if (keepA) result.push(a);
      if (keepA !== keepB) result.push(cut(a, b, da / (da - db), plane));
    }
    return result;
  };
  const lowerLevel = (id) =>
    values.position[id * 3 + 1] -
    1.43 -
    0.55 * Math.abs(values.position[id * 3]);
  const cloth = [],
    skin = [];
  for (let i = 0; i < geometry.index.count; i += 3) {
    const polygon = [...geometry.index.array.slice(i, i + 3)];
    fan(
      i < clothCount ? cloth : skin,
      clip(polygon, lowerLevel, "base", false),
    );
  }
  const commit = (indices) => {
    for (const [name, attribute] of Object.entries(attributes))
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(
          new attribute.array.constructor(values[name]),
          attribute.itemSize,
        ),
      );
    geometry.setIndex(indices);
  };
  commit([...cloth, ...skin]);
  const body = boundary(THREE, geometry, 1.429, 1.53);
  const parameterize = (ring) => {
    const center =
      (Math.min(...ring.points.map((p) => p.z)) +
        Math.max(...ring.points.map((p) => p.z))) /
      2;
    const angles = ring.points.map((p) => {
      const angle = Math.atan2(-p.x, p.z - center);
      return angle < -1e-7 ? angle + Math.PI * 2 : Math.max(0, angle);
    });
    const start = angles.indexOf(Math.min(...angles));
    ring.loop = [...ring.loop.slice(start), ...ring.loop.slice(0, start)];
    ring.points = [...ring.points.slice(start), ...ring.points.slice(0, start)];
    angles.push(...angles.splice(0, start));
    if (
      angles[0] > 0.02 ||
      angles.some((angle, i) => i && angle < angles[i - 1] - 1e-6)
    )
      throw new Error("Neck ring does not follow its radial parameter");
    ring.fractions = [...angles.map((angle) => angle / (Math.PI * 2)), 1];
    return ring;
  };
  parameterize(body);
  parameterize(head);
  const at = (ring, fraction, source) => {
    let edge =
      ring.fractions.findIndex((value, i) => i > 0 && value >= fraction) - 1;
    if (edge < 0) edge = ring.loop.length - 1;
    const t =
        (fraction - ring.fractions[edge]) /
        (ring.fractions[edge + 1] - ring.fractions[edge]),
      a = ring.loop[edge],
      b = ring.loop[(edge + 1) % ring.loop.length];
    return mix(source(a, fraction > 0.5), source(b, fraction > 0.5), t);
  };
  const bodyVertex = (id, positive) => {
    const aliases = body.aliases.get(id) || [id];
    const source = aliases.reduce((best, candidate) => {
      const u = values.skinUv[candidate * 2],
        bestU = values.skinUv[best * 2];
      return (positive ? u > bestU : u < bestU) ? candidate : best;
    }, id);
    return vertex(source);
  };
  const headVertex = (id, positive = false) => {
    const aliases = head.aliases.get(id) || [id];
    id = aliases.reduce((best, candidate) => {
      const u = headGeometry.attributes.uv.getX(candidate),
        bestU = headGeometry.attributes.uv.getX(best);
      return (positive ? u > bestU : u < bestU) ? candidate : best;
    }, id);
    const p = new THREE.Vector3().fromBufferAttribute(
        headGeometry.attributes.position,
        id,
      ),
      n = new THREE.Vector3().fromBufferAttribute(
        headGeometry.attributes.normal,
        id,
      );
    const result = vertex(0);
    result.position = p.toArray();
    result.normal = n.toArray();
    result.skinIndex = [headIndex, 0, 0, 0];
    result.skinWeight = [1, 0, 0, 0];
    result.skinUv = [
      headGeometry.attributes.uv.getX(id),
      headGeometry.attributes.uv.getY(id),
    ];
    result.uv = [p.x / 0.085, p.y / 0.085];
    result.color = result.skinColor = [1, 1, 1];
    return result;
  };
  const centerZ =
    head.points.reduce((sum, p) => sum + p.z, 0) / head.points.length;
  const fractions = [
    ...new Set([
      ...body.fractions.slice(0, -1),
      ...head.fractions.slice(0, -1),
    ]),
  ].sort((a, b) => a - b);
  const rings = [body],
    patch = [],
    seam = [];
  for (let step = 1; step < 8; step++) {
    const t = step / 8,
      loop = [];
    for (const fraction of fractions) {
      const lower = at(body, fraction, bodyVertex),
        upper = at(head, fraction, headVertex),
        a = new THREE.Vector3().fromArray(lower.position),
        b = new THREE.Vector3().fromArray(upper.position),
        delta = b.clone().sub(a),
        na = new THREE.Vector3().fromArray(lower.normal).normalize(),
        nb = new THREE.Vector3().fromArray(upper.normal).normalize(),
        da = delta.clone().addScaledVector(na, -delta.dot(na)),
        db = new THREE.Vector3(0, Math.max(0.009, delta.y), 0);
      db.addScaledVector(nb, -db.dot(nb));
      point
        .copy(a)
        .multiplyScalar(2 * t ** 3 - 3 * t ** 2 + 1)
        .addScaledVector(b, -2 * t ** 3 + 3 * t ** 2)
        .addScaledVector(da, t ** 3 - 2 * t ** 2 + t)
        .addScaledVector(db, t ** 3 - t ** 2);
      const row = mix(lower, upper, THREE.MathUtils.smoothstep(t, 0, 1));
      row.position = point.toArray();
      row.uv = [point.x / 0.085, point.y / 0.085];
      loop.push(append(row));
    }
    rings.push({ loop, fractions: [...fractions, 1] });
  }
  const top = head.loop.map((source) => {
    const id = append(
      headVertex(source, headGeometry.attributes.position.getX(source) > 0),
    );
    seam.push({ body: id, head: source });
    return id;
  });
  rings.push({ loop: top, fractions: head.fractions });
  const triangle = (a, b, c) => patch.push(a, c, b);
  for (let ring = 0; ring + 1 < rings.length; ring++) {
    const lower = rings[ring],
      upper = rings[ring + 1];
    let a = 0,
      b = 0;
    while (a < lower.loop.length || b < upper.loop.length) {
      const u = lower.loop[a % lower.loop.length],
        v = upper.loop[b % upper.loop.length];
      if (
        b === upper.loop.length ||
        (a < lower.loop.length &&
          lower.fractions[a + 1] <= upper.fractions[b + 1])
      ) {
        triangle(u, lower.loop[(a + 1) % lower.loop.length], v);
        a++;
      } else {
        triangle(u, upper.loop[(b + 1) % upper.loop.length], v);
        b++;
      }
    }
  }
  const textureSeam = new Map(),
    seamSource = new Map(seam.map((row) => [row.body, row.head]));
  const uvCenter = headGeometry.attributes.uv.getX(head.loop[0]);
  for (let i = 0; i < patch.length; i += 3) {
    const ids = patch.slice(i, i + 3);
    if (ids.reduce((sum, id) => sum + values.position[id * 3], 0) <= 0)
      continue;
    for (let k = 0; k < 3; k++) {
      const id = ids[k];
      if (
        Math.abs(values.position[id * 3]) > 1e-7 ||
        values.position[id * 3 + 2] > centerZ
      )
        continue;
      if (!textureSeam.has(id)) {
        const row = vertex(id),
          source = seamSource.get(id);
        if (source === undefined) row.skinUv[0] = uvCenter * 2 - row.skinUv[0];
        else {
          const aliases = head.aliases.get(source) || [source],
            right = aliases.reduce(
              (best, candidate) =>
                headGeometry.attributes.uv.getX(candidate) >
                headGeometry.attributes.uv.getX(best)
                  ? candidate
                  : best,
              source,
            );
          row.skinUv = [
            headGeometry.attributes.uv.getX(right),
            headGeometry.attributes.uv.getY(right),
          ];
          seam.push({ body: values.position.length / 3, head: right });
        }
        textureSeam.set(id, append(row));
      }
      patch[i + k] = textureSeam.get(id);
    }
  }
  const neckline = (id) => {
    const x = values.position[id * 3],
      y = values.position[id * 3 + 1],
      z = values.position[id * 3 + 2],
      back = 1.468 + 8 * x * x,
      front = 1.372 + 1.75 * Math.abs(x);
    return (
      y -
      THREE.MathUtils.lerp(
        back,
        front,
        THREE.MathUtils.smoothstep(z + shift.z, 0.015, 0.065),
      )
    );
  };
  const armhole = (id) => {
    const y = values.position[id * 3 + 1];
    const t = THREE.MathUtils.smoothstep(y, 1.48, 1.53);
    const width =
      y < 1.48
        ? THREE.MathUtils.lerp(
            0.155,
            0.121,
            THREE.MathUtils.smoothstep(y, 1.42, 1.48),
          )
        : THREE.MathUtils.lerp(0.121, 0.095, t);
    return Math.abs(values.position[id * 3]) - width;
  };
  const dressed = [],
    retainedSkin = [];
  for (let i = 0; i < skin.length; i += 3) {
    const polygon = skin.slice(i, i + 3);
    if (
      polygon.every(
        (id) =>
          Math.abs(values.position[id * 3]) < 0.106 &&
          values.position[id * 3 + 1] > 1.365,
      )
    ) {
      fan(dressed, clip(polygon, neckline, "neckline", false));
      fan(retainedSkin, clip(polygon, neckline, "neckline", true));
    } else retainedSkin.push(...polygon);
  }
  skin.length = 0;
  for (const id of retainedSkin) skin.push(id);
  for (let i = 0; i < cloth.length; i += 3) {
    const polygon = cloth.slice(i, i + 3);
    fan(dressed, clip(polygon, neckline, "neckline", false));
    fan(skin, clip(polygon, neckline, "neckline", true));
  }
  for (let i = 0; i < patch.length; i += 3) {
    const polygon = patch.slice(i, i + 3);
    fan(skin, clip(polygon, armhole, "armhole", true));
    const covered = clip(polygon, armhole, "armhole", false);
    fan(skin, clip(covered, neckline, "neckline", true));
    fan(dressed, clip(covered, neckline, "neckline", false));
  }
  commit([...dressed, ...skin]);
  const joins = boundary(THREE, geometry, 1.36, 1.53);
  let sealedCuts = 0;
  for (const loop of joins.loops) {
    if (
      loop.length !== 3 ||
      loop.some((id) => Math.abs(values.position[id * 3]) > 0.135)
    )
      continue;
    const edge = joins.directions.get(
        Math.min(loop[0], loop[1]) + "," + Math.max(loop[0], loop[1]),
      ),
      target = loop.every((id) => neckline(id) < 0 && armhole(id) < 0)
        ? dressed
        : skin;
    target.push(...(edge.u === loop[0] ? [loop[0], loop[2], loop[1]] : loop));
    sealedCuts++;
  }
  if (sealedCuts) commit([...dressed, ...skin]);
  const normal = geometry.attributes.normal,
    p = geometry.attributes.position,
    shared = new Map();
  for (let i = 0; i < p.count; i++) {
    if (i < original.length / 3 && original[i * 3 + 1] < 1.445) {
      normal.setXYZ(
        i,
        attributes.normal.getX(i),
        attributes.normal.getY(i),
        attributes.normal.getZ(i),
      );
      continue;
    }
    const key = [p.getX(i), p.getY(i), p.getZ(i)]
      .map((x) => Math.round(x * 1e6))
      .join(",");
    if (!shared.has(key))
      shared.set(key, { ids: [], normal: new THREE.Vector3() });
    const group = shared.get(key);
    group.ids.push(i);
    group.normal.add(new THREE.Vector3().fromBufferAttribute(normal, i));
  }
  for (const group of shared.values()) {
    if (group.normal.lengthSq() < 1e-14) continue;
    group.normal.normalize();
    for (const id of group.ids) normal.setXYZ(id, ...group.normal.toArray());
  }
  for (const { body: id, head: source } of seam)
    normal.setXYZ(
      id,
      headGeometry.attributes.normal.getX(source),
      headGeometry.attributes.normal.getY(source),
      headGeometry.attributes.normal.getZ(source),
    );
  const collarGeometry = geometry.clone();
  collarGeometry.setIndex(dressed);
  const collar = boundary(THREE, collarGeometry, 1.33, 1.53);
  if (collar.loop.length < 50 || collar.points.some((p) => Math.abs(p.x) > 0.1))
    throw new Error("Garment neckline is not an independent closed border");
  const armholes = collar.loops.filter((loop) =>
    loop.some((id) => Math.abs(geometry.attributes.position.getX(id)) > 0.11),
  );
  if (armholes.length !== 2)
    throw new Error("Garment armholes must remain independent closed borders");
  headGeometry.dispose();
  collarGeometry.dispose();
  return {
    clothCount: dressed.length,
    centerZ,
    seam,
    border: collar.loop,
    armholes,
    sealedCuts,
  };
}
