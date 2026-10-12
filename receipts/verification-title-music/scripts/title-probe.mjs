// Follows the sound through the title, a New game, a pause, Restart level and Quit to title, with
// Chrome's real autoplay rule: what plays, the world's air under the title, and the master level.
//   node title-probe.mjs <out.json> [url]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3002/"] = process.argv.slice(2);
const url = `${base}${base.includes("?") ? "&" : "?"}nolock=1&debug`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--autoplay-policy=user-gesture-required",
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
  ],
});
const steps = [];
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  // Meters on the output and on the world's air, and a count of the notes each voice plays.
  await page.evaluate(() => {
    const s = window.__FD__.app.sound;
    const meter = (node) => {
      const a = s.ctx.createAnalyser();
      a.fftSize = 2048;
      node.connect(a);
      return a;
    };
    window.__probe = {
      out: meter(s.output),
      air: meter(s.ambienceDuck),
      notes: {},
    };
    const note = s.musicNote.bind(s);
    s.musicNote = (kind, ...rest) => {
      window.__probe.notes[kind] = (window.__probe.notes[kind] || 0) + 1;
      return note(kind, ...rest);
    };
  });
  const read = (name) =>
    page.evaluate(async (name) => {
      const s = window.__FD__.app.sound;
      const P = window.__probe;
      const rms = (a) => {
        const d = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(d);
        let sum = 0;
        for (const v of d) sum += v * v;
        return Math.sqrt(sum / d.length);
      };
      // The loudest of ten reads over a second, in dBFS.
      let out = 0,
        air = 0;
      for (let i = 0; i < 10; i++) {
        out = Math.max(out, rms(P.out));
        air = Math.max(air, rms(P.air));
        await new Promise((r) => setTimeout(r, 100));
      }
      const db = (v) => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
      const M = s.music;
      return {
        name,
        mode: window.__GAME__.mode,
        menu: window.__GAME__.menu,
        context: s.ctx.state,
        music: M?.mode ?? null,
        layers: M
          ? Object.fromEntries(
              Object.entries(M.layers).map(([k, L]) => [
                k,
                +L.out.gain.value.toFixed(3),
              ]),
            )
          : null,
        airGain: +s.ambienceDuck.gain.value.toFixed(3),
        master: window.__GAME__.audio.gain,
        outDb: db(out),
        airDb: db(air),
        notes: { ...P.notes },
      };
    }, name);
  const log = async (name) => {
    const r = await read(name);
    steps.push(r);
    console.log(JSON.stringify(r));
  };
  await sleep(1500);
  await log("title, before any gesture");
  // A click on the picture beside the menu, not on an entry.
  await page.mouse.click(1100, 600);
  await sleep(1000);
  await log("title, 1 s after the first click");
  await sleep(9000);
  await log("title, 10 s after the first click");
  await page.click("#startb");
  await page.waitForFunction(() => window.__GAME__?.mode === "play", {
    timeout: 120000,
  });
  await sleep(6000);
  await log("play, 6 s after New game");
  await page.keyboard.press("Escape");
  await sleep(800);
  await log("paused");
  await page.click('[data-screen="pause"] [data-action="restart"]');
  await page.waitForFunction(
    () => window.__GAME__?.mode === "play" && !window.__GAME__.paused,
    { timeout: 120000 },
  );
  await sleep(2500);
  await log("play, after Restart level");
  await page.keyboard.press("Escape");
  await sleep(800);
  await page.click('[data-screen="pause"] [data-action="title"]');
  await page.waitForFunction(() => window.__GAME__?.mode === "title", {
    timeout: 120000,
  });
  await sleep(6000);
  await log("title, 6 s after Quit to title");
} catch (error) {
  errors.push(String(error?.stack || error));
} finally {
  await writeFile(out, JSON.stringify({ url, steps, errors }, null, 1));
  if (errors.length) console.log("errors", errors);
  await browser.close();
}
