// The collision world. The level is built from 2 m cells, so walls, platforms and blocks
// are axis-aligned boxes; props with round or rotated shapes are vertical cylinders fitted
// to their meshes, so the explorer touches what is drawn instead of an invisible box. The
// explorer is a vertical cylinder.
//
// Floating isles have a gently domed cap inside an irregular rim, measured off their mesh as
// a table by bearing: ground everywhere inside the rim, a wall beside it.
//
// Each collider carries three flags:
//   grab: its top edge can be hung from or vaulted onto (level geometry only);
//   stand: its top is ground. Irregular props are not, so a jump onto one slides off;
//   cam: it pushes the camera in when it comes between the lens and the explorer.
// and may be `unsafe`: ground that will not last, where the explorer must never respawn,
// or `slick`: ice, where the explorer keeps momentum.

const NO_GRAB = new Set(["mirror", "stela", "fire", "prop"]);
const NO_CAM = new Set(["mirror", "fire"]);

export class World {
  constructor() {
    this.boxes = [];
  }

  add(
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    kind = "rock",
    ref = null,
    opts = {},
  ) {
    const box = {
      shape: "box",
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      kind,
      ref,
      solid: true,
      grab: !NO_GRAB.has(kind),
      stand: true,
      cam: !NO_CAM.has(kind),
      ...opts,
    };
    this.boxes.push(box);
    return box;
  }

  // A vertical cylinder standing from minY to maxY. Props are neither grabbable nor ground
  // unless asked; `thin` marks posts and plants that thrown things pass.
  addRound(x, z, r, minY, maxY, kind = "prop", ref = null, opts = {}) {
    const c = {
      shape: "round",
      x,
      z,
      r,
      minX: x - r,
      maxX: x + r,
      minZ: z - r,
      maxZ: z + r,
      minY,
      maxY,
      kind,
      ref,
      solid: true,
      grab: false,
      stand: false,
      cam: true,
      ...opts,
    };
    this.boxes.push(c);
    return c;
  }

  // `isle`: { x, z, maxY, minY, rim, drop, k } from measureIsle in isles.js: the dome's axis
  // and crown, the rim radius on each bearing, and the fall below the crown at k fractions of
  // the rim along each bearing.
  addIsle(isle, opts = {}) {
    let reach = 0,
      sum = 0;
    for (const r of isle.rim) {
      reach = Math.max(reach, r);
      sum += r;
    }
    const b = {
      ...isle,
      shape: "isle",
      r: sum / isle.rim.length,
      minX: isle.x - reach,
      maxX: isle.x + reach,
      minZ: isle.z - reach,
      maxZ: isle.z + reach,
      kind: "rock",
      ref: null,
      solid: true,
      grab: false,
      stand: true,
      cam: true,
      ...opts,
    };
    this.boxes.push(b);
    return b;
  }

  remove(box) {
    const i = this.boxes.indexOf(box);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  // Highest top under a disc that the feet can reach by stepping, or -Infinity over a void.
  ground(x, z, radius, feet, stepUp) {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (b.shape === "isle") {
        if (!b.solid) continue;
        const p = isleAt(b, x, z);
        if (p.rho > p.rim + radius * 0.5) continue;
        if (p.top <= feet + stepUp && p.top > best) best = p.top;
        continue;
      }
      if (!b.solid || !b.stand || b.maxY > feet + stepUp || b.maxY <= best)
        continue;
      if (discHits(x, z, radius, b)) best = b.maxY;
    }
    return best;
  }

  // Whether anything solid stands at a point between the heights `low` and `high`, so set
  // dressing does not grow through props.
  occupied(x, z, radius, low, high) {
    return this.boxes.some(
      (b) =>
        b.solid &&
        b.shape !== "isle" &&
        b.maxY > low &&
        b.minY < high &&
        discHits(x, z, radius, b),
    );
  }

