// Plays the original four levels from the title to the playable forest with real
// key events, steering by the telemetry the game publishes (position, camera heading,
// mirror catches, the isles' pylons), and saves a screenshot at each milestone.
//   node scripts/playthrough.mjs [outDir] [--url=http://localhost:3002/?nolock=1]
//   [--from=w2 | --from=w3 | --from=w4] starts at the checkpoint, on the isles or in the frozen
//   reach instead of the title.
import puppeteer from "puppeteer-core";
import { mkdir, rm, writeFile } from "node:fs/promises";

const out = process.argv[2] || "outputs/playthrough";
const fromW2 = process.argv.includes("--from=w2");
const fromW4 = process.argv.includes("--from=w4");
const fromW3 = fromW4 || process.argv.includes("--from=w3");
const url =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  `http://localhost:3002/?nolock=1`;
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
page.on(
  "console",
  (m) => m.type() === "error" && !/404/.test(m.text()) && errors.push(m.text()),
);
const log = [];
const note = (text) => {
  log.push(text);
  console.log(text);
};
// Mira's scenes are skipped with Enter as they start, as a hurried player would.
let sceneSkipped = 0;
const state = async () => {
  const s = await page.evaluate(() => window.__GAME__);
  if (s?.beat && Date.now() - sceneSkipped > 500) {
    sceneSkipped = Date.now();
    await page.keyboard.press("Enter");
  }
  return s;
};
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
async function tap(keys, ms) {
  await hold(new Set(keys));
  await sleep(ms);
  await hold(new Set());
}
let shots = 0;
async function shot(name) {
  await page.screenshot({
    path: `${out}/${String(++shots).padStart(2, "0")}-${name}.png`,
  });
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
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await state();
    const { keys, d } = steer(s, x, z, lat);
    if (d < tol) {
      await hold(new Set());
      return s;
    }
    if (walk && d < 1.5) keys.push("ShiftLeft");
    await hold(new Set(keys));
    await sleep(25);
  }
  const s = await state();
  throw new Error(
    `go ${x},${z} stuck at ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)} ${s.state}`,
  );
}
// On ice the explorer slides on after the keys are let go: steer, brake and wait until it has
// come to rest within `tol` of the spot.
async function settle(x, z, { tol = 0.3, timeout = 15000 } = {}) {
  const t0 = Date.now();
  let last = null,
    still = 0;
  while (Date.now() - t0 < timeout) {
    const s = await state();
    const { keys, d } = steer(s, x, z);
    // Held against a wall on ice the velocity stays up while the body cannot move.
    still =
      last && Math.hypot(s.pos[0] - last[0], s.pos[1] - last[1]) < 0.004
        ? still + 1
        : 0;
    last = s.pos;
    const resting = s.speed < 0.35 || still > 3;
    if (d < tol && resting) {
      await hold(new Set());
      return s;
    }
    if (d < 1.5) {
      // Close in by short walking presses, each slide let die before the next, so a slow
      // frame cannot carry the explorer past the spot and back.
      await hold(new Set());
      if ((s.speed < 0.5 || still > 3) && d >= tol)
        await tap([...keys, "ShiftLeft"], d < 0.6 ? 60 : 110);
      await sleep(40);
      continue;
    }
    await hold(new Set(keys));
    await sleep(25);
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
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await state();
    if (test(s)) return s;
    await sleep(50);
  }
  const s = await state();
  throw new Error(
    `${label}: state ${s.state} pos ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)}`,
  );
}
// Right-button drag turns the camera without pointer lock.
async function turnTo(x, z) {
  for (let i = 0; i < 14; i++) {
    const st = await state();
    const want = Math.atan2(x - st.pos[0], z - st.pos[1]);
    const d = Math.atan2(
      Math.sin(want - st.camYaw),
      Math.cos(want - st.camYaw),
    );
    if (Math.abs(d) < 0.06) return;
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(
      640 - Math.max(-120, Math.min(120, d / 0.0026)),
      360,
      { steps: 4 },
    );
    await page.mouse.up({ button: "right" });
    await sleep(40);
  }
}
// A running jump from one isle to the next: a run-up straight at it from inside the rim,
// the jump at the rim, and steering through the air onto it.
// The last metre of a run-up is watched in the page, frame by frame, so a busy machine's late
// telemetry cannot carry the explorer past her take-off point.
async function takeOff([ex, ez], [ux, uz], margin) {
  await page
    .waitForFunction(
      (ex, ez, ux, uz, margin) => {
        const g = window.__GAME__;
        return (g.pos[0] - ex) * ux + (g.pos[1] - ez) * uz > -margin;
      },
      { polling: "raf", timeout: 2500 },
      ex,
      ez,
      ux,
      uz,
      margin,
    )
    .catch(() => {});
}
// A jump from wherever the explorer stands: run at the edge and take off just before it. The
// crumbling stones leave no time for a run-up.
async function hop(edge, target, id) {
  const [ex, ez] = edge,
    [tx, tz] = target;
  const d = Math.hypot(tx - ex, tz - ez);
  const ux = (tx - ex) / d,
    uz = (tz - ez) / d;
  let s,
    t0 = Date.now();
  for (;;) {
    s = await state();
    const along = (s.pos[0] - ex) * ux + (s.pos[1] - ez) * uz;
    const keys = steer(s, tx, tz).keys;
    if (along > -1.4) {
      await hold(new Set(keys));
      await takeOff(edge, [ux, uz], 0.45);
      await hold(new Set([...keys, "Space"]));
      break;
    }
    await hold(new Set(keys));
    if (Date.now() - t0 > 4000) throw new Error(`run at ${id} stalled`);
    await sleep(16);
  }
  await sleep(380);
  t0 = Date.now();
  for (;;) {
    s = await state();
    await hold(new Set(steer(s, tx, tz).keys));
    if (s.state === "ground" && s.isles?.on === id) break;
    if (Date.now() - t0 > 5000)
      throw new Error(
        `hop to ${id}: ${s.state} at ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)}`,
      );
    await sleep(25);
  }
  await hold(new Set());
  return s;
}
async function leap(edge, target, id) {
  const [ex, ez] = edge,
    [tx, tz] = target;
  const d = Math.hypot(tx - ex, tz - ez);
  const ux = (tx - ex) / d,
    uz = (tz - ez) / d;
  await go(ex - ux * 3.6, ez - uz * 3.6, { tol: 0.3 });
  await turnTo(tx, tz);
  let s,
    t0 = Date.now();
  for (;;) {
    s = await state();
    const along = (s.pos[0] - ex) * ux + (s.pos[1] - ez) * uz;
    const keys = steer(s, tx, tz).keys;
    if (along > -1.6) {
      await hold(new Set(keys));
      await takeOff(edge, [ux, uz], 0.5);
      await hold(new Set([...keys, "Space"]));
      break;
    }
    await hold(new Set(keys));
    if (Date.now() - t0 > 5000) throw new Error(`run-up to ${id} stalled`);
    await sleep(16);
  }
  await sleep(380);
  t0 = Date.now();
  for (;;) {
    s = await state();
    await hold(new Set(steer(s, tx, tz).keys));
    if (s.state === "ground" && s.isles?.on === id) break;
    if (Date.now() - t0 > 5000)
      throw new Error(
        `leap to ${id}: ${s.state} at ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)}`,
      );
    await sleep(25);
  }
  await hold(new Set());
  return s;
}
async function aim(mirror, target, key) {
  await hold(new Set(["KeyE"]));
  await sleep(200);
  const before = await state();
  if (before.state !== "turn")
    throw new Error(
      `could not take hold of ${mirror}: ${before.state} at ${before.pos.map((v) => v.toFixed(2))}`,
    );
  // Turn one way; if the mirror stops at the edge of its face, turn the other way.
  const t0 = Date.now();
  let dir = key,
    lastYaw = null,
    still = 0;
  await hold(new Set(["KeyE", dir]));
  for (;;) {
    const s = await state();
    const m = s.mirrors.find((m) => m.id === mirror);
    if (m.locked === target) break;
    if (Date.now() - t0 > 20000)
      throw new Error(`aim ${mirror} at ${target}: yaw ${m.yaw.toFixed(2)}`);
    still =
      lastYaw !== null && Math.abs(m.yaw - lastYaw) < 1e-4 && !m.locked
        ? still + 1
        : 0;
    lastYaw = m.yaw;
    if (still > 15) {
      dir = dir === "KeyA" ? "KeyD" : "KeyA";
      await hold(new Set(["KeyE", dir]));
      still = 0;
    }
    await sleep(40);
  }
  await hold(new Set(["KeyE"]));
  await sleep(700);
  await hold(new Set());
  await sleep(200);
}

