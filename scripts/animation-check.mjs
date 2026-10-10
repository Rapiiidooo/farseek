import assert from "node:assert/strict";
import * as THREE from "three";
import { ASSET } from "../game/assetlib.js";
import { HeroAnimator } from "../game/hero-anim.js";
import { pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const root = path.resolve(import.meta.dirname, "..");
const option = (key, fallback) => {
  const at = process.argv.indexOf(key);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const output = path.resolve(
  root,
  option("--out", "receipts/verification-realism/animation"),
);
const assetPath = option("--asset", "game/assets/hero_realistic.js");
const beforeAssetPath = option("--before-asset", assetPath);
const traversalOnly = process.argv.includes("--traversal-only");
const referencePath = option(
  "--before",
  "receipts/verification-realism/baseline/hero-anim.js",
);
const { HeroAnimator: BeforeAnimator } = await import(
  pathToFileURL(path.resolve(root, referencePath)).href
);
await mkdir(output, { recursive: true });
globalThis.location = {
  href: pathToFileURL(path.join(root, "game/index.html")).href,
};
const asset = pathToFileURL(path.join(root, assetPath)).href;
const hero = () => ({
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
const make = async (Animator = HeroAnimator) => {
  const model = await ASSET(asset, { keepHierarchy: true, surfaces: false });
  return { model, animator: new Animator(model), h: hero() };
};
const finite = (model) => {
  model.updateMatrixWorld(true);
  for (const joint of Object.values(model.userData.joints))
    assert(
      joint.matrixWorld.elements.every(Number.isFinite),
      "finite joint matrix",
    );
};
const exactFloor = (node) => {
  let floor = Infinity;
  const v = new THREE.Vector3();
  node.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      floor = Math.min(
        floor,
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).y,
      );
  });
  return floor;
};
const supportTracker = () => ({
  prior: new Map(),
  samples: 0,
  maximumError: 0,
  maximumSpeed: 0,
});
const sampleSupport = (tracker, leg, dt) => {
  const contact = leg.contact;
  if (!contact || contact.mode !== "plant") {
    tracker.prior.delete(leg.side);
    return;
  }
  const actual = leg.foot.localToWorld(contact.local.clone());
  tracker.maximumError = Math.max(
    tracker.maximumError,
    actual.distanceTo(contact.at),
  );
  const previous = tracker.prior.get(leg.side),
    identity = contact.local.toArray().join();
  if (previous?.identity === identity && previous.plant === leg.plant) {
    tracker.maximumSpeed = Math.max(
      tracker.maximumSpeed,
      actual.distanceTo(previous.at) / dt,
    );
    tracker.samples++;
  }
  tracker.prior.set(leg.side, { at: actual, identity, plant: leg.plant });
};
const supportReport = ({ samples, maximumError, maximumSpeed }) => ({
  samples,
  maximumError,
  maximumSpeed,
});
const supportIsStable = ({ samples, maximumError, maximumSpeed }) =>
  samples > 30 && maximumError < 0.004 && maximumSpeed < 0.08;
const checks = [];
const check = (name, ok, details) => {
  checks.push({ name, ok, details });
  assert(ok, name + ": " + JSON.stringify(details));
};

const blocked = await make();
const module = await import(asset);
const build = module.default || module.build || module.create;
const nativeAnimator = new HeroAnimator(build(THREE));
for (const side of ["left", "right"])
  check(
    `${side} palm contact survives asset normalization`,
    blocked.animator.ik[side].palm.distanceTo(nativeAnimator.ik[side].palm) <
      1e-9,
    {
      native: nativeAnimator.ik[side].palm.toArray(),
      placed: blocked.animator.ik[side].palm.toArray(),
    },
  );
check(
  "The runtime asset loads its articulated hierarchy",
  Object.keys(blocked.model.userData.joints).length >= 14 &&
    Object.keys(blocked.model.userData.hands).length === 4,
  {
    joints: Object.keys(blocked.model.userData.joints).length,
    hands: Object.keys(blocked.model.userData.hands).length,
  },
);
blocked.h.speed = 5;
for (let i = 0; i < 120; i++) blocked.animator.update(1 / 60, blocked.h);
check(
  "No stride while collision prevents displacement",
  blocked.animator.phase === 0 && blocked.animator.gaitSpeed === 0,
  { phase: blocked.animator.phase, speed: blocked.animator.gaitSpeed },
);
blocked.h.pos.z = 80;
blocked.animator.update(1 / 60, blocked.h);
check("Teleport does not advance the stride", blocked.animator.phase === 0, {
  phase: blocked.animator.phase,
});

const hipsHeight = (model) =>
  model.userData.joints.hips.getWorldPosition(new THREE.Vector3()).y;
const soles = (animator) =>
  animator.legs.map((leg) =>
    (leg.foot || leg.lower).localToWorld(leg.palm.clone()),
  );
if (blocked.animator.articulatedFeet) {
  const riding = await make();
  riding.h.carried = { x: 0, z: 0 };
  for (let i = 0; i < 90; i++) riding.animator.update(1 / 60, riding.h);
  const phase = riding.animator.phase,
    start = soles(riding.animator);
  let carried = 0,
    lowest = Infinity,
    slip = 0;
  for (let i = 0; i < 240; i++) {
    const dx = (3.5 * Math.sin((Math.PI * i) / 240)) / 60;
    riding.h.pos.x += dx;
    riding.h.carried.x += dx;
    carried += dx;
    riding.animator.update(1 / 60, riding.h);
    finite(riding.model);
    lowest = Math.min(lowest, hipsHeight(riding.model));
    soles(riding.animator).forEach(
      (sole, side) =>
        (slip = Math.max(
          slip,
          Math.hypot(sole.x - carried - start[side].x, sole.z - start[side].z),
        )),
    );
  }
  check(
    "Planted feet ride a moving support without striding",
    riding.animator.phase === phase && slip < 0.01 && lowest > 0.9,
    { carried, slip, lowestHips: lowest },
  );

  const ice = await make();
  Object.assign(ice.h, { onIce: true, wish: { x: 0, z: 1, len: 1 } });
  for (let i = 0; i < 150; i++) {
    ice.h.speed = Math.min(5, i / 25);
    ice.h.pos.z += ice.h.speed / 60;
    ice.animator.update(1 / 60, ice.h);
  }
  ice.h.wish = { x: 0, z: 0, len: 0 };
  let glidePhase = null,
    width = 0,
    lowestGlide = Infinity,
    lowestBoot = 0;
  for (let i = 0; i < 150; i++) {
    ice.h.speed *= Math.exp(-0.7 / 60);
    ice.h.pos.z += ice.h.speed / 60;
    ice.animator.update(1 / 60, ice.h);
    finite(ice.model);
    if (i === 30) glidePhase = ice.animator.phase;
    if (i < 45) continue;
    const [left, right] = soles(ice.animator);
    width = Math.max(width, left.x - right.x);
    lowestGlide = Math.min(lowestGlide, hipsHeight(ice.model));
    lowestBoot = Math.min(lowestBoot, exactFloor(ice.model));
  }
  const glide = {
    phaseChange: ice.animator.phase - glidePhase,
    slide: ice.animator.slide,
    width,
    lowestHips: lowestGlide,
    lowestBoot,
    speed: ice.h.speed,
  };
  check(
    "A glide on ice holds a wide balanced stance instead of striding",
    glide.phaseChange === 0 &&
      glide.slide > 0.8 &&
      width > 0.3 &&
      lowestGlide > 0.85 &&
      lowestBoot > -0.005,
    glide,
  );
  ice.h.wish = { x: 0, z: 1, len: 1 };
  for (let i = 0; i < 90; i++) {
    ice.h.speed = Math.min(5, ice.h.speed + 1.8 / 60);
    ice.h.pos.z += ice.h.speed / 60;
    ice.animator.update(1 / 60, ice.h);
    finite(ice.model);
  }
  check(
    "Steering out of a glide hands back to the stride",
    ice.animator.phase !== glidePhase + glide.phaseChange &&
      ice.animator.slide < 0.1 &&
      !ice.animator.gliding,
    { slide: ice.animator.slide, gait: ice.animator.gaitSpeed },
  );
}

{
  const runner = await make();
  const reach = { left: [], right: [] };
  let cycle = null,
    peak = { left: -Infinity, right: -Infinity };
  for (let frame = 0; frame < 900; frame++) {
    runner.h.speed = Math.min(5.6, frame / 20);
    runner.h.pos.z += runner.h.speed / 60;
    runner.animator.update(1 / 60, runner.h);
    if (frame < 240) continue;
    runner.model.updateMatrixWorld(true);
    const hips = runner.model.userData.joints.hips.getWorldPosition(
      new THREE.Vector3(),
    );
    for (const side of ["left", "right"]) {
      const hand = runner.model.userData.joints[side + "Hand"];
      peak[side] = Math.max(
        peak[side],
        hand.getWorldPosition(new THREE.Vector3()).z - hips.z,
      );
    }
    const whole = Math.floor(runner.animator.cycles ?? frame / 36);
    if (cycle !== null && whole !== cycle)
      for (const side of ["left", "right"]) {
        reach[side].push(peak[side]);
        peak[side] = -Infinity;
      }
    cycle = whole;
  }
  const spread = (values) => Math.max(...values) - Math.min(...values);
  const arms = {
    cycles: reach.left.length,
    leftSpread: spread(reach.left),
    rightSpread: spread(reach.right),
    curl: runner.animator.handCurl,
  };
  check(
    "Running arms vary between cycles within a natural range",
    arms.cycles >= 6 &&
      Math.min(arms.leftSpread, arms.rightSpread) > 0.02 &&
      Math.max(arms.leftSpread, arms.rightSpread) < 0.18 &&
      Math.min(arms.curl.left, arms.curl.right) > 0.35,
    arms,
  );
}

const gaits = [];
for (const [label, Animator] of [
  ["before", BeforeAnimator],
  ["after", HeroAnimator],
]) {
  for (const speed of [2, 5]) {
    const { model, animator, h } = await make(Animator);
    const probe = new HeroAnimator(model);
    const renderedSupport = supportTracker();
    const feet = probe.legs.map((leg) => ({
      node: leg.foot || leg.lower,
      knee: leg.lower,
      palm: leg.palm,
      previous: null,
    }));
    let minFloor = 0,
      contactDistance = 0,
      contactFrames = 0,
      maxKnee = 0,
      minKnee = Infinity,
      maxJump = 0;
    let previous = null;
    for (let frame = 0; frame < 360; frame++) {
      h.speed = frame < 30 ? 0 : speed;
      h.pos.z += h.speed / 60;
      animator.update(1 / 60, h);
      finite(model);
      if (frame < 150) continue;
      const rotations = Object.values(model.userData.joints).map((j) =>
        j.quaternion.clone(),
      );
      if (previous)
        for (let j = 0; j < rotations.length; j++)
          maxJump = Math.max(maxJump, rotations[j].angleTo(previous[j]));
      previous = rotations;
      for (const leg of animator.legs || [])
        sampleSupport(renderedSupport, leg, 1 / 60);
      for (let i = 0; i < feet.length; i++) {
        const f = feet[i],
          floor = exactFloor(f.node),
          pos = f.node.localToWorld(f.palm.clone());
        minFloor = Math.min(minFloor, floor);
        if (floor < 0.035 && f.previous?.floor < 0.035) {
          contactDistance += Math.hypot(
            pos.x - f.previous.pos.x,
            pos.z - f.previous.pos.z,
          );
          contactFrames++;
        }
        f.previous = { pos, floor };
        maxKnee = Math.max(maxKnee, f.knee.rotation.x);
        minKnee = Math.min(minKnee, f.knee.rotation.x);
      }
    }
    gaits.push({
      label,
      speed,
      minimumSoleHeight: minFloor,
      contactSlipSpeed: contactFrames
        ? contactDistance / (contactFrames / 60)
        : null,
      contactFrames,
      kneeRange: [minKnee, maxKnee],
      maximumJointStep: maxJump,
      renderedSupport: supportReport(renderedSupport),
    });
  }
}

const rates = [];
for (const gait of gaits.filter((g) => g.label === "after")) {
  const before = gaits.find(
    (g) => g.label === "before" && g.speed === gait.speed,
  );
  if (blocked.animator.articulatedFeet)
    check(
      `Rendered support stays planted at ${gait.speed} m/s`,
      supportIsStable(gait.renderedSupport),
      gait.renderedSupport,
    );
  else
    check(
      `Bounded sole center motion at ${gait.speed} m/s`,
      gait.contactSlipSpeed < 1 &&
        gait.contactSlipSpeed <= before.contactSlipSpeed * 0.8,
      { before: before.contactSlipSpeed, after: gait.contactSlipSpeed },
    );
  check(
    `Boot clearance at ${gait.speed} m/s`,
    gait.minimumSoleHeight > -0.004,
    { minimumSoleHeight: gait.minimumSoleHeight },
  );
  check(
    `No reversed knee or discontinuous gait at ${gait.speed} m/s`,
    gait.kneeRange[0] > -0.05 && gait.maximumJointStep < 0.35,
    gait,
  );
}

if (blocked.animator.articulatedFeet) {
  const { model, animator, h } = await make();
  const displaced = supportTracker();
  h.speed = 5;
  for (let frame = 0; frame < 300; frame++) {
    h.pos.z += 5 / 60;
    animator.update(1 / 60, h);
    if (frame < 120) continue;
    for (const leg of animator.legs) {
      const saved = leg.foot.position.clone();
      if (leg.contact) leg.foot.position.x += ((frame % 10) + 1) * 0.003;
      model.updateMatrixWorld(true);
      sampleSupport(displaced, leg, 1 / 60);
      leg.foot.position.copy(saved);
    }
  }
  check(
    "Support check rejects a deliberately sliding planted foot",
    displaced.samples > 30 &&
      !supportIsStable(displaced) &&
      displaced.maximumError > 0.004 &&
      displaced.maximumSpeed > 0.08,
    supportReport(displaced),
  );
}

const transitions = [];
for (const [label, Animator] of [
  ["before", BeforeAnimator],
  ["after", HeroAnimator],
]) {
  const { model, animator, h } = await make(Animator);
  let previous = null,
    maximumJointStep = 0,
    maximumAt = null,
    minimumGround = 0,
    minimumFootSeparation = Infinity;
  for (let frame = 0; frame < 660; frame++) {
    const t = frame / 60;
    h.speed =
      t < 1
        ? 0
        : t < 1.8
          ? ((t - 1) / 0.8) * 5
          : t < 7
            ? 5
            : t < 7.6
              ? ((7.6 - t) / 0.6) * 5
              : 0;
    h.yaw =
      t < 3
        ? 0
        : t < 3.25
          ? (((t - 3) / 0.25) * Math.PI) / 2
          : t < 5
            ? Math.PI / 2
            : t < 5.35
              ? Math.PI / 2 + ((t - 5) / 0.35) * Math.PI
              : Math.PI * 1.5;
    h.pos.x += (Math.sin(h.yaw) * h.speed) / 60;
    h.pos.z += (Math.cos(h.yaw) * h.speed) / 60;
    const air = t >= 8 && t < 8.8,
      u = (t - 8) / 0.8;
    h.state = air ? "air" : "ground";
    h.feet = air ? Math.sin(u * Math.PI) * 0.85 : 0;
    h.vel.y = air ? (Math.cos(u * Math.PI) * 0.85 * Math.PI) / 0.8 : 0;
    h.landing = t >= 8.8 && t < 9.1 ? (9.1 - t) / 0.3 : 0;
    animator.update(1 / 60, h);
    finite(model);
    const rotations = Object.entries(model.userData.joints).map(
      ([name, j]) => ({ name, q: j.quaternion.clone() }),
    );
    if (previous)
      for (let i = 0; i < rotations.length; i++) {
        const delta = rotations[i].q.angleTo(previous[i].q);
        if (delta > maximumJointStep) {
          maximumJointStep = delta;
          maximumAt = { time: t, joint: rotations[i].name };
        }
      }
    previous = rotations;
    if (h.state === "ground")
      minimumGround = Math.min(minimumGround, exactFloor(model));
    if (h.state === "ground" && animator.legs?.length === 2) {
      const [left, right] = animator.legs.map((leg) =>
        (leg.foot || leg.lower).localToWorld(leg.palm.clone()),
      );
      const across = new THREE.Vector3(
        Math.cos(animator.root.yaw.v),
        0,
        -Math.sin(animator.root.yaw.v),
      );
      minimumFootSeparation = Math.min(
        minimumFootSeparation,
        left.sub(right).dot(across),
      );
    }
  }
  const settled = Object.values(model.userData.joints).map((j) =>
    j.quaternion.clone(),
  );
  h.pos.z += 70;
  animator.update(1 / 60, h);
  finite(model);
  const restartDelta = Math.max(
    ...Object.values(model.userData.joints).map((j, i) =>
      j.quaternion.angleTo(settled[i]),
    ),
  );
  transitions.push({
    label,
    maximumJointStep,
    maximumAt,
    minimumGround,
    minimumFootSeparation: Number.isFinite(minimumFootSeparation)
      ? minimumFootSeparation
      : null,
    restartDelta,
  });
}
const movement = transitions.find((t) => t.label === "after");
check(
  "Start, brake, sharp turns and landing stay continuous",
  movement.maximumJointStep < 0.55 && movement.restartDelta < 0.1,
  movement,
);
check(
  "Boots stay above the floor through turns and landing",
  movement.minimumGround > -0.005,
  movement,
);
check(
  "Feet do not cross during sharp turns",
  movement.minimumFootSeparation > 0.12,
  movement,
);

const contacts = [];
for (const [label, Animator] of [
  ["before", BeforeAnimator],
  ["after", HeroAnimator],
]) {
  for (const state of [
    "ground",
    "air",
    "roll",
    "hang",
    "climb",
    "vault",
    "grab",
    "shove",
    "turn",
  ]) {
    const { model, animator, h } = await make(Animator);
    h.state = state;
    h.ledge = { n: { x: 0, z: -1 }, top: 1.9, hand: { x: 0, z: 0.22 } };
    h.grip = { n: { x: 0, z: -1 }, ref: { x: 0, z: 0.52 } };
    for (let i = 0; i < 120; i++) {
      h.t = i / 119;
      animator.update(1 / 60, h);
      finite(model);
    }
    const goals = animator.reachGoals(h),
      errors = {};
    if (goals)
      for (const side of ["left", "right"]) {
        if ((goals[side].weight ?? goals.weight) <= 0.9) continue;
        const arm = animator.ik[side];
        errors[side] = arm.hand
          .localToWorld(arm.palm.clone())
          .distanceTo(goals[side].at);
      }
    contacts.push({ label, state, errors });
    if (label === "after") {
      const before = contacts.find(
        (c) => c.label === "before" && c.state === state,
      );
      check(
        `Finite ${state} rig`,
        Object.values(model.userData.joints).every((joint) =>
          joint.matrixWorld.elements.every(Number.isFinite),
        ),
        { state },
      );
      if (Object.keys(errors).length)
        check(
          `No increase in ${state} arm contact error`,
          Object.keys(errors).every(
            (side) => errors[side] <= before.errors[side] + 0.00001,
          ),
          { before: before.errors, after: errors },
        );
    }
  }
}
const carry = await make();
carry.h.holding = true;
for (let i = 0; i < 90; i++) carry.animator.update(1 / 60, carry.h);
check(
  "Only the disc hand grips while carrying",
  carry.model.userData.hands.rightGrip.visible &&
    carry.model.userData.hands.leftOpen.visible,
  {},
);
carry.h.holding = false;
carry.h.throwT = 0.12;
carry.animator.update(1 / 60, carry.h);
check(
  "Throwing keeps the gripping hand",
  carry.model.userData.hands.rightGrip.visible,
  {},
);
carry.h.throwT = 99;
for (let i = 0; i < 90; i++) carry.animator.update(1 / 60, carry.h);
check(
  "Hands reopen after the disc leaves",
  carry.model.userData.hands.leftOpen.visible &&
    carry.model.userData.hands.rightOpen.visible,
  {},
);
for (const hz of [30, 60, 120]) {
  const { animator, h } = await make();
  h.speed = 2;
  animator.update(1 / hz, h);
  for (let i = 0; i < hz * 3; i++) {
    h.pos.z += 2 / hz;
    animator.update(1 / hz, h);
  }
  rates.push({ hz, phase: animator.phase });
}
check(
  "Walking stride depends on distance at different frame rates",
  Math.max(...rates.map((r) => r.phase)) -
    Math.min(...rates.map((r) => r.phase)) <
    1e-6,
  rates,
);

// The rope swing: both palms on the rope, no limb pulled past its reach, at every phase of the
// arc and at 20, 30, 60 and 120 Hz.
const swingCases = [];
const swingPose = async (angle, spin, hz, seconds = 1) => {
  const { model, animator, h } = await make();
  const hands = animator.hangReach(0.3) ?? 2.05;
  const pivot = new THREE.Vector3(0, 7, 0);
  const length = 4.2;
  const dir = { x: 0, y: 1 };
  const place = () => {
    const s = Math.sin(pendulum.angle),
      c = Math.cos(pendulum.angle);
    pendulum.grip.set(s * length, pivot.y - c * length, 0);
    pendulum.grip.z = pendulum.grip.x;
    pendulum.grip.x = 0;
    h.pos.set(0, 0, s * (length + hands));
    h.feet = pivot.y - c * (length + hands);
  };
  const pendulum = {
    rope: { pivot, id: "check" },
    angle,
    spin,
    length,
    reach: length + 1,
    dir,
    heading: dir,
    grip: new THREE.Vector3(),
    t: 0,
  };
  h.state = "swing";
  h.pendulum = pendulum;
  h.yaw = 0;
  place();
  let worstPalm = 0,
    worstStretch = 0,
    minKnee = Infinity;
  const frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) {
    pendulum.t = (i + 1) / hz;
    animator.update(1 / hz, h);
    finite(model);
    if (i < frames - Math.round(hz * 0.4)) continue;
    const goals = animator.reachGoals(h);
    for (const side of ["left", "right"]) {
      const arm = animator.ik[side];
      const palm = arm.hand.localToWorld(arm.palm.clone());
      worstPalm = Math.max(worstPalm, palm.distanceTo(goals[side].at));
      const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
      worstStretch = Math.max(
        worstStretch,
        shoulder.distanceTo(palm) / arm.length,
      );
      const knee = model.userData.joints[side + "LowerLeg"];
      minKnee = Math.min(minKnee, knee.rotation.x);
    }
  }
  const left = animator.ik.left;
  return {
    angle,
    spin,
    hz,
    worstPalm,
    worstStretch,
    minKnee,
    palm: left.hand.localToWorld(left.palm.clone()).toArray(),
    closed: model.userData.hands?.leftGrip?.visible !== false,
  };
};
for (const [angle, spin] of [
  [0, 1.6],
  [0.6, 0.8],
  [1.1, 0],
  [0.3, -1.4],
  [-0.9, 0],
  [-0.4, 1.2],
])
  swingCases.push(await swingPose(angle, spin, 60));
