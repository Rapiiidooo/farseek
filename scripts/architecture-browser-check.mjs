// The title, every chapter start and the asset lab load without errors, with every world
// prepared before play and no shader compiled after preparation.
//   node scripts/architecture-browser-check.mjs [outDir] [--url=http://localhost:3002/]
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { WORLDS } from "../game/worlds/catalog.js";
import { ASSET_CATALOG } from "../game/asset-catalog.js";

const out =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ||
  "outputs/architecture-browser-check";
const base = (
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/"
).replace(/\/?$/, "/");
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const results = [];
const settled = (page) =>
  page.waitForFunction(
    () =>
      window.__GAME__.worlds.pending.length === 0 &&
      window.__GAME__.streaming.jobs.length === 0,
    { timeout: 240000, polling: 250 },
  );
try {
  for (const chapter of [null, ...WORLDS.map((world) => world.starts[0].id)]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/404/.test(message.text()))
        errors.push(message.text());
    });
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(
      `${base}?nolock=1&debug=1${chapter ? `&chapter=${chapter}` : ""}`,
      { waitUntil: "load" },
    );
    await page.waitForFunction(() => window.__READY__ === true, {
      timeout: 240000,
    });
    await page.waitForFunction(
      () => document.querySelector("#loading").hidden,
      { timeout: 5000 },
    );
    const initial = await page.evaluate(() => window.__GAME__);
    const definition =
      chapter && WORLDS.find((world) => world.starts[0].id === chapter);
    const index = WORLDS.indexOf(definition);
    const neighbors = chapter
      ? WORLDS.slice(Math.max(0, index - 1), index + 2).map((world) => world.id)
      : ["court"];
    for (const id of neighbors)
      assert(
        initial.worlds.loaded.includes(id),
        `${chapter || "title"}: ${id} is prepared at readiness`,
      );
    if (chapter)
      assert.deepEqual(
        initial.worlds.pending,
        [],
        `${chapter}: worlds still pending at the start of play`,
      );
    assert.equal(initial.where, definition?.id || "court");
    assert.equal(initial.mode, chapter ? "play" : "title");
    assert(
      Object.values(initial.assets).every(Boolean),
      "Requested asset factories load successfully",
    );
    if (chapter) {
      if (initial.cinematic) await page.keyboard.press("Enter");
      await page.keyboard.down("Space");
      await new Promise((resolve) => setTimeout(resolve, 300));
      await page.keyboard.up("Space");
      const time = await page.evaluate(() => window.__GAME__.time);
      await page.waitForFunction(
        (time) => window.__GAME__.time > time + 2,
        {},
        time,
      );
    }
    await settled(page);
    const after = await page.evaluate(() => window.__GAME__);
    assert.equal(
      after.programs,
      after.programsAtLoad,
      `${chapter || "title"}: shaders compiled after preparation`,
    );
    await page.screenshot({ path: `${out}/${chapter || "title"}.png` });
    assert.deepEqual(errors, [], `${chapter || "title"}: browser errors`);
    results.push({
      chapter: chapter || "title",
      neighbors,
      loaded: after.worlds.loaded,
      programs: after.programs,
      prepared: after.programsAtLoad,
      assets: Object.keys(initial.assets).length,
      errors,
    });
    console.log(
      `PASS ${chapter || "title"}, worlds ${after.worlds.loaded.join(", ")}, ${after.programs} programs`,
    );
    await page.close();
  }
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${base}labs?manual=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__LAB__?.ready, { timeout: 120000 });
  const lab = await page.evaluate(async () => {
    const catalog = window.__LAB__.catalog.map((asset) => asset.id);
    const links = [...document.querySelectorAll("a[data-level]")].map(
      (link) => ({
        id: link.dataset.level,
        href: link.getAttribute("href"),
      }),
    );
    await window.__LAB__.setAsset("far_gate");
    const gate = window.__LAB__.snapshot();
    await window.__LAB__.setAsset("hero_previous");
    const previous = window.__CHARACTER__.snapshot();
    await window.__LAB__.setAsset("hero_realistic");
    await window.__LAB__.setEquipment("pistols");
    window.__CHARACTER__.setMotion("run");
    const character = window.__CHARACTER__.step(1);
    return {
      catalog,
      links,
      gate,
      previous,
      character,
      errors: window.__LAB__.snapshot().errors,
    };
  });
  assert.deepEqual(
    lab.catalog,
    ASSET_CATALOG.map((asset) => asset.id),
  );
  assert.deepEqual(
    lab.links.map((link) => link.id),
    WORLDS.map((world) => world.starts[0].id),
  );
  assert(lab.links.every((link) => link.href === `./?lab=1&level=${link.id}`));
  assert.equal(lab.gate.asset, "far_gate");
  assert(
    lab.gate.nativeSize.every((value) => Number.isFinite(value) && value > 0),
  );
  assert.equal(lab.previous.asset, "hero_previous");
  assert.equal(lab.character.asset, "hero_realistic");
  assert.equal(lab.character.motion, "run");
  assert.equal(lab.character.equipment, "pistols");
  assert(lab.character.phase > 0);
  assert.deepEqual([...errors, ...lab.errors], []);
  await page.screenshot({ path: `${out}/lab.png` });
  results.push({ chapter: "lab", ...lab });
  console.log(
    `PASS lab, ${lab.catalog.length} factories, ${lab.links.length} chapter links, archived and current animation and pistols`,
  );
  await page.close();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
