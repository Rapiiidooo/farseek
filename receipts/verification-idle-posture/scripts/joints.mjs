import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal"],
});
const page = await browser.newPage();
await page.goto(
  (process.argv[2] || "http://localhost:3002/") +
    "?nolock=1&debug=1&chapter=floor",
  { waitUntil: "load" },
);
await page.waitForFunction(
  () => window.__READY__ === true && window.__GAME__?.mode === "play",
  { timeout: 180000 },
);
for (
  let i = 0;
  i < 4 && (await page.evaluate(() => window.__GAME__.cinematic));
  i++
) {
  await page.keyboard.press("Enter");
  await sleep(700);
}
await sleep(5000);
const r = await page.evaluate(() => {
  const { THREE, heroModel, animator } = window.__FD__;
  const J = heroModel.userData.joints;
  const e = (j) =>
    j
      ? [j.rotation.x, j.rotation.y, j.rotation.z].map((n) => +n.toFixed(3))
      : null;
  const out = { joints: Object.keys(J) };
  for (const k of [
    "hips",
    "spine",
    "chest",
    "neck",
    "head",
    "leftShoulder",
    "rightShoulder",
    "leftUpperArm",
    "rightUpperArm",
    "leftUpperLeg",
    "rightUpperLeg",
    "leftLowerLeg",
    "rightLowerLeg",
  ])
    out[k] = e(J[k]);
  heroModel.updateMatrixWorld(true);
  const inv = heroModel.matrixWorld.clone().invert();
  const p = (j) => j.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const f = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(3));
  out.pos = {};
  for (const k of [
    "leftUpperArm",
    "rightUpperArm",
    "leftUpperLeg",
    "rightUpperLeg",
    "leftLowerLeg",
    "rightLowerLeg",
    "leftFoot",
    "rightFoot",
    "head",
  ])
    if (J[k]) out.pos[k] = f(p(J[k]));
  out.weight = animator?.weight;
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