  // Pushes a cylinder out of every collider overlapping its body above the step height.
  // Returns the last wall normal touched, so the caller can slide or detect a push.
  resolve(pos, radius, feet, height, stepUp) {
    let normal = null;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.boxes) {
        // Only ground can be stepped onto; a prop's side stays a side all the way up.
        const step = b.stand ? stepUp : 0.02;
        if (b.shape === "isle") {
          if (!b.solid || b.minY >= feet + height) continue;
          const p = isleAt(b, pos.x, pos.z);
          const reach = p.rim + radius;
          // Standing on the cap, or stepping up onto it, is ground rather than a wall.
          if (p.rho >= reach || p.top <= feet + step) continue;
          const nx = p.rho > 1e-6 ? p.dx / p.rho : 1,
            nz = p.rho > 1e-6 ? p.dz / p.rho : 0;
          pos.x = b.x + nx * reach;
          pos.z = b.z + nz * reach;
          normal = { x: nx, z: nz, box: b };
          continue;
        }
        if (!b.solid || b.maxY <= feet + step || b.minY >= feet + height)
          continue;
        if (b.shape === "round") {
          const dx = pos.x - b.x,
            dz = pos.z - b.z;
          const reach = b.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= reach * reach) continue;
          const d = Math.sqrt(d2) || 1e-6;
          const nx = d2 > 1e-10 ? dx / d : 1,
            nz = d2 > 1e-10 ? dz / d : 0;
          pos.x = b.x + nx * reach;
          pos.z = b.z + nz * reach;
          normal = { x: nx, z: nz, box: b };
          continue;
        }
        const cx = clamp(pos.x, b.minX, b.maxX),
          cz = clamp(pos.z, b.minZ, b.maxZ);
        let dx = pos.x - cx,
          dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
          normal = { x: dx / d, z: dz / d, box: b };
        } else {
          // Centre inside the box: leave by the nearest face.
          const exits = [
            [pos.x - b.minX, -1, 0],
            [b.maxX - pos.x, 1, 0],
            [pos.z - b.minZ, 0, -1],
            [b.maxZ - pos.z, 0, 1],
          ].sort((a, c) => a[0] - c[0])[0];
          if (exits[1])
            pos.x = exits[1] < 0 ? b.minX - radius : b.maxX + radius;
          else pos.z = exits[2] < 0 ? b.minZ - radius : b.maxZ + radius;
          normal = { x: exits[1], z: exits[2], box: b };
        }
      }
    }
    return normal;
  }

  // Lowest ceiling above the head within a disc, or Infinity.
  ceiling(x, z, radius, feet, height) {
    let best = Infinity;
    for (const b of this.boxes) {
      if (!b.solid || b.minY < feet + height * 0.6 || b.minY >= best) continue;
      if (b.shape === "isle") {
        const p = isleAt(b, x, z);
        if (p.rho < p.rim + radius) best = b.minY;
        continue;
      }
      if (discHits(x, z, radius, b)) best = b.minY;
    }
    return best;
  }

  // Is a vertical slab of space free of colliders?
  free(x, z, radius, y0, y1, ignore = null) {
    for (const b of this.boxes) {
      if (
        !b.solid ||
        b === ignore ||
        b.maxY <= y0 + 1e-3 ||
        b.minY >= y1 - 1e-3
      )
        continue;
      if (b.shape === "isle") {
        const p = isleAt(b, x, z);
        if (p.rho < p.rim + radius && p.top > y0 + 1e-3) return false;
        continue;
      }
      if (discHits(x, z, radius, b)) return false;
    }
    return true;
  }

  // Is an axis-aligned footprint free of colliders between two heights? A sliding block's check.
  freeBox(minX, minZ, maxX, maxZ, y0, y1, ignore = null) {
    for (const b of this.boxes) {
      if (
        !b.solid ||
        b === ignore ||
        b.maxY <= y0 + 1e-3 ||
        b.minY >= y1 - 1e-3
      )
        continue;
      if (b.shape !== "box") {
        const dx = b.x - clamp(b.x, minX, maxX),
          dz = b.z - clamp(b.z, minZ, maxZ);
        if (dx * dx + dz * dz < b.r * b.r) return false;
      } else if (
        b.minX < maxX &&
        b.maxX > minX &&
        b.minZ < maxZ &&
        b.maxZ > minZ
      )
        return false;
    }
    return true;
  }

  // A grabbable top surface exactly at a height under a point, used to follow a ledge while
  // hanging and to find the edge under the explorer's feet.
  topAt(x, z, y, tolerance = 0.06) {
    for (const b of this.boxes) {
      if (!b.solid || !b.grab || b.shape !== "box") continue;
      if (Math.abs(b.maxY - y) > tolerance) continue;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return b;
    }
    return null;
  }

  // First collider hit by a ray, as a distance. Used by the camera, the beams and the disc.
  ray(ox, oy, oz, dx, dy, dz, maxDist, filter = null) {
    let best = maxDist,
      hit = null;
    for (const b of this.boxes) {
      if (!b.solid || (filter && !filter(b))) continue;
      // An isle reads as a cylinder of its mean rim here, which is close enough for the
      // camera and the disc.
      const t =
        b.shape === "box"
          ? rayBox(ox, oy, oz, dx, dy, dz, b, best)
          : rayRound(ox, oy, oz, dx, dy, dz, b, best);
      if (t !== null && t < best) {
        best = t;
        hit = b;
      }
    }
    return hit ? { t: best, box: hit } : null;
  }

  // Ground that will not last under a point: a bridge of light, a rock too small to wait on.
  // Ice underfoot.
  slickAt(x, z, feet) {
    for (const b of this.boxes)
      if (
        b.slick &&
        b.solid &&
        Math.abs(b.maxY - feet) < 0.05 &&
        discHits(x, z, 0.2, b)
      )
        return true;
    return false;
  }

  unsafeAt(x, z, feet) {
    for (const b of this.boxes) {
      if (!b.unsafe || !b.solid) continue;
      if (b.shape === "isle") {
        const p = isleAt(b, x, z);
        if (p.rho <= p.rim + 0.2 && Math.abs(p.top - feet) < 0.2) return true;
      } else if (Math.abs(b.maxY - feet) < 0.05 && discHits(x, z, 0.2, b))
        return true;
    }
    return false;
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Where a point stands over an isle: its distance from the dome's axis, the rim on that
// bearing, and the height of the cap there (at the rim when the point is beyond it).
export function isleAt(b, x, z) {
  const dx = x - b.x,
    dz = z - b.z;
  const rho = Math.hypot(dx, dz);
  const n = b.rim.length,
    k = b.k;
  const f = ((Math.atan2(dz, dx) / (Math.PI * 2)) * n + n) % n;
  const i0 = Math.floor(f) % n,
    t = f - Math.floor(f),
    i1 = (i0 + 1) % n;
  const rim = b.rim[i0] + (b.rim[i1] - b.rim[i0]) * t;
  const u = Math.min(1, rho / rim) * (k - 1);
  const j = Math.min(k - 2, Math.floor(u)),
    s = u - j;
  const d0 =
    b.drop[i0 * k + j] + (b.drop[i0 * k + j + 1] - b.drop[i0 * k + j]) * s;
  const d1 =
    b.drop[i1 * k + j] + (b.drop[i1 * k + j + 1] - b.drop[i1 * k + j]) * s;
  return { rho, rim, dx, dz, top: b.maxY - (d0 + (d1 - d0) * t) };
}

function discHits(x, z, r, b) {
  if (b.shape === "round") {
    const dx = x - b.x,
      dz = z - b.z,
      reach = r + b.r;
    return dx * dx + dz * dz < reach * reach;
  }
  const cx = clamp(x, b.minX, b.maxX),
    cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx,
    dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// Slab test without allocations: cameras and weapons cast many rays every frame.
const span = { near: 0, far: 0 };
function clipSlab(o, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let a = (lo - o) / d,
    c = (hi - o) / d;
  if (a > c) {
    const swap = a;
    a = c;
    c = swap;
  }
  if (a > span.near) span.near = a;
  if (c < span.far) span.far = c;
  return span.near <= span.far;
}

function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  span.near = 0;
  span.far = maxT;
  if (
    !clipSlab(ox, dx, b.minX, b.maxX) ||
    !clipSlab(oy, dy, b.minY, b.maxY) ||
    !clipSlab(oz, dz, b.minZ, b.maxZ)
  )
    return null;
  return span.near;
}

// A ray against a capped vertical cylinder: the side wall, then the top and bottom caps.
function rayRound(ox, oy, oz, dx, dy, dz, c, maxT) {
  const px = ox - c.x,
    pz = oz - c.z;
  const inside = px * px + pz * pz <= c.r * c.r;
  if (inside && oy >= c.minY && oy <= c.maxY) return 0;
  let best = null;
  const a = dx * dx + dz * dz;
  if (a > 1e-12) {
    const bq = px * dx + pz * dz;
    const cq = px * px + pz * pz - c.r * c.r;
    const disc = bq * bq - a * cq;
    if (disc >= 0) {
      const t = (-bq - Math.sqrt(disc)) / a;
      if (t >= 0 && t <= maxT) {
        const y = oy + dy * t;
        if (y >= c.minY && y <= c.maxY) best = t;
      }
    }
  }
  if (Math.abs(dy) > 1e-9) {
    for (const y of [c.maxY, c.minY]) {
      const t = (y - oy) / dy;
      if (t < 0 || t > maxT || (best !== null && t >= best)) continue;
      const hx = px + dx * t,
        hz = pz + dz * t;
      if (hx * hx + hz * hz <= c.r * c.r) best = t;
    }
  }
  return best;
}