check(
  "Swing palms stay on the rope through the whole arc",
  swingCases.every((c) => c.worstPalm < 0.03),
  swingCases.map((c) => [c.angle, +c.worstPalm.toFixed(4)]),
);
check(
  "Swing arms stay within reach and knees never bend backwards",
  swingCases.every((c) => c.worstStretch <= 1.0005 && c.minKnee > -0.02),
  swingCases.map((c) => [
    c.angle,
    +c.worstStretch.toFixed(4),
    +c.minKnee.toFixed(3),
  ]),
);
check(
  "Both hands close on the rope while swinging",
  swingCases.every((c) => c.closed),
  {},
);
const swingRates = [];
for (const hz of [20, 30, 60, 120])
  swingRates.push(await swingPose(0.6, 0.8, hz, 1.5));
const spread = Math.max(
  ...swingRates.flatMap((a) =>
    swingRates.map((b) =>
      new THREE.Vector3(...a.palm).distanceTo(new THREE.Vector3(...b.palm)),
    ),
  ),
);
check(
  "Swing pose agrees at 20, 30, 60 and 120 Hz",
  spread < 0.01 && swingRates.every((c) => c.worstPalm < 0.03),
  { spread, palms: swingRates.map((c) => +c.worstPalm.toFixed(4)) },
);

