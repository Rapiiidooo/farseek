// Starts the court on a phone viewport in each language, taps once so the touch controls show,
// and saves the screen, to check that the button labels fit their circles.
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
const out = new URL("./screens/touch/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
for (const lang of (process.argv[2] || "en,fr,es,zh,hi").split(",")) {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:3012/?nolock=1&lang=${lang}&chapter=checkpoint`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__READY__ === true && window.__GAME__?.mode === "play", { timeout: 120000 });
    await page.touchscreen.tap(206, 300);
    await new Promise((r) => setTimeout(r, 2500));
    await page.touchscreen.tap(206, 300);
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${out}${lang}.png` });
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll("[data-touch]")].filter((b) => b.offsetParent).map((b) => {
        const r = b.getBoundingClientRect();
        return { label: b.textContent.trim(), width: Math.round(r.width), overflow: b.scrollWidth > b.clientWidth + 1 };
      }),
    );
    console.log(lang, JSON.stringify(labels));
  } finally {
    await browser.close();
  }
}
