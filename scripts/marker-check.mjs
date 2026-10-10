import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const out = process.argv[2] || "outputs/marker-check";
const url =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/";
const override = process.argv.find((a) => a.startsWith("--hud="))?.slice(6);
const source = override ? await readFile(override, "utf8") : null;
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const results = [],
  errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({
    width: 1280,
    height: 720,
    hasTouch: true,
    isMobile: false,
  });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/(main|analytics)\.js$/.test(path))
      return request.respond({
        status: 200,
        contentType: "text/javascript",
        body: "",
      });
    if (source && path.endsWith("/hud.js"))
      return request.respond({
        status: 200,
        contentType: "text/javascript",
        body: source,
      });
    return request.continue();
  });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; } body > :not(#hud):not(#view) { display:none !important; }",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const { Hud } = await import("./hud.js");
    const THREE = await import("three");
    const hud = new Hud(
      { label: (a) => a, keyLabel: (a) => a, moveLabel: () => "WASD" },
      { markers: true, hints: false },
    );
    hud.show();
    hud.objective(
      "Find the castle beyond the trees",
      "The root door has opened. Follow the river uphill.",
    );
    hud.setAddress(["twin", "spiral", "peak"]);
    hud.health(3, 3);
    const camera = new THREE.PerspectiveCamera(
      58,
      innerWidth / innerHeight,
      0.1,
      200,
    );
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const from = new THREE.Vector3(0, 0, -80);
    const aim = (x, y) => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      hud.setMarkers([new THREE.Vector3(x, y, 0).unproject(camera)]);
      hud.updateMarkers(camera, from);
    };
    window.fixture = { hud, camera, from, aim };
  });
  const snapshot = (name) =>
    page.evaluate((name) => {
      const marker = document.querySelector(".marker");
      const seen = (el) => {
        const style = getComputedStyle(el),
          r = el.getBoundingClientRect();
        return !el.hidden &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          r.width &&
          r.height
          ? r
          : null;
      };
      const rects = [marker, ...marker.children].map(seen).filter(Boolean);
      const m = {
        left: Math.min(...rects.map((r) => r.left)),
        right: Math.max(...rects.map((r) => r.right)),
        top: Math.min(...rects.map((r) => r.top)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
      };
      const clashes = [
        "objective-box",
        "address",
        "health",
        "breath",
        "boss",
        "relic-toast",
        "prompt",
        "hint",
        "subtitle",
      ].filter((id) => {
        const r = seen(document.getElementById(id));
        return (
          r &&
          m.left < r.right &&
          m.right > r.left &&
          m.top < r.bottom &&
          m.bottom > r.top
        );
      });
      return {
        name,
        clashes,
        marker: m,
        arrow: marker.firstChild.style.transform,
        edge: marker.classList.contains("edge"),
        onscreen:
          m.left >= 0 &&
          m.right <= innerWidth &&
          m.top >= 0 &&
          m.bottom <= innerHeight,
      };
    }, name);
  async function verify(name, x, y) {
    await page.evaluate(([x, y]) => fixture.aim(x, y), [x, y]);
    const result = await snapshot(name);
    results.push(result);
    await page.screenshot({ path: `${out}/${name}.png` });
    assert.deepEqual(
      result.clashes,
      [],
      `${name}: marker overlaps ${result.clashes}`,
    );
    assert.equal(result.onscreen, true, `${name}: marker remains on screen`);
    return result;
  }
  const offscreen = await verify("desktop-objective-edge", -2, 1.5);
  assert.equal(offscreen.edge, true);
  assert.match(offscreen.arrow, /rotate\(-53\.130/);
  const onscreen = await verify("desktop-objective-projected", -0.65, 0.8);
  assert.equal(onscreen.edge, true, "a displaced target has a direction arrow");
  assert.match(
    onscreen.arrow,
    /^rotate\(0deg\)/,
    "the displaced arrow points toward the target above",
  );
  await page.evaluate(() => {
    const el = document.getElementById("objective-box");
    el.style.setProperty("animation", "objective-in 0.9s ease", "important");
    fixture.hud.objective(
      "Follow the root door to the castle",
      "The river leads uphill.",
    );
    el.getAnimations().forEach((animation) => {
      animation.pause();
      animation.currentTime = 0;
    });
    fixture.aim(-0.65, 0.8);
    el.getAnimations().forEach((animation) => {
      animation.currentTime = 899;
    });
    fixture.hud.updateMarkers(fixture.camera, fixture.from);
  });
  const animated = await snapshot("objective-animation-cache");
  results.push(animated);
  assert.deepEqual(
    animated.clashes,
    [],
    "marker stays clear after the objective entrance animation",
  );
  await page.screenshot({ path: `${out}/objective-animation-cache.png` });
  await page.evaluate(() =>
    document.getElementById("objective-box").style.removeProperty("animation"),
  );
  const reads = await page.evaluate(() => {
    let reads = 0;
    const panels = [
      "objective-box",
      "address",
      "health",
      "breath",
      "boss",
      "relic-toast",
      "prompt",
      "hint",
      "subtitle",
    ].map((id) => document.getElementById(id));
    for (const el of panels) {
      const original = el.getBoundingClientRect.bind(el);
      el.getBoundingClientRect = () => {
        reads++;
        return original();
      };
    }
    for (let i = 0; i < 120; i++)
      fixture.hud.updateMarkers(fixture.camera, fixture.from);
    const stable = reads;
    fixture.hud.sub(
      "A longer objective description changes the panel height and must refresh marker placement before the next frame.",
    );
    fixture.hud.updateMarkers(fixture.camera, fixture.from);
    return { stable, changed: reads - stable };
  });
  results.push({ name: "bounds-cache", ...reads });
  assert.equal(reads.stable, 0, "stable frames must not read panel layout");
  assert.ok(reads.changed > 0, "changed objective text refreshes panel bounds");
  await verify("desktop-address", 0, 2);
  await verify("desktop-health", 2, 1.5);
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: false,
    hasTouch: true,
  });
  await page.evaluate(() => document.body.classList.add("touch"));
  await verify("portrait-objective", -0.45, 0.7);
  await page.evaluate(() =>
    fixture.hud.boss(
      "Tide Guardian",
      5,
      6,
      "Charge the disc through the sunlight",
    ),
  );
  await verify("portrait-boss", 0, 2);
  await page.setViewport({
    width: 844,
    height: 390,
    isMobile: false,
    hasTouch: true,
  });
  await verify("landscape-objective", -2, 1.5);
  await verify("landscape-boss", 0, 2);
  await page.evaluate(() =>
    fixture.hud.relic(
      "Mira's compass",
      "The needle points toward the drowned gate.",
      6,
      7,
    ),
  );
  await verify("landscape-relic", 2, 1.5);
  await page.evaluate(() => {
    fixture.hud.objective("");
    fixture.hud.hideBoss();
    fixture.hud.hideHealth();
    document.getElementById("address").hidden = true;
    document.getElementById("relic-toast").classList.remove("on");
  });
  const centered = await verify("unobstructed-center", 0, 0);
  assert.equal(centered.edge, false);
  assert.equal(centered.marker.top < 195 && centered.marker.bottom > 195, true);
  await page.evaluate(() => {
    const { hud } = fixture;
    hud.settings.hints = true;
    hud.hint(
      "The Drowned Archive",
      "Swim to the control desk on the right. Rise, Dive and Use wake its air shield.",
      60,
    );
    hud.prompt("swim");
    hud.subtitle("The shield is pushing the sea back. Air, at last.", 60);
  });
  await verify("landscape-swimming-prompt", 0, -0.8);
  const lowered = await verify("landscape-swimming-hint", -0.55, 0.62);
  assert.equal(lowered.edge, true);
  assert.match(lowered.arrow, /^rotate\(0deg\)/);
  await page.setViewport({ width: 375, height: 812, hasTouch: true });
  await page.evaluate(() => fixture.hud.prompt("swim"));
  await verify("portrait-swimming-prompt", 0, -0.55);
  await page.evaluate(() => {
    fixture.hud.prompt(null);
    fixture.hud.clearHint();
    fixture.hud.clearSubtitle();
  });
  const restored = await verify("dismissed-guidance-restores-projection", 0, 0);
  assert.equal(restored.edge, false);
  assert.deepEqual(errors, []);
  console.log(`PASS: ${results.length} marker layout checks`);
} catch (error) {
  errors.push(error.stack);
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ override: override || null, results, errors }, null, 2) +
      "\n",
  );
  const chrome = browser.process();
  await browser.close();
  chrome?.stdout?.destroy();
  chrome?.stderr?.destroy();
}
