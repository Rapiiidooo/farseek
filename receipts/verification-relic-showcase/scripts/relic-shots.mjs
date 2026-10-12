// Frames of the Relics screen's stage: a save with some relics found, the arc turned with keys,
// the inspect view, and a phone. Also reports page errors and the stage's own telemetry.
//   node relic-shots.mjs <outDir> [url] [lang] [desktop|phone]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3002/", lang = "en", device = "desktop"] =
  process.argv.slice(2);
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FOUND = [
  "papyrus",
  "radio",
  "page",
  "lantern",
  "sun-memory",
  "transit-file",
  "camp-drill",
];
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const errors = [];
const log = [];
try {
  const page = await browser.newPage();
  if (device === "phone")
    await page.emulate({
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
  else await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.evaluateOnNewDocument((found) => {
    localStorage.clear();
    localStorage.setItem(
      "far-door-progress",
      JSON.stringify({
        reached: ["court", "floor", "checkpoint", "isles"],
        last: "isles",
        relics: found,
      }),
    );
  }, FOUND);
  const sep = base.includes("?") ? "&" : "?";
  await page.goto(`${base}${sep}nolock=1&lang=${lang}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  await sleep(800);
  const shot = async (name) => {
    await page.screenshot({
      path: `${out}/${name}.jpg`,
      type: "jpeg",
      quality: 82,
    });
    const state = await page.evaluate(() => ({
      screen: document.querySelector("#menu").dataset.screen,
      stage: document.querySelector("#menu").dataset.stage ?? null,
      name: document.querySelector("#relic-name")?.textContent,
      world: document.querySelector("#relic-world")?.textContent,
      read: !document.querySelector("#relic-read")?.disabled,
      focus:
        document
          .querySelector("#menu .panel:not([hidden]) .focus")
          ?.textContent?.trim() ?? null,
      wrapped: [
        ...document.querySelectorAll(
          "#menu .panel:not([hidden]) .panel-title, .relic-caption h3",
        ),
      ]
        .filter((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    }));
    log.push({ name, ...state });
    console.log(name, JSON.stringify(state));
  };
  if (device === "phone")
    await page.tap('#menu [data-screen="main"] [data-action="relics"]');
  else await page.click('#menu [data-screen="main"] [data-action="relics"]');
  await page.waitForFunction(
    () => document.querySelector("#menu").dataset.stage === "",
    { timeout: 60000 },
  );
  await sleep(1500);
  await shot(`${device}-${lang}-1-open`);
  await page.keyboard.press("ArrowRight");
  await sleep(1200);
  await shot(`${device}-${lang}-2-right`);
  await page.keyboard.press("ArrowRight");
  await sleep(1200);
  await shot(`${device}-${lang}-3-right`);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await sleep(1400);
  await shot(`${device}-${lang}-4-left`);
  // The chosen relic, tapped in the middle of the stage.
  const focus = await page.$eval("#relic-focus", (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  for (let k = 0; k < 13; k++) {
    const ok = await page.evaluate(
      () => !document.querySelector("#relic-read").disabled,
    );
    if (ok) break;
    await page.keyboard.press("ArrowRight");
    await sleep(500);
  }
  await sleep(900);
  if (device === "phone") await page.touchscreen.tap(focus.x, focus.y);
  else await page.mouse.click(focus.x, focus.y);
  await sleep(1600);
  await shot(`${device}-${lang}-5-inspect`);
  const fig = await page.$eval("#relic-figure", (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.move(fig.x, fig.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++)
    await page.mouse.move(fig.x + k * 14, fig.y, { steps: 2 });
  await page.mouse.up();
  await sleep(600);
  await shot(`${device}-${lang}-6-turned`);
  await page.keyboard.press("Escape");
  await sleep(1200);
  await shot(`${device}-${lang}-7-back`);
  // A drag across the stage turns the arc.
  await page.mouse.move(focus.x + 200, focus.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++)
    await page.mouse.move(focus.x + 200 - k * 30, focus.y, { steps: 2 });
  await page.mouse.up();
  await sleep(1400);
  await shot(`${device}-${lang}-8-dragged`);
  await page.keyboard.press("Escape");
  await sleep(800);
  await shot(`${device}-${lang}-9-title`);
} catch (error) {
  errors.push(String(error?.stack || error));
} finally {
  await writeFile(
    `${out}/${device}-${lang}.json`,
    JSON.stringify({ log, errors }, null, 1),
  );
  if (errors.length) console.log("errors", errors);
  await browser.close();
}
