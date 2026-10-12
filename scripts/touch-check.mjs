// Checks the phone controls with real touch events on the jam gate's phone viewport: the title
// menus, the levels screen swiped and tapped, the opening shot skipped by a tap, the stick
// walking to the camp, the notes, a light
// push stopping at the terrace's edge, hanging and climbing back, pause and the mute, looking
// around, the landscape layout, the other two levels and the credits. Controls must never cover
// the text.
//   node scripts/touch-check.mjs [outDir] [--url=http://localhost:3002/]
import puppeteer from "puppeteer-core";
import { mkdir, rm, writeFile } from "node:fs/promises";

const out = process.argv[2] || "outputs/touch-check";
const url =
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
const PORTRAIT = {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};
const LANDSCAPE = { ...PORTRAIT, width: 844, height: 390 };
await page.setViewport(PORTRAIT);
await page.setUserAgent(
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on(
  "console",
  (m) =>
    m.type() === "error" &&
    !/Failed to load resource/.test(m.text()) &&
    errors.push(m.text()),
);
// Missing files are counted by address, as the jam gate does; a favicon is not the game's.
page.on("response", (r) => {
  if (r.status() >= 400 && !/\/favicon\.ico$/.test(r.url()))
    errors.push(`${r.status()} ${r.url()}`);
});
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};
const game = () => page.evaluate(() => window.__GAME__);
let n = 0;
const shot = (name) =>
  page.screenshot({
    path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`,
  });
const until = async (test, ms, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const g = await game();
    if (g && (await test(g))) return g;
    await sleep(80);
  }
  throw new Error(`${label}: ${JSON.stringify(await game()).slice(0, 300)}`);
};
async function open(query = "") {
  await page.goto(url + query, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 60000,
  });
  await sleep(900);
}

// Where an element is, if a player can see it.
const box = (sel) =>
  page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e || !e.getClientRects().length) return null;
    const s = getComputedStyle(e);
    if (s.visibility === "hidden" || Number(s.opacity) === 0) return null;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      r: r.width / 2,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
    };
  }, sel);
const visible = async (sel) => !!(await box(sel));
async function tap(sel) {
  const b = await box(sel);
  if (!b) throw new Error(`${sel} is not visible`);
  await page.touchscreen.tap(b.x, b.y);
  await sleep(250);
}
const text = (sel) =>
  page.evaluate((sel) => document.querySelector(sel)?.textContent ?? "", sel);

// Visible text that a visible control covers, or that runs off the screen.
async function clashes() {
  return page.evaluate(() => {
    const seen = (e) => {
      if (!e || !e.getClientRects().length) return null;
      const s = getComputedStyle(e);
      if (s.visibility === "hidden" || Number(s.opacity) < 0.05) return null;
      const r = e.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    const texts = [
      "#prompt.on",
      "#hint.on",
      "#relic-toast.on",
      "#subtitle.on",
      "#objective-box",
      "#chapter-card.on",
      "#health",
      "#address",
      "#boss",
    ];
    const controls = [
      "#stick",
      "#equipment-status",
      "#pace-status",
      ...[...document.querySelectorAll("#touch button")].map(
        (b) => `#touch button[data-touch="${b.dataset.touch}"]`,
      ),
    ];
    const found = [];
    const hit = (a, b) =>
      a.left < b.right - 1 &&
      b.left < a.right - 1 &&
      a.top < b.bottom - 1 &&
      b.top < a.bottom - 1;
    for (const t of texts) {
      const a = seen(document.querySelector(t));
      if (!a) continue;
      if (a.left < -1 || a.right > innerWidth + 1 || a.top < -1)
        found.push(`${t} off screen`);
      for (const c of controls) {
        const b = seen(document.querySelector(c));
        if (b && hit(a, b)) found.push(`${t} under ${c}`);
      }
      for (const u of texts) {
        if (u <= t) continue;
        const b = seen(document.querySelector(u));
        if (b && hit(a, b)) found.push(`${t} over ${u}`);
      }
    }
    return found;
  });
}

