// Changes the language as a player would, in a browser set to French: Settings, the Language
// row, the list of languages, one choice, and back on Settings in that language. Then the
// keyboard path, a choice that changes nothing, a phone tap, and a change during play.
//   node language-choice.mjs <outDir> [url]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3002/"] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

async function open(phone = false) {
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
  // A player's browser is not automated: Automatic then follows its French.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", {
      get: () => ["fr-FR", "fr"],
    });
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem(
        "far-door-progress",
        JSON.stringify({ reached: ["court", "floor"], last: "floor" }),
      );
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto(`${base}?nolock=1`, { waitUntil: "load" });
  await ready(page);
  return page;
}
const ready = (page) =>
  page
    .waitForFunction(() => window.__READY__ === true, { timeout: 120000 })
    .then(() => sleep(700));
const state = (page) =>
  page.evaluate(() => ({
    lang: document.documentElement.lang,
    screen: document.querySelector("#menu").dataset.screen,
    mode: window.__GAME__?.mode,
    focus:
      document
        .querySelector("#menu .panel:not([hidden]) .focus")
        ?.textContent.replace(/\s+/g, " ")
        .trim() ?? null,
    row: document.querySelector("#language-value")?.textContent,
    saved:
      JSON.parse(localStorage.getItem("far-door-settings") || "{}").language ??
      null,
    current: document.querySelector("#language-list button.current")?.dataset
      .language,
  }));

try {
  const page = await open();
  let s = await state(page);
  check(
    "a French browser opens in French on Automatic",
    s.lang === "fr" && s.row === "Automatique",
    s,
  );
  await page.click('#menu [data-screen="main"] [data-action="settings"]');
  await sleep(400);
  await page.click('#menu [data-action="language"]');
  await sleep(400);
  s = await state(page);
  const list = await page.$$eval("#language-list button", (bs) =>
    bs.map((b) => b.textContent.replace(/\s+/g, " ").trim()),
  );
  check(
    "the row opens every language at once, the one in use marked and in focus",
    s.screen === "language" &&
      list.length === 6 &&
      s.current === "auto" &&
      /Automatique/.test(s.focus),
    { list, focus: s.focus },
  );
  await page.screenshot({
    path: `${out}/list-fr-desktop.jpg`,
    type: "jpeg",
    quality: 82,
  });
  const t0 = Date.now();
  await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.click('#language-list [data-language="es"]'),
  ]);
  const clicked = Date.now() - t0;
  await ready(page);
  s = await state(page);
  check(
    "one click reloads into Spanish at once and comes back on Settings, the row in focus",
    s.lang === "es" &&
      s.screen === "settings" &&
      s.saved === "es" &&
      s.row === "Español" &&
      /Idioma/.test(s.focus ?? ""),
    { ...s, navigationMs: clicked },
  );
  await page.screenshot({
    path: `${out}/back-on-settings-es.jpg`,
    type: "jpeg",
    quality: 82,
  });
  await page.keyboard.press("Enter");
  await sleep(400);
  s = await state(page);
  const list2 = s.focus;
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  s = await state(page);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.keyboard.press("Enter"),
  ]);
  await ready(page);
  const fr = await state(page);
  check(
    "with keys: Enter opens the list on the language in use, up three and Enter chooses Automatic",
    /Español/.test(list2 ?? "") &&
      /^Autom/.test(s.focus ?? "") &&
      fr.lang === "fr" &&
      fr.saved === "auto" &&
      fr.screen === "settings",
    { opened: list2, chosen: s.focus, after: fr },
  );
  await page.click('#menu [data-action="language"]');
  await sleep(300);
  let navigated = false;
  page.once("framenavigated", () => (navigated = true));
  await page.click('#language-list [data-language="fr"]');
  await sleep(1500);
  s = await state(page);
  check(
    "choosing French while Automatic already shows French saves it without a reload",
    !navigated &&
      s.saved === "fr" &&
      s.screen === "settings" &&
      s.lang === "fr",
    { navigated, ...s },
  );
  await page.close();

  const phone = await open(true);
  await phone.tap('#menu [data-screen="main"] [data-action="settings"]');
  await sleep(400);
  const row = await phone.$('#menu [data-action="language"]');
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await sleep(200);
  await row.tap();
  await sleep(400);
  await phone.screenshot({
    path: `${out}/list-fr-phone.jpg`,
    type: "jpeg",
    quality: 82,
  });
  await Promise.all([
    phone.waitForNavigation({ waitUntil: "load" }),
    phone.tap('#language-list [data-language="hi"]'),
  ]);
  await ready(phone);
  s = await state(phone);
  check(
    "a phone taps the row, then Hindi, and comes back on Settings in Hindi",
    s.lang === "hi" && s.screen === "settings",
    s,
  );
  await phone.screenshot({
    path: `${out}/back-on-settings-hi-phone.jpg`,
    type: "jpeg",
    quality: 82,
  });
  await phone.close();

  const play = await open();
  await play.click('#menu [data-screen="main"] [data-action="continue"]');
  await play.waitForFunction(() => window.__GAME__?.mode === "play", {
    timeout: 120000,
  });
  await sleep(2500);
  await play.keyboard.press("Escape");
  await sleep(500);
  await play.click('#menu [data-screen="pause"] [data-action="settings"]');
  await sleep(300);
  await play.click('#menu [data-action="language"]');
  await sleep(300);
  await Promise.all([
    play.waitForNavigation({ waitUntil: "load" }),
    play.click('#language-list [data-language="en"]'),
  ]);
  await play.waitForFunction(() => window.__GAME__?.mode === "play", {
    timeout: 120000,
  });
  s = await state(play);
  const url = await play.evaluate(() => location.search);
  check(
    "during play the level starts again in English, with no menu reopened",
    s.lang === "en" && s.mode === "play" && /chapter=floor/.test(url),
    { ...s, url },
  );
  check("no page errors", errors.length === 0, errors);
} catch (error) {
  errors.push(String(error?.stack || error));
  check("ran to the end", false, String(error));
} finally {
  await writeFile(
    `${out}/language-choice.json`,
    JSON.stringify({ results, errors }, null, 1),
  );
  await browser.close();
}
