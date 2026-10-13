// Software rendering (SwiftShader) and the phone rig tier without post: time to the title, live
// mirrors per frame and shader programs before and after the court floor's mirrors come into view.
//   node receipts/verification-court-mirrors/software.mjs <label> <url> [out.json]
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const [label = "after", base = "http://localhost:3009"] = process.argv.slice(2);
const out =
  process.argv[4] ||
  new URL(`software-${label}.json`, import.meta.url).pathname;
const CASES = [
  {
    name: "swiftshader",
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    query: "",
  },
  {
    name: "phone-tier",
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
    query: "&q=phone",
  },
];
const SPOTS = [
  [22.5, 2.6, 30.5, 13, 1.1, 22],
  [21.5, 4, 31, 14.4, 1.1, 23.9],
  [11, 2.2, 26, 9, 1.3, 21.5],
  [5, 2.6, 17.5, 8.8, 1.1, 26.7],
  [24, 2.2, 25, 21, 1.3, 25],
];
const result = { label, base, cases: [] };
for (const test of CASES) {
  const browser = await puppeteer.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: test.args,
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(600000);
    await page.setViewport({ width: 1280, height: 720 });
    page.on("pageerror", (e) => errors.push(e.stack));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.removeItem("far-door-progress");
      localStorage.setItem(
        "far-door-settings",
        JSON.stringify({ quality: "balanced", shake: false }),
      );
    });
    const start = Date.now();
    await page.goto(`${base}/?debug=1&nolock=1${test.query}`, {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.__READY__);
    const title = Date.now() - start;
    await page.goto(`${base}/?chapter=floor&debug=1&nolock=1${test.query}`, {
      waitUntil: "load",
    });
    await page.waitForFunction(
      () => window.__READY__ && __FD__.worlds.pending.size === 0,
    );
    const floor = await page.evaluate(async (SPOTS) => {
      const { worlds, renderer, follow } = __FD__;
      const court = worlds.get("court");
      const state = court.services.state;
      state.paused = true;
      state.intro = state.cinematic = null;
      const renderer_ = renderer.getContext();
      const info = renderer_.getExtension("WEBGL_debug_renderer_info");
      const before = renderer.info.programs.length;
      const renders = [];
      for (const s of SPOTS) {
        follow.camera.position.set(s[0], s[1], s[2]);
        follow.camera.lookAt(s[3], s[4], s[5]);
        for (let i = 0; i < 12; i++) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          renders.push(court.mirrors.renders ?? null);
        }
      }
      return {
        gpu: renderer_.getParameter(info.UNMASKED_RENDERER_WEBGL),
        software: __FD__.app.view.software,
        post: !!__FD__.app.rig.post,
        count: court.mirrors.count ?? null,
        stills: court.mirrors.entries.map(
          (entry) => entry.uniforms.uMirrorStill?.value ?? null,
        ),
        programsAtLoad: window.__GAME__.programsAtLoad,
        before,
        after: renderer.info.programs.length,
        maxRenders: Math.max(...renders.map((value) => value ?? 0)),
        rendered: renders.filter((value) => value > 0).length,
      };
    }, SPOTS);
    result.cases.push({ name: test.name, title, floor, errors });
    console.log(label, test.name, JSON.stringify({ title, floor, errors }));
  } finally {
    await browser.close();
    for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
  }
}
await writeFile(out, JSON.stringify(result, null, 2) + "\n");
