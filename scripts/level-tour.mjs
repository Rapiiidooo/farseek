import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const chapters = {
  court: [
    1,
    "The Sunken Court",
    "Bend sunlight through the buried ruin",
    "floor",
    "court",
  ],
  checkpoint: [
    2,
    "The Checkpoint",
    "Bait a Warden and dodge its stamp",
    "checkpoint",
    "world2",
  ],
  isles: [
    3,
    "The Dawn Isles",
    "Run and jump between floating islands",
    "isles",
    "isles",
  ],
  frost: [
    4,
    "The Frozen Reach",
    "Slide down the stream and jump its crevasse",
    "frost",
    "frost",
  ],
  forest: [
    5,
    "The Wildwood",
    "Charge the disc and silence the spore beds",
    "forest",
    "forest",
  ],
  sea: [
    6,
    "The Drowned Archive",
    "Swim to the beacon and raise the protection field",
    "sea",
    "sea",
  ],
};
const session = process.argv[2];
assert(
  chapters[session],
  "Choose court, checkpoint, isles, frost, forest or sea",
);
const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dry = process.argv.includes("--dry");
const preview = process.argv.includes("--preview");
const targetSeconds = Number(arg("seconds") || 45);
assert(
  [15, 45].includes(targetSeconds),
  "Capture duration must be 15 or 45 seconds",
);
const extended = targetSeconds > 15;
const out = arg("out") || "outputs/level-tour-motion";
const receipt = arg("receipt") || "receipts/level-tour/motion";
const base = arg("url") || "http://localhost:3002/";
const FPS = 30;
const DT = 1000 / FPS;
const VIEW = { width: 1280, height: 720, deviceScaleFactor: 1 };
const FF = "/opt/homebrew/bin/ffmpeg";
const [number, title, subtitle, chapter, music] = chapters[session];
const lensFov = session === "sea" ? 58 : 50;
const focusOffset = session === "sea" ? 0.1 : 0.3;
const cameraPitch = session === "sea" ? -0.04 : 0.28;
for (const dir of [out, receipt]) await mkdir(dir, { recursive: true });
const source = await readFile("scripts/record-trailer.mjs", "utf8");
const clockFrom = source.indexOf("function virtualClock() {");
const clockTo = source.indexOf("// Stands in for the game's sound module:");
const soundFrom = source.indexOf("const SOUND_LOG = `");
const soundTo = source.indexOf("const browser = await puppeteer.launch({");
assert(
  clockFrom >= 0 &&
    clockTo > clockFrom &&
    soundFrom > clockTo &&
    soundTo > soundFrom,
);
const clockSource = source.slice(clockFrom, clockTo).trim();
const soundSource = new Function(
  `${source.slice(soundFrom, soundTo)}; return SOUND_LOG;`,
)();
const sha = (value) => createHash("sha256").update(value).digest("hex");
async function runtimeSnapshot(directory = "game") {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const result = {};
  for (const entry of entries) {
    if (entry.name === "_verify") continue;
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(result, await runtimeSnapshot(file));
    else if (
      entry.isFile() &&
      /\.(js|json|html|css|svg|png|jpg|jpeg|webp|woff2|mp3|ogg|wav)$/.test(
        entry.name,
      )
    )
      result[file] = sha(await readFile(file));
  }
  return result;
}
const runtimeHashes = await runtimeSnapshot();
const heroSha = sha(await readFile("game/assets/hero_explorer.js"));
const errors = [],
  notes = [],
  inputs = [],
  frames = [];
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport(VIEW);
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    !message.text().includes("Failed to load resource")
  )
    errors.push(message.text());
});
page.on("response", (response) => {
  if (
    response.status() >= 400 &&
    new URL(response.url()).pathname !== "/favicon.ico"
  )
    errors.push(`${response.status()} ${response.url()}`);
});
page.on("requestfailed", (request) => {
  if (new URL(request.url()).pathname !== "/favicon.ico")
    errors.push(`${request.failure()?.errorText} ${request.url()}`);
});
await page.evaluateOnNewDocument(`(${clockSource})()`);
await page.evaluateOnNewDocument(() => {
  localStorage.setItem(
    "far-door-settings",
    JSON.stringify({ hints: false, markers: false, quality: "high" }),
  );
});
await page.setRequestInterception(true);
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname === "/sound.js" && !url.search)
    return request.respond({
      contentType: "text/javascript",
      body: soundSource,
    });
  request.continue();
});
const held = new Set();
let count = 0,
  recorded = 0,
  recording = false,
  encoder,
  closed,
  t0,
  startState,
  endState;
