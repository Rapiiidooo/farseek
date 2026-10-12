// The character studio with both explorers, the current one on the finger rig and the previous
// one on its archived animator, through every motion; no page or WebGL error.
//   node receipts/verification-finger-life/studio-probe.mjs <out-dir> [--url=http://localhost:3008]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const out =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ||
  "outputs/finger-studio";
const base =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002";
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const report = { runs: [], errors: [] };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && report.errors.push(m.text()),
  );
  await page.goto(`${base}/character.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__CHARACTER__?.ready, {
    timeout: 120000,
  });
  for (const model of ["original", "refined"])
    for (const motion of ["idle", "walk", "run", "swim", "hang", "climb"]) {
      const snapshot = await page.evaluate(
        (model, motion) => {
          const studio = window.__CHARACTER__;
          studio.setModel(model);
          studio.setMotion(motion);
          return studio.step(1.5);
        },
        model,
        motion,
      );
      report.runs.push({
        model,
        motion,
        errors: snapshot.errors,
        drawCalls: snapshot.drawCalls,
      });
    }
  await page.evaluate(() => {
    window.__CHARACTER__.setModel("refined");
    window.__CHARACTER__.setMotion("idle");
    window.__CHARACTER__.setFraming("upper");
    window.__CHARACTER__.step(2);
  });
  await page.screenshot({
    path: `${out}/studio-upper.jpg`,
    type: "jpeg",
    quality: 80,
  });
} finally {
  report.ok =
    !report.errors.length &&
    report.runs.length === 12 &&
    report.runs.every((run) => !run.errors.length);
  await writeFile(
    `${out}/studio-probe.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    report.ok ? "PASS" : "FAIL",
    "studio runs",
    report.runs.length,
    report.errors,
  );
  const child = browser.process();
  await browser.close();
  child?.stdout?.destroy();
  child?.stderr?.destroy();
}
if (!report.ok) process.exitCode = 1;
