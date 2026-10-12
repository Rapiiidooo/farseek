// The finger rig's contract: the skinned glove matches the shipped relaxed and grip meshes, free
// fingers move with variety, and every hold keeps the unchanged grip mesh closed.
//   node receipts/verification-finger-life/finger-check.mjs --out <dir>
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { ASSET } from "../../game/assetlib.js";
import { HeroAnimator } from "../../game/hero-anim.js";
import { Hero } from "../../game/hero.js";
import { World } from "../../game/world.js";
import { addClimbSurface } from "../../game/wall-climb.js";
import gloveData from "../../game/assets/explorer/gloves.js";

const root = path.resolve(import.meta.dirname, "../..");
const at = process.argv.indexOf("--out");
const out = path.resolve(
  at >= 0 ? process.argv[at + 1] : "outputs/finger-check",
);
globalThis.location = {
  href: pathToFileURL(path.join(root, "game/index.html")).href,
};
const asset = pathToFileURL(
  path.join(root, "game/assets/hero_realistic.js"),
).href;
const checks = [];
const check = (name, ok, details = {}) => {
  checks.push({ name, ok, details });
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(details));
};
const plain = () => ({
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
});
const make = async () => {
  const model = await ASSET(asset, { keepHierarchy: true, surfaces: false });
  const animator = new HeroAnimator(model);
  animator.groundAt = () => ({
    height: 0,
    normal: new THREE.Vector3(0, 1, 0),
  });
  return { model, animator, h: plain() };
};
const SIDES = ["left", "right"];
const curls = (animator, side) =>
  animator.fingerRig[side].curl.map((spring) => spring.v);
const glove = (model, side) =>
  model.userData.hands[side + "Open"].children.find((m) => m.isSkinnedMesh);
const gripMesh = (model, side) =>
  model.userData.hands[side + "Grip"].children.find((m) => m.isMesh);
const closed = (model, side) =>
  model.userData.hands[side + "Grip"].visible &&
  !model.userData.hands[side + "Open"].visible;
const decode = (value) => {
  const bytes = Buffer.from(value, "base64");
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};
const v = new THREE.Vector3(),
  w = new THREE.Vector3();

// The rig: rest, full curl, the grip mesh and clones.
{
  const a = await make(),
    b = await make();
  a.model.position.set(2, 0.5, -3);
  a.model.rotation.y = 0.8;
  a.model.updateMatrixWorld(true);
  const grip = decode(gloveData.grip);
  for (const side of SIDES) {
    const mesh = glove(a.model, side),
      held = gripMesh(a.model, side);
    const p = mesh.geometry.attributes.position;
    let rest = 0;
    for (let i = 0; i < p.count; i++)
      rest = Math.max(
        rest,
        mesh.getVertexPosition(i, v).distanceTo(w.fromBufferAttribute(p, i)),
      );
    const rig = a.animator.fingerRig[side];
    rig.bones.forEach((bone, i) => bone.quaternion.copy(rig.grip[i]));
    a.model.updateMatrixWorld(true);
    let full = 0;
    for (let i = 0; i < p.count; i++)
      full = Math.max(
        full,
        mesh
          .getVertexPosition(i, v)
          .distanceTo(
            w.fromBufferAttribute(held.geometry.attributes.position, i),
          ),
      );
    rig.bones.forEach((bone, i) => bone.quaternion.copy(rig.relaxed[i]));
    // The grip mesh keeps the shipped vertices, through the same frame as before.
    const frame = new THREE.Matrix4();
    {
      const sign = side === "left" ? 1 : -1;
      const hand = a.model.userData.joints[side + "Hand"];
      const axis = hand.position.clone().normalize();
      const palm = new THREE.Vector3(
        -sign * Math.cos(Math.PI / 9),
        0,
        -Math.sin(Math.PI / 9),
      );
      palm.addScaledVector(axis, -palm.dot(axis)).normalize();
      const across = new THREE.Vector3().crossVectors(
        sign > 0 ? palm : axis,
        sign > 0 ? axis : palm,
      );
      frame.makeBasis(across, axis, palm);
    }
    let shipped = 0;
    for (let i = 0; i < grip.length / 3; i++)
      shipped = Math.max(
        shipped,
        v
          .fromArray(grip, i * 3)
          .applyMatrix4(frame)
          .distanceTo(
            w.fromBufferAttribute(held.geometry.attributes.position, i),
          ),
      );
    const other = glove(b.model, side);
    const inside = (node, top) => {
      while (node && node !== top) node = node.parent;
      return node === top;
    };
    check(
      `${side} skinned glove at rest matches the shipped relaxed glove`,
      rest < 1e-5,
      { rest },
    );
    check(
      `${side} skinned glove fully curled stays within 2.5 mm of the grip mesh`,
      full < 0.0025,
      { full },
    );
    check(`${side} grip mesh keeps the shipped grip vertices`, shipped < 1e-7, {
      shipped,
      skinned: !!held.isSkinnedMesh,
    });
    check(
      `${side} clones bind their own finger bones`,
      mesh.skeleton.bones.every((bone) => inside(bone, a.model)) &&
        other.skeleton.bones.every((bone) => inside(bone, b.model)) &&
        other.skeleton !== mesh.skeleton,
      { bones: mesh.skeleton.bones.length },
    );
  }
}

