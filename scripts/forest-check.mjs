import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const hazardsOnly = process.argv.includes("--hazards");
const out =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ||
  `receipts/verification-expansion/forest${hazardsOnly ? "/hazards" : ""}`;
const url =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/?nolock=1&chapter=forest";
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
  (m) =>
    m.type() === "error" &&
    !/Failed to load resource/.test(m.text()) &&
    errors.push(m.text()),
);
page.on("requestfailed", (request) => {
  if (new URL(request.url()).pathname !== "/favicon.ico")
    errors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`);
});
page.on("response", (response) => {
  if (
    response.status() >= 400 &&
    new URL(response.url()).pathname !== "/favicon.ico"
  )
    errors.push(`HTTP ${response.status()} ${response.url()}`);
});
let initialPrograms;
const log = [];
const traversals = [];
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
function deadline(start, ms, label) {
  const wallStart = Date.now();
  assert(Number.isFinite(start.time), "simulation time missing from telemetry");
  const elapsed = (s) =>
    `${(s.time - start.time).toFixed(2)}s simulated, ${((Date.now() - wallStart) / 1000).toFixed(2)}s wall`;
  return {
    elapsed,
    pending(s) {
      assert(Number.isFinite(s.time), "simulation time missing from telemetry");
      if (Date.now() - wallStart >= 180000)
        throw new Error(`${label}: wall watchdog expired (${elapsed(s)})`);
      return (s.time - start.time) * 1000 < ms;
    },
  };
}
async function advance(ms, label, observe = () => {}) {
  let s = await state();
  const budget = deadline(s, ms, label);
  observe(s);
  while (budget.pending(s)) {
    await sleep(25);
    s = await state();
    observe(s);
  }
  return s;
}
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
  await advance(ms, `holding ${keys.join(",")}`);
  await hold(new Set());
}
let shots = 0;
async function shot(name) {
  await page.screenshot({
    path: `${out}/${String(++shots).padStart(2, "0")}-${name}.png`,
  });
}
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
  { tol = 0.35, walk = true, timeout = 20000, lat = 0.38 } = {},
) {
  let s = await state();
  const budget = deadline(s, timeout, `go ${x},${z}`);
  while (budget.pending(s)) {
    const { keys, d } = steer(s, x, z, lat);
    if (d < tol) {
      await hold(new Set());
      return s;
    }
    if (walk && d < 1.5) keys.push("ShiftLeft");
    await hold(new Set(keys));
    await sleep(25);
    s = await state();
  }
  throw new Error(
    `go ${x},${z} stuck at ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)} ${s.state} (${budget.elapsed(s)})`,
  );
}
async function until(test, timeout, label) {
  let s = await state();
  const budget = deadline(s, timeout, label);
  while (budget.pending(s)) {
    if (await test(s)) return s;
    await sleep(50);
    s = await state();
  }
  throw new Error(
    `${label}: state ${s.state} pos ${s.pos.map((v) => v.toFixed(2))} feet ${s.feet.toFixed(2)} (${budget.elapsed(s)})`,
  );
}
async function turnTo(x, z) {
  for (let i = 0; i < 20; i++) {
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
    await advance(40, "camera turn");
  }
}

const disc = (s) => s.forest.disc;
// The orb never wounds: boars fall to pistol fire, aimed by moving the camera onto them.
let aiming = false,
  pointer = { x: 640, y: 360 };
async function releaseAim() {
  if (!aiming) return;
  await page.mouse.up({ button: "right" });
  aiming = false;
}
async function aimAt(point) {
  if (!aiming) {
    pointer = { x: 640, y: 360 };
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down({ button: "right" });
    aiming = true;
    await advance(250, "aim raised");
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
    if (Math.abs(yaw) < 0.01 && Math.abs(pitch) < 0.01) return;
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
    await advance(50, "aim settles");
  }
}
async function shoot(point) {
  if ((await state()).equipment.selected !== "pistols") {
    await releaseAim();
    await tap(["Digit2"], 60);
    await until(
      (s) => s.equipment.selected === "pistols",
      2000,
      "pistols drawn",
    );
  }
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
async function throwAt(x, z) {
  await releaseAim();
  if ((await state()).equipment.selected !== "orb") {
    await tap(["Digit1"], 60);
    await until((s) => s.equipment.selected === "orb", 2000, "orb in hand");
  }
  await until(
    (s) =>
      disc(s)?.state === "held" &&
      disc(s).cooldown === 0 &&
      ["ground", "air"].includes(s.state),
    6000,
    "relay ready",
  );
  await turnTo(x, z);
  const activations = disc(await state()).activations;
  await tap(["KeyR"], 70);
  await until(
    (s) => disc(s)?.state === "held" && disc(s).activations === activations + 1,
    2000,
    "held relay activated",
  );
  await until((s) => disc(s).cooldown === 0, 2000, "relay cooldown complete");
}
async function charge(index) {
  for (let i = 0; i < 4; i++) {
    const s = await state();
    if (disc(s).charge >= 8) return;
    const w = s.forest.wells[index];
    await throwAt(w[0], w[2]);
  }
  throw new Error(`crystal ${index} did not charge disc`);
}
// The bog is crossed as a player does at the default walking pace: walk until the lip of the
// current footing stops the explorer, then jump with forward held. Any fall into the water
// fails the route.
async function leap(x, z, label, landed) {
  await until((s) => s.state === "ground", 5000, "jump takeoff");
  await turnTo(x, z);
  let s = await state();
  const falls = s.forest.bogFalls;
  const walkBudget = deadline(s, 4000, `walk to the lip before ${label}`);
  let still = 0;
  while (still < 0.15) {
    await hold(new Set([...steer(s, x, z, 0.3).keys, "ShiftLeft"]));
    await sleep(16);
    const next = await state();
    const moved = Math.hypot(next.pos[0] - s.pos[0], next.pos[1] - s.pos[1]);
    still = moved < 0.002 ? still + next.time - s.time : 0;
    s = next;
    if (!walkBudget.pending(s))
      throw new Error(`no lip before ${label} (${walkBudget.elapsed(s)})`);
  }
  const traversal = {
    target: [x, z],
    takeoff: [...s.pos, s.feet],
    states: [s.state],
    landing: null,
  };
  traversals.push(traversal);
  const observe = (sample) => {
    if (traversal.states.at(-1) !== sample.state)
      traversal.states.push(sample.state);
  };
  await hold(new Set([...steer(s, x, z, 0.3).keys, "ShiftLeft", "Space"]));
  s = await advance(350, `jump hold ${label}`, observe);
  const jumpBudget = deadline(s, 4500, `jump ${label}`);
  while (jumpBudget.pending(s)) {
    observe(s);
    assert.equal(s.forest.bogFalls, falls, `fell into the bog: ${label}`);
    const d = Math.hypot(x - s.pos[0], z - s.pos[1]);
    if (s.state === "ground" && landed(s, d)) {
      await hold(new Set());
      traversal.landing = [...s.pos, s.feet];
      assert(
        traversal.states.includes("air"),
        `${label} reached without a jump: ${traversal.states.join(",")}`,
      );
      return traversal;
    }
    await hold(
      new Set(d < 0.35 ? [] : [...steer(s, x, z, 0.3).keys, "ShiftLeft"]),
    );
    await sleep(25);
    s = await state();
  }
  throw new Error(
    `jump ${label} failed at ${JSON.stringify(s.pos)} ${s.state} (${jumpBudget.elapsed(s)})`,
  );
}
async function jumpTo(x, z) {
  const s = await state();
  const index = s.forest.steps.findIndex(
    (p) => Math.hypot(p[0] - x, p[2] - z) < 0.01,
  );
  assert(index >= 0, `missing bog stone ${x},${z}`);
  const [, top, , radius] = s.forest.steps[index];
  const traversal = await leap(
    x,
    z,
    `stone ${x},${z}`,
    (t, d) => d < radius && t.forest.stone === index,
  );
  assert(
    Math.abs(traversal.landing[2] - top) < 0.2,
    `stone ${x},${z} landed at ${traversal.landing[2]}, expected about ${top}`,
  );
  return traversal.states.join(" → ");
}
// Ivy climbed as a player climbs: up to it, Space to take hold, then the move keys.
async function grabIvy(id, label) {
  await hold(new Set(["KeyW"]));
  await advance(400, "walk up to the ivy");
  await hold(new Set(["KeyW", "Space"]));
  const s = await until(
    (s) => s.state === "wall" && s.climb.wall === id,
    2500,
    label,
  );
  await hold(new Set(["KeyW"]));
  return s;
}
// The castle's outer wall closes the trail: up its thick ivy by hand, along the walk and down
// the stair inside.
async function outerWall() {
  await go(-24.4, -201.4, { tol: 0.3 });
  await turnTo(-24.4, -215);
  let s = await grabIvy("outer-wall", "take hold of the outer wall's ivy");
  note(`took hold of the outer wall's ivy, feet ${s.feet.toFixed(2)}`);
  await advance(900, "climb the ivy");
  await shot("outer-wall-ivy");
  s = await until(
    (s) =>
      s.state === "ground" && s.pos[1] < -203 && s.feet > s.forest.outerWall,
    10000,
    "pull up onto the outer wall",
  );
  await hold(new Set());
  traversals.push({ target: "outer wall", landing: [...s.pos, s.feet] });
  note(`over the outer wall at ${s.pos.map((v) => v.toFixed(2))}`);
  await go(-26.4, -203.5, { tol: 0.3 });
  await go(-26.4, -209.5, { tol: 0.5 });
}
// The bastion that holds the crescent seal: quiet the spore pod at its foot, climb its ivy and
// pulse the seal from the top, where a plain pulse is enough.
async function bastion(sealX, sealZ) {
  const podAt = (s) =>
    s.forest.spores.findIndex(
      (p) => Math.hypot(p.at[0] + 26.3, p.at[2] + 246.4) < 0.1,
    );
  await go(-28.6, -247.7, { tol: 0.35 });
  await throwAt(-26.3, -246.4);
  let s = await until(
    (s) => s.forest.spores[podAt(s)].quiet > 0,
    2500,
    "quiet the bastion's spore pod",
  );
  await go(-25.9, -247.7, { tol: 0.25 });
  await turnTo(-10, -247.7);
  s = await grabIvy("bastion", "take hold of the bastion's ivy");
  s = await until(
    (s) => s.state === "ground" && s.feet > s.forest.bastionTop - 0.1,
    12000,
    "pull up onto the bastion",
  );
  await hold(new Set());
  note(
    `on the bastion at ${s.pos.map((v) => v.toFixed(2))}, feet ${s.feet.toFixed(2)}`,
  );
  await shot("bastion-top");
  await throwAt(sealX, sealZ);
}
async function defeatOldtusk() {
  const started = await state(),
    budget = deadline(started, 90000, "Oldtusk");
  const boss = (s) => s.forest.guards.find((g) => g.boss);
  while (budget.pending(await state())) {
    let s = await state(),
      target = boss(s);
    if (target.defeated) return;
    if (target.state === "windup" || target.state === "charge") {
      await releaseAim();
      const mark = target.mark;
      if (
        mark &&
        s.state === "ground" &&
        Math.hypot(s.pos[0] - mark.x, s.pos[1] - mark.z) <
          target.attackRadius + 0.3
      ) {
        const dx = target.at[0] - s.pos[0],
          dz = target.at[2] - s.pos[1],
          length = Math.hypot(dx, dz) || 1;
        const direction = target.attackIndex % 2 ? 1 : -1;
        const x = s.pos[0] + (dz / length) * direction * 3;
        const z = s.pos[1] - (dx / length) * direction * 3;
        await tap([...steer(s, x, z).keys, "KeyQ"], 70);
        await advance(710, "boar dodge completed");
      } else await advance(45, "boar announced charge");
      continue;
    }
    if (target.counterWindow) {
      const hp = target.hp;
      await shoot([target.at[0], target.at[1] + 0.86, target.at[2]]);
      await until(
        (s) => boss(s).hp < hp || !boss(s).counterWindow,
        1500,
        "Oldtusk counter resolved",
      ).catch(() => {});
      continue;
    }
    if (target.state === "recover") {
      await advance(50, "Oldtusk catches its breath");
      continue;
    }
    await releaseAim();
    s = await state();
    target = boss(s);
    if (target.state === "windup") continue;
    const dx = s.pos[0] - target.at[0],
      dz = s.pos[1] - target.at[2],
      length = Math.hypot(dx, dz) || 1;
    if (length > 1.7)
      await go(
        target.at[0] + (dx / length) * 1.6,
        target.at[2] + (dz / length) * 1.6,
        { tol: 0.45, timeout: 8000 },
      );
    else await advance(45, "Oldtusk reaches its next warning");
  }
  throw Error("Oldtusk did not fall within its real combat watchdog");
}

