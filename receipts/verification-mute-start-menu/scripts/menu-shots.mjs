// Screenshots of the title and pause menus in one language and viewport, with a save at the vault
// and three relics found, and a list of menu lines that wrap or overflow.
//   node receipts/verification-mute-start-menu/scripts/menu-shots.mjs <outDir> <lang> <desktop|phone> [url]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
const [out, lang, kind, base = "http://localhost:3002/"] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const phone = kind === "phone";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 720 });
await page.evaluateOnNewDocument(() => {
  if (sessionStorage.getItem("seeded")) return;
  localStorage.clear();
  localStorage.setItem("far-door-progress", JSON.stringify({ reached: ["court", "floor", "checkpoint", "isles", "frost", "forest", "sea", "vault"], last: "vault", campaign: 7, pistols: true, relics: ["radio", "scarf", "lantern"] }));
  sessionStorage.setItem("seeded", "1");
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wraps = () => page.evaluate(() => {
  const found = [];
  const panel = document.querySelector("#menu .panel:not([hidden])");
  if (panel && panel.scrollHeight > panel.clientHeight + 2) found.push({ panelScrolls: panel.scrollHeight - panel.clientHeight });
  if (panel && panel.scrollWidth > panel.clientWidth + 1) found.push({ panelScrollsSideways: panel.scrollWidth - panel.clientWidth });
  for (const el of document.querySelectorAll("#menu .panel:not([hidden]) :is(button, .panel-title, .kicker, .level-card h3, .settings .row > span, .label, .detail)")) {
    if (!el.getClientRects().length) continue;
    const tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width > 1) tops.push(r.top);
    }
    const lineHeight = parseFloat(getComputedStyle(el).fontSize) * 0.8;
    const lines = tops.length ? 1 + tops.sort((a, b) => a - b).filter((t, i, all) => i && t - all[i - 1] > lineHeight).length : 0;
    const truncated = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible";
    if (lines > 1 || truncated) found.push({ text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 60), lines, truncated, font: getComputedStyle(el).fontSize });
  }
  return found;
});
const result = {};
await page.goto(`${base}?nolock=1&lang=${lang}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__READY__ === true, { timeout: 90000 });
await sleep(1200);
await page.screenshot({ path: `${out}/${lang}-${kind}-title.png` });
result.title = await wraps();
await page.evaluate(() => document.querySelector('#menu [data-action="settings"]').click());
await sleep(500);
await page.screenshot({ path: `${out}/${lang}-${kind}-settings.png` });
result.settings = await wraps();
await page.keyboard.press("Escape");
await sleep(300);
await page.evaluate(() => document.querySelector('#menu [data-action="levels"]').click());
await sleep(500);
await page.screenshot({ path: `${out}/${lang}-${kind}-levels.png` });
result.levels = await wraps();
await page.keyboard.press("Escape");
await sleep(300);
await page.evaluate(() => document.querySelector('#menu [data-action="continue"]').click());
await page.waitForFunction(() => window.__GAME__?.mode === "play" && document.querySelector("#loading")?.hidden, { timeout: 120000 });
await sleep(1500);
await page.keyboard.press("Escape");
await sleep(800);
await page.screenshot({ path: `${out}/${lang}-${kind}-pause.png` });
result.pause = await wraps();
await writeFile(`${out}/${lang}-${kind}.json`, JSON.stringify(result, null, 2) + "\n");
console.log(lang, kind, JSON.stringify(result));
await browser.close();