// Standing: every finger drifts, unmatched, over the cascade.
const standing = async (hz, seconds, reduced = false) => {
  const s = await make();
  const series = { left: [], right: [] };
  for (let i = 0; i < seconds * hz; i++) {
    s.animator.update(1 / hz, s.h, reduced);
    if (i >= hz)
      for (const side of SIDES) series[side].push(curls(s.animator, side));
  }
  return { ...s, series };
};
{
  const { series } = await standing(60, 12);
  const report = {};
  for (const side of SIDES) {
    const ranges = [0, 1, 2, 3, 4].map(
      (f) =>
        Math.max(...series[side].map((c) => c[f])) -
        Math.min(...series[side].map((c) => c[f])),
    );
    const means = [0, 1, 2, 3, 4].map(
      (f) =>
        series[side].reduce((sum, c) => sum + c[f], 0) / series[side].length,
    );
    const index = series[side].map((c) => c[1]),
      little = series[side].map((c) => c[4]);
    const mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
    const mi = mean(index),
      ml = mean(little);
    let num = 0,
      di = 0,
      dl = 0;
    for (let i = 0; i < index.length; i++) {
      num += (index[i] - mi) * (little[i] - ml);
      di += (index[i] - mi) ** 2;
      dl += (little[i] - ml) ** 2;
    }
    report[side] = {
      ranges,
      means,
      indexLittleCorrelation: num / Math.sqrt(di * dl),
    };
  }
  const leftRight = series.left.reduce(
    (max, c, i) => Math.max(max, Math.abs(c[1] - series.right[i][1])),
    0,
  );
  check(
    "Standing, every finger of both hands moves",
    SIDES.every((side) => report[side].ranges.every((r) => r > 0.08)),
    report,
  );
  check(
    "Standing, the fingers do not move as one",
    SIDES.every((side) => report[side].indexLittleCorrelation < 0.9) &&
      leftRight > 0.05,
    { ...report, leftRight },
  );
  check(
    "Standing, the index stays straightest and the little finger roundest",
    SIDES.every(
      (side) =>
        report[side].means[1] < report[side].means[2] &&
        report[side].means[2] < report[side].means[3] &&
        report[side].means[3] < report[side].means[4],
    ),
    report,
  );
  const calm = await standing(60, 12, true);
  const still = SIDES.map((side) =>
    Math.max(
      ...[0, 1, 2, 3, 4].map(
        (f) =>
          Math.max(...calm.series[side].slice(60).map((c) => c[f])) -
          Math.min(...calm.series[side].slice(60).map((c) => c[f])),
      ),
    ),
  );
  check(
    "Reduced motion stops the drift and the gestures",
    Math.max(...still) < 0.005,
    {
      still,
    },
  );
  const rates = [];
  for (const hz of [30, 60, 120]) {
    const s = await standing(hz, 5);
    rates.push({ hz, left: curls(s.animator, "left") });
  }
  const spread = Math.max(
    ...[0, 1, 2, 3, 4].map(
      (f) =>
        Math.max(...rates.map((r) => r.left[f])) -
        Math.min(...rates.map((r) => r.left[f])),
    ),
  );
  check("Finger drift agrees at 30, 60 and 120 Hz", spread < 0.03, {
    spread,
    rates,
  });
}

