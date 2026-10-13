// Checks the menus and level flow with real key events: the title menu, the levels screen
// turned with keys and its arrows, Settings, the mute, pausing, starting any reached level from
// the levels screen, restarting, quitting to the title, the credits,
// walking back through the first door, a new game's opening and notes, a knockout at the
// checkpoint, and the ways back from the isles to the checkpoint and from the frozen reach to
// the isles.
//   node scripts/menu-check.mjs [outDir] [--url=http://localhost:3002/?nolock=1]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const out = process.argv[2] || "outputs/menu-check";
const url =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/?nolock=1";
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
page.on(
  "console",
  (m) => m.type() === "error" && !/404/.test(m.text()) && errors.push(m.text()),
);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};
const game = () => page.evaluate(() => window.__GAME__);
const press = async (code, ms = 60) => {
  await page.keyboard.down(code);
  await sleep(ms);
  await page.keyboard.up(code);
  await sleep(160);
};
const focused = () =>
  page.evaluate(
    () =>
      document
        .querySelector("#menu .panel:not([hidden]) .focus")
        ?.textContent?.trim() || null,
  );
// The levels screen's stage: its cards, the one in the middle and the starts it offers.
const stage = () =>
  page.evaluate(() => {
    const panel = document.querySelector('#menu [data-screen="levels"]');
    const slides = [...panel.querySelectorAll(".carousel-slide")];
    const name = (slide) =>
      slide?.dataset.world ||
      (slide?.classList.contains("sealed") ? "sealed" : "none");
    const buttons = [...panel.querySelectorAll(".level-starts button")];
    const pips = [...panel.querySelectorAll(".carousel-pips li")];
    return {
      worlds: slides.map(name),
      current: name(slides.find((slide) => slide.dataset.place === "current")),
      starts: buttons.length,
      locked: buttons.filter((b) => "locked" in b.dataset).length,
      open: buttons.filter((b) => !b.disabled).map((b) => b.dataset.chapter),
      pips: pips.length,
      pip: pips.findIndex((pip) => pip.classList.contains("current")),
      prevShut: panel.querySelector('.carousel-turn[data-turn="-1"]').disabled,
      nextShut: panel.querySelector('.carousel-turn[data-turn="1"]').disabled,
    };
  });
