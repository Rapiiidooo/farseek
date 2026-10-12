import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto("http://localhost:3002/?nolock=1&debug=1&chapter=frost", {
  waitUntil: "load",
});
await page.waitForFunction(
  () => window.__READY__ === true && window.__GAME__?.mode === "play",
  { timeout: 180000 },
);
await sleep(1500);
const r = await page.evaluate(() => {
  const { THREE, worlds } = window.__FD__;
  const w = worlds.get("four");
  let found = null;
  w.scene.traverse((o) => {
    if (o.name === "mira-ice-axes") found = o;
  });
  if (!found) return { found: false };
  found.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(found);
  const p = found.getWorldPosition(new THREE.Vector3());
  const ground = w.world.ground(p.x, p.z, 0.05, 1e4, 0);
  const groundBelow = w.world.ground(p.x, p.z + 0.2, 0.05, 10, 0);
  return {
    found: true,
    visible: found.visible,
    children: found.children.length,
    pos: p.toArray().map((n) => +n.toFixed(3)),
    box: [box.min.toArray(), box.max.toArray()].map((v) =>
      v.map((n) => +n.toFixed(2)),
    ),
    ground,
    groundBelow,
  };
});
console.log(JSON.stringify(r));
await browser.close();
