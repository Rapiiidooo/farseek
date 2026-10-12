// Frames of the settings screen in one language and viewport, with the focus on three select
// rows (Aim, Language, Difficulty), and a list of lines that wrap, are cut or overflow.
//   node receipts/verification-settings-controls/scripts/settings-shots.mjs <outDir> <lang> <desktop|phone> <tag> [url]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [out, lang, kind, tag, base = "http://localhost:3005/"] =
  process.argv.slice(2);
await mkdir(out, { recursive: true });
const phone = kind === "phone";
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport(
  phone
    ? {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      }
    : { width: 1280, height: 720 },
);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on(
  "console",
  (m) => m.type() === "error" && !/404/.test(m.text()) && errors.push(m.text()),
);
await page.evaluateOnNewDocument(() => {
  if (sessionStorage.getItem("seeded")) return;
  localStorage.clear();
  localStorage.setItem(
    "far-door-progress",
    JSON.stringify({
      reached: ["court", "floor", "checkpoint", "isles", "frost", "forest"],
      last: "forest",
    }),
  );
  sessionStorage.setItem("seeded", "1");
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Lines of the open panel that wrap, are cut short or push the panel sideways, and controls that
// leave their row.
const lines = () =>
  page.evaluate(() => {
    const found = [];
    const panel = document.querySelector("#menu .panel:not([hidden])");
    if (panel.scrollWidth > panel.clientWidth + 1)
      found.push({
        panelScrollsSideways: panel.scrollWidth - panel.clientWidth,
      });
    for (const el of panel.querySelectorAll(
      ":is(button, .panel-title, .settings h3, .settings .row > span, .cycler, .cycler-value)",
    )) {
      if (!el.getClientRects().length) continue;
      const tops = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects())
          if (r.width > 1) tops.push(r.top);
      }
      const lineHeight = parseFloat(getComputedStyle(el).fontSize) * 0.8;
      const count = tops.length
        ? 1 +
          tops
            .sort((a, b) => a - b)
            .filter((t, i, all) => i && t - all[i - 1] > lineHeight).length
        : 0;
      const truncated =
        el.scrollWidth > el.clientWidth + 1 &&
        getComputedStyle(el).overflow !== "visible";
      if (count > 1 || truncated)
        found.push({
          text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
          lines: count,
          truncated,
          font: getComputedStyle(el).fontSize,
        });
    }
    for (const row of panel.querySelectorAll(".settings .row")) {
      const box = row.getBoundingClientRect();
      for (const control of row.querySelectorAll(
        "input:not([type=checkbox]), select, .cycler",
      )) {
        const r = control.getBoundingClientRect();
        if (!r.width || control.matches(".cycler select")) continue;
        if (r.left < box.left - 1 || r.right > box.right + 1)
          found.push({
            outside: row.textContent.trim().replace(/\s+/g, " ").slice(0, 40),
          });
      }
    }
    // The names a long label was shrunk to fit, with the size it was given.
    const shrunk = [...panel.querySelectorAll(".settings .row > span")]
      .filter((el) => el.style.fontSize)
      .map(
        (el) => `${el.textContent.trim().slice(0, 40)} @ ${el.style.fontSize}`,
      );
    return { found, shrunk };
  });

const focused = () =>
  page.evaluate(
    () =>
      document
        .querySelector("#menu .panel:not([hidden]) .focus")
        ?.querySelector("select, input")?.id ?? null,
  );
async function focusRow(id) {
  for (let i = 0; i < 40; i++) {
    if ((await focused()) === id) return;
    await page.keyboard.press("ArrowDown");
    await sleep(60);
  }
  throw new Error(`no row ${id}`);
}

const result = { lang, kind, tag };
try {
  await page.goto(`${base}?nolock=1&lang=${lang}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__READY__ === true, {
    timeout: 90000,
  });
  await sleep(1200);
  await page.evaluate(() =>
    document.querySelector('#menu [data-action="settings"]').click(),
  );
  await sleep(600);
  result.lines = await lines();
  for (const id of ["set-aim", "set-language", "set-difficulty"]) {
    await focusRow(id);
    await sleep(450);
    await page.screenshot({
      path: `${out}/settings-${id.slice(4)}-${lang}-${kind}-${tag}.jpg`,
      type: "jpeg",
      quality: 82,
    });
  }
} catch (error) {
  result.failure = error.message;
}
result.errors = errors;
await writeFile(
  `${out}/lines-${lang}-${kind}-${tag}.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
await browser.close();
if (result.failure || errors.length) process.exitCode = 1;
