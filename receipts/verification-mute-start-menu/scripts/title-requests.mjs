// Lists the largest requests made before the title is ready.
//   node receipts/verification-mute-start-menu/scripts/title-requests.mjs <url>
import puppeteer from "puppeteer-core";
const [url] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
const reqs = new Map();
cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type }));
cdp.on("Network.loadingFinished", (e) => reqs.has(e.requestId) && (reqs.get(e.requestId).bytes = e.encodedDataLength));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction("window.__READY__ === true", { timeout: 120000 });
const list = [...reqs.values()].filter((r) => !r.url.startsWith("data:"));
const total = list.reduce((s, r) => s + (r.bytes || 0), 0);
console.log(`${list.length} requests, ${(total / 1e6).toFixed(2)} MB before the title`);
for (const r of list.sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 14))
  console.log(`${String(Math.round((r.bytes || 0) / 1000)).padStart(6)} kB  ${r.type}  ${r.url.replace(/^https?:\/\/[^/]+/, "")}`);
await browser.close();