// Gaits and brief flexes.
{
  const s = await make();
  const means = [];
  let lowest = Infinity;
  for (let i = 0; i < 360; i++) {
    s.h.speed = Math.min(5.6, i / 20);
    s.h.pos.z += s.h.speed / 60;
    s.animator.update(1 / 60, s.h);
    if (i < 180) continue;
    means.push((s.animator.handCurl.left + s.animator.handCurl.right) / 2);
    lowest = Math.min(
      lowest,
      s.animator.handCurl.left,
      s.animator.handCurl.right,
    );
  }
  check(
    "Running hands close loosely and open and close with the swing",
    lowest > 0.35 &&
      Math.max(...means) < 0.8 &&
      Math.max(...means) - Math.min(...means) > 0.05,
    { lowest, high: Math.max(...means), low: Math.min(...means) },
  );
  const flex = async (cause) => {
    const t = await make();
    for (let i = 0; i < 120; i++) t.animator.update(1 / 60, t.h);
    const rest = t.animator.handCurl.left;
    let peak = rest;
    for (let i = 0; i < 40; i++) {
      cause(t.h, i);
      t.animator.update(1 / 60, t.h);
      peak = Math.max(peak, t.animator.handCurl.left);
    }
    for (let i = 0; i < 90; i++) {
      t.h.landing = 0;
      t.h.stun = Math.max(0, t.h.stun - 1 / 60);
      t.animator.update(1 / 60, t.h);
    }
    return { rest, peak, after: t.animator.handCurl.left };
  };
  const landing = await flex(
    (h, i) => (h.landing = Math.max(0, 0.8 - (3 * i) / 60)),
  );
  const hit = await flex(
    (h, i) => (h.stun = i ? Math.max(0, h.stun - 1 / 60) : 0.5),
  );
  check(
    "A landing and a hit flex the fingers briefly",
    landing.peak > landing.rest + 0.15 &&
      hit.peak > hit.rest + 0.2 &&
      Math.abs(landing.after - landing.rest) < 0.1 &&
      Math.abs(hit.after - hit.rest) < 0.1,
    { landing, hit },
  );
}

// Holds: the grip mesh shows from the first frame and never opens while held.
{
  const held = async (fields, sides, frames = 120) => {
    const s = await make();
    for (let i = 0; i < 60; i++) s.animator.update(1 / 60, s.h);
    const before = sides.map((side) => {
      const mesh = gripMesh(s.model, side);
      return [mesh.geometry.uuid, mesh.matrix.elements.join()];
    });
    let shut = true;
    for (let i = 0; i < frames; i++) {
      Object.assign(s.h, typeof fields === "function" ? fields(i) : fields);
      s.h.speed = i > 40 ? 4 : 0;
      s.h.pos.z += s.h.speed / 60;
      s.animator.update(1 / 60, s.h);
      for (const side of sides) shut &&= closed(s.model, side);
    }
    const after = sides.map((side) => {
      const mesh = gripMesh(s.model, side);
      return [mesh.geometry.uuid, mesh.matrix.elements.join()];
    });
    return {
      shut,
      unchanged: JSON.stringify(before) === JSON.stringify(after),
      s,
    };
  };
  const pistols = await held(
    (i) => ({
      equipment: "pistols",
      weaponActive: true,
      weaponAim: i > 60 ? 1 : 0,
      aimDirection: new THREE.Vector3(0, 0, 1),
      fireRecoilRight: i === 80 ? 1 : 0,
    }),
    SIDES,
  );
  check(
    "Both pistol grips stay closed, aiming and firing",
    pistols.shut && pistols.unchanged,
  );
  const reload = await held(
    {
      equipment: "pistols",
      weaponActive: true,
      weaponReload: { blend: 1, spread: 0.5, dip: 0.5, dock: 0, insertion: 0 },
    },
    SIDES,
  );
  check(
    "Both hands stay closed through a reload",
    reload.shut && reload.unchanged,
  );
  const orb = await held(
    { equipment: "orb", weaponActive: true, holding: true },
    ["right"],
  );
  const free = orb.s.animator.fingerRig.left;
  check(
    "The orb hand stays closed while the other hand moves freely",
    orb.shut &&
      orb.unchanged &&
      !closed(orb.s.model, "left") &&
      free.curl.some((c) => c.v > 0.2),
  );
  // Released, the fingers ease out of the grip rather than snap.
  const s = pistols.s;
  s.h.equipment = null;
  s.h.weaponActive = false;
  s.animator.update(1 / 60, s.h);
  const first = s.animator.handCurl.left;
  for (let i = 0; i < 30; i++) s.animator.update(1 / 60, s.h);
  check(
    "A released grip eases open",
    !closed(s.model, "left") && first > 0.6 && s.animator.handCurl.left < 0.3,
    { first, later: s.animator.handCurl.left },
  );
}

