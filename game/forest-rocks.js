// Collision measured from the rendered meshes of rocks and trees: height fields of each
// shape, with faces traced between cell centres so the explorer slides along what is drawn.

const EMPTY = -1e9;
const WALKABLE = Math.tan((50 * Math.PI) / 180);
// Stone higher than this above the feet is a face: lower chips are stepped over and the
// boots never sink further into a flared base.
const ROCK_STEP = 0.3;
const BLOCK = 4;
const BUCKET = 8;
const RING = 8;

export class RockShape {
  // `ceiling` cuts the mesh off below anything that overhangs, such as a crown. Each cell
  // keeps the top of what is drawn over it, the underside of that top layer where open space
  // lies beneath it, and the top of anything under that underside.
  constructor(positions, cell, ceiling = Infinity) {
    if (ceiling < Infinity) positions = clipBelow(positions, ceiling);
    let minU = Infinity,
      maxU = -Infinity,
      minW = Infinity,
      maxW = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minU = Math.min(minU, positions[i]);
      maxU = Math.max(maxU, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
      minW = Math.min(minW, positions[i + 2]);
      maxW = Math.max(maxW, positions[i + 2]);
    }
    this.cell = cell;
    this.u0 = minU - 2 * cell;
    this.w0 = minW - 2 * cell;
    this.nu = Math.ceil((maxU - minU) / cell) + 4;
    this.nw = Math.ceil((maxW - minW) / cell) + 4;
    this.minY = minY;
    this.maxY = maxY;
    const nu = this.nu,
      n = nu * this.nw;
    const top = (this.top = new Float32Array(n).fill(EMPTY)),
      under = (this.under = new Float32Array(n).fill(EMPTY)),
      below = (this.below = new Float32Array(n).fill(EMPTY));
    const p = positions;
    // Faces turned down are undersides; a second pass finds what stands beneath them.
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < p.length; i += 9) {
        const ax = p[i],
          az = p[i + 2],
          bx = p[i + 3],
          bz = p[i + 5],
          cx = p[i + 6],
          cz = p[i + 8];
        const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
        if (Math.abs(area) < 1e-14 || (pass === 1 && area > 0)) continue;
        const i0 = Math.max(
            0,
            Math.ceil((Math.min(ax, bx, cx) - this.u0) / cell - 0.5),
          ),
          i1 = Math.min(
            nu - 1,
            Math.floor((Math.max(ax, bx, cx) - this.u0) / cell - 0.5),
          ),
          j0 = Math.max(
            0,
            Math.ceil((Math.min(az, bz, cz) - this.w0) / cell - 0.5),
          ),
          j1 = Math.min(
            this.nw - 1,
            Math.floor((Math.max(az, bz, cz) - this.w0) / cell - 0.5),
          );
        for (let j = j0; j <= j1; j++) {
          const z = this.w0 + (j + 0.5) * cell;
          for (let k = i0; k <= i1; k++) {
            const x = this.u0 + (k + 0.5) * cell;
            const s = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / area,
              t = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / area;
            if (s < -1e-6 || t < -1e-6 || s + t > 1 + 1e-6) continue;
            const y =
              p[i + 1] + (p[i + 4] - p[i + 1]) * s + (p[i + 7] - p[i + 1]) * t;
            const at = j * nu + k;
            if (pass === 1) {
              if (y < under[at] - 1e-4 && y > below[at]) below[at] = y;
              continue;
            }
            if (y > top[at]) top[at] = y;
            if (area > 0 && y > under[at]) under[at] = y;
          }
        }
      }
    // A layer whose top the ceiling cut away stands up to the ceiling.
    if (ceiling < Infinity)
      for (let k = 0; k < n; k++)
        if (under[k] > EMPTY && under[k] >= top[k] - 1e-4) {
          top[k] = ceiling;
          this.maxY = ceiling;
        }
    // Lowest and highest centre of each block of squares, to skip squares with no outline.
    this.bu = Math.ceil((nu - 1) / BLOCK);
    this.bw = Math.ceil((this.nw - 1) / BLOCK);
    this.low = new Float32Array(this.bu * this.bw).fill(Infinity);
    this.high = new Float32Array(this.bu * this.bw).fill(-Infinity);
    for (let j = 0; j < this.nw; j++)
      for (let k = 0; k < nu; k++) {
        const at = j * nu + k,
          v = top[at],
          least = under[at] > EMPTY ? below[at] : v;
        for (
          let bj = Math.max(0, Math.ceil((j - BLOCK) / BLOCK));
          bj <= Math.min(this.bw - 1, Math.floor(j / BLOCK));
          bj++
        )
          for (
            let bk = Math.max(0, Math.ceil((k - BLOCK) / BLOCK));
            bk <= Math.min(this.bu - 1, Math.floor(k / BLOCK));
            bk++
          ) {
            const b = bj * this.bu + bk;
            if (least < this.low[b]) this.low[b] = least;
            if (v > this.high[b]) this.high[b] = v;
          }
      }
  }

  // What a body reaching up to `high` meets at a centre: the top, unless the top layer hangs
  // clear above it, then whatever stands beneath.
  value(iu, iw, high = Infinity) {
    if (iu < 0 || iw < 0 || iu >= this.nu || iw >= this.nw) return EMPTY;
    const k = iw * this.nu + iu;
    return this.under[k] < high ? this.top[k] : this.below[k];
  }
}