const clock = () => count * DT;
const state = () => page.evaluate(() => window.__GAME__);
const note = async (text) => {
  const s = await state();
  notes.push({
    text,
    virtualSeconds: clock() / 1000,
    videoSeconds: recorded / FPS,
    state: s,
  });
  console.log(`${session}: ${text} (${(recorded / FPS).toFixed(2)}s captured)`);
};
async function frame() {
  await page.evaluate((dt) => window.__vt.step(dt), DT);
  count++;
  if (!recording) return;
  recorded++;
  if (recorded % FPS === 0) {
    const s = await state();
    frames.push({
      frame: recorded,
      time: s.time,
      pos: s.pos,
      state: s.state,
      speed: s.speed,
      feet: s.feet,
      where: s.where,
      boss: s.sea?.boss,
      intro: s.sea?.intro,
      swimming: s.sea?.swimming,
      disc: disc(s),
      plates: session === "checkpoint" ? s.plates : undefined,
      guards: session === "checkpoint" ? s.guards : undefined,
    });
  }
  if (encoder) {
    const buf = await page.screenshot({
      type: "jpeg",
      quality: 94,
      optimizeForSpeed: true,
      captureBeyondViewport: false,
    });
    if (!encoder.stdin.write(buf))
      await new Promise((resolve) => encoder.stdin.once("drain", resolve));
  }
}
async function sleep(ms) {
  for (let i = Math.max(1, Math.round(ms / DT)); i > 0; i--) await frame();
}
async function hold(keys) {
  if (["KeyW", "KeyA", "KeyS", "KeyD"].some((key) => keys.includes(key))) {
    const current = await state();
    const pace = keys.includes("ShiftLeft") ? "walk" : "run";
    if (
      current?.mode === "play" &&
      !current.paused &&
      !current.cinematic &&
      !current.crossing &&
      current.pace !== pace
    ) {
      await page.keyboard.press("ShiftLeft");
      await frame();
      if ((await state()).pace !== pace)
        throw new Error(`Pace switch to ${pace} was not consumed`);
    }
  }
  keys = [...keys].filter((key) => key !== "ShiftLeft");
  for (const key of [...held])
    if (!keys.includes(key)) {
      await page.keyboard.up(key);
      held.delete(key);
      inputs.push({ at: clock(), key, down: false });
    }
  for (const key of keys)
    if (!held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
      inputs.push({ at: clock(), key, down: true });
    }
}
async function tap(keys, ms = 100) {
  await hold(keys);
  await sleep(ms);
  await hold([]);
}
async function until(test, ms, label) {
  for (let start = clock(); clock() - start < ms;) {
    const s = await state();
    if (test(s)) return s;
    await frame();
  }
  throw new Error(`${label}: ${JSON.stringify(await state())}`);
}
function steer(s, x, z, lat = 0.3) {
  const dx = x - s.pos[0],
    dz = z - s.pos[1],
    distance = Math.hypot(dx, dz) || 1;
  const fx = Math.sin(s.camYaw),
    fz = Math.cos(s.camYaw);
  const f = (dx * fx + dz * fz) / distance,
    r = (dx * -fz + dz * fx) / distance;
  return {
    distance,
    keys: [
      ...(f > 0.35 ? ["KeyW"] : f < -0.35 ? ["KeyS"] : []),
      ...(r > lat ? ["KeyD"] : r < -lat ? ["KeyA"] : []),
    ],
  };
}
async function go(x, z, { tol = 0.4, slow = true, timeout = 15000 } = {}) {
  for (let start = clock(); clock() - start < timeout;) {
    const s = await state(),
      { keys, distance } = steer(s, x, z);
    if (distance < tol) {
      await hold([]);
      return s;
    }
    if (slow && distance < 1.4) keys.push("ShiftLeft");
    await hold(keys);
    await frame();
  }
  throw new Error(`Cannot reach ${x},${z}: ${JSON.stringify(await state())}`);
}
async function turnTo(x, z) {
  for (let i = 0; i < 180; i++) {
    const s = await state(),
      want = Math.atan2(x - s.pos[0], z - s.pos[1]);
    const delta = Math.atan2(
      Math.sin(want - s.camYaw),
      Math.cos(want - s.camYaw),
    );
    if (Math.abs(delta) < 0.03) return;
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(
      640 - Math.max(-38, Math.min(38, delta / 0.0026)),
      360,
    );
    await page.mouse.up({ button: "right" });
    await frame();
  }
  throw new Error("Camera failed to turn");
}
async function orbit(degrees, seconds) {
  const total = (degrees * Math.PI) / 180 / 0.0026;
  let previous = 0;
  for (let i = 1, n = Math.round(seconds * FPS); i <= n; i++) {
    const k = i / n,
      desired = total * k * k * (3 - 2 * k);
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(640 + desired - previous, 360);
    await page.mouse.up({ button: "right" });
    previous = desired;
    await frame();
  }
}
const disc = (s) =>
  ({
    sea: s.sea?.disc,
    forest: s.forest?.disc,
    isles: s.isles?.disc,
    frost: s.frozen?.disc,
  })[session] || s.disc;
