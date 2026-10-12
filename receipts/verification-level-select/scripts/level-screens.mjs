// Frames of the levels screen in each language, viewport and save, turned through every card,
// with a list of lines that wrap, run out of their box or scroll the page, of cards whose text
// runs past them and of anything off the screen. `all` seeds a finished campaign, `partial` a
// save at the drowned archive (the vault still sealed), `first` a save at the first world.
//   node receipts/verification-level-select/scripts/level-screens.mjs <outDir>
//     [--url=http://localhost:3002/] [--langs=en,fr,es,zh,hi]
//     [--kinds=desktop,wide,phone,landscape] [--saves=all,partial,first]
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const out = process.argv[2] || "outputs/level-screens";
const arg = (name, fallback) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const base = arg("url", "http://localhost:3002/");
const langs = arg("langs", "en,fr,es,zh,hi").split(",");
const kinds = arg("kinds", "desktop,wide,phone,landscape").split(",");
const saves = arg("saves", "all,partial,first").split(",");
const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  wide: { width: 1920, height: 1080 },
  phone: {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  landscape: {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
const ALL = ["court", "floor", "checkpoint", "isles", "frost", "forest", "sea"];
const PROGRESS = {
  all: {
    reached: [...ALL, "vault"],
    last: "vault",
    completed: true,
    campaign: 7,
    pistols: true,
  },
  partial: { reached: ALL, last: "frost", pistols: true },
  first: { reached: ["court"], last: "court" },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What the player reads on the screen: headings, labels and buttons that take more than one
// line or run out of their box, a card's text that runs past the card, anything off screen.
const problems = (page) =>
  page.evaluate(() => {
    const found = [];
    const panel = document.querySelector("#menu .panel:not([hidden])");
    const card = panel.querySelector('.carousel-slide[data-place="current"]');
    if (panel.scrollHeight > panel.clientHeight + 2)
      found.push({ panelScrolls: panel.scrollHeight - panel.clientHeight });
    if (panel.scrollWidth > panel.clientWidth + 1)
      found.push({
        panelScrollsSideways: panel.scrollWidth - panel.clientWidth,
      });
    if (document.documentElement.scrollWidth > innerWidth + 1)
      found.push({ pageScrollsSideways: true });
    if (panel.scrollTop || panel.scrollLeft)
      found.push({ panelScrolled: [panel.scrollLeft, panel.scrollTop] });
    const lines = [
      ...panel.querySelectorAll(
        ":scope > :is(.kicker, .panel-title), :scope > nav button",
      ),
      ...card.querySelectorAll(":is(.kicker, h3, .level-state, button)"),
    ];
    for (const el of lines) {
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
      const height = parseFloat(getComputedStyle(el).fontSize) * 0.8;
      const count = tops.length
        ? 1 +
          tops
            .sort((a, b) => a - b)
            .filter((t, i, all) => i && t - all[i - 1] > height).length
        : 0;
      const box = el.matches("button") ? el.querySelector(".label") || el : el;
      const cut =
        box.scrollWidth > box.clientWidth + 1 &&
        getComputedStyle(box).overflow !== "visible";
      if (count > 1 || cut)
        found.push({
          text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
          lines: count,
          cut,
          font: getComputedStyle(box).fontSize,
        });
    }
    const info = card.querySelector(".level-info").getBoundingClientRect();
    const frame = card.getBoundingClientRect();
    const inner = card.querySelector(".level-info");
    if (
      info.top < frame.top - 1 ||
      info.bottom > frame.bottom + 1 ||
      inner.scrollHeight > inner.clientHeight + 1
    )
      found.push({ textRunsPastCard: Math.round(inner.scrollHeight) });
    if (frame.top < 0 || frame.bottom > innerHeight)
      found.push({ cardOffScreen: [frame.top, frame.bottom] });
    for (const arrow of panel.querySelectorAll(".carousel-turn")) {
      const r = arrow.getBoundingClientRect();
      if (r.left < 0 || r.right > innerWidth)
        found.push({ arrowOffScreen: [r.left, r.right] });
    }
    // The smallest a fitted line was set, against its own size.
    const fitted = [...card.querySelectorAll("h3, .label")]
      .filter((el) => el.style.fontSize)
      .map((el) => el.style.fontSize);
    if (fitted.length) found.push({ fittedSmaller: fitted });
    return found;
  });
const current = (page) =>
  page.evaluate(
    () =>
      document.querySelector(
        '#menu [data-screen="levels"] .carousel-slide[data-place="current"]',
      )?.dataset.world || "sealed",
  );
// Until the stage stops moving: a busy page can stretch a half-second turn.
const settle = async (page) => {
  await sleep(80);
  await page
    .waitForFunction(
      () =>
        !document
          .getAnimations()
          .some(
            (a) =>
              a.playState === "running" &&
              a.effect?.target?.closest?.(".carousel, .carousel-pips"),
          ),
      { timeout: 5000, polling: 50 },
    )
    .catch(() => {});
  await sleep(120);
};

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const summary = [];
try {
  for (const save of saves)
    for (const kind of kinds)
      for (const lang of langs) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setViewport(VIEWPORTS[kind]);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on(
          "console",
          (m) => m.type() === "error" && errors.push(m.text()),
        );
        await page.evaluateOnNewDocument((progress) => {
          localStorage.setItem("far-door-progress", JSON.stringify(progress));
        }, PROGRESS[save]);
        await page.goto(`${base}?nolock=1&lang=${lang}`, { waitUntil: "load" });
        await page.waitForFunction(() => window.__READY__ === true, {
          timeout: 90000,
        });
        await sleep(1200);
        await page.evaluate(() =>
          document.querySelector('#menu [data-action="levels"]').click(),
        );
        await sleep(500);
        await settle(page);
        const name = `${save}-${kind}-${lang}`;
        const shot = (suffix) =>
          page.screenshot({
            path: `${out}/${name}-${suffix}.jpg`,
            type: "jpeg",
            quality: 78,
          });
        await shot("open");
        const result = { save, kind, lang, opened: await current(page) };
        result.cards = {};
        // Back to the first card, then through every card to the last.
        for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
        await settle(page);
        for (let i = 0; i < 9; i++) {
          const at = await current(page);
          if (result.cards[at]) break;
          result.cards[at] = await problems(page);
          if (i === 0) await shot("first");
          await page.keyboard.press("ArrowRight");
          await settle(page);
        }
        await shot("last");
        result.errors = errors;
        summary.push(result);
        const flagged = Object.entries(result.cards).filter(([, list]) =>
          list.some((p) => !p.fittedSmaller),
        );
        console.log(
          name,
          `opened on ${result.opened},`,
          `${Object.keys(result.cards).length} cards,`,
          flagged.length
            ? JSON.stringify(Object.fromEntries(flagged))
            : "nothing wraps, runs out or scrolls",
          errors.length ? `errors: ${errors.join(" | ")}` : "",
        );
        await context.close();
      }
} finally {
  await browser.close();
  await writeFile(
    `${out}/level-screens.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
}
