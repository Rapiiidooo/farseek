// Frame cost along a fixed camera path over the court floor, per quality tier: frame interval,
// main-thread time of the court's render, GPU time of the mirror pass and of the rest of the
// frame (EXT_disjoint_timer_query_webgl2), draw calls and live reflection renders per frame.
//   node receipts/verification-court-mirrors/measure.mjs <label> <url> [out.json] [--shots]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const [label = "after", base = "http://localhost:3009"] = process.argv.slice(2);
const out =
  process.argv[4] && !process.argv[4].startsWith("--")
    ? process.argv[4]
    : new URL(`measure-${label}.json`, import.meta.url).pathname;
const shots = process.argv.includes("--shots");
const QUALITIES = process.argv
  .find((arg) => arg.startsWith("--tiers="))
  ?.slice(8)
  .split(",") ?? ["high", "balanced", "fast"];
// Camera keys over the court floor at a follow camera's height: position, then the point looked at.
const PATH = [
  [22.5, 2.6, 30.5, 14, 1.2, 23],
  [19, 2.4, 27, 10, 1.2, 22],
  [14, 2.4, 25.5, 6, 1.3, 21.5],
  [9.5, 2.4, 25, 3, 1.4, 21],
  [7, 2.6, 18.5, 12, 1.2, 26],
  [13, 2.6, 19.5, 20, 1.2, 27],
  [19, 2.4, 21.5, 21, 1.3, 26],
  [24, 2.4, 25.5, 17, 1.2, 30],
];
const LAP = 600;

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const result = { label, base, path: PATH, lap: LAP, tiers: {}, errors: [] };
try {
  for (const quality of QUALITIES) {
    const page = await browser.newPage();
    page.setDefaultTimeout(240000);
    await page.setViewport({ width: 1280, height: 720 });
    page.on("pageerror", (e) => result.errors.push(e.stack));
    page.on("console", (m) => {
      if (m.type() === "error") result.errors.push(m.text());
    });
    await page.evaluateOnNewDocument((q) => {
      localStorage.removeItem("far-door-progress");
      localStorage.setItem(
        "far-door-settings",
        JSON.stringify({ quality: q, shake: false }),
      );
    }, quality);
    await page.goto(`${base}/?chapter=floor&debug=1&nolock=1`, {
      waitUntil: "load",
    });
    await page.waitForFunction(
      () => window.__READY__ && __FD__.worlds.pending.size === 0,
    );
    const data = await page.evaluate(
      async (PATH, LAP, shots) => {
        const { worlds, renderer, follow, THREE } = __FD__;
        const court = worlds.get("court");
        const state = court.services.state;
        state.paused = true;
        state.intro = state.cinematic = null;
        for (const el of document.body.children)
          if (el.id !== "view") el.style.visibility = "hidden";
        const camera = follow.camera;
        const gl = renderer.getContext();
        const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
        const mirrorTargets = () =>
          new Set(
            [
              court.mirrors.target,
              ...court.mirrors.entries.map((entry) => entry.target),
            ].filter(Boolean),
          );
        let frame = null;
        const render = renderer.render.bind(renderer);
        renderer.render = (scene, eye) => {
          if (frame && frame.targets.has(renderer.getRenderTarget()))
            frame.reflections++;
          return render(scene, eye);
        };
        const query = () => {
          if (!timer) return null;
          const q = gl.createQuery();
          gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
          return q;
        };
        const end = (q) => q && gl.endQuery(timer.TIME_ELAPSED_EXT);
        const pending = [];
        const mirrorsRender = court.mirrors.render.bind(court.mirrors);
        court.mirrors.render = (...args) => {
          const start = performance.now();
          const value = mirrorsRender(...args);
          frame.mirrorCpu += performance.now() - start;
          end(frame.queries.mirrors);
          frame.queries.rest = query();
          return value;
        };
        const courtRender = court.render.bind(court);
        const a = new THREE.Vector3(),
          b = new THREE.Vector3(),
          look = new THREE.Vector3();
        const pose = (t) => {
          const k = (t % 1) * PATH.length;
          const i = Math.floor(k),
            f = k - i,
            s = f * f * (3 - 2 * f);
          const p = PATH[i],
            q = PATH[(i + 1) % PATH.length];
          a.set(p[0], p[1], p[2]).lerp(b.set(q[0], q[1], q[2]), s);
          look.set(p[3], p[4], p[5]).lerp(b.set(q[3], q[4], q[5]), s);
          camera.position.copy(a);
          camera.lookAt(look);
          camera.updateMatrixWorld(true);
        };
        let index = 0,
          holding = false,
          wanted = false;
        const images = [];
        court.render = (eye, dt) => {
          pose(index / LAP);
          frame = {
            index,
            holding,
            targets: mirrorTargets(),
            reflections: 0,
            mirrorCpu: 0,
            queries: { mirrors: query(), rest: null },
          };
          const start = performance.now();
          courtRender(eye, dt);
          frame.cpu = performance.now() - start;
          if (frame.queries.rest) end(frame.queries.rest);
          else end(frame.queries.mirrors);
          frame.calls = renderer.info.render.calls;
          frame.live = court.mirrors.telemetry?.().live ?? null;
          pending.push(frame);
          frame = null;
          // An unpreserved canvas is read in the task that drew it.
          if (wanted) {
            images.push(renderer.domElement.toDataURL("image/jpeg", 0.85));
            wanted = false;
          }
        };
        const settle = () => {
          for (const f of pending) {
            if (f.gpu !== undefined) continue;
            const qs = [f.queries.mirrors, f.queries.rest].filter(Boolean);
            if (
              !qs.every((q) =>
                gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE),
              )
            )
              continue;
            const [m, r] = [f.queries.mirrors, f.queries.rest].map((q) =>
              q ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : 0,
            );
            f.gpuMirrors = f.queries.rest ? m : 0;
            f.gpu = m + r;
            for (const q of qs) gl.deleteQuery(q);
          }
        };
        const frames = [],
          intervals = [];
        let last = performance.now();
        // One lap warms every view, then two laps are recorded.
        for (index = 0; index < LAP * 3; index++) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const now = performance.now();
          if (index >= LAP) intervals.push(now - last);
          last = now;
          settle();
          if (shots && index >= LAP && (index - LAP) % (LAP / 8) === 0) {
            holding = true;
            await new Promise((resolve) => setTimeout(resolve, 600));
            wanted = true;
            while (wanted)
              await new Promise((resolve) => requestAnimationFrame(resolve));
            holding = false;
            last = performance.now();
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        settle();
        for (const f of pending)
          if (f.index >= LAP && !f.holding)
            frames.push({
              cpu: f.cpu,
              mirrorCpu: f.mirrorCpu,
              gpu: f.gpu ?? null,
              gpuMirrors: f.gpuMirrors ?? null,
              calls: f.calls,
              reflections: f.reflections,
              live: f.live,
            });
        return {
          intervals,
          timer: !!timer,
          gpuName: gl.getParameter(
            gl.getExtension("WEBGL_debug_renderer_info")
              .UNMASKED_RENDERER_WEBGL,
          ),
          programs: renderer.info.programs.length,
          programsAtLoad: window.__GAME__.programsAtLoad,
          frames,
          images,
        };
      },
      PATH,
      LAP,
      shots,
    );
    const stats = (values) => {
      const list = values
        .filter((v) => Number.isFinite(v))
        .sort((x, y) => x - y);
      const at = (p) =>
        list[Math.min(list.length - 1, Math.floor(p * list.length))];
      return list.length
        ? {
            median: +at(0.5).toFixed(3),
            p95: +at(0.95).toFixed(3),
            max: +list[list.length - 1].toFixed(3),
            mean: +(list.reduce((s, v) => s + v, 0) / list.length).toFixed(3),
          }
        : null;
    };
    const frames = data.frames;
    const histogram = {};
    for (const f of frames)
      histogram[f.reflections] = (histogram[f.reflections] || 0) + 1;
    const byReflections = Object.fromEntries(
      Object.keys(histogram).map((count) => {
        const group = frames.filter((f) => f.reflections === +count);
        return [
          count,
          {
            frames: group.length,
            cpu: stats(group.map((f) => f.cpu)),
            mirrorCpu: stats(group.map((f) => f.mirrorCpu)),
            gpu: stats(group.map((f) => f.gpu)),
            gpuMirrors: stats(group.map((f) => f.gpuMirrors)),
          },
        ];
      }),
    );
    result.tiers[quality] = {
      frames: frames.length,
      timer: data.timer,
      gpuName: data.gpuName,
      programs: data.programs,
      programsAtLoad: data.programsAtLoad,
      interval: stats(data.intervals),
      cpu: stats(frames.map((f) => f.cpu)),
      mirrorCpu: stats(frames.map((f) => f.mirrorCpu)),
      gpu: stats(frames.map((f) => f.gpu)),
      gpuMirrors: stats(frames.map((f) => f.gpuMirrors)),
      calls: stats(frames.map((f) => f.calls)),
      reflections: {
        ...stats(frames.map((f) => f.reflections)),
        perFrame: histogram,
      },
      live: stats(frames.map((f) => f.live)),
      byReflections,
    };
    if (shots) {
      const dir = path.join(path.dirname(out), `path-${label}-${quality}`);
      await mkdir(dir, { recursive: true });
      for (const [i, image] of data.images.entries())
        await writeFile(
          path.join(dir, `path-${i}.jpg`),
          Buffer.from(image.split(",")[1], "base64"),
        );
    }
    console.log(quality, JSON.stringify(result.tiers[quality]));
    await page.close();
  }
} finally {
  await writeFile(out, JSON.stringify(result, null, 2) + "\n");
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
if (result.errors.length) {
  console.error(result.errors.join("\n"));
  process.exitCode = 1;
}
