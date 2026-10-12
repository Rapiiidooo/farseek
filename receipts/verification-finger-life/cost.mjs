// The animator's cost per frame for two trees, standing then running, with the model's matrices
// updated as a frame does: the median of 1,200 frames, five times each.
//   node receipts/verification-finger-life/cost.mjs <before-root> <after-root> > cost.json
// Each root holds game/ and resolves `three` (a node_modules link will do).
import path from "node:path";
import { pathToFileURL } from "node:url";

const report = {};
for (const [label, root] of [
  ["before", process.argv[2]],
  ["after", process.argv[3]],
]) {
  const load = (file) => import(pathToFileURL(path.resolve(root, file)).href);
  globalThis.location = {
    href: pathToFileURL(path.resolve(root, "game/index.html")).href,
  };
  const THREE = await load("node_modules/three/build/three.module.js");
  const { ASSET } = await load("game/assetlib.js");
  const { HeroAnimator } = await load("game/hero-anim.js");
  const model = await ASSET(
    pathToFileURL(path.resolve(root, "game/assets/hero_realistic.js")).href,
    { keepHierarchy: true, surfaces: false },
  );
  const animator = new HeroAnimator(model);
  const h = {
    state: "ground",
    pos: new THREE.Vector3(),
    snap: { x: 0, z: 0 },
    yaw: 0,
    speed: 0,
    vel: new THREE.Vector3(),
    feet: 0,
    stepLift: 0,
    landing: 0,
    throwT: 99,
    catchT: 99,
    stun: 0,
    t: 0,
  };
  const medians = [];
  for (let round = 0; round < 5; round++) {
    const times = [];
    for (let i = 0; i < 1200; i++) {
      h.speed = i % 400 < 200 ? 0 : 5;
      h.pos.z += h.speed / 60;
      const start = performance.now();
      animator.update(1 / 60, h);
      model.updateMatrixWorld(true);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    medians.push(+times[600].toFixed(4));
  }
  let nodes = 0;
  model.traverse(() => nodes++);
  report[label] = { nodes, medianMs: medians };
}
console.log(JSON.stringify(report, null, 2));
