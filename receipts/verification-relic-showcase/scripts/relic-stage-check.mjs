// The Relics screen's carousel with real input: keys, the arrows, a pip, a mouse drag, a tap on
// the chosen relic, Inspect and Back on a desktop, then a swipe and taps on a phone.
//   node relic-stage-check.mjs <outDir> [url]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3002/"] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FOUND = ["papyrus", "radio", "sun-memory", "lantern"];
const results = [];
const errors = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});

async function open(phone) {
  const page = await browser.newPage();
  if (phone)
    await page.emulate({
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
  else await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.evaluateOnNewDocument((found) => {
    localStorage.clear();
    localStorage.setItem(
      "far-door-progress",
      JSON.stringify({
        reached: ["court", "floor"],
        last: "floor",
        relics: found,
      }),
    );
  }, FOUND);
  const sep = base.includes("?") ? "&" : "?";
  await page.goto(`${base}${sep}nolock=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 120000,
  });
  await sleep(800);
  return page;
}

const state = (page) =>
  page.evaluate(() => ({
    screen: document.querySelector("#menu").dataset.screen,
    name: document.querySelector("#relic-name").textContent,
    current: document.querySelector("#relic-list li.current")?.dataset.relic,
    read: !document.querySelector("#relic-read").disabled,
    focus:
      document
        .querySelector("#menu .panel:not([hidden]) .focus")
        ?.textContent.trim() ?? null,
  }));
const centre = (page, selector) =>
  page.$eval(selector, (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
const ready = (page) =>
  page.waitForFunction(
    () => document.querySelector("#menu").dataset.stage === "",
    { timeout: 60000 },
  );

try {
  const page = await open(false);
  await page.click('#menu [data-screen="main"] [data-action="relics"]');
  await ready(page);
  await sleep(900);
  let s = await state(page);
  check(
    "opens on the first relic found, Inspect in focus",
    s.screen === "relics" &&
      s.current === "papyrus" &&
      s.read &&
      s.focus === "Inspect",
    s,
  );
  await page.keyboard.press("ArrowRight");
  await sleep(300);
  s = await state(page);
  check(
    "the right arrow key turns to the next relic",
    s.current === "sun-memory",
    s,
  );
  await page.keyboard.press("KeyD");
  await sleep(300);
  const keyD = await state(page);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await sleep(300);
  s = await state(page);
  check(
    "the bound movement key turns too, and left turns back",
    keyD.current === "radio" && s.current === "papyrus",
    { keyD: keyD.current, back: s.current },
  );
  await page.keyboard.press("ArrowLeft");
  await sleep(300);
  s = await state(page);
  check(
    "turning past the first relic wraps to the last, still hidden",
    s.current === "camp-drill" || s.current === "tide-proof",
    s,
  );
  check(
    "a hidden relic names no relic and leaves Inspect off, the focus on Back",
    s.name === "Not found yet" && !s.read && s.focus === "Back",
    s,
  );
  const next = await page.$('.relic-focus .turn[data-turn="1"]');
  await next.click();
  await sleep(300);
  s = await state(page);
  check(
    "the next arrow turns back to the first relic",
    s.current === "papyrus",
    s,
  );
  const pip = await page.$('#relic-list li[data-relic="lantern"] button');
  await pip.click();
  await sleep(300);
  s = await state(page);
  check("a pip chooses its relic", s.current === "lantern", s);
  const c = await centre(page, "#relic-focus");
  await page.mouse.move(c.x + 160, c.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++)
    await page.mouse.move(c.x + 160 - k * 32, c.y, { steps: 2 });
  await page.mouse.up();
  await sleep(1200);
  const dragged = await state(page);
  check(
    "a drag across the stage turns the arc",
    dragged.current !== "lantern",
    dragged,
  );
  await page.screenshot({
    path: `${out}/desktop-dragged.jpg`,
    type: "jpeg",
    quality: 80,
  });
  await page.click('#relic-list li[data-relic="radio"] button');
  await sleep(1200);
  await page.mouse.click(c.x, c.y);
  await sleep(900);
  s = await state(page);
  const title = await page.$eval("#relic-note-title", (el) => el.textContent);
  check(
    "a click on the chosen relic inspects it",
    s.screen === "relic-note" && title === "The field radio",
    { screen: s.screen, title },
  );
  await page.keyboard.press("ArrowRight");
  await sleep(300);
  s = await state(page);
  check(
    "left and right turn the inspected relic and stay",
    s.screen === "relic-note",
    s,
  );
  await page.screenshot({
    path: `${out}/desktop-inspect.jpg`,
    type: "jpeg",
    quality: 80,
  });
  await page.keyboard.press("Escape");
  await sleep(700);
  s = await state(page);
  check(
    "Escape returns to the carousel on the same relic",
    s.screen === "relics" && s.current === "radio",
    s,
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await sleep(1200);
  s = await state(page);
  await page.mouse.click(c.x, c.y);
  await sleep(700);
  const hidden = await state(page);
  check(
    "a click on a hidden relic opens nothing",
    s.name === "Not found yet" && hidden.screen === "relics",
    { before: s.current, screen: hidden.screen },
  );
  await page.click('#relic-list li[data-relic="papyrus"] button');
  await sleep(300);
  for (let k = 0; k < 2 && (await state(page)).focus !== "Inspect"; k++)
    await page.keyboard.press("ArrowUp");
  s = await state(page);
  await page.keyboard.press("Enter");
  await sleep(700);
  const entered = await state(page);
  check(
    "Enter on Inspect inspects",
    s.focus === "Inspect" && entered.screen === "relic-note",
    { focus: s.focus, screen: entered.screen },
  );
  await page.keyboard.press("Escape");
  await sleep(400);
  await page.keyboard.press("Escape");
  await sleep(500);
  s = await state(page);
  check("Escape again returns to the title", s.screen === "main", s);
  await page.close();

  const phone = await open(true);
  await phone.tap('#menu [data-screen="main"] [data-action="relics"]');
  await ready(phone);
  await sleep(900);
  const help = await phone.$eval(
    '[data-help="relics"]',
    (el) => el.textContent,
  );
  check("a phone is told to swipe and tap", /Swipe/.test(help), help);
  const p = await centre(phone, "#relic-focus");
  await phone.touchscreen.touchStart(p.x + 120, p.y);
  for (let k = 1; k <= 8; k++)
    await phone.touchscreen.touchMove(p.x + 120 - k * 30, p.y);
  await phone.touchscreen.touchEnd();
  await sleep(1300);
  s = await state(phone);
  check("a swipe turns to the next relic", s.current === "sun-memory", s);
  await phone.screenshot({
    path: `${out}/phone-swiped.jpg`,
    type: "jpeg",
    quality: 80,
  });
  await phone.touchscreen.tap(p.x, p.y);
  await sleep(900);
  s = await state(phone);
  check("a tap on the chosen relic inspects it", s.screen === "relic-note", s);
  await phone.screenshot({
    path: `${out}/phone-inspect.jpg`,
    type: "jpeg",
    quality: 80,
  });
  await phone.tap('#menu [data-screen="relic-note"] [data-action="back"]');
  await sleep(700);
  s = await state(phone);
  check(
    "Back returns to the carousel",
    s.screen === "relics" && s.current === "sun-memory",
    s,
  );
  check("no page errors", errors.length === 0, errors);
} catch (error) {
  errors.push(String(error?.stack || error));
  check("ran to the end", false, String(error));
} finally {
  await writeFile(
    `${out}/relic-stage.json`,
    JSON.stringify({ results, errors }, null, 1),
  );
  await browser.close();
}
