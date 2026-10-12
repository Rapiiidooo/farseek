// Changes settings every way the screen offers and checks what each cycler shows and what is
// saved: arrow and value clicks, left and right keys and Enter on a focused row, a gamepad's
// d-pad (a stubbed pad polled by the game), a range drag, switch clicks, a language change that
// reloads once into the language chosen, and taps and hit areas on a phone.
//   node receipts/verification-settings-controls/scripts/settings-paths.mjs <outDir> [url]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [out, base = "http://localhost:3005/"] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const results = [];
const errors = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

async function open(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on(
    "console",
    (m) =>
      m.type() === "error" && !/404/.test(m.text()) && errors.push(m.text()),
  );
  // A clean save, and a gamepad the page sees only while `__padOn` is set.
  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      sessionStorage.setItem("seeded", "1");
    }
    window.__pad = {
      id: "probe pad",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
    };
    window.__padOn = false;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => (window.__padOn ? [window.__pad] : []),
    });
  });
  return page;
}

async function title(page) {
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await sleep(900);
}

async function settingsScreen(page) {
  await page.evaluate(() =>
    document.querySelector('#menu [data-action="settings"]').click(),
  );
  await sleep(500);
}

// What a setting's control shows and what the save holds.
const read = (page, id) =>
  page.evaluate((id) => {
    const el = document.getElementById(id);
    const box = el.closest(".cycler");
    const saved = JSON.parse(localStorage.getItem("far-door-settings") || "{}");
    return {
      value: el.type === "checkbox" ? el.checked : el.value,
      option: el.options?.[el.selectedIndex]?.text ?? null,
      shown:
        box?.querySelector(".cycler-value > span.current")?.textContent ?? null,
      pip: box
        ? [...box.querySelectorAll(".cycler-pips i")].findIndex((i) =>
            i.classList.contains("current"),
          )
        : null,
      index: el.selectedIndex ?? null,
      fill: el.style.getPropertyValue("--fill") || null,
      saved: saved[el.dataset.setting],
    };
  }, id);
const consistent = (s) => s.shown === s.option && s.pip === s.index;

// The centre of a cycler's part, its row first brought to the middle of the panel.
const part = (page, id, selector) =>
  page.evaluate(
    (id, selector) => {
      const el = document.getElementById(id);
      el.closest(".row").scrollIntoView({ block: "center" });
      const target = selector
        ? el.closest(".cycler").querySelector(selector)
        : el;
      const r = target.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      };
    },
    id,
    selector,
  );
const NEXT = '.cycler-arrow[data-step="1"]';
const PREVIOUS = '.cycler-arrow[data-step="-1"]';
const VALUE = ".cycler-value";

async function click(page, id, selector) {
  const at = await part(page, id, selector);
  await page.mouse.click(at.x, at.y);
  await sleep(160);
  return at;
}

const focused = (page) =>
  page.evaluate(
    () =>
      document
        .querySelector("#menu .panel:not([hidden]) .focus")
        ?.querySelector("select, input")?.id ?? null,
  );
async function focusRow(page, id) {
  for (let i = 0; i < 40; i++) {
    if ((await focused(page)) === id) return;
    await page.keyboard.press("ArrowDown");
    await sleep(50);
  }
  throw new Error(`no row ${id}`);
}
async function key(page, code) {
  await page.keyboard.press(code);
  await sleep(160);
}
async function pad(page, button) {
  await page.evaluate((button) => {
    window.__padOn = true;
    window.__pad.buttons[button].pressed = true;
  }, button);
  await sleep(150);
  await page.evaluate((button) => {
    window.__pad.buttons[button].pressed = false;
  }, button);
  await sleep(200);
}
async function frame(page, id, name) {
  const row = await page.evaluate((id) => {
    const r = document
      .getElementById(id)
      .closest(".row")
      .getBoundingClientRect();
    return {
      x: r.left - 8,
      y: r.top - 6,
      width: r.width + 16,
      height: r.height + 12,
    };
  }, id);
  await page.screenshot({
    path: `${out}/${name}.jpg`,
    type: "jpeg",
    quality: 88,
    clip: row,
  });
}

