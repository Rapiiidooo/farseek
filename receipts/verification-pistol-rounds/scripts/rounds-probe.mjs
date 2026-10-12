// Fires the pistols with real input in the wildwood until they run dry, and reads what the
// game counts: the capacity, the rounds left after each shot, the reload and the kit's label.
//   node rounds-probe.mjs <out.json> [url]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3002/"] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}?nolock=1&chapter=forest`, { waitUntil: "load" });
  await page.waitForFunction(
    () => window.__READY__ === true && window.__GAME__?.mode === "play",
    { timeout: 180000 },
  );
  await sleep(1500);
  // Skip the arrival shot, then draw the pistols.
  for (
    let i = 0;
    i < 3 && (await page.evaluate(() => window.__GAME__.cinematic));
    i++
  ) {
    await page.keyboard.press("Enter");
    await sleep(800);
  }
  await page.keyboard.press("Digit2");
  await sleep(1200);
  const kit = () => page.evaluate(() => window.__GAME__.equipment);
  const start = await kit();
  const left = [];
  for (let i = 0; i < 30; i++) {
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
    await sleep(260);
    const k = await kit();
    left.push(k.ammo);
    if (k.reloading) break;
  }
  await sleep(3200);
  const after = await kit();
  const label = await page.evaluate(
    () =>
      document.querySelector("#inventory, .equipment, #kit")?.textContent ??
      null,
  );
  const result = {
    selected: start.selected,
    capacity: start.capacity,
    startAmmo: start.ammo,
    roundsLeftAfterEachShot: left,
    shotsBeforeReload: left.findIndex((n) => n === 0) + 1,
    reloadedTo: after.ammo,
    errors,
  };
  console.log(JSON.stringify(result));
  await writeFile(out, JSON.stringify(result, null, 1));
} finally {
  await browser.close();
}
