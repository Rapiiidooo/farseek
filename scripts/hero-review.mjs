import assert from "node:assert/strict";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import * as THREE from "three";
import { pathToFileURL } from "node:url";
import { ASSET } from "../game/assetlib.js";
import { HeroAnimator } from "../game/hero-anim.js";

const stage = process.argv[2] || "candidates";
const requested = process.argv.slice(3);
const root = path.resolve(import.meta.dirname, "..");
globalThis.location = {
  href: pathToFileURL(path.join(root, "game/index.html")).href,
};
const output = path.join(root, "receipts/verification-expansion/hero", stage);
await mkdir(output, { recursive: true });
const files = requested.length
  ? requested
  : ["before", "hero_explorer_a", "hero_explorer_b", "hero_explorer_c"].map(
      (name) => `receipts/candidates/hero_explorer_v4/${name}.js`,
    );
const animation = [];
for (const file of files) {
  const url = pathToFileURL(path.join(root, file)).href;
  const options = { keepHierarchy: true, surfaces: false };
  const model = await ASSET(url, options);
  const clone = await ASSET(url, options);
  for (const instance of [model, clone]) {
    const nodes = new Set();
    instance.traverse((node) => nodes.add(node));
    assert.equal(Object.keys(instance.userData.joints ?? {}).length, 14);
    assert.equal(Object.keys(instance.userData.hands ?? {}).length, 4);
    for (const key of ["joints", "hands"])
      for (const node of Object.values(instance.userData[key]))
        assert(
          node.isObject3D && nodes.has(node),
          `${file}: loaded ${key} belong to their instance`,
        );
    const bounds = new THREE.Box3().setFromObject(instance);
    assert(Math.abs(bounds.min.y) < 1e-5, `${file}: loaded soles at ground`);
    assert(
      Math.abs(bounds.getSize(new THREE.Vector3()).y - 1.75) < 0.004,
      `${file}: loaded height`,
    );
  }
  for (const key of ["joints", "hands"])
    for (const name of Object.keys(model.userData[key]))
      assert.notEqual(model.userData[key][name], clone.userData[key][name]);
  const animator = new HeroAnimator(model);
  const hero = {
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
  const checked = [];
  const contacts = {};
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
    hero.state = state;
    hero.speed = state === "ground" ? 4.6 : 0;
    hero.ledge = { n: { x: 0, z: -1 }, top: 1.9, hand: { x: 0, z: 0.22 } };
    hero.grip = { n: { x: 0, z: -1 }, ref: { x: 0, z: 0.52 } };
    for (let i = 0; i < 90; i++) {
      hero.t = i / 89;
      animator.update(1 / 60, hero);
      model.updateMatrixWorld(true);
      for (const joint of Object.values(model.userData.joints))
        assert(
          joint.matrixWorld.elements.every(Number.isFinite),
          `${file}: finite ${state} rig`,
        );
    }
    if (["hang", "grab", "turn"].includes(state)) {
      const goals = animator.reachGoals(hero);
      assert(goals?.left && goals?.right, `${file}: ${state} IK goals`);
      for (const side of ["left", "right"]) {
        const arm = animator.ik[side];
        const palm = arm.hand.localToWorld(arm.palm.clone());
        const error = palm.distanceTo(goals[side].at);
        if (state === "hang")
          assert(error < 0.025, `${file}: ${state} ${side} palm contact`);
        contacts[state + side] = error;
        assert(
          model.userData.hands[side + "Grip"].visible,
          "gripping fingers close",
        );
      }
    }
    checked.push(state);
  }
  hero.state = "ground";
  hero.speed = 0;
  hero.holding = true;
  for (let i = 0; i < 90; i++) animator.update(1 / 60, hero);
  assert(
    model.userData.hands.leftOpen.visible &&
      model.userData.hands.rightGrip.visible &&
      !model.userData.hands.rightOpen.visible,
    "carrying the disc closes only the right hand",
  );
  hero.holding = false;
  for (let i = 0; i < 90; i++) animator.update(1 / 60, hero);
  assert(
    model.userData.hands.leftOpen.visible &&
      model.userData.hands.rightOpen.visible,
    "resting fingers open",
  );
  animation.push({
    file,
    loader: "ASSET",
    independentClones: true,
    states: checked,
    contacts,
    rightHandClosedWhileCarrying: true,
    openHandsAtRest: true,
  });
}
for (const entry of animation.slice(1))
  for (const [key, error] of Object.entries(entry.contacts))
    assert(
      Math.abs(error - animation[0].contacts[key]) < 0.00001,
      "preserved contact accuracy",
    );
