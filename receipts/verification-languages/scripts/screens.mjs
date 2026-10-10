// Captures the screens that carry most text, in each language, for a visual review of
// overflow, wrapping and fonts. One browser at a time.
//   node outputs/i18n/screens.mjs [en,fr,es,zh,hi] [--phone]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const languages = (process.argv[2] || "en,fr,es,zh,hi").split(",");
const phone = process.argv.includes("--phone");
const base = "http://localhost:3012/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {};
for (const lang of languages) {
  const out = new URL(`./screens/${phone ? "phone" : "desktop"}/${lang}/`, import.meta.url).pathname;
  await mkdir(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  const errors = [];
  const shots = [];
  try {
    const page = await browser.newPage();
    await page.setViewport(
      phone
        ? { width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
        : { width: 1280, height: 720 },
    );
    page.on("pageerror", (e) => errors.push(String(e.message)));
    page.on(
      "console",
      (m) => m.type() === "error" && !/404/.test(m.text()) && errors.push(m.text()),
    );
    const shot = async (name) => {
      await sleep(350);
      await page.screenshot({ path: `${out}${name}.png` });
      shots.push(name);
    };
    const click = (selector) =>
      page.evaluate((s) => document.querySelector(s)?.click(), selector);
    const back = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#menu [data-action="back"]')]
          .find((b) => b.offsetParent)
          ?.click(),
      );
    await page.goto(`${base}?nolock=1&debug=1&lang=${lang}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__READY__ === true, { timeout: 90000 });
    await sleep(1500);
    await shot("01-title");
    await click('#menu [data-action="settings"]');
    await shot("02-settings");
    await page.evaluate(() => {
      const panel = document.querySelector('[data-screen="settings"]');
      panel.scrollTop = panel.scrollHeight;
    });
    await shot("03-settings-end");
    await click('#menu [data-screen="settings"] [data-action="controls"]');
    await shot("04-controls");
    await back();
    await back();
    await click('#menu [data-action="levels"]');
    await shot("05-levels");
    await back();
    await click('#menu [data-action="relics"]');
    await shot("06-relics");
    await back();
    await click('#menu [data-action="credits"]');
    await sleep(2500);
    await shot("07-credits");
    await page.keyboard.press("Escape");
    await sleep(800);
    await click('#menu [data-action="new"]');
    await sleep(900);
    await shot("08-loading");
    await page.waitForFunction(
      () =>
        window.__GAME__?.mode === "play" &&
        document.querySelector("#loading").hidden,
      { timeout: 120000 },
    );
    await sleep(600);
    await page.keyboard.press("Enter");
    await sleep(3500);
    await shot("09-play");
    await page.evaluate(() => window.__FD__.app.ui.openNotes("first"));
    await shot("10-notes");
    await page.evaluate(() => window.__FD__.app.ui.closeNotes());
    await sleep(500);
    await page.evaluate(() => window.__FD__.app.hud.pistolsHint());
    await shot("11-hint");
    await page.evaluate(() => window.__FD__.app.ui.pause(true));
    await shot("12-pause");
    report[lang] = { shots, errors };
  } catch (error) {
    report[lang] = { shots, errors, failure: String(error.stack || error) };
  } finally {
    await browser.close();
  }
  console.log(lang, JSON.stringify(report[lang]).slice(0, 300));
}
await writeFile(
  new URL(`./screens/${phone ? "phone" : "desktop"}/report.json`, import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
