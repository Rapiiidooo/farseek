// Records the teaser's shots: each opens its chapter, sets its moment up with real keys, then
// films it through a lens of its own in virtual time, one frame per sixtieth of a second of
// film, so no frame is dropped and a shot can play the game slower than real time.
//   node scripts/teaser/record.mjs <shot|all> [shot...] [--out=outputs/teaser] [--dry]
//     [--proof=<frames>] [--ss] [--url=http://localhost:3002/]
// --dry plays without writing the film; --proof saves a JPEG every <frames> frames; --ss draws
// at 1.5 times the size and scales the film down to 1920x1080.
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SHOTS } from "./shots.mjs";

const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ids = wanted.includes("all") ? Object.keys(SHOTS) : wanted;
for (const id of ids)
  if (!SHOTS[id]) {
    console.error(`unknown shot ${id}: ${Object.keys(SHOTS).join(", ")}`);
    process.exit(1);
  }
const out = arg("out") || "outputs/teaser";
const base = arg("url") || "http://localhost:3002/";
const dry = process.argv.includes("--dry");
const proof = Number(arg("proof") || 0);
const ss = process.argv.includes("--ss");
await mkdir(`${out}/proof`, { recursive: true });

const FPS = 60;
const DT = 1000 / FPS;
const VIEW = ss
  ? { width: 1920, height: 1080, deviceScaleFactor: 1.5 }
  : { width: 1280, height: 720, deviceScaleFactor: 1.5 };

