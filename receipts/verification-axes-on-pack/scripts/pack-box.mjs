import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto("http://localhost:3002/?nolock=1&debug=1&chapter=forest", {
  waitUntil: "load",
});
await page.waitForFunction(
  () => window.__READY__ === true && window.__GAME__?.mode === "play",
  { timeout: 180000 },
);
await sleep(1500);
const r = await page.evaluate(() => {
  const { THREE, heroModel } = window.__FD__;
  heroModel.updateMatrixWorld(true);
  const inv = heroModel.matrixWorld.clone().invert();
  const out = {};
  heroModel.traverse((m) => {
    if (!/Pack|pack|ice axe/i.test(m.name)) return;
    if (!(m.isMesh || m.isGroup || m.isObject3D)) return;
    const box = new THREE.Box3();
    if (m.isSkinnedMesh) {
      m.computeBoundingBox();
      box.copy(m.boundingBox).applyMatrix4(m.matrixWorld);
    } else box.setFromObject(m);
    box.applyMatrix4(inv);
    const f = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(3));
    out[m.name + (m.isSkinnedMesh ? " (skinned)" : "")] = {
      min: f(box.min),
      max: f(box.max),
    };
  });
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