await writeFile(
  path.join(output, "animation.json"),
  JSON.stringify(animation, null, 2) + "\n",
);
const html = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/game/vendor/three.module.js","three/addons/":"/game/vendor/"}}</script><style>body{margin:0;background:#22272d;color:#eee;font:14px system-ui}canvas{display:block}.labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);pointer-events:none}.labels span{padding:16px}</style></head><body><div class="labels"><span>Front</span><span>Side</span><span>Back</span><span>Face</span><span>Three quarter</span><span>Traversal</span></div><script type="module">
import * as THREE from 'three';
import { ASSET } from '/game/assetlib.js';
const file = new URLSearchParams(location.search).get('file');
const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1500,1000); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x252c34);
scene.add(new THREE.HemisphereLight(0xf7e7d4,0x798394,2.0));
const key = new THREE.DirectionalLight(0xffedda,3.5); key.position.set(-3,4,5);scene.add(key);
const rim = new THREE.DirectionalLight(0xa8c5ee,2);rim.position.set(3,2,-3);scene.add(rim);
const model = await ASSET('/' + file, {keepHierarchy:true,surfaces:false});scene.add(model); model.updateMatrixWorld(true);
const bounds = new THREE.Box3();const vertex = new THREE.Vector3();let tris=0,meshes=0;
model.traverse(n=>{if(!n.isMesh)return;meshes++;const p=n.geometry.attributes.position;tris+=(n.geometry.index?.count||p.count)/3;for(let i=0;i<p.count;i++) bounds.expandByPoint(vertex.fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld));});
const camera = new THREE.PerspectiveCamera(30,1,0.01,30);
const headAt = model.userData.joints.head.getWorldPosition(new THREE.Vector3());
const z = headAt.z;
const shots = [
  {p:[0,1.00,4.3],at:[0,.88,0]},
  {p:[4.3,1.00,0],at:[0,.88,0]},
  {p:[0,1.00,-4.3],at:[0,.88,0]},
  {p:[0,1.641,z+.73],at:[0,1.635,z]},
  {p:[.51,1.66,z+.63],at:[0,1.63,z]},
  {p:[2.8,1.45,3.3],at:[0,1.1,0],pose:true},
];
renderer.setScissorTest(true);
for(let i=0;i<shots.length;i++) {
  const shot=shots[i],x=i%3*500,y=i<3?500:0;
  if(shot.pose){const j=model.userData.joints;j.leftUpperArm.rotation.x=-2.72;j.rightUpperArm.rotation.x=-2.72;j.leftLowerArm.rotation.x=-.12;j.rightLowerArm.rotation.x=-.12;j.leftUpperLeg.rotation.x=.15;j.rightUpperLeg.rotation.x=.12;j.leftLowerLeg.rotation.x=.45;j.rightLowerLeg.rotation.x=.40;}
  camera.position.set(...shot.p);camera.lookAt(...shot.at);camera.updateMatrixWorld();
  renderer.setViewport(x,y,500,500);renderer.setScissor(x,y,500,500);renderer.render(scene,camera);
}
window.REPORT={file,size:bounds.getSize(new THREE.Vector3()).toArray(),base:bounds.min.y,triangles:tris,meshes,palms:model.userData.palms,grip:model.userData.grip,joints:Object.keys(model.userData.joints),hands:Object.keys(model.userData.hands),renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER)};
window.DONE=true;
</script></body></html>`;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/review") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
    const target = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(body);
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
  const reports = [];
  for (const file of files) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1000 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:${server.address().port}/review?file=${encodeURIComponent(file)}`,
      { waitUntil: "load" },
    );
    await page.waitForFunction(() => window.DONE, { timeout: 60000 });
    const report = await page.evaluate(() => window.REPORT);
    assert.deepEqual(errors, []);
    assert(Math.abs(report.size[1] - 1.75) < 0.004, "hero height");
    assert(Math.abs(report.base) < 1e-5, "soles at ground");
    assert(report.triangles < 60000, "triangle budget");
    assert.deepEqual(report.joints, [
      "hips",
      "spine",
      "head",
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "rightUpperArm",
      "rightLowerArm",
      "rightHand",
      "leftUpperLeg",
      "leftLowerLeg",
      "rightUpperLeg",
      "rightLowerLeg",
      "scarfTail",
    ]);
    assert.equal(report.hands.length, 4);
    assert(report.grip.hands > 2, "hanging reach");
    await page.screenshot({
      path: path.join(output, path.basename(file, ".js") + ".png"),
    });
    reports.push(report);
    await page.close();
  }
  if (reports.length > 1)
    for (const report of reports.slice(1)) {
      assert.deepEqual(report.palms, reports[0].palms);
      assert.deepEqual(report.grip, reports[0].grip);
    }
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      stage,
      files: reports.length,
      checks:
        "ASSET clone ownership, nine poses, mirror IK, carrying and resting hands, height, ground, triangle budget, preserved palm and grip contracts",
      reports,
    }),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
