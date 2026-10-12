// The fingers in the running game: the court with keyboard input, standing then running, live
// finger samples, close-ups of both hands, no shader program compiled in play and the explorer's
// garment fit still replayed from its cache.
//   node receipts/verification-finger-life/game-probe.mjs <out-dir> [--url=http://localhost:3008]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const out =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ||
  "outputs/finger-game";
const base =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002";
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const report = { checks: [], samples: {}, shots: [], errors: [] };
const check = (name, ok, details = {}) => {
  report.checks.push({ name, ok, details });
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(details));
};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && report.errors.push(m.text()),
  );
  await page.goto(`${base}/?nolock=1&debug=1&chapter=court`, {
    waitUntil: "load",
  });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 240000,
  });
  await page.waitForFunction(() => !window.__GAME__.worlds.pending.length, {
    timeout: 240000,
  });
  // The court opens on a shot that takes the controls; Enter skips it, as a player would.
  for (let i = 0; i < 60; i++) {
    if (!(await page.evaluate(() => window.__GAME__.cinematic))) break;
    await page.keyboard.press("Enter");
    await sleep(500);
  }
  // On the court's floor, facing west along the strip the play-through walks to the block.
  await page.evaluate(() => {
    const { hero, app } = window.__FD__;
    hero.spawn(
      19,
      24.5,
      hero.world.ground(19, 24.5, 0.2, 0.5, 0),
      -Math.PI / 2,
    );
    app.follow.snap(hero);
  });
  await sleep(2500);
  const setup = await page.evaluate(async () => {
    const { fitTelemetry } = await import("/fit-cache.js");
    const { heroModel, animator, renderer } = window.__FD__;
    const sides = ["left", "right"].map((side) => {
      const open = heroModel.userData.hands[side + "Open"];
      const glove = open.children.find((m) => m.isSkinnedMesh);
      let own = !!glove;
      for (const bone of glove?.skeleton.bones || []) {
        let node = bone;
        while (node && node !== heroModel) node = node.parent;
        own &&= node === heroModel;
      }
      return {
        side,
        skinned: !!glove,
        bones: glove?.skeleton.bones.length,
        own,
      };
    });
    return {
      fit: fitTelemetry.sessions.hero_realistic,
      sides,
      rig: Object.keys(animator.fingerRig || {}),
      programs: renderer.info.programs.length,
    };
  });
  report.setup = setup;
  check(
    "The explorer's gloves are skinned to their own finger bones in play",
    setup.sides.every((s) => s.skinned && s.bones === 16 && s.own) &&
      setup.rig.length === 2,
    setup,
  );
  check(
    "The explorer's garment fit still replays from its cache",
    setup.fit?.mode === "replayed",
    setup.fit,
  );
  const sample = (label, seconds, every = 250) =>
    (async () => {
      const rows = [];
      for (let t = 0; t <= seconds * 1000; t += every) {
        rows.push(
          await page.evaluate(() => {
            const { animator, hero } = window.__FD__;
            const curls = (side) =>
              animator.fingerRig[side].curl.map((s) => +s.v.toFixed(3));
            return {
              state: hero.state,
              speed: +hero.speed.toFixed(2),
              at: [hero.pos.x, hero.feet, hero.pos.z].map((v) => +v.toFixed(2)),
              left: curls("left"),
              right: curls("right"),
              handCurl: { ...animator.handCurl },
            };
          }),
        );
        await sleep(every);
      }
      report.samples[label] = rows;
      return rows;
    })();
  // A frame from beside a hand, taken while paused; the follow camera is put back after.
  const closeUp = async (name, side) => {
    await page.evaluate(() => {
      window.__FD__.app.state.paused = true;
    });
    await sleep(150);
    const saved = await page.evaluate((side) => {
      const { THREE, app, animator } = window.__FD__;
      const camera = app.camera;
      const saved = [
        ...camera.position.toArray(),
        ...camera.quaternion.toArray(),
      ];
      const arm = animator.ik[side];
      const q = arm.hand.getWorldQuaternion(new THREE.Quaternion());
      const palm = arm.hand.localToWorld(arm.palm.clone());
      const normal = arm.normal.clone().applyQuaternion(q);
      const fingers = arm.fingers.clone().applyQuaternion(q);
      const thumb = new THREE.Vector3().crossVectors(fingers, normal);
      const bone = animator.fingerRig[side].bones[0];
      if (bone.getWorldPosition(new THREE.Vector3()).sub(palm).dot(thumb) < 0)
        thumb.negate();
      const target = palm.clone().addScaledVector(fingers, 0.035);
      const direction = thumb
        .clone()
        .multiplyScalar(0.8)
        .addScaledVector(normal, -0.35)
        .addScaledVector(fingers, -0.12)
        .normalize();
      camera.position.copy(target).addScaledVector(direction, 0.42);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      return saved;
    }, side);
    await sleep(250);
    const file = `${out}/${name}.jpg`;
    await page.screenshot({ path: file, type: "jpeg", quality: 82 });
    report.shots.push(`${name}.jpg`);
    await page.evaluate((saved) => {
      const camera = window.__FD__.app.camera;
      camera.position.fromArray(saved);
      camera.quaternion.fromArray(saved, 3);
      window.__FD__.app.state.paused = false;
    }, saved);
  };
  const standing = await sample("standing", 6);
  const range = (rows, side, f) =>
    Math.max(...rows.map((r) => r[side][f])) -
    Math.min(...rows.map((r) => r[side][f]));
  const standingRanges = ["left", "right"].map((side) =>
    [0, 1, 2, 3, 4].map((f) => +range(standing, side, f).toFixed(3)),
  );
  check(
    "Standing in play, every finger of both hands moves",
    standingRanges.every((ranges) => ranges.every((r) => r > 0.04)),
    { standingRanges },
  );
  await closeUp("game-standing-left", "left");
  await closeUp("game-standing-right", "right");
  // Shift toggles the pace on a press the game sees in play, as the play-through waits for.
  await sleep(500);
  await page.keyboard.press("ShiftLeft");
  await page.waitForFunction(() => window.__GAME__?.pace === "run", {
    timeout: 3000,
  });
  await page.keyboard.down("KeyW");
  await sleep(900);
  const running = await sample("running", 1.2, 100);
  await closeUp("game-running-left", "left");
  await page.keyboard.up("KeyW");
  await page.keyboard.press("ShiftLeft");
  const fast = running.filter((r) => r.speed > 4 && r.state === "ground");
  check(
    "Running in play, the free hands close loosely and vary with the swing",
    fast.length > 4 &&
      fast.every((r) => r.handCurl.left > 0.3 && r.handCurl.right > 0.3) &&
      Math.max(...fast.map((r) => r.handCurl.left)) -
        Math.min(...fast.map((r) => r.handCurl.left)) >
        0.03,
    { samples: fast.length },
  );
  // Down the terraces east of the climb: every frame, a run broken by drops of one or two metres.
  await sleep(800);
  await page.evaluate(() => {
    const { hero, app } = window.__FD__;
    hero.spawn(9, 27, hero.world.ground(9, 27, 0.2, 1e4, 0), Math.PI / 2);
    app.follow.snap(hero);
  });
  await sleep(1200);
  await page.keyboard.press("ShiftLeft");
  await page.waitForFunction(() => window.__GAME__?.pace === "run", {
    timeout: 3000,
  });
  await page.keyboard.down("KeyW");
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const rows = [],
          start = performance.now();
        const tick = () => {
          const { animator, hero } = window.__FD__;
          rows.push({
            state: hero.state,
            airborne: +animator.fingerAir.toFixed(3),
            feet: +hero.feet.toFixed(2),
            curl: +(
              (animator.handCurl.left + animator.handCurl.right) /
              2
            ).toFixed(3),
          });
          if (performance.now() - start < 2200) requestAnimationFrame(tick);
          else resolve(rows);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.keyboard.up("KeyW");
  await page.keyboard.press("ShiftLeft");
  report.samples.terraces = frames;
  const brief = frames.filter((r) => r.state === "air" && r.airborne < 0.18);
  const air = frames.filter((r) => r.state === "air");
  check(
    "Running down the terraces' drops keeps loosely closed hands",
    brief.length > 0 &&
      brief.every((r) => r.curl > 0.2) &&
      air.filter((r) => r.curl < 0.1).length < air.length * 0.25,
    {
      frames: frames.length,
      air: air.length,
      briefAir: brief.length,
      lowestBrief: Math.min(...brief.map((r) => r.curl)),
      openAir: air.filter((r) => r.curl < 0.1).length,
    },
  );
  await sleep(1500);
  report.programsAfter = await page.evaluate(
    () => window.__FD__.renderer.info.programs.length,
  );
  check(
    "No shader program compiles while the fingers move in play",
    report.programsAfter === setup.programs,
    { before: setup.programs, after: report.programsAfter },
  );
} catch (error) {
  report.failure = error.message;
  console.log("FAILED", error.message);
  process.exitCode = 1;
} finally {
  check("No page or WebGL errors", !report.errors.length, report.errors);
  await writeFile(
    `${out}/game-probe.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  const child = browser.process();
  await browser.close();
  child?.stdout?.destroy();
  child?.stderr?.destroy();
}
if (report.checks.some((c) => !c.ok)) process.exitCode = 1;
