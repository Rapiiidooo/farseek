// Exercises the mute: M and the speaker on the title, layouts, the settings box, play and a reload.
//   node receipts/verification-mute-start-menu/scripts/mute-probe.mjs <outDir> [url]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [out, url = "http://localhost:3002/?nolock=1"] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? "  " + JSON.stringify(detail) : ""}`);
};
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      sessionStorage.setItem("seeded", "1");
    }
  });
  const state = () =>
    page.evaluate(() => ({
      pressed: document.querySelector("#mute").getAttribute("aria-pressed"),
      visible: !!document.querySelector("#mute").offsetParent,
      box: document.querySelector("#set-muted").checked,
      saved: JSON.parse(localStorage.getItem("far-door-settings") || "{}").muted ?? null,
      audio: window.__GAME__?.audio,
      label: document.querySelector("#mute").getAttribute("aria-label"),
      title: document.querySelector("#mute").getAttribute("title"),
    }));
  const key = (key, code) =>
    page.evaluate(
      (key, code) => window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true })),
      key,
      code,
    );
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, { timeout: 90000 });
  await sleep(900);
  let s = await state();
  check("speaker shown on the title, sound on", s.visible && s.pressed === "false" && !s.box, s);
  await page.screenshot({ path: `${out}/title.png` });
  await page.keyboard.press("KeyM");
  await sleep(200);
  s = await state();
  check("M mutes from the title and saves it", s.pressed === "true" && s.box && s.saved === true, s);
  await page.screenshot({ path: `${out}/title-muted.png` });
  await page.click("#mute");
  await sleep(200);
  s = await state();
  check("the speaker unmutes", s.pressed === "false" && !s.box && s.saved === false, s);
  await key(",", "KeyM");
  await sleep(100);
  check("AZERTY's comma key (KeyM) leaves the sound on", (await state()).pressed === "false");
  await key("m", "Semicolon");
  await sleep(100);
  check("AZERTY's M key (Semicolon) mutes", (await state()).pressed === "true");
  await key("ь", "KeyM");
  await sleep(100);
  check("a Cyrillic layout's M place unmutes", (await state()).pressed === "false");
  await key("m", "KeyM");
  await sleep(100);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", code: "KeyM", repeat: true })));
  await sleep(100);
  check("a held M toggles once", (await state()).pressed === "true");
  await page.click("#startb");
  await page.waitForFunction(
    () => window.__GAME__?.mode === "play" && document.querySelector("#loading")?.hidden,
    { timeout: 120000, polling: 100 },
  );
  await sleep(1500);
  s = await state();
  check("a muted new game plays silent", s.audio?.muted === true && s.audio.gain < 0.01, s.audio);
  await page.keyboard.press("KeyM");
  await sleep(900);
  s = await state();
  check("M in play brings the sound back", s.audio?.muted === false && s.audio.gain > 0.1, s.audio);
  await page.keyboard.press("KeyM");
  await sleep(900);
  s = await state();
  check("M in play mutes again", s.audio?.muted === true && s.audio.gain < 0.01, s.audio);
  await page.keyboard.press("Escape");
  await sleep(700);
  s = await state();
  check("the pause menu shows the muted speaker", s.visible && s.pressed === "true", s);
  await page.screenshot({ path: `${out}/pause-muted.png` });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, { timeout: 90000 });
  await sleep(900);
  s = await state();
  check("the mute survives a reload", s.pressed === "true" && s.box && s.saved === true, s);
  await page.goto(url.replace("?", "?lang=fr&"), { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, { timeout: 90000 });
  await sleep(600);
  s = await state();
  const row = await page.evaluate(() => document.querySelector("#set-muted").previousElementSibling.textContent);
  check("French labels", s.label === "Couper le son" && s.title === "Couper le son (M)" && row === "Couper le son (M)", { ...s, row });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(600);
  await page.screenshot({ path: `${out}/title-phone-fr.png` });
} catch (e) {
  check("run", false, e.message);
} finally {
  check("no page errors", errors.length === 0, errors.join(" | "));
  await writeFile(`${out}/mute.json`, JSON.stringify({ results, errors }, null, 2) + "\n");
  await browser.close();
}
