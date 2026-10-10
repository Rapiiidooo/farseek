// Records the trailer's footage: the play-through's route, played with real keys and a real
// mouse in virtual time, one frame captured per sixtieth of a second of game time, so no frame
// is dropped however long the capture takes. It also saves stills at 3840x2160 without the HUD.
// Sound is not played: every call to the game's Sound class is logged against the virtual
// clock, and scripts/trailer-soundtrack.mjs plays the log back offline in step with the frames.
//   node scripts/record-trailer.mjs <court|checkpoint|isles|frost> [outDir] [--dry]
//   [--url=http://localhost:3002/]
// --dry plays the route without capturing anything, to check it quickly.
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const session = process.argv[2];
const SESSIONS = ["court", "checkpoint", "isles", "frost"];
if (!SESSIONS.includes(session)) {
  console.error(
    `usage: node scripts/record-trailer.mjs <${SESSIONS.join("|")}>`,
  );
  process.exit(1);
}
const out =
  process.argv[3] && !process.argv[3].startsWith("--")
    ? process.argv[3]
    : "outputs/trailer";
const dry = process.argv.includes("--dry");
const base =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/";
await mkdir(`${out}/stills`, { recursive: true });

const FPS = 60;
const DT = 1000 / FPS;
const VIEW = { width: 1280, height: 720, deviceScaleFactor: 1.5 };
const STILL = { width: 2560, height: 1440, deviceScaleFactor: 1.5 };

// The page's clock, timers, animation frames and CSS animations all run on a virtual clock
// that only moves when the recorder steps it. It takes over once the game has loaded.
function virtualClock() {
  const R = {
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window),
    ct: window.clearTimeout.bind(window),
    si: window.setInterval.bind(window),
    ci: window.clearInterval.bind(window),
    pnow: performance.now.bind(performance),
    dnow: Date.now,
  };
  const vt = {
    on: false,
    now: 0,
    seq: 1,
    rafs: new Map(),
    timers: new Map(),
    realRafs: new Map(),
    realTimers: new Map(),
    anims: new WeakMap(),
  };
  let ids = 1e9;
  const call = (cb, args) => {
    try {
      typeof cb === "function" ? cb(...args) : (0, eval)(cb);
    } catch (e) {
      console.error(e?.stack || String(e));
    }
  };
  window.requestAnimationFrame = (cb) => {
    if (vt.on) {
      const id = ids++;
      vt.rafs.set(id, cb);
      return id;
    }
    const id = R.raf((t) => {
      vt.realRafs.delete(id);
      cb(t);
    });
    vt.realRafs.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (vt.rafs.delete(id)) return;
    vt.realRafs.delete(id);
    R.caf(id);
  };
  const later = (cb, ms, args, every) => {
    const id = ids++;
    vt.timers.set(id, { at: vt.now + ms, cb, args, every, seq: vt.seq++ });
    return id;
  };
  window.setTimeout = (cb, ms, ...args) => {
    const wait = Math.max(0, +ms || 0);
    if (vt.on) return later(cb, wait, args, 0);
    const rec = { cb, args, due: R.pnow() + wait, every: 0 };
    const id = R.st(() => {
      vt.realTimers.delete(id);
      call(cb, args);
    }, wait);
    vt.realTimers.set(id, rec);
    return id;
  };
  window.setInterval = (cb, ms, ...args) => {
    const every = Math.max(1, +ms || 0);
    if (vt.on) return later(cb, every, args, every);
    const rec = { cb, args, due: R.pnow() + every, every };
    const id = R.si(() => {
      rec.due = R.pnow() + every;
      call(cb, args);
    }, every);
    vt.realTimers.set(id, rec);
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => {
    if (vt.timers.delete(id)) return;
    const rec = vt.realTimers.get(id);
    vt.realTimers.delete(id);
    if (rec?.every) R.ci(id);
    else R.ct(id);
  };
  performance.now = () => (vt.on ? vt.now : R.pnow());
  Date.now = () => (vt.on ? vt.dateBase + vt.now - vt.perfBase : R.dnow());
  vt.enable = () => {
    vt.perfBase = vt.now = R.pnow();
    vt.dateBase = R.dnow();
    for (const [id, cb] of vt.realRafs) {
      R.caf(id);
      vt.rafs.set(id, cb);
    }
    for (const [id, t] of vt.realTimers) {
      if (t.every) R.ci(id);
      else R.ct(id);
      vt.timers.set(id, { ...t, at: Math.max(vt.now, t.due), seq: vt.seq++ });
    }
    vt.realRafs.clear();
    vt.realTimers.clear();
    vt.on = true;
  };
  vt.step = (ms) => {
    const until = vt.now + ms;
    for (;;) {
      let next = null,
        nextId = 0;
      for (const [id, t] of vt.timers)
        if (
          t.at <= until &&
          (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq))
        )
          [next, nextId] = [t, id];
      if (!next) break;
      vt.now = Math.max(vt.now, next.at);
      if (next.every) {
        next.at += next.every;
        next.seq = vt.seq++;
      } else vt.timers.delete(nextId);
      call(next.cb, next.args);
    }
    vt.now = until;
    const due = [...vt.rafs.values()];
    vt.rafs.clear();
    for (const cb of due) call(cb, [vt.now]);
    // CSS transitions and animations are paused and seeked to the virtual time.
    for (const a of document.getAnimations()) {
      let s = vt.anims.get(a);
      if (!s) vt.anims.set(a, (s = { start: vt.now - (a.currentTime || 0) }));
      if (a.playState === "running") a.pause();
      a.currentTime = Math.max(0, vt.now - s.start);
    }
    const g = window.__GAME__ || {};
    return {
      mode: g.mode,
      where: g.where,
      hero: g.state,
      cinematic: g.cinematic,
      crossing: g.crossing,
      lit: g.lit?.length,
      gateOpen: g.gateOpen,
      checkpoint: g.checkpoint,
      stamped: g.plates?.filter((p) => p.stamped).length,
      disc: g.disc && `${g.disc.state}${g.disc.charged ? "+" : ""}`,
      exitOpen: g.exitOpen,
      isle: g.isles?.on,
      pylons: g.isles?.pylons.filter((p) => p.on).length,
      read: g.isles?.read,
      miraRing: g.isles?.ring?.phase,
      section: g.frozen?.section,
      block: g.frozen?.block?.state,
      broken: g.frozen?.broken,
      freed: g.frozen?.freed,
      greatRing: g.frozen?.ring,
      credits: g.credits,
      subtitle: document.querySelector("#subtitle.on")?.textContent || "",
    };
  };
  window.__vt = vt;
  window.AudioContext = window.webkitAudioContext = undefined;
}

