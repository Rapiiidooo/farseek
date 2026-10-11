// Measures the desktop start window on the public site with the live gate's browser setup:
// time from the New game click to playable control, then movement under a held key.
//   node start-window.mjs [url] [out.json]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const url = process.argv[2] || "https://farseek.rapidoai.dev/";
const out = process.argv[3] || new URL("start-window.json", import.meta.url);
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const result = { url, errors: [], samples: [] };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => result.errors.push(String(e.message)));
  page.on(
    "console",
    (m) => m.type() === "error" && result.errors.push(m.text()),
  );
  const t0 = Date.now();
  await page.goto(`${url}?x=${Math.random().toString(36).slice(2)}`, {
    waitUntil: "load",
    timeout: 90000,
  });
  await page.waitForFunction("window.__READY__ === true", { timeout: 120000 });
  result.ready = (Date.now() - t0) / 1000;
  await page.click("#startb");
  const clicked = Date.now();
  const probe = () =>
    page.evaluate(() => ({
      mode: window.__GAME__?.mode,
      loading: !document.querySelector("#loading")?.hidden,
      text: document
        .querySelector("#loading")
        ?.textContent?.trim()
        .slice(0, 60),
      pos: window.__GAME__?.pos,
    }));
  let s = await probe();
  while (Date.now() - clicked < 60000 && (s.mode !== "play" || s.loading)) {
    result.samples.push({ t: (Date.now() - clicked) / 1000, ...s });
    await new Promise((r) => setTimeout(r, 250));
    s = await probe();
  }
  result.playAfterClick = (Date.now() - clicked) / 1000;
  const before = (await probe()).pos;
  await page.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 4000));
  await page.keyboard.up("KeyW");
  const after = (await probe()).pos;
  result.movedWithoutSkip = Math.hypot(
    after[0] - before[0],
    after[1] - before[1],
  );
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 800));
  const start = (await probe()).pos;
  await page.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 4000));
  await page.keyboard.up("KeyW");
  const end = (await probe()).pos;
  result.movedAfterSkip = Math.hypot(end[0] - start[0], end[1] - start[1]);
  await page.screenshot({
    path: process.argv[3]
      ? process.argv[3].replace(/\.json$/, ".png")
      : new URL("start-window.png", import.meta.url).pathname,
  });
} finally {
  await browser.close();
  await writeFile(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ ...result, samples: result.samples.length }));
}