// The prompt, a hint card and a relic's card up together, as the game can show them, to test
// the layout with every control this world has; the game's own text is put back afterwards.
async function crowded() {
  await page.evaluate(() => {
    const p = document.querySelector("#prompt"),
      h = document.querySelector("#hint");
    const t = document.querySelector("#subtitle");
    const r = document.querySelector("#relic-toast");
    window.__saved = [
      p.innerHTML,
      p.className,
      h.innerHTML,
      h.className,
      t.style.bottom,
      r.innerHTML,
      r.className,
      document.querySelector("body").style.getPropertyValue("--prompt-height"),
    ];
    r.innerHTML =
      '<p class="kicker">Relic found · 5 of 5</p><p class="name">Mira\'s lantern</p><p class="line">Still burning low in the lee of the island. She meant to come back for it.</p>';
    r.classList.add("on");
    p.innerHTML = "<kbd>Use</kbd> Talk to the clerk at the booth";
    p.classList.add("on");
    document
      .querySelector("body")
      .style.setProperty("--prompt-height", `${p.offsetHeight}px`);
    h.innerHTML =
      '<p class="hint-title">Relay orb</p><p class="hint-body">Press <kbd>Link</kbd> to channel the orb toward a guard or a mechanism in view.</p>';
    h.classList.add("on");
  });
  await sleep(450);
  const found = await clashes();
  await page.evaluate(() => {
    const p = document.querySelector("#prompt"),
      h = document.querySelector("#hint");
    const t = document.querySelector("#subtitle");
    const r = document.querySelector("#relic-toast");
    [
      p.innerHTML,
      p.className,
      h.innerHTML,
      h.className,
      t.style.bottom,
      r.innerHTML,
      r.className,
    ] = window.__saved;
    document
      .querySelector("body")
      .style.setProperty("--prompt-height", window.__saved[7]);
  });
  return found;
}

// The levels screen's stage: its cards, the one in the middle and the starts it offers.
const stage = () =>
  page.evaluate(() => {
    const panel = document.querySelector('#menu [data-screen="levels"]');
    const slides = [...panel.querySelectorAll(".carousel-slide")];
    const name = (slide) =>
      slide?.dataset.world ||
      (slide?.classList.contains("sealed") ? "sealed" : "none");
    return {
      worlds: slides.map(name),
      current: name(slides.find((slide) => slide.dataset.place === "current")),
      open: [...panel.querySelectorAll(".level-starts button")]
        .filter((b) => !b.disabled)
        .map((b) => b.dataset.chapter),
    };
  });
// A finger drawn across the middle card, towards the left (-1) or the right (1).
async function swipe(direction) {
  const b = await box(
    '#menu [data-screen="levels"] .carousel-slide[data-place="current"]',
  );
  const contact = await page.touchscreen.touchStart(b.x - direction * 90, b.y);
  for (let i = 1; i <= 6; i++) {
    await contact.move(b.x - direction * 90 + direction * 30 * i, b.y);
    await sleep(20);
  }
  await contact.end();
  await sleep(800);
}
// The levels screen's lines that wrap or run out of their box, a card's text that runs past
// it, and anything off the screen.
const levelsFit = () =>
  page.evaluate(() => {
    const found = [];
    const panel = document.querySelector('#menu [data-screen="levels"]');
    const card = panel.querySelector('.carousel-slide[data-place="current"]');
    if (panel.scrollHeight > panel.clientHeight + 2)
      found.push("panel scrolls");
    if (document.documentElement.scrollWidth > innerWidth + 1)
      found.push("page scrolls sideways");
    for (const el of [
      ...panel.querySelectorAll(
        ":scope > :is(.kicker, .panel-title), nav button",
      ),
      ...card.querySelectorAll(":is(.kicker, h3, .label)"),
    ]) {
      if (!el.getClientRects().length) continue;
      const tops = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects())
          if (r.width > 1) tops.push(r.top);
      }
      const step = parseFloat(getComputedStyle(el).fontSize) * 0.8;
      const wraps = tops
        .sort((a, b) => a - b)
        .some((top, i, all) => i && top - all[i - 1] > step);
      if (wraps || el.scrollWidth > el.clientWidth + 1)
        found.push(`"${el.textContent.trim()}" wraps or is cut`);
    }
    const frame = card.getBoundingClientRect();
    const info = card.querySelector(".level-info");
    const text = info.getBoundingClientRect();
    if (
      text.top < frame.top - 1 ||
      text.bottom > frame.bottom + 1 ||
      info.scrollHeight > info.clientHeight + 1
    )
      found.push("the card's text runs past it");
    if (frame.top < 0 || frame.bottom > innerHeight)
      found.push("card off screen");
    for (const arrow of panel.querySelectorAll(".carousel-turn")) {
      const r = arrow.getBoundingClientRect();
      if (r.left < 0 || r.right > innerWidth) found.push("arrow off screen");
    }
    return found;
  });