try {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 60000,
  });
  await shot("title");
  if (fromW2 || fromW3) {
    // The Levels menu, unlocked by a previous run in this profile or not at all: start the
    // checkpoint or the isles through the development shortcut instead.
    await page.goto(
      url +
        (fromW4
          ? "&chapter=frost"
          : fromW3
            ? "&chapter=isles"
            : "&chapter=checkpoint"),
      { waitUntil: "load" },
    );
    await page.waitForFunction(() => window.__READY__ === true, {
      timeout: 60000,
    });
  } else {
    await page.click('button[data-action="new"]');
    // The worlds ahead are prepared first, then the opening shot plays; Enter skips it.
    await page.waitForFunction(
      () =>
        window.__GAME__?.mode === "play" &&
        document.querySelector("#loading").hidden,
      { timeout: 180000 },
    );
    await sleep(600);
    await tap(["Enter"], 80);
  }
  await sleep(1200);
  let s = await state();
  note(`start ${s.pos.map((v) => v.toFixed(1))} feet ${s.feet}`);

  if (fromW3) {
    // Straight to the isles below.
  } else if (!fromW2) {
    // The descent: run the terrace, jump the gap, hang down to the ledge, jump the chasm to
    // the crack, shimmy along it, climb out, and walk down the broken stair.
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
    note(`jumped the gap: ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet}`);
    await go(4, 36.45);
    await tap(["KeyW"], 120);
    await tap(["KeyC"], 120);
    s = await until(
      (s) => s.state === "hang",
      2000,
      "hang from the platform edge",
    );
    note(`hanging from the edge, feet ${s.feet.toFixed(2)}`);
    await shot("hang");
    await tap(["KeyC"], 120);
    s = await until(
      (s) => s.state === "ground" && Math.abs(s.feet - 5.5) < 0.05,
      3000,
      "drop to the ledge",
    );
    await go(4.5, 34.5);
    await jumpToward(4.5, 30, 800);
    s = await until((s) => s.state === "hang", 3000, "catch the crack");
    note(`caught the crack at ${s.pos.map((v) => v.toFixed(2))}`);
    await hold(new Set(["KeyD"]));
    s = await until((s) => s.pos[0] > 9.4, 9000, "shimmy along the crack");
    await hold(new Set());
    await shot("shimmy");
    await tap(["KeyW"], 500);
    s = await until(
      (s) => s.state === "ground" && Math.abs(s.feet - 7) < 0.05,
      3000,
      "climb onto the platform",
    );
    note(`climbed up at ${s.pos.map((v) => v.toFixed(2))}`);
    await go(9, 27);
    await go(19, 27, { walk: false });
    s = await until(
      (s) => s.state === "ground" && Math.abs(s.feet) < 0.05,
      3000,
      "reach the court floor",
    );
    note("reached the court floor");
    await shot("court");

    // The block in the sunlight.
    await go(19, 25);
    await go(5, 23.4);
    await go(5, 22.3, { tol: 0.1, timeout: 3000 }).catch(() => {});
    // North of the block the boulders are in the way, so it is pulled south, out of the beam.
    await tap(["KeyE"], 150);
    await tap(["KeyE", "KeyS"], 900);
    await sleep(700);
    s = await state();
    note(`pulled the block off the beam`);

    // Three mirrors, three stelae.
    await go(9, 23.3);
    await go(9, 21.9, { tol: 0.1, timeout: 3000 }).catch(() => {});
    await aim("m1", "left", "KeyD");
    s = await until(
      (s) => s.lit.includes("left"),
      3000,
      "light the left stela",
    );
    note(`lit: ${s.lit}`);
    await shot("first-glyph");
    await aim("m1", "m2", "KeyA");
    await go(9, 23.8);
    await go(20, 23.8, { walk: false });
    await go(21, 23.2);
    await go(21, 24.0, { tol: 0.1, timeout: 3000 }).catch(() => {});
    await aim("m2", "right", "KeyA");
    s = await until(
      (s) => s.lit.includes("right"),
      3000,
      "light the right stela",
    );
    note(`lit: ${s.lit}`);
    await aim("m2", "m3", "KeyA");
    await go(17.2, 25.3);
    await jumpToward(17.2, 27, 450);
    s = await until(
      (s) => s.state === "ground" && Math.abs(s.feet - 1) < 0.05,
      3000,
      "vault onto the low block",
    );
    await go(17.2, 27.5);
    await jumpToward(17.2, 31, 800);
    s = await until(
      (s) => s.state === "ground" && Math.abs(s.feet) < 0.05 && s.pos[1] > 29.8,
      3000,
      "land on the island",
    );
    note(`on the island ${s.pos.map((v) => v.toFixed(2))}`);
    await go(17, 30.35, { tol: 0.1, timeout: 3000 }).catch(() => {});
    await aim("m3", "top", "KeyA");
    s = await until((s) => s.lit.includes("top"), 3000, "light the top stela");
    note(`lit: ${s.lit}`);
    await shot("third-glyph");

    // The gate's set piece: the channels arm it, the ring charges, then it ignites.
    await until((s) => s.cinematic, 3000, "the gate wakes");
    await sleep(3600);
    await shot("gate-charge");
    await sleep(1900);
    await shot("gate-ignition");
    await sleep(2200);
    await shot("gate-reveal");
    await until((s) => s.gateOpen && !s.cinematic, 20000, "gate opening");
    await shot("gate-open");
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
    await shot("portal");
    // Walk at the ring's centre until the crossing takes the explorer through.
    await go(15, 9, { walk: false, timeout: 8000 }).catch(() => {});
    await hold(new Set());
    s = await until((s) => s.where === "two", 8000, "cross the gate");
  } else {
    s = await until(
      (s) => s.where === "two",
      8000,
      "start in the second world",
    );
  }
  if (!fromW3) await checkpoint(s);
  if (!fromW4) await isles();
  await frost();
  await until((s) => !s.cinematic, 20000, "the great ring releases the camera");
  await go(0, -151.5, { walk: false });
  await turnTo(0, -170);
  await hold(new Set(["KeyW"]));
  s = await until((s) => s.where === "five", 10000, "walk into the wildwood");
  await hold(new Set());
  await sleep(1500);
  await shot("wildwood-arrival");
  await until(
    (s) => !s.worlds.pending.length,
    120000,
    "background world preparation settles",
  );
  await sleep(250);
  s = await state();
  note(
    `shader programs at the first start ${s.programsAtStart}, after world preparation ${s.programsAtLoad}, at the forest ${s.programs}`,
  );
  if (s.programs !== s.programsAtLoad)
    throw new Error(
      `shaders compiled after background preparation settled: ${s.programsAtLoad} -> ${s.programs}`,
    );
  if (errors.length) throw new Error(errors.join(" | "));
  note("completed levels 1 through 4 and entered playable level 5");
} catch (e) {
  note(`FAILED: ${e.message}`);
  await shot("failure");
  process.exitCode = 1;
} finally {
  await hold(new Set()).catch(() => {});
  const s = await state().catch(() => null);
  note(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
  await writeFile(
    `${out}/log.json`,
    JSON.stringify({ log, last: s, errors }, null, 2),
  );
  const chrome = browser.process();
  await browser.close();
  chrome?.stdout?.destroy();
  chrome?.stderr?.destroy();
}

// The checkpoint, from the first door to the far door.
async function checkpoint(s) {
  note(`crossed into the second world at ${s.pos.map((v) => v.toFixed(2))}`);
  await sleep(1500);
  await shot("world-two");

  // The briefing at the booth.
  await go(-0.5, -12, { walk: false });
  await go(-4, -24.2, { walk: false });
  s = await until(
    (s) => s.checkpoint === "stamps",
    25000,
    "the clerk's briefing",
  );
  note("briefed by the clerk");
  await shot("briefing");

  // The offence: the sun disc out of the confiscation bin, in front of every Warden.
  // Round the queue's ropes rather than through them.
  await go(-7.2, -24.2);
  await go(-7.9, -27.6);
  await go(-7.9, -28.05, { tol: 0.15, timeout: 3000 }).catch(() => {});
  await tap(["KeyE"], 150);
  s = await until((s) => s.disc?.state === "held", 3000, "take the disc");
  note("took the disc; the Wardens are coming");
  await sleep(900);
  await shot("alarm");

  // The stamps: stand on each plate until its own Warden winds up over it, then step away.
  const PLATES = { crescent: [-8, -19.5], waves: [0, -22.8], disc: [8, -19.5] };
  const t0 = Date.now();
  let throws = 0,
    dodges = 0,
    fightShot = false;
  for (;;) {
    s = await state();
    const open = s.plates.filter((p) => !p.stamped);
    if (!open.length) break;
    if (Date.now() - t0 > 180000)
      throw new Error(
        `plates not stamped: ${JSON.stringify(s.plates)} guards ${JSON.stringify(s.guards)}`,
      );
    const plate = open[0];
    const [px, pz] = PLATES[plate.glyph];
    const warden = s.guards.find((g) => g.glyph === plate.glyph);
    // Out of the way of any stamp that is not the one we want.
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
      dodges++;
      if (!fightShot) {
        fightShot = true;
        await shot("stamp-ring");
      }
      await sleep(500);
      continue;
    }
    // The matching Warden has to be on the hunt: a disc to its mask sees to that. A charged
    // pulse only stuns it for a few seconds, after which it gives chase anyway.
    if (
      !warden.hostile &&
      !["break", "stun"].includes(warden.state) &&
      s.disc?.state === "held"
    ) {
      await turnTo(warden.pos[0], warden.pos[1]);
      await tap(["KeyR"], 80);
      throws++;
      await sleep(700);
      continue;
    }
    // Wait on the plate for it.
    const d = Math.hypot(px - s.pos[0], pz - s.pos[1]);
    if (d > 0.4) {
      await go(px, pz, { tol: 0.35, walk: d < 1.5, timeout: 6000 }).catch(
        () => {},
      );
      continue;
    }
    await sleep(120);
  }
  note(
    `plates stamped with ${throws} throws and ${dodges} dodges, health ${s.health}`,
  );
  await sleep(1200);
  await shot("stamped");

  // The lamp: from the plaza, a throw at the lamp passes through the crystal's beam first.
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
  s = await until((s) => s.checkpoint === "open", 3000, "light the lamp");
  note("lamp lit, barrier up");
  await sleep(1800);
  await shot("barrier-open");

  // The far door: onto its dais, through the set piece, and through.
  await go(-0.4, -30, { walk: false, timeout: 20000 });
  await go(0, -38, { walk: false, timeout: 20000 });
  // Its set piece starts as soon as the explorer sets foot on the dais.
  await go(0, -41.6, { walk: false, timeout: 8000 }).catch(() => {});
  await hold(new Set());
  s = await until((s) => s.cinematic, 6000, "the far door wakes");
  await sleep(4700);
  await shot("far-door-ignition");
  s = await until(
    (s) => s.exitOpen && !s.cinematic,
    20000,
    "the far door opens",
  );
  await shot("far-door-open");
  await hold(new Set(["KeyW"]));
  s = await until(
    (s) => s.where === "three",
    8000,
    "step through the far door",
  );
  await hold(new Set());
}