async function throwAt(x, z) {
  await until(
    (s) =>
      disc(s)?.state === "held" &&
      disc(s).cooldown === 0 &&
      ["ground", "air"].includes(s.state),
    5000,
    "Relay ready",
  );
  await turnTo(x, z);
  const activations = disc(await state()).activations;
  await tap(["KeyR"]);
  return until(
    (s) => disc(s).activations === activations + 1 && disc(s).cooldown === 0,
    5000,
    "Relay pulse completed",
  );
}
async function charge(index) {
  for (let i = 0; i < 3; i++) {
    const s = await state();
    if (disc(s).charged) return;
    const well = (session === "sea" ? s.sea : s.forest).wells[index];
    await throwAt(well[0], well[2]);
  }
  assert(disc(await state()).charged, "Crystal charges disc");
}
async function begin() {
  startState = await state();
  t0 = await page.evaluate(
    ({ music, title, subtitle, number }) => {
      const time = window.__vt.now;
      window.__sound.length = 0;
      window.__sound.push(
        [time, "start"],
        [time, "startMusic"],
        [
          time,
          "place",
          music === "court"
            ? "court"
            : music === "world2"
              ? "two"
              : music === "isles"
                ? "three"
                : music === "frost"
                  ? "four"
                  : music === "forest"
                    ? "five"
                    : "six",
        ],
        [time, "music", music],
      );
      const label = document.createElement("div");
      label.id = "tour-caption";
      const kicker = document.createElement("b"),
        name = document.createElement("strong"),
        sub = document.createElement("span");
      kicker.textContent = `FARSEEK / LEVEL ${number}`;
      name.textContent = title;
      sub.textContent = subtitle;
      label.append(kicker, name, sub);
      document.body.append(label);
      return time;
    },
    { music, title, subtitle, number },
  );
  if (!dry) {
    encoder = spawn(
      FF,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-framerate",
        String(FPS),
        "-c:v",
        "mjpeg",
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-preset",
        "faster",
        "-crf",
        "19",
        "-g",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        `${out}/${session}.mp4`,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    closed = new Promise((resolve) => encoder.once("close", resolve));
  }
  recording = true;
  await note("Capture begins");
}
async function still(name) {
  await page.screenshot({
    path: `${receipt}/${session}-${name}.png`,
    captureBeyondViewport: false,
  });
}
async function finish() {
  await hold([]);
  assert(
    !extended ||
      ["checkpoint", "sea"].includes(session) ||
      recorded >= (targetSeconds - 6) * FPS,
    "An extended take contains at least 39 seconds of traversal and interaction",
  );
  if (
    !["checkpoint", "sea"].includes(session) &&
    recorded < targetSeconds * FPS
  )
    await orbit(120, (targetSeconds * FPS - recorded) / FPS);
  while (recorded < targetSeconds * FPS) {
    const s = await state();
    if (session === "checkpoint") {
      const plate = s.plates.find((item) => !item.stamped);
      if (extended && !plate) {
        if (s.checkpoint !== "open") {
          await go(-1.8, -23.2);
          await throwAt(-4, -31.4);
          await sleep(600);
        } else if (s.pos[1] > -40.8) {
          await go(-0.4, -30, { slow: false });
          await go(0, -38, { slow: false });
          await go(0, -41.3, { slow: false, tol: 0.7 });
          await sleep(2000);
        } else await frame();
        continue;
      }
      const threat = s.guards.find(
        (guard) =>
          guard.state === "windup" &&
          guard.target &&
          Math.hypot(guard.target[0] - s.pos[0], guard.target[1] - s.pos[1]) <
            1.7,
      );
      if (threat) {
        await tap(
          [...steer(s, s.pos[0] > 0 ? -4.5 : 4.5, -16.5).keys, "KeyQ"],
          330,
        );
      } else {
        const warden = s.guards.find((guard) => guard.glyph === plate?.glyph);
        if (
          extended &&
          warden &&
          !warden.hostile &&
          warden.state !== "break" &&
          s.disc.state === "held"
        ) {
          await throwAt(...warden.pos);
          continue;
        }
        const destination =
          extended && plate
            ? { crescent: [-8, -19.5], waves: [0, -22.8], disc: [8, -19.5] }[
                plate.glyph
              ]
            : [-8, -19.5];
        const movement = steer(s, ...destination);
        await hold(movement.distance < 0.4 ? [] : movement.keys);
        await frame();
      }
    } else if (session === "sea" && s.sea.boss.state === "warning") {
      const safe = s.pos[0] > 0 ? [-4.5, -77] : [4.5, -77];
      await go(...safe, { slow: false, tol: 0.7 });
      await turnTo(0, -87);
    } else await frame();
  }
  await hold([]);
  endState = await state();
  await still("end");
  await note("Capture ends");
  recording = false;
}
async function jump(edge, target, id, runup = true) {
  const [ex, ez] = edge,
    [tx, tz] = target;
  const distance = Math.hypot(tx - ex, tz - ez),
    ux = (tx - ex) / distance,
    uz = (tz - ez) / distance;
  if (runup) await go(ex - ux * 3.6, ez - uz * 3.6, { tol: 0.3 });
  await turnTo(tx, tz);
  for (let start = clock(); ;) {
    const s = await state();
    if ((s.pos[0] - ex) * ux + (s.pos[1] - ez) * uz > -0.5) break;
    assert(clock() - start < 5000, "Jump run up succeeds");
    await hold(steer(s, tx, tz).keys);
    await frame();
  }
  await tap([...steer(await state(), tx, tz).keys, "Space"], 380);
  for (let start = clock(); clock() - start < 5000;) {
    const s = await state();
    if (s.state === "ground" && s.isles.on === id) {
      await hold([]);
      return;
    }
    await hold(steer(s, tx, tz).keys);
    await frame();
  }
  throw new Error(`Landing on ${id} failed`);
}
async function aim(mirror, target, key) {
  await hold(["KeyE"]);
  await sleep(200);
  assert((await state()).state === "turn", `Mirror ${mirror} gripped`);
  await hold(["KeyE", key]);
  await until(
    (s) => s.mirrors.find((item) => item.id === mirror).locked === target,
    18000,
    `Mirror ${mirror} reaches ${target}`,
  );
  await hold(["KeyE"]);
  await sleep(650);
  await hold([]);
  await sleep(150);
}
async function jumpToward(x, z, milliseconds = 800) {
  await tap([...steer(await state(), x, z).keys, "Space"], milliseconds);
  await sleep(250);
}
async function settle(x, z, tolerance = 0.3) {
  for (let start = clock(); clock() - start < 15000;) {
    const s = await state(),
      { keys, distance } = steer(s, x, z);
    if (distance < tolerance && s.speed < 0.35) {
      await hold([]);
      return s;
    }
    if (distance < 1.5) keys.push("ShiftLeft");
    await hold(distance < tolerance ? [] : keys);
    await frame();
  }
  throw new Error(`Ice approach failed at ${x},${z}`);
}
// Runs toward the next footing over the spore bog until the lip of stone or bank holds the
// explorer, then jumps with forward held until she lands where `landed` says.
async function forestJump(x, z, label, landed) {
  await until((s) => s.state === "ground", 5000, "Stone takeoff");
  await turnTo(x, z);
  let s = await state();
  const falls = s.forest.bogFalls;
  for (let start = clock(), still = 0; still < 0.15;) {
    assert(clock() - start < 4000, `Lip reached before ${label}`);
    await hold(steer(s, x, z).keys);
    await frame();
    const next = await state();
    const moved = Math.hypot(next.pos[0] - s.pos[0], next.pos[1] - s.pos[1]);
    still = moved < 0.002 ? still + next.time - s.time : 0;
    s = next;
  }
  await hold([...steer(s, x, z).keys, "Space"]);
  await sleep(350);
  for (let start = clock(); clock() - start < 4500;) {
    s = await state();
    assert.equal(s.forest.bogFalls, falls, `Jump to ${label} stays dry`);
    const distance = Math.hypot(x - s.pos[0], z - s.pos[1]);
    if (s.state === "ground" && landed(s, distance)) {
      await hold([]);
      return s;
    }
    await hold(distance < 0.35 ? [] : steer(s, x, z).keys);
    await frame();
  }
  throw new Error(`Jump to ${label} failed at ${s.pos}`);
}
async function court() {
  await go(19, 25);
  if (extended) await begin();
  await go(5, 23.4);
  await go(5, 22.35, { tol: 0.18 });
  await turnTo(5, 20);
  if (!extended) await begin();
  await orbit(70, 2);
  await still("close");
  await orbit(-70, 2);
  await tap(["KeyE"], 150);
  await tap(["KeyE", "KeyS"], 900);
  await sleep(400);
  await go(9, 23.3);
  await go(9, 21.95, { tol: 0.18 });
  await turnTo(9, 20);
  await hold(["KeyE"]);
  await sleep(200);
  assert((await state()).state === "turn", "Mirror gripped");
  await hold(["KeyE", "KeyD"]);
  await until(
    (s) => s.mirrors.find((m) => m.id === "m1").locked === "left",
    15000,
    "First glyph receives sunlight",
  );
  await hold([]);
  await until((s) => s.lit.includes("left"), 3000, "First glyph stays lit");
  await note("First glyph lit by real mirror input");
  if (extended) {
    await aim("m1", "m2", "KeyA");
    await go(9, 23.8);
    await go(20, 23.8, { slow: false });
    await go(21, 23.2);
    await go(21, 24, { tol: 0.18 });
    await aim("m2", "right", "KeyA");
    await note("Second glyph receives reflected sunlight");
    await aim("m2", "m3", "KeyA");
    await go(17.2, 25.3);
    await jumpToward(17.2, 27, 450);
    await until(
      (s) => s.state === "ground" && Math.abs(s.feet - 1) < 0.05,
      3000,
      "Vault onto low block",
    );
    await go(17.2, 27.5);
    await jumpToward(17.2, 31, 800);
    await until(
      (s) => s.state === "ground" && Math.abs(s.feet) < 0.05 && s.pos[1] > 29.8,
      3000,
      "Island landing",
    );
    await go(17, 30, { tol: 0.25 });
    await aim("m3", "top", "KeyA");
    await until((s) => s.gateOpen && !s.cinematic, 20000, "Court door opens");
    await note("The complete mirror address opens its door");
    await sleep(1600);
    if (recorded < 39 * FPS) {
      await go(17.2, 30.35);
      await jumpToward(17.2, 26.5, 800);
      if ((await state()).state === "hang") await tap(["KeyW"], 600);
      await until(
        (s) => s.state === "ground" && s.pos[1] < 28.1,
        3000,
        "Return from glyph island",
      );
      await go(13.4, 19);
      await go(13.4, 15.8);
      await go(15, 15.3);
    }
  }
  await finish();
}
async function checkpoint() {
  await go(-0.5, -12, { slow: false });
  await go(-4, -24.2, { slow: false });
  await until((s) => s.checkpoint === "stamps", 25000, "Clerk briefing");
  await go(-7.2, -24.2);
  await go(-7.9, -27.6);
  await go(-7.9, -28.02, { tol: 0.18 });
  await turnTo(-8, -32);
  await begin();
  await orbit(65, 2);
  await still("close");
  await orbit(-65, 2);
  await tap(["KeyE"]);
  await until((s) => s.disc?.state === "held", 3000, "Disc recovered");
  await go(-8, -19.5, { slow: false });
  await until(
    (s) => s.guards.some((g) => g.state === "windup"),
    12000,
    "Stamp telegraph",
  );
  await still("challenge");
  await go(-4.8, -18.8, { slow: false });
  await sleep(1200);
  await note("Disc recovered and stamp dodged with real input");
  await finish();
}
async function isles() {
  const initial = await state(),
    level = initial.isles;
  const ids = level.isles.map((isle) => isle.id),
    points = level.isles.map((isle) => isle.at);
  await begin();
  await orbit(65, 2);
  await still("close");
  await orbit(-65, 2);
  for (let i = 0; i < (extended ? 3 : 2); i++)
    await jump(level.edges[i], points[i + 1], ids[i + 1]);
  await note("Initial floating-island jumps completed");
  if (extended) {
    const pylon = (s, id) => s.isles.pylons.find((item) => item.id === id);
    const at = Object.fromEntries(
      level.isles.map((isle) => [isle.id, isle.at]),
    );
    const near = (well, id) => {
      const [x, z] = at[id],
        distance = Math.hypot(x - well[0], z - well[1]) || 1;
      return [
        well[0] + ((x - well[0]) / distance) * 2.4,
        well[1] + ((z - well[1]) / distance) * 2.4,
      ];
    };
    const chargeIsle = async (well) => {
      for (let i = 0; i < 5; i++) {
        if (disc(await state()).charged) return;
        await throwAt(...well);
      }
      assert(disc(await state()).charged, "Isle crystal charges disc");
    };
    const wake = async (id, well) => {
      for (let i = 0; i < 5; i++) {
        if (pylon(await state(), id).on) return;
        await chargeIsle(well);
        await throwAt(...pylon(await state(), id).lens);
      }
      assert(pylon(await state(), id).on, `Bridge ${id} awakened`);
    };
    const direction = (p) => Math.sign(p.to - p.emit[1]);
    const beside = (p) => [p.lens[0] + 1.25, p.lens[1]];
    const onto = (p, k = 0.4) => [p.emit[0], p.emit[1] + direction(p) * k];
    const walk = (point) => go(...point, { tol: 0.4, slow: false });
    const along = async (point) => {
      await turnTo(...point);
      return walk(point);
    };
    await walk(near(level.wells[0], "well"));
    await wake("first", level.wells[0]);
    let p = pylon(await state(), "first");
    await walk(beside(p));
    await walk(onto(p));
    await along([p.emit[0], p.to + direction(p) * 1.2]);
    await until(
      (s) => s.isles.on === "gap",
      3000,
      "First light bridge crossed",
    );
    await note("Charged disc creates and crosses the first light bridge");
    await walk(near(level.wells[1], "gap"));
    await wake("across", level.wells[1]);
    p = pylon(await state(), "across");
    await walk([p.emit[0], p.to + direction(p) * 0.6]);
    await along(onto(p, -0.3));
    await walk(beside(p));
    await until(
      (s) => s.isles.on === "pair",
      3000,
      "Second light bridge crossed",
    );
    await walk(near(level.wells[2], "pair"));
    await chargeIsle(level.wells[2]);
    await wake("twinA", level.wells[2]);
    await wake("twinB", level.wells[2]);
    await note("A single charge awakens the twin pylons");
    p = pylon(await state(), "twinA");
    const q = pylon(await state(), "twinB");
    await walk(beside(p));
    await walk(onto(p));
    await along([p.emit[0], p.to + direction(p) * 0.4]);
    await walk(beside(q));
    await go(beside(q)[0], q.emit[1], { tol: 0.3 });
    await walk(onto(q));
    await along([q.emit[0], q.to + direction(q) * 1.5]);
    await until((s) => s.isles.on === "ledge", 3000, "Twin bridges crossed");
    await note("Twin bridges traversed with real controls");
    const index = (id) => ids.indexOf(id);
    const atFerryEnd = (end) => (s) =>
      Math.abs(s.isles.ferry.z - s.isles.ferry[end]) < 0.05;
    const edge = (await state()).isles.edges[index("ledge")];
    await go(edge[0], edge[1] + 3.6, { tol: 0.3 });
    await turnTo(edge[0], edge[1] - 6);
    let s = await until(atFerryEnd("a"), 16000, "Drifting isle arrives");
    await jump(
      s.isles.edges[index("ledge")],
      s.isles.isles[index("ferry")].at,
      "ferry",
      false,
    );
    await note("Explorer boards the drifting isle");
    s = await until(atFerryEnd("b"), 16000, "Drifting isle crosses the gap");
    await jump(s.isles.edges[index("ferry")], at.far, "far", false);
    await note("Explorer reaches the far side aboard the drifting isle");
  }
  await finish();
}
async function frost() {
  await go(0, -11, { tol: 0.5, slow: false });
  await turnTo(0, -80);
  await begin();
  await orbit(65, 2);
  await still("close");
  await orbit(-65, 2);
  await hold(["KeyW"]);
  await until((s) => s.pos[1] < -43.1, 15000, "Slide to crevasse");
  await tap(["KeyW", "Space"], 420);
  await hold(["KeyW"]);
  await until(
    (s) => s.state === "ground" && s.pos[1] < -46.9,
    5000,
    "Crevasse landing",
  );
  await hold([]);
  await go(0, -54, { slow: false, tol: 0.7 });
  await note("Frozen stream crossed by a running jump");
  if (extended) {
    const push = async (x, z, dx, dz) => {
      await settle(x, z);
      await turnTo(x + dx * 10, z + dz * 10);
      await hold(["KeyE", "KeyW"]);
      await until(
        (s) => s.frozen.block.state === "sliding",
        4000,
        "Ice block starts sliding",
      );
      await hold([]);
      await until(
        (s) => s.frozen.block.state === "rest",
        5000,
        "Ice block settles",
      );
    };
    await push(-5.45, -61, 1, 0);
    await push(3, -58.55, 0, -1);
    assert(
      Math.abs((await state()).frozen.block.x - 3) < 0.1 &&
        Math.abs((await state()).frozen.block.z + 73) < 0.1,
      "Block reaches the climbing notch",
    );
    await note("Two directional pushes place the ice block beneath the notch");
    const climb = async (height) => {
      for (let i = 0; i < 4; i++) {
        await tap(["KeyW", "Space"], 350);
        await sleep(250);
        if ((await state()).state === "hang") {
          await tap(["KeyW"], 700);
          await sleep(900);
        }
        const s = await state();
        if (s.state === "ground" && Math.abs(s.feet - height) < 0.1) return;
        await sleep(400);
      }
      throw new Error(`Ice climb to ${height} failed`);
    };
    await settle(3, -71.3);
    await turnTo(3, -90);
    await climb(1.9);
    await climb(3.8);
    await note("Explorer climbs from the block to the upper bank");
    await go(0, -90, { tol: 0.5, slow: false });
    await go(0, -100.5, { tol: 0.5, slow: false });
    await turnTo(0, -130);
    await hold(["KeyW"]);
    await until(
      (s) => s.state === "ground" && s.pos[1] < -121.8 && s.feet > 0.18,
      9000,
      "Thin ice crossed",
    );
    await hold([]);
    await note("Thin ice crossed before it breaks");
  }
  await finish();
}
async function forest() {
  await go(-3, -14);
  await go(-7, -29);
  await go(-6, -36);
  await turnTo(-6, -60);
  await begin();
  await orbit(65, 2);
  await still("close");
  await orbit(-65, 2);
  await charge(0);
  await go(-3, -44);
  await throwAt(6, -53);
  await until((s) => s.forest.spores[2].quiet > 0, 2500, "Spore silenced");
  await throwAt(8, -58);
  await until((s) => s.forest.locked[0], 2500, "Waves seal awakened");
  await note("Crystal charged the disc, spore silenced and waves seal lit");
  if (extended) {
    await go(2, -61);
    await go(0, -74);
    const stones = (await state()).forest.steps;
    for (const [index, [x, top, z, radius]] of stones.entries()) {
      const landing = await forestJump(
        x,
        z,
        `stone ${index + 1}`,
        (s, distance) => distance < radius && s.forest.stone === index,
      );
      assert(
        Math.abs(landing.feet - top) < 0.2,
        "Stone landing reaches its top",
      );
    }
    await forestJump(
      0.3,
      -97.6,
      "the far bank",
      (s) => s.forest.stone === -1 && s.pos[1] < -95.5,
    );
    await go(0, -115, { tol: 0.6 });
    await note(`Crossed the spore bog on its ${stones.length} stones`);
    await go(1, -120);
    await charge(1);
    await go(3, -129);
    for (
      let attempt = 0;
      attempt < 20 && recorded < targetSeconds * FPS;
      attempt++
    ) {
      const s = await state(),
        guard = s.forest.guards.slice(0, 2).find((item) => !item.defeated);
      if (!guard) break;
      const dx = s.pos[0] - guard.at[0],
        dz = s.pos[1] - guard.at[2],
        distance = Math.hypot(dx, dz) || 1;
      if (distance > 8)
        await go(
          guard.at[0] + (dx / distance) * 5,
          guard.at[2] + (dz / distance) * 5,
          { tol: 1 },
        );
      if (distance < 3.5)
        await tap(
          [
            ...steer(
              s,
              s.pos[0] + (dx / distance) * 4,
              s.pos[1] + (dz / distance) * 4,
            ).keys,
            "KeyQ",
          ],
          420,
        );
      await throwAt(guard.at[0], guard.at[2]);
    }
    await note("Reached the guarded grove after the spore crossing");
    if (recorded < (targetSeconds - 6) * FPS) {
      assert(
        (await state()).forest.guards
          .slice(0, 2)
          .every((guard) => guard.defeated),
        "Grove guards defeated",
      );
      await go(4, -125);
      const well = (await state()).forest.wells[1];
      await throwAt(well[0], well[2]);
      await charge(1);
      await go(4, -135);
      await throwAt(10, -146);
      await until((s) => s.forest.locked[1], 2500, "Spiral seal restored");
      await go(4, -154);
      await note("Grove cleared and spiral seal restored");
    }
  }
  await finish();
}
async function sea() {
  const initial = await state();
  const arrival = initial.sea.intro;
  assert(
    initial.sea.swimming && !arrival?.active && !arrival.ready,
    "The sea chapter begins with the underwater arrival",
  );
  await begin();
  const beacon = arrival.beacon;
  await turnTo(beacon[0] - 1, -7);
  await go(beacon[0] - 1, -7, { slow: false, tol: 0.35 });
  await turnTo(beacon[0] - 1, beacon[2] + 0.3);
  await go(beacon[0] - 1, beacon[2] + 0.3, { slow: false, tol: 0.35 });
  await hold(["KeyC"]);
  await until((s) => s.feet < 26.9, 10000, "Dive to the pressure beacon");
  await hold([]);
  await until((s) => s.sea.intro.near, 3000, "Beacon within use range");
  await note("Explorer swims and dives to the pressure beacon");
  await tap(["KeyE"]);
  await until((s) => s.sea.intro.ready, 7000, "Protection field activates");
  await note("Beacon activation raises the underwater protection field");
  await until(
    (s) => s.state === "ground",
    5000,
    "Land inside the protection field",
  );
  await go(8.5, -18, { slow: false });
  await go(4, -18, { slow: false });
  await go(0, -18.5);
  await charge(0);
  await go(0, -19.8);
  await until(
    (s) => !s.sea.vents[0].active && !s.sea.vents[0].warning,
    8000,
    "First vent dark",
  );
  await go(0, -22.8, { slow: false });
  await until(
    (s) => !s.sea.vents[1].active && !s.sea.vents[1].warning,
    8000,
    "Second vent dark",
  );
  await go(0, -26.5, { slow: false });
  await charge(0);
  let seal = (await state()).sea.seals[0].center;
  await throwAt(seal[0], seal[2]);
  assert((await state()).sea.bridge.solid, "Bridge active");
  await turnTo(0, -42);
  await go(0, -40, { slow: false });
  await charge(1);
  seal = (await state()).sea.seals[1].center;
  await throwAt(seal[0], seal[2]);
  assert(
    (await state()).sea.seals.every((s) => s.lit),
    "Both seals restored",
  );
  await go(0, -50);
  await turnTo(0, -58);
  await hold(["KeyW"]);
  await until((s) => s.pos[1] < -52.3, 3000, "Stair run up");
  await hold(["KeyW", "Space"]);
  await until((s) => s.pos[1] < -55.8, 3000, "Stair jumped");
  await hold([]);
  await until((s) => s.state === "ground", 3000, "Stair landing");
  await go(0, -70.5);
  await charge(2);
  await turnTo(0, -87);
  await until(
    (s) => s.sea.boss.state === "warning" && s.sea.boss.timer > 1.2,
    12000,
    "Guardian warning",
  );
  await still("close");
  const health = (await state()).sea.boss.health;
  for (let start = clock(); clock() - start < 35000;) {
    const s = await state();
    if (s.sea.boss.health < health) break;
    if (s.sea.boss.state === "warning") {
      const candidates = [
        [-4.5, -77],
        [4.5, -77],
      ];
      const score = (p) =>
        Math.min(
          ...s.sea.boss.warnings
            .filter((w) => !w.wave)
            .map((w) => Math.hypot(p[0] - w.x, p[1] - w.z) - w.radius),
        );
      candidates.sort((a, b) => score(b) - score(a));
      await go(...candidates[0], { slow: false, tol: 0.7 });
      await turnTo(0, -87);
    } else if (s.sea.boss.state === "exposed") {
      if (!s.sea.disc.charged) await charge(s.pos[0] > 0 ? 3 : 2);
      const core = (await state()).sea.boss.core;
      await throwAt(core[0], core[2]);
    } else if (!s.sea.disc.charged) await charge(s.pos[0] > 0 ? 3 : 2);
    await frame();
  }
  assert(
    (await state()).sea.boss.health < health,
    "Charged throw damages exposed guardian",
  );
  await note("Guardian warning dodged and exposed core struck");
  await finish();
}
const started = Date.now();
const watchdog = setTimeout(() => {
  errors.push("Capture exceeded the five minute wall clock watchdog");
  void browser.close();
}, 300000);
watchdog.unref();
try {
  await page.goto(`${base}?nolock=1&debug=1&chapter=${chapter}`, {
    waitUntil: "load",
    timeout: 120000,
  });
  await page.waitForFunction(() => window.__READY__, { timeout: 120000 });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await page.addStyleTag({
    content: `#tour-caption{position:absolute;left:36px;bottom:28px;z-index:80;pointer-events:none;text-shadow:0 2px 8px #000,0 0 28px #000}#tour-caption b{display:block;font:600 12px "DM Sans",sans-serif;letter-spacing:3px;color:#68e8d8}#tour-caption strong{display:block;font:800 36px "Barlow Condensed",sans-serif;text-transform:uppercase;line-height:1.1;color:#fff1d7}#tour-caption span{display:block;margin-top:5px;font:400 13px "DM Sans",sans-serif;color:#fff1d7}#chapter-card{visibility:hidden!important}`,
  });
  await page.evaluate(
    ({ lensFov, focusOffset, cameraPitch }) => {
      window.__vt.enable();
      const camera = window.__FD__.follow.camera;
      camera.fov = lensFov;
      camera.updateProjectionMatrix();
      const follow = window.__FD__.follow;
      follow.pitch = cameraPitch;
      const update = follow.update.bind(follow);
      follow.update = function (...args) {
        update(...args);
        this.camera.lookAt(
          this.target.x,
          this.target.y - focusOffset,
          this.target.z,
        );
      };
    },
    { lensFov, focusOffset, cameraPitch },
  );
  await sleep(3000);
  if (preview) {
    await begin();
    await orbit(150, 3);
    await still("preview");
    await finish();
  } else await { court, checkpoint, isles, frost, forest, sea }[session]();
  assert.equal(errors.length, 0, errors.join("\n"));
} catch (error) {
  errors.push(error.stack);
  console.error(error.stack);
  await still("failure").catch(() => {});
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  await hold([]).catch(() => {});
  if (encoder) {
    encoder.stdin.end();
    assert.equal(await closed, 0, "Video encoder succeeds");
  }
  await writeFile(
    `${out}/${session}-sound.json`,
    JSON.stringify({
      t0,
      fps: FPS,
      frames: recorded,
      log: await page.evaluate(() => window.__sound).catch(() => []),
    }),
  );
  await writeFile(
    `${receipt}/${session}.json`,
    JSON.stringify(
      {
        session,
        schema: 2,
        requestedSeconds: targetSeconds,
        extended,
        number,
        title,
        fps: FPS,
        frames: recorded,
        seconds: recorded / FPS,
        view: VIEW,
        pixels: [1280, 720],
        lensFov,
        focusOffset,
        cameraPitch,
        realSeconds: (Date.now() - started) / 1000,
        dry,
        preview,
        provenance: {
          chapterSelection: chapter,
          input: "Real keyboard and mouse events",
          timing: "One rendered game frame per 1/30 second of virtual time",
          heroSha256: heroSha,
          runtimeSha256: runtimeHashes,
          runtimeUnchanged:
            JSON.stringify(runtimeHashes) ===
            JSON.stringify(await runtimeSnapshot()),
          heroUnchanged:
            heroSha === sha(await readFile("game/assets/hero_explorer.js")),
          recorderSha256: sha(await readFile("scripts/level-tour.mjs")),
          sourceClockSha256: sha(clockSource),
          sourceSoundSha256: sha(soundSource),
          runtimeMutation: `Camera FOV ${lensFov} degrees and target ${focusOffset} m lower, capture caption and chapter-card visibility only`,
          settings:
            "High quality, hints and markers disabled in an isolated browser profile",
          clock:
            "Browser timing uses the established trailer virtual clock; AudioContext is disabled during picture capture",
          sound:
            "The network response for sound.js wraps the unchanged Game Sound class to log its calls, then the original class replays those events offline",
        },
        startState,
        endState,
        notes,
        inputs,
        samples: frames,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
if (!dry && !process.exitCode) {
  assert.deepEqual(
    await runtimeSnapshot(),
    runtimeHashes,
    "Runtime is unchanged before sound replay",
  );
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "process.argv.splice(1, 0, 'scripts/trailer-soundtrack.mjs'); await import('./scripts/trailer-soundtrack.mjs'); process.exit();",
      session,
      out,
      `--url=${base}`,
    ],
    { stdio: "inherit" },
  );
  assert.equal(
    await new Promise((resolve) => child.once("exit", resolve)),
    0,
    "Game audio replay succeeds",
  );
  execFileSync(
    FF,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      `${out}/${session}.mp4`,
      "-i",
      `${out}/${session}-effects.wav`,
      "-i",
      `${out}/${session}-music.wav`,
      "-filter_complex",
      "[1:a][2:a]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[a]",
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      "-shortest",
      `${out}/${session}-mixed.mp4`,
    ],
    { stdio: "inherit" },
  );
  const audioRuntimeUnchanged =
    JSON.stringify(await runtimeSnapshot()) === JSON.stringify(runtimeHashes);
  assert(audioRuntimeUnchanged, "Runtime is unchanged after sound replay");
  const captureFile = `${receipt}/${session}.json`;
  const capture = JSON.parse(await readFile(captureFile, "utf8"));
  capture.provenance.audioRuntimeUnchanged = audioRuntimeUnchanged;
  await writeFile(captureFile, JSON.stringify(capture, null, 2) + "\n");
  console.log(`${out}/${session}-mixed.mp4`);
}
