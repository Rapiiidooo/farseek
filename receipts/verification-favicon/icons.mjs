// Renders game/favicon-32.png and an opaque RGB game/apple-touch-icon.png from game/favicon.svg;
// the touch icon insets the mark on its dark ground, since iOS rounds the corners itself.
//   node receipts/verification-favicon/icons.mjs
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const GROUND = "#140e0a";
const svg = readFileSync("game/favicon.svg", "utf8");

async function rasterize(svg, size, mark, ground) {
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${btoa(svg.replace("<svg ", `<svg width="${mark}" height="${mark}" `))}`;
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), {
    width: size,
    height: size,
  });
  const ctx = canvas.getContext("2d");
  if (ground) {
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.drawImage(img, (size - mark) / 2, (size - mark) / 2);
  return Array.from(ctx.getImageData(0, 0, size, size).data);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size, rgba, alpha) {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc((size * channels + 1) * size);
  for (let i = 0, o = 0; i < rgba.length; i += 4) {
    if (i % (size * 4) === 0) o++;
    if (!alpha && rgba[i + 3] !== 255)
      throw new Error("an apple-touch-icon must be opaque");
    for (let c = 0; c < channels; c++) raw[o++] = rgba[i + c];
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, alpha ? 6 : 2], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--force-color-profile=srgb", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  writeFileSync(
    "game/favicon-32.png",
    png(32, await page.evaluate(rasterize, svg, 32, 32), true),
  );
  const touch = await page.evaluate(rasterize, svg, 180, 144, GROUND);
  writeFileSync("game/apple-touch-icon.png", png(180, touch, false));
} finally {
  await browser.close();
}
