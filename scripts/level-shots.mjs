// Pictures of each world for the levels screen. Starts every world by address with the camera
// held (`?cam=`), hides the page's layers over the picture and saves a frame per candidate
// viewpoint; `--encode` captures only each world's chosen view and writes it to
// game/ui/levels/<world>.webp.
//   node scripts/level-shots.mjs <outDir> [--url=http://localhost:3002/] [--only=court,two]
//     [--views=court:floor,six:city] [--encode]
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";

const out = process.argv[2] || "outputs/level-shots";
const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = arg("url") || "http://localhost:3002/";
const only = arg("only")?.split(",");
const views = arg("views")
  ?.split(",")
  .map((pair) => pair.split(":"));
const encode = process.argv.includes("--encode");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Candidate viewpoints: the lens, the point it looks at and a field of view, with the explorer
// shown only where she gives the place its scale. `pick` is the view the levels screen shows.
const WORLDS = {
  court: {
    start: "court",
    pick: "floor",
    views: {
      overview: { cam: [19.5, 11.5, 42, 15.2, 7.6, 24], fov: 50 },
      haze: { cam: [23.6, 13.3, 46.3, 13, 2.1, 8], fov: 42 },
      mirror: { cam: [11.7, 3.6, 26, 9, 1.3, 21], fov: 50 },
      high: { cam: [25, 16.5, 50, 14, 5, 9], fov: 40 },
      floor: { cam: [21, 2.4, 30, 14.5, 5.2, 9], fov: 48 },
      wider: { cam: [22.5, 2.7, 34, 14.5, 5.4, 9], fov: 50 },
    },
  },
  two: {
    start: "checkpoint",
    pick: "corner",
    views: {
      valley: { cam: [0, 1.7, -3.6, 0, 1.2, -13.6], fov: 50 },
      overview: { cam: [0, 25, 21.4, 0, 0, -13.6], fov: 50 },
      plaza: { cam: [0, 4.5, -8, 0, 2, -32], fov: 46 },
      corner: { cam: [7, 6.5, -6, -2, 2.4, -33], fov: 46 },
    },
  },
  three: {
    start: "isles",
    pick: "wide",
    views: {
      wide: { cam: [-4.5, 5.3, 4.2, 6, 0.2, -50], fov: 42 },
      rim: { cam: [-2.4, 2.15, -2.6, 4, 1.15, -12.5], fov: 44 },
      overview: { cam: [0, 24.93, 20.6, 0, -0.07, -14.4], fov: 50 },
      wider: { cam: [-7, 8, 8, 6, 1, -50], fov: 40 },
    },
  },
  four: {
    start: "frost",
    pick: "lake",
    views: {
      valley: { cam: [0, 1.7, -4.4, 0, 1.2, -14.4], fov: 50 },
      falls: { cam: [0, 1.7, -4.4, 7.07, 1.2, -11.47], fov: 50 },
      stela: { cam: [0, 2.2, -143.5, 0, 1.3, -147.5], fov: 50 },
      canyon: { cam: [0, 8, 4, 0, 4, -60], fov: 46 },
      lake: { cam: [4, 6, -92, 0, 1.5, -150], fov: 46 },
      ring: { cam: [7, 3.2, -137, 0, 4, -155], fov: 46 },
      shore: { cam: [0.5, 6.5, -93.5, 0, 2.2, -150], fov: 46 },
    },
  },
  five: {
    start: "forest",
    pick: "avenue",
    views: {
      shafts: { cam: [1.35, 3.1, -9.2, -1, 5, -48], fov: 44 },
      path: { cam: [0, 1.92, -4.5, 0, 1.42, -14.5], fov: 50 },
      overview: { cam: [0, 25.2, 20.5, 0, 0.2, -14.5], fov: 50 },
      avenue: { cam: [0.8, 2.6, -6.5, -0.5, 4.5, -48], fov: 44 },
    },
  },
  six: {
    start: "sea",
    pick: "archive",
    views: {
      city: { cam: [-7, 30.2, -7.2, -32, 16, -28], fov: 44 },
      caustics: { cam: [4, 32.4, -4.2, 0, 29.6, -14], fov: 46 },
      overview: { cam: [0, 56.5, 20.5, 0, 31.5, -14.5], fov: 50 },
      causeway: { cam: [6, 40, 6, 0, 29, -30], fov: 46 },
      ruins: { cam: [-4, 34, -4, -30, 20, -30], fov: 44 },
      archive: { cam: [8, 37, -12, -2, 29, -50], fov: 46 },
      diorama: { cam: [10, 47, 6, 0, 29, -26], fov: 46 },
    },
  },
  vault: {
    start: "vault",
    pick: "medallions",
    views: {
      nave: { cam: [0, 1.8, 3.6, 0, 2.6, -40], fov: 50 },
      door: { cam: [0, 3.2, -56, 0, 3.4, -67], fov: 50 },
      seals: { cam: [0.7, 1.35, -49, 0, 5.3, -66.1], fov: 40 },
      hall: { cam: [0, 2.2, -38, 0, 6.5, -67], fov: 44 },
      shaft: { cam: [0, 1.7, -10, 0, 3.5, -67], fov: 40 },
      medallions: { cam: [0, 2.4, -36, 0, 3.8, -67], fov: 46 },
    },
  },
};

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const report = { base, worlds: {} };
try {
  for (const [world, plan] of Object.entries(WORLDS)) {
    if (only && !only.includes(world)) continue;
    const wanted = views
      ? views.filter(([w]) => w === world).map(([, id]) => id)
      : encode
        ? [plan.pick]
        : Object.keys(plan.views);
    if (!wanted.length) continue;
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.evaluateOnNewDocument(() => {
      localStorage.removeItem("far-door-progress");
      localStorage.setItem(
        "far-door-settings",
        JSON.stringify({
          quality: "high",
          hints: false,
          markers: false,
          shake: false,
        }),
      );
    });
    const first = plan.views[wanted[0]];
    const started = Date.now();
    await page.goto(
      `${base}?nolock=1&debug=1&chapter=${plan.start}&cam=${first.cam.join(",")}`,
      { waitUntil: "load", timeout: 120000 },
    );
    await page.waitForFunction(
      () =>
        window.__READY__ === true &&
        window.__FD__?.worlds.pending.size === 0 &&
        window.__GAME__?.mode === "play",
      { timeout: 240000, polling: 250 },
    );
    // Only the picture: every layer over the canvas stays out of the frame.
    await page.addStyleTag({
      content: "body > :not(#view) { visibility: hidden !important; }",
    });
    await sleep(3000);
    const shots = {};
    for (const id of wanted) {
      const view = plan.views[id];
      await page.evaluate(
        ({ cam, fov, hero }) => {
          const { app, follow, heroModel } = window.__FD__;
          app.state.cinematic?.skip?.();
          app.state.cinematic = app.state.intro = null;
          app.params.set("cam", cam.join(","));
          follow.settings.fov = fov;
          heroModel.visible = !!hero;
        },
        { cam: view.cam, fov: view.fov ?? 50, hero: view.hero },
      );
      await sleep(2200);
      const file = `${out}/${world}-${id}.png`;
      await page.screenshot({ path: file });
      // A small copy for the receipt's contact sheet.
      await page.screenshot({
        path: `${out}/${world}-${id}.jpg`,
        type: "jpeg",
        quality: 72,
        clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 / 3 },
      });
      shots[id] = { ...view, file };
      console.log(`captured ${world} ${id}`);
    }
    report.worlds[world] = {
      start: plan.start,
      pick: plan.pick,
      seconds: (Date.now() - started) / 1000,
      shots,
      errors,
    };
    await page.close();
  }
} finally {
  await browser.close();
}

// The chosen frame at 960 by 540, at quality 70, or lower until it weighs under 60,000 bytes.
if (encode) {
  await mkdir("game/ui/levels", { recursive: true });
  for (const [world, entry] of Object.entries(report.worlds)) {
    const source = entry.shots[entry.pick]?.file;
    if (!source) continue;
    const target = `game/ui/levels/${world}.webp`;
    let quality = 70;
    for (;;) {
      execFileSync("cwebp", [
        "-quiet",
        "-q",
        String(quality),
        "-m",
        "6",
        "-sharp_yuv",
        "-resize",
        "960",
        "540",
        source,
        "-o",
        target,
      ]);
      const { size } = await stat(target);
      if (size < 60000 || quality <= 50) {
        entry.encoded = { target, quality, bytes: size };
        console.log(`${target}: ${size} bytes at q${quality}`);
        break;
      }
      quality -= 5;
    }
  }
}
await writeFile(`${out}/shots.json`, JSON.stringify(report, null, 2) + "\n");
