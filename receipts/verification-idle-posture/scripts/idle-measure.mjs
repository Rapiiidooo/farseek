// Measures the standing pose in the model's frame: feet apart, hands from the thighs, elbow bend.
import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [base = "http://localhost:3002/"] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`${base}?nolock=1&debug=1&chapter=floor`, {
  waitUntil: "load",
});
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
await sleep(6000);
const r = await page.evaluate(() => {
  const { THREE, heroModel } = window.__FD__;
  const J = heroModel.userData.joints;
  heroModel.updateMatrixWorld(true);
  const inv = heroModel.matrixWorld.clone().invert();
  const p = (j) => j.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const f = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(3));
  const out = {};
  for (const name of [
    "hips",
    "leftUpperArm",
    "rightUpperArm",
    "leftLowerArm",
    "rightLowerArm",
    "leftHand",
    "rightHand",
    "leftUpperLeg",
    "rightUpperLeg",
    "leftFoot",
    "rightFoot",
  ])
    if (J[name]) out[name] = f(p(J[name]));
  const angle = (a, b, c) => {
    const u = p(a).sub(p(b)),
      v = p(c).sub(p(b));
    return +(180 - THREE.MathUtils.radToDeg(u.angleTo(v))).toFixed(1);
  };
  out.elbowBend = {
    left: angle(J.leftUpperArm, J.leftLowerArm, J.leftHand),
    right: angle(J.rightUpperArm, J.rightLowerArm, J.rightHand),
  };
  out.feetApart = +p(J.leftFoot).distanceTo(p(J.rightFoot)).toFixed(3);
  out.handsOut = {
    left: +Math.abs(p(J.leftHand).x - p(J.leftUpperLeg).x).toFixed(3),
    right: +Math.abs(p(J.rightHand).x - p(J.rightUpperLeg).x).toFixed(3),
  };
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
