// The relics: in each world the explorer is set down on the way nearby, walks to the relic
// with real key events, takes it with E, and the check reads the card, the count and the
// telemetry. Then the title's Relics screen lists them, a reload keeps them, and
// forgetting the progress in Settings puts every relic back where it was left.
//   node scripts/relic-check.mjs [outDir] [--url=http://localhost:3002/]
import puppeteer from "puppeteer-core";
import { mkdir, rm, writeFile } from "node:fs/promises";

const out = process.argv[2] || "outputs/relic-check";
const base =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/";
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on(
  "response",
  (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`),
);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(
    `${ok ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
};
const state = () => page.evaluate(() => window.__GAME__);
const held = new Set();
async function hold(keys) {
  if (["KeyW", "KeyA", "KeyS", "KeyD"].some((key) => keys.has(key))) {
    const current = await state();
    const pace = keys.has("ShiftLeft") ? "walk" : "run";
    if (
      current?.mode === "play" &&
      !current.paused &&
      !current.cinematic &&
      !current.crossing &&
      current.pace !== pace
    ) {
      await page.keyboard.press("ShiftLeft");
      await page.waitForFunction(
        (pace) => window.__GAME__?.pace === pace,
        { timeout: 3000 },
        pace,
      );
    }
  }
  keys = new Set([...keys].filter((key) => key !== "ShiftLeft"));
  for (const k of [...held])
    if (!keys.has(k)) (await page.keyboard.up(k), held.delete(k));
  for (const k of keys)
    if (!held.has(k)) (await page.keyboard.down(k), held.add(k));
}
function steer(s, x, z) {
  const dx = x - s.pos[0],
    dz = z - s.pos[1],
    d = Math.hypot(dx, dz) || 1;
  const fx = Math.sin(s.camYaw),
    fz = Math.cos(s.camYaw);
  const f = (dx * fx + dz * fz) / d,
    r = (dx * -fz + dz * fx) / d;
  const keys = [];
  if (f > 0.38) keys.push("KeyW");
  if (f < -0.38) keys.push("KeyS");
  if (r > 0.38) keys.push("KeyD");
  if (r < -0.38) keys.push("KeyA");
  return { keys, d };
}
async function go(x, z, { tol = 0.3, timeout = 15000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await state();
    const { keys, d } = steer(s, x, z);
    if (d < tol) {
      await hold(new Set());
      return s;
    }
    if (d < 1.5) keys.push("ShiftLeft");
    await hold(new Set(keys));
    await sleep(25);
  }
  await hold(new Set());
  const s = await state();
  throw new Error(`go ${x},${z} stuck at ${s.pos.map((v) => v.toFixed(2))}`);
}

// From a spot on the way, the relic's own spot to walk to, and where it lies.
const HUNTS = [
  { id: "papyrus", chapter: "floor", from: [22.4, 0, 19.6], to: [25.35, 16.9] },
  {
    id: "radio",
    chapter: "checkpoint",
    from: [-4, 0, -37.5],
    to: [-9.05, -36.8],
  },
  { id: "page", chapter: "isles", from: "ledge", to: [13.75, -102.95] },
  { id: "scarf", chapter: "frost", from: [3, 3.8, -76.8], to: [-5.35, -78.1] },
  {
    id: "lantern",
    chapter: "frost",
    from: [-5, 0.6, -152],
    to: [-9.6, -159.8],
  },
  { id: "grove-map", chapter: "forest", from: "near", to: [8, -117] },
  { id: "pressure-log", chapter: "sea", from: [0, 28, -40], to: [-3.6, -41.3] },
];

let catalogue;

try {
  for (const [i, h] of HUNTS.entries()) {
    await page.goto(`${base}?nolock=1&debug=1&chapter=${h.chapter}`, {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.__READY__ === true, {
      timeout: 90000,
    });
    await page.waitForFunction(() => window.__GAME__?.mode === "play", {
      timeout: 20000,
    });
    await page.waitForFunction(() => !window.__GAME__.worlds.pending.length, {
      timeout: 120000,
    });
    await sleep(1200);
    catalogue ??= await page.evaluate(async () =>
      (await import("./relics.js")).RELICS.map((def) => ({
        id: def.id,
        physical: !!def.asset,
      })),
    );
    // Set down on the way: the start of the relic's world is far off, the walk is real.
    await page.evaluate(({ from, id, chapter }) => {
      const { hero, follow, worldThree, worldSix, worlds } = window.__FD__;
      if (chapter === "sea") {
        worldSix.drowned.sanctuary.reset(true);
        worldSix.drowned.breath.reset();
      }
      if (from === "ledge") {
        const c = worldThree.isles.isle("ledge").collider;
        hero.spawn(c.x, c.z, worldThree.isles.groundAt(c.x, c.z), Math.PI);
      } else if (from === "near") {
        const spot = window.__GAME__.relicSpots.find((item) => item.id === id);
        const x = spot.at[0] - 3,
          z = spot.at[2] + 1.5;
        hero.spawn(x, z, worlds.current.level.groundAt(x, z), Math.PI);
      } else hero.spawn(from[0], from[2], from[1], Math.PI);
      follow.snap(hero);
    }, h);
    await sleep(600);
    const before = await state();
    const spot = before.relicSpots.find((r) => r.id === h.id);
    check(`${h.id} waits in its world`, spot, spot ? spot.at.join(", ") : "");
    await go(h.to[0], h.to[1]);
    // Face it: a step towards the relic itself.
    const s0 = await state();
    const { keys } = steer(s0, spot.at[0], spot.at[2]);
    await hold(new Set([...keys, "ShiftLeft"]));
    await sleep(160);
    await hold(new Set());
    await sleep(250);
    const prompt = await page.$eval("#prompt", (p) => p.textContent.trim());
    check(`${h.id}: the prompt offers it`, /^E /.test(prompt), prompt);
    await page.keyboard.down("KeyE");
    await sleep(120);
    await page.keyboard.up("KeyE");
    await sleep(500);
    const card = await page.$eval("#relic-toast", (t) => ({
      on: t.classList.contains("on"),
      text: t.innerText.replace(/\s+/g, " ").trim(),
    }));
    check(
      `${h.id}: taken, with its card`,
      card.on &&
        card.text.toLowerCase().includes(`${i + 1} of ${catalogue.length}`),
      card.text,
    );
    await page.screenshot({
      path: `${out}/${String(i + 1).padStart(2, "0")}-${h.id}.png`,
    });
    await sleep(900);
    const after = await state();
    check(
      `${h.id}: counted and gone from the world`,
      after.relics.includes(h.id) &&
        !after.relicSpots.some((r) => r.id === h.id),
      after.relics.join(","),
    );
    check(
      `${h.id}: no shader compiled by taking it`,
      after.programs === before.programs,
      `${before.programs} -> ${after.programs}`,
    );
  }

  // The title after a reload: the count, the screen, and the relics still taken.
  await page.goto(`${base}?nolock=1&debug=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await sleep(800);
  const button = await page.$eval(
    '#menu [data-screen="main"] [data-action="relics"]',
    (b) =>
      `${b.querySelector(".label").textContent} ${b.querySelector(".detail").textContent}`,
  );
  check(
    "the title counts the relics after a reload",
    button === `Relics ${HUNTS.length}/${catalogue.length}`,
    button,
  );
  await page.click('#menu [data-screen="main"] [data-action="relics"]');
  await sleep(500);
  const screen = await page.evaluate(() => ({
    count: document.querySelector("#relic-count").textContent,
    cards: [...document.querySelectorAll("#relic-list li")].map((c) => ({
      id: c.dataset.relic,
      missing: c.classList.contains("missing"),
      name: c.querySelector("button").getAttribute("aria-label"),
    })),
  }));
  check(
    "the Relics screen lists found pickups and retains earned records as hidden",
    screen.cards.length === catalogue.length &&
      screen.cards.filter((c) => !c.missing).length === HUNTS.length &&
      catalogue.every((def) =>
        screen.cards.some(
          (card) => card.id === def.id && card.missing === !def.physical,
        ),
      ),
    screen.cards.map((c) => c.name).join(" / "),
  );
  await page.screenshot({ path: `${out}/06-relics-screen.png` });
  const kept = await state();
  check(
    "no relic waits in any world after the reload",
    kept.relicSpots.length === 0,
    String(kept.relicSpots.length),
  );

  // Forgetting the progress puts them back. The title prepares every world in the background,
  // and a world's relics appear as it builds, so the comparison waits for that to finish.
  await page.waitForFunction(
    () =>
      !window.__GAME__.worlds.pending.length &&
      !window.__GAME__.streaming.jobs.length,
    { timeout: 240000, polling: 250 },
  );
  await page.keyboard.press("Escape");
  await sleep(300);
  await page.click('#menu [data-screen="main"] [data-action="settings"]');
  await sleep(300);
  await page.click('#menu [data-action="reset-progress"]');
  await sleep(300);
  await page.click('#menu [data-action="confirm-yes"]');
  await sleep(500);
  const reset = await state();
  const huntWorld = {
    floor: "court",
    checkpoint: "two",
    isles: "three",
    frost: "four",
    forest: "five",
    sea: "six",
  };
  const expectedWaiting = HUNTS.filter((hunt) =>
    reset.worlds.loaded.includes(huntWorld[hunt.chapter]),
  )
    .map((hunt) => hunt.id)
    .sort();
  const waiting = reset.relicSpots.map((spot) => spot.id).sort();
  check(
    "forgetting the progress restores relics in loaded worlds",
    reset.relics.length === 0 &&
      waiting.includes("papyrus") &&
      waiting.join() === expectedWaiting.join(),
    JSON.stringify({
      found: reset.relics,
      waiting,
      loaded: reset.worlds.loaded,
    }),
  );
  const cleared = await page.$eval(
    '#menu [data-screen="main"] [data-action="relics"]',
    (b) => b.textContent.trim(),
  );
  check("the title's count is cleared", cleared === "Relics", cleared);
  // Confirming returns to Settings.
  await page.keyboard.press("Escape");
  await sleep(300);
  await page.click('#menu [data-screen="main"] [data-action="relics"]');
  await sleep(400);
  const none = await page.evaluate(
    () => [...document.querySelectorAll("#relic-list li.missing")].length,
  );
  check(
    "the Relics screen shows every item still hidden",
    none === catalogue.length,
    String(none),
  );
  await page.screenshot({ path: `${out}/07-relics-hidden.png` });
  for (const chapter of new Set(HUNTS.map((hunt) => hunt.chapter))) {
    await page.goto(`${base}?nolock=1&chapter=${chapter}`, {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.__READY__ === true, {
      timeout: 90000,
    });
    const restored = await state();
    const ids = HUNTS.filter((hunt) => hunt.chapter === chapter).map(
      (hunt) => hunt.id,
    );
    check(
      `${chapter}: newly loaded relics return after forgetting progress`,
      restored.relics.length === 0 &&
        ids.every((id) => restored.relicSpots.some((spot) => spot.id === id)),
      ids.join(", "),
    );
  }
} catch (e) {
  check("the run finished", false, e.message);
}
check(
  "no page or console error",
  errors.length === 0,
  errors.slice(0, 3).join(" | "),
);
await writeFile(
  `${out}/results.json`,
  JSON.stringify({ results, errors }, null, 2),
);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