// Stands in for the game's sound module: the same class, each call logged before it runs.
const SOUND_LOG = `import { Sound as Game } from "./sound.js?game";
const log = (window.__sound = []);
const at = () => performance.now();
const reach = (p, s) => {
  const vx = s.x1 - s.x0, vz = s.z1 - s.z0, len2 = vx * vx + vz * vz || 1;
  const k = Math.max(0, Math.min(1, ((p.x - s.x0) * vx + (p.z - s.z0) * vz) / len2));
  return Math.hypot(p.x - (s.x0 + vx * k), p.z - (s.z0 + vz * k));
};
export class Sound extends Game {
  start() { log.push([at(), "start"]); return super.start(); }
  startMusic() { log.push([at(), "startMusic"]); return super.startMusic(); }
  setPlace(w) { log.push([at(), "place", w]); return super.setPlace(w); }
  setMusic(m) { log.push([at(), "music", m]); return super.setMusic(m); }
  duck(on) { log.push([at(), "duck", on]); return super.duck(on); }
  play(n, a) { log.push([at(), "play", n, a]); return super.play(n, a); }
  update(dt, hero, beams) {
    let near = 99;
    for (const s of beams?.segments || []) near = Math.min(near, reach(hero.pos, s));
    log.push([at(), "update", dt, hero.state, hero.speed, near]);
    return super.update(dt, hero, beams);
  }
}`;

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport(VIEW);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on(
  "console",
  (m) => m.type() === "error" && !/404/.test(m.text()) && errors.push(m.text()),
);
// Control cards and markers stay off, so the picture carries only the objective and the
// address. The progress lets the title's Continue start any level.
const last = {
  court: null,
  checkpoint: "checkpoint",
  isles: "isles",
  frost: "frost",
}[session];
await page.evaluateOnNewDocument((last) => {
  localStorage.setItem(
    "far-door-settings",
    JSON.stringify({ hints: false, markers: false }),
  );
  localStorage.setItem(
    "far-door-progress",
    // A save without the flag counts as an old one that already holds Mira's pistols.
    JSON.stringify(
      last
        ? {
            reached: ["court", "floor", "checkpoint", "isles", "frost"],
            last,
            pistols: last === "frost",
          }
        : {},
    ),
  );
}, last);
await page.evaluateOnNewDocument(virtualClock);
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = new URL(req.url());
  if (url.pathname === "/sound.js" && !url.search)
    return req.respond({ contentType: "text/javascript", body: SOUND_LOG });
  req.continue();
});

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
let frames = 0,
  telemetry = {},
  // Milliseconds the stills took from the clock, given back by the next frame.
  debt = 0,
  t0 = 0;
const events = [];
const stills = [];
const log = [];
const clock = () => (frames * DT) / 1000;
const note = (text) => {
  log.push({ frame: frames, t: +clock().toFixed(3), text });
  console.log(`${clock().toFixed(2).padStart(7)}s  ${text}`);
};

