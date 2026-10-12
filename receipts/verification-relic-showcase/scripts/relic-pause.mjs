// The Relics screen from the pause menu in play: the stage replaces the world and the HUD, and
// Back returns to the paused world. Also times the stage's first build from the title.
//   node relic-pause.mjs <outDir> [url]
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
const errors = [];
const log = [];
const check = (name, ok, detail = "") => {
  log.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem(
      "far-door-progress",
      JSON.stringify({
        reached: ["court", "floor"],
        last: "floor",
        relics: ["papyrus", "sun-memory"],
      }),
    );
  });
  const sep = base.includes("?") ? "&" : "?";
  await page.goto(`${base}${sep}nolock=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  await sleep(1000);
  const t0 = Date.now();
  await page.click('#menu [data-screen="main"] [data-action="relics"]');
  await page.waitForFunction(
    () => document.querySelector("#menu").dataset.stage === "",
    { timeout: 60000 },
  );
  check("the stage is ready after its first build", true, {
    ms: Date.now() - t0,
  });
  await page.keyboard.press("Escape");
  await sleep(500);
  const t1 = Date.now();
  await page.click('#menu [data-screen="main"] [data-action="relics"]');
  await page.waitForFunction(
    () => document.querySelector("#menu").dataset.stage === "",
    { timeout: 60000 },
  );
  check("a second opening is ready at once", Date.now() - t1 < 400, {
    ms: Date.now() - t1,
  });
  await page.keyboard.press("Escape");
  await sleep(500);
  await page.click('#menu [data-screen="main"] [data-action="continue"]');
  await page.waitForFunction(() => window.__GAME__?.mode === "play", {
    timeout: 120000,
  });
  await sleep(3000);
  await page.keyboard.press("Escape");
  await sleep(700);
  await page.click('#menu [data-screen="pause"] [data-action="relics"]');
  await sleep(1500);
  const inPause = await page.evaluate(() => ({
    screen: document.querySelector("#menu").dataset.screen,
    hud: getComputedStyle(document.querySelector("#hud")).visibility,
    paused: window.__GAME__.paused,
  }));
  await page.screenshot({
    path: `${out}/pause-relics.jpg`,
    type: "jpeg",
    quality: 82,
  });
  check(
    "from the pause menu the stage shows without the HUD",
    inPause.screen === "relics" && inPause.hud === "hidden" && inPause.paused,
    inPause,
  );
  await page.keyboard.press("Escape");
  await sleep(900);
  const back = await page.evaluate(() => ({
    screen: document.querySelector("#menu").dataset.screen,
    hud: getComputedStyle(document.querySelector("#hud")).visibility,
  }));
  await page.screenshot({
    path: `${out}/pause-back.jpg`,
    type: "jpeg",
    quality: 82,
  });
  check(
    "Back returns to the paused world with its HUD",
    back.screen === "pause" && back.hud === "visible",
    back,
  );
  await page.click('#menu [data-screen="pause"] [data-action="resume"]');
  await sleep(1500);
  const play = await page.evaluate(() => ({
    mode: window.__GAME__.mode,
    paused: window.__GAME__.paused,
  }));
  check("play resumes", play.mode === "play" && !play.paused, play);
  check("no page errors", errors.length === 0, errors);
} catch (error) {
  errors.push(String(error?.stack || error));
  check("ran to the end", false, String(error));
} finally {
  await writeFile(
    `${out}/pause.json`,
    JSON.stringify({ log, errors }, null, 1),
  );
  await browser.close();
}