const swim = await make();
swim.h.state = "swim";
swim.h.swimming = true;
swim.h.swimSpeed = 3.2;
swim.h.swimVertical = 0;
for (let i = 0; i < 180; i++) {
  swim.animator.update(1 / 60, swim.h);
  finite(swim.model);
}
const swimPitch = swim.model.rotation.x;
const torso = swim.model.userData.joints.spine.getWorldPosition(
  new THREE.Vector3(),
);
check(
  "Swimming pitches the body around the torso",
  swimPitch > 1 && Math.abs(torso.y - 1) < 0.2,
  { pitch: swimPitch, torso: torso.toArray() },
);
swim.h.swimVertical = -2.4;
for (let i = 0; i < 90; i++) {
  swim.animator.update(1 / 60, swim.h);
  finite(swim.model);
}
swim.h.state = "ground";
swim.h.swimming = false;
swim.h.swimSpeed = 0;
swim.h.swimVertical = 0;
for (let i = 0; i < 180; i++) {
  swim.animator.update(1 / 60, swim.h);
  finite(swim.model);
}
check(
  "Leaving water settles upright",
  Math.abs(swim.model.rotation.x) < 0.005 &&
    Math.abs(exactFloor(swim.model)) < 0.005,
  {
    pitch: swim.model.rotation.x,
    y: swim.model.position.y,
    floor: exactFloor(swim.model),
  },
);