// The parts of a flat list of triangles at or below a height.
function clipBelow(positions, ceiling) {
  const out = [],
    polygon = [];
  for (let i = 0; i < positions.length; i += 9) {
    let above = 0;
    for (let v = 1; v < 9; v += 3) if (positions[i + v] > ceiling) above++;
    if (above === 3) continue;
    if (above === 0) {
      for (let k = 0; k < 9; k++) out.push(positions[i + k]);
      continue;
    }
    polygon.length = 0;
    for (let v = 0; v < 9; v += 3) {
      const a = i + v,
        b = i + ((v + 3) % 9);
      const ya = positions[a + 1],
        yb = positions[b + 1];
      if (ya <= ceiling) polygon.push(positions[a], ya, positions[a + 2]);
      if (ya <= ceiling !== yb <= ceiling) {
        const t = (ceiling - ya) / (yb - ya);
        polygon.push(
          positions[a] + (positions[b] - positions[a]) * t,
          ceiling,
          positions[a + 2] + (positions[b + 2] - positions[a + 2]) * t,
        );
      }
    }
    for (let k = 3; k + 5 < polygon.length; k += 3)
      out.push(
        polygon[0],
        polygon[1],
        polygon[2],
        polygon[k],
        polygon[k + 1],
        polygon[k + 2],
        polygon[k + 3],
        polygon[k + 4],
        polygon[k + 5],
      );
  }
  return new Float32Array(out);
}

// The triangles of a geometry as one flat list of positions, local or moved by a matrix.
export function shapeTriangles(geometry, matrix = null) {
  const position = geometry.attributes.position,
    index = geometry.index;
  const count = index ? index.count : position.count;
  const out = new Float32Array(count * 3);
  const e = matrix?.elements;
  for (let i = 0; i < count; i++) {
    const v = index ? index.getX(i) : i;
    const x = position.getX(v),
      y = position.getY(v),
      z = position.getZ(v);
    out[i * 3] = e ? e[0] * x + e[4] * y + e[8] * z + e[12] : x;
    out[i * 3 + 1] = e ? e[1] * x + e[5] * y + e[9] * z + e[13] : y;
    out[i * 3 + 2] = e ? e[2] * x + e[6] * y + e[10] * z + e[14] : z;
  }
  return out;
}

// An instance pose from its matrix; forest rocks only turn about the vertical axis.
export function rockPose(THREE, matrix) {
  const position = new THREE.Vector3(),
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    yaw: 2 * Math.atan2(rotation.y, rotation.w),
    scale: (scale.x + scale.z) / 2,
    lift: scale.y,
  };
}

const probe = { height: EMPTY, slope: Infinity };
// The outline point nearest a query, in cell coordinates, and its signed distance in cells.
const edge = { d: Infinity, u: 0, w: 0, nu: 0, nw: 0 };
// The two deepest contacts of a pass: how deep, the push out and its direction; the face the
// previous pass left, which needs no push; and the shift that clears them.
const first = { depth: 0, rock: null, push: 0, x: 0, z: 0 };
const second = { depth: 0, rock: null, push: 0, x: 0, z: 0 };
const last = { push: 0, x: 0, z: 0 };
const shift = { x: 0, z: 0 };

