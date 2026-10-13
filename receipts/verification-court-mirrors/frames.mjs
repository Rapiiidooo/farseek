// Fixed views of the court floor with three or more mirrors, per quality tier, as JPEG frames
// and the mirrors' blend weights.
//   node receipts/verification-court-mirrors/frames.mjs <label> <url> [outDir]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const [label = "after", base = "http://localhost:3009"] = process.argv.slice(2);
const dir =
  process.argv[4] || new URL(`frames/${label}/`, import.meta.url).pathname;
const YAWS = {
  start: [-Math.PI / 4, Math.PI / 2, Math.PI * 0.75],
  solved: [-0.16, -1.24, 2.92],
  stelae: [-2.356, -2.517, 2.92],
};
// Camera position, point looked at, mirror angles and, when shown, where Nyra stands.
const VIEWS = [
  ["floor-start", [22.5, 2.6, 30.5, 13, 1.1, 22], "start"],
  ["east-floor", [21.5, 4, 31, 14.43, 1.1, 23.93], "solved"],
  ["west-gate", [5, 2.6, 17.5, 8.83, 1.1, 26.74], "stelae"],
  ["gate-high", [8, 8.5, 16, 11.83, 1.1, 25.24], "stelae"],
  ["overview", [14, 10.5, 28, 14, 1.1, 18], "solved"],
  [
    "west-gate-nyra",
    [5, 2.6, 17.5, 8.83, 1.1, 26.74],
    "stelae",
    [7.6, 19.4, -2.2],
  ],
];
await mkdir(dir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const result = { label, base, views: VIEWS, frames: [], errors: [] };
try {
  for (const quality of ["high", "balanced", "fast"]) {
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
    await page.evaluate(() => {
      const state = __FD__.worlds.get("court").services.state;
      state.paused = true;
      state.intro = state.cinematic = null;
      for (const el of document.body.children)
        if (el.id !== "view") el.style.visibility = "hidden";
    });
    for (const [name, view, angles, nyra] of VIEWS) {
      await page.evaluate(
        (view, yaws, nyra) => {
          const { worlds, follow, heroModel } = __FD__;
          const court = worlds.get("court");
          court.level.mirrors.forEach((mirror, i) => {
            mirror.yaw = yaws[i];
            mirror.mesh.rotation.y = yaws[i];
          });
          heroModel.visible = !!nyra;
          if (nyra) {
            heroModel.position.set(nyra[0], 0, nyra[1]);
            heroModel.rotation.y = nyra[2];
          }
          const camera = follow.camera;
          camera.position.set(view[0], view[1], view[2]);
          camera.lookAt(view[3], view[4], view[5]);
          camera.updateMatrixWorld(true);
        },
        view,
        YAWS[angles],
        nyra ?? null,
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const mirrors = await page.evaluate(
        () => __FD__.worlds.get("court").mirrors.telemetry?.() ?? null,
      );
      const file = `${name}-${quality}.jpg`;
      await page.screenshot({
        path: path.join(dir, file),
        type: "jpeg",
        quality: 82,
      });
      result.frames.push({ name, quality, file, mirrors });
      console.log(
        label,
        quality,
        name,
        JSON.stringify(mirrors?.mirrors ?? null),
      );
    }
    await page.close();
  }
} finally {
  await writeFile(
    path.join(dir, "frames.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
if (result.errors.length) {
  console.error(result.errors.join("\n"));
  process.exitCode = 1;
}