const support = [];
if (blocked.animator.articulatedFeet) {
  for (const [name, slopeX, slopeZ] of [
    ["flat", 0, 0],
    ["slope", 0.12, 0.06],
  ]) {
    const { model, animator, h } = await make();
    const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
    animator.groundAt = (x, z) => ({ height: x * slopeX + z * slopeZ, normal });
    let error = 0,
      planeError = 0,
      slip = 0,
      samples = 0,
      minPitch = 0,
      maxPitch = 0;
    const prior = new Map();
    for (let frame = 0; frame < 420; frame++) {
      h.speed = frame < 30 ? 0 : 2;
      h.pos.z += h.speed / 60;
      h.feet = h.pos.x * slopeX + h.pos.z * slopeZ;
      animator.update(1 / 60, h);
      finite(model);
      if (frame < 180) continue;
      for (const leg of animator.legs) {
        const c = leg.contact;
        if (!c) {
          prior.delete(leg.side);
          continue;
        }
        const actual = leg.foot.localToWorld(c.local.clone());
        error = Math.max(error, actual.distanceTo(c.at));
        planeError = Math.max(planeError, Math.abs(actual.dot(normal)));
        minPitch = Math.min(minPitch, c.pitch);
        maxPitch = Math.max(maxPitch, c.pitch);
        const previous = prior.get(leg.side),
          identity = c.local.toArray().join();
        if (previous?.identity === identity && previous.plant === leg.plant) {
          slip = Math.max(slip, actual.distanceTo(previous.at) * 60);
          samples++;
        }
        prior.set(leg.side, { at: actual, identity, plant: leg.plant });
      }
    }
    const result = {
      name,
      error,
      planeError,
      maximumContactSpeed: slip,
      samples,
      minPitch,
      maxPitch,
    };
    support.push(result);
    check(
      `Real sole contact remains planted on ${name} ground`,
      samples > 30 && error < 0.004 && planeError < 0.004 && slip < 0.08,
      result,
    );
    check(
      `Heel strike and toe release articulate on ${name} ground`,
      minPitch < -0.04 && maxPitch > 0.25,
      result,
    );
  }
}
const expression = await make();
const morphMesh = () => {
  const geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  geometry.morphAttributes.position = [
    geometry.attributes.position.clone(),
    geometry.attributes.position.clone(),
    geometry.attributes.position.clone(),
  ];
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.morphTargetDictionary = { blink: 0, effort: 1, breathe: 2 };
  return mesh;
};
const face = morphMesh(),
  leftEye = new THREE.Group(),
  rightEye = new THREE.Group(),
  hair = morphMesh(),
  backpack = new THREE.Group();
