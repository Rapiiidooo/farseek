import puppeteer from "puppeteer-core";
import path from "node:path";
// node outputs/voice-l10n/page-check.mjs <shot.png> [page.html] [width]
const [shot, page = "outputs/voice-l10n/fr-accents.html", width = "1100"] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const tab = await browser.newPage();
  await tab.setViewport({ width: Number(width), height: 900 });
  await tab.goto(`file://${path.resolve(page)}`, { waitUntil: "load" });
  const durations = await tab.evaluate(async () => {
    const all = [...document.querySelectorAll("audio")];
    await Promise.all(all.map((a) => new Promise((done) => { a.preload = "metadata"; a.onloadedmetadata = done; a.onerror = done; a.load(); })));
    return all.map((a) => (Number.isFinite(a.duration) ? a.duration : -1));
  });
  const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(durations.length, "players,", durations.filter((d) => d > 0).length, "loaded, horizontal overflow", overflow);
  await tab.screenshot({ path: shot });
} finally {
  await browser.close();
}
