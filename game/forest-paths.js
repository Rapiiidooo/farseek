import { overBog } from "./forest-bog.js";
import { stampVisible } from "./warden-path.js";

// Chase paths for the wildwood's boars around everything the forest measures from its meshes:
// an A* search over half-metre cells near the chase, each cell blocked where a boar's body on
// the floor would meet a box, a rock or a tree, or would stand in the bog's water. Each cell
// is tested once and remembered.

const CELL = 0.5;
const BODY = 0.55;
const MARGIN = 4;
const WIDEST = 96;
const X0 = -120,
  Z0 = -294,
  NX = 480,
  NZ = 608;
const FREE = 1,
  BLOCKED = 2;

const AREA = WIDEST * WIDEST;
const cost = new Float32Array(AREA);
const parent = new Int32Array(AREA);
const seen = new Uint8Array(AREA);
const heapCells = new Int32Array(AREA * 8);
const heapKeys = new Float32Array(AREA * 8);
const route = [];

export class BoarPaths {
  constructor(world) {
    this.world = world;
    this.known = new Uint8Array(NX * NZ);
  }

  blocked(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= NX || gz >= NZ) return true;
    const k = gx * NZ + gz;
    if (!this.known[k]) {
      const x = X0 + (gx + 0.5) * CELL,
        z = Z0 + (gz + 0.5) * CELL;
      const terrain = this.world.terrainAt(x, z);
      this.known[k] =
        !Number.isFinite(terrain) ||
        overBog(x, z, terrain) ||
        this.world.occupied(x, z, BODY, terrain + 0.3, terrain + 1.1)
          ? BLOCKED
          : FREE;
    }
    return this.known[k] === BLOCKED;
  }

  // Tests the cells of a square ahead of the chase, a column at a time between pauses.
  async warm(x, z, half, pause) {
    const gx0 = Math.floor((x - half - X0) / CELL),
      gx1 = Math.floor((x + half - X0) / CELL),
      gz0 = Math.floor((z - half - Z0) / CELL),
      gz1 = Math.floor((z + half - Z0) / CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) this.blocked(gx, gz);
      await pause();
    }
  }

  // Whether a boar walks straight from one point to another; the first point's own cell may
  // be blocked, as it is where a boar presses against a wall.
  clear(ax, az, bx, bz) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
    const sx = Math.floor((ax - X0) / CELL),
      sz = Math.floor((az - Z0) / CELL);
    for (let i = 1; i <= steps; i++) {
      const gx = Math.floor((ax + ((bx - ax) * i) / steps - X0) / CELL),
        gz = Math.floor((az + ((bz - az) * i) / steps - Z0) / CELL);
      if ((gx !== sx || gz !== sz) && this.blocked(gx, gz)) return false;
    }
    return true;
  }

  // Waypoints from `pos` to `target`, or as near it as the boar gets; with a `reach`, to any
  // point that close to the target from which it is seen.
  plan(pos, feet, target, reach = 0) {
    if (this.clear(pos.x, pos.z, target.x, target.z))
      return [{ x: target.x, z: target.z }];
    const half = (WIDEST * CELL) / 2;
    const midX = Math.min(
        Math.max((pos.x + target.x) / 2, pos.x - half + MARGIN),
        pos.x + half - MARGIN,
      ),
      midZ = Math.min(
        Math.max((pos.z + target.z) / 2, pos.z - half + MARGIN),
        pos.z + half - MARGIN,
      );
    const spanX = Math.min(
        WIDEST,
        Math.ceil((Math.abs(target.x - pos.x) + 2 * MARGIN) / CELL),
      ),
      spanZ = Math.min(
        WIDEST,
        Math.ceil((Math.abs(target.z - pos.z) + 2 * MARGIN) / CELL),
      );
    const gx0 = Math.floor((midX - X0) / CELL) - (spanX >> 1),
      gz0 = Math.floor((midZ - Z0) / CELL) - (spanZ >> 1);
    const local = (x, z) => {
      const i = Math.floor((x - X0) / CELL) - gx0,
        j = Math.floor((z - Z0) / CELL) - gz0;
      return i < 0 || j < 0 || i >= spanX || j >= spanZ ? -1 : i * spanZ + j;
    };
    const start = local(pos.x, pos.z);
    if (start < 0) return [];
    const near = Math.max(0.4, reach - 0.25);
    const centreX = (c) => X0 + (gx0 + Math.floor(c / spanZ) + 0.5) * CELL,
      centreZ = (c) => Z0 + (gz0 + (c % spanZ) + 0.5) * CELL;
    const guess = (c) =>
      Math.hypot(centreX(c) - target.x, centreZ(c) - target.z);
    seen.fill(0, 0, spanX * spanZ);
    let size = 0;
    const push = (c, key) => {
      let i = size++;
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (heapKeys[up] <= key) break;
        heapCells[i] = heapCells[up];
        heapKeys[i] = heapKeys[up];
        i = up;
      }
      heapCells[i] = c;
      heapKeys[i] = key;
    };
    const pop = () => {
      const top = heapCells[0],
        lastCell = heapCells[--size],
        lastKey = heapKeys[size];
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= size) break;
        if (child + 1 < size && heapKeys[child + 1] < heapKeys[child]) child++;
        if (heapKeys[child] >= lastKey) break;
        heapCells[i] = heapCells[child];
        heapKeys[i] = heapKeys[child];
        i = child;
      }
      heapCells[i] = lastCell;
      heapKeys[i] = lastKey;
      return top;
    };
    cost[start] = 0;
    parent[start] = -1;
    seen[start] = 1;
    push(start, guess(start));
    let best = start,
      bestGuess = guess(start),
      goal = -1;
    while (size && size < heapCells.length - 8) {
      const c = pop();
      if (seen[c] === 2) continue;
      seen[c] = 2;
      const left = guess(c);
      if (
        left <= near &&
        (!reach ||
          stampVisible(this.world, { x: centreX(c), z: centreZ(c) }, feet, {
            pos: target,
            feet: target.feet ?? feet,
          }))
      ) {
        goal = c;
        break;
      }
      if (left < bestGuess) {
        best = c;
        bestGuess = left;
      }
      const i = Math.floor(c / spanZ),
        j = c % spanZ;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = i + di,
            nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= spanX || nj >= spanZ) continue;
          const n = ni * spanZ + nj;
          if (seen[n] === 2 || this.blocked(gx0 + ni, gz0 + nj)) continue;
          if (
            di &&
            dj &&
            (this.blocked(gx0 + i, gz0 + nj) || this.blocked(gx0 + ni, gz0 + j))
          )
            continue;
          const g = cost[c] + (di && dj ? Math.SQRT2 : 1) * CELL;
          if (seen[n] === 1 && g >= cost[n]) continue;
          seen[n] = 1;
          cost[n] = g;
          parent[n] = c;
          push(n, g + guess(n));
        }
    }
    route.length = 0;
    for (let c = goal >= 0 ? goal : best; c >= 0; c = parent[c]) route.push(c);
    route.reverse();
    // Straight on past every cell the boar can walk to directly.
    const path = [];
    let fromX = pos.x,
      fromZ = pos.z;
    for (let k = 1; k < route.length;) {
      let far = k;
      while (
        far + 1 < route.length &&
        this.clear(
          fromX,
          fromZ,
          centreX(route[far + 1]),
          centreZ(route[far + 1]),
        )
      )
        far++;
      fromX = centreX(route[far]);
      fromZ = centreZ(route[far]);
      path.push({ x: fromX, z: fromZ });
      k = far + 1;
    }
    if (goal >= 0 && !reach && this.clear(fromX, fromZ, target.x, target.z))
      path.push({ x: target.x, z: target.z });
    return path;
  }
}