// The shortest shift that moves a body `a.push` out along `a` and `b.push` along `b`, where
// both faces' constraints meet in a corner never further than a few pushes away.
function meet(a, b) {
  shift.x = a.x * a.push;
  shift.z = a.z * a.push;
  if (!b || shift.x * b.x + shift.z * b.z >= b.push) return;
  const bx = b.x * b.push,
    bz = b.z * b.push;
  if (bx * a.x + bz * a.z >= a.push) {
    shift.x = bx;
    shift.z = bz;
    return;
  }
  const det = a.x * b.z - a.z * b.x;
  if (Math.abs(det) <= 0.2) return;
  let tx = (a.push * b.z - b.push * a.z) / det,
    tz = (a.x * b.push - b.x * a.push) / det;
  const length = Math.hypot(tx, tz),
    limit = 3 * Math.max(a.push, b.push);
  if (length > limit) {
    tx *= limit / length;
    tz *= limit / length;
  }
  shift.x = tx;
  shift.z = tz;
}
const corner = new Float32Array(4);
const cross = new Float32Array(8);

export class RockField {
  constructor() {
    this.rocks = [];
    this.buckets = new Map();
    this.found = [];
    this.stamp = 0;
    this.normal = { x: 0, z: 0, box: null };
  }

  // A rock that does not `stand` is a wall only: its top is never footing. `step` is the
  // height of its face that a body walks into before the face stops it.
  add(
    shape,
    { x, y, z, yaw, scale, lift },
    { kind = "rock", stand = true, step = ROCK_STEP } = {},
  ) {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const rock = {
      shape,
      kind,
      stand,
      step,
      solid: true,
      cam: true,
      x,
      y,
      z,
      c,
      s,
      k: scale,
      sy: lift,
      minX: Infinity,
      maxX: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
      minY: y + shape.minY * lift,
      maxY: y + shape.maxY * lift,
      mark: 0,
    };
    const u1 = shape.u0 + shape.nu * shape.cell,
      w1 = shape.w0 + shape.nw * shape.cell;
    for (const [u, w] of [
      [shape.u0, shape.w0],
      [u1, shape.w0],
      [shape.u0, w1],
      [u1, w1],
    ]) {
      const wx = x + (u * c + w * s) * scale,
        wz = z + (-u * s + w * c) * scale;
      rock.minX = Math.min(rock.minX, wx);
      rock.maxX = Math.max(rock.maxX, wx);
      rock.minZ = Math.min(rock.minZ, wz);
      rock.maxZ = Math.max(rock.maxZ, wz);
    }
    this.rocks.push(rock);
    for (let bx = bucketOf(rock.minX); bx <= bucketOf(rock.maxX); bx++)
      for (let bz = bucketOf(rock.minZ); bz <= bucketOf(rock.maxZ); bz++) {
        const key = bucketKey(bx, bz);
        if (!this.buckets.has(key)) this.buckets.set(key, []);
        this.buckets.get(key).push(rock);
      }
    return rock;
  }

