// The belt, the trousers' waist and the spare magazine pouches in the hips joint's frame, as posed.
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
  const hips = heroModel.userData.joints.hips;
  const inv = hips.matrixWorld.clone().invert();
  const out = {};
  const f = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(3));
  heroModel.traverse((m) => {
    if (!m.isMesh) return;
    if (
      !/belt|Belt|pouch|Pouch|magazine|Magazine|waist|Waist|trouser|Trouser|pants|Pants|holster/i.test(
        m.name + " " + (m.parent?.name || ""),
      )
    )
      return;
    const box = new THREE.Box3();
    if (m.isSkinnedMesh) {
      m.computeBoundingBox();
      box.copy(m.boundingBox).applyMatrix4(m.matrixWorld);
    } else box.setFromObject(m);
    box.applyMatrix4(inv);
    out[
      (m.parent?.name ? m.parent.name + " / " : "") +
        m.name +
        (m.isSkinnedMesh ? " (skinned)" : "")
    ] = { min: f(box.min), max: f(box.max) };
  });
  // The body's front surface at the pouches' height and sides: ray from in front towards the hips.
  const hits = {};
  const ray = new THREE.Raycaster();
  const meshes = [];
  heroModel.traverse((m) => {
    if (
      m.isMesh &&
      m.visible &&
      !/pouch|magazine|holster|pistol/i.test(m.name + (m.parent?.name || ""))
    )
      meshes.push(m);
  });
  for (const x of [-0.125, 0.125])
    for (const y of [-0.06, -0.025, 0.005]) {
      const from = new THREE.Vector3(x, y, 0.5).applyMatrix4(hips.matrixWorld);
      const to = new THREE.Vector3(x, y, 0).applyMatrix4(hips.matrixWorld);
      ray.set(from, to.clone().sub(from).normalize());
      const hit = ray.intersectObjects(meshes, false)[0];
      hits[`x${x} y${y}`] = hit
        ? {
            z: +hit.point.clone().applyMatrix4(inv).z.toFixed(3),
            mesh: hit.object.name,
          }
        : null;
    }
  return { boxes: out, frontSurface: hits };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
