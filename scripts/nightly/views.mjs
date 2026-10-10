// Captures fixed camera views of every world with time driven animation frozen, then compares
// them with the stored baselines, or with --update captures them twice and stores the first
// capture as the baseline and the difference between both as the view's noise.
//   node scripts/nightly/views.mjs --url=http://localhost:3002 --out=<dir>
//     [--baselines=receipts/nightly-baselines] [--views=<json>] [--only=<id,...>] [--update]
import puppeteer from "puppeteer-core";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compare, decodePNG, downscale, encodePNG, heatmap } from "./image.mjs";

const arg = (name, fallback) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const root = fileURLToPath(new URL("../../", import.meta.url));
const base = (
  arg("url") ||
  process.env.FARSEEK_BASE ||
  "http://localhost:3002"
).replace(/\/$/, "");
const out = arg("out", "outputs/nightly-views");
const baselines = arg("baselines", join(root, "receipts/nightly-baselines"));
const update = process.argv.includes("--update");
const plan = JSON.parse(
  await readFile(
    arg("views", join(root, "scripts/nightly/views.json")),
    "utf8",
  ),
);
const only = arg("only")?.split(",");
const views = plan.views.filter((v) => !only || only.includes(v.id));

function render(page, view, time) {
  return page.evaluate(
    async ({ cam, time, hideHero, clocks }) => {
      const { worlds, follow, renderer, heroModel, app } = window.__FD__;
      const camera = follow.camera;
      const { grassTime } = await import("/grass.js");
      grassTime.value = time;
      const world = worlds.current;
      if (typeof world.time === "number") world.time = time;
      world.ambient?.(0);
      // Parts with their own clock replay it at the pinned instant.
      for (const name of clocks) {
        const part = world[name];
        if (!part) continue;
        part.time = time;
        // Random seeds (the braziers' flicker) follow the order of concurrent loads.
        for (const list of Object.values(part))
          if (Array.isArray(list))
            list.forEach((item, k) => {
              if (typeof item?.seed === "number") item.seed = k * 1.7;
            });
        part.update?.(0);
      }
      const seen = new Set();
      const pin = (uniforms) => {
        if (!uniforms || seen.has(uniforms)) return;
        seen.add(uniforms);
        for (const [key, uniform] of Object.entries(uniforms))
          if (
            /^(uTime|time|iTime)$/.test(key) &&
            typeof uniform?.value === "number"
          )
            uniform.value = time;
      };
      // Program uniforms include those added in onBeforeCompile, which the material omits.
      const visit = (material) => {
        for (const m of [].concat(material || [])) {
          pin(m.uniforms);
          pin(renderer.properties.get(m).uniforms);
        }
      };
      world.scene.traverse((node) => visit(node.material));
      for (const pass of world.composer?.passes || []) {
        visit(pass.material);
        pin(pass.uniforms);
      }
      heroModel.visible = !hideHero;
      camera.fov = follow.baseFov;
      camera.near = follow.baseNear;
      camera.updateProjectionMatrix();
      camera.position.set(cam[0], cam[1], cam[2]);
      camera.lookAt(cam[3], cam[4], cam[5]);
      camera.updateMatrixWorld(true);
      renderer.shadowMap.needsUpdate = true;
      worlds.render(camera, 0);
      return {
        image: renderer.domElement.toDataURL("image/png"),
        programs: renderer.info.programs.length,
        world: app.state.where,
      };
    },
    {
      cam: view.cam,
      time,
      hideHero: view.hero !== true,
      clocks: plan.clocks?.[view.chapter] || [],
    },
  );
}