// The dawn isles: three jumps, then four pylons woken with a disc charged in the crystals'
// beams, their bridges crossed, and Mira's journal read at her camp.
// An expedition swing rope: a run-up on its line, a jump to catch it, forward held to pump
// the swing, jump again to let go near the front of the arc, then a steer onto the landing.
// The two timed presses wait in the page, frame by frame, so a busy machine cannot delay them.
async function swingAcross(id, target, landed, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let s = await state();
    const rope = s.isles.swings.find((r) => r.id === id);
    const [px, , pz] = rope.pivot,
      [hx, hz] = rope.heading;
    const ahead = (s) => (px - s.pos[0]) * hx + (pz - s.pos[1]) * hz;
    await go(px - hx * 6.4, pz - hz * 6.4, { tol: 0.3 });
    await turnTo(px + hx * 8, pz + hz * 8);
    await hold(new Set(["KeyW"]));
    await page.waitForFunction(
      (px, pz, hx, hz) => {
        const g = window.__GAME__;
        return (px - g.pos[0]) * hx + (pz - g.pos[1]) * hz < 3.35;
      },
      { polling: "raf", timeout: 4000 },
      px,
      pz,
      hx,
      hz,
    );
    await hold(new Set(["KeyW", "Space"]));
    s = await until(
      (s) => s.isles.pendulum || (s.state === "ground" && ahead(s) > 4),
      3000,
      `catch the ${id} rope`,
    ).catch(() => state());
    await hold(new Set(["KeyW"]));
    if (!s.isles.pendulum) {
      note(`missed the ${id} rope, attempt ${attempt + 1}`);
      await until((s) => s.state === "ground", 6000, "back on an isle");
      continue;
    }
    note(`caught the ${id} rope`);
    await page.waitForFunction(
      () => {
        const p = window.__GAME__.isles.pendulum;
        return !p || (p.angle > 0.62 && p.spin > 0);
      },
      { polling: "raf", timeout: 8000 },
    );
    if ((await state()).isles.pendulum) {
      await page.keyboard.press("Space");
      await shot(`isles-${id}-swing`);
    }
    const t0 = Date.now();
    for (;;) {
      s = await state();
      if (landed(s)) {
        await hold(new Set());
        return s;
      }
      if (s.state === "ground" || Date.now() - t0 > 4000) break;
      await hold(new Set(steer(s, target[0], target[1]).keys));
      await sleep(25);
    }
    await hold(new Set());
    note(`the ${id} swing fell short, attempt ${attempt + 1}`);
  }
  throw new Error(`could not swing across on the ${id} rope`);
}

