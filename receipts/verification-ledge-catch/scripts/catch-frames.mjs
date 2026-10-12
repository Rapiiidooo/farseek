// Frames of Nyra catching a ledge, one simulation frame at a time: the jump across the court's
// chasm to the crack, and the drop to hang from the west platform's edge. The game is paused
// between frames, so each picture is one frame of play whatever the machine's speed.
//   node catch-frames.mjs <outDir> [url] [side|follow]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3002/", view = "side"] =
  process.argv.slice(2);
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
  await page.goto(`${base}?nolock=1&debug=1&chapter=court`, {
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
                y: +(h.vel?.y ?? 0).toFixed(2),
                x: +h.pos.x.toFixed(2),
                z: +h.pos.z.toFixed(2),
              });
            }),
          );
        }),
    );
  const side = (eye, at) =>
    page.evaluate(
      (eye, at) => {
        const { camera } = __FD__.app;
        camera.position.set(...eye);
        camera.lookAt(...at);
      },
      eye,
      at,
    );
  async function sequence(name, setup, act, eye, at, frames = 70) {
    await page.evaluate(setup);
    await sleep(900);
    await page.evaluate(() => (__FD__.app.state.paused = true));
    await act();
    let hangAt = null;
    for (let i = 0; i < frames; i++) {
      const s = await frame();
      if (s.state === "hang" && hangAt === null) hangAt = i;
      if (view === "side") await side(eye, at);
      await page.screenshot({
        path: `${out}/${name}-${String(i).padStart(3, "0")}.jpg`,
        type: "jpeg",
        quality: 80,
      });
      log.push({ name, i, ...s });
    }
    await page.evaluate(() => (__FD__.app.state.paused = false));
    return hangAt;
  }
  // The jump across the chasm to the crack, from the ledge below the west platform.
  const crack = await sequence(
    "crack",
    () => {
      const { hero, app } = __FD__;
      hero.spawn(4.5, 34.6, 5.5, Math.PI);
      app.follow.snap(hero);
    },
    async () => {
      await page.keyboard.down("KeyW");
      for (let i = 0; i < 12; i++) await frame();
      await page.keyboard.down("Space");
      await frame();
      await page.keyboard.up("Space");
    },
    [7.4, 6.6, 34.4],
    [4.5, 6.2, 32.4],
    80,
  );
  await page.keyboard.up("KeyW");
  // The drop from the west platform's edge into a hang.
  const edge = await sequence(
    "edge",
    () => {
      const { hero, app } = __FD__;
      hero.spawn(4, 36.6, 8, Math.PI);
      app.follow.snap(hero);
    },
    async () => {
      await page.keyboard.press("KeyC");
    },
    [7.6, 8.4, 35.6],
    [4, 7.2, 35.6],
    70,
  );
  log.push({ crackHangFrame: crack, edgeHangFrame: edge });
} finally {
  await writeFile(`${out}/frames.json`, JSON.stringify(log, null, 1));
  await browser.close();
}