// Reaching holds: the hand opens on the way and closes on arrival.
{
  const reach = async (enter, frames = 90) => {
    const s = await make();
    for (let i = 0; i < 60; i++) s.animator.update(1 / 60, s.h);
    enter(s);
    let opened = Infinity,
      closedAt = null;
    for (let i = 0; i < frames; i++) {
      s.h.t = i / 60;
      if (s.h.pendulum) s.h.pendulum.t = i / 60;
      s.animator.update(1 / 60, s.h);
      if (!closed(s.model, "left"))
        opened = Math.min(
          opened,
          s.animator.handCurl.left === 0
            ? Math.min(...curls(s.animator, "left"))
            : Infinity,
        );
      if (closedAt === null && SIDES.every((side) => closed(s.model, side)))
        closedAt = i / 60;
    }
    return {
      opened,
      closedAt,
      end: SIDES.every((side) => closed(s.model, side)),
    };
  };
  const ledge = await reach((s) => {
    s.h.state = "hang";
    s.h.feet = 2.4 - s.animator.hangReach(0.25);
    s.h.ledge = { n: { x: 0, z: -1 }, top: 2.4, hand: { x: 0, z: 0.24 } };
  });
  const pivot = new THREE.Vector3(0, 7, 0);
  const rope = await reach((s) => {
    const hands = s.animator.hangReach(0.3) ?? 2.05;
    s.h.state = "swing";
    s.h.pendulum = {
      rope: { pivot, id: "check" },
      angle: 0.3,
      spin: 0.8,
      length: 4.2,
      reach: 5.2,
      dir: { x: 0, y: 1 },
      heading: { x: 0, y: 1 },
      grip: new THREE.Vector3(
        0,
        pivot.y - Math.cos(0.3) * 4.2,
        Math.sin(0.3) * 4.2,
      ),
      t: 0,
    };
    s.h.pos.set(0, 0, Math.sin(0.3) * (4.2 + hands));
    s.h.feet = pivot.y - Math.cos(0.3) * (4.2 + hands);
  });
  check(
    "Catching a ledge or the rope opens the hand, then closes it on the hold",
    [ledge, rope].every(
      (r) =>
        r.opened < -0.4 && r.closedAt !== null && r.closedAt < 0.4 && r.end,
    ),
    { ledge, rope },
  );
}