hair.morphTargetDictionary = { sway: 0, lift: 1 };
expression.model.userData.joints.head.add(face, leftEye, rightEye, hair);
expression.model.userData.joints.spine.add(backpack);
expression.model.userData.face = {
  leftEye,
  rightEye,
  leftUpperLid: face,
  rightUpperLid: face,
  skin: face,
};
expression.model.userData.secondary = { hairTail: hair, backpack };
expression.animator = new HeroAnimator(expression.model);
let peakBlink = 0,
  peakEffort = 0,
  peakBreath = 0,
  peakGaze = 0,
  peakHair = 0,
  peakBag = 0;
for (let frame = 0; frame < 720; frame++) {
  const t = frame / 120,
    h = expression.h;
  h.speed = t < 4 ? 5 : 0;
  h.yaw = t < 2 ? 0 : t < 2.5 ? (t - 2) * 2 : 1;
  h.pos.z += h.speed / 120;
  expression.animator.update(1 / 120, h);
  finite(expression.model);
  peakBlink = Math.max(peakBlink, face.morphTargetInfluences[0]);
  peakEffort = Math.max(peakEffort, face.morphTargetInfluences[1]);
  peakBreath = Math.max(peakBreath, face.morphTargetInfluences[2]);
  peakGaze = Math.max(peakGaze, Math.abs(leftEye.rotation.y));
  peakHair = Math.max(
    peakHair,
    Math.abs(hair.morphTargetInfluences[0]),
    hair.morphTargetInfluences[1],
  );
  peakBag = Math.max(
    peakBag,
    Math.abs(backpack.rotation.x),
    Math.abs(backpack.rotation.z),
  );
}
const expressionResult = {
  peakBlink,
  peakEffort,
  peakBreath,
  peakGaze,
  peakHair,
  peakBag,
  finalBlink: face.morphTargetInfluences[0],
};
check(
  "Blink morph closes and reopens",
  peakBlink > 0.95 && face.morphTargetInfluences[0] === 0,
  expressionResult,
);
check(
  "Effort and breathing remain restrained",
  peakEffort > 0.2 &&
    peakEffort <= 0.4 &&
    peakBreath > 0.1 &&
    peakBreath <= 0.3,
  expressionResult,
);
check(
  "Eyes anticipate a turn without extreme gaze",
  peakGaze > 0.025 && peakGaze < 0.3,
  expressionResult,
);
check(
  "Hair deforms without rotating its scalp",
  peakHair > 0.1 &&
    peakHair <= 1 &&
    hair.rotation.x === 0 &&
    hair.rotation.y === 0 &&
    hair.rotation.z === 0,
  expressionResult,
);
check(
  "Equipment responds with bounded inertia",
  peakBag > 0.01 && peakBag < 0.2,
  expressionResult,
);

