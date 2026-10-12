// Drives Nyra's body sound with a scripted day on its own clock (5 s walking, 20 s running, 8 s
// standing, 12 s climbing, 5 s standing) and logs every breath it plays: when, which, how loud.
//   node breath-probe.mjs <out.json> [url]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3002/"] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(`${base}${base.includes("?") ? "&" : "?"}nolock=1&debug`, {
    waitUntil: "load",
  });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  await sleep(800);
  const result = await page.evaluate(async () => {
    const s = window.__FD__.app.sound;
    await s.ctx.resume();
    const body = s.body;
    const hero = { state: "ground", speed: 0, sinceJump: 9, stun: 0 };
    body.update(1 / 60, hero, {});
    for (let i = 0; i < 100 && !body.bank?.buffer; i++)
      await new Promise((r) => setTimeout(r, 100));
    const PLAN = [
      [5, "walk", { state: "ground", speed: 2.1 }],
      [25, "run", { state: "ground", speed: 5.6 }],
      [33, "stand", { state: "ground", speed: 0 }],
      [45, "climb", { state: "climb", speed: 0, shimmy: true }],
      [50, "stand", { state: "ground", speed: 0 }],
    ];
    const log = [];
    let now = 0;
    let phase = "";
    const clip = body.clip.bind(body);
    body.clip = (kind, t, level, rate) => {
      if (kind === "inhale" || kind === "exhale")
        log.push({ t: +now.toFixed(2), phase, kind, level: +level.toFixed(4) });
      return clip(kind, t, level, rate);
    };
    const dt = 1 / 60;
    for (const [end, name, state] of PLAN) {
      phase = name;
      Object.assign(hero, { shimmy: false }, state);
      for (; now < end; now += dt) body.update(dt, hero, {});
    }
    return { recorded: !!body.bank?.buffer, log };
  });
  const phases = {};
  for (const e of result.log) {
    phases[e.phase] ??= { breaths: 0, first: null, last: null, maxLevel: 0 };
    const p = phases[e.phase];
    p.breaths++;
    p.first ??= e.t;
    p.last = e.t;
    p.maxLevel = Math.max(p.maxLevel, e.level);
  }
  const inhale = result.log.filter((e) => e.kind === "inhale");
  const exhale = result.log.filter((e) => e.kind === "exhale");
  const summary = {
    url: base,
    recorded: result.recorded,
    phases,
    breaths: result.log.length,
    loudestInhale: Math.max(0, ...inhale.map((e) => e.level)),
    loudestExhale: Math.max(0, ...exhale.map((e) => e.level)),
  };
  console.log(JSON.stringify(summary, null, 1));
  await writeFile(
    out,
    JSON.stringify({ ...summary, log: result.log }, null, 1),
  );
} finally {
  await browser.close();
}