async function chapter(browser, id, list, dir) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console error: ${m.text()}`);
  });
  await page.setViewport({ width: plan.width, height: plan.height });
  await page.evaluateOnNewDocument(
    (quality, playFrames) => {
      localStorage.removeItem("far-door-progress");
      localStorage.setItem(
        "far-door-settings",
        JSON.stringify({ quality, shake: false, hints: false, markers: false }),
      );
      // Seeded so random placements such as snowflakes and flame phases repeat between runs.
      let seed = 0x2545f491;
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      // Play advances exactly 1/60 s a frame and stops after a fixed number of frames, so
      // wandering creatures stand where they stood in the baseline whatever the machine's load.
      const native = window.requestAnimationFrame.bind(window);
      let seen = -1,
        stamp = 0,
        played = 0;
      window.requestAnimationFrame = (callback) =>
        native((now) => {
          if (now !== seen) {
            seen = now;
            const state = window.__FD__?.app.state;
            if (state?.mode === "play") {
              if (!played) {
                state.cinematic?.skip?.();
                state.cinematic = state.intro = null;
              }
              played++;
              stamp += 1000 / 60;
            } else stamp = now;
            if (played > playFrames) window.__NIGHTLY_FROZEN__ = true;
          }
          if (!window.__NIGHTLY_FROZEN__) callback(stamp);
        });
    },
    plan.quality,
    plan.playFrames,
  );
  const started = Date.now();
  await page.goto(
    `${base}/?chapter=${id}&nolock=1&debug=1&cam=${list[0].cam.join(",")}`,
    { waitUntil: "load", timeout: 120000 },
  );
  await page.waitForFunction(
    () =>
      window.__NIGHTLY_FROZEN__ === true &&
      window.__READY__ === true &&
      window.__FD__?.worlds.pending.size === 0,
    { timeout: 240000, polling: 250 },
  );
  const shots = [];
  for (const view of list) {
    const shot = await render(page, view, plan.time);
    const full = decodePNG(Buffer.from(shot.image.split(",")[1], "base64"));
    const image = downscale(full, plan.storeScale);
    await writeFile(join(dir, `${view.id}.png`), encodePNG(image));
    shots.push({ id: view.id, programs: shot.programs, world: shot.world });
    console.log(`captured ${view.id}`);
  }
  await page.close();
  return { shots, errors, seconds: (Date.now() - started) / 1000 };
}

async function captureAll(dir) {
  await mkdir(dir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  const shots = [],
    errors = [],
    seconds = {};
  try {
    for (const id of [...new Set(views.map((v) => v.chapter))]) {
      const run = await chapter(
        browser,
        id,
        views.filter((v) => v.chapter === id),
        dir,
      );
      shots.push(...run.shots);
      errors.push(...run.errors.map((e) => `${id}: ${e}`));
      seconds[id] = run.seconds;
    }
  } finally {
    await browser.close();
    for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
  }
  return { shots, errors, seconds };
}

const load = async (file) => decodePNG(await readFile(file));
const metrics = (r) => ({
  ssim: +r.ssim.toFixed(5),
  tileSsim: +r.tileSsim.toFixed(5),
  tileDeltaE: +r.tileDeltaE.toFixed(3),
  deltaE: +r.deltaE.toFixed(3),
  worstTile: r.worstTile,
});

function limitsFor(view, stored) {
  const limits = { ...plan.limits, ...(view.limits || {}) };
  // A view whose own repeat varies more gets a proportionally wider margin.
  if (stored?.noise) {
    limits.tileSsim = Math.min(
      limits.tileSsim,
      stored.noise.tileSsim - limits.noiseMargin,
    );
    limits.tileDeltaE = Math.max(
      limits.tileDeltaE,
      stored.noise.tileDeltaE * limits.noiseFactor,
    );
  }
  return limits;
}

const summary = { base, update, views: [], errors: [], passed: true };
try {
  await mkdir(out, { recursive: true });
  const first = await captureAll(out);
  summary.errors.push(...first.errors);
  summary.seconds = first.seconds;
  const file = join(baselines, "baselines.json");
  const stored = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  if (update) {
    const repeat = await captureAll(join(out, "repeat"));
    summary.errors.push(...repeat.errors);
    if (summary.errors.length) throw new Error("errors while capturing");
    await mkdir(baselines, { recursive: true });
    const meta = {
      width: plan.width,
      height: plan.height,
      storeScale: plan.storeScale,
      quality: plan.quality,
      time: plan.time,
      updated: new Date().toISOString(),
      views: { ...(stored.views || {}) },
    };
    for (const view of views) {
      const image = await load(join(out, `${view.id}.png`));
      const noise = metrics(
        compare(image, await load(join(out, "repeat", `${view.id}.png`))),
      );
      await writeFile(
        join(out, `${view.id}.thumb.png`),
        encodePNG(downscale(image, 2)),
      );
      await copyFile(
        join(out, `${view.id}.png`),
        join(baselines, `${view.id}.png`),
      );
      meta.views[view.id] = { chapter: view.chapter, cam: view.cam, noise };
      summary.views.push({ id: view.id, noise, passed: true });
      console.log(`baseline ${view.id} noise ${JSON.stringify(noise)}`);
    }
    for (const id of Object.keys(meta.views))
      if (!plan.views.some((v) => v.id === id)) delete meta.views[id];
    await writeFile(file, JSON.stringify(meta, null, 2) + "\n");
  } else {
    for (const view of views) {
      const record = { id: view.id, chapter: view.chapter };
      try {
        const known = stored.views?.[view.id];
        if (!known) throw new Error("no baseline: run with --update-baselines");
        if (known.cam.join() !== view.cam.join())
          throw new Error("the baseline was taken from another camera");
        const current = await load(join(out, `${view.id}.png`));
        const reference = await load(join(baselines, `${view.id}.png`));
        const limits = limitsFor(view, known);
        const result = compare(reference, current);
        const failed = [];
        if (result.ssim < limits.ssim)
          failed.push(`ssim ${result.ssim.toFixed(4)} < ${limits.ssim}`);
        if (result.tileSsim < limits.tileSsim)
          failed.push(
            `tile ssim ${result.tileSsim.toFixed(4)} < ${limits.tileSsim.toFixed(4)}`,
          );
        if (result.tileDeltaE > limits.tileDeltaE)
          failed.push(
            `tile colour ${result.tileDeltaE.toFixed(2)} > ${limits.tileDeltaE.toFixed(2)}`,
          );
        const diff = heatmap(current, result, limits);
        const thumb = (name, image) =>
          writeFile(join(out, name), encodePNG(downscale(image, 2)));
        await thumb(`${view.id}.thumb.png`, current);
        await thumb(`${view.id}.baseline.thumb.png`, reference);
        await thumb(`${view.id}.diff.thumb.png`, diff);
        // Full size images stay only for the views that need a closer look.
        if (failed.length) {
          await writeFile(join(out, `${view.id}.diff.png`), encodePNG(diff));
          await copyFile(
            join(baselines, `${view.id}.png`),
            join(out, `${view.id}.baseline.png`),
          );
        } else await rm(join(out, `${view.id}.png`));
        Object.assign(record, metrics(result), {
          limits,
          failed,
          passed: !failed.length,
        });
      } catch (error) {
        Object.assign(record, {
          passed: false,
          failed: [String(error.message || error)],
        });
      }
      if (!record.passed) summary.passed = false;
      summary.views.push(record);
      console.log(
        `${record.passed ? "PASS" : "FAIL"} ${view.id} ${record.failed.join("; ")}`,
      );
    }
  }
  if (summary.errors.length) summary.passed = false;
} catch (error) {
  summary.passed = false;
  summary.failure = String(error.stack || error);
  console.error(error.stack || error);
} finally {
  await writeFile(
    join(out, "result.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
}
process.exitCode = summary.passed ? 0 : 1;
