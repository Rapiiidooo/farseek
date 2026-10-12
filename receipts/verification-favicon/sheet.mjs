// Chrome rasterizes each SVG at 16, 32, 48 and 180 px over Chrome's light and dark tab colours;
// 16 and 32 px are also magnified to their pixels.
//   node receipts/verification-favicon/sheet.mjs <out.png|out.jpg> <label=icon.svg>...
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";

const [out, ...specs] = process.argv.slice(2);
const rows = specs.map((spec) => {
  const [label, file] = spec.split("=");
  return { label, svg: readFileSync(file, "utf8") };
});
const SIZES = [16, 32, 48, 180];
const ZOOM = { 16: 4, 32: 2 };
const TONES = ["#ffffff", "#202124"];
const STYLE = `
  body { margin: 0; padding: 12px 20px; width: max-content; background: #8d9196; color: #111;
    font: 600 12px/1.3 system-ui, sans-serif; }
  .row { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
  .label { width: 96px; }
  .tone { display: flex; align-items: center; gap: 14px; padding: 0 14px; border-radius: 8px; }
  .row:not(:first-child) .tone { padding: 14px; }
  .cell { display: flex; justify-content: center; white-space: nowrap; }
  canvas { display: block; image-rendering: pixelated; }`;

async function build(rows, sizes, zoom, tones) {
  const add = (parent, tag, className) => {
    const el = parent.appendChild(document.createElement(tag));
    if (className) el.className = className;
    return el;
  };
  const load = async (svg, n) => {
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(svg.replace("<svg ", `<svg width="${n}" height="${n}" `))}`;
    await img.decode();
    return img;
  };
  const head = add(document.body, "div", "row");
  add(head, "div", "label");
  for (const tone of tones) {
    const group = add(head, "div", "tone");
    for (const n of sizes) {
      const captions = [[n === 180 ? `180 px on ${tone}` : `${n} px`, n]];
      if (zoom[n]) captions.push([`×${zoom[n]}`, n * zoom[n]]);
      for (const [text, width] of captions) {
        const cell = add(group, "div", "cell");
        cell.style.width = `${width}px`;
        cell.textContent = text;
      }
    }
  }
  for (const { label, svg } of rows) {
    const row = add(document.body, "div", "row");
    add(row, "div", "label").textContent = label;
    for (const tone of tones) {
      const group = add(row, "div", "tone");
      group.style.background = tone;
      for (const n of sizes) {
        const real = add(group, "canvas");
        real.width = real.height = n;
        real.getContext("2d").drawImage(await load(svg, n), 0, 0);
        if (!zoom[n]) continue;
        const big = add(group, "canvas");
        big.width = big.height = n;
        big.getContext("2d").drawImage(real, 0, 0);
        big.style.width = big.style.height = `${n * zoom[n]}px`;
      }
    }
  }
}

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--force-color-profile=srgb", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>`,
  );
  await page.evaluate(build, rows, SIZES, ZOOM, TONES);
  const body = await page.$("body");
  const jpeg = out.endsWith(".jpg");
  writeFileSync(
    out,
    await body.screenshot(
      jpeg ? { type: "jpeg", quality: 90 } : { type: "png" },
    ),
  );
} finally {
  await browser.close();
}