async function defeat(group) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const s = await state(),
      targets = s.forest.guards
        .slice(group * 2, group * 2 + 2)
        .filter((g) => !g.defeated);
    if (!targets.length) return;
    const t = targets[0];
    if (t.boss) {
      await defeatOldtusk();
      continue;
    }
    const distance = Math.hypot(t.at[0] - s.pos[0], t.at[2] - s.pos[1]);
    if (distance > 8) {
      await releaseAim();
      const dx = (s.pos[0] - t.at[0]) / distance,
        dz = (s.pos[1] - t.at[2]) / distance;
      await go(t.at[0] + dx * 5, t.at[2] + dz * 5, { tol: 1, timeout: 10000 });
      continue;
    }
    if (distance < 3.5) {
      await releaseAim();
      const dx = s.pos[0] - t.at[0],
        dz = s.pos[1] - t.at[2],
        d = Math.hypot(dx, dz) || 1;
      await tap(
        [
          ...steer(s, s.pos[0] + (dx / d) * 4, s.pos[1] + (dz / d) * 4).keys,
          "KeyQ",
        ],
        420,
      );
    }
    await shoot([t.at[0], t.at[1] + 0.7, t.at[2]]);
  }
  throw new Error(`guards ${group} resisted forty shots`);
}
try {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  await until((s) => s.where === "five" && !s.cinematic, 12000, "forest start");
  await page.waitForFunction(() => !window.__GAME__.worlds.pending.length, {
    timeout: 120000,
  });
  initialPrograms = (await state()).programs;
  assert(initialPrograms > 0, "shader program count missing at start");
  await advance(1500, "arrival camera settled");
  await shot("arrival");
  if (hazardsOnly) {
    await go(0, -18);
    await go(-1, -25);
    let s = await state();
    const hazardBudget = deadline(s, 45000, "spore recovery");
    let damaged = false,
      recovered = false,
      lowest = 4;
    while (hazardBudget.pending(s)) {
      lowest = Math.min(lowest, s.forest.health);
      damaged ||= s.forest.health < 4;
      if (damaged && s.forest.health === 4 && s.pos[1] > -18) {
        recovered = true;
        break;
      }
      await hold(new Set(steer(s, -1, -29).keys));
      await sleep(40);
      s = await state();
    }
    await hold(new Set());
    if (!recovered || lowest !== 1)
      throw new Error(
        `spore recovery missing, lowest health ${lowest} (${hazardBudget.elapsed(s)})`,
      );
    await shot("spore-recovery");
    note(
      "spore damage consumed all four pips and returned to the safe checkpoint with full health",
    );
  } else {
    await go(-3, -14);
    await go(-7, -29);
    await go(-6, -36);
    await charge(0);
    note("disc charged by entrance crystal");
    await go(-3, -44);
    await throwAt(6, -53);
    await until((s) => s.forest.spores[2].quiet > 0, 2500, "silence spore pod");
    await throwAt(8, -58);
    await until((s) => s.forest.locked[0], 2500, "waves seal");
    note("waves seal and spore suppression passed");
    await go(2, -61);
    await go(0, -74);
    await shot("spore-bog");
    for (const [x, , z] of (await state()).forest.steps) {
      const traversal = await jumpTo(x, z);
      note(`landed bog stone ${x},${z} (${traversal})`);
    }
    const bank = await leap(
      0.3,
      -97.6,
      "far bank",
      (s) => s.forest.stone === -1 && s.pos[1] < -95.5,
    );
    note(`far bank (${bank.states.join(" → ")})`);
    await go(0, -115, { tol: 0.6 });
    note("spore bog crossed");
    await go(1, -120);
    await charge(1);
    await go(3, -129);
    await defeat(0);
    await go(4, -125);
    await charge(1);
    await go(4, -135);
    await throwAt(10, -146);
    await until((s) => s.forest.locked[1], 2500, "spiral seal");
    await shot("grove-cleared");
    note("grove guards and spiral seal passed");
    await go(4, -154);
    await go(-3, -168);
    await go(-5, -179);
    // West of the tree whose roots reach the trail's east edge.
    await go(-11, -182);
    await go(-12, -194);
    await outerWall();
    await go(-23, -208);
    await go(-25, -216);
    await defeat(1);
    await until((s) => s.beat === "castle", 8000, "Mira's castle scene");
    await until((s) => !s.cinematic, 4000, "Mira's castle scene skipped");
    await advance(1500, "camera back behind the explorer");
    // East of the crystal, where no address relay stands behind it in the orb's aim.
    await go(-25.5, -231);
    await charge(2);
    await go(-31, -236);
    assert(
      disc(await state()).charged,
      "wrong first glyph requires a charged disc",
    );
    await throwAt(-31, -248);
    assert(
      disc(await state()).charged,
      "disc charge expired during wrong first glyph",
    );
    if ((await state()).forest.sequence !== 0)
      throw new Error("wrong first glyph accepted");
    await until(
      () =>
        page.evaluate(() =>
          document
            .getElementById("subtitle")
            .textContent.includes("The address runs from waves"),
        ),
      2500,
      "wrong first glyph feedback",
    );
    await throwAt(-39, -243);
    assert.equal(
      (await state()).forest.sequence,
      1,
      "waves did not start the address",
    );
    await go(-24, -236);
    await go(-24, -228);
    await charge(2);
    await go(-31, -236);
    await throwAt(-31, -248);
    assert.equal((await state()).forest.sequence, 2, "spiral did not follow");
    // The crescent stands on its bastion: from the clearing below it does not answer, and the
    // guide sends her up the ivy.
    const [sealX, , sealZ] = (await state()).forest.relays[2].at;
    await throwAt(sealX, sealZ);
    assert.equal(
      (await state()).forest.sequence,
      2,
      "the crescent seal answered from the clearing below its bastion",
    );
    await until(
      () =>
        page.evaluate(() =>
          document
            .getElementById("objective-sub")
            .textContent.includes("Climb the ivy on the bastion"),
        ),
      2500,
      "bastion guidance",
    );
    await bastion(sealX, sealZ);
    await until((s) => s.forest.ready, 3000, "sea address complete");
    await until(
      (s) => !s.cinematic && s.forest.gateOpen,
      14000,
      "castle door fully open",
    );
    // The camera blends back for 1.4 seconds after the cinematic ends.
    await advance(1600, "castle camera settled");
    const solvedGuards = (await state()).forest.guards.map((g) => ({
      defeated: g.defeated,
      hp: g.hp,
    }));
    await shot("castle-door");
    note("castle guards and ordered address passed");
    await go(-34.5, -253);
    await turnTo(-34.5, -266);
    let s = await state();
    const crossBudget = deadline(s, 12000, "forest gate crossing");
    while (s.where !== "six") {
      if (!crossBudget.pending(s))
        throw new Error(
          `forest gate blocked at ${JSON.stringify(s.pos)} feet ${s.feet} (${crossBudget.elapsed(s)})`,
        );
      await hold(new Set(steer(s, -34.5, -266, 0.12).keys));
      await sleep(20);
      s = await state();
    }
    await hold(new Set());
    await until((s) => !s.crossing, 3000, "sea arrival settled");
    await shot("sea-arrival");
    s = await state();
    const returnBudget = deadline(s, 12000, "sea return");
    while (s.where !== "five") {
      if (!returnBudget.pending(s))
        throw new Error(
          `sea return blocked at ${JSON.stringify(s.pos)} (${returnBudget.elapsed(s)})`,
        );
      await hold(new Set(steer(s, 0, 1.8, 0.12).keys));
      await sleep(20);
      s = await state();
    }
    await hold(new Set());
    const returned = await until(
      (s) => !s.crossing,
      3000,
      "forest return settled",
    );
    assert(
      returned.forest.ready && returned.forest.gateOpen,
      "return closed the forest door",
    );
    assert(
      returned.forest.locked.every(Boolean),
      "return cleared a forest seal",
    );
    assert.equal(returned.forest.sequence, 3, "return cleared the sea address");
    assert.deepEqual(
      returned.forest.guards.map((g) => ({ defeated: g.defeated, hp: g.hp })),
      solvedGuards,
      "return changed forest guard progress",
    );
    note("forest to sea and return passed");
    await page.keyboard.press("Escape");
    await advance(300, "pause menu settled");
    await page.click('button[data-action="restart"]');
    await advance(800, "restart settled");
    await until(
      (s) =>
        s.where === "five" &&
        !s.forest.ready &&
        !s.forest.gateOpen &&
        s.forest.locked.every((lit) => !lit) &&
        s.forest.sequence === 0 &&
        s.forest.health === 4 &&
        s.forest.guards.every((g) => !g.defeated && g.hp === (g.maxHp || 3)),
      9000,
      "forest retry",
    );
    note("retry resets all forest challenges");
  }
  assert.equal(
    (await state()).programs,
    initialPrograms,
    "shader programs grew during forest play",
  );
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    `${out}/playthrough.json`,
    JSON.stringify(
      {
        passed: true,
        log,
        traversals,
        errors,
        initialPrograms,
        state: await state(),
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  await hold(new Set());
  await shot("failure");
  await writeFile(
    `${out}/playthrough.json`,
    JSON.stringify(
      {
        passed: false,
        error: error.message,
        log,
        traversals,
        errors,
        initialPrograms,
        state: await state(),
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
