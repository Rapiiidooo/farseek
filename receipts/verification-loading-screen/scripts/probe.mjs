// Records the loading screen as a player sees it: the bar's drawn fraction, the step text and
// frame gaps every animation frame, from navigation through an immediate New game to play.
//   node outputs/loading/probe.mjs <name> [--url=http://localhost:3012/] [--phone] [--wait=<s>]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const name = process.argv[2] || "baseline";
const arg = (k, d) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg("url", "http://localhost:3012/");
const phone = process.argv.includes("--phone");
const waitOnTitle = Number(arg("wait", "0"));
const out = new URL(`./${name}/`, import.meta.url).pathname;
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const errors = [];
const shots = [];
try {
  const page = await browser.newPage();
  if (phone)
    await page.setViewport({
      width: 412,
      height: 915,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
  else await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on(
    "console",
    (m) =>
      m.type() === "error" && !/404/.test(m.text()) && errors.push(m.text()),
  );
  await page.evaluateOnNewDocument(() => {
    const rec = (window.__loadRec = { samples: [], gaps: [] });
    let last = performance.now();
    const sample = () => {
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (gap > 50) rec.gaps.push({ t: Math.round(now), gap: Math.round(gap) });
      const overlay = document.querySelector("#loading");
      const fill = document.querySelector("#load-fill");
      const track = fill?.parentElement;
      const shown =
        overlay && !overlay.hidden && getComputedStyle(overlay).opacity > 0.05;
      const box = track?.getBoundingClientRect();
      const fraction =
        fill && track
          ? Math.min(
              1,
              Math.max(
                0,
                (fill.getBoundingClientRect().right - box.left) /
                  Math.max(1, box.width),
              ),
            )
          : null;
      rec.samples.push({
        t: Math.round(now),
        shown,
        fraction: fraction === null ? null : +fraction.toFixed(4),
        text: document.querySelector("#load-step")?.textContent || "",
        mode: window.__GAME__?.mode ?? null,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const shoot = async (label) => {
    const t = await page.evaluate(() => Math.round(performance.now()));
    const file = `${String(shots.length).padStart(2, "0")}-${label}.png`;
    await page.screenshot({ path: out + file });
    shots.push({ t, file });
  };
  const url = `${base}?debug=1&nolock=1`;
  const navigation = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 600));
  await shoot("initial");
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  const ready = await page.evaluate(() => Math.round(performance.now()));
  await shoot("title");
  if (waitOnTitle) await new Promise((r) => setTimeout(r, waitOnTitle * 1000));
  await page.evaluate(() => {
    const worlds = window.__FD__.worlds;
    const log = (window.__worldLog = []);
    const original = worlds.onEvent;
    worlds.onEvent = (event, detail) => {
      log.push({ t: Math.round(performance.now()), event, ...detail });
      original(event, detail);
    };
  });
  const click = await page.evaluate(() => {
    document.querySelector('button[data-action="new"]').click();
    return Math.round(performance.now());
  });
  for (const delay of [400, 2000, 5000]) {
    await new Promise((r) => setTimeout(r, delay === 400 ? 400 : 1600));
    const still = await page.evaluate(
      () => !document.querySelector("#loading").hidden,
    );
    if (still) await shoot(`newgame-${delay}`);
  }
  await page.waitForFunction(
    () =>
      window.__GAME__?.mode === "play" &&
      document.querySelector("#loading").hidden,
    { timeout: 180000 },
  );
  const play = await page.evaluate(() => Math.round(performance.now()));
  await shoot("play");
  const data = await page.evaluate(() => ({
    samples: window.__loadRec.samples,
    gaps: window.__loadRec.gaps,
    worlds: window.__worldLog,
    trace: window.__FD__.app.state.loadTrace,
  }));
  // The longest stretch where the overlay was shown but its bar did not visibly move.
  const still = (from, to) => {
    let longest = 0;
    let since = null;
    let value = null;
    for (const s of data.samples) {
      if (s.t < from || s.t > to || !s.shown) continue;
      if (value === null || Math.abs(s.fraction - value) > 0.002) {
        if (since !== null) longest = Math.max(longest, s.t - since);
        since = s.t;
        value = s.fraction;
      }
    }
    if (since !== null) longest = Math.max(longest, to - since);
    return longest;
  };
  const jumps = (from, to) => {
    const values = data.samples.filter(
      (s) => s.t >= from && s.t <= to && s.shown && s.fraction !== null,
    );
    let backward = 0;
    let biggest = 0;
    for (let i = 1; i < values.length; i++) {
      const d = values[i].fraction - values[i - 1].fraction;
      if (d < -0.002) backward++;
      biggest = Math.max(biggest, d);
    }
    return { backward, biggest: +biggest.toFixed(3) };
  };
  const steps = (from, to) => {
    const list = [];
    for (const s of data.samples)
      if (s.t >= from && s.t <= to && s.text !== list.at(-1)?.text)
        list.push({ t: s.t - from, text: s.text, fraction: s.fraction });
    return list;
  };
  const summary = {
    name,
    url,
    phone,
    waitOnTitle,
    navigationToReadyMs: ready,
    newGameWaitMs: play - click,
    initial: {
      longestStillMs: still(0, ready),
      ...jumps(0, ready),
      steps: steps(0, ready),
    },
    newGame: {
      longestStillMs: still(click, play),
      ...jumps(click, play),
      steps: steps(click, play),
      worldEvents: data.worlds
        .filter((e) => ["build", "restore", "prepared"].includes(e.event))
        .map((e) => ({ t: e.t - click, event: e.event, id: e.id })),
      frameGapsOver100ms: data.gaps.filter(
        (g) => g.t >= click && g.t <= play && g.gap > 100,
      ).length,
      worstGapMs: Math.max(
        0,
        ...data.gaps
          .filter((g) => g.t >= click && g.t <= play)
          .map((g) => g.gap),
      ),
    },
    shots,
    errors,
    wallMs: Date.now() - navigation,
  };
  await writeFile(out + "samples.json", JSON.stringify(data) + "\n");
  await writeFile(
    out + "summary.json",
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
