// The builders' vault from its chapter start to the completion callback, with real inputs:
// the six trials, the door's reveal and the crossing through the next door into the credits.
//   node scripts/vault-check.mjs <out> [--url=http://localhost:3002/?nolock=1&chapter=vault]
//     [--only=court,checkpoint,...] (trials to play, from their bays; the door needs all six)
//     [--skip-reveal] (press Enter through the reveal instead of watching it)
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const out = process.argv[2] || "outputs/vault-check";
const url =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/?nolock=1&chapter=vault";
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",");
const skipReveal = process.argv.includes("--skip-reveal");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [],
  checks = [],
  samples = [],
  log = [],
  held = new Set();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
    errors.push(m.text());
  if (m.type() === "warning" && /WebGL|GL_INVALID|shader/i.test(m.text()))
    errors.push(m.text());
});
page.on("response", (response) => {
  if (
    response.status() >= 400 &&
    new URL(response.url()).pathname !== "/favicon.ico"
  )
    errors.push(`${response.status()} ${response.url()}`);
});
const state = () => page.evaluate(() => window.__GAME__);
const vault = (s) => s.vault;
const note = (text) => {
  log.push(text);
  console.log(text);
};
const check = (name, ok, detail = null) => {
  checks.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${detail ? ` ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) throw new Error(name);
};
const sample = async (name) => {
  const s = await state();
  samples.push({
    name,
    time: s.time,
    pos: s.pos,
    feet: s.feet,
    state: s.state,
    programs: s.programs,
    programsAtLoad: s.programsAtLoad,
    draws: s.draws,
    tris: s.tris,
    fps: s.fps,
  });
  await page.screenshot({
    path: `${out}/${String(samples.length).padStart(2, "0")}-${name}.png`,
  });
};
async function hold(keys) {
  keys = new Set(keys);
  if (["KeyW", "KeyA", "KeyS", "KeyD"].some((key) => keys.has(key))) {
    const current = await state();
    const pace = keys.has("ShiftLeft") ? "walk" : "run";
    if (
      current?.mode === "play" &&
      !current.paused &&
      !current.cinematic &&
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
  keys.delete("ShiftLeft");
  for (const k of [...held])
    if (!keys.has(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
  for (const k of keys)
    if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
}
async function tap(keys, ms = 90) {
  await hold(keys);
  await sleep(ms);
  await hold([]);
}
// Gameplay deadlines run on the game's own clock; a wall watchdog ends a stalled browser.
async function until(test, timeout, label, wall = 240000) {
  let s = await state();
  const start = s.time,
    wallStart = Date.now();
  while ((s.time - start) * 1000 < timeout) {
    if (test(s)) return s;
    if (Date.now() - wallStart > wall) break;
    await sleep(40);
    s = await state();
  }
  throw new Error(
    `${label}: ${JSON.stringify({ pos: s.pos, feet: s.feet, state: s.state })}`,
  );
}
function steer(s, x, z, lat = 0.36) {
  const dx = x - s.pos[0],
    dz = z - s.pos[1],
    d = Math.hypot(dx, dz) || 1;
  const fx = Math.sin(s.camYaw),
    fz = Math.cos(s.camYaw);
  const f = (dx * fx + dz * fz) / d,
    r = (dx * -fz + dz * fx) / d;
  const keys = [];
  if (f > 0.36) keys.push("KeyW");
  if (f < -0.36) keys.push("KeyS");
  if (r > lat) keys.push("KeyD");
  if (r < -lat) keys.push("KeyA");
  return { keys, d };
}
async function go(x, z, { tol = 0.35, walk = true, timeout = 16000 } = {}) {
  let s = await state();
  // Long walks get the time a walking pace needs; turning the camera does not count.
  const far = Math.hypot(x - s.pos[0], z - s.pos[1]);
  let deadline = s.time + Math.max(timeout, (far / 2) * 1000 + 4000) / 1000,
    turns = 0;
  while (s.time < deadline) {
    const { keys, d } = steer(s, x, z);
    if (d < tol) {
      await hold([]);
      return s;
    }
    // A far target behind the camera is faced first: walking backwards into the lens swings the
    // follow camera round and the course with it.
    const off = Math.atan2(x - s.pos[0], z - s.pos[1]) - s.camYaw;
    if (
      d > 2.5 &&
      turns < 4 &&
      Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > 1.25
    ) {
      turns++;
      await hold([]);
      const before = s.time;
      await turnTo(x, z);
      s = await state();
      deadline += s.time - before;
      continue;
    }
    if (walk && d < 2.5) keys.push("ShiftLeft");
    await hold(keys);
    await sleep(25);
    s = await state();
  }
  // Callers may carry on after a missed fine approach: nothing stays held.
  await hold([]);
  throw new Error(
    `go ${x},${z} stuck at ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)} ${s.state} yaw ${s.camYaw.toFixed(2)} pace ${s.pace}`,
  );
}
// On ice the explorer slides on after the keys are let go: steer, brake and wait for rest.
async function settle(x, z, { tol = 0.3, timeout = 16000 } = {}) {
  let s = await state();
  const start = s.time;
  while ((s.time - start) * 1000 < timeout) {
    const { keys, d } = steer(s, x, z);
    if (d < tol && s.speed < 0.35) {
      await hold([]);
      return s;
    }
    if (d < 1.5) keys.push("ShiftLeft");
    await hold(d < tol ? [] : keys);
    await sleep(25);
    s = await state();
  }
  await hold([]);
  throw new Error(
    `settle ${x},${z} stuck at ${s.pos.map((v) => v.toFixed(2))}`,
  );
}
async function turnTo(x, z) {
  for (let i = 0; i < 18; i++) {
    const s = await state();
    const want = Math.atan2(x - s.pos[0], z - s.pos[1]);
    const delta = Math.atan2(
      Math.sin(want - s.camYaw),
      Math.cos(want - s.camYaw),
    );
    if (Math.abs(delta) < 0.045) return;
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(
      640 - Math.max(-150, Math.min(150, delta / 0.0026)),
      360,
      {
        steps: 4,
      },
    );
    await page.mouse.up({ button: "right" });
    await sleep(40);
  }
}
let aiming = false,
  pointer = { x: 640, y: 360 };
async function releaseAim() {
  if (!aiming) return;
  await page.mouse.up({ button: "right" });
  aiming = false;
}
async function select(item, key) {
  if ((await state()).equipment.selected === item) return;
  await releaseAim();
  await tap([key], 60);
  await until((s) => s.equipment.selected === item, 2500, `${item} selected`);
}
async function aimAt(point) {
  if (!aiming) {
    pointer = { x: 640, y: 360 };
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down({ button: "right" });
    aiming = true;
    await sleep(250);
  }
  for (let i = 0; i < 30; i++) {
    const aim = (await state()).equipment.aim;
    const [ox, oy, oz] = aim.origin,
      [dx, dy, dz] = aim.direction;
    const tx = point[0] - ox,
      ty = point[1] - oy,
      tz = point[2] - oz;
    const turn = Math.atan2(tx, tz) - Math.atan2(dx, dz);
    const yaw = Math.atan2(Math.sin(turn), Math.cos(turn));
    const pitch = Math.asin(ty / Math.hypot(tx, ty, tz)) - Math.asin(dy);
    if (Math.abs(yaw) < 0.008 && Math.abs(pitch) < 0.008) return;
    const mx = Math.max(-80, Math.min(80, yaw / 0.0026)),
      my = Math.max(-80, Math.min(80, pitch / 0.0022));
    if (
      pointer.x - mx < 400 ||
      pointer.x - mx > 880 ||
      pointer.y - my < 180 ||
      pointer.y - my > 520
    ) {
      await page.mouse.up({ button: "right" });
      pointer = { x: 640, y: 360 };
      await page.mouse.move(pointer.x, pointer.y);
      await page.mouse.down({ button: "right" });
    }
    pointer.x -= mx;
    pointer.y -= my;
    await page.mouse.move(pointer.x, pointer.y, { steps: 3 });
    await sleep(50);
  }
}
async function shoot(point) {
  await select("pistols", "Digit2");
  await aimAt(point);
  await until((s) => s.equipment.sight.ready, 800, "sight ready").catch(
    () => {},
  );
  const shots = (await state()).equipment.shots;
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await until(
    (s) => s.equipment.shots > shots || s.equipment.reloading,
    1500,
    "pistol shot",
  ).catch(() => {});
}
async function throwAt(point) {
  await select("orb", "Digit1");
  await until(
    (s) => vault(s).disc.state === "held" && vault(s).disc.cooldown === 0,
    5000,
    "relay ready",
  );
  await turnTo(point[0], point[2]);
  const before = vault(await state()).disc.activations;
  await page.keyboard.down("KeyR");
  try {
    await until((s) => vault(s).disc.activations > before, 2000, "relay pulse");
  } finally {
    await page.keyboard.up("KeyR");
  }
  return until((s) => vault(s).disc.cooldown === 0, 4000, "relay cooldown");
}
// Turns the explorer herself towards a point with a short step, as a player squares up.
async function face(x, z) {
  await turnTo(x, z);
  await tap(["KeyW", "ShiftLeft"], 140);
  await sleep(150);
}
// Holding a mirror and steering until it catches on the named target.
async function aim(mirror, target, key) {
  await hold(["KeyE"]);
  await sleep(200);
  const before = await state();
  if (before.state !== "turn")
    throw new Error(`could not take hold of ${mirror}: ${before.state}`);
  let dir = key,
    lastYaw = null,
    still = 0;
  const start = before.time;
  await hold(["KeyE", dir]);
  for (;;) {
    const s = await state();
    const m = vault(s).trials.court.mirrors.find((m) => m.id === mirror);
    if (m.locked === target) break;
    if (s.time - start > 25)
      throw new Error(`aim ${mirror} at ${target}: yaw ${m.yaw}`);
    still =
      lastYaw !== null && Math.abs(m.yaw - lastYaw) < 1e-4 && !m.locked
        ? still + 1
        : 0;
    lastYaw = m.yaw;
    if (still > 15) {
      dir = dir === "KeyA" ? "KeyD" : "KeyA";
      await hold(["KeyE", dir]);
      still = 0;
    }
    await sleep(40);
  }
  await hold(["KeyE"]);
  await sleep(500);
  await hold([]);
  await sleep(200);
}
// A walking hop at the next stone or bank, as a player at the default pace does it: walk on
// until the next stone is a stride and a jump away or the lip stops the explorer, then jump
// with forward held. The sinking stones leave no time to stand and think.
async function hop(x, z, landed, label) {
  await until((s) => s.state === "ground", 5000, `${label} takeoff`);
  let s = await state();
  const start = s.time;
  let still = 0;
  while (Math.hypot(x - s.pos[0], z - s.pos[1]) > 2.6 && still < 0.06) {
    await hold([...steer(s, x, z, 0.25).keys, "ShiftLeft"]);
    await sleep(16);
    const next = await state();
    still = next.speed < 0.05 ? still + next.time - s.time : 0;
    s = next;
    if (s.time - start > 4) throw new Error(`no takeoff for ${label}`);
  }
  const under = vault(s).trials.forest.stones.find((t) => t.held > 0);
  note(
    `${label}: takeoff at ${s.pos.map((v) => v.toFixed(2))} speed ${s.speed.toFixed(1)}${under ? `, stone held ${under.held}` : ""}`,
  );
  await hold([...steer(s, x, z, 0.25).keys, "ShiftLeft", "Space"]);
  await sleep(380);
  const jumped = s.time;
  for (;;) {
    s = await state();
    const d = Math.hypot(x - s.pos[0], z - s.pos[1]);
    if (s.state === "ground" && s.time - jumped > 0.25 && landed(s, d)) {
      note(
        `${label}: landed at ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)}`,
      );
      return s;
    }
    if (s.time - jumped > 3)
      throw new Error(`${label} failed at ${s.pos} ${s.state}`);
    await hold(d < 0.4 ? [] : [...steer(s, x, z, 0.25).keys, "ShiftLeft"]);
    await sleep(20);
  }
}

// Taking hold of a climbing face as a player does: walk up to it, then jump with forward held.
async function grabWall(id, label) {
  await hold(["KeyW", "ShiftLeft"]);
  await sleep(350);
  await hold(["KeyW", "ShiftLeft", "Space"]);
  const s = await until(
    (s) => s.state === "wall" && s.climb?.wall === id,
    2500,
    label,
  );
  await hold(["KeyW"]);
  return s;
}

// Up a face and over its top: forward held until the ledge climb sets her down on it.
async function climbOver(id, top, label) {
  await grabWall(id, `take hold of ${label}`);
  await hold(["KeyW"]);
  const s = await until(
    (s) => s.state === "ground" && s.feet > top - 0.2,
    12000,
    `climb ${label}`,
  );
  await hold([]);
  return s;
}

// The builders' cable over the isles chasm: a run-up on its line, a jump to catch it, forward
// held to pump, a jump to let go near the front of the arc, then a steer onto the landing. The
// two timed presses wait in the page, frame by frame, as the play-through's swings do.
async function swingBack(target, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let s = await state();
    const { pivot, heading } = vault(s).trials.isles.rope;
    const [px, , pz] = pivot,
      [hx, hz] = heading;
    await go(px - hx * 5.6, pz - hz * 5.6, { tol: 0.3 });
    await turnTo(px + hx * 8, pz + hz * 8);
    await hold(["KeyW"]);
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
    await hold(["KeyW", "Space"]);
    const leapt = (await state()).time;
    s = await until(
      (s) =>
        vault(s).pendulum || (s.state === "ground" && s.time > leapt + 0.5),
      3000,
      "catch the cable",
    ).catch(() => state());
    await hold(["KeyW"]);
    if (!vault(s).pendulum) {
      note(`missed the cable, attempt ${attempt + 1}`);
      await until((s) => s.state === "ground", 6000, "back on a ledge");
      continue;
    }
    note("caught the cable");
    await page.waitForFunction(
      () => {
        const p = window.__GAME__.vault.pendulum;
        return !p || (p.angle > 0.62 && p.spin > 0);
      },
      { polling: "raf", timeout: 8000 },
    );
    if (vault(await state()).pendulum) await page.keyboard.press("Space");
    const t0 = Date.now();
    for (;;) {
      s = await state();
      if (s.state === "ground" && s.pos[1] > -29 && s.feet > -0.1) {
        await hold([]);
        return s;
      }
      if (s.state === "ground" || Date.now() - t0 > 4000) break;
      await hold(steer(s, target[0], target[1]).keys);
      await sleep(25);
    }
    await hold([]);
    note(`the swing fell short, attempt ${attempt + 1}`);
  }
  throw new Error("could not swing back on the cable");
}

// --- the trials ---------------------------------------------------------------------------------
async function court() {
  await go(-3, -12, { walk: false });
  await go(-8, -12, { walk: false });
  await go(-24, -14.5, { walk: false });
  // The block stands in the beam: pulled south out of it, from its south face. The explorer
  // squares up against the face first, as a player does, so the grip takes that face.
  const inBeam = (s) => vault(s).trials.court.block.z < -16.5;
  for (let attempt = 0; attempt < 3 && inBeam(await state()); attempt++) {
    await go(-27, -14.4);
    await turnTo(-27, -20);
    await hold(["KeyW", "ShiftLeft"]);
    await until((s) => s.pos[1] < -15.5, 2500, "against the block").catch(
      () => {},
    );
    await hold([]);
    if (Math.abs((await state()).pos[0] + 27) > 0.6) continue;
    await hold(["KeyE"]);
    await until((s) => s.state === "grab", 1200, "grip the block").catch(
      () => {},
    );
    await hold(["KeyE", "KeyS"]);
    await until((s) => s.state === "shove", 1500, "pull").catch(() => {});
    await hold(["KeyE"]);
    await until(
      (s) => !vault(s).trials.court.block.moving,
      3000,
      "the block at rest",
    ).catch(() => {});
    await hold([]);
    await sleep(300);
  }
  let s = await state();
  check(
    "The block leaves the starlight",
    vault(s).trials.court.block.z > -16.5,
    vault(s).trials.court.block,
  );
  await sample("court-block");
  await go(-19, -15.4);
  await go(-19, -15.9, { tol: 0.1, timeout: 3000 }).catch(() => {});
  await face(-19, -17);
  await aim("m1", "m2", "KeyD");
  await go(-20.4, -8.6);
  await go(-19, -8.3);
  await go(-19, -8.0, { tol: 0.1, timeout: 3000 }).catch(() => {});
  await face(-19, -7);
  await aim("m2", "seal", "KeyD");
  s = await until(
    (s) => vault(s).trials.court.done,
    4000,
    "light the court's seal",
  );
  check("Relayed starlight wakes the court's seal", vault(s).trials.court.done);
  await sample("court-seal");
}

async function checkpoint() {
  await go(3, -12, { walk: false });
  await go(8, -12, { walk: false });
  const trial = async () => vault(await state()).trials.checkpoint;
  const { crystal } = await trial();
  // Out of the bay the keeper gives up the chase and walks back to its post.
  const calm = async () => {
    if (!(await trial()).keeper.hostile) return;
    await go(6.5, -12, { walk: false, tol: 0.6 });
    await until(
      (s) =>
        !vault(s).trials.checkpoint.keeper.hostile &&
        vault(s).trials.checkpoint.keeper.pos[0] > 20,
      25000,
      "the keeper back at its post",
    );
  };
  let s = await state();
  for (
    let attempt = 0;
    attempt < 4 && !vault(s).trials.checkpoint.done;
    attempt++
  ) {
    await calm();
    // First the relay's shield: up to the keeper until it takes offence, then the ward raised
    // as its stamp comes down, which leaves it reeling.
    if (attempt < 2) {
      await go(17.5, -11.6, { walk: false, tol: 0.6 });
      const parried = (await trial()).parried;
      s = await until(
        (s) => vault(s).trials.checkpoint.keeper.state === "windup",
        9000,
        "the keeper raises its stamp",
      ).catch(() => state());
      if (vault(s).trials.checkpoint.keeper.state === "windup") {
        // The ward lasts 1.2 s and the stamp falls about 1.1 s into the windup: raised halfway.
        const raised = s.time;
        await until(
          (s) => s.time > raised + 0.45,
          1500,
          "the stamp coming down",
        );
        await tap(["KeyV"], 80);
        s = await until(
          (s) => vault(s).trials.checkpoint.parried > parried,
          2500,
          "the stamp turned aside",
        ).catch(() => state());
      }
      note(
        `shield: parried ${vault(s).trials.checkpoint.parried}, keeper ${vault(s).trials.checkpoint.keeper.state}`,
      );
      if (!vault(s).trials.checkpoint.quiet) continue;
      check(
        "A stamp turned aside by the shield leaves the keeper reeling",
        vault(s).trials.checkpoint.parried > parried,
        vault(s).trials.checkpoint.keeper,
      );
      await go(30.0, -12, { walk: false, tol: 0.5, timeout: 6000 }).catch(
        () => {},
      );
      await tap(["KeyE"], 150);
      await sample("checkpoint-keeper");
      s = await until(
        (s) =>
          vault(s).trials.checkpoint.done || !vault(s).trials.checkpoint.quiet,
        2500,
        "press the keeper's seal",
      ).catch(() => state());
      continue;
    }
    if (!vault(await state()).disc.charged) {
      await go(crystal[0] + 0.6, crystal[2] - 3.2, { walk: false });
      for (let i = 0; i < 3 && !vault(await state()).disc.charged; i++)
        await throwAt(crystal);
      check("The crystal charges the orb", vault(await state()).disc.charged);
    }
    // Up to the keeper until it takes offence, then the charged pulse at once.
    await go(17.5, -11.6, { walk: false, tol: 0.6 });
    await until(
      (s) => vault(s).trials.checkpoint.keeper.hostile,
      6000,
      "the keeper takes offence",
    ).catch(() => {});
    if (!vault(await state()).disc.charged || !(await trial()).keeper.hostile)
      continue;
    await throwAt((await trial()).keeper.center);
    s = await state();
    note(
      `pulse: hits ${vault(s).hits}, keeper ${vault(s).trials.checkpoint.keeper.state}`,
    );
    if (!vault(s).trials.checkpoint.quiet) continue;
    check(
      "A charged pulse stuns the keeper",
      true,
      vault(s).trials.checkpoint.keeper,
    );
    // Straight past it to the seal while its eye is dark: running east, facing the seal.
    await go(30.0, -12, { walk: false, tol: 0.5, timeout: 6000 }).catch(
      () => {},
    );
    await tap(["KeyE"], 150);
    await sample("checkpoint-keeper");
    s = await until(
      (s) =>
        vault(s).trials.checkpoint.done || !vault(s).trials.checkpoint.quiet,
      2500,
      "press the keeper's seal",
    ).catch(() => state());
  }
  check(
    "The seal answers while its keeper is stunned",
    vault(s).trials.checkpoint.done,
  );
  await sample("checkpoint-seal");
}

async function isles() {
  await go(0, -27.5, { walk: false });
  await go(-8.5, -27.5, { walk: false });
  await go(-15, -27.4, { walk: false });
  const lock = vault(await state()).trials.isles.lock;
  for (let i = 0; i < 6 && vault(await state()).trials.isles.locked; i++)
    await shoot(lock);
  await releaseAim();
  check(
    "Pistol shots break the crystal lock",
    !vault(await state()).trials.isles.locked,
  );
  await sample("isles-lock");
  const { crystal, lens } = vault(await state()).trials.isles;
  // The charge lasts ten seconds: a slow walk to the lens spends it, and the player links again.
  for (
    let attempt = 0;
    attempt < 3 && !vault(await state()).trials.isles.bridge.on;
    attempt++
  ) {
    if (!vault(await state()).disc.charged) {
      await go(crystal[0] + 2.6, crystal[2] - 0.4, { walk: false });
      for (let i = 0; i < 3 && !vault(await state()).disc.charged; i++)
        await throwAt(crystal);
      check(
        "The isles crystal charges the orb",
        vault(await state()).disc.charged,
      );
    }
    await go(-22.4, -28.4, { walk: false, tol: 0.5 });
    await go(-21, -28.35, { tol: 0.25, timeout: 3000 }).catch(() => {});
    await throwAt(lens);
    await until(
      (s) => vault(s).trials.isles.bridge.on,
      2000,
      "the pylon wakes",
    ).catch(() => {});
  }
  let s = await state();
  check("A charged pulse wakes the pylon", vault(s).trials.isles.bridge.on);
  await sample("isles-bridge");
  await turnTo(-21, -40);
  await sleep(500);
  await go(-21, -36.4, { walk: false, tol: 0.5, timeout: 8000 });
  await go(-21, -37.15, { tol: 0.1, timeout: 3000 }).catch(() => {});
  await face(-21, -42);
  await tap(["KeyE"], 150);
  s = await until(
    (s) => vault(s).trials.isles.done,
    2500,
    "press the far seal",
  );
  check(
    "The bridge of light carries Nyra to the seal",
    vault(s).trials.isles.done,
  );
  await sample("isles-seal");
  // The seal drinks the bridge's light: the way back is the cable.
  await until(
    (s) => !vault(s).trials.isles.bridge.on,
    5000,
    "the bridge fades into the seal",
  );
  await turnTo(-25, -30);
  await sleep(600);
  await sample("isles-cable");
  s = await swingBack([-25, -27]);
  check("The cable carries Nyra back over the chasm", s.pos[1] > -29, {
    pos: s.pos,
  });
  await sample("isles-swing");
  await go(-19.2, -27.6);
  await go(-15, -27.5, { walk: false });
}

async function frost() {
  await go(3, -32, { walk: false });
  await go(8, -32, { walk: false });
  await go(11.6, -32);
  const block = async () => vault(await state()).trials.frost.block;
  const rest = (label) =>
    until((s) => vault(s).trials.frost.block.state === "rest", 6000, label);
  // Two posts leave no room to push the ice from where it starts: the orb's tether drags it
  // east, from a spot off its row, until the spire stops it in the plate's column.
  await go(20, -33.4, { walk: false });
  await settle(20, -33.4);
  const home = await block();
  await select("orb", "Digit1");
  await turnTo(home.x, home.z);
  await until((s) => vault(s).disc.state === "held", 5000, "the orb in hand");
  await hold(["KeyR"]);
  await until(
    (s) => vault(s).trials.frost.block.state === "sliding",
    3000,
    "the tether drags the ice",
  );
  await sample("frost-tether");
  await hold([]);
  let s = await rest("the ice slides to the spire");
  note(
    `tethered the ice to ${vault(s).trials.frost.block.x}, ${vault(s).trials.frost.block.z}`,
  );
  check(
    "The orb's tether drags the ice out of its corner",
    vault(s).trials.frost.block.x === 22,
    vault(s).trials.frost.block,
  );
  // Then a push south down the plate's column, from the slate north of it.
  await go(18, -38.9);
  await go(22, -38.9, { tol: 0.25 });
  await settle(22, -38.75);
  await turnTo(22, -28);
  await hold(["KeyE", "KeyW"]);
  await until(
    (s) => vault(s).trials.frost.block.state === "sliding",
    4000,
    "push the ice south",
  );
  await hold([]);
  s = await rest("the ice slides onto the plate");
  s = await until(
    (s) => vault(s).trials.frost.powered,
    2000,
    "the plate takes the ice",
  );
  check("The sliding ice wakes the plate", vault(s).trials.frost.powered);
  await sample("frost-plate");
  // Up the scarred fall with Mira's axes, to the seal on its shelf.
  const { wall } = vault(s).trials.frost;
  await go(26, -36.2, { walk: false });
  await go(wall.x, wall.z + 0.95, { tol: 0.2 });
  await turnTo(wall.x, wall.z - 5);
  s = await climbOver("frost-wall", wall.top, "the scarred ice");
  check("Mira's axes carry Nyra up the scarred ice", s.feet > wall.top - 0.2, {
    feet: s.feet,
    climb: s.climb,
  });
  await sample("frost-climb");
  const seal = vault(await state()).trials.frost.seal;
  await go(seal[0] - 1.25, seal[2], { tol: 0.25 }).catch(() => {});
  await turnTo(seal[0] + 3, seal[2]);
  await tap(["KeyE"], 150);
  s = await until(
    (s) => vault(s).trials.frost.done,
    2500,
    "press the seal on the shelf",
  );
  check("The frost seal wakes on its shelf", vault(s).trials.frost.done);
  // Down off the shelf and back along the slate, off the ice.
  await turnTo(wall.x, wall.z + 5);
  await go(wall.x, wall.z + 2.2, { walk: false, timeout: 6000 }).catch(
    () => {},
  );
  await until(
    (s) => s.state === "ground" && s.feet < 0.1,
    4000,
    "down from the shelf",
  );
  // Back across the ice: a post closes the slate strip along the north wall.
  await go(26, -34.8, { walk: false });
  await go(12, -34.8, { walk: false, tol: 0.6 });
}

async function forest() {
  await go(-3, -52, { walk: false });
  await go(-8, -52, { walk: false });
  await go(-10.6, -52);
  await turnTo(-30, -52);
  await sample("forest-stones");
  const { stones, radius } = vault(await state()).trials.forest;
  // The keeper may have taken a pip earlier: the bog must take none.
  const health = vault(await state()).health;
  const onStone = (s, d) => d < radius && Math.abs(s.feet - 0.15) < 0.25;
  for (const [i, stone] of stones.entries())
    await hop(stone.x, stone.z, onStone, `stone ${i}`);
  await hop(-30.9, -52, (s) => s.pos[0] < -30.2 && s.feet > -0.05, "far bank");
  await hold([]);
  check(
    "The sinking stones are crossed without a fall",
    vault(await state()).health === health,
  );
  // Up the ivy to the seal on its ledge, bare hands.
  const { ivy } = vault(await state()).trials.forest;
  await go(-31.2, -54.6);
  await go(ivy.x, ivy.z + 0.95, { tol: 0.2 });
  await turnTo(ivy.x, ivy.z - 5);
  let s = await climbOver("forest-ivy", ivy.top, "the ivy");
  check("Thick ivy carries Nyra to the ledge", s.feet > ivy.top - 0.2, {
    feet: s.feet,
  });
  const seal = vault(await state()).trials.forest.seal;
  await go(seal[0], seal[2] + 1.2, { tol: 0.25 }).catch(() => {});
  await turnTo(seal[0], seal[2] - 3);
  await tap(["KeyE"], 150);
  s = await until(
    (s) => vault(s).trials.forest.done,
    2500,
    "press the seal on the ledge",
  );
  check("The forest seal wakes across the bog", vault(s).trials.forest.done);
  await sample("forest-seal");
  // Down off the ledge, then back over the stones from the bank's lip on their line.
  await turnTo(ivy.x, ivy.z + 5);
  await go(ivy.x, ivy.z + 2.2, { walk: false, timeout: 6000 }).catch(() => {});
  await until(
    (s) => s.state === "ground" && s.feet < 0.1,
    4000,
    "down from the ledge",
  );
  await turnTo(-10, -52);
  await go(-30.5, -52, { tol: 0.3 });
  for (const [i, stone] of [...stones].reverse().entries())
    await hop(stone.x, stone.z, onStone, `stone back ${i}`);
  await hop(
    -11.4,
    -52,
    (s) => s.pos[0] > -12.8 && Math.abs(s.feet) < 0.05,
    "near bank",
  );
  await hold([]);
  check("Back over the bog unharmed", vault(await state()).health === health);
}

async function sea() {
  await go(3, -52, { walk: false });
  await go(8, -52, { walk: false });
  await go(16.4, -52);
  await go(17.4, -52);
  await go(18.3, -52);
  await go(19.2, -52);
  await hold(["KeyW"]);
  let s = await until((s) => s.swimming, 4000, "into the water");
  await hold([]);
  check("Into the well's water, swimming", s.swimming);
  await sample("sea-surface");
  await turnTo(30, -52);
  await hold(["KeyC"]);
  s = await until((s) => s.feet < -9.6, 8000, "dive down the well");
  // Eyes along the passage, as a player looks where she swims against the water pouring out.
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(640, 220, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await hold(["KeyC", "KeyW"]);
  s = await until((s) => s.pos[0] > 29.4, 10000, "along the passage");
  await hold(["KeyC"]);
  await sleep(300);
  await sample("sea-passage");
  note(`at the drowned seal: breath ${vault(await state()).breath} s`);
  await tap(["KeyE"], 150);
  s = await until(
    (s) => vault(s).trials.sea.done,
    2500,
    "press the drowned seal",
  );
  check(
    "The drowned seal wakes on one breath",
    vault(s).trials.sea.done && vault(s).breath > 0,
    {
      breath: vault(s).breath,
    },
  );
  await turnTo(18, -52);
  await hold(["KeyC", "KeyW"]);
  await until((s) => s.pos[0] < 23.5, 10000, "back through the passage");
  await hold(["Space"]);
  await until((s) => s.feet > -1.4, 9000, "up for air");
  // Along the surface to the steps, rising all the while, until a step takes the feet.
  s = await state();
  const surfaceStart = s.time;
  while (s.swimming) {
    await hold([...steer(s, 18.3, -52, 0.3).keys, "Space"]);
    await sleep(25);
    s = await state();
    if (s.time - surfaceStart > 12)
      throw new Error(`no way out of the water at ${s.pos}`);
  }
  await hold([]);
  await go(16, -52, { timeout: 8000 });
  s = await state();
  check(
    "Out of the well with breath to spare",
    !s.swimming && vault(s).health > 0,
    {
      health: vault(s).health,
    },
  );
}

try {
  await page.goto(url, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 240000,
  });
  await until(
    (s) => s.where === "vault" && s.mode === "play",
    15000,
    "vault chapter starts",
  );
  await sleep(1500);
  await page.waitForFunction(() => !window.__GAME__.worlds.pending.length, {
    timeout: 180000,
  });
  const initial = await state();
  await sample("arrival");
  check(
    "Vault shaders are prepared before play",
    initial.programsAtLoad > 0 && initial.programs === initial.programsAtLoad,
    { load: initial.programsAtLoad, now: initial.programs },
  );
  check(
    "The vault starts at its arrival with the orb and pistols",
    vault(initial).health === 4 &&
      initial.equipment.pistolsUnlocked !== false &&
      vault(initial).disc.state === "held",
  );
  const run = { court, checkpoint, isles, frost, forest, sea };
  // Each bay is left by its own opening, back into the nave.
  const doorway = {
    court: [-1, -12],
    checkpoint: [1, -12],
    isles: [-1, -27.5],
    frost: [1, -32],
    forest: [-1, -52],
    sea: [1, -52],
  };
  for (const name of only || Object.keys(run)) {
    note(`--- ${name}`);
    await run[name]();
    const [side, z] = doorway[name];
    await go(side * 11, z, { walk: false, tol: 0.6 });
    await go(side * 4, z, { walk: false, tol: 0.6 });
  }
  let s = await state();
  if (!only) {
    check(
      "All six seals awake",
      Object.values(vault(s).trials).every((t) => t.done),
    );
    s = await until(
      (s) => vault(s).hall.medallions.every((m) => m > 0.9),
      20000,
      "the six medallions light",
    );
    await go(4, -40, { walk: false });
    await go(0, -48, { walk: false });
    await sample("medallions");
    // Walking on towards the door opens it.
    await turnTo(0, -60);
    await hold(["KeyW"]);
    s = await until((s) => s.cinematic, 6000, "the door's reveal starts");
    await hold([]);
    check("The door opens on the whole address", vault(s).revealed);
    if (skipReveal) await tap(["Enter"], 100);
    else
      for (const [at, name] of [
        [3.5, "reveal-door"],
        [9, "reveal-masks"],
        [14, "reveal-dome"],
        [20, "reveal-lights"],
        [26, "reveal-next-door"],
      ]) {
        await sleep(Math.max(0, (at - ((await state()).time - s.time)) * 1000));
        await sample(name);
      }
    s = await until((s) => !s.cinematic, 40000, "the reveal ends");
    check(
      "The reveal hands control back with the next door open",
      vault(s).memory.next.phase === "open",
    );
    await sample("next-door");
    const next = vault(s).memory.next.center;
    await go(0, -60, { walk: false });
    await go(0, -70, { walk: false });
    await go(next[0], next[2] + 4, { walk: false });
    await sample("before-crossing");
    await turnTo(next[0], next[2] - 10);
    await hold(["KeyW"]);
    s = await until((s) => vault(s).completed, 6000, "through the next door");
    await hold([]);
    check(
      "Crossing the next door calls the completion callback",
      vault(s).completed,
    );
    await sleep(5000);
    await sample("beyond");
    s = await until((s) => s.credits, 15000, "credits after the vault");
    check(
      "The completion callback rolls the credits",
      s.credits && s.mode === "credits",
    );
    await sleep(3000);
    await sample("credits");
  }
  s = await state();
  if (!only) {
    const said = s.voice.lines.filter((line) => line.id.startsWith("vault-"));
    check(
      "Mira speaks the vault's lines live from their clips",
      said.length >= 15 &&
        said.every((line) => line.source === "clip" && line.mode === "live"),
      { said: said.length, sources: [...new Set(said.map((l) => l.source))] },
    );
  }
  check("No page or WebGL errors", errors.length === 0, errors);
  check(
    "No shader compiled during the vault",
    s.programs === initial.programsAtLoad,
    {
      load: initial.programsAtLoad,
      now: s.programs,
    },
  );
} catch (error) {
  checks.push({ name: "Run completes", ok: false, detail: error.stack });
  console.error(error.stack);
  await sample("failure").catch(() => {});
  process.exitCode = 1;
} finally {
  await hold([]).catch(() => {});
  await writeFile(
    `${out}/result.json`,
    JSON.stringify({ url, checks, errors, log, samples }, null, 2),
  );
  await browser.close();
}