  // Rocks whose footprint reaches a horizontal rectangle, in a reused list.
  gather(minX, minZ, maxX, maxZ) {
    const found = this.found;
    found.length = 0;
    const stamp = ++this.stamp;
    for (let bx = bucketOf(minX); bx <= bucketOf(maxX); bx++)
      for (let bz = bucketOf(minZ); bz <= bucketOf(maxZ); bz++) {
        const list = this.buckets.get(bucketKey(bx, bz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const rock = list[i];
          if (rock.mark === stamp) continue;
          rock.mark = stamp;
          if (
            rock.maxX >= minX &&
            rock.minX <= maxX &&
            rock.maxZ >= minZ &&
            rock.minZ <= maxZ
          )
            found.push(rock);
        }
      }
    return found;
  }

  // One rock's surface at a point and its steepness; EMPTY off the rock, and steep at its
  // rim where the surface between cell centres is unknown.
  sample(rock, x, z) {
    probe.height = EMPTY;
    probe.slope = Infinity;
    const dx = x - rock.x,
      dz = z - rock.z;
    const shape = rock.shape,
      cell = shape.cell;
    const fu = ((dx * rock.c - dz * rock.s) / rock.k - shape.u0) / cell - 0.5,
      fw = ((dx * rock.s + dz * rock.c) / rock.k - shape.w0) / cell - 0.5;
    const iu = Math.floor(fu),
      iw = Math.floor(fw);
    if (iu < -1 || iw < -1 || iu >= shape.nu || iw >= shape.nw) return probe;
    const a = fu - iu,
      b = fw - iw;
    const v00 = shape.value(iu, iw),
      v10 = shape.value(iu + 1, iw),
      v01 = shape.value(iu, iw + 1),
      v11 = shape.value(iu + 1, iw + 1);
    if (v00 > EMPTY && v10 > EMPTY && v01 > EMPTY && v11 > EMPTY) {
      const top =
        v00 * (1 - a) * (1 - b) +
        v10 * a * (1 - b) +
        v01 * (1 - a) * b +
        v11 * a * b;
      const gu = ((v10 - v00) * (1 - b) + (v11 - v01) * b) / cell,
        gw = ((v01 - v00) * (1 - a) + (v11 - v10) * a) / cell;
      probe.height = rock.y + top * rock.sy;
      probe.slope = (Math.hypot(gu, gw) * rock.sy) / rock.k;
      return probe;
    }
    const nearest = shape.value(Math.round(fu), Math.round(fw));
    if (nearest > EMPTY) probe.height = rock.y + nearest * rock.sy;
    return probe;
  }

  // The highest rock drawn at a point, walkable or not.
  heightAt(x, z) {
    let best = -Infinity;
    const rocks = this.gather(x, z, x, z);
    for (let r = 0; r < rocks.length; r++) {
      const { height } = this.sample(rocks[r], x, z);
      if (height > EMPTY && height > best) best = height;
    }
    return best;
  }

  // Highest walkable rock under a disc that the feet reach by stepping, or -Infinity.
  ground(x, z, radius, feet, stepUp) {
    const limit = feet + stepUp;
    let best = -Infinity;
    const rocks = this.gather(x - radius, z - radius, x + radius, z + radius);
    const ring = radius >= 0.05 ? RING : 0;
    for (let r = 0; r < rocks.length; r++) {
      const rock = rocks[r];
      if (!rock.stand || rock.minY > limit) continue;
      for (let i = -1; i < ring; i++) {
        const angle = (i / RING) * Math.PI * 2;
        const { height, slope } = this.sample(
          rock,
          i < 0 ? x : x + Math.cos(angle) * radius,
          i < 0 ? z : z + Math.sin(angle) * radius,
        );
        if (height > best && height <= limit && slope <= WALKABLE)
          best = height;
      }
    }
    return best;
  }

  // Signed distance in cells from a point to the outline of the rock between `level` and
  // `high`, found within `reach` cells; negative inside. The nearest outline point is left in
  // `edge`, with the outward direction averaged over every segment within reach, weighted by
  // how far each intrudes, so cell-sized notches in the trace do not steer a sliding body.
  outline(shape, fu, fw, reach, level, high = Infinity) {
    edge.d = Infinity;
    edge.nu = 0;
    edge.nw = 0;
    const top = shape.top,
      under = shape.under,
      below = shape.below,
      nu = shape.nu;
    const i0 = Math.max(0, Math.floor(fu - reach)),
      i1 = Math.min(nu - 2, Math.floor(fu + reach)),
      j0 = Math.max(0, Math.floor(fw - reach)),
      j1 = Math.min(shape.nw - 2, Math.floor(fw + reach));
    if (i0 > i1 || j0 > j1) return edge;
    // An empty centre stands for the foot of the rock, the same from every square, so the
    // traced outline stays closed across its rim.
    const foot = Math.min(shape.minY, level) - 1e-4;
    const limit = reach * reach;
    let best = limit;
    for (let bj = Math.floor(j0 / BLOCK); bj <= Math.floor(j1 / BLOCK); bj++)
      for (
        let bi = Math.floor(i0 / BLOCK);
        bi <= Math.floor(i1 / BLOCK);
        bi++
      ) {
        const b = bj * shape.bu + bi;
        if (shape.low[b] > level || shape.high[b] <= level) continue;
        const ja = Math.max(j0, bj * BLOCK),
          jb = Math.min(j1, bj * BLOCK + BLOCK - 1),
          ia = Math.max(i0, bi * BLOCK),
          ib = Math.min(i1, bi * BLOCK + BLOCK - 1);
        for (let j = ja; j <= jb; j++)
          for (let i = ia; i <= ib; i++) {
            const k = j * nu + i;
            corner[0] = under[k] < high ? top[k] : below[k];
            corner[1] = under[k + 1] < high ? top[k + 1] : below[k + 1];
            corner[2] =
              under[k + nu + 1] < high ? top[k + nu + 1] : below[k + nu + 1];
            corner[3] = under[k + nu] < high ? top[k + nu] : below[k + nu];
            let above = 0;
            for (let c = 0; c < 4; c++) {
              if (corner[c] > level) above++;
              else if (corner[c] <= EMPTY) corner[c] = foot;
            }
            if (above === 0 || above === 4) continue;
            let n = 0;
            for (let c = 0; c < 4; c++) {
              const a = corner[c],
                d = corner[(c + 1) & 3];
              if (a > level === d > level) continue;
              const t = (level - a) / (d - a);
              const ua = c === 1 || c === 2 ? 1 : 0,
                wa = c >= 2 ? 1 : 0;
              const ud = c === 0 || c === 1 ? 1 : 0,
                wd = c === 1 || c === 2 ? 1 : 0;
              cross[n++] = i + ua + (ud - ua) * t;
              cross[n++] = j + wa + (wd - wa) * t;
            }
            for (let s = 0; s + 3 < n; s += 4) {
              const ax = cross[s],
                aw = cross[s + 1],
                ex = cross[s + 2] - ax,
                ew = cross[s + 3] - aw;
              const len = ex * ex + ew * ew;
              let t = len > 1e-12 ? ((fu - ax) * ex + (fw - aw) * ew) / len : 0;
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              const qu = ax + ex * t,
                qw = aw + ew * t;
              const d2 = (fu - qu) * (fu - qu) + (fw - qw) * (fw - qw);
              if (d2 >= limit) continue;
              const d = Math.sqrt(d2);
              if (d > 1e-6) {
                const weight = (reach - d) / d;
                edge.nu += (fu - qu) * weight;
                edge.nw += (fw - qw) * weight;
              }
              if (d2 < best) {
                best = d2;
                edge.u = qu;
                edge.w = qw;
                edge.d = d2;
              }
            }
          }
      }
    if (edge.d === Infinity) {
      edge.d = this.within(shape, fu, fw, level, high) ? -Infinity : Infinity;
      return edge;
    }
    edge.d = Math.sqrt(edge.d);
    if (this.within(shape, fu, fw, level, high)) {
      edge.d = -edge.d;
      edge.nu = -edge.nu;
      edge.nw = -edge.nw;
    }
    const length = Math.hypot(edge.nu, edge.nw);
    if (length > 1e-9) {
      edge.nu /= length;
      edge.nw /= length;
    }
    return edge;
  }

  // Whether the surface interpolated between cell centres stands above `level` at a point,
  // for a body reaching up to `high`.
  within(shape, fu, fw, level, high = Infinity) {
    const i = Math.floor(fu),
      j = Math.floor(fw);
    corner[0] = shape.value(i, j, high);
    corner[1] = shape.value(i + 1, j, high);
    corner[2] = shape.value(i + 1, j + 1, high);
    corner[3] = shape.value(i, j + 1, high);
    if (
      corner[0] <= level &&
      corner[1] <= level &&
      corner[2] <= level &&
      corner[3] <= level
    )
      return false;
    const foot = Math.min(shape.minY, level) - 1e-4;
    for (let c = 0; c < 4; c++) if (corner[c] <= EMPTY) corner[c] = foot;
    const a = fu - i,
      b = fw - j;
    return (
      corner[0] * (1 - a) * (1 - b) +
        corner[1] * a * (1 - b) +
        corner[2] * a * b +
        corner[3] * (1 - a) * b >
      level
    );
  }

  // Pushes a standing cylinder out of every rock face rising above its step. Returns the
  // last outward normal, as World.resolve does, or null.
  resolve(pos, radius, feet, height, step) {
    let normal = null;
    // The two deepest contacts each pass, until none remains. Pushed out of both at once, a
    // body held into the corner between two stones rests in it instead of shuttling between
    // their faces.
    for (let pass = 0; pass < 8; pass++) {
      const rocks = this.gather(
        pos.x - radius,
        pos.z - radius,
        pos.x + radius,
        pos.z + radius,
      );
      first.depth = second.depth = 0;
      first.rock = second.rock = null;
      for (let r = 0; r < rocks.length; r++) {
        const candidate = rocks[r],
          shape = candidate.shape,
          cell = shape.cell,
          climb = feet + Math.min(step, candidate.step);
        if (candidate.maxY <= climb || candidate.minY >= feet + height)
          continue;
        const dx = pos.x - candidate.x,
          dz = pos.z - candidate.z;
        const fu =
            ((dx * candidate.c - dz * candidate.s) / candidate.k - shape.u0) /
              cell -
            0.5,
          fw =
            ((dx * candidate.s + dz * candidate.c) / candidate.k - shape.w0) /
              cell -
            0.5;
        const reach = radius / candidate.k / cell,
          level = (climb - candidate.y) / candidate.sy,
          head = (feet + height - candidate.y) / candidate.sy;
        let d = this.outline(shape, fu, fw, reach + 1, level, head).d;
        if (d === -Infinity)
          d = this.outline(
            shape,
            fu,
            fw,
            2 / candidate.k / cell,
            level,
            head,
          ).d;
        if (d >= reach || !Number.isFinite(d)) continue;
        const depth = (reach - d) * cell * candidate.k;
        if (depth <= second.depth) continue;
        // Out along the face's averaged normal until the nearest outline point is a radius
        // away along the line to it.
        const span = Math.hypot(fu - edge.u, fw - edge.w) || 1e-6;
        const sign = d < 0 ? -1 : 1;
        const su = ((fu - edge.u) / span) * sign,
          sw = ((fw - edge.w) / span) * sign;
        let nu = edge.nu,
          nw = edge.nw;
        // Where the average leans far off the nearest face, as in a corner of the outline,
        // out straight from that face.
        if (nu * nu + nw * nw < 0.5 || nu * su + nw * sw < 0.5) {
          nu = su;
          nw = sw;
        }
        const slot = depth > first.depth ? first : second;
        if (slot === first) Object.assign(second, first);
        slot.depth = depth;
        slot.rock = candidate;
        slot.push =
          ((reach - d) / Math.max(0.3, nu * su + nw * sw)) * cell * candidate.k;
        slot.x = nu * candidate.c + nw * candidate.s;
        slot.z = -nu * candidate.s + nw * candidate.c;
      }
      if (!first.rock || first.depth < 1e-5) break;
      // A second face, or else the face the last pass pushed out of, is kept clear too.
      meet(
        first,
        second.rock && second.depth >= 1e-5 ? second : pass > 0 ? last : null,
      );
      pos.x += shift.x;
      pos.z += shift.z;
      last.x = first.x;
      last.z = first.z;
      normal = this.normal;
      normal.x = first.x;
      normal.z = first.z;
      normal.box = first.rock;
    }
    return normal;
  }

  // Whether rock rises above `low` within a disc, below `high`.
  blocked(x, z, radius, low, high) {
    const rocks = this.gather(x - radius, z - radius, x + radius, z + radius);
    for (let r = 0; r < rocks.length; r++) {
      const rock = rocks[r],
        shape = rock.shape,
        cell = shape.cell;
      if (rock.maxY <= low || rock.minY >= high) continue;
      const dx = x - rock.x,
        dz = z - rock.z;
      const reach = radius / rock.k / cell;
      const d = this.outline(
        shape,
        ((dx * rock.c - dz * rock.s) / rock.k - shape.u0) / cell - 0.5,
        ((dx * rock.s + dz * rock.c) / rock.k - shape.w0) / cell - 0.5,
        reach + 1,
        (low - rock.y) / rock.sy,
        (high - rock.y) / rock.sy,
      ).d;
      if (d < reach) return true;
    }
    return false;
  }

  // First rock along a ray, as { t, box }, or null.
  ray(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist,
      hit = null;
    const ex = ox + dx * maxDist,
      ez = oz + dz * maxDist;
    const rocks = this.gather(
      Math.min(ox, ex),
      Math.min(oz, ez),
      Math.max(ox, ex),
      Math.max(oz, ez),
    );
    for (let r = 0; r < rocks.length; r++) {
      const rock = rocks[r];
      span.t0 = 0;
      span.t1 = best;
      if (
        !slab(ox, dx, rock.minX, rock.maxX) ||
        !slab(oy, dy, rock.minY, rock.maxY) ||
        !slab(oz, dz, rock.minZ, rock.maxZ)
      )
        continue;
      const t0 = span.t0,
        t1 = span.t1;
      const step = Math.min(0.08, rock.shape.cell * rock.k * 2);
      let previous = t0;
      for (let t = t0; t <= t1 + step; t += step) {
        const at = Math.min(t, t1);
        if (!this.inside(rock, ox + dx * at, oy + dy * at, oz + dz * at)) {
          previous = at;
          if (at >= t1) break;
          continue;
        }
        let lo = previous,
          hi = at;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (this.inside(rock, ox + dx * mid, oy + dy * mid, oz + dz * mid))
            hi = mid;
          else lo = mid;
        }
        if (lo < best) {
          best = lo;
          hit = rock;
        }
        break;
      }
    }
    return hit ? { t: best, box: hit } : null;
  }

