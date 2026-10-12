// Times a start from the title (New game, or Continue from a seeded save), then watches the
// worlds prepared behind play and the frames longer than 50 ms during the first seconds of play.
//   node receipts/verification-mute-start-menu/scripts/start-probe.mjs <new|continue:<chapter>> <out.json> [url] [titleWait] [playSeconds]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [scenario, out, url = "http://localhost:3002/?nolock=1", titleWait = "1", playSeconds = "30"] =
  process.argv.slice(2);
const chapter = scenario.startsWith("continue:") ? scenario.split(":")[1] : null;
const ORDER = ["court", "floor", "checkpoint", "isles", "frost", "forest", "sea", "vault"];
const save = chapter && {
  reached: ORDER.slice(0, ORDER.indexOf(chapter) + 1),
  last: chapter,
  campaign: 7,
  pistols: true,
};
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const result = { scenario, url, errors: [] };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => result.errors.push(e.message));
  await page.evaluateOnNewDocument((save) => {
    localStorage.clear();
    if (save) localStorage.setItem("far-door-progress", JSON.stringify(save));
    const frames = (window.__FRAMES__ = []);
    let last = 0;
    const tick = (now) => {
      if (window.__GAME__?.mode === "play" && last) {
        frames.push(+(now - last).toFixed(1));
        if (now - last > 40) (window.__LONG__ ||= []).push({ at: +(now / 1000).toFixed(2), ms: +(now - last).toFixed(1), worlds: window.__GAME__.worlds?.pending?.join(","), cinematic: window.__GAME__.cinematic });
      }
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (window.__GAME__?.mode === "play")
          (window.__LOAF__ ||= []).push({
            at: +(e.startTime / 1000).toFixed(2),
            ms: Math.round(e.duration),
            blocking: Math.round(e.blockingDuration),
            render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
            scripts: e.scripts.map((x) => `${x.invoker} ${x.sourceFunctionName || ""} ${(x.sourceURL || "").split("/").pop()}:${x.sourceCharPosition} ${Math.round(x.duration)}ms`),
          });
    }).observe({ type: "long-animation-frame", buffered: true });
  }, save);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction("window.__READY__ === true", { timeout: 180000, polling: 100 });
  result.ready = (Date.now() - t0) / 1000;
  await new Promise((r) => setTimeout(r, Number(titleWait) * 1000));
  await page.click(chapter ? 'button[data-action="continue"]' : "#startb");
  const clicked = Date.now();
  await page.waitForFunction(
    () => window.__GAME__?.mode === "play" && document.querySelector("#loading")?.hidden,
    { timeout: 240000, polling: 50 },
  );
  result.playAfterClick = (Date.now() - clicked) / 1000;
  const playing = Date.now();
  result.samples = [];
  while (Date.now() - playing < Number(playSeconds) * 1000) {
    const w = await page.evaluate(() => {
      const t = window.__GAME__?.worlds;
      return t && { resident: t.resident.length, loaded: t.loaded.length, pending: t.pending };
    });
    result.samples.push({ t: (Date.now() - playing) / 1000, ...w });
    if (result.preparedAfter === undefined && w && !w.pending.length && w.loaded === 7)
      result.preparedAfter = (Date.now() - playing) / 1000;
    await new Promise((r) => setTimeout(r, 500));
  }
  const frames = await page.evaluate(() => window.__FRAMES__);
  result.frames = {
    count: frames.length,
    over50: frames.filter((f) => f > 50).length,
    over100: frames.filter((f) => f > 100).length,
    max: Math.max(...frames),
    worst: [...frames].sort((a, b) => b - a).slice(0, 8),
  };
  result.where = await page.evaluate(() => window.__GAME__?.where);
  result.long = await page.evaluate(() => window.__LONG__ || []);
  result.loaf = await page.evaluate(() => window.__LOAF__ || []);
} finally {
  await browser.close();
  await writeFile(out, JSON.stringify(result, null, 2) + "\n");
  const { samples, ...brief } = result;
  console.log(JSON.stringify(brief));
}
