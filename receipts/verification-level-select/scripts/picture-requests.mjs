// Requests for the levels screen's world pictures: none while the title loads and waits, then one
// per world the save has reached once the screen opens, and none again on a second opening.
//   node receipts/verification-level-select/scripts/picture-requests.mjs <out.json> [url] [all|first]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [file, base = "http://localhost:3002/", save = "all"] =
  process.argv.slice(2);
const PROGRESS = {
  all: {
    reached: [
      "court",
      "floor",
      "checkpoint",
      "isles",
      "frost",
      "forest",
      "sea",
      "vault",
    ],
    last: "vault",
    completed: true,
    campaign: 7,
  },
  first: { reached: ["court"], last: "court" },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.evaluateOnNewDocument((progress) => {
  localStorage.setItem("far-door-progress", JSON.stringify(progress));
}, PROGRESS[save]);
const seen = [];
page.on("response", (r) => {
  if (/\/ui\/levels\//.test(r.url()))
    seen.push({
      url: new URL(r.url()).pathname,
      status: r.status(),
      bytes: Number(r.headers()["content-length"] || 0),
    });
});
await page.goto(`${base}?nolock=1`, { waitUntil: "load" });
await page.waitForFunction(() => window.__READY__ === true, {
  timeout: 90000,
});
await sleep(4000);
const title = seen.length;
const open = () =>
  page.evaluate(() =>
    document.querySelector('#menu [data-action="levels"]').click(),
  );
await open();
await sleep(2500);
const opened = seen.length;
await page.keyboard.press("Escape");
await sleep(500);
await open();
await sleep(1500);
const result = {
  save,
  onTitle: seen.slice(0, title),
  onOpening: seen.slice(title, opened),
  onSecondOpening: seen.slice(opened),
};
await writeFile(file, JSON.stringify(result, null, 2) + "\n");
console.log(
  `${save}: ${result.onTitle.length} on the title, ${result.onOpening.length} on opening (${result.onOpening.reduce((n, r) => n + r.bytes, 0)} bytes), ${result.onSecondOpening.length} on a second opening`,
);
await browser.close();