// Walls, by the explorer's own controller: axes never leave closed fists; ivy hands open between
// holds and close on them.
for (const kind of ["ice", "vine"]) {
  const world = new World();
  world.add(-10, -30, -10, 10, 0, 10, "rock");
  world.add(-3, -30, -3.6, 3, 4.6, -2, "rock", null, { grab: false });
  world.add(-10, -30, -14, 10, 4.6, -3.6, "rock");
  addClimbSurface(world, {
    kind,
    x: 0,
    z: -2,
    nx: 0,
    nz: 1,
    width: 4,
    bottom: -0.2,
    top: 4.6,
  });
  const hero = new Hero(world, {
    interactables: () => [],
    use: () => false,
    moveBlock: () => false,
  });
  hero.spawn(0, -1.2, 0, Math.PI);
  hero.axes = kind === "ice";
  const { model, animator } = await make();
  animator.groundAt = (x, z, referenceY) => ({
    height: world.ground(x, z, 0.025, Math.max(referenceY, hero.feet), 0.6),
    normal: new THREE.Vector3(0, 1, 0),
  });
  let onWall = 0,
    openOnWall = 0,
    plantedOpen = 0,
    transitOpen = 0;
  for (let frame = 0; frame < 60 * 3.2; frame++) {
    const t = frame / 60;
    hero.update(1 / 60, {
      move: { x: t >= 2.2 && t < 3 ? 1 : 0, y: t < 2.2 ? 1 : 0 },
      camYaw: Math.PI,
      jump: frame === Math.round(0.32 * 60),
      jumpHeld: false,
      drop: false,
      dropHeld: false,
      interactPressed: false,
      interactHeld: false,
      walk: false,
      roll: false,
    });
    hero.events.splice(0);
    hero.wallStrikes?.splice(0);
    animator.update(1 / 60, hero);
    if (hero.state !== "wall") continue;
    for (const side of SIDES) {
      onWall++;
      const shut = closed(model, side);
      if (!shut) openOnWall++;
      const hold = hero.cling.limbs[side + "Hand"];
      const settled = animator.ik[side].weight > 0.99;
      if (settled && hold.s < 0 && !shut) plantedOpen++;
      if (hold.s > 0.2 && hold.s < 0.6 && !shut)
        transitOpen = Math.max(
          transitOpen,
          -Math.min(...curls(animator, side)),
        );
    }
  }
  if (kind === "ice")
    check(
      "Axes stay in closed fists for the whole ice climb",
      onWall > 100 && openOnWall === 0,
      {
        onWall,
        openOnWall,
      },
    );
  else
    check(
      "Ivy hands open between holds and stay closed on planted holds",
      transitOpen > 0.3 && plantedOpen < 0.05 * onWall,
      { onWall, openOnWall, plantedOpen, transitOpen },
    );
}

// The lab resets a free hand's curl directly; the fingers follow.
{
  const s = await make();
  for (let i = 0; i < 300; i++) {
    s.h.speed = 5;
    s.h.pos.z += 5 / 60;
    s.animator.update(1 / 60, s.h);
  }
  s.animator.handCurl.left = 0;
  s.animator.showHands(s.h, 0);
  check(
    "A curl written from outside resets the free fingers",
    curls(s.animator, "left").every((c) => c === 0),
    { curls: curls(s.animator, "left") },
  );
}

// Updates add no scene nodes, geometry or materials, and stay cheap.
{
  const s = await make();
  const nodes = () => {
    const list = [];
    s.model.traverse((n) =>
      list.push([n.uuid, n.geometry?.uuid, n.material?.uuid]),
    );
    return JSON.stringify(list);
  };
  const before = nodes();
  const times = [];
  for (let i = 0; i < 600; i++) {
    s.h.speed = i % 200 < 100 ? 0 : 5;
    s.h.pos.z += s.h.speed / 60;
    const start = performance.now();
    s.animator.update(1 / 60, s.h);
    times.push(performance.now() - start);
  }
  const fingers = [];
  for (let i = 0; i < 600; i++) {
    const start = performance.now();
    s.animator.showHands(s.h, 1 / 60);
    fingers.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  fingers.sort((a, b) => a - b);
  check(
    "Updates add no scene nodes, geometry or materials",
    before === nodes(),
  );
  check(
    "Both hands' fingers update in well under a tenth of a millisecond",
    fingers[300] < 0.1,
    {
      showHandsMedianMs: fingers[300],
      animatorMedianMs: times[300],
    },
  );
}

await mkdir(out, { recursive: true });
await writeFile(
  path.join(out, "finger-check.json"),
  JSON.stringify({ checks }, null, 2) + "\n",
);
console.log(
  `${checks.filter((c) => c.ok).length} of ${checks.length} finger checks pass`,
);
assert(checks.every((c) => c.ok));
