// Logs every sound effect, bell and audio context change from page load through the first
// seconds of play, for a New game or a Continue from a seeded save.
//   node receipts/verification-mute-start-menu/scripts/sound-probe.mjs <new|continue:<chapter>> <out.json> [url] [titleWait] [playWait]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [scenario, out, url = "http://localhost:3002/", titleWait = "8", playWait = "40"] =
  process.argv.slice(2);
const chapter = scenario.startsWith("continue:") ? scenario.split(":")[1] : null;
const ORDER = ["court", "floor", "checkpoint", "isles", "frost", "forest", "sea", "vault"];
const save = chapter && {
  reached: ORDER.slice(0, ORDER.indexOf(chapter) + 1),
  last: chapter,
  completed: false,
  campaign: 7,
  pistols: true,
  relics: [],
};
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const result = { scenario, url, errors: [] };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => result.errors.push(String(e.message)));
  await page.evaluateOnNewDocument((save) => {
    localStorage.clear();
    if (save) localStorage.setItem("far-door-progress", JSON.stringify(save));
    const log = (window.__SOUNDLOG__ = []);
    const stamp = (kind, data) => log.push({ t: +(performance.now() / 1000).toFixed(2), kind, ...data });
    for (const m of ["resume", "suspend"]) {
      const original = AudioContext.prototype[m];
      AudioContext.prototype[m] = function (...a) {
        stamp(`ctx-${m}`, { state: this.state });
        return original.apply(this, a);
      };
    }
    let fd;
    Object.defineProperty(window, "__FD__", {
      configurable: true,
      get: () => fd,
      set(value) {
        fd = value;
        const app = value.app;
        const sound = app.sound;
        for (const name of ["play", "bell", "crossDoor", "setMusic", "startMusic"]) {
          const original = sound[name].bind(sound);
          sound[name] = (...args) => {
            stamp(name, {
              args: args.map((a) => (a && typeof a === "object" ? "[object]" : a)),
              ctx: sound.ctx?.state ?? "none",
              mode: app.state.mode,
              loading: !document.querySelector("#loading")?.hidden,
              jobs: app.worlds.streaming().jobs.map((j) => `${j.id}:${j.phase}`).join(" "),
              where: new Error().stack
                .split("\n")
                .slice(2, 7)
                .map((line) => line.trim().replace(/^at /, "").replace(location.origin, ""))
                .join(" < "),
            });
            return original(...args);
          };
        }
      },
    });
  }, save);
  const t0 = Date.now();
  await page.goto(`${url}?debug&nolock=1`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction("window.__READY__ === true", { timeout: 180000 });
  result.ready = (Date.now() - t0) / 1000;
  await new Promise((r) => setTimeout(r, Number(titleWait) * 1000));
  result.clickAt = await page.evaluate(() => +(performance.now() / 1000).toFixed(2));
  await page.click(chapter ? 'button[data-action="continue"]' : "#startb");
  const clicked = Date.now();
  await page.waitForFunction(
    () => window.__FD__?.app.state.mode === "play" && document.querySelector("#loading")?.hidden,
    { timeout: 240000, polling: 250 },
  );
  result.playAfterClick = (Date.now() - clicked) / 1000;
  result.playAt = await page.evaluate(() => +(performance.now() / 1000).toFixed(2));
  await new Promise((r) => setTimeout(r, Number(playWait) * 1000));
  result.residency = await page.evaluate(() => window.__FD__.app.worlds.telemetry().residency);
  result.log = await page.evaluate(() => window.__SOUNDLOG__);
} finally {
  await browser.close();
  await writeFile(out, JSON.stringify(result, null, 2) + "\n");
  const bells = (result.log || []).filter((e) => e.kind === "bell");
  const phase = (e) => (e.t < result.clickAt ? "title" : e.t < result.playAt ? "loading" : "play");
  const count = {};
  for (const e of (result.log || []).filter((e) => e.kind === "play"))
    count[`${phase(e)}:${e.args[0]}`] = (count[`${phase(e)}:${e.args[0]}`] || 0) + 1;
  console.log(
    JSON.stringify({ scenario, ready: result.ready, playAfterClick: result.playAfterClick, bells: bells.length, plays: count, errors: result.errors.length }),
  );
}
