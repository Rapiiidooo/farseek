import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const out = process.argv[2] || "receipts/verification-expansion/sea/play";
const layoutOnly = process.argv.includes("--layout-only");
const introOnly = process.argv.includes("--intro-only");
const recovery = process.argv.includes("--recovery") && !layoutOnly;
const url =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/?nolock=1&chapter=sea";
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, hasTouch: true });
const errors = [],
  checks = [],
  samples = [],
  held = new Set();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
    errors.push(m.text());
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
const state = () => page.evaluate(() => window.__GAME__);
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
    wallTime: Date.now(),
    pos: s.pos,
    feet: s.feet,
    sea: s.sea,
    programs: s.programs,
    programsAtLoad: s.programsAtLoad,
    programsAtStart: s.programsAtStart,
  });
  await page.screenshot({
    path: `${out}/${String(samples.length).padStart(2, "0")}-${name}.png`,
  });
};
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
      await page.waitForFunction(
        (pace) => window.__GAME__?.pace === pace,
        { timeout: 3000 },
        pace,
      );
    }
  }
  keys = [...keys].filter((key) => key !== "ShiftLeft");
  for (const k of [...held])
    if (!keys.includes(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
  for (const k of keys)
    if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
}
async function tap(key, ms = 90) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}
function simulationWindow(initial, milliseconds, wallMilliseconds = 180000) {
  if (!Number.isFinite(initial?.time))
    throw new Error("Simulation time is missing from __GAME__");
  const started = initial.time;
  const wallStarted = Date.now();
  // Physics clamps long frames, so gameplay deadlines use its clock.
  // A separate wall watchdog still terminates a stopped browser.
  return (current) => {
    if (!Number.isFinite(current?.time))
      throw new Error("Simulation time is missing from __GAME__");
    const elapsed = (current.time - started) * 1000;
    const wallElapsed = Date.now() - wallStarted;
    if (wallElapsed >= wallMilliseconds)
      throw new Error(
        `Wall watchdog: ${wallElapsed} ms elapsed, ${elapsed.toFixed(1)} ms simulated`,
      );
    return elapsed < milliseconds;
  };
}
async function until(test, timeout, label) {
  let s = await state();
  const within = simulationWindow(s, timeout);
  while (within(s)) {
    if (s && test(s)) return s;
    await sleep(50);
    s = await state();
  }
  throw new Error(`${label}: ${JSON.stringify(await state())}`);
}
function steer(s, x, z) {
  const dx = x - s.pos[0],
    dz = z - s.pos[1],
    dist = Math.hypot(dx, dz) || 1;
  const fx = Math.sin(s.camYaw),
    fz = Math.cos(s.camYaw);
  const f = (dx * fx + dz * fz) / dist,
    r = (dx * -fz + dz * fx) / dist;
  const keys = [];
  if (f > 0.3) keys.push("KeyW");
  if (f < -0.3) keys.push("KeyS");
  if (r > 0.24) keys.push("KeyD");
  if (r < -0.24) keys.push("KeyA");
  return { keys, dist };
}
async function go(
  x,
  z,
  { tolerance = 0.4, timeout = 14000, slow = true } = {},
) {
  let s = await state();
  const within = simulationWindow(s, timeout);
  while (within(s)) {
    const { keys, dist } = steer(s, x, z);
    if (dist < tolerance || s.sea?.completed) {
      await hold([]);
      return s;
    }
    if (slow && dist < 1.4) keys.push("ShiftLeft");
    await hold(keys);
    await sleep(25);
    s = await state();
  }
  throw new Error(`Cannot reach ${x}, ${z}: ${JSON.stringify(await state())}`);
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
      { steps: 4 },
    );
    await page.mouse.up({ button: "right" });
    await sleep(40);
  }
}
// The orb only cracks the guardian's core; pistol fire, aimed by moving the camera onto the
// core, does the damage.
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
  await tap(key, 60);
  await until((s) => s.equipment.selected === item, 2000, `${item} selected`);
}
async function aimAt(point) {
  if (!aiming) {
    pointer = { x: 640, y: 360 };
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down({ button: "right" });
    aiming = true;
    await sleep(250);
  }
  for (let i = 0; i < 24; i++) {
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
  await until((s) => s.equipment.sight.ready, 800, "Sight ready").catch(
    () => {},
  );
  const shots = (await state()).equipment.shots;
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await until(
    (s) => s.equipment.shots > shots || s.equipment.reloading,
    1500,
    "Pistol shot",
  ).catch(() => {});
}
async function throwAt(point) {
  await select("orb", "Digit1");
  await until(
    (s) => s.sea.disc.state === "held" && s.sea.disc.cooldown === 0,
    5000,
    "Relay ready",
  );
  await turnTo(point[0], point[2]);
  const before = (await state()).sea.disc.activations;
  await page.keyboard.down("KeyR");
  try {
    await until(
      (s) => s.sea.disc.activations > before && s.sea.disc.state === "held",
      2000,
      "Relay activates while remaining in hand",
    );
  } finally {
    await page.keyboard.up("KeyR");
  }
  return until((s) => s.sea.disc.cooldown === 0, 5000, "Relay pulse completes");
}
// Swims at a height as well as a place: Space rises, C dives.
async function swimTo(
  x,
  z,
  y,
  { tolerance = 0.5, timeout = 15000, until: done } = {},
) {
  let s = await state();
  const within = simulationWindow(s, timeout);
  while (within(s)) {
    const { keys, dist } = steer(s, x, z);
    const level = y === undefined || !s.swimming || Math.abs(s.feet - y) < 0.45;
    if ((dist < tolerance && level) || done?.(s)) {
      await hold([]);
      return s;
    }
    if (dist < tolerance) keys.length = 0;
    if (y !== undefined && s.swimming) {
      if (s.feet < y - 0.3) keys.push("Space");
      if (s.feet > y + 0.4) keys.push("KeyC");
    }
    await hold(keys);
    await sleep(25);
    s = await state();
  }
  throw new Error(
    `Cannot swim to ${x}, ${z}: ${JSON.stringify(await state())}`,
  );
}
// The arrival current: from the still water behind one pier to the next, towards the desk.
async function crossArrivalCurrent() {
  const before = await state();
  const { shelters, lees } = before.sea.currents.arrival;
  for (const [i, [x, y, z]] of shelters.entries()) {
    // Round the end of the pier just left, inside the next lee, before heading upstream.
    if (i > 0)
      await swimTo(
        Math.min(x, lees[i - 1].maxX - 0.7),
        Math.min(z, lees[i - 1].minZ - 0.7),
        y - 0.3,
        { tolerance: 0.4 },
      );
    const s = await swimTo(x, z, y - 0.3, { tolerance: 0.6 });
    if (i === 1) await sample("current-shelter");
    check(`Pier ${i + 1} shelters the swimmer from the current`, s.swimming, {
      pos: s.pos,
      feet: s.feet,
    });
  }
  const after = await state();
  check(
    "The current is crossed with breath to spare",
    after.sea.breath.remaining > 15,
    {
      breath: after.sea.breath.remaining,
    },
  );
}
// The flooded stair: wait for the vent to calm, swim from the lee of one fallen block to the
// next, then rise and leave the water onto the far landing.
async function swimFloodedStair() {
  await go(0, -51.8, { tolerance: 0.35 });
  const flooded = (await state()).sea.currents.flooded;
  const centre = (l) => [(l.minX + l.maxX) / 2, (l.minZ + l.maxZ) / 2];
  const calm = () =>
    until(
      (s) => s.sea.currents.flooded.phase === "calm",
      8000,
      "The vent calms",
    );
  for (const [i, lee] of flooded.lees.entries()) {
    await calm();
    const [x, z] = centre(lee);
    await swimTo(x, z, 22.6);
    if (i === 0) {
      await until(
        (s) => s.sea.currents.flooded.phase === "burst",
        8000,
        "The vent surges",
      );
      await sleep(300);
      const s = await state();
      await sample("flooded-surge");
      check(
        "A fallen block shelters the swimmer through a surge",
        s.swimming &&
          s.pos[0] > lee.minX - 0.3 &&
          s.pos[0] < lee.maxX + 0.3 &&
          s.pos[1] < lee.maxZ + 0.3 &&
          s.feet + 0.9 < lee.maxY,
        { pos: s.pos, feet: s.feet, lee },
      );
    }
  }
  await calm();
  await swimTo(0, -59.6, 25.8);
  await swimTo(0, -62.6, 25.8, {
    timeout: 8000,
    until: (s) => s.state === "ground",
  });
  await until((s) => s.state === "ground", 3000, "Out of the flooded stair");
}
async function charge(index) {
  for (let i = 0; i < 3; i++) {
    if ((await state()).sea.disc.charged) return;
    await throwAt((await state()).sea.wells[index]);
  }
  check("Crystal charges the disc", (await state()).sea.disc.charged);
}

try {
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  await until(
    (s) => s.where === "six" && s.mode === "play",
    10000,
    "Sea chapter starts",
  );
  await sleep(1800);
  await page.waitForFunction(() => !window.__GAME__.worlds.pending.length, {
    timeout: 120000,
  });
  await sample("arrival");
  const initial = await state();
  check(
    "Sea and portal shaders are prepared before the route",
    initial.programsAtLoad > 0 &&
      initial.programsAtStart > 0 &&
      initial.programsAtStart <= initial.programsAtLoad &&
      initial.programs === initial.programsAtLoad,
    {
      load: initial.programsAtLoad,
      start: initial.programsAtStart,
      arrival: initial.programs,
    },
  );
  check(
    "Sea starts buoyant with the disc stowed",
    initial.state === "swim" &&
      initial.sea.swimming &&
      initial.feet > 31 &&
      initial.sea.health === 4 &&
      initial.sea.disc.state === "stowed",
  );
  await hold(["Space"]);
  await until((s) => s.feet > 33, 3000, "Rise in open water");
  await hold([]);
  check("Rise gains genuine altitude", (await state()).feet > initial.feet + 1);
  await crossArrivalCurrent();
  await go(10, -17.7);
  await hold(["KeyC"]);
  await until((s) => s.feet < 26.9, 7000, "Dive to submerged beacon");
  await hold([]);
  await until((s) => s.sea.intro.near, 2000, "Within reach of shield lens");
  await sample("submerged-beacon");
  check(
    "Dive reaches a lower beacon while swimming",
    (await state()).sea.swimming &&
      (await state()).feet < 27 &&
      !(await state()).sea.intro.active,
  );
  await tap("KeyE");
  await until((s) => s.sea.intro.progress > 0.3, 2000, "Air shield expands");
  await sample("shield-expanding");
  await until(
    (s) => s.sea.intro.ready && !s.sea.swimming && s.state === "ground",
    6000,
    "Shield creates dry landing",
  );
  check(
    "Shield restores grounded traversal and the disc",
    Math.abs((await state()).feet - 25) < 0.1 &&
      (await state()).sea.disc.state === "held" &&
      (await state()).sea.health === 4,
  );
  await sample("shield-active");
  await go(8.5, -18);
  await go(4, -18);
  await go(0, -18.5);
  check(
    "Beacon stairs return to the causeway",
    Math.abs((await state()).feet - 28) < 0.1 && !(await state()).sea.swimming,
  );
  if (introOnly) {
    check("No runtime errors", errors.length === 0, errors);
    check(
      "Shield transition uses precompiled shaders",
      (await state()).programs === initial.programsAtLoad,
      { load: initial.programsAtLoad, after: (await state()).programs },
    );
  } else {
    if (recovery) {
      const rejected = await throwAt((await state()).sea.seals[0].center);
      check(
        "Uncharged disc cannot open the causeway",
        rejected.sea.disc.hits.includes("seal:0") &&
          !rejected.sea.disc.charged &&
          !rejected.sea.seals[0].lit,
        { hits: rejected.sea.disc.hits, charged: rejected.sea.disc.charged },
      );
    }
    await charge(0);
    check(
      "Disc charged through entry crystal",
      (await state()).sea.disc.charged,
    );
    await go(0, -19.8);
    await until(
      (s) => !s.sea.vents[0].active && !s.sea.vents[0].warning,
      8000,
      "First vent subsides",
    );
    await go(0, -22.8, { slow: false });
    await until(
      (s) => !s.sea.vents[1].active && !s.sea.vents[1].warning,
      8000,
      "Second vent subsides",
    );
    await go(0, -26.5, { slow: false });
    await charge(0);
    await throwAt((await state()).sea.seals[0].center);
    check(
      "First pressure seal lights bridge",
      (await state()).sea.seals[0].lit && (await state()).sea.bridge.solid,
    );
    await sample("pressure-bridge");
    if (recovery) {
      await until((s) => !s.sea.bridge.solid, 15000, "Bridge light expires");
      check(
        "Uncrossed bridge expires safely",
        !(await state()).sea.bridge.secured,
      );
      await charge(0);
      await throwAt((await state()).sea.seals[0].center);
      check("Expired bridge can be restored", (await state()).sea.bridge.solid);
    }
    await turnTo(0, -42);
    await go(0, -40, { slow: false });
    check(
      "Crossed bridge secures return route",
      (await state()).sea.bridge.secured,
    );
    await charge(1);
    await throwAt((await state()).sea.seals[1].center);
    check(
      "Second seal releases archive",
      (await state()).sea.seals.every((s) => s.lit),
    );
    await swimFloodedStair();
    check(
      "The flooded stair is swum between surges to the far landing",
      (await state()).pos[1] < -61 &&
        Math.abs((await state()).feet - 25.5) < 0.1 &&
        !(await state()).sea.swimming,
    );
    await sample("flooded-stair");
    await go(0, -70.5);
    await until((s) => s.sea.boss.state !== "dormant", 5000, "Guardian wakes");
    await sample("guardian-awake");
    if (recovery) {
      await charge(2);
      const core = (await state()).sea.boss.core;
      await turnTo(core[0], core[2]);
      await until(
        (s) => s.sea.boss.state === "warning" && s.sea.boss.timer > 1.2,
        12000,
        "Guardian shielded warning",
      );
      check("Shield test disc carries light", (await state()).sea.disc.charged);
      const rejected = await throwAt(core);
      check(
        "Shield rejects a charged disc",
        rejected.sea.disc.hits.includes("guardian") &&
          rejected.sea.disc.charged &&
          rejected.sea.boss.health === 6,
        { hits: rejected.sea.disc.hits, charged: rejected.sea.disc.charged },
      );
      let lowest = 4;
      let lostHealth = false;
      const within = simulationWindow(await state(), 95000, 600000);
      while (true) {
        const current = await state();
        if (!within(current)) break;
        lowest = Math.min(lowest, current.sea.health);
        lostHealth ||= current.sea.health < 4;
        if (lostHealth && current.sea.health === 4) break;
        await sleep(60);
      }
      const recovered = await state();
      check(
        "Knockout restores the arena checkpoint",
        lowest === 1 &&
          recovered.sea.health === 4 &&
          Math.abs(recovered.pos[1] + 68.5) < 0.8,
      );
      check(
        "Knockout preserves seals and resets guardian",
        recovered.sea.seals.every((seal) => seal.lit) &&
          recovered.sea.boss.health === 6,
      );
      await sample("arena-recovery");
    }
    for (const [name, width, height] of [
      ["portrait", 375, 812],
      ["landscape", 844, 390],
    ]) {
      await page.setViewport({ width, height, hasTouch: true });
      await page.touchscreen.tap(width / 2, height / 2);
      await sleep(120);
      const layout = await page.evaluate(() => {
        const rect = (selector) => {
          const element = document.querySelector(selector);
          const r = element.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            visible:
              !element.hidden &&
              getComputedStyle(element).visibility !== "hidden" &&
              Number(getComputedStyle(element).opacity) > 0.1,
          };
        };
        return {
          boss: rect("#boss"),
          health: rect("#health"),
          objective: rect("#objective-box"),
          address: rect("#address"),
          hint: rect("#hint"),
          subtitle: rect("#subtitle"),
          touch: document.body.classList.contains("touch"),
        };
      });
      const overlap = (a, b) =>
        a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
      check(
        `Guardian HUD fits touch ${name}`,
        layout.touch &&
          layout.boss.visible &&
          !layout.address.visible &&
          !overlap(layout.boss, layout.health) &&
          !overlap(layout.boss, layout.objective) &&
          !(
            layout.hint.visible &&
            layout.subtitle.visible &&
            overlap(layout.hint, layout.subtitle)
          ),
        layout,
      );
      await sample(`guardian-${name}`);
    }
    await page.setViewport({ width: 1280, height: 720, hasTouch: true });
    await page.mouse.move(640, 360);
    if (layoutOnly) {
      check("No runtime errors", errors.length === 0, errors);
      check(
        "Layout probe reached live guardian",
        (await state()).sea.boss.state !== "dormant",
      );
    } else {
      const phases = new Set();
      let cracks = 0;
      const within = simulationWindow(await state(), 150000, 600000);
      while (true) {
        let s = await state();
        if (!within(s)) break;
        phases.add(s.sea.boss.phase);
        if (s.sea.ready) break;
        if (s.sea.boss.state === "warning") {
          await releaseAim();
          const warning = s.sea.boss.warnings;
          const candidates = [
            [-6.5, -74.5],
            [6.5, -74.5],
            [-5.5, -79],
            [5.5, -79],
          ];
          const safe = candidates.sort((a, b) => {
            const score = (p) =>
              Math.min(
                ...warning
                  .filter((w) => !w.wave)
                  .map((w) => Math.hypot(p[0] - w.x, p[1] - w.z) - w.radius),
              );
            return score(b) - score(a);
          })[0];
          await go(...safe, { tolerance: 0.7, timeout: 6000, slow: false });
        } else if (
          s.sea.boss.state === "surge" &&
          s.sea.boss.warnings.some((w) => w.wave)
        ) {
          const wave = s.sea.boss.warnings.find((w) => w.wave);
          const distance = wave
            ? Math.hypot(s.pos[0] - wave.x, s.pos[1] - wave.z)
            : 100;
          if (
            wave &&
            distance - wave.radius < 2.7 &&
            distance > wave.radius - 0.3
          ) {
            await releaseAim();
            await tap("Space", 440);
          } else await sleep(60);
        } else if (s.sea.boss.state === "exposed") {
          if (!s.sea.disc.charged) await charge(s.pos[0] > 0 ? 3 : 2);
          if ((await state()).sea.boss.state === "exposed") {
            await throwAt((await state()).sea.boss.core);
            if ((await state()).sea.boss.state === "cracked") {
              cracks++;
              await sample(`guardian-cracked-${cracks}`);
            }
          }
        } else if (s.sea.boss.state === "cracked") {
          const hp = s.sea.boss.health;
          await shoot(s.sea.boss.core);
          s = await state();
          if (s.sea.boss.health < hp) {
            console.log(`HIT Guardian ${s.sea.boss.health}/6`);
            await sample(`guardian-${s.sea.boss.health}`);
          }
        } else {
          if (!s.sea.disc.charged) await charge(s.pos[0] > 0 ? 3 : 2);
          else await sleep(80);
        }
      }
      await releaseAim();
      const won = await state();
      check(
        "Guardian defeated through three phases",
        won.sea.ready && won.sea.boss.health === 0 && phases.size === 3,
        [...phases],
      );
      check(
        "Charged orb cracks the core and only pistols wound it",
        cracks >= 3 && won.equipment.hits >= 6,
        { cracks, hits: won.equipment.hits },
      );
      check("Victory restores hero health", won.sea.health === 4);
      await until((s) => s.sea.gate === "open", 12000, "Home gate opens");
      await go(6.5, -92);
      await go(0, -95);
      await sample("home-door");
      await go(0, -100.6, { tolerance: 0.6 });
      await until(
        (s) => s.mode === "ending" || s.cinematic,
        3000,
        "Epilogue starts",
      );
      await sleep(7000);
      await sample("epilogue");
      await tap("Enter");
      // The reunion leads on into the builders' vault; the campaign ends there, not here.
      const arrived = await until(
        (s) =>
          s.where === "vault" &&
          s.mode === "play" &&
          !s.cinematic &&
          !s.crossing,
        15000,
        "Into the vault after the reunion",
      );
      check(
        "The reunion crosses into the vault's arrival without the credits",
        arrived.sea.completed &&
          !arrived.credits &&
          Math.hypot(arrived.pos[0], arrived.pos[1] - 4.6) < 0.6,
        { pos: arrived.pos, credits: arrived.credits },
      );
      await sleep(1500);
      await sample("vault-arrival");
      check("No runtime errors", errors.length === 0, errors);
      check(
        "Shaders precompiled before sea play",
        (await state()).programs === initial.programsAtLoad,
        { load: initial.programsAtLoad, after: (await state()).programs },
      );
    }
  }
} catch (error) {
  checks.push({ name: "Run completes", ok: false, detail: error.stack });
  console.error(error.stack);
  await sample("failure").catch(() => {});
  process.exitCode = 1;
} finally {
  await hold([]);
  await writeFile(
    `${out}/result.json`,
    JSON.stringify({ checks, errors, samples }, null, 2),
  );
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
