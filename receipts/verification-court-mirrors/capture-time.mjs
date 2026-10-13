// Time the court's mirror captures take, as the preparation runs them, per quality tier.
//   node receipts/verification-court-mirrors/capture-time.mjs [url] [out.json]
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://localhost:3009";
const out =
  process.argv[3] || new URL("capture-time.json", import.meta.url).pathname;
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const result = { base, tiers: {} };
try {
  for (const quality of ["high", "balanced", "fast"]) {
    const page = await browser.newPage();
    page.setDefaultTimeout(240000);
    await page.setViewport({ width: 1280, height: 720 });
    await page.evaluateOnNewDocument((q) => {
      localStorage.removeItem("far-door-progress");
      localStorage.setItem(
        "far-door-settings",
        JSON.stringify({ quality: q, shake: false }),
      );
    }, quality);
    // A start by address settles every world's preparation, which would otherwise compile meanwhile.
    await page.goto(`${base}/?chapter=floor&debug=1&nolock=1`, {
      waitUntil: "load",
    });
    await page.waitForFunction(
      () => window.__READY__ && __FD__.worlds.pending.size === 0,
    );
    result.tiers[quality] = await page.evaluate(async () => {
      const { worlds, renderer, app } = __FD__;
      const court = worlds.get("court");
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      // Reading a pixel back waits for the GPU to finish the captures.
      const finish = () =>
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const programs = renderer.info.programs.length;
      const times = [];
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        finish();
        const start = performance.now();
        await court.mirrors.capture({
          csm: app.rig.csm,
          hide: [app.heroModel, court.gate.disc],
        });
        finish();
        times.push(+(performance.now() - start).toFixed(1));
      }
      return {
        times,
        size: court.mirrors.entries[0].cube.width,
        programsBefore: programs,
        programsAfter: renderer.info.programs.length,
      };
    });
    console.log(quality, JSON.stringify(result.tiers[quality]));
    await page.close();
  }
} finally {
  await writeFile(out, JSON.stringify(result, null, 2) + "\n");
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
