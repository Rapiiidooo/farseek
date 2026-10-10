// Films the loading screen through the compositor (CDP screencast), so frames keep coming while
// the page's main thread is blocked, and reads the bar's drawn fraction from each frame's pixels.
//   node outputs/loading/screencast.mjs <name> [--url=http://localhost:3012/] [--phone]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const name = process.argv[2] || "cast";
const arg = (k, d) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg("url", "http://localhost:3012/");
const phone = process.argv.includes("--phone");
const out = new URL(`./${name}/`, import.meta.url).pathname;
await mkdir(out + "frames", { recursive: true });

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const frames = [];
try {
  const page = await browser.newPage();
  const viewport = phone
    ? {
        width: 412,
        height: 915,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      }
    : { width: 1280, height: 720, deviceScaleFactor: 1 };
  await page.setViewport(viewport);
  const cdp = await page.createCDPSession();
  let start = null;
  cdp.on("Page.screencastFrame", async (frame) => {
    const t = frame.metadata.timestamp;
    start ??= t;
    frames.push({ t: +(t - start).toFixed(3), data: frame.data });
    await cdp
      .send("Page.screencastFrameAck", { sessionId: frame.sessionId })
      .catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "png",
    everyNthFrame: 1,
  });
  await page.goto(`${base}?debug=1&nolock=1`, {
    waitUntil: "domcontentloaded",
  });
  const measure = () =>
    page.evaluate(() => {
      const r = document.querySelector("#loading .bar").getBoundingClientRect();
      return { x: r.left, y: r.top + r.height / 2, width: r.width };
    });
  const rects = [await measure()];
  await new Promise((r) => setTimeout(r, 500));
  rects.push(await measure());
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  await new Promise((r) => setTimeout(r, 1200));
  const marks = { newGame: frames.at(-1)?.t ?? 0 };
  await page.evaluate(() =>
    document.querySelector('button[data-action="new"]').click(),
  );
  await new Promise((r) => setTimeout(r, 300));
  rects.push(await measure());
  await new Promise((r) => setTimeout(r, 2000));
  rects.push(await measure());
  const rect = rects[1];
  await page.waitForFunction(
    () =>
      window.__GAME__?.mode === "play" &&
      document.querySelector("#loading").hidden,
    { timeout: 180000 },
  );
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send("Page.stopScreencast");
  const { PNG } = await import("./png.mjs");
  const series = [];
  for (const [i, frame] of frames.entries()) {
    const image = PNG.decode(Buffer.from(frame.data, "base64"));
    const y = Math.round(rect.y);
    let right = -1;
    for (let x = Math.round(rect.x); x < Math.round(rect.x + rect.width); x++) {
      const [r, g, b] = image.pixel(x, y);
      if ((g > 120 && b > 110 && g >= r + 30) || (g > 230 && b > 220))
        right = x;
    }
    const fraction = right < 0 ? 0 : (right + 1 - rect.x) / rect.width;
    series.push({ t: frame.t, fraction: +fraction.toFixed(3) });
    if (i % 6 === 0)
      await writeFile(
        `${out}frames/${String(i).padStart(4, "0")}.png`,
        Buffer.from(frame.data, "base64"),
      );
  }
  const gaps = [];
  for (let i = 1; i < series.length; i++)
    gaps.push(+(series[i].t - series[i - 1].t).toFixed(3));
  let still = 0;
  let since = 0;
  for (let i = 1; i < series.length; i++) {
    if (Math.abs(series[i].fraction - series[i - 1].fraction) > 0.001) {
      still = Math.max(still, series[i].t - since);
      since = series[i].t;
    }
  }
  const backward = series.filter(
    (s, i) => i && s.fraction < series[i - 1].fraction - 0.004,
  ).length;
  const summary = {
    frames: series.length,
    newGameAt: marks.newGame,
    longestFrameGap: Math.max(...gaps),
    barShiftPx: Math.max(...rects.map((r) => Math.abs(r.y - rect.y))),
    longestStill: +still.toFixed(3),
    backward,
  };
  await writeFile(
    out + "series.json",
    JSON.stringify({ summary, series }) + "\n",
  );
  console.log(JSON.stringify(summary));
} finally {
  await browser.close();
}
