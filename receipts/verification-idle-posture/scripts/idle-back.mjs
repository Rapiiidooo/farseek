// Nyra standing idle, seen from behind and from three quarters at about 3 m, with the HUD hidden.
import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [out, base = "http://localhost:3002/", chapter = "floor"] =
  process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`${base}?nolock=1&debug=1&chapter=${chapter}`, {
  waitUntil: "load",
});
await page.waitForFunction(
  () => window.__READY__ === true && window.__GAME__?.mode === "play",
  { timeout: 180000 },
);
await page.addStyleTag({
  content:
    "#hud,#touch,#chapter-card,#subtitle,#local-tools,#letterbox{display:none!important}",
});
for (
  let i = 0;
  i < 4 && (await page.evaluate(() => window.__GAME__.cinematic));
  i++
) {
  await page.keyboard.press("Enter");
  await sleep(700);
}
await sleep(2500);
const h = await page.evaluate(() => {
  const { hero } = window.__FD__;
  return { x: hero.pos.x, z: hero.pos.z, feet: hero.feet, yaw: hero.yaw };
});
console.log(JSON.stringify(h));
// The follow camera keeps its own place; hold ours by replacing the camera's update.
await page.evaluate(() => {
  const { app } = window.__FD__;
  const follow = app.follow;
  follow.__update = follow.update;
  follow.update = function () {};
});
for (const [name, angle, dist, height] of [
  ["back", 0, 3, 1.55],
  ["three-quarter", 0.7, 2.8, 1.5],
  ["side", Math.PI / 2, 2.6, 1.2],
]) {
  await page.evaluate(
    ({ angle, dist, height }) => {
      const { app, hero } = window.__FD__;
      const cam = app.camera;
      const back = hero.yaw + Math.PI + angle;
      cam.position.set(
        hero.pos.x + Math.sin(back) * dist,
        hero.feet + height,
        hero.pos.z + Math.cos(back) * dist,
      );
      cam.lookAt(hero.pos.x, hero.feet + 1.0, hero.pos.z);
    },
    { angle, dist, height },
  );
  await sleep(400);
  await page.screenshot({
    path: `${out}-${name}.jpg`,
    type: "jpeg",
    quality: 88,
  });
}
await browser.close();
