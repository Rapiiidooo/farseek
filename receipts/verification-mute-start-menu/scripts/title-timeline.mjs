// Prints the requests before the title under emulated latency, by start time, to find serial chains.
//   node receipts/verification-mute-start-menu/scripts/title-timeline.mjs <url> <latencyMs>
import puppeteer from "puppeteer-core";
const [url, latency = "300"] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: Number(latency), downloadThroughput: -1, uploadThroughput: -1 });
const reqs = new Map();
let t0 = null;
cdp.on("Network.requestWillBeSent", (e) => { t0 ??= e.timestamp; reqs.set(e.requestId, { url: new URL(e.request.url).pathname, start: e.timestamp - t0, type: e.type }); });
cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) r.end = e.timestamp - t0; });
await page.goto(url, { waitUntil: "load", timeout: 120000 });
await page.waitForFunction("window.__READY__ === true", { timeout: 180000 });
const ready = await page.evaluate(() => performance.now() / 1000);
const list = [...reqs.values()].filter((r) => !r.url.startsWith("data:")).sort((a, b) => a.start - b.start);
// Group requests into waves: a wave starts when a request begins after every earlier one ended.
let waves = [], wave = null, lastEnd = -1;
for (const r of list) {
  if (!wave || r.start > lastEnd) { wave = { start: r.start, items: [] }; waves.push(wave); }
  wave.items.push(r);
  lastEnd = Math.max(lastEnd, r.end ?? r.start);
}
console.log(`ready ${ready.toFixed(1)} s, ${list.length} requests, ${waves.length} serial waves`);
for (const w of waves) console.log(`${w.start.toFixed(2).padStart(6)} s  ${String(w.items.length).padStart(3)}  ${w.items.slice(0, 4).map((r) => r.url.replace(/^\//, "")).join(", ")}${w.items.length > 4 ? ", …" : ""}`);
await browser.close();
