import { World } from "./world.js";

const RADIUS = 0.45;
const CLEARANCE = RADIUS + 0.09;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function stampVisible(world, from, feet, hero) {
  if (!world.ray) return true;
  const dx = hero.pos.x - from.x;
  const dz = hero.pos.z - from.z;
  const dy = hero.feet - feet;
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.001) return true;
  return !world.ray(
    from.x,
    feet + 0.7,
    from.z,
    dx / length,
    dy / length,
    dz / length,
    length,
    (box) => !box.thin,
  );
}

export class WardenPath {
  constructor(world) {
    this.world = world;
    this.reset();
  }

  reset() {
    this.path = [];
    this.target = null;
    this.left = 0;
  }

  next(dt, pos, feet, target, reach = 0) {
    if (!this.world.boxes) return target;
    this.left -= dt;
    if (!this.target || distance(target, this.target) > 0.9 || this.left <= 0) {
      this.target = { ...target };
      this.left = 0.6;
      this.path = this.plan(pos, feet, target, reach);
    }
    while (this.path.length && distance(pos, this.path[0]) < 0.18)
      this.path.shift();
    return this.path[0] ?? pos;
  }

  plan(pos, feet, target, reach) {
    const local = new World();
    const minX = Math.min(pos.x, target.x) - 3;
    const maxX = Math.max(pos.x, target.x) + 3;
    const minZ = Math.min(pos.z, target.z) - 3;
    const maxZ = Math.max(pos.z, target.z) + 3;
    local.boxes = this.world.boxes.filter(
      (box) =>
        box.solid &&
        box.maxX >= minX &&
        box.minX <= maxX &&
        box.maxZ >= minZ &&
        box.minZ <= maxZ,
    );
    const traverse = (from, to) => {
      let height = from.feet;
      const steps = Math.max(1, Math.ceil(distance(from, to) / 0.3));
      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const z = from.z + (to.z - from.z) * (i / steps);
        const point = { x, z };
        local.resolve(point, RADIUS, height, 1.1, 0.3);
        if (Math.hypot(point.x - x, point.z - z) > 0.001) return null;
        const next = this.world.ground(x, z, 0.2, height, 0.3);
        if (!Number.isFinite(next) || next < height - 0.5) return null;
        height = next;
      }
      return height;
    };
    const start = { ...pos, feet };
    if (traverse(start, target) !== null) return [{ ...target }];
    const nodes = [start, { ...target }];
    let goals = 1;
    if (reach > 0) {
      const radius = Math.max(0.4, reach - 0.25);
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        nodes.push({
          x: target.x + Math.cos(angle) * radius,
          z: target.z + Math.sin(angle) * radius,
        });
      }
      goals += 8;
    }
    const blockers = local.boxes
      .filter(
        (box) =>
          box.maxY > feet + (box.stand ? 0.3 : 0.02) && box.minY < feet + 1.1,
      )
      .sort((a, b) => {
        const near = (box) =>
          Math.hypot(
            Math.max(box.minX - pos.x, 0, pos.x - box.maxX),
            Math.max(box.minZ - pos.z, 0, pos.z - box.maxZ),
          );
        return near(a) - near(b);
      })
      .slice(0, 12);
    for (const box of blockers) {
      for (const x of [box.minX - CLEARANCE, box.maxX + CLEARANCE])
        for (const z of [box.minZ - CLEARANCE, box.maxZ + CLEARANCE])
          if (x >= minX && x <= maxX && z >= minZ && z <= maxZ)
            nodes.push({ x, z });
    }
    const cost = nodes.map(() => Infinity);
    const previous = nodes.map(() => -1);
    const open = new Set([0]);
    const visited = new Set();
    cost[0] = 0;
    const estimate = (node) => Math.max(0, distance(node, target) - reach);
    while (open.size) {
      let current = null;
      for (const index of open)
        if (
          current === null ||
          cost[index] + estimate(nodes[index]) <
            cost[current] + estimate(nodes[current])
        )
          current = index;
      open.delete(current);
      const point = nodes[current];
      if (
        current > 0 &&
        current <= goals &&
        (!reach ||
          stampVisible(this.world, point, point.feet, {
            pos: target,
            feet: target.feet ?? point.feet,
          }))
      ) {
        const path = [];
        for (let index = current; index > 0; index = previous[index])
          path.unshift({ x: nodes[index].x, z: nodes[index].z });
        return path;
      }
      visited.add(current);
      for (let next = 1; next < nodes.length; next++) {
        if (visited.has(next)) continue;
        const newCost = cost[current] + distance(point, nodes[next]);
        if (newCost >= cost[next]) continue;
        const height = traverse(point, nodes[next]);
        if (height === null) continue;
        nodes[next].feet = height;
        cost[next] = newCost;
        previous[next] = current;
        open.add(next);
      }
    }
    return [];
  }
}