// The stick: a finger lands on its centre and slides to (x right, y forward) of its throw.
let finger = null;
async function stick(x, y) {
  const b = await box("#stick");
  if (!finger) {
    finger = await page.touchscreen.touchStart(b.x, b.y);
    await sleep(60);
  }
  await finger.move(b.x + x * b.r, b.y - y * b.r);
}
async function lift() {
  if (finger) await finger.end();
  finger = null;
  await sleep(120);
}
// Steers with the stick until within `tol` of (x, z) or `stop` says so. A throw of 0.6 walks
// (and never steps off an edge); 0.95 runs.
async function walkTo(x, z, { tol = 0.4, run = false, stop, ms = 12000 } = {}) {
  const t0 = Date.now();
  let g;
  while (Date.now() - t0 < ms) {
    g = await game();
    if (stop && (await stop(g))) break;
    const dx = x - g.pos[0],
      dz = z - g.pos[1],
      d = Math.hypot(dx, dz);
    if (d < tol) break;
    const fx = Math.sin(g.camYaw),
      fz = Math.cos(g.camYaw);
    const k = run ? 0.95 : 0.6;
    await stick(((dx * -fz + dz * fx) / d) * k, ((dx * fx + dz * fz) / d) * k);
    await sleep(60);
  }
  await lift();
  return game();
}

async function holdTouch(action, duration) {
  const b = await box(`#touch [data-touch="${action}"]`);
  if (!b) throw new Error(`${action} touch control is hidden`);
  const contact = await page.touchscreen.touchStart(b.x, b.y);
  try {
    await sleep(duration);
  } finally {
    await contact.end();
  }
  await sleep(200);
}

