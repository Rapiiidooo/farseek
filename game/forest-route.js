import * as THREE from "three";

export const FOREST_TRAIL = [
  [0, -2],
  [0, -12],
  [0, -40],
  [7, -58],
  [0, -77],
  [0, -106],
  [8, -126],
  [10, -146],
  [-8, -169],
  [-23, -199],
  [-32, -228],
  [-34.5, -256],
  [-34.5, -273],
];

const curve = new THREE.CatmullRomCurve3(
  FOREST_TRAIL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
);
const points = curve.getPoints(1200);

export function forestRoute(z) {
  let low = 0,
    high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].z > z) low = mid;
    else high = mid;
  }
  const a = points[low],
    b = points[high];
  const t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
  const x = THREE.MathUtils.lerp(a.x, b.x, t);
  const clearing = (center, radius) =>
    Math.exp(-(((z - center) / radius) ** 4));
  const width = 10 + 6 * clearing(-139, 23) + 4.5 * clearing(-239, 23);
  return { x, width };
}

export function forestBorders() {
  const rocks = [],
    trees = [],
    ferns = [];
  for (let i = 0; i <= 65; i++) {
    const z = -2 - i * 4.15,
      route = forestRoute(z);
    for (const side of [-1, 1]) {
      const edge = route.x + side * (route.width + 2.4);
      rocks.push({
        x: edge,
        z,
        radius: 2.65,
        height: 3.8 + (0.5 + Math.sin(i * 2.1 + side) * 0.5) * 1.3,
        yaw: i * 2.4 + side,
      });
      ferns.push([edge - side * 1.9, z, i * 1.7, 1.25 + (i % 3) * 0.18]);
      if (i % 2 === 0) {
        trees.push([
          edge + side * (1.8 + 1.2 * Math.sin(i)),
          z - 0.8,
          i * 2.4,
          0.82 + (i % 5) * 0.07,
        ]);
        trees.push([
          edge + side * (10 + Math.cos(i) * 2),
          z - 3,
          i * 1.7,
          0.85 + (i % 3) * 0.1,
        ]);
      }
    }
  }
  const continuous = [],
    previous = new Map();
  for (const rock of rocks) {
    const side = Math.sign(rock.x - forestRoute(rock.z).x),
      before = previous.get(side);
    if (before) {
      const distance = Math.hypot(rock.x - before.x, rock.z - before.z);
      const segments = Math.ceil(distance / 4.35);
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        continuous.push({
          ...rock,
          x: THREE.MathUtils.lerp(before.x, rock.x, t),
          z: THREE.MathUtils.lerp(before.z, rock.z, t),
          height: THREE.MathUtils.lerp(before.height, rock.height, t),
        });
      }
    }
    continuous.push(rock);
    previous.set(side, rock);
  }
  for (const [z, direction] of [
    [-2, 1],
    [-2 - 65 * 4.15, -1],
  ]) {
    const route = forestRoute(z);
    for (let i = 1; i < 10; i++) {
      const angle = (i * Math.PI) / 10;
      continuous.push({
        x: route.x + Math.cos(angle) * (route.width + 2.4),
        z: z + direction * Math.sin(angle) * 9,
        radius: 3.2,
        height: 6.4 + 0.9 * Math.sin(i * 2.1 + direction),
        yaw: i * 2.4 + direction,
      });
    }
  }
  return { rocks: continuous, trees, ferns };
}