// Wall climbing: the explorer's own controller drives the animator up scarred ice with the
// axes and up ivy by hand, at four frame rates, as a player's keys would: walk in, jump at the
// wall, climb, move across, leap, pull up over the top; and on another run let go.
const { Hero } = await import("../game/hero.js");
const { World } = await import("../game/world.js");
const { addClimbSurface, wallPoint } = await import("../game/wall-climb.js");
const { WALL_CONTACT } = await import("../game/animation/wall.js");
const wallRuns = [];
async function climbWall(kind, hz, keys) {
  const world = new World();
  world.add(-10, -30, -10, 10, 0, 10, "rock");
  world.add(-3, -30, -3.6, 3, 4.6, -2, "rock", null, { grab: false });
  world.add(-10, -30, -14, 10, 4.6, -3.6, "rock");
  const surface = addClimbSurface(world, {
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
  const result = {
    kind,
    hz,
    states: [],
    strikes: 0,
    palm: 0,
    pick: 0,
    sole: 0,
    behind: 0,
    samples: 0,
    feetSamples: 0,
    finite: true,
  };
  const dt = 1 / hz;
  for (let frame = 0; frame < Math.round(hz * 9); frame++) {
    const t = frame * dt;
    const input = {
      move: { x: 0, y: 0 },
      camYaw: Math.PI,
      jump: false,
      jumpHeld: false,
      drop: false,
      dropHeld: false,
      interactPressed: false,
      interactHeld: false,
      walk: false,
      roll: false,
      ...keys(t, frame, hz, result.states.includes("climb")),
    };
    const sub = Math.max(1, Math.ceil(dt * 50 - 1e-6));
    for (let i = 0; i < sub; i++) {
      hero.update(dt / sub, input);
      input.jump = input.drop = false;
    }
    for (const event of hero.events.splice(0))
      if (event === (kind === "ice" ? "axe" : "vine")) result.strikes++;
    hero.wallStrikes?.splice(0);
    animator.update(dt, hero);
    model.updateMatrixWorld(true);
    result.finite &&= Object.values(model.userData.joints).every((joint) =>
      joint.matrixWorld.elements.every(Number.isFinite),
    );
    if (result.states.at(-1) !== hero.state) result.states.push(hero.state);
    const W = hero.state === "wall" ? hero.cling : null;
    if (!W || W.leap) continue;
    const goals = animator.reachGoals(hero);
    for (const [side, name] of [
      ["left", "leftHand"],
      ["right", "rightHand"],
    ]) {
      const arm = animator.ik[side];
      if (arm.weight < 0.99) continue;
      const palm = (arm.hand || arm.lower).localToWorld(arm.palm.clone());
      result.palm = Math.max(result.palm, palm.distanceTo(goals[side].at));
      const front = (palm.x - W.s.o.x) * W.s.n.x + (palm.z - W.s.o.z) * W.s.n.z;
      result.behind = Math.max(result.behind, -front);
      result.samples++;
      const hold = W.limbs[name];
      const axe = animator.axes?.find((a) => a.key === side);
      if (kind === "ice" && hold.s < 0 && axe?.held) {
        const tip = axe.axe.localToWorld(
          new THREE.Vector3(...axe.axe.userData.pick),
        );
        const depth = (tip.x - W.s.o.x) * W.s.n.x + (tip.z - W.s.o.z) * W.s.n.z;
        result.pick = Math.max(result.pick, Math.abs(depth));
      }
    }
    if (animator.wallLegWeight < 1) continue;
    for (const leg of animator.legs) {
      const hold = W.limbs[leg.side + "Foot"];
      if (hold.s >= 0) continue;
      const sole = leg.foot.localToWorld(leg.palm.clone());
      const at = wallPoint(W.s, hold.u, WALL_CONTACT.sole);
      result.sole = Math.max(
        result.sole,
        Math.hypot(sole.x - at.x, sole.y - hold.y, sole.z - at.z),
      );
      result.feetSamples++;
    }
  }
  result.end = {
    state: hero.state,
    feet: +hero.feet.toFixed(3),
    x: +hero.pos.x.toFixed(3),
    z: +hero.pos.z.toFixed(3),
  };
  result.axesOnPack = animator.axes?.every(
    (a) =>
      a.axe.parent === model.userData.joints.spine &&
      a.axe.visible === (kind === "ice"),
  );
  return result;
}
// Walk in, jump at the wall, climb, move across, stop, leap up, climb on over the top and
// stand there.
const climbKeys = (t, frame, hz, over) => {
  const press = (at) => frame === Math.round(at * hz);
  const up = t > 0.4 && t < 2.2,
    across = t >= 2.2 && t < 3,
    leap = press(3.4),
    on = t > 3.5 && !over;
  return {
    move: {
      x: across ? 1 : 0,
      y: t < 0.4 || up || on || leap ? 1 : 0,
    },
    jump: press(0.32) || leap,
    jumpHeld: false,
  };
};
// Climb a little, then let go: the same wall is not caught again until she stands.
const dropKeys = (t, frame, hz) => ({
  move: { x: 0, y: t < 1.4 ? 1 : 0 },
  jump: frame === Math.round(0.32 * hz),
  drop: frame === Math.round(1.5 * hz),
});
for (const kind of ["ice", "vine"])
  for (const hz of [20, 30, 60, 120])
    wallRuns.push(await climbWall(kind, hz, climbKeys));
for (const kind of ["ice", "vine"]) {
  const runs = wallRuns.filter((r) => r.kind === kind);
  check(
    `${kind} climb takes hold, climbs, leaps and pulls up at every rate`,
    runs.every(
      (r) =>
        r.finite &&
        r.states.join(">") === "ground>wall>climb>ground" &&
        r.end.feet > 4.5,
    ),
    runs.map((r) => ({ hz: r.hz, states: r.states, end: r.end })),
  );
  check(
    `${kind} climb keeps palms on its holds without passing into the wall`,
    runs.every((r) => r.samples > 50 && r.palm < 0.03 && r.behind < 0.001),
    runs.map((r) => ({
      hz: r.hz,
      palm: r.palm,
      behind: r.behind,
      samples: r.samples,
    })),
  );
  check(
    `${kind} climb keeps planted soles on the surface`,
    runs.every((r) => r.feetSamples > 40 && r.sole < 0.035),
    runs.map((r) => ({ hz: r.hz, sole: r.sole, samples: r.feetSamples })),
  );
  const ends = runs.map((r) => r.end);
  check(
    `${kind} climb reaches the same place at 20, 30, 60 and 120 Hz`,
    Math.max(...ends.map((e) => e.x)) - Math.min(...ends.map((e) => e.x)) <
      0.05 &&
      Math.max(...ends.map((e) => e.z)) - Math.min(...ends.map((e) => e.z)) <
        0.05 &&
      Math.max(...runs.map((r) => r.strikes)) -
        Math.min(...runs.map((r) => r.strikes)) <=
        1,
    runs.map((r) => ({ hz: r.hz, end: r.end, strikes: r.strikes })),
  );
}
check(
  "Axe picks bite the ice at planted holds",
  wallRuns.filter((r) => r.kind === "ice").every((r) => r.pick < 0.05),
  wallRuns
    .filter((r) => r.kind === "ice")
    .map((r) => ({ hz: r.hz, pick: r.pick })),
);
check(
  "Axes ride the pack once owned and off the climb",
  wallRuns.every((r) => r.axesOnPack),
  wallRuns.map((r) => ({ kind: r.kind, hz: r.hz, onPack: r.axesOnPack })),
);
const drops = [];
for (const hz of [20, 60, 120])
  drops.push(await climbWall("ice", hz, dropKeys));
check(
  "Letting go falls clear and does not catch the same wall again",
  drops.every(
    (r) => r.states.join(">") === "ground>wall>air>ground" && r.end.feet === 0,
  ),
  drops.map((r) => ({ hz: r.hz, states: r.states, end: r.end })),
);

const report = {
  checks,
  swing: { cases: swingCases, rates: swingRates },
  gaits,
  transitions,
  contacts,
  rates,
  support,
  wall: [...wallRuns, ...drops],
  expression: expressionResult,
  asset: assetPath,
  reference: referencePath,
};
await writeFile(
  path.join(output, "numeric.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (!process.argv.includes("--render")) process.exit(0);

function studio(assetPath, beforeAssetPath) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 720);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  document.body.append(renderer.domElement);
  const makeHero = () => ({
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
  let runs;
  async function reset() {
    runs = [];
    for (const [C, source] of [
      [BeforeAnimator, beforeAssetPath],
      [HeroAnimator, assetPath],
    ]) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x303b45);
      scene.add(new THREE.HemisphereLight(0xffe7d0, 0x758797, 2));
      const key = new THREE.DirectionalLight(0xffead0, 3);
      key.position.set(-3, 5, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xaacfff, 1.5);
      rim.position.set(3, 3, -3);
      scene.add(rim);
      scene.add(new THREE.GridHelper(200, 400, 0x82929a, 0x495b68));
      const model = await ASSET("/" + source, {
        keepHierarchy: true,
        surfaces: false,
      });
      scene.add(model);
      const camera = new THREE.PerspectiveCamera(32, 640 / 720, 0.01, 100);
      const ledge = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2.4, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x76808c, roughness: 1 }),
      );
      ledge.position.set(0, 1.2, 0.84);
      ledge.visible = false;
      scene.add(ledge);
      const animator = new C(model);
      animator.groundAt = (x, z, referenceY) => ({
        height: referenceY,
        normal: new THREE.Vector3(0, 1, 0),
      });
      runs.push({
        scene,
        model,
        camera,
        animator,
        ledge,
        hangFeet: 2.4 - animator.hangReach(0.25),
        h: makeHero(),
      });
    }
  }
  function step(
    dt,
    speed,
    yaw = 0,
    state = "ground",
    vertical = 0,
    feet = null,
    landing = 0,
  ) {
    for (const r of runs) {
      const h = r.h;
      h.speed = speed;
      h.yaw = yaw;
      h.state = state;
      h.swimming = state === "swim";
      h.swimSpeed = speed;
      h.swimVertical = vertical;
      h.pos.x += Math.sin(yaw) * speed * dt;
      h.pos.z += Math.cos(yaw) * speed * dt;
      h.holding = state === "ground" || state === "air";
      h.vel.y = vertical;
      h.landing = landing;
      h.feet = feet === null ? h.feet + vertical * dt : feet;
      r.animator.update(dt, h);
    }
  }
  function traversal(dt, t) {
    for (const r of runs) {
      const h = r.h;
      h.state = "hang";
      h.swimming = false;
      h.holding = false;
      h.speed = 0;
      h.yaw = 0;
      h.feet = r.hangFeet;
      h.pos.set(t > 1 ? Math.min(t - 1, 1.5) * 0.45 : 0, 0, 0);
      h.shimmy = t > 1 && t < 2.5 ? 1 : 0;
      h.ledge = { n: { x: 0, z: -1 }, top: 2.4, hand: { x: h.pos.x, z: 0.24 } };
      r.ledge.visible = true;
      r.animator.update(dt, h);
    }
  }
  function draw(side = false) {
    renderer.setScissorTest(true);
    runs.forEach((r, i) => {
      const target = r.h.pos.clone();
      target.y = r.h.feet + 0.88;
      const offset = side
        ? new THREE.Vector3(4.8, 1, 0.65)
        : new THREE.Vector3(3.8, 1.2, r.h.state === "hang" ? -3.5 : 3.5);
      r.camera.position.copy(target).add(offset);
      r.camera.lookAt(target);
      if (r.ledge.visible) {
        const torso = r.model.userData.joints.spine.getWorldPosition(
          new THREE.Vector3(),
        );
        const direction = torso.clone().sub(r.camera.position);
        r.ledge.updateMatrixWorld(true);
        const hit = new THREE.Raycaster(
          r.camera.position,
          direction.clone().normalize(),
        ).intersectObject(r.ledge, false)[0];
        if (hit && hit.distance < direction.length())
          throw new Error("The traversal fixture hides the character");
      }
      renderer.setViewport(i * 640, 0, 640, 720);
      renderer.setScissor(i * 640, 0, 640, 720);
      renderer.render(r.scene, r.camera);
    });
  }
  window.STUDIO = { reset, step, draw, traversal };
  return reset().then(() => {
    draw();
    window.DONE = true;
  });
}
const html = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/game/vendor/three.module.js","three/addons/":"/game/vendor/"}}</script><style>body{margin:0;background:#303b45;color:#fff;font:20px system-ui}.label{position:absolute;top:20px;left:24px}.after{left:664px}canvas{display:block}</style></head><body><div class="label">Before</div><div class="label after">After</div><script type="module">import * as THREE from 'three';import {ASSET} from '/game/assetlib.js';import {HeroAnimator} from '/game/hero-anim.js';import {HeroAnimator as BeforeAnimator} from '/${referencePath}';(${studio.toString()})(${JSON.stringify(assetPath)},${JSON.stringify(beforeAssetPath)});</script></body></html>`;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/studio") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
    const file = path.resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/studio`, {
    waitUntil: "load",
  });
  await page.waitForFunction(() => window.DONE);
  for (const [name, speed, stride] of traversalOnly
    ? []
    : [
        ["walk", 2, 1.4],
        ["run", 5, 2.9],
      ]) {
    await page.evaluate(async () => window.STUDIO.reset());
    await page.evaluate((s) => {
      for (let i = 0; i < 240; i++) window.STUDIO.step(1 / 120, s);
    }, speed);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(
        ({ speed, stride }) => {
          for (let j = 0; j < 12; j++)
            window.STUDIO.step(stride / speed / 96, speed);
          window.STUDIO.draw(true);
        },
        { speed, stride },
      );
      await page.screenshot({ path: path.join(output, `${name}-${i}.png`) });
    }
    const filter =
      "[0:v]crop=640:720:0:0,scale=240:270[a0];[0:v]crop=640:720:640:0,scale=240:270[b0];" +
      Array.from(
        { length: 7 },
        (_, i) =>
          `[${i + 1}:v]crop=640:720:0:0,scale=240:270[a${i + 1}];[${i + 1}:v]crop=640:720:640:0,scale=240:270[b${i + 1}];`,
      ).join("") +
      Array.from({ length: 8 }, (_, i) => `[a${i}]`).join("") +
      "hstack=inputs=8[top];" +
      Array.from({ length: 8 }, (_, i) => `[b${i}]`).join("") +
      "hstack=inputs=8[bottom];[top][bottom]vstack=inputs=2";
    const result = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        ...Array.from({ length: 8 }, (_, i) => [
          "-i",
          path.join(output, `${name}-${i}.png`),
        ]).flat(),
        "-filter_complex",
        filter,
        "-frames:v",
        "1",
        path.join(output, `${name}-filmstrip.png`),
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  }
  if (!process.argv.includes("--stills")) {
    await page.evaluate(async () => window.STUDIO.reset());
    const frames = path.join(output, "frames");
    await mkdir(frames, { recursive: true });
    const firstFrame = traversalOnly ? 330 : 0;
    const lastFrame = traversalOnly ? 420 : 570;
    for (let frame = firstFrame; frame < lastFrame; frame++) {
      if (frame === 330 || frame === 420)
        await page.evaluate(async () => window.STUDIO.reset());
      const t = frame / 30;
      const speed =
        t < 0.7
          ? 0
          : t < 1.5
            ? ((t - 0.7) / 0.8) * 2
            : t < 2.5
              ? 2
              : t < 3
                ? 2 + (t - 2.5) * 6
                : t < 7
                  ? 5
                  : t < 7.6
                    ? ((7.6 - t) / 0.6) * 5
                    : 0;
      const yaw =
        t < 4
          ? 0
          : t < 4.25
            ? (((t - 4) / 0.25) * Math.PI) / 2
            : t < 5.5
              ? Math.PI / 2
              : t < 5.85
                ? Math.PI / 2 + ((t - 5.5) / 0.35) * Math.PI
                : Math.PI * 1.5;
      const air = t >= 8 && t < 8.8,
        u = (t - 8) / 0.8,
        state = air ? "air" : "ground";
      const feet = air ? Math.sin(u * Math.PI) * 0.85 : 0,
        vertical = air ? (Math.cos(u * Math.PI) * 0.85 * Math.PI) / 0.8 : 0;
      const landing = t >= 8.8 && t < 9.1 ? (9.1 - t) / 0.3 : 0;
      if (frame >= 330 && frame < 420) {
        await page.evaluate((t) => {
          window.STUDIO.traversal(1 / 60, t);
          window.STUDIO.traversal(1 / 60, t + 1 / 60);
          window.STUDIO.draw();
        }, t - 11);
      } else if (frame >= 420) {
        await page.evaluate((t) => {
          const speed = t < 1 ? 0 : Math.min((t - 1) * 3.2, 3.2);
          const vertical = t > 3.8 ? 1.2 : 0;
          window.STUDIO.step(1 / 60, speed, 0, "swim", vertical, 0);
          window.STUDIO.step(1 / 60, speed, 0, "swim", vertical, 0);
          window.STUDIO.draw(true);
        }, t - 14);
      } else
        await page.evaluate(
          ({ speed, yaw, state, feet, vertical, landing }) => {
            window.STUDIO.step(
              1 / 60,
              speed,
              yaw,
              state,
              vertical,
              feet,
              landing,
            );
            window.STUDIO.step(
              1 / 60,
              speed,
              yaw,
              state,
              vertical,
              feet,
              landing,
            );
            window.STUDIO.draw();
          },
          { speed, yaw, state, feet, vertical, landing },
        );
      await page.screenshot({
        path: path.join(frames, `${String(frame).padStart(4, "0")}.jpg`),
        type: "jpeg",
        quality: 90,
      });
    }
    const movie = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        "30",
        "-start_number",
        String(firstFrame),
        "-i",
        path.join(frames, "%04d.jpg"),
        "-c:v",
        "libx264",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        path.join(output, "before-after.mp4"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(movie.status, 0, movie.stderr);
    const retained = new Set([
      0, 42, 90, 120, 132, 165, 174, 186, 220, 240, 250, 266, 276, 310, 345,
      375, 405, 435, 465, 495, 525, 555,
    ]);
    for (let frame = firstFrame; frame < lastFrame; frame++)
      if (!retained.has(frame))
        await unlink(
          path.join(frames, `${String(frame).padStart(4, "0")}.jpg`),
        );
  }
  if (!traversalOnly) {
    await page.evaluate(async () => {
      await window.STUDIO.reset();
      for (let i = 0; i < 180; i++) window.STUDIO.step(1 / 60, 3.2, 0, "swim");
      window.STUDIO.draw(true);
    });
    await page.screenshot({ path: path.join(output, "swim.png") });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "render.json"),
    JSON.stringify(
      {
        errors,
        frames: process.argv.includes("--stills")
          ? 0
          : traversalOnly
            ? 90
            : 570,
        seconds: process.argv.includes("--stills") ? 0 : traversalOnly ? 3 : 19,
        views: traversalOnly
          ? ["hang", "shimmy"]
          : [
              "walk",
              "run",
              "turn",
              "brake",
              "jump",
              "land",
              "hang",
              "shimmy",
              "swim",
            ],
        asset: assetPath,
        beforeAsset: beforeAssetPath,
        beforeAnimator: referencePath,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  if (browser) {
    const process = browser.process();
    await browser.close();
    process?.stdout?.destroy();
    process?.stderr?.destroy();
  }
  await new Promise((resolve) => server.close(resolve));
}
