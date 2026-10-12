// Frames of Nyra leaping onto the frozen reach's scarred fall with Mira's axes, one simulation
// frame at a time, seen from the side.
//   node catch-wall.mjs <outDir> [url]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3002/"] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const log = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  await page.goto(`${base}?nolock=1&debug=1&chapter=frost`, {
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
    i < 5 && (await page.evaluate(() => window.__GAME__.cinematic));
    i++
  ) {
    await page.keyboard.press("Enter");
    await sleep(700);
  }
  await page.evaluate(async () => {
    const { iceAxes } = await import("/ice-axes.js");
    iceAxes.taken = true;
    const { hero, app } = __FD__;
    hero.axes = true;
    hero.spawn(0.6, -47.6, 0, Math.PI);
    app.follow.snap(hero);
  });
  await sleep(1200);
  const frame = () =>
    page.evaluate(
      () =>
        new Promise((done) => {
          __FD__.app.state.paused = false;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              __FD__.app.state.paused = true;
              const h = __FD__.hero;
              done({
                state: h.state,
                feet: +h.feet.toFixed(3),
                z: +h.pos.z.toFixed(2),
              });
            }),
          );
        }),
    );
  await page.evaluate(() => (__FD__.app.state.paused = true));
  await page.keyboard.down("KeyW");
  for (let i = 0; i < 10; i++) await frame();
  await page.keyboard.down("Space");
  let wallAt = null;
  for (let i = 0; i < 60; i++) {
    const s = await frame();
    if (i === 2) await page.keyboard.up("Space");
    if (s.state === "wall" && wallAt === null) wallAt = i;
    await page.evaluate(() => {
      const { camera } = __FD__.app;
      camera.position.set(3.4, 2.2, -47.2);
      camera.lookAt(0.6, 1.6, -49.6);
    });
    await page.screenshot({
      path: `${out}/wall-${String(i).padStart(3, "0")}.jpg`,
      type: "jpeg",
      quality: 80,
    });
    log.push({ i, ...s });
  }
  await page.keyboard.up("KeyW");
  log.push({ wallAt });
} finally {
  await writeFile(`${out}/wall.json`, JSON.stringify(log, null, 1));
  await browser.close();
}