async function openAirShield() {
  let g = await game();
  check("sea begins with buoyant swimming", g.swimming && g.state === "swim");
  check(
    "swimming offers Rise and Dive with no land combat controls",
    (await text('#touch [data-touch="jump"]')) === "Rise" &&
      (await text('#touch [data-touch="drop"]')) === "Dive" &&
      (await visible('#touch [data-touch="drop"]')) &&
      !(await visible('#touch [data-touch="throw"]')) &&
      !(await visible('#touch [data-touch="roll"]')),
  );
  const lower = g.feet;
  await holdTouch("jump", 700);
  const raised = (await game()).feet;
  check(
    "holding Rise swims upward",
    raised > lower + 0.6,
    `${lower} to ${raised}`,
  );
  await holdTouch("drop", 700);
  check("holding Dive swims downward", (await game()).feet < raised - 0.6);
  await shot("sea-swimming-portrait");
  let overlaps = await clashes();
  check("swimming fits in portrait", !overlaps.length, overlaps.join(", "));
  await page.setViewport(LANDSCAPE);
  await sleep(600);
  await shot("sea-swimming-landscape");
  overlaps = await clashes();
  check("swimming fits in landscape", !overlaps.length, overlaps.join(", "));
  await page.setViewport(PORTRAIT);
  // The arrival current: from the still water behind one pier to the next.
  const { shelters, lees } = g.sea.currents.arrival;
  for (const [i, [x, , z]] of shelters.entries()) {
    if (i > 0)
      await walkTo(
        Math.min(x, lees[i - 1].maxX - 0.7),
        Math.min(z, lees[i - 1].minZ - 0.7),
        { tol: 0.5, run: true },
      );
    await walkTo(x, z, { tol: 0.8, run: true });
  }
  await walkTo(9.5, -18, { tol: 0.8, run: true });
  const diveBox = await box('#touch [data-touch="drop"]');
  const dive = await page.touchscreen.touchStart(diveBox.x, diveBox.y);
  try {
    g = await until(
      (s) => s.sea?.intro?.near,
      8000,
      "dive to the shield beacon",
    );
  } finally {
    await dive.end();
  }
  await sleep(250);
  check(
    "swim route reaches the submerged beacon",
    g.sea.intro.near && !g.sea.intro.active,
  );
  await shot("sea-beacon");
  await tap('#touch [data-touch="interact"]');
  g = await until(
    (s) => s.sea?.intro?.active,
    2500,
    "Use activates the air shield",
  );
  check(
    "Use begins the visible shield transition",
    g.sea.intro.progress > 0 && g.sea.intro.progress < 1,
  );
  await shot("sea-shield-forming");
  g = await until(
    (s) => s.sea?.intro?.ready && s.state === "ground",
    6000,
    "shield drains the landing",
  );
  check(
    "shield restores grounded movement",
    !g.swimming && Math.abs(g.feet - 25) < 0.1,
  );
  check(
    "land controls return after swimming",
    (await text('#touch [data-touch="jump"]')) === "Jump" &&
      (await text('#touch [data-touch="drop"]')) === "Hang" &&
      (await visible('#touch [data-touch="throw"]')) &&
      (await visible('#touch [data-touch="roll"]')),
  );
  await shot("sea-shield-ready");
}

