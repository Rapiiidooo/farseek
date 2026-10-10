// Measures frame hitches around world crossings with real keyboard input.
//   node scripts/nightly/hitch.mjs [--url=http://localhost:3002] [--back] [--out=dir]
//     [--quality=fast|balanced|high] [--start=floor] [--route=two,three] [--nosettle]
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.length ? rest.join("=") : true];
  }),
);
const out = args.out || new URL("./hitch-out/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: args.headed ? false : true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const errors = [];
const result = { crossings: [], idle: [] };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on("pageerror", (e) => errors.push(e.stack));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  if (args.quality)
    await page.evaluateOnNewDocument((q) => {
      try {
        const s = JSON.parse(localStorage.getItem("far-door-settings") || "{}");
        s.quality = q;
        localStorage.setItem("far-door-settings", JSON.stringify(s));
      } catch {}
    }, args.quality);
  if (args.coarse)
    await page.evaluateOnNewDocument(() => {
      const native = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        /pointer:\s*coarse/.test(q)
          ? {
              matches: true,
              media: q,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
            }
          : native(q);
    });
  await page.evaluateOnNewDocument(() => {
    window.__FRAMES__ = [];
    window.__LONG__ = [];
    let last = 0;
    const tick = (now) => {
      if (last) window.__FRAMES__.push([now, now - last]);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__CALLBACKS__ = [];
    const nativeRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      nativeRAF((now) => {
        const a = performance.now();
        cb(now);
        const d = performance.now() - a;
        if (d > 20)
          window.__CALLBACKS__.push([
            a,
            d,
            window.__GAME__?.where,
            window.__FD__?.renderer?.info.programs.length,
          ]);
      });
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          window.__LONG__.push([e.startTime, e.duration]);
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  });
  const t0 = Date.now();
  await page.goto(
    `${(args.url || process.env.FARSEEK_BASE || "http://localhost:3002").replace(/\/$/, "")}/?lab=1&level=${args.start || "floor"}&nolock=1&debug=1`,
    { waitUntil: "load" },
  );
  await page.waitForFunction(
    () => window.__READY__ && document.querySelector("#loading").hidden,
    { timeout: 180000 },
  );
  result.readyMs = Date.now() - t0;
  const settle = async (label) => {
    // Wait for background jobs to finish, then sample idle frames.
    const began = await page.evaluate(() => performance.now());
    await page.waitForFunction(
      () =>
        window.__FD__.worlds.pending.size === 0 &&
        window.__FD__.worlds.jobs.size === 0,
      { timeout: 240000, polling: 250 },
    );
    const ended = await page.evaluate(() => performance.now());
    const stats = await page.evaluate(
      (a, b) => {
        const frames = window.__FRAMES__.filter(([t]) => t >= a && t <= b);
        const long = window.__LONG__.filter(([t]) => t >= a && t <= b);
        const d = frames.map(([, d]) => d).sort((x, y) => x - y);
        return {
          ms: b - a,
          frames: d.length,
          p50: d[Math.floor(d.length * 0.5)],
          p95: d[Math.floor(d.length * 0.95)],
          max: d.at(-1),
          over50: d.filter((x) => x > 50).length,
          over100: d.filter((x) => x > 100).length,
          longTasks: long.length,
          longest: long
            .map(([, d]) => d)
            .sort((x, y) => y - x)
            .slice(0, 8),
          resident: window.__GAME__.worlds,
        };
      },
      began,
      ended,
    );
    result.idle.push({ label, ...stats });
    console.log("SETTLE", label, JSON.stringify(stats));
  };
  await settle("start");
  const cross = async (to, back = false) => {
    const start = await page.evaluate((back) => {
      const { worlds, hero, follow } = window.__FD__;
      const source = worlds.current;
      const state = source.services.state;
      state.cinematic?.skip?.();
      state.cinematic = state.intro = null;
      if (!back) source.solve();
      const center = back ? source.gateCenter : source.exit.center;
      const floor = back ? source.daisTop : source.exit.daisTop;
      hero.spawn(
        center.x,
        center.z + (back ? -0.55 : 0.55),
        floor + 0.02,
        back ? 0 : Math.PI,
      );
      if (back) source.lastZ = hero.pos.z;
      else source.exit.lastZ = hero.pos.z;
      follow.snap(hero);
      return { where: state.where, at: performance.now() };
    }, back);
    await page.keyboard.down("w");
    try {
      await page.waitForFunction(
        (to) => window.__GAME__.where === to,
        { timeout: 60000 },
        to,
      );
    } finally {
      await page.keyboard.up("w");
    }
    const enteredAt = await page.evaluate(() => performance.now());
    await new Promise((r) => setTimeout(r, 4000));
    const stats = await page.evaluate(
      (a, b) => {
        const frames = window.__FRAMES__.filter(([t]) => t >= a && t <= b);
        const long = window.__LONG__.filter(([t]) => t >= a && t <= b);
        return {
          worst: frames
            .map(([t, d]) => [Math.round(t - a), Math.round(d)])
            .sort((x, y) => y[1] - x[1])
            .slice(0, 10),
          over50: frames.filter(([, d]) => d > 50).length,
          over100: frames.filter(([, d]) => d > 100).length,
          long: long.map(([t, d]) => [Math.round(t - a), Math.round(d)]),
          callbacks: window.__CALLBACKS__
            .filter(([t]) => t >= a && t <= b)
            .map(([t, d, w, p]) => [Math.round(t - a), Math.round(d), w, p]),
          programs: window.__GAME__.programs,
        };
      },
      start.at,
      enteredAt + 4000,
    );
    const rec = {
      from: start.where,
      to,
      back,
      enterMs: enteredAt - start.at,
      ...stats,
    };
    result.crossings.push(rec);
    console.log("CROSS", JSON.stringify(rec));
    await page.screenshot({
      path: `${out}/${result.crossings.length}-${to}.png`,
    });
  };
  const order =
    args.route === "none"
      ? []
      : (args.route || "two,three,four,five,six").split(",");
  for (const to of order) {
    await cross(to);
    if (!args.nosettle) await settle(`after-${to}`);
  }
  if (args.back)
    for (const to of args.back === true
      ? ["five", "four", "three", "two", "court"]
      : args.back.split(",")) {
      await cross(to, true);
      if (!args.nosettle) await settle(`back-${to}`);
    }
} finally {
  result.errors = errors;
  await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
  console.log("ERRORS", errors.length, errors.slice(0, 5).join("\n"));
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
if (errors.length) process.exitCode = 1;