const source = await readFile("scripts/record-trailer.mjs", "utf8");
const from = source.indexOf("function virtualClock() {");
const to = source.indexOf("// Stands in for the game's sound module:");
if (from < 0 || to < from) throw new Error("virtual clock not found");
const clockSource = source.slice(from, to).trim();
const rigSource = await readFile("scripts/teaser/rig.js", "utf8");

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function encoder(file) {
  const ff = spawn(
    "/opt/homebrew/bin/ffmpeg",
    [
      ...["-hide_banner", "-loglevel", "error", "-y"],
      ...["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg"],
      "-i",
      "-",
      ...(ss ? ["-vf", "scale=1920:1080:flags=lanczos"] : []),
      ...["-c:v", "libx264", "-preset", "medium", "-crf", "10"],
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
    end() {
      ff.stdin.end();
      return closed;
    },
  };
}

async function film(id) {
  const shot = SHOTS[id];
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
    (m) =>
      m.type() === "error" &&
      !/Failed to load resource/.test(m.text()) &&
      errors.push(m.text()),
  );
  await page.evaluateOnNewDocument(
    (settings, progress) => {
      localStorage.setItem(
        "far-door-settings",
        JSON.stringify({
          quality: "high",
          hints: false,
          markers: false,
          shake: false,
          ...settings,
        }),
      );
      if (progress)
        localStorage.setItem("far-door-progress", JSON.stringify(progress));
      else localStorage.removeItem("far-door-progress");
      // Seeded, so a shot plays the same way each time it is filmed.
      let seed = 0x2545f491;
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    shot.settings || {},
    shot.progress || null,
  );
  await page.evaluateOnNewDocument(`(${clockSource})()`);

  const query = new URLSearchParams({
    chapter: shot.chapter,
    nolock: "1",
    debug: "1",
    ...(shot.query || {}),
  });
  const started = Date.now();
  await page.goto(`${base}?${query}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 240000,
    polling: 250,
  });
  await page.addStyleTag({
    content: `body > :not(#view${(shot.show || []).map((id) => `):not(${id}`).join("")}) {
        visibility: hidden !important; opacity: 0 !important; }
      #view { cursor: none !important; }`,
  });
  await page.addScriptTag({ content: rigSource });
  await realSleep(1200);
  await page.evaluate(() => {
    window.__vt.enable();
    window.__teaserInstall();
  });

  let frames = 0,
    filmed = 0,
    take = null,
    time = 0;
  const takes = [];
  const held = new Set();
  const state = () => page.evaluate(() => window.__GAME__);
  const ctx = {
    page,
    id,
    out,
    dry,
    state,
    eval: (fn, ...args) => page.evaluate(fn, ...args),
    // One frame of film: the game advances `speed` sixtieths of a second.
    async frame(speed = 1) {
      const dt = DT * speed;
      time += dt / 1000;
      const t = await page.evaluate(
        (dt, t) => {
          const T = window.__teaser;
          T.t = t;
          T.dt = dt / 1000;
          T.before();
          const telemetry = window.__vt.step(dt);
          return { ...telemetry, cam: T.last };
        },
        dt,
        take ? time - take.start : time,
      );
      frames++;
      if (!take) return t;
      take.frames.push({
        t: +(time - take.start).toFixed(4),
        speed,
        hero: t.hero,
        cam: t.cam,
      });
      if (take.encoder || (proof && filmed % proof === 0)) {
        const buf = await page.screenshot({
          type: "jpeg",
          quality: 95,
          optimizeForSpeed: true,
          captureBeyondViewport: false,
        });
        if (take.encoder) await take.encoder.write(buf);
        if (proof && filmed % proof === 0)
          await writeFile(
            `${out}/proof/${take.name}-${String(filmed).padStart(4, "0")}.jpg`,
            buf,
          );
      }
      filmed++;
      return t;
    },
    async wait(seconds, speed = 1) {
      for (let i = Math.max(1, Math.round(seconds * FPS)); i > 0; i--)
        await ctx.frame(typeof speed === "function" ? speed() : speed);
    },
    async until(test, seconds, label, speed = 1) {
      for (let i = Math.round(seconds * FPS); i > 0; i--) {
        const s = await state();
        if (await test(s)) return s;
        await ctx.frame(speed);
      }
      const s = await state();
      throw new Error(
        `${label}: ${s.state} at ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)}`,
      );
    },
    // The shot's lens: a function (t, subject, mem, lib, params, dt) => {pos, look, fov}.
    lens(fn, params = {}) {
      return page.evaluate(
        (src, params) => window.__teaser.set(src, params),
        fn ? fn.toString() : null,
        params,
      );
    },
    steer(point) {
      return page.evaluate((p) => {
        window.__teaser.steer = p;
        if (!p) window.__teaser.yaw = null;
      }, point);
    },
    face(yaw, pitch) {
      return page.evaluate(
        (y, p) => {
          window.__teaser.steer = null;
          window.__teaser.yaw = y;
          if (p !== undefined) window.__teaser.pitch = p;
        },
        yaw,
        pitch,
      );
    },
    async hold(keys) {
      for (const k of [...held])
        if (!keys.includes(k)) (await page.keyboard.up(k), held.delete(k));
      for (const k of keys)
        if (!held.has(k)) (await page.keyboard.down(k), held.add(k));
    },
    async tap(keys, seconds = 0.1, speed = 1) {
      await ctx.hold([...new Set([...held, ...keys])]);
      await ctx.wait(seconds, speed);
      await ctx.hold([...held].filter((k) => !keys.includes(k)));
    },
    async pace(want) {
      const s = await state();
      if (s.pace !== want) {
        await page.keyboard.press("ShiftLeft");
        await ctx.frame();
      }
    },
    spawn(x, z, feet, yawDeg = 180) {
      return page.evaluate(
        (x, z, feet, yaw) => {
          const { hero, follow, app } = window.__FD__;
          hero.spawn(x, z, feet, yaw);
          follow.yaw = yaw;
          follow.snap(hero);
          app.state.cinematic = app.state.intro = null;
        },
        x,
        z,
        feet,
        (yawDeg * Math.PI) / 180,
      );
    },
    skipCinematic() {
      return page.evaluate(() => {
        const s = window.__FD__.app.state;
        s.cinematic?.skip?.();
        s.cinematic = s.intro = null;
      });
    },
    async roll(name) {
      if (take) throw new Error(`take ${take.name} still rolling`);
      time = 0;
      take = {
        name: `${id}${name ? `-${name}` : ""}`,
        start: 0,
        frames: [],
        marks: [],
        encoder: dry
          ? null
          : encoder(`${out}/${id}${name ? `-${name}` : ""}.mp4`),
      };
      filmed = 0;
      console.log(`${take.name}: rolling`);
    },
    mark(label) {
      const t = take ? +(time - take.start).toFixed(3) : null;
      take?.marks.push({ t, frame: filmed, label });
      console.log(`  ${String(t?.toFixed(2)).padStart(6)}s  ${label}`);
    },
    async cut() {
      if (!take) return;
      if (take.encoder) await take.encoder.end();
      takes.push({
        name: take.name,
        frames: filmed,
        seconds: +(filmed / FPS).toFixed(3),
        marks: take.marks,
        track: take.frames,
      });
      console.log(`${take.name}: cut after ${(filmed / FPS).toFixed(2)}s`);
      take = null;
    },
  };

  let failure = null;
  try {
    await shot.run(ctx);
  } catch (e) {
    failure = e.message;
    console.log(`${id} FAILED: ${e.message}`);
    await page
      .screenshot({ path: `${out}/${id}-failure.jpg`, type: "jpeg" })
      .catch(() => {});
  } finally {
    await ctx.hold([]).catch(() => {});
    await ctx.cut().catch(() => {});
  }
  await writeFile(
    `${out}/${id}.json`,
    JSON.stringify(
      {
        id,
        chapter: shot.chapter,
        fps: FPS,
        view: VIEW,
        dry,
        failure,
        errors,
        realSeconds: Math.round((Date.now() - started) / 1000),
        takes,
      },
      null,
      1,
    ),
  );
  console.log(
    `${id}: ${failure ? "FAILED" : "done"} in ${Math.round((Date.now() - started) / 1000)}s, errors: ${errors.length ? errors.join(" | ") : "none"}`,
  );
  await Promise.race([browser.close(), realSleep(10000)]);
  return !failure && !errors.length;
}

let ok = true;
for (const id of ids) ok = (await film(id)) && ok;
process.exit(ok ? 0 : 1);
