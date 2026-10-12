// How a turn of the levels stage looks and sounds: the menu's ui sound, the medallion on that
// side lit for a moment and lit under the pointer, the slide under way, none under either reduced
// motion, and a stand-in gamepad's d-pad and stick turning it through the menu's own polling.
//   node receipts/verification-level-select/scripts/turn-probe.mjs <out.json> [url]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [file, base = "http://localhost:3002/"] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

async function levels({ reduce = false, media = false } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  if (media)
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
  await page.evaluateOnNewDocument((reduce) => {
    localStorage.setItem(
      "far-door-progress",
      JSON.stringify({
        reached: ["court", "floor", "checkpoint", "isles", "frost"],
        last: "isles",
      }),
    );
    if (reduce)
      localStorage.setItem(
        "far-door-settings",
        JSON.stringify({ reduceMotion: true }),
      );
  }, reduce);
  await page.goto(`${base}?nolock=1&debug=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await sleep(1000);
  await page.evaluate(() => {
    const { sound } = window.__FD__.app;
    const play = sound.play.bind(sound);
    window.__sounds = [];
    sound.play = (name, ...rest) => {
      window.__sounds.push(name);
      return play(name, ...rest);
    };
    document.querySelector('#menu [data-action="levels"]').click();
  });
  await sleep(1200);
  return { context, page };
}
const current = (page) =>
  page.evaluate(
    () =>
      document.querySelector(
        '#menu [data-screen="levels"] .carousel-slide[data-place="current"]',
      )?.dataset.world || "sealed",
  );
// The cards' own movement; a button's colour easing to its focus is not motion.
const moving = (page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === "running" &&
            a.effect?.target?.matches?.(".carousel-slide") &&
            ["transform", "opacity"].includes(a.transitionProperty),
        ).length,
  );

try {
  let { context, page } = await levels();
  // A picture caught halfway through its fade, as when the screen first opens.
  const above = await page.evaluate(() => {
    const card = document.querySelector(
      '#menu [data-screen="levels"] .carousel-slide[data-place="current"]',
    );
    card.querySelector(".level-shot").style.opacity = "0.5";
    const title = card.querySelector("h3").getBoundingClientRect();
    const hit = document.elementFromPoint(
      title.left + 12,
      title.top + title.height / 2,
    );
    card.querySelector(".level-shot").style.opacity = "";
    return hit?.closest(".level-info") ? "text" : hit?.className || "nothing";
  });
  check(
    "a card's text stays above its picture while the picture fades in",
    above === "text",
    above,
  );
  const opened = await current(page);
  await page.evaluate(() => (window.__sounds.length = 0));
  await page.keyboard.press("ArrowRight");
  await sleep(60);
  const turn = await page.evaluate(() => ({
    sounds: [...window.__sounds],
    lit: document
      .querySelector('#menu .carousel-turn[data-turn="1"]')
      .classList.contains("lit"),
    glow: getComputedStyle(
      document.querySelector(
        '#menu .carousel-turn[data-turn="1"] .carousel-arrow',
      ),
    ).borderColor,
  }));
  const sliding = await moving(page);
  check(
    "a turn plays the menu's ui sound once",
    turn.sounds.join() === "ui",
    turn.sounds.join(),
  );
  check(
    "a turn lights the medallion on its side for a moment",
    turn.lit && turn.glow !== "rgba(232, 207, 164, 0.4)",
    turn.glow,
  );
  check(
    "the cards slide when the stage turns",
    sliding > 0 && opened === "three" && (await current(page)) === "four",
    `${sliding} transitions, ${opened} to ${await current(page)}`,
  );
  await sleep(900);
  const arrow = await page.$('#menu .carousel-turn[data-turn="-1"]');
  await arrow.hover();
  await sleep(400);
  const hover = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector(
          '#menu .carousel-turn[data-turn="-1"] .carousel-arrow',
        ),
      ).borderColor,
  );
  check(
    "the pointer lights a medallion with the builders' light",
    hover === "rgb(57, 227, 208)",
    hover,
  );
  await page.screenshot({
    path: file.replace(/\.json$/, "-hover.jpg"),
    type: "jpeg",
    quality: 78,
  });
  // A stand-in gamepad: the menu polls it every frame, as it would a real one.
  await page.mouse.move(640, 700);
  await page.evaluate(() => {
    const pad = {
      buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
      axes: [0, 0, 0, 0],
    };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
  });
  const pad = async (change) => {
    await page.evaluate(change);
    await sleep(160);
    await page.evaluate(() => {
      window.__pad.buttons.forEach((b) => (b.pressed = false));
      window.__pad.axes[0] = 0;
    });
    await sleep(700);
    return current(page);
  };
  const right = await pad(() => (window.__pad.buttons[15].pressed = true));
  const left = await pad(() => (window.__pad.axes[0] = -1));
  check(
    "a gamepad's d-pad and stick turn the stage",
    right === "sealed" && left === "four",
    `${right} then ${left}`,
  );
  await context.close();

  for (const [label, options] of [
    ["the Reduce motion setting", { reduce: true }],
    ["the system's reduced motion", { media: true }],
  ]) {
    ({ context, page } = await levels(options));
    await page.keyboard.press("ArrowRight");
    await sleep(60);
    const count = await moving(page);
    check(
      `${label} turns the stage without sliding`,
      count === 0 && (await current(page)) === "four",
      `${count} transitions`,
    );
    await context.close();
  }
} catch (error) {
  check("run", false, error.message);
} finally {
  await browser.close();
  await writeFile(file, JSON.stringify(results, null, 2) + "\n");
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
