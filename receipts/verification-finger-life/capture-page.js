// Drives the explorer of two trees (`before` and `after`) through the same scenarios at a fixed
// 1/60 s step and draws each capture into a contact sheet: the after body, then each hand of
// each tree from the thumb's side of the palm.
import * as THREE from "three";

const CELL = 220,
  LABEL = 132,
  HEAD = 34;
const ROWS = [
  ["after", "body", "After, whole body"],
  ["before", "left", "Before, left hand"],
  ["after", "left", "After, left hand"],
  ["before", "right", "Before, right hand"],
  ["after", "right", "After, right hand"],
];
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(CELL, CELL);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = false;
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 60);
const trees = {};

async function loadTree(tree) {
  const base = `/${tree}/game/`;
  const modules = {
    ...(await import(base + "assetlib.js")),
    ...(await import(base + "hero-anim.js")),
    ...(await import(base + "lab-equipment.js")),
    ...(await import(base + "hero.js")),
    ...(await import(base + "world.js")),
    ...(await import(base + "wall-climb.js")),
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b3540);
  scene.add(new THREE.HemisphereLight(0xffe7d0, 0x6f7f8f, 2.1));
  const key = new THREE.DirectionalLight(0xffead0, 2.6);
  key.position.set(-3, 5, 4);
  const rim = new THREE.DirectionalLight(0xaacfff, 1.4);
  rim.position.set(3, 3, -3);
  const under = new THREE.DirectionalLight(0xfff1e0, 0.8);
  under.position.set(1, -2, 3);
  scene.add(key, rim, under);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x46505a, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const props = new THREE.Group();
  scene.add(props);
  trees[tree] = { tree, base, modules, scene, floor, props };
}

const stone = new THREE.MeshStandardMaterial({ color: 0x7a838e, roughness: 1 });
const ice = new THREE.MeshStandardMaterial({
  color: 0xb9d8ea,
  roughness: 0.35,
});
const ivy = new THREE.MeshStandardMaterial({ color: 0x4f6b3c, roughness: 0.9 });
const rope = new THREE.MeshStandardMaterial({
  color: 0x8a6a45,
  roughness: 0.9,
});
const box = (material, size, at) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  return mesh;
};