let encoder = null;
function startEncoder(file) {
  const ff = spawn(
    "/opt/homebrew/bin/ffmpeg",
    [
      ...["-hide_banner", "-loglevel", "error", "-y"],
      ...["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg"],
      ...["-i", "-", "-c:v", "libx264", "-preset", "faster", "-crf", "12"],
      ...["-g", "30", "-pix_fmt", "yuv420p", file],
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const closed = new Promise((r) => ff.on("close", r));
  return {
    async write(buf) {
      if (!ff.stdin.write(buf))
        await new Promise((r) => ff.stdin.once("drain", r));
    },
    async end() {
      ff.stdin.end();
      return closed;
    },
  };
}

async function frame() {
  const t = await page.evaluate((dt) => window.__vt.step(dt), DT - debt);
  debt = 0;
  frames++;
  for (const [k, v] of Object.entries(t))
    if (telemetry[k] !== v) events.push({ frame: frames, key: k, value: v });
  telemetry = t;
  if (encoder)
    await encoder.write(
      await page.screenshot({
        type: "jpeg",
        quality: 95,
        optimizeForSpeed: true,
        captureBeyondViewport: false,
      }),
    );
}
async function sleep(ms) {
  for (let i = Math.max(1, Math.round(ms / DT)); i > 0; i--) await frame();
}
const now = () => frames * DT;

// A 4K still without the HUD, taken between two frames: the game advances a millisecond.
async function still(name) {
  if (dry) return;
  const sized = (w) =>
    page.evaluate(
      (w) =>
        innerWidth === w &&
        window.__FD__.renderer.domElement.width === Math.round(w * 1.5),
      w,
    );
  const resize = async (view) => {
    await page.setViewport(view);
    for (let i = 0; i < 100 && !(await sized(view.width)); i++)
      await realSleep(20);
    await page.evaluate(() => window.__vt.step(0.5));
    debt += 0.5;
  };
  await page.evaluate(() => document.documentElement.classList.add("still"));
  await resize(STILL);
  const file = `stills/${session}-${String(stills.length + 1).padStart(2, "0")}-${name}.png`;
  await page.screenshot({
    path: `${out}/${file}`,
    captureBeyondViewport: false,
  });
  stills.push({ file, frame: frames, t: +clock().toFixed(3) });
  await page.evaluate(() => document.documentElement.classList.remove("still"));
  await resize(VIEW);
}

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
      await frame();
      if ((await state()).pace !== pace)
        throw new Error(`Pace switch to ${pace} was not consumed`);
    }
  }
  keys = new Set([...keys].filter((key) => key !== "ShiftLeft"));
  for (const k of [...held])
    if (!keys.has(k)) (await page.keyboard.up(k), held.delete(k));
  for (const k of keys)
    if (!held.has(k)) (await page.keyboard.down(k), held.add(k));
}
async function tap(keys, ms) {
  await hold(new Set(keys));
  await sleep(ms);
  await hold(new Set());
}
// `lat` is how far off to the side the spot may lie before a side key corrects the course.
function steer(s, x, z, lat = 0.38) {
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
  if (r > lat) keys.push("KeyD");
  if (r < -lat) keys.push("KeyA");
  return { keys, d };
}
async function go(
  x,
  z,
  { tol = 0.35, walk = true, timeout = 12000, lat = 0.38 } = {},
) {
  const t0 = now();
  while (now() - t0 < timeout) {
    const s = await state();
    const { keys, d } = steer(s, x, z, lat);
    if (d < tol) {
      await hold(new Set());
      return s;
    }
    if (walk && d < 1.5) keys.push("ShiftLeft");
    await hold(new Set(keys));
    await frame();
  }
  const s = await state();
  throw new Error(
    `go ${x},${z} stuck at ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)} ${s.state}`,
  );
}
// On ice the explorer slides on after the keys are let go: steer, brake and wait until it has
// come to rest within `tol` of the spot.
async function settle(x, z, { tol = 0.3, timeout = 15000 } = {}) {
  const t0 = now();
  while (now() - t0 < timeout) {
    const s = await state();
    const { keys, d } = steer(s, x, z);
    if (d < tol && s.speed < 0.35) {
      await hold(new Set());
      return s;
    }
    if (d < 1.5) keys.push("ShiftLeft");
    await hold(new Set(d < tol ? [] : keys));
    await frame();
  }
  const s = await state();
  throw new Error(
    `settle ${x},${z} stuck at ${s.pos.map((v) => v.toFixed(2))} speed ${s.speed.toFixed(2)}`,
  );
}
async function jumpToward(x, z, ms = 800) {
  const s = await state();
  await tap([...steer(s, x, z).keys, "Space"], ms);
  await sleep(250);
}
async function until(test, timeout, label) {
  const t0 = now();
  while (now() - t0 < timeout) {
    const s = await state();
    if (test(s)) return s;
    await frame();
  }
  const s = await state();
  throw new Error(
    `${label}: state ${s.state} pos ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)}`,
  );
}

// The right button drags the view without pointer lock. The drag is spread over frames and
// eased, as a hand on a mouse would turn it; the pointer is recentred, button up, before it
// reaches an edge of the page.
const drag = {
  x: 640,
  y: 360,
  async begin() {
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: "right" });
    this.x = 640;
    this.y = 360;
  },
  async by(dx, dy = 0) {
    if (!dx && !dy) return;
    if (
      this.x + dx < 40 ||
      this.x + dx > 1240 ||
      this.y + dy < 40 ||
      this.y + dy > 680
    ) {
      await page.mouse.up({ button: "right" });
      await this.begin();
    }
    this.x += dx;
    this.y += dy;
    await page.mouse.move(this.x, this.y);
  },
  async end() {
    await page.mouse.up({ button: "right" });
  },
};
async function turnTo(x, z, { rate = 2.6, accel = 9 } = {}) {
  await drag.begin();
  let v = 0,
    rest = 0;
  for (let i = 0; i < 600; i++) {
    const st = await state();
    const want = Math.atan2(x - st.pos[0], z - st.pos[1]);
    const d = Math.atan2(
      Math.sin(want - st.camYaw),
      Math.cos(want - st.camYaw),
    );
    if (Math.abs(d) < 0.03) break;
    v = Math.min(v + accel / FPS, rate, Math.sqrt(2 * accel * Math.abs(d)));
    rest -= (Math.sign(d) * Math.min(Math.abs(d), v / FPS)) / 0.0026;
    const px = Math.round(rest);
    rest -= px;
    await drag.by(px);
    await frame();
  }
  await drag.end();
}
// An establishing shot: the view circles the explorer by `deg`, eased in and out, optionally
// tilting by `tilt` radians and back.
async function orbit(deg, seconds, { tilt = 0, stillsAt = [] } = {}) {
  const n = Math.round(seconds * FPS);
  const total = (deg * Math.PI) / 180 / 0.0026;
  const smooth = (k) => k * k * (3 - 2 * k);
  let doneX = 0,
    doneY = 0;
  const marks = stillsAt.map((k) => Math.round(k * n));
  await drag.begin();
  for (let i = 1; i <= n; i++) {
    const k = smooth(i / n);
    const wantX = Math.round(total * k);
    const wantY = Math.round((tilt / 0.0022) * Math.sin(Math.PI * k));
    await drag.by(wantX - doneX, wantY - doneY);
    doneX = wantX;
    doneY = wantY;
    await frame();
    if (marks.includes(i)) await still(`orbit-${marks.indexOf(i) + 1}`);
  }
  await drag.end();
}
// Plays a scripted shot through to its end, with stills along the way.
async function watch(label, { every = 0, max = 90000 } = {}) {
  await until((s) => s.cinematic, 8000, `${label} starts`);
  note(`${label} starts`);
  const t0 = now();
  let next = every;
  while ((await state()).cinematic) {
    if (now() - t0 > max) throw new Error(`${label} never ends`);
    await frame();
    if (every && now() - t0 >= next) {
      next += every;
      await still(label);
    }
  }
  note(`${label} ends`);
}