// Moves the menu focus to the item whose text starts with `label`.
async function choose(label) {
  for (let i = 0; i < 12; i++) {
    if (
      (await focused())?.startsWith(label) ||
      (label === "Levels" && (await focused()) === "Test levels")
    )
      return press("Enter");
    await press("ArrowDown");
  }
  throw new Error(`no menu item "${label}" (focus: ${await focused()})`);
}
const until = async (test, ms, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const g = await game();
    if (g && test(g)) return g;
    await sleep(80);
  }
  throw new Error(`${label}: ${JSON.stringify(await game()).slice(0, 300)}`);
};
let n = 0;
const shot = (name) =>
  page.screenshot({
    path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`,
  });

try {
  // A player who has already reached the checkpoint in this browser.
  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem(
        "far-door-progress",
        JSON.stringify({
          reached: [
            "court",
            "floor",
            "checkpoint",
            "isles",
            "frost",
            "forest",
            "sea",
          ],
          last: "checkpoint",
        }),
      );
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await sleep(900);
  let g = await game();
  check("title menu open", g.mode === "title" && g.menu === "main");
  check(
    "continue offered",
    (await focused())?.startsWith("Continue"),
    await focused(),
  );
  await shot("title");

  await choose("Levels");
  g = await game();
  const levels = await stage();
  check(
    "levels screen holds every reached world and one sealed door",
    g.menu === "levels" &&
      levels.worlds.join() === "court,two,three,four,five,six,sealed" &&
      levels.starts === 7 &&
      levels.locked === 0 &&
      levels.pips === 7,
    JSON.stringify(levels),
  );
  check(
    "levels opens on the last world reached, its start in focus",
    levels.current === "two" &&
      levels.open.join() === "checkpoint" &&
      (await focused()) === "Beyond the first door",
    `${levels.current} ${levels.open} focus ${await focused()}`,
  );
  await shot("levels");
  // Left and right turn the stage, as the arrows and the bound movement keys do.
  const turns = [];
  for (const key of ["ArrowRight", "KeyD", "ArrowLeft", "KeyA", "ArrowLeft"]) {
    await press(key);
    const now = await stage();
    turns.push(`${key}:${now.current}:${now.open.join("+")}:${now.pip}`);
  }
  check(
    "arrow keys and movement keys turn the stage, one world's starts at a time",
    turns.join() ===
      "ArrowRight:three:isles:2,KeyD:four:frost:3,ArrowLeft:three:isles:2,KeyA:two:checkpoint:1,ArrowLeft:court:court+floor:0",
    turns.join(),
  );
  await press("ArrowLeft");
  levels.first = await stage();
  check(
    "the first world is the end: left stays, its arrow is shut",
    levels.first.current === "court" && levels.first.prevShut,
    JSON.stringify(levels.first),
  );
  await press("ArrowDown");
  await press("ArrowDown");
  const onBack = await focused();
  await press("ArrowRight");
  check(
    "up and down move between the starts and Back, which keeps its focus on a turn",
    onBack === "Back" && (await focused()) === "Back",
    `${onBack} then ${await focused()}`,
  );
  await page.click('#menu .carousel-turn[data-turn="1"]');
  await sleep(200);
  await page.click('#menu .carousel-turn[data-turn="1"]');
  await sleep(200);
  const clicked = await stage();
  await page.click('#menu .carousel-turn[data-turn="-1"]');
  await sleep(200);
  check(
    "the arrow medallions turn the stage",
    clicked.current === "four" && (await stage()).current === "three",
    `${clicked.current} then ${(await stage()).current}`,
  );
  for (let i = 0; i < 6; i++) await press("ArrowRight");
  const sealed = await stage();
  await shot("levels-sealed");
  check(
    "the sealed door comes last, offers no start and shuts the right arrow",
    sealed.current === "sealed" &&
      sealed.open.length === 0 &&
      sealed.nextShut &&
      (await focused()) === "Back",
    JSON.stringify(sealed),
  );
  await press("Escape");
  check("back returns to the title menu", (await game()).menu === "main");

  // A world further along starts from its card.
  await choose("Levels");
  await press("ArrowRight");
  await press("Enter");
  await page.waitForFunction(
    () => window.__READY__ && window.__GAME__?.chapter === "isles",
    { timeout: 90000 },
  );
  g = await until(
    (g) => g.mode === "play" && !g.paused,
    6000,
    "start the isles",
  );
  check(
    "the levels screen starts a world further along",
    g.chapter === "isles" && g.where === "three",
    `${g.chapter} in ${g.where}`,
  );
  // Served, that start becomes the continue point; locally it opens a lab session that saves
  // nothing. Seeding the checkpoint again checks Continue from the same place on both.
  await page.evaluate(() => sessionStorage.removeItem("seeded"));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await sleep(900);

  await choose("Settings");
  // The key bindings and aim come first; sensitivity opens the camera's group.
  for (let i = 0; i < 6; i++) {
    if ((await focused())?.startsWith("Look sensitivity")) break;
    await press("ArrowDown");
  }
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("far-door-settings") || "{}")
        .sensitivity ?? 1,
  );
  await press("ArrowRight");
  await press("ArrowRight");
  const after = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("far-door-settings") || "{}").sensitivity,
  );
  check("settings change and persist", after > before, `${before} -> ${after}`);
  await shot("settings");
  await press("Escape");

  await choose("Controls");
  check("controls screen", (await game()).menu === "controls");
  await shot("controls");
  await press("Escape");

  const muted = () =>
    page.evaluate(() => ({
      pressed: document.querySelector("#mute").getAttribute("aria-pressed"),
      box: document.querySelector("#set-muted").checked,
      saved: JSON.parse(localStorage.getItem("far-door-settings") || "{}")
        .muted,
    }));
  await press("KeyM");
  let audio = await muted();
  check(
    "M mutes from the title and keeps it",
    audio.pressed === "true" && audio.box && audio.saved === true,
    JSON.stringify(audio),
  );
  await page.click("#mute");
  await sleep(160);
  audio = await muted();
  check(
    "the speaker turns the sound back on",
    audio.pressed === "false" && !audio.box && audio.saved === false,
    JSON.stringify(audio),
  );

  await choose("Continue");
  g = await until(
    (g) => g.mode === "play" && g.where === "two",
    8000,
    "continue",
  );
  check("continue starts the checkpoint", g.chapter === "checkpoint");
  await sleep(2500);
  await shot("continue");
  await press("KeyM");
  await sleep(600);
  g = await game();
  check(
    "M mutes during play",
    g.audio.muted && g.audio.gain < 0.01,
    JSON.stringify(g.audio),
  );
  await press("KeyM");
  await sleep(600);
  g = await game();
  check(
    "M brings the sound back during play",
    !g.audio.muted && g.audio.gain > 0.1,
    JSON.stringify(g.audio),
  );

  // Back through the first door: the membrane behind the explorer leads to the court.
  await page.keyboard.down("KeyS");
  g = await until(
    (g) => g.where === "court",
    9000,
    "walk back through the first door",
  ).catch((e) => e);
  await page.keyboard.up("KeyS");
  check(
    "the first door leads back to the court",
    !(g instanceof Error) && g.where === "court",
    g instanceof Error ? g.message : "",
  );
  await sleep(1200);
  await shot("back-in-the-court");

  // Pause, then pick another level from the pause menu.
  await press("Escape");
  g = await game();
  check("escape pauses", g.paused && g.menu === "pause");
  await shot("pause");
  await choose("Levels");
  const paused = await stage();
  await shot("levels-from-pause");
  check(
    "levels from pause opens on the world in play",
    paused.current === "court" && (await game()).paused,
    paused.current,
  );
  // From the court floor is the second start.
  await press("ArrowDown");
  await press("Enter");
  await page.waitForFunction(
    () => window.__READY__ && window.__GAME__?.chapter === "floor",
    { timeout: 90000 },
  );
  g = await until(
    (g) => g.mode === "play" && !g.paused,
    6000,
    "start from the floor",
  );
  check(
    "levels from pause starts the court floor",
    g.chapter === "floor" && g.where === "court" && Math.abs(g.feet) < 0.1,
    `${g.chapter} feet ${g.feet}`,
  );
  await sleep(1500);
  await shot("court-floor");

  // Restart from the pause menu.
  await press("Escape");
  await choose("Restart");
  g = await until((g) => g.mode === "play" && !g.paused, 6000, "restart");
  check("restart keeps the level", g.chapter === "floor");

  // Quit to the title, from the checkpoint: one menu, not the pause menu under the title.
  await page.goto(url + "&chapter=checkpoint", { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await until((g) => g.where === "two", 6000, "checkpoint for quitting");
  await sleep(600);
  await press("Escape");
  await choose("Quit");
  g = await until((g) => g.mode === "title", 6000, "quit to title");
  const shown = await page.evaluate(
    () =>
      [...document.querySelectorAll("#menu .panel")].filter((p) => !p.hidden)
        .length,
  );
  await shot("quit-to-title");
  check(
    "quit returns to a single title menu",
    g.menu === "main" && shown === 1,
    `${shown} panel(s) showing`,
  );

  // The credits roll from the title and Escape skips them.
  await choose("Credits");
  await until((g) => g.credits, 4000, "credits start");
  await sleep(4000);
  await shot("credits");
  await press("Escape");
  g = await until(
    (g) => !g.credits && g.menu === "main",
    4000,
    "credits skipped",
  );
  check("credits roll and skip", true);

  // A new game opens on the first expedition's story, and their notes can be read.
  await choose("New game");
  g = await until(
    (g) => g.mode === "play" && g.cinematic,
    4000,
    "opening shot",
  );
  check(
    "a new game opens on the expedition's story",
    g.step === "camp",
    g.step,
  );
  await press("Enter");
  await until((g) => !g.cinematic, 4000, "skip the opening");
  await sleep(1500);
  // Over to the camp's crate until the prompt offers the notes.
  const reads = () =>
    page.evaluate(() =>
      /Read/.test(document.querySelector("#prompt.on")?.textContent || ""),
    );
  const down = new Set();
  for (const t0 = Date.now(); Date.now() - t0 < 8000 && !(await reads());) {
    g = await game();
    const dx = 22.08 - g.pos[0],
      dz = 40.5 - g.pos[1];
    const fx = Math.sin(g.camYaw),
      fz = Math.cos(g.camYaw);
    const f = dx * fx + dz * fz,
      r = dx * -fz + dz * fx,
      d = Math.hypot(dx, dz) || 1;
    const want = new Set();
    if (f / d > 0.38) want.add("KeyW");
    if (f / d < -0.38) want.add("KeyS");
    if (r / d > 0.38) want.add("KeyD");
    if (r / d < -0.38) want.add("KeyA");
    for (const k of [...down])
      if (!want.has(k)) (await page.keyboard.up(k), down.delete(k));
    for (const k of want)
      if (!down.has(k)) (await page.keyboard.down(k), down.add(k));
    await sleep(40);
  }
  for (const k of down) await page.keyboard.up(k);
  await sleep(300);
  await press("KeyE");
  await sleep(400);
  const reading = await page.evaluate(
    () => !document.querySelector("#notes").hidden,
  );
  await shot("notes");
  await press("KeyE");
  g = await game();
  const closed = await page.evaluate(
    () => document.querySelector("#notes").hidden,
  );
  check(
    "the expedition's notes open, close and move the story on",
    reading && closed && g.step === "gap",
    `${reading} ${closed} ${g.step}`,
  );

  // A knockout: at the checkpoint, take the disc and stand still until stamped four times.
  await page.goto(url + "&chapter=checkpoint&at=-7.9,-28.05,0,180", {
    waitUntil: "load",
  });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await until((g) => g.where === "two", 6000, "checkpoint");
  await until(
    (g) => g.checkpoint === "stamps" || g.checkpoint === "briefing",
    6000,
    "briefing",
  );
  await until((g) => g.checkpoint === "stamps", 30000, "briefed");
  await press("KeyE", 120);
  g = await until((g) => g.disc?.state === "held", 3000, "take the disc");
  const knocked = await until(
    (g) => g.health <= 0 || g.health === undefined,
    60000,
    "knocked out",
  ).catch((e) => e);
  await sleep(500);
  await shot("processed");
  g = await until(
    (g) => g.health === 4 && Math.abs(g.pos[1] + 12) < 0.5,
    8000,
    "respawn after knockout",
  ).catch((e) => e);
  check(
    "a knockout sends the explorer back to the queue",
    !(g instanceof Error) && !(knocked instanceof Error),
    g instanceof Error ? g.message : "",
  );

  // The way back from the frozen reach: Mira's ring's twin leads to her camp, the ring open.
  await page.goto(url + "&chapter=frost", { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await until((g) => g.where === "four", 6000, "the frozen reach");
  await sleep(1500);
  await page.keyboard.down("KeyS");
  g = await until(
    (g) => g.where === "three",
    9000,
    "walk back through Mira's ring's twin",
  ).catch((e) => e);
  await page.keyboard.up("KeyS");
  await sleep(1200);
  await shot("back-at-miras-camp");
  check(
    "the frozen reach leads back to Mira's camp, her ring open",
    !(g instanceof Error) && g.isles?.ring?.phase === "open",
    g instanceof Error ? g.message : `${g.isles?.ring?.phase}`,
  );

  // The way back from the isles: the far door's twin leads to the checkpoint, left open.
  await page.goto(url + "&chapter=isles", { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await until((g) => g.where === "three", 6000, "the isles");
  await sleep(1500);
  await page.keyboard.down("KeyS");
  g = await until(
    (g) => g.where === "two",
    9000,
    "walk back through the far door's twin",
  ).catch((e) => e);
  await page.keyboard.up("KeyS");
  await sleep(1200);
  await shot("back-at-the-checkpoint");
  check(
    "the isles lead back to the checkpoint, left open",
    !(g instanceof Error) && g.checkpoint === "open" && g.exitOpen,
    g instanceof Error ? g.message : `${g.checkpoint} ${g.exitOpen}`,
  );
  for (const [chapter, where, previous, solved] of [
    [
      "forest",
      "five",
      "four",
      (g) => g.frozen.freed && g.frozen.ring === "open",
    ],
    ["sea", "six", "five", (g) => !!g.forest?.ready],
  ]) {
    await page.goto(`${url}&chapter=${chapter}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__READY__ === true, {
      timeout: 90000,
    });
    await until((g) => g.where === where, 6000, chapter);
    await sleep(1600);
    await page.keyboard.down("KeyS");
    g = await until(
      (g) => g.where === previous,
      12000,
      `return from ${chapter}`,
    ).catch((error) => error);
    await page.keyboard.up("KeyS");
    check(
      `return from ${chapter} preserves the previous puzzle`,
      !(g instanceof Error) && solved(g) && !g.swimming && g.state !== "swim",
      g instanceof Error ? g.message : "",
    );
    await sleep(1200);
    await shot(`return-from-${chapter}`);
  }
} catch (e) {
  check("run", false, e.message);
  await shot("failure");
} finally {
  check("no page errors", errors.length === 0, errors.join(" | "));
  await writeFile(
    `${out}/results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