  inside(rock, x, y, z) {
    if (y < rock.minY) return false;
    const dx = x - rock.x,
      dz = z - rock.z;
    const shape = rock.shape,
      level = (y - rock.y) / rock.sy;
    return this.within(
      shape,
      ((dx * rock.c - dz * rock.s) / rock.k - shape.u0) / shape.cell - 0.5,
      ((dx * rock.s + dz * rock.c) / rock.k - shape.w0) / shape.cell - 0.5,
      level,
      level,
    );
  }

  // Development view: contour lines of every rock's measured surface.
  debugLines(THREE, spacing = 0.5) {
    const points = [];
    for (const rock of this.rocks) {
      const shape = rock.shape,
        cell = shape.cell,
        nu = shape.nu;
      const world = (fu, fw, y) => {
        const u = (fu + 0.5) * cell + shape.u0,
          w = (fw + 0.5) * cell + shape.w0;
        points.push(
          rock.x + (u * rock.c + w * rock.s) * rock.k,
          y,
          rock.z + (-u * rock.s + w * rock.c) * rock.k,
        );
      };
      for (
        let y = Math.ceil(rock.minY / spacing) * spacing;
        y < rock.maxY;
        y += spacing
      ) {
        const level = (y - rock.y) / rock.sy;
        for (let q = 0; q < shape.low.length; q++) {
          if (shape.low[q] > level || shape.high[q] <= level) continue;
          const i0 = (q % shape.bu) * BLOCK,
            j0 = Math.floor(q / shape.bu) * BLOCK;
          for (let j = j0; j < Math.min(j0 + BLOCK, shape.nw - 1); j++)
            for (let i = i0; i < Math.min(i0 + BLOCK, nu - 1); i++) {
              const k = j * nu + i;
              const values = [
                shape.top[k],
                shape.top[k + 1],
                shape.top[k + nu + 1],
                shape.top[k + nu],
              ];
              const above = values.filter((v) => v > level).length;
              if (above === 0 || above === 4) continue;
              const foot = Math.min(shape.minY, level) - 1e-4;
              const v = values.map((x) => (x > EMPTY ? x : foot));
              const ends = [];
              for (let c = 0; c < 4; c++) {
                const a = v[c],
                  b = v[(c + 1) & 3];
                if (a > level === b > level) continue;
                const t = (level - a) / (b - a);
                const ua = c === 1 || c === 2 ? 1 : 0,
                  wa = c >= 2 ? 1 : 0,
                  ub = c === 0 || c === 1 ? 1 : 0,
                  wb = c === 1 || c === 2 ? 1 : 0;
                ends.push([i + ua + (ub - ua) * t, j + wa + (wb - wa) * t]);
              }
              for (let s = 0; s + 1 < ends.length; s += 2) {
                world(ends[s][0], ends[s][1], y);
                world(ends[s + 1][0], ends[s + 1][1], y);
              }
            }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xff7a2c,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
        fog: false,
      }),
    );
    lines.name = "rock-collision-contours";
    lines.renderOrder = 50;
    lines.frustumCulled = false;
    return lines;
  }
}

const span = { t0: 0, t1: 0 };

// Narrows the ray interval in `span` to one axis of a box; false once it is empty.
function slab(o, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let a = (lo - o) / d,
    b = (hi - o) / d;
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  if (a > span.t0) span.t0 = a;
  if (b < span.t1) span.t1 = b;
  return span.t0 <= span.t1;
}

const bucketOf = (v) => Math.floor(v / BUCKET);
const bucketKey = (bx, bz) => (bx + 4096) * 8192 + (bz + 4096);