try {
  // The jam gate's own gesture: a tap on #startb, two seconds, then a finger on the stick's
  // centre dragged up by a third of its height and held for six seconds.
  await open();
  await tap("#startb");
  await sleep(2000);
  const before = (await game()).pos;
  const s0 = await box("#stick");
  const drag = await page.touchscreen.touchStart(s0.x, s0.y);
  await sleep(120);
  await drag.move(s0.x, s0.y - Math.max(24, s0.r * 2 * 0.35));
  await sleep(6000);
  await drag.end();
  const after = await game();
  check(
    "the gate's drag skips the opening and walks a metre",
    !after.cinematic &&
      Math.hypot(after.pos[0] - before[0], after.pos[1] - before[1]) >= 1,
    `${Math.hypot(after.pos[0] - before[0], after.pos[1] - before[1]).toFixed(2)} m`,
  );

  await open();
  await shot("title");
  check(
    "the title asks for taps",
    /Tap to choose/.test(await text('[data-help="menu"]')),
    await text('[data-help="menu"]'),
  );
  check("no controls over the title", !(await visible("#stick")));

  // Levels on a save at the first world: that world and the sealed door, turned by a swipe and
  // by the arrows, in portrait and on its side.
  await tap('#menu [data-action="levels"]');
  await sleep(500);
  let levels = await stage();
  check(
    "a first save's levels show the first world and one sealed door",
    levels.worlds.join() === "court,sealed" && levels.current === "court",
    `${levels.worlds} on ${levels.current}`,
  );
  await swipe(-1);
  levels = await stage();
  check(
    "a swipe to the left turns to the sealed door, which offers no start",
    levels.current === "sealed" && !levels.open.length,
    `${levels.current} ${levels.open}`,
  );
  await shot("levels-sealed");
  await swipe(1);
  check(
    "a swipe to the right turns back to the first world",
    (await stage()).current === "court",
  );
  await tap('#menu .carousel-turn[data-turn="1"]');
  await sleep(600);
  const tapped = (await stage()).current;
  await tap('#menu .carousel-turn[data-turn="-1"]');
  await sleep(600);
  check(
    "a tap on an arrow turns the stage",
    tapped === "sealed" && (await stage()).current === "court",
    tapped,
  );
  await shot("levels-portrait");
  let fit = await levelsFit();
  check("the levels screen fits in portrait", !fit.length, fit.join(", "));
  await page.setViewport(LANDSCAPE);
  await sleep(700);
  await shot("levels-landscape");
  fit = await levelsFit();
  check("the levels screen fits in landscape", !fit.length, fit.join(", "));
  await page.setViewport(PORTRAIT);
  await sleep(500);

  // A save further along: the stage opens on its world, and a tap starts the one before it.
  await page.evaluate(() =>
    localStorage.setItem(
      "far-door-progress",
      JSON.stringify({
        reached: ["court", "floor", "checkpoint", "isles"],
        last: "isles",
      }),
    ),
  );
  await open();
  await tap('#menu [data-action="levels"]');
  await sleep(500);
  levels = await stage();
  await swipe(1);
  const turnedTo = await stage();
  await tap(
    '#menu .carousel-slide[data-place="current"] [data-chapter="checkpoint"]',
  );
  await page.waitForFunction(
    () => window.__READY__ && window.__GAME__?.chapter === "checkpoint",
    { timeout: 90000 },
  );
  const playing = await until(
    (s) => s.mode === "play",
    6000,
    "start the checkpoint",
  );
  check(
    "a tap on a later world's start plays it",
    levels.current === "three" &&
      turnedTo.current === "two" &&
      playing.where === "two",
    `${levels.current} then ${turnedTo.current}, playing ${playing.where}`,
  );
  await page.evaluate(() => localStorage.removeItem("far-door-progress"));
  await open();

  await tap('#menu [data-action="controls"]');
  await shot("controls");
  const rows = await text("#controls-keys");
  check(
    "Controls lists the on-screen controls",
    /Stick/.test(rows) && /Drag the picture/.test(rows) && !/Mouse/.test(rows),
  );
  await tap('#menu .panel:not([hidden]) [data-action="back"]');
  await tap('#menu [data-action="settings"]');
  await shot("settings");
  check(
    "a phone starts on balanced quality",
    (await page.$eval("#set-quality", (e) => e.value)) === "balanced",
  );
  await tap('#menu .panel:not([hidden]) [data-action="back"]');

  // A new game from the real start button; the opening shot, its title and its narration.
  await tap("#startb");
  let g = await until((g) => g.mode === "play" && g.cinematic, 3000, "start");
  await sleep(1700);
  await shot("opening");
  check(
    "the opening's title and narration stay apart",
    !(await clashes()).length,
    (await clashes()).join(", "),
  );
  check(
    "only the stick shows during the shot",
    (await visible("#stick")) && !(await visible('#touch [data-touch="jump"]')),
  );
  const canvas = await box("#view");
  await page.touchscreen.tap(canvas.x + 60, canvas.y - 120);
  g = await until((g) => !g.cinematic, 3000, "a tap skips the opening");
  check("a tap on the picture skips the opening", true);
  await sleep(1600);
  await shot("play");
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("#touch button")]
      .filter(
        (b) =>
          b.offsetParent !== null && getComputedStyle(b).display !== "none",
      )
      .map((b) => b.dataset.touch),
  );
  check(
    "the expedition begins unarmed before equipment is recovered",
    buttons.sort().join() === "interact,jump,pause" &&
      g.equipment.selected === "none" &&
      !g.equipment.pistolsUnlocked &&
      g.equipment.ammo === 0 &&
      !g.equipment.orbAvailable &&
      !g.equipment.orbUnlocked,
    { buttons, equipment: g.equipment },
  );
  check(
    "nothing covers the play text",
    !(await clashes()).length,
    (await clashes()).join(", "),
  );

  // The stick to the camp, and the notes with a tap on Use and a tap to put them back.
  const start = g.pos;
  g = await walkTo(22.08, 40.5, {
    stop: async () => /Read/.test(await text("#prompt.on")),
  });
  check(
    "the stick walks the explorer to the camp",
    Math.hypot(g.pos[0] - start[0], g.pos[1] - start[1]) > 1.5 &&
      /Read/.test(await text("#prompt.on")),
    `${g.pos.map((v) => v.toFixed(2))} "${await text("#prompt.on")}"`,
  );
  await shot("camp");
  await tap('#touch [data-touch="interact"]');
  await sleep(300);
  check(
    "Use opens the notes, which say how to put them back",
    (await visible("#notes")) &&
      /Tap to put them back/.test(await text("#notes")),
  );
  check("the controls step aside for the notes", !(await visible("#stick")));
  await shot("notes");
  const sheet = await box("#notes");
  await page.touchscreen.tap(sheet.x, sheet.y);
  g = await until((g) => g.step === "gap", 3000, "notes closed");
  check(
    "a tap puts the notes back and the story moves on",
    !(await visible("#notes")),
  );
  await sleep(5000);
  await shot("hint");
  check(
    "nothing covers the first hint",
    !(await clashes()).length,
    (await clashes()).join(", "),
  );

  // A light push stops at the terrace's edge; there Hang shows, and Jump climbs back.
  g = await walkTo(19.4, 34, { ms: 6000 });
  await sleep(500);
  g = await game();
  check(
    "a light push stops at the terrace's edge",
    g.state === "ground" && Math.abs(g.feet - 8) < 0.05 && g.pos[1] < 36.4,
    `${g.pos.map((v) => v.toFixed(2))} feet ${g.feet.toFixed(2)}`,
  );
  check("Hang shows at the edge", await visible('#touch [data-touch="drop"]'));
  check(
    "nothing covers the edge's prompt",
    !(await clashes()).length,
    (await clashes()).join(", "),
  );
  await shot("edge");
  await tap('#touch [data-touch="drop"]');
  g = await until((g) => g.state === "hang", 2000, "hang");
  check("Hang hangs from the edge", true);
  await shot("hanging");
  await tap('#touch [data-touch="jump"]');
  g = await until(
    (g) => g.state === "ground" && Math.abs(g.feet - 8) < 0.05,
    3000,
    "climb up",
  );
  check("Jump climbs back onto the terrace", true);

  // Looking around with a drag on the picture.
  const yaw = (await game()).camYaw;
  const look = await page.touchscreen.touchStart(canvas.x + 80, canvas.y - 60);
  for (let i = 1; i <= 6; i++) {
    await look.move(canvas.x + 80 - i * 20, canvas.y - 60);
    await sleep(40);
  }
  await look.end();
  await sleep(200);
  check(
    "a drag on the picture turns the view",
    Math.abs((await game()).camYaw - yaw) > 0.2,
    `${yaw.toFixed(2)} → ${(await game()).camYaw.toFixed(2)}`,
  );

  await tap('#touch [data-touch="pause"]');
  g = await until((g) => g.paused, 2000, "pause");
  check("the pause button pauses", !(await visible("#stick")));
  // The speaker shares the pause button's corner: the tap that paused must not mute.
  check("the pause tap leaves the sound on", !(await game()).audio.muted);
  await shot("pause");
  await tap("#mute");
  check("a tap on the speaker mutes", (await game()).audio.muted);
  await tap("#mute");
  check("a second tap brings the sound back", !(await game()).audio.muted);
  await tap('#menu [data-action="resume"]');
  g = await until((g) => !g.paused, 2000, "resume");
  check("Resume returns to the controls", await visible("#stick"));

  await page.setViewport(LANDSCAPE);
  await sleep(800);
  await shot("landscape");
  check(
    "nothing covers the text in landscape",
    !(await clashes()).length,
    (await clashes()).join(", "),
  );
  const sideways = await crowded();
  check(
    "a prompt and a card fit in landscape",
    !sideways.length,
    sideways.join(", "),
  );
  await page.setViewport(PORTRAIT);

  // The checkpoint and the isles, from the development shortcuts.
  await open("?chapter=checkpoint");
  await sleep(2500);
  await shot("checkpoint");
  check(
    "the checkpoint adds Roll",
    await visible('#touch [data-touch="roll"]'),
  );
  check(
    "nothing covers the checkpoint's text",
    !(await clashes()).length,
    (await clashes()).join(", "),
  );
  let full = await crowded();
  check(
    "a prompt and a card fit beside every control",
    !full.length,
    full.join(", "),
  );
  await page.setViewport(LANDSCAPE);
  await sleep(800);
  await shot("checkpoint-landscape");
  full = [...(await clashes()), ...(await crowded())];
  check("the checkpoint fits in landscape", !full.length, full.join(", "));
  await page.setViewport(PORTRAIT);
  await open("?chapter=isles");
  await sleep(2500);
  await shot("isles");
  check(
    "nothing covers the isles' text",
    !(await clashes()).length,
    (await clashes()).join(", "),
  );
  full = await crowded();
  check("the isles fit a prompt and a card", !full.length, full.join(", "));
  await open("?chapter=frost");
  await sleep(2500);
  await shot("frost");
  full = [...(await clashes()), ...(await crowded())];
  check("the frozen reach fits every control", !full.length, full.join(", "));
  await page.setViewport(LANDSCAPE);
  await sleep(800);
  await shot("frost-landscape");
  full = [...(await clashes()), ...(await crowded())];
  check("the frozen reach fits in landscape", !full.length, full.join(", "));
  await page.setViewport(PORTRAIT);

  for (const chapter of ["forest", "sea"]) {
    await open(`?chapter=${chapter}`);
    await sleep(2500);
    const start = (await game()).pos;
    await stick(0, 0.9);
    await sleep(800);
    await lift();
    const moved = (await game()).pos;
    check(
      `${chapter} moves with the touch stick`,
      Math.hypot(moved[0] - start[0], moved[1] - start[1]) > 1,
    );
    if (chapter === "sea") await openAirShield();
    check(
      `${chapter} offers Link and Roll`,
      (await visible('#touch [data-touch="throw"]')) &&
        (await visible('#touch [data-touch="roll"]')),
    );
    const held = await until(
      (g) =>
        g[chapter]?.disc?.state === "held" &&
        typeof g[chapter].disc.charged === "boolean",
      3000,
      `${chapter} has valid held-orb telemetry before touch`,
    );
    await tap('#touch [data-touch="throw"]');
    const linked = await until(
      (g) =>
        g[chapter]?.disc?.state === "held" &&
        g[chapter].disc.activations > held[chapter].disc.activations,
      3000,
      `${chapter} channels the held orb after touch`,
    );
    check(
      `${chapter} channels the orb with touch`,
      linked[chapter].disc.activations === held[chapter].disc.activations + 1 &&
        linked[chapter].disc.kind === "orb",
      `${held[chapter].disc.activations} to ${linked[chapter].disc.activations}`,
    );
    await shot(`${chapter}-portrait`);
    full = await clashes();
    check(`${chapter} fits in portrait`, !full.length, full.join(", "));
    await page.setViewport(LANDSCAPE);
    await sleep(800);
    await shot(`${chapter}-landscape`);
    full = await clashes();
    check(`${chapter} fits in landscape`, !full.length, full.join(", "));
    await page.setViewport(PORTRAIT);
  }

  // The credits skip at a tap.
  await open();
  await tap('#menu [data-action="credits"]');
  await sleep(1500);
  check(
    "the credits say a tap skips them",
    /Tap to skip/.test(await text('[data-help="skip"]')),
  );
  await shot("credits");
  const sheetC = await box("#credits");
  await page.touchscreen.tap(sheetC.x, sheetC.y);
  g = await until((g) => !g.credits && g.menu === "main", 4000, "credits");
  check("a tap skips the credits", true);
} catch (e) {
  check("run", false, e.message);
}
check("no page or console error", !errors.length, errors.join(" | "));
await writeFile(
  `${out}/log.json`,
  JSON.stringify({ results, errors }, null, 2),
);
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