const SELECTS = [
  "set-aim",
  "set-language",
  "set-quality",
  "set-subtitle-size",
  "set-subtitle-backing",
  "set-difficulty",
];

try {
  // --- desktop, mouse, keys and pad ---------------------------------------------------------
  const page = await open({ width: 1280, height: 720, deviceScaleFactor: 2 });
  const navigations = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations.push(Date.now());
  });
  await page.goto(`${base}?nolock=1`, { waitUntil: "load" });
  await title(page);
  await settingsScreen(page);

  const structure = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const select = document.getElementById(id);
        const parts = [...select.closest(".cycler").querySelectorAll("button")];
        return {
          id,
          cycler: !!select.closest(".cycler"),
          labelled: select.closest("label")?.control === select,
          rendered: getComputedStyle(select).display !== "none",
          hiddenParts: parts.every(
            (b) =>
              b.getAttribute("aria-hidden") === "true" &&
              b.tabIndex === -1 &&
              !b.hasAttribute("data-action"),
          ),
          parts: parts.length,
        };
      }),
    SELECTS,
  );
  check(
    "each select is a cycler; the select stays rendered and labelled, its arrows and value hidden from screen readers and from the menu's actions",
    structure.every(
      (s) =>
        s.cycler && s.labelled && s.rendered && s.hiddenParts && s.parts === 3,
    ),
    JSON.stringify(
      structure.filter(
        (s) => !(s.cycler && s.labelled && s.rendered && s.hiddenParts),
      ),
    ),
  );
  // What a screen reader is given: Chrome's accessibility tree of the open settings screen.
  const nodes = [];
  const walk = (node) => {
    if (!node) return;
    nodes.push(node);
    for (const child of node.children || []) walk(child);
  };
  walk(await page.accessibility.snapshot({ interestingOnly: true }));
  const boxes = nodes
    .filter((n) => n.role === "combobox")
    .map((n) => `${n.name}=${n.value}`);
  const unnamed = nodes.filter((n) => n.role === "button" && !n.name?.trim());
  check(
    "a screen reader still meets each select as a combobox named by its row, with its value, and no unnamed button",
    boxes.join() ===
      "Aim=Hold,Language=Automatic,Image quality=High,Subtitle size=Medium,Subtitle backing=None,Difficulty=Standard" &&
      unnamed.length === 0,
    `${boxes.join(", ")}; ${unnamed.length} unnamed buttons`,
  );
  const first = await Promise.all(SELECTS.map((id) => read(page, id)));
  check(
    "every cycler opens on its saved option and lights its pip",
    first.every(consistent),
    first.map((s) => `${s.value}=${s.shown}`).join(", "),
  );

  // Arrow clicks, with the arrows' positions for every option.
  let s = await read(page, "set-quality");
  const startQuality = s.value;
  const positions = [];
  const seen = [s.shown];
  // Layout positions: the hovered arrow's scale must not count as a move.
  const placed = () =>
    page.evaluate(() => {
      const box = document.getElementById("set-quality").closest(".cycler");
      const [back, next] = box.querySelectorAll(".cycler-arrow");
      const r = box.getBoundingClientRect();
      return `${(r.left + back.offsetLeft).toFixed(1)}/${(r.left + next.offsetLeft).toFixed(1)}`;
    });
  for (let i = 0; i < 3; i++) {
    await click(page, "set-quality", NEXT);
    positions.push(await placed());
    s = await read(page, "set-quality");
    seen.push(s.shown);
    if (!consistent(s) || s.saved !== s.value) break;
  }
  check(
    "the right arrow steps Image quality forward through every option, saved each time",
    seen.length === 4 &&
      seen[0] === seen[3] &&
      new Set(seen).size === 3 &&
      s.saved === startQuality,
    seen.join(" > "),
  );
  check(
    "the arrows keep their place whichever option shows",
    new Set(positions).size === 1,
    positions.join(", "),
  );
  await click(page, "set-quality", PREVIOUS);
  s = await read(page, "set-quality");
  check(
    "the left arrow steps back",
    consistent(s) && s.value === "fast" && s.saved === "fast",
    `${startQuality} < ${s.value}`,
  );
  await click(page, "set-quality", NEXT);

  // A click on the value steps forward.
  const sizes = [];
  for (let i = 0; i < 3; i++) {
    await click(page, "set-subtitle-size", VALUE);
    s = await read(page, "set-subtitle-size");
    const look = await page.evaluate(
      () =>
        [...document.body.classList]
          .find((c) => /^subtitles-(small|large)$/.test(c))
          ?.slice(10) ?? "medium",
    );
    sizes.push(`${s.value}:${s.saved}:${look}:${consistent(s)}`);
  }
  check(
    "a click on the value steps forward and applies the subtitle size",
    sizes.join() ===
      "large:large:large:true,small:small:small:true,medium:medium:medium:true",
    sizes.join(", "),
  );

  // Left and right keys, and Enter, on a focused row.
  await page.evaluate(() =>
    document.querySelector(".settings").closest(".panel").scrollTo(0, 0),
  );
  await focusRow(page, "set-difficulty");
  const keyed = [];
  for (const code of ["ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowRight"]) {
    await key(page, code);
    s = await read(page, "set-difficulty");
    keyed.push(
      `${code.slice(5)}>${s.value}${consistent(s) && s.saved === s.value ? "" : "!"}`,
    );
  }
  check(
    "right and left keys on the focused Difficulty row step it and save it",
    keyed.join() === "Right>hard,Left>standard,Left>story,Right>standard",
    keyed.join(", "),
  );
  await focusRow(page, "set-aim");
  await key(page, "Enter");
  const toggled = await read(page, "set-aim");
  await key(page, "Enter");
  const held = await read(page, "set-aim");
  check(
    "Enter on the focused Aim row steps forward",
    toggled.value === "toggle" &&
      toggled.saved === "toggle" &&
      consistent(toggled) &&
      held.value === "hold" &&
      held.saved === "hold" &&
      consistent(held),
    `${toggled.shown} then ${held.shown}`,
  );
  await frame(page, "set-aim", "row-aim-focused");

  // The gamepad's d-pad, polled by the game.
  await focusRow(page, "set-subtitle-backing");
  await pad(page, 15);
  const padRight = await read(page, "set-subtitle-backing");
  await pad(page, 14);
  const padLeft = await read(page, "set-subtitle-backing");
  check(
    "the gamepad's d-pad steps the focused row",
    padRight.value === "soft" &&
      padRight.saved === "soft" &&
      consistent(padRight) &&
      padLeft.value === "none" &&
      padLeft.saved === "none" &&
      consistent(padLeft),
    `${padRight.shown} then ${padLeft.shown}`,
  );
  await page.evaluate(() => (window.__padOn = false));

  // Ranges: a drag, and the keys on a focused row; the fill follows both.
  const volume = await part(page, "set-volume");
  const before = await read(page, "set-volume");
  const startX =
    volume.left + 9.6 + Number(before.fill) * (volume.width - 19.2);
  await page.mouse.move(startX, volume.y);
  await page.mouse.down();
  await page.mouse.move(volume.left + volume.width * 0.25, volume.y, {
    steps: 8,
  });
  await page.mouse.up();
  await sleep(160);
  const dragged = await read(page, "set-volume");
  const fillOf = (s, min, max) => (Number(s.value) - min) / (max - min);
  check(
    "a drag on Master volume moves it, saves it and fills the groove to the thumb",
    Number(dragged.value) < Number(before.value) &&
      dragged.saved === Number(dragged.value) &&
      Math.abs(Number(dragged.fill) - fillOf(dragged, 0, 1)) < 1e-6,
    `${before.value} -> ${dragged.value}, fill ${dragged.fill}`,
  );
  await frame(page, "set-volume", "row-volume-dragged");
  await focusRow(page, "set-fov");
  await key(page, "ArrowRight");
  await key(page, "ArrowRight");
  const fov = await read(page, "set-fov");
  const fovText = await page.evaluate(
    () => document.querySelector("#fov-value").textContent,
  );
  check(
    "right on the focused Field of view row steps it, its fill and its shown degrees",
    fov.value === "62" &&
      fov.saved === 62 &&
      fovText === "62°" &&
      Math.abs(Number(fov.fill) - fillOf(fov, 50, 90)) < 1e-6,
    `${fov.value}, ${fovText}, fill ${fov.fill}`,
  );
  await frame(page, "set-fov", "row-fov-focused");

  // Switches: a click on the switch and a click on the row's name.
  await click(page, "set-invert");
  const inverted = await read(page, "set-invert");
  await page.evaluate(() =>
    document
      .getElementById("set-invert")
      .closest(".row")
      .scrollIntoView({ block: "center" }),
  );
  const name = await page.evaluate(() => {
    const r = document
      .getElementById("set-invert")
      .closest(".row")
      .querySelector("span")
      .getBoundingClientRect();
    return { x: r.left + 20, y: r.top + r.height / 2 };
  });
  await page.mouse.click(name.x, name.y);
  await sleep(160);
  const restored = await read(page, "set-invert");
  check(
    "a click on a switch, then on its row's name, turns Invert vertical look on and off",
    inverted.value === true &&
      inverted.saved === true &&
      restored.value === false &&
      restored.saved === false,
    `${inverted.value} then ${restored.value}`,
  );
  await click(page, "set-invert");
  await frame(page, "set-invert", "row-switch-on");
  await click(page, "set-invert");

  // Hover lights the arrow under the pointer.
  const hover = await part(page, "set-quality", NEXT);
  await page.mouse.move(hover.x, hover.y);
  await sleep(350);
  await frame(page, "set-quality", "row-quality-hover");

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("far-door-settings")),
  );
  check(
    "the save holds every value chosen above",
    saved.quality === "high" &&
      saved.subtitleSize === "medium" &&
      saved.difficulty === "standard" &&
      saved.aimMode === "hold" &&
      saved.subtitleBacking === "none" &&
      saved.fov === 62 &&
      saved.volume === Number(dragged.value) &&
      saved.invertY === false,
    JSON.stringify(saved),
  );

  // Language: two quick steps reload once, into the second language, after a pause.
  const loads = navigations.length;
  let reloaded = page.waitForNavigation({ waitUntil: "load", timeout: 15000 });
  await click(page, "set-language", NEXT);
  await click(page, "set-language", NEXT);
  const lastStep = Date.now() - 160;
  const stepped = await read(page, "set-language");
  const settling = await page.evaluate(() =>
    document
      .getElementById("set-language")
      .closest(".cycler")
      .classList.contains("settling"),
  );
  await sleep(250);
  await frame(page, "set-language", "row-language-settling");
  await reloaded;
  const waited = navigations[loads] - lastStep;
  await title(page);
  const french = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    settings: document.querySelector('#menu [data-action="settings"] .label')
      .textContent,
    saved: JSON.parse(localStorage.getItem("far-door-settings")).language,
  }));
  await settingsScreen(page);
  const shownFrench = await read(page, "set-language");
  check(
    "two quick steps on Language show the groove, then reload once into French about 1.2 s after the last",
    stepped.value === "fr" &&
      stepped.shown === "Français" &&
      settling &&
      waited >= 1100 &&
      waited < 3000 &&
      navigations.length - loads === 1 &&
      french.lang === "fr" &&
      french.saved === "fr" &&
      french.settings === "Paramètres" &&
      shownFrench.shown === "Français" &&
      consistent(shownFrench),
    JSON.stringify({
      waited,
      loads: navigations.length - loads,
      ...french,
      shown: shownFrench.shown,
    }),
  );

  // A step away and back to the language loaded does not reload.
  const settled = navigations.length;
  await click(page, "set-language", NEXT);
  await click(page, "set-language", PREVIOUS);
  await sleep(2500);
  const stayed = await read(page, "set-language");
  const quiet = await page.evaluate(() =>
    document
      .getElementById("set-language")
      .closest(".cycler")
      .classList.contains("settling"),
  );
  check(
    "stepping away from French and back keeps the page, with no reload pending",
    navigations.length === settled &&
      stayed.value === "fr" &&
      stayed.saved === "fr" &&
      !quiet,
    `${navigations.length - settled} reloads`,
  );

  // The keys reach a language too: left from French is English.
  await focusRow(page, "set-language");
  reloaded = page.waitForNavigation({ waitUntil: "load", timeout: 15000 });
  await key(page, "ArrowLeft");
  await reloaded;
  await title(page);
  const english = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    saved: JSON.parse(localStorage.getItem("far-door-settings")).language,
  }));
  check(
    "left on the focused Language row reloads into English",
    english.lang === "en" && english.saved === "en",
    JSON.stringify(english),
  );
  await page.close();

  // --- phone: taps and hit areas --------------------------------------------------------------
  const phone = await open({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await phone.goto(`${base}?nolock=1`, { waitUntil: "load" });
  await title(phone);
  await settingsScreen(phone);
  const rows = await phone.evaluate(() =>
    [...document.querySelectorAll(".settings .row")].map((r) =>
      Math.round(r.getBoundingClientRect().height),
    ),
  );
  check(
    "settings rows stay 48 px tall on a phone",
    rows.every((h) => h === 48),
    [...new Set(rows)].join(", "),
  );
  const hits = await phone.evaluate((ids) => {
    const misses = [];
    let probes = 0;
    for (const id of ids) {
      const box = document.getElementById(id).closest(".cycler");
      box.closest(".row").scrollIntoView({ block: "center" });
      for (const target of box.querySelectorAll("button")) {
        const r = target.getBoundingClientRect();
        const cx = r.left + r.width / 2,
          cy = r.top + r.height / 2;
        const out = target.dataset.step === "-1" ? -1 : 1;
        // 22 px each way is a 44 px target; outward only for the arrows, up and down for all.
        const points = target.matches(".cycler-arrow")
          ? [
              [cx, cy - 21.5],
              [cx, cy + 21.5],
              [cx + out * 21.5, cy],
              [cx + out * 21.5, cy - 21.5],
              [cx + out * 21.5, cy + 21.5],
            ]
          : [
              [cx, cy - 21.5],
              [cx, cy + 21.5],
            ];
        for (const [x, y] of points) {
          probes++;
          const hit = document.elementFromPoint(x, y)?.closest("button");
          if (hit !== target)
            misses.push(
              `${id} ${target.className} at ${(x - cx).toFixed(1)},${(y - cy).toFixed(1)}`,
            );
        }
        // An arrow's width counted from its own side of the value outward.
        if (target.matches(".cycler-arrow")) {
          const inner = out === 1 ? r.left : r.right;
          let reach = 0;
          for (let d = 0; d < 80; d++) {
            const x = inner + out * d;
            if (document.elementFromPoint(x, cy)?.closest("button") === target)
              reach = d + 1;
          }
          let back = 0;
          for (let d = 1; d < 30; d++) {
            const x = inner - out * d;
            if (document.elementFromPoint(x, cy)?.closest("button") === target)
              back = d;
          }
          if (reach + back < 44)
            misses.push(`${id} ${target.className} width ${reach + back}`);
        }
      }
    }
    return { probes, misses };
  }, SELECTS);
  check(
    "on a phone each arrow answers across 44 px and the value across 44 px of height",
    hits.misses.length === 0,
    `${hits.probes} probes; ${hits.misses.slice(0, 6).join("; ")}`,
  );
  const tapped = [];
  for (const selector of [NEXT, VALUE, PREVIOUS]) {
    const at = await part(phone, "set-difficulty", selector);
    await phone.touchscreen.tap(at.x, at.y);
    await sleep(250);
    const t = await read(phone, "set-difficulty");
    tapped.push(`${t.value}${consistent(t) && t.saved === t.value ? "" : "!"}`);
  }
  check(
    "taps on the arrows and the value step Difficulty on a phone",
    tapped.join() === "hard,story,hard",
    tapped.join(", "),
  );
  await phone.close();
} catch (error) {
  check("run", false, error.stack?.split("\n").slice(0, 3).join(" "));
}
check("no page errors", errors.length === 0, errors.join(" | "));
await writeFile(
  `${out}/paths.json`,
  JSON.stringify({ results, errors }, null, 2) + "\n",
);
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
