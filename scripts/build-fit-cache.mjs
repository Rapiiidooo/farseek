// Records the explorer's garment fit into game/assets/explorer/fit-cache.json, then checks that
// the replayed build matches a live fit. Run it after changing any hero fitting module.
//   node scripts/build-fit-cache.mjs [--url=http://localhost:3002]
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.length ? rest.join("=") : true];
  }),
);
const base = (args.url || "http://localhost:3002").replace(/\/$/, "");
const target = new URL(
  "../game/assets/explorer/fit-cache.json",
  import.meta.url,
);

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});

async function open(before) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url() === `${base}/__fit.html`)
      request.respond({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><script type="importmap">{"imports":{"three":"./vendor/three.module.js","three/addons/":"./vendor/"}}</script>`,
      });
    else request.continue();
  });
  if (before) await page.evaluateOnNewDocument(before);
  await page.goto(`${base}/__fit.html`);
  return page;
}

try {
  const recording = await open(() => (globalThis.__FIT_RECORD__ = true));
  const record = await recording.evaluate(async () => {
    const THREE = await import("three");
    const { takeFitRecord, fitTelemetry } = await import("./fit-cache.js");
    const { default: build } = await import("./assets/hero_realistic.js");
    build(THREE);
    return { data: takeFitRecord(), telemetry: fitTelemetry };
  });
  const session = record.data.sessions.hero_realistic;
  if (!session) throw new Error("The fit recorded no session");
  await writeFile(target, JSON.stringify(record.data, null, 2) + "\n");
  console.log(
    `Recorded ${session.calls} fit rays, input stamp ${(session.inputs >>> 0).toString(16)}`,
  );

  const replay = await open();
  const check = await replay.evaluate(async () => {
    const THREE = await import("three");
    const { fitTelemetry } = await import("./fit-cache.js");
    const { default: build } = await import("./assets/hero_realistic.js");
    globalThis.__FIT_LIVE__ = true;
    let started = performance.now();
    const live = build(THREE);
    const liveMs = performance.now() - started;
    globalThis.__FIT_LIVE__ = false;
    started = performance.now();
    const cached = build(THREE);
    const cachedMs = performance.now() - started;
    const meshes = (root) => {
      const list = [];
      root.traverse((node) => node.isMesh && list.push(node));
      return list;
    };
    const a = meshes(live),
      b = meshes(cached);
    let worst = 0,
      where = "";
    const problems = [];
    if (a.length !== b.length)
      problems.push(`mesh count ${a.length} ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const x = a[i].geometry,
        y = b[i].geometry;
      if (a[i].name !== b[i].name)
        problems.push(`name ${a[i].name} ${b[i].name}`);
      const names = Object.keys(x.attributes);
      if (names.join() !== Object.keys(y.attributes).join())
        problems.push(`attributes of ${a[i].name}`);
      for (const name of names) {
        const p = x.attributes[name].array,
          q = y.attributes[name]?.array;
        if (!q || p.length !== q.length) {
          problems.push(`${a[i].name}.${name} length`);
          continue;
        }
        for (let k = 0; k < p.length; k++) {
          const d = Math.abs(p[k] - q[k]);
          if (d > worst) {
            worst = d;
            where = `${a[i].name}.${name}`;
          }
        }
      }
      const pi = x.index?.array,
        qi = y.index?.array;
      if (!!pi !== !!qi || (pi && pi.some((v, k) => v !== qi[k])))
        problems.push(`${a[i].name} index`);
    }
    return {
      telemetry: fitTelemetry.sessions.hero_realistic,
      meshes: a.length,
      worst,
      where,
      problems,
      liveMs: Math.round(liveMs),
      cachedMs: Math.round(cachedMs),
    };
  });
  console.log(JSON.stringify(check));
  if (
    check.telemetry?.mode !== "replayed" ||
    check.problems.length ||
    check.worst > 1e-5
  )
    throw new Error("The recorded fit does not reproduce the live fit");
} finally {
  await browser.close();
}