async function isles() {
  let s = await until(
    (s) => s.where === "three" && s.isles?.edges,
    8000,
    "arrive on the isles",
  );
  note(`on the isles at ${s.pos.map((v) => v.toFixed(2))}`);
  await sleep(1800);
  await shot("isles-arrival");
  const L = s.isles;
  const at = Object.fromEntries(L.isles.map((i) => [i.id, i.at]));
  const ids = L.isles.map((i) => i.id);
  for (let k = 0; k < 2; k++)
    await leap(L.edges[k], at[ids[k + 1]], ids[k + 1]);
  note("jumped the first two gaps");
  await swingAcross(
    "first",
    at.well,
    (s) => s.state === "ground" && s.isles.on === "well",
  );
  note("swung across to the isle of the first pylon");
  await shot("isles-jumps");
  const pylon = (s, id) => s.isles.pylons.find((p) => p.id === id);
  const charge = async (well) => {
    for (let i = 0; i < 5; i++) {
      let s = await until(
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
  // Beside a pylon's plinth, and on its bridge just past the threshold.
  const dirOf = (p) => Math.sign(p.to - p.emit[1]);
  const beside = (p) => [p.lens[0] + 1.25, p.lens[1]];
  const onto = (p, k = 0.4) => [p.emit[0], p.emit[1] + dirOf(p) * k];
  const walkTo = ([x, z], opts = {}) =>
    go(x, z, { tol: 0.4, walk: false, ...opts });
  const enterBridge = async (p) => {
    const side = beside(p),
      entry = onto(p);
    await walkTo(side, { tol: 0.2, lat: 0.12 });
    await walkTo([side[0], p.emit[1] - dirOf(p) * 0.1], {
      tol: 0.2,
      lat: 0.12,
    });
    await walkTo(entry, { tol: 0.3, lat: 0.12 });
  };
  // Along a bridge of light, 1.9 m wide: face down it first and hold the line closely, or a
  // camera a few degrees off its axis walks the explorer off its side over twelve metres.
  const along = async ([x, z]) => {
    await turnTo(x, z);
    return walkTo([x, z], { timeout: 9000, lat: 0.12 });
  };
  // A clear spot 2.4 m from a crystal, towards the middle of its isle.
  const near = (w, id) => {
    const [ax, az] = at[id];
    const d = Math.hypot(ax - w[0], az - w[1]) || 1;
    return [w[0] + ((ax - w[0]) / d) * 2.4, w[1] + ((az - w[1]) / d) * 2.4];
  };
  // The first pylon: crystal and pylon on the same isle.
  await walkTo(near(W[0], "well"));
  await wake("first", W[0]);
  note("woke the first pylon");
  await sleep(700);
  await shot("isles-bridge");
  s = await state();
  let p = pylon(s, "first");
  await enterBridge(p);
  await along([p.emit[0], p.to + dirOf(p) * 1.2]);
  s = await until((s) => s.isles.on === "gap", 3000, "cross the first bridge");
  note("crossed the first bridge");
  // The second: its pylon stands on the far isle, facing back across the gap.
  p = pylon(s, "across");
  await walkTo(near(W[1], "gap"));
  await wake("across", W[1]);
  note("woke the pylon across the gap");
  s = await state();
  p = pylon(s, "across");
  await walkTo([p.emit[0], p.to + dirOf(p) * 0.6]);
  await along(onto(p, -0.3));
  await walkTo(beside(p));
  s = await until(
    (s) => s.isles.on === "pair",
    3000,
    "cross the second bridge",
  );
  note("crossed the second bridge");
  // Two pylons in a row on one charge.
  await walkTo(near(W[2], "pair"));
  await charge(W[2]);
  await wake("twinA", W[2]);
  await wake("twinB", W[2]);
  note("woke both pylons of the pair");
  await shot("isles-pair");
  s = await state();
  p = pylon(s, "twinA");
  const q = pylon(s, "twinB");
  await enterBridge(p);
  await along([p.emit[0], p.to + dirOf(p) * 0.4]);
  await enterBridge(q);
  await along([q.emit[0], q.to + dirOf(q) * 1.5]);
  s = await until((s) => s.isles.on === "ledge", 3000, "reach the ledge");
  note("crossed both bridges of the pair");
  // The ferry: aboard while it rests off the ledge, off while it rests off the far isle.
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
  await shot("isles-ferry");
  s = await until(ferryAt("b"), 16000, "the ferry reaches the far isle");
  await hop(s.isles.edges[k("ferry")], at.far, "far");
  note("off the ferry onto the far isle");
  // The stones: one run, a jump from each before it falls.
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
  s = await state();
  note(
    `crossed the crumbling stones: ${s.isles.stones.map((t) => t.phase).join(", ")}`,
  );
  await shot("isles-stones");
  // The relay: one charge for both pylons, the bridge between them crossed at once, and the
  // far bridge reached on the expedition's rope. A fall returns to the landing: start again.
  let relayed = false;
  for (let attempt = 0; attempt < 3 && !relayed; attempt++) {
    await walkTo(near(W[3], "landing"));
    await charge(W[3]);
    await wake("relay1", W[3]);
    s = await state();
    p = pylon(s, "relay1");
    await enterBridge(p);
    await along([p.emit[0], p.to + dirOf(p) * 1.4]);
    s = await until((s) => s.isles.on === "midway", 3000, "cross to midway");
    note(
      `on the small isle, ${s.isles.disc.charged ? "still glowing" : "dark"}`,
    );
    await wake("relay2", W[3]);
    note("woke the far pylon of the relay");
    s = await state();
    p = pylon(s, "relay2");
    const q = p;
    const onBridge = (s) =>
      s.state === "ground" &&
      Math.abs(s.pos[0] - q.emit[0]) < 0.95 &&
      (s.pos[1] - q.to) * dirOf(q) <= 0.05 &&
      (s.pos[1] - q.emit[1]) * dirOf(q) >= -0.6;
    relayed = await swingAcross(
      "relay",
      [q.emit[0], (q.to + q.emit[1]) / 2],
      (s) => onBridge(s) || (s.state === "ground" && s.isles.on === "camp"),
      1,
    ).then(
      () => true,
      (e) => {
        note(`${e.message}: the relay starts again from the landing`);
        return false;
      },
    );
    if (!relayed)
      await until(
        (s) => s.state === "ground" && s.isles.on === "landing",
        8000,
        "back on the landing",
      );
  }
  if (!relayed) throw new Error("could not reach the far bridge of the relay");
  note("swung onto the far bridge of light");
  await shot("isles-relay-swing");
  await along(onto(p, -0.3));
  await walkTo(beside(p));
  s = await until((s) => s.isles.on === "camp", 3000, "reach the camp");
  note("crossed to Mira's camp");
  await shot("isles-camp");
  await until((s) => s.beat === "camp", 20000, "Mira's camp scene");
  await until((s) => !s.cinematic, 8000, "Mira's camp scene skipped");
  // Her journal, in the open crate.
  const n = s.isles.note;
  // The prompt keeps its last text while hidden: only a showing one counts.
  const prompt = () =>
    page.evaluate(
      () => document.querySelector("#prompt.on")?.textContent || "",
    );
  // Round the crates until the journal is within reach and in front.
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
  await sleep(600);
  s = await state();
  const reading = await page.evaluate(
    () => !document.querySelector("#notes").hidden,
  );
  if (!reading) throw new Error("Mira's journal did not open");
  await shot("mira-journal");
  await tap(["KeyE"], 120);
  // Her pistols wait in the open case on the crate beside the others; the ring opens once
  // they are taken. The case stands 1.96 m and 3.1 m from the camp isle's centre (CAMP.pistols).
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
  await shot("mira-pistols");
  await tap(["KeyE"], 120);
  s = await until(
    (s) => s.equipment.pistolsUnlocked,
    3000,
    "Mira's pistols taken",
  );
  note("took Mira's pistols from her case");
  s = await until((s) => s.isles.read && s.cinematic, 8000, "the ring opens");
  note("read Mira's journal; her ring opens");
  await sleep(6500);
  await shot("mira-ring");
  s = await until(
    (s) => !s.cinematic && s.isles.ring.phase === "open",
    20000,
    "the ring open",
  );
  // Through the ring, halfway open onto the ice, round the pistol case first.
  const r = s.isles.ring;
  await go(box[0] - 1.1, box[1], { tol: 0.4, walk: false });
  await go(r.x, r.z + 2.6, { tol: 0.4, walk: false });
  await turnTo(r.x, r.z - 10);
  await hold(new Set(["KeyW"]));
  await until((s) => s.where === "four", 6000, "through Mira's ring");
  await hold(new Set());
  note("through Mira's ring into the frozen reach");
}

// The frost lynx hunts the open snow above the pond: cross it at a run, rolling on whenever it
// crouches to pounce within reach.
async function crossPlateau() {
  let rolls = 0;
  for (const [x, z] of [
    [0, -90],
    [0, -100.5],
  ]) {
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      const L = s.frozen?.hunt?.lynx;
      const { keys, d } = steer(s, x, z);
      if (d < 0.5) break;
      if (
        L?.state === "windup" &&
        L.windup > 0.4 &&
        Math.hypot(L.at[0] - s.pos[0], L.at[2] - s.pos[1]) < 9
      ) {
        await tap([...keys, "KeyQ"], 90);
        rolls++;
        await sleep(450);
        continue;
      }
      await hold(new Set(keys));
      if (Date.now() - t0 > 15000)
        throw new Error(
          `cross the plateau to ${x},${z}: ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)}`,
        );
      await sleep(25);
    }
    await hold(new Set());
  }
  const hunt = (await state()).frozen.hunt;
  note(
    `crossed the lynx's plateau: ${rolls} rolls, ${hunt.strikes} pounces landed`,
  );
}

// The frozen reach: the stream's slide and its crevasse, the blocks of the pond, the thin ice
// and the floes of the lake, then the glyph freed from the ice and the ring onto the forest.
async function frost() {
  let s = await until(
    (s) => s.where === "four" && s.frozen,
    8000,
    "arrive in the frozen reach",
  );
  note(`in the frozen reach at ${s.pos.map((v) => v.toFixed(2))}`);
  await sleep(1800);
  await shot("frost-arrival");
  const F = () => state().then((s) => s.frozen);
  // The stream: straight down the ice at a run, a jump at the crevasse's edge.
  await go(0, -11, { tol: 0.5, walk: false });
  await turnTo(0, -80);
  await hold(new Set(["KeyW"]));
  await until((s) => s.pos[1] < -43.1, 15000, "slide to the crevasse");
  await hold(new Set(["KeyW", "Space"]));
  await sleep(420);
  await hold(new Set(["KeyW"]));
  s = await until(
    (s) => s.state === "ground" && s.pos[1] < -46.9,
    5000,
    "land across the crevasse",
  );
  await hold(new Set());
  note(`slid and jumped the crevasse: ${s.pos.map((v) => v.toFixed(2))}`);
  await shot("frost-crevasse");
  await frostAxes();
  // The pond: push the block east against a pillar, then north under the notch.
  // From a stop 1.5 m off the block's face, walk into it holding the grip until it goes.
  const push = async (x, z, dir, label) => {
    await settle(x, z);
    await turnTo(x + dir[0] * 10, z + dir[1] * 10);
    await hold(new Set(["KeyE", "KeyW"]));
    await until((s) => s.frozen.block.state === "sliding", 4000, label);
    await hold(new Set());
    return until((s) => s.frozen.block.state === "rest", 5000, label);
  };
  s = await push(-5.45, -61, [1, 0], "push the block east");
  note(`pushed the block east to ${s.frozen.block.x}, ${s.frozen.block.z}`);
  s = await push(3, -58.55, [0, -1], "push the block north");
  note(`pushed the block north to ${s.frozen.block.x}, ${s.frozen.block.z}`);
  if (
    Math.abs(s.frozen.block.x - 3) > 0.1 ||
    Math.abs(s.frozen.block.z + 73) > 0.1
  )
    throw new Error(
      `the block missed the notch: ${JSON.stringify(s.frozen.block)}`,
    );
  await shot("frost-block");
  // Up the block, then up the notch.
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
    throw new Error(`${label}: ${JSON.stringify(await state()).slice(0, 200)}`);
  };
  await settle(3, -71.3);
  await turnTo(3, -90);
  await climb(1.9, "climb the block");
  await climb(3.8, "climb out at the notch");
  note("climbed out of the pond by the block");
  // Across the lynx's plateau and down to the shore, then a run over the thin ice to the floe.
  await crossPlateau();
  await turnTo(0, -130);
  await hold(new Set(["KeyW"]));
  s = await until(
    (s) => s.state === "ground" && s.pos[1] < -121.8 && s.feet > 0.18,
    9000,
    "run the thin ice to the floe",
  );
  await hold(new Set());
  note(`ran the thin ice: ${(await F()).thin.join(", ")}`);
  await shot("frost-thin-ice");
  // The floes: aboard each as it drifts past, then onto the island.
  const jumpWhen = async (ready, onto, label) => {
    await until(ready, 30000, label);
    await tap(["KeyW", "Space"], 420);
    return until(onto, 4000, label);
  };
  // A drifting floe is boarded where it will be on landing, about half a second after the jump.
  const floeAhead = (index) => {
    let last = null;
    return (s) => {
      const x = s.frozen.floes[index],
        t = Date.now();
      const v = last ? (x - last.x) / Math.max(0.03, (t - last.t) / 1000) : 0;
      last = { x, t };
      return Math.abs(v) > 0.2 && Math.abs(x + v * 0.55 - s.pos[0]) < 0.8;
    };
  };
  s = await state();
  await go(0, -124.4, { tol: 0.3 });
  await turnTo(0, -140);
  s = await jumpWhen(
    floeAhead(0),
    (s) => s.state === "ground" && s.pos[1] < -125.9,
    "onto the first floe",
  );
  // Carried along x, the explorer only steps forward on the floe, never to a fixed spot.
  const edge = async (z) => {
    for (let t0 = Date.now(); Date.now() - t0 < 2500;) {
      const t = await state();
      if (t.pos[1] <= z) break;
      await hold(new Set(["KeyW", "ShiftLeft"]));
      await sleep(30);
    }
    await hold(new Set());
  };
  await edge(-128.4);
  s = await jumpWhen(
    floeAhead(1),
    (s) => s.state === "ground" && s.pos[1] < -130.1,
    "onto the second floe",
  );
  note("rode the floes");
  await edge(-132.6);
  s = await jumpWhen(
    (s) => Math.abs(s.pos[0]) < 1.1,
    (s) => s.state === "ground" && s.pos[1] < -134.5 && s.feet > 0.5,
    "onto the island",
  );
  note(`on the island at ${s.pos.map((v) => v.toFixed(2))}`);
  await shot("frost-island");
  await frostShelf();
  // The glyph: charge the disc at the prism on its shelf, strike the ice until it falls away.
  for (let i = 0; i < 12 && !(await F()).freed; i++) {
    s = await until(
      (s) => s.frozen.disc?.state === "held",
      6000,
      "disc in hand",
    );
    if (!s.frozen.disc.charged) {
      await turnTo(-10.5, -144.7);
      await tap(["KeyR"], 80);
      await sleep(1200);
      continue;
    }
    await turnTo(0, -147.5);
    await tap(["KeyR"], 80);
    await sleep(1100);
  }
  s = await state();
  if (!s.frozen.freed)
    throw new Error(`the glyph is still frozen: ${s.frozen.broken}`);
  note("freed the third glyph from the ice");
  s = await until((s) => s.cinematic, 6000, "the great ring opens");
  await sleep(7000);
  await shot("frost-ring-opening");
  s = await until((s) => s.frozen.ring === "open", 20000, "the ring open");
  note("the great ring opened onto the forest");
  await sleep(9000);
  await shot("finale");
}

// Wall climbing as a player climbs: walk up to the ice, Space to take hold, then the move keys.
async function grabWall(id, label) {
  await hold(new Set(["KeyW"]));
  await sleep(400);
  await hold(new Set(["KeyW", "Space"]));
  const s = await until(
    (s) => s.state === "wall" && s.climb.wall === id,
    2500,
    label,
  );
  await hold(new Set(["KeyW"]));
  return s;
}

// The crevasse's landing: Mira's axes at the foot of the short fall that closes it. The fall is
// caught from the ground and let go of, then caught from a running jump and climbed over.
async function frostAxes() {
  // Close enough to touch them, so the grip needs no particular heading.
  await go(1.3, -48.95, { tol: 0.2 });
  await tap(["KeyE"], 80);
  let s = await until((s) => s.climb.axes, 2500, "take Mira's ice axes");
  note("took Mira's ice axes");
  await sleep(400);
  await shot("frost-axes-taken");
  await go(0.2, -48.95, { tol: 0.2 });
  await turnTo(0.2, -70);
  await grabWall("pocket", "catch the fall from the ground");
  await hold(new Set(["KeyW"]));
  s = await until((s) => s.feet > 1.1, 5000, "climb the fall");
  await hold(new Set());
  await shot("frost-axes-climb");
  await tap(["KeyC"], 80);
  s = await until(
    (s) => s.state === "ground" && s.feet < 0.05,
    3000,
    "let go of the fall",
  );
  note(`let go of the fall at ${s.pos.map((v) => v.toFixed(2))}`);
  await go(0.2, -47.3, { tol: 0.25 });
  await turnTo(0.2, -70);
  await hold(new Set(["KeyW"]));
  await until((s) => s.pos[1] < -48.1, 3000, "run at the fall");
  await hold(new Set(["KeyW", "Space"]));
  s = await until(
    (s) => s.state === "wall" && s.climb.wall === "pocket",
    2500,
    "catch the fall from a jump",
  );
  note(`caught the fall from a jump, feet ${s.feet.toFixed(2)}`);
  await hold(new Set(["KeyW"]));
  s = await until(
    (s) => s.state === "ground" && Math.abs(s.feet - 4) < 0.05,
    9000,
    "climb over the fall",
  );
  await hold(new Set());
  note("climbed the frozen fall with Mira's axes");
  // Down its back by the step to the shelf before the pond.
  await go(0, -55, { walk: false, tol: 0.6 });
}

// The prism's shelf on the island: up the scarred fall, aside from the ice that breaks off
// its lip, across the bare band with a leap, and over the top.
async function frostShelf() {
  await go(0, -139.5, { tol: 0.4 });
  await go(-7.3, -143.8, { tol: 0.3 });
  await turnTo(-20, -143.8);
  await hold(new Set(["KeyW"]));
  await until((s) => s.pos[0] < -8.05, 3000, "walk to the shelf's fall");
  await grabWall("shelf-lower", "catch the shelf's fall");
  await hold(new Set(["KeyW"]));
  const warned = (s) =>
    s.frozen.fallingIce.find((spot) => spot.wall)?.state === "warning";
  let s = await until(warned, 6000, "ice cracks over the climb");
  // Her right, towards -z, out of the ice's line.
  await hold(new Set(["KeyD"]));
  await shot("frost-shelf-warning");
  await until((s) => s.pos[1] < -144.75, 3000, "sidestep the falling ice");
  await hold(new Set());
  s = await until(
    (s) =>
      ["shatter", "spent"].includes(
        s.frozen.fallingIce.find((spot) => spot.wall)?.state,
      ),
    5000,
    "the ice falls past",
  );
  const spot = s.frozen.fallingIce.find((spot) => spot.wall);
  if (spot.contacts || s.state !== "wall")
    throw new Error(
      `the falling ice struck the climber: ${JSON.stringify(spot)}`,
    );
  note("sidestepped the ice falling down the shelf's fall");
  await hold(new Set(["KeyW"]));
  await until((s) => s.feet > 2, 4000, "top of the lower ice");
  await tap(["KeyW", "Space"], 120);
  s = await until(
    (s) => s.climb.wall === "shelf-upper" && !s.climb.leaping,
    2500,
    "leap across the bare rock",
  );
  note(`leapt to the upper ice, feet ${s.feet.toFixed(2)}`);
  await hold(new Set(["KeyW"]));
  s = await until(
    (s) => s.state === "ground" && Math.abs(s.feet - 5.6) < 0.05,
    6000,
    "pull up onto the prism's shelf",
  );
  await hold(new Set());
  note(`on the prism's shelf at ${s.pos.map((v) => v.toFixed(2))}`);
  await shot("frost-shelf");
}