async function begin() {
  await page.goto(`${base}?nolock=1&debug=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await page.addStyleTag({
    content: `html.still #hud, html.still #subtitle, html.still #chapter-card,
      html.still #letterbox, html.still #bubbles, html.still #touch, html.still #credits {
      visibility: hidden !important; }`,
  });
  // The loading screen fades out on a real timer before the clock turns virtual.
  await realSleep(1200);
  t0 = await page.evaluate(() => (window.__vt.enable(), window.__vt.now));
  if (!dry) encoder = startEncoder(`${out}/${session}.mp4`);
  note(`recording ${session}`);
  await sleep(1500);
  await page.click(
    session === "court"
      ? 'button[data-action="new"]'
      : 'button[data-action="continue"]',
  );
  // The chapter's worlds are prepared behind the loading screen before play starts.
  for (let i = 0; i < FPS * 180; i++) {
    const ready = await page.evaluate(
      () =>
        document.querySelector("#loading")?.hidden &&
        window.__GAME__?.mode === "play",
    );
    if (ready) break;
    await frame();
  }
}

const started = Date.now();
try {
  await begin();
  if (session === "court") await court();
  if (session === "checkpoint") await checkpoint();
  if (session === "isles") await isles();
  if (session === "frost") await frost();
  note("done");
} catch (e) {
  note(`FAILED: ${e.message}`);
  process.exitCode = 1;
  await page
    .screenshot({ path: `${out}/${session}-failure.png` })
    .catch(() => {});
  await writeFile(
    `${out}/${session}-failure.json`,
    JSON.stringify(await state().catch(() => null), null, 1),
  );
} finally {
  await hold(new Set()).catch(() => {});
  if (encoder) await encoder.end();
  note(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
  await writeFile(
    `${out}/${session}-sound.json`,
    JSON.stringify({
      t0,
      fps: FPS,
      frames,
      log: await page.evaluate(() => window.__sound).catch(() => []),
    }),
  );
  await writeFile(
    `${out}/${session}.json`,
    JSON.stringify(
      {
        session,
        fps: FPS,
        frames,
        seconds: +clock().toFixed(3),
        capture: { ...VIEW, pixels: "1920x1080", stills: "3840x2160" },
        realSeconds: Math.round((Date.now() - started) / 1000),
        dry,
        log,
        stills,
        events,
        errors,
      },
      null,
      1,
    ),
  );
  // The process does not end on its own after closing: exit once the records are written.
  await Promise.race([browser.close(), realSleep(10000)]);
  process.exit();
}

// Level 1: the opening shot, the descent, the mirrors, the gate's set piece and the crossing.
async function court() {
  await watch("opening", { every: 2500 });
  await sleep(1600);
  let s;
  await go(12, 37.2);
  await hold(new Set(["KeyA"]));
  await until((s) => s.pos[0] < 8.75, 3000, "run to the gap");
  await tap(["KeyA", "Space"], 500);
  s = await state();
  if (s.state === "hang") await tap(["KeyW"], 600);
  s = await until(
    (s) => s.state === "ground" && s.pos[0] < 6.2,
    3000,
    "land on the west platform",
  );
  note("jumped the gap");
  await go(4, 36.45);
  await tap(["KeyW"], 120);
  await tap(["KeyC"], 120);
  s = await until((s) => s.state === "hang", 2000, "hang from the edge");
  note("hanging from the platform edge");
  await sleep(500);
  await tap(["KeyC"], 120);
  await until(
    (s) => s.state === "ground" && Math.abs(s.feet - 5.5) < 0.05,
    3000,
    "drop to the ledge",
  );
  await go(4.5, 34.5);
  await jumpToward(4.5, 30, 800);
  await until((s) => s.state === "hang", 3000, "catch the crack");
  note("caught the crack");
  await hold(new Set(["KeyD"]));
  await sleep(1200);
  await still("shimmy");
  await until((s) => s.pos[0] > 9.4, 9000, "shimmy along the crack");
  await hold(new Set());
  await tap(["KeyW"], 500);
  await until(
    (s) => s.state === "ground" && Math.abs(s.feet - 7) < 0.05,
    3000,
    "climb onto the platform",
  );
  note("climbed out of the crack");
  await go(9, 27);
  await go(19, 27, { walk: false });
  await until(
    (s) => s.state === "ground" && Math.abs(s.feet) < 0.05,
    3000,
    "reach the court floor",
  );
  note("reached the court floor");
  await orbit(360, 9, { tilt: -0.35, stillsAt: [0.25, 0.5, 0.75] });

  await go(19, 25);
  await go(5, 23.4);
  await go(5, 22.3, { tol: 0.1, timeout: 3000 }).catch(() => {});
  await tap(["KeyE"], 150);
  await tap(["KeyE", "KeyS"], 900);
  await sleep(700);
  note("pulled the block off the beam");
  await go(9, 23.3);
  await go(9, 21.9, { tol: 0.1, timeout: 3000 }).catch(() => {});
  await aim("m1", "left", "KeyD");
  await until((s) => s.lit.includes("left"), 3000, "light the left stela");
  note("lit the left stela");
  await sleep(900);
  await still("first-glyph");
  await aim("m1", "m2", "KeyA");
  await go(9, 23.8);
  await go(20, 23.8, { walk: false });
  await go(21, 23.2);
  await go(21, 24.0, { tol: 0.1, timeout: 3000 }).catch(() => {});
  await aim("m2", "right", "KeyA");
  await until((s) => s.lit.includes("right"), 3000, "light the right stela");
  note("lit the right stela");
  await sleep(700);
  await still("second-glyph");
  await aim("m2", "m3", "KeyA");
  await go(17.2, 25.3);
  await jumpToward(17.2, 27, 450);
  await until(
    (s) => s.state === "ground" && Math.abs(s.feet - 1) < 0.05,
    3000,
    "vault onto the low block",
  );
  await go(17.2, 27.5);
  await jumpToward(17.2, 31, 800);
  await until(
    (s) => s.state === "ground" && Math.abs(s.feet) < 0.05 && s.pos[1] > 29.8,
    3000,
    "land on the island",
  );
  await go(17, 30.35, { tol: 0.1, timeout: 3000 }).catch(() => {});
  await aim("m3", "top", "KeyA");
  await until((s) => s.lit.includes("top"), 3000, "light the top stela");
  note("lit the top stela");
  await watch("gate", { every: 1000 });
  await until((s) => s.gateOpen && !s.cinematic, 20000, "gate opening");
  note("the gate is open");
  await sleep(1200);
  await go(17.2, 30.35);
  await jumpToward(17.2, 26.5, 800);
  s = await state();
  if (s.state === "hang") await tap(["KeyW"], 600);
  await until(
    (s) => s.state === "ground" && s.pos[1] < 28.1,
    3000,
    "leave the island",
  );
  await go(13.4, 19);
  await go(13.4, 15.8);
  await go(15, 15.3);
  await sleep(600);
  await still("portal");
  await go(15, 9, { walk: false, timeout: 8000 }).catch(() => {});
  await hold(new Set());
  await until((s) => s.where === "two", 8000, "cross the gate");
  note("crossed into the checkpoint");
  await sleep(3500);
}

async function aim(mirror, target, key) {
  await hold(new Set(["KeyE"]));
  await sleep(200);
  const before = await state();
  if (before.state !== "turn")
    throw new Error(`could not take hold of ${mirror}: ${before.state}`);
  // Turn one way; if the mirror stops at the edge of its face, turn the other way.
  const t0 = now();
  let dir = key,
    lastYaw = null,
    still = 0;
  await hold(new Set(["KeyE", dir]));
  for (;;) {
    const s = await state();
    const m = s.mirrors.find((m) => m.id === mirror);
    if (m.locked === target) break;
    if (now() - t0 > 20000)
      throw new Error(`aim ${mirror} at ${target}: yaw ${m.yaw.toFixed(2)}`);
    still =
      lastYaw !== null && Math.abs(m.yaw - lastYaw) < 1e-4 && !m.locked
        ? still + 1
        : 0;
    lastYaw = m.yaw;
    if (still > 38) {
      dir = dir === "KeyA" ? "KeyD" : "KeyA";
      await hold(new Set(["KeyE", dir]));
      still = 0;
    }
    await frame();
  }
  await hold(new Set(["KeyE"]));
  await sleep(700);
  await hold(new Set());
  await sleep(200);
}

// Level 2: the briefing, the stamps, the lamp and the far door.
async function checkpoint() {
  let s = await until(
    (s) => s.where === "two",
    8000,
    "arrive at the checkpoint",
  );
  await sleep(2600);
  note("at the checkpoint");
  await orbit(-360, 10, { tilt: -0.5, stillsAt: [0.2, 0.45, 0.7] });
  await go(-0.5, -12, { walk: false });
  await go(-4, -24.2, { walk: false });
  await sleep(1500);
  await still("briefing");
  await until((s) => s.checkpoint === "stamps", 25000, "the clerk's briefing");
  note("briefed by the clerk");
  await go(-7.2, -24.2);
  await go(-7.9, -27.6);
  await go(-7.9, -28.05, { tol: 0.15, timeout: 3000 }).catch(() => {});
  await tap(["KeyE"], 150);
  await until((s) => s.disc?.state === "held", 3000, "take the disc");
  note("took the disc; the Wardens are coming");
  await sleep(900);
  await still("alarm");
  const PLATES = { crescent: [-8, -19.5], waves: [0, -22.8], disc: [8, -19.5] };
  const t0 = now();
  let throws = 0,
    dodges = 0;
  for (;;) {
    s = await state();
    const open = s.plates.filter((p) => !p.stamped);
    if (!open.length) break;
    if (now() - t0 > 180000)
      throw new Error(`plates not stamped: ${JSON.stringify(s.plates)}`);
    const plate = open[0];
    const [px, pz] = PLATES[plate.glyph];
    const warden = s.guards.find((g) => g.glyph === plate.glyph);
    const threat = s.guards.find(
      (g) =>
        g.state === "windup" &&
        g.target &&
        Math.hypot(g.target[0] - s.pos[0], g.target[1] - s.pos[1]) < 1.2,
    );
    if (threat) {
      const onPlate =
        Math.hypot(threat.target[0] - px, threat.target[1] - pz) < 0.9;
      const away = Math.atan2(
        s.pos[0] - threat.pos[0],
        s.pos[1] - threat.pos[1],
      );
      const tx = s.pos[0] + Math.sin(away) * 2.4,
        tz = s.pos[1] + Math.cos(away) * 2.4;
      await hold(new Set(steer(s, tx, tz).keys));
      await sleep(onPlate ? 450 : 350);
      await hold(new Set());
      if (!dodges++) await still("stamp-ring");
      await sleep(500);
      continue;
    }
    if (
      !warden.hostile &&
      warden.state !== "break" &&
      s.disc?.state === "held"
    ) {
      await turnTo(warden.pos[0], warden.pos[1], { rate: 6, accel: 30 });
      await tap(["KeyR"], 80);
      throws++;
      await sleep(700);
      continue;
    }
    const d = Math.hypot(px - s.pos[0], pz - s.pos[1]);
    if (d > 0.4) {
      await go(px, pz, { tol: 0.35, walk: d < 1.5, timeout: 6000 }).catch(
        () => {},
      );
      continue;
    }
    await frame();
  }
  note(`plates stamped with ${throws} throws and ${dodges} dodges`);
  await sleep(1200);
  await still("stamped");
  s = await until((s) => s.checkpoint === "lamp", 6000, "lamp phase");
  for (let i = 0; i < 8; i++) {
    s = await state();
    if (s.checkpoint === "open") break;
    await until((s) => s.disc?.state === "held", 6000, "disc back in hand");
    await go(-1.8, -23.2, { tol: 0.4 });
    await turnTo(-4, -31.4);
    await tap(["KeyR"], 80);
    await sleep(1600);
  }
  await until((s) => s.checkpoint === "open", 3000, "light the lamp");
  note("lamp lit, barrier up");
  await sleep(1800);
  await still("barrier-open");
  await go(-0.4, -30, { walk: false, timeout: 20000 });
  await go(0, -38, { walk: false, timeout: 20000 });
  await go(0, -41.6, { walk: false, timeout: 8000 }).catch(() => {});
  await hold(new Set());
  await watch("far-door", { every: 1000 });
  await until((s) => s.exitOpen && !s.cinematic, 20000, "the far door opens");
  note("the far door is open");
  await sleep(800);
  await hold(new Set(["KeyW"]));
  await until((s) => s.where === "three", 8000, "step through the far door");
  await hold(new Set());
  note("through the far door");
  await sleep(3500);
}

// Level 3: the jumps, the pylons and their bridges, the ferry, the stones, the relay, Mira's
// journal and her ring.
async function isles() {
  let s = await until(
    (s) => s.where === "three" && s.isles?.edges,
    8000,
    "arrive on the isles",
  );
  await sleep(2600);
  note("on the isles");
  await orbit(360, 11, { tilt: -0.45, stillsAt: [0.2, 0.45, 0.7, 0.9] });
  s = await state();
  const L = s.isles;
  const at = Object.fromEntries(L.isles.map((i) => [i.id, i.at]));
  const ids = L.isles.map((i) => i.id);
  for (let k = 0; k < 3; k++) {
    await leap(L.edges[k], at[ids[k + 1]], ids[k + 1]);
    if (k === 1) await still("leap");
  }
  note("jumped across to the isle of the first pylon");
  const pylon = (s, id) => s.isles.pylons.find((p) => p.id === id);
  const charge = async (well) => {
    for (let i = 0; i < 5; i++) {
      const s = await until(
        (s) => s.isles.disc?.state === "held",
        6000,
        "the disc in hand",
      );
      if (s.isles.disc.charged) return;
      await turnTo(well[0], well[1]);
      await tap(["KeyR"], 80);
      await sleep(1300);
    }
    throw new Error("could not charge the disc");
  };
  const wake = async (id, well) => {
    for (let i = 0; i < 5; i++) {
      let s = await state();
      if (pylon(s, id).on) return;
      if (!s.isles.disc?.charged) await charge(well);
      s = await until(
        (s) => s.isles.disc?.state === "held",
        6000,
        "the disc in hand",
      );
      const p = pylon(s, id);
      await turnTo(p.lens[0], p.lens[1]);
      await tap(["KeyR"], 80);
      await until((s) => pylon(s, id).on, 2500, `wake ${id}`).catch(() => {});
    }
    if (!pylon(await state(), id).on) throw new Error(`could not wake ${id}`);
  };
  const W = L.wells;
  const dirOf = (p) => Math.sign(p.to - p.emit[1]);
  const beside = (p) => [p.lens[0] + 1.25, p.lens[1]];
  const onto = (p, k = 0.4) => [p.emit[0], p.emit[1] + dirOf(p) * k];
  const walkTo = ([x, z], opts = {}) =>
    go(x, z, { tol: 0.4, walk: false, ...opts });
  const along = async ([x, z]) => {
    await turnTo(x, z, { rate: 4, accel: 16 });
    return walkTo([x, z], { timeout: 9000, lat: 0.12 });
  };
  const near = (w, id) => {
    const [ax, az] = at[id];
    const d = Math.hypot(ax - w[0], az - w[1]) || 1;
    return [w[0] + ((ax - w[0]) / d) * 2.4, w[1] + ((az - w[1]) / d) * 2.4];
  };
  await walkTo(near(W[0], "well"));
  await wake("first", W[0]);
  note("woke the first pylon");
  await sleep(700);
  await still("first-bridge");
  s = await state();
  let p = pylon(s, "first");
  await walkTo(beside(p));
  await walkTo(onto(p));
  await along([p.emit[0], p.to + dirOf(p) * 1.2]);
  await until((s) => s.isles.on === "gap", 3000, "cross the first bridge");
  note("crossed the first bridge");
  await walkTo(near(W[1], "gap"));
  await wake("across", W[1]);
  note("woke the pylon across the gap");
  s = await state();
  p = pylon(s, "across");
  await walkTo([p.emit[0], p.to + dirOf(p) * 0.6]);
  await along(onto(p, -0.3));
  await walkTo(beside(p));
  await until((s) => s.isles.on === "pair", 3000, "cross the second bridge");
  note("crossed the second bridge");
  await walkTo(near(W[2], "pair"));
  await charge(W[2]);
  await wake("twinA", W[2]);
  await wake("twinB", W[2]);
  note("woke both pylons of the pair");
  await still("pair");
  s = await state();
  p = pylon(s, "twinA");
  const q = pylon(s, "twinB");
  await walkTo(beside(p));
  await walkTo(onto(p));
  await along([p.emit[0], p.to + dirOf(p) * 0.4]);
  await walkTo(beside(q));
  // Round the rock's pylon rather than into its plinth.
  await go(beside(q)[0], q.emit[1], { tol: 0.3 });
  await walkTo(onto(q));
  await along([q.emit[0], q.to + dirOf(q) * 1.5]);
  await until((s) => s.isles.on === "ledge", 3000, "reach the ledge");
  note("crossed both bridges of the pair");
  const k = (id) => ids.indexOf(id);
  const ferryAt = (end) => (s) =>
    Math.abs(s.isles.ferry.z - s.isles.ferry[end]) < 0.05;
  s = await state();
  const edge = s.isles.edges[k("ledge")];
  await go(edge[0], edge[1] + 3.6, { tol: 0.3 });
  await turnTo(edge[0], edge[1] - 6);
  await until((s) => !ferryAt("a")(s), 16000, "the ferry leaves");
  await until(ferryAt("a"), 16000, "the ferry returns");
  s = await state();
  await hop(s.isles.edges[k("ledge")], s.isles.isles[k("ferry")].at, "ferry");
  note("aboard the drifting isle");
  await sleep(600);
  await still("ferry");
  s = await until(ferryAt("b"), 16000, "the ferry reaches the far isle");
  await hop(s.isles.edges[k("ferry")], at.far, "far");
  note("off the ferry onto the far isle");
  s = await state();
  await leap(s.isles.edges[k("far")], at.stone1, "stone1");
  for (const [from, to] of [
    ["stone1", "stone2"],
    ["stone2", "stone3"],
    ["stone3", "landing"],
  ]) {
    s = await state();
    await hop(s.isles.edges[k(from)], at[to], to);
  }
  note("crossed the crumbling stones");
  await sleep(500);
  await still("stones");
  await walkTo(near(W[3], "landing"));
  await charge(W[3]);
  await wake("relay1", W[3]);
  s = await state();
  p = pylon(s, "relay1");
  await walkTo(beside(p));
  await walkTo(onto(p));
  await along([p.emit[0], p.to + dirOf(p) * 1.4]);
  await until((s) => s.isles.on === "midway", 3000, "cross to midway");
  await wake("relay2", W[3]);
  note("woke the far pylon of the relay");
  s = await state();
  p = pylon(s, "relay2");
  await walkTo([p.emit[0], p.to + dirOf(p) * 0.6]);
  await along(onto(p, -0.3));
  await walkTo(beside(p));
  s = await until((s) => s.isles.on === "camp", 3000, "reach the camp");
  note("crossed to Mira's camp");
  await still("camp");
  const n = s.isles.note;
  const prompt = () =>
    page.evaluate(
      () => document.querySelector("#prompt.on")?.textContent || "",
    );
  for (let k = 0; k < 8 && !/journal/.test(await prompt()); k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 2;
    await go(n[0] + Math.sin(a) * 1.25, n[1] + Math.cos(a) * 1.25, {
      tol: 0.3,
      timeout: 4000,
    }).catch(() => {});
    await turnTo(n[0], n[1]);
    await tap(["KeyW"], 120);
    await sleep(200);
  }
  await tap(["KeyE"], 120);
  await sleep(2500);
  const reading = await page.evaluate(
    () => !document.querySelector("#notes").hidden,
  );
  if (!reading) throw new Error("Mira's journal did not open");
  note("reading Mira's journal");
  await tap(["KeyE"], 120);
  // Her ring opens once her pistols are taken too, from the open case 1.96 m and 3.1 m off the
  // camp isle's centre (CAMP.pistols).
  s = await until((s) => s.isles.read, 3000, "the journal read");
  const camp = s.isles.isles.find((i) => i.id === "camp").at;
  const box = [camp[0] + 1.96, camp[1] + 3.1];
  for (let k = 0; k < 8 && !/pistols/.test(await prompt()); k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 2;
    await go(box[0] + Math.sin(a) * 1.1, box[1] + Math.cos(a) * 1.1, {
      tol: 0.3,
      timeout: 4000,
    }).catch(() => {});
    await turnTo(box[0], box[1]);
    await tap(["KeyW"], 120);
    await sleep(200);
  }
  await tap(["KeyE"], 120);
  await until((s) => s.equipment.pistolsUnlocked, 3000, "Mira's pistols taken");
  note("took Mira's pistols from her case");
  await watch("mira-ring", { every: 1000 });
  s = await until(
    (s) => !s.cinematic && s.isles.ring.phase === "open",
    20000,
    "the ring open",
  );
  note("Mira's ring is open");
  const r = s.isles.ring;
  await go(box[0] - 1.1, box[1], { tol: 0.4, walk: false });
  await go(r.x, r.z + 2.6, { tol: 0.4, walk: false });
  await turnTo(r.x, r.z - 10);
  await hold(new Set(["KeyW"]));
  await until((s) => s.where === "four", 6000, "through Mira's ring");
  await hold(new Set());
  note("through Mira's ring");
  await sleep(3500);
}

// A jump from wherever the explorer stands: run at the edge and take off just before it.
async function hop(edge, target, id) {
  const [ex, ez] = edge,
    [tx, tz] = target;
  const d = Math.hypot(tx - ex, tz - ez);
  const ux = (tx - ex) / d,
    uz = (tz - ez) / d;
  let s,
    t0 = now();
  for (;;) {
    s = await state();
    const along = (s.pos[0] - ex) * ux + (s.pos[1] - ez) * uz;
    const keys = steer(s, tx, tz).keys;
    if (along > -0.45) {
      await hold(new Set([...keys, "Space"]));
      break;
    }
    await hold(new Set(keys));
    if (now() - t0 > 4000) throw new Error(`run at ${id} stalled`);
    await frame();
  }
  await sleep(380);
  t0 = now();
  for (;;) {
    s = await state();
    await hold(new Set(steer(s, tx, tz).keys));
    if (s.state === "ground" && s.isles?.on === id) break;
    if (now() - t0 > 5000)
      throw new Error(`hop to ${id}: ${s.state} feet ${s.feet.toFixed(2)}`);
    await frame();
  }
  await hold(new Set());
  return s;
}
// A running jump from one isle to the next: a run-up straight at it from inside the rim.
async function leap(edge, target, id) {
  const [ex, ez] = edge,
    [tx, tz] = target;
  const d = Math.hypot(tx - ex, tz - ez);
  const ux = (tx - ex) / d,
    uz = (tz - ez) / d;
  await go(ex - ux * 3.6, ez - uz * 3.6, { tol: 0.3 });
  await turnTo(tx, tz);
  let s,
    t0 = now();
  for (;;) {
    s = await state();
    const along = (s.pos[0] - ex) * ux + (s.pos[1] - ez) * uz;
    const keys = steer(s, tx, tz).keys;
    if (along > -0.5) {
      await hold(new Set([...keys, "Space"]));
      break;
    }
    await hold(new Set(keys));
    if (now() - t0 > 5000) throw new Error(`run-up to ${id} stalled`);
    await frame();
  }
  await sleep(380);
  t0 = now();
  for (;;) {
    s = await state();
    await hold(new Set(steer(s, tx, tz).keys));
    if (s.state === "ground" && s.isles?.on === id) break;
    if (now() - t0 > 5000)
      throw new Error(`leap to ${id}: ${s.state} feet ${s.feet.toFixed(2)}`);
    await frame();
  }
  await hold(new Set());
  return s;
}

// Level 4: the slide, the pond's block, the thin ice and floes, the glyph in the ice, and the
// great ring opening onto the wildwood, walked through to its arrival.
async function frost() {
  let s = await until(
    (s) => s.where === "four" && s.frozen,
    8000,
    "arrive in the frozen reach",
  );
  await sleep(2600);
  note("in the frozen reach");
  await orbit(360, 11, { tilt: -0.5, stillsAt: [0.2, 0.45, 0.7, 0.9] });
  const F = () => state().then((s) => s.frozen);
  await go(0, -11, { tol: 0.5, walk: false });
  await turnTo(0, -80);
  await hold(new Set(["KeyW"]));
  await sleep(1500);
  await still("slide");
  await until((s) => s.pos[1] < -43.1, 15000, "slide to the crevasse");
  await hold(new Set(["KeyW", "Space"]));
  await sleep(420);
  await hold(new Set(["KeyW"]));
  await until(
    (s) => s.state === "ground" && s.pos[1] < -46.9,
    5000,
    "land across the crevasse",
  );
  await hold(new Set());
  note("slid and jumped the crevasse");
  const push = async (x, z, dir, label) => {
    await settle(x, z);
    await turnTo(x + dir[0] * 10, z + dir[1] * 10);
    await hold(new Set(["KeyE", "KeyW"]));
    await until((s) => s.frozen.block.state === "sliding", 4000, label);
    await hold(new Set());
    return until((s) => s.frozen.block.state === "rest", 5000, label);
  };
  s = await push(-5.45, -61, [1, 0], "push the block east");
  note("pushed the block east");
  s = await push(3, -58.55, [0, -1], "push the block north");
  note("pushed the block north");
  if (
    Math.abs(s.frozen.block.x - 3) > 0.1 ||
    Math.abs(s.frozen.block.z + 73) > 0.1
  )
    throw new Error(
      `the block missed the notch: ${JSON.stringify(s.frozen.block)}`,
    );
  await still("block");
  const climb = async (feet, label) => {
    for (let i = 0; i < 4; i++) {
      await tap(["KeyW", "Space"], 350);
      await sleep(250);
      let t = await state();
      if (t.state === "hang") {
        await tap(["KeyW"], 700);
        await sleep(900);
      }
      t = await state();
      if (t.state === "ground" && Math.abs(t.feet - feet) < 0.1) return t;
      await sleep(400);
    }
    throw new Error(`${label}: ${(await state()).state}`);
  };
  await settle(3, -71.3);
  await turnTo(3, -90);
  await climb(1.9, "climb the block");
  await climb(3.8, "climb out at the notch");
  note("climbed out of the pond by the block");
  await go(0, -90, { tol: 0.5, walk: false });
  await go(0, -100.5, { tol: 0.5, walk: false });
  await turnTo(0, -130);
  await hold(new Set(["KeyW"]));
  await until(
    (s) => s.state === "ground" && s.pos[1] < -121.8 && s.feet > 0.18,
    9000,
    "run the thin ice to the floe",
  );
  await hold(new Set());
  note(`ran the thin ice: ${(await F()).thin.join(", ")}`);
  await still("thin-ice");
  const jumpWhen = async (ready, onto, label) => {
    await until(ready, 30000, label);
    await tap(["KeyW", "Space"], 420);
    return until(onto, 4000, label);
  };
  await go(0, -124.4, { tol: 0.3 });
  await turnTo(0, -140);
  await jumpWhen(
    (s) => Math.abs(s.frozen.floes[0] - s.pos[0]) < 1.2,
    (s) => s.state === "ground" && s.pos[1] < -125.9,
    "onto the first floe",
  );
  const edge = async (z) => {
    for (let t0 = now(); now() - t0 < 2500;) {
      const t = await state();
      if (t.pos[1] <= z) break;
      await hold(new Set(["KeyW", "ShiftLeft"]));
      await frame();
    }
    await hold(new Set());
  };
  await edge(-128.4);
  await still("floe");
  await jumpWhen(
    (s) => Math.abs(s.frozen.floes[1] - s.pos[0]) < 1.2,
    (s) => s.state === "ground" && s.pos[1] < -130.1,
    "onto the second floe",
  );
  note("rode the floes");
  await edge(-132.6);
  await jumpWhen(
    (s) => Math.abs(s.pos[0]) < 1.1,
    (s) => s.state === "ground" && s.pos[1] < -134.5 && s.feet > 0.5,
    "onto the island",
  );
  note("on the island");
  await go(-2.4, -141.4, { tol: 0.4 });
  for (let i = 0; i < 12 && !(await F()).freed; i++) {
    s = await until(
      (s) => s.frozen.disc?.state === "held",
      6000,
      "disc in hand",
    );
    if (!s.frozen.disc.charged) {
      await turnTo(-5, -143);
      await tap(["KeyR"], 80);
      await sleep(1200);
      continue;
    }
    await turnTo(0, -147.5);
    await tap(["KeyR"], 80);
    await sleep(1100);
  }
  if (!(await F()).freed) throw new Error("the glyph is still frozen");
  note("freed the third glyph from the ice");
  await watch("great-ring", { every: 1000 });
  s = await until((s) => s.frozen.ring === "open", 20000, "the ring open");
  note("the great ring is open onto the forest");
  await go(0, -151.5, { tol: 0.5, walk: false });
  await turnTo(0, -170);
  await hold(new Set(["KeyW"]));
  await until((s) => s.where === "five", 10000, "through the great ring");
  await hold(new Set());
  note("through the great ring into the wildwood");
  await sleep(2500);
  await still("wildwood");
  await sleep(3000);
}
