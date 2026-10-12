// Counts the requests, bytes and time from opening the page to the title, then from New game to
// play, for a first visit and a return visit in the same browser profile.
//   node receipts/verification-mute-start-menu/scripts/network-probe.mjs <url> <out.json>
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [url, out] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const visits = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  let phase = "page";
  const requests = new Map();
  cdp.on("Network.requestWillBeSent", (e) =>
    requests.set(e.requestId, { url: e.request.url, type: e.type, phase, start: e.timestamp }),
  );
  cdp.on("Network.responseReceived", (e) => {
    const r = requests.get(e.requestId);
    if (r) Object.assign(r, { status: e.response.status, protocol: e.response.protocol, cached: e.response.fromDiskCache || e.response.fromMemoryCache });
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = requests.get(e.requestId);
    if (r) Object.assign(r, { bytes: e.encodedDataLength, end: e.timestamp });
  });
  for (const visit of ["first", "return"]) {
    requests.clear();
    phase = "page";
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction("window.__READY__ === true", { timeout: 180000, polling: 100 });
    const ready = (Date.now() - t0) / 1000;
    phase = "start";
    await page.click("#startb");
    const clicked = Date.now();
    await page.waitForFunction(
      () => window.__GAME__?.mode === "play" && document.querySelector("#loading")?.hidden,
      { timeout: 240000, polling: 100 },
    );
    const play = (Date.now() - clicked) / 1000;
    const summary = { visit, ready, playAfterClick: play, phases: {} };
    for (const p of ["page", "start"]) {
      const list = [...requests.values()].filter((r) => r.phase === p && !r.url.startsWith("data:"));
      const byType = {};
      for (const r of list) {
        const k = r.type || "Other";
        byType[k] ??= { requests: 0, kB: 0 };
        byType[k].requests++;
        byType[k].kB += (r.bytes || 0) / 1000;
      }
      for (const v of Object.values(byType)) v.kB = Math.round(v.kB);
      summary.phases[p] = {
        requests: list.length,
        MB: +(list.reduce((s, r) => s + (r.bytes || 0), 0) / 1e6).toFixed(2),
        notModified: list.filter((r) => r.status === 304).length,
        fromCache: list.filter((r) => r.cached).length,
        protocols: [...new Set(list.map((r) => r.protocol).filter(Boolean))],
        byType,
      };
    }
    visits.push(summary);
    console.log(JSON.stringify(summary));
  }
} finally {
  await browser.close();
  await writeFile(out, JSON.stringify({ url, visits }, null, 2) + "\n");
}