const plainHero = () => ({
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

// A fresh explorer per scenario: an animator reads its rest pose from the joints it is given.
async function prepare(tree, scenario) {
  const T = trees[tree];
  if (T.model) {
    T.lab?.dispose();
    T.model.removeFromParent();
  }
  T.props.clear();
  const { ASSET, HeroAnimator, LabEquipment } = T.modules;
  T.model = await ASSET(T.base + "assets/hero_realistic.js", {
    keepHierarchy: true,
    surfaces: false,
  });
  T.scene.add(T.model);
  T.animator = new HeroAnimator(T.model);
  T.animator.groundAt = (x, z, referenceY) => ({
    height: T.world ? T.world.ground(x, z, 0.025, referenceY, 0.6) : 0,
    normal: new THREE.Vector3(0, 1, 0),
  });
  T.world = null;
  T.lab = new LabEquipment(T.model, T.animator);
  T.h = plainHero();
  T.floor.visible = true;
  scenario.setup?.(T);
}

// The hand's own frame: palm normal, fingers, and the side the thumb is on, which the after
// tree's thumb bone tells once for both trees.
const thumbSide = {};
function handFrame(T, side) {
  const arm = T.animator.ik[side];
  const holder = arm.hand || arm.lower;
  T.model.updateMatrixWorld(true);
  const q = holder.getWorldQuaternion(new THREE.Quaternion());
  const palm = holder.localToWorld(arm.palm.clone());
  const normal = arm.normal.clone().applyQuaternion(q).normalize();
  const fingers = arm.fingers.clone().applyQuaternion(q).normalize();
  const thumb = new THREE.Vector3().crossVectors(fingers, normal).normalize();
  const bone = T.animator.fingerRig?.[side]?.bones[0];
  if (bone && thumbSide[side] === undefined)
    thumbSide[side] = Math.sign(
      bone.getWorldPosition(new THREE.Vector3()).sub(palm).dot(thumb),
    );
  return {
    palm,
    normal,
    fingers,
    thumb: thumb.multiplyScalar(thumbSide[side] ?? 1),
  };
}

// Where the camera stands from the palm, in the hand's frame: by default on the thumb's side and
// a little behind the knuckles, where a finger's curl shows in profile.
function handCamera(frame, view = {}, distance = 0.36) {
  const { thumb = 0.8, normal = -0.35, fingers = -0.12 } = view;
  const target = frame.palm.clone().addScaledVector(frame.fingers, 0.035);
  const direction = new THREE.Vector3()
    .addScaledVector(frame.thumb, thumb)
    .addScaledVector(frame.normal, normal)
    .addScaledVector(frame.fingers, fingers)
    .normalize();
  camera.fov = 30;
  camera.up.copy(frame.fingers).negate();
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
}

function draw(sheet, column, row, T, view, scenario) {
  if (view === "body") {
    const hips = T.model.userData.joints.hips.getWorldPosition(
      new THREE.Vector3(),
    );
    const offset = new THREE.Vector3(...(scenario.body || [1.7, 0.5, 2.9]));
    const turn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      T.animator.root.yaw.v,
    );
    camera.fov = 30;
    camera.up.set(0, 1, 0);
    camera.position.copy(hips).add(offset.applyQuaternion(turn));
    camera.lookAt(hips.x, hips.y + (scenario.bodyLift ?? 0.05), hips.z);
  } else handCamera(handFrame(T, view), scenario.handView);
  camera.updateProjectionMatrix();
  renderer.render(T.scene, camera);
  sheet.drawImage(
    renderer.domElement,
    LABEL + column * CELL,
    HEAD + row * CELL,
  );
}

function hands(T) {
  const H = T.model.userData.hands;
  const out = {};
  for (const side of ["left", "right"]) {
    const rig = T.animator.fingerRig?.[side];
    out[side] = {
      grip: H[side + "Grip"].visible,
      curl: rig
        ? rig.curl.map((spring) => +spring.v.toFixed(3))
        : +(T.animator.handCurl?.[side] ?? 0).toFixed(3),
      spread: rig ? +rig.spread.v.toFixed(3) : null,
    };
  }
  return out;
}

export async function run(scenario) {
  for (const tree of ["before", "after"]) {
    if (!trees[tree]) await loadTree(tree);
    await prepare(tree, scenario);
  }
  for (const side of ["left", "right"]) {
    delete thumbSide[side];
    handFrame(trees.after, side);
  }
  const columns = scenario.times.length;
  const canvas = document.createElement("canvas");
  canvas.width = LABEL + columns * CELL;
  canvas.height = HEAD + ROWS.length * CELL;
  const sheet = canvas.getContext("2d");
  sheet.fillStyle = "#1b2128";
  sheet.fillRect(0, 0, canvas.width, canvas.height);
  sheet.fillStyle = "#e8edf2";
  sheet.font = "15px system-ui, sans-serif";
  sheet.textBaseline = "middle";
  ROWS.forEach(([, , label], row) => {
    const [first, ...rest] = label.split(", ");
    sheet.fillText(first + ",", 10, HEAD + row * CELL + CELL / 2 - 10);
    sheet.fillText(rest.join(", "), 10, HEAD + row * CELL + CELL / 2 + 10);
  });
  const samples = [],
    closeUps = [];
  const dt = 1 / 60;
  const last = Math.round(scenario.times.at(-1) * 60);
  let next = 0;
  for (let frame = 0; frame <= last; frame++) {
    const t = frame * dt;
    for (const tree of ["before", "after"]) scenario.step(trees[tree], t, dt);
    for (const request of scenario.closeUps || [])
      if (frame === Math.round(request.at * 60))
        closeUps.push({
          ...request,
          image: closeUp(request.side, request.view ?? scenario.handView),
        });
    while (next < columns && frame >= Math.round(scenario.times[next] * 60)) {
      sheet.fillStyle = "#e8edf2";
      sheet.fillText(
        `${scenario.times[next].toFixed(2)} s`,
        LABEL + next * CELL + 8,
        HEAD / 2,
      );
      ROWS.forEach(([tree, view], row) =>
        draw(sheet, next, row, trees[tree], view, scenario),
      );
      samples.push({
        t: scenario.times[next],
        state: trees.after.h.state,
        before: hands(trees.before),
        after: hands(trees.after),
      });
      next++;
    }
  }
  return {
    image: canvas.toDataURL("image/jpeg", 0.84),
    samples,
    closeUps,
  };
}

// Single close-ups at a larger size, before and after, for the scenario's current frame.
export function closeUp(side, view, size = 480) {
  renderer.setSize(size, size);
  const canvas = document.createElement("canvas");
  canvas.width = size * 2;
  canvas.height = size;
  const context = canvas.getContext("2d");
  ["before", "after"].forEach((tree, i) => {
    const T = trees[tree];
    handCamera(handFrame(T, side), view, 0.32);
    camera.updateProjectionMatrix();
    renderer.render(T.scene, camera);
    context.drawImage(renderer.domElement, i * size, 0);
  });
  renderer.setSize(CELL, CELL);
  return canvas.toDataURL("image/jpeg", 0.86);
}

window.CAPTURE = { run, closeUp, trees, THREE, box, stone, ice, ivy, rope };
window.READY = true;
