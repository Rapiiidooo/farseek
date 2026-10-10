// Renders the teaser's type as transparent 1920x1080 frames at 60 a second, set in the game's
// own faces: the captions over the film and the closing card. Each animation is stepped by
// hand, frame by frame, so the frames do not depend on the machine's speed.
//   node scripts/teaser/titles.mjs [outDir]
import puppeteer from "puppeteer-core";
import { mkdir, readFile, rm } from "node:fs/promises";
import { TITLES } from "./timeline.mjs";

const dir = `${process.argv[2] || "outputs/teaser"}/titles`;
const FPS = 60;
const font = async (file) =>
  `url(data:font/woff2;base64,${(await readFile(`game/fonts/${file}`)).toString("base64")}) format("woff2")`;
const style = `
  @font-face { font-family: "Barlow Condensed"; font-weight: 800;
    src: ${await font("barlow-condensed-800.woff2")}; }
  @font-face { font-family: "Barlow Condensed"; font-weight: 700;
    src: ${await font("barlow-condensed-700.woff2")}; }
  @font-face { font-family: "DM Sans"; font-weight: 100 1000;
    src: ${await font("dm-sans-variable.woff2")}; }
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden;
    background: transparent; font-family: "DM Sans", sans-serif; }
  .shade { position: absolute; inset: 0;
    background: linear-gradient(20deg, rgba(10, 7, 5, 0.38) 0%, rgba(10, 7, 5, 0) 30%); }
  .caption { position: absolute; left: 132px; bottom: 132px; }
  .kicker { margin: 0 0 14px 4px; font-size: 25px; font-weight: 650; letter-spacing: 0.34em;
    text-transform: uppercase; color: #39e3d0; text-shadow: 0 1px 14px rgba(0, 0, 0, 0.85); }
  .line { margin: 0; font-family: "Barlow Condensed"; font-weight: 800; font-size: 148px;
    line-height: 0.86; letter-spacing: 0.01em; text-transform: uppercase; color: #f6e7c8;
    text-shadow: 0 6px 34px rgba(0, 0, 0, 0.7), 0 2px 0 rgba(90, 50, 20, 0.5); }
  .bar { height: 5px; width: 132px; margin: 22px 0 0 4px; background: #39e3d0;
    box-shadow: 0 0 18px rgba(57, 227, 208, 0.7); transform-origin: left center; }
  .center { position: absolute; inset: 0; display: grid; place-content: center;
    text-align: center; }
  .center .line { font-size: 210px; }
  .card { position: absolute; inset: 0; display: grid; place-content: center;
    text-align: center; background: radial-gradient(ellipse at 50% 46%, #241912 0%, #0d0907 72%); }
  .card .kicker { margin: 0 0 26px; font-size: 27px; }
  .logo { margin: 0; font-family: "Barlow Condensed"; font-weight: 800; font-size: 300px;
    line-height: 0.84; letter-spacing: 0.05em; text-transform: uppercase;
    background: linear-gradient(100deg, #e8cfa4 0%, #f6e7c8 38%, #ffffff 48%, #f6e7c8 58%, #d9a441 100%);
    background-size: 300% 100%; background-position: 100% 0;
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 26px 50px rgba(0, 0, 0, 0.55)); }
  .tagline { margin: 34px 0 0; font-size: 40px; font-weight: 500; color: #f0e2c8;
    letter-spacing: 0.02em; }
  .play { margin: 70px 0 0; font-size: 28px; font-weight: 500; letter-spacing: 0.2em;
    text-transform: uppercase; color: rgba(240, 226, 200, 0.75); }
  .url { margin: 12px 0 0; font-size: 56px; font-weight: 700; color: #39e3d0;
    text-shadow: 0 0 24px rgba(57, 227, 208, 0.35); }
  @keyframes rise { from { clip-path: inset(-40% -10% 100% -10%); transform: translateY(46px) scale(1.04); }
    to { clip-path: inset(-40% -10% -40% -10%); transform: none; } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes track { from { opacity: 0; letter-spacing: 0.7em; } to { opacity: 1; letter-spacing: 0.34em; } }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes leave { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-14px); } }
  @keyframes punch { from { opacity: 0; transform: scale(1.18); filter: blur(10px); }
    to { opacity: 1; transform: none; filter: blur(0); } }
  @keyframes sweep { from { background-position: 100% 0; } to { background-position: 0% 0; } }
`;

// A caption: the line rises out of its own baseline, the kicker tracks in, the bar grows.
function caption({ kicker, line, seconds }) {
  const out = seconds - 0.2;
  return `<div class="shade" style="animation: fadeIn 0.25s both, leave 0.2s ${out}s both"></div>
    <div class="caption" style="animation: leave 0.2s ${out}s both">
      <p class="kicker" style="animation: track 0.45s cubic-bezier(.2,.8,.2,1) 0.05s both">${kicker}</p>
      <h2 class="line" style="animation: rise 0.28s cubic-bezier(.2,.9,.25,1) both">${line}</h2>
      <div class="bar" style="animation: grow 0.4s cubic-bezier(.2,.8,.2,1) 0.12s both"></div>
    </div>`;
}
function center({ kicker, line, seconds }) {
  const out = seconds - 0.18;
  return `<div class="center" style="animation: leave 0.18s ${out}s both">
      ${kicker ? `<p class="kicker" style="animation: track 0.5s cubic-bezier(.2,.8,.2,1) both">${kicker}</p>` : ""}
      <h2 class="line" style="animation: punch 0.22s cubic-bezier(.15,.9,.25,1) both">${line}</h2>
    </div>`;
}
function card({ kicker, tagline, play, url }) {
  return `<div class="card" style="animation: fadeIn 0.12s both">
      <p class="kicker" style="animation: track 0.9s cubic-bezier(.2,.8,.2,1) 0.1s both">${kicker}</p>
      <h1 class="logo" style="animation: punch 0.3s cubic-bezier(.15,.9,.25,1) both, sweep 2.4s cubic-bezier(.3,.1,.2,1) 0.15s both">Farseek</h1>
      <p class="tagline" style="animation: fadeIn 0.5s 0.6s both">${tagline}</p>
      <p class="play" style="animation: fadeIn 0.5s 1.6s both">${play}</p>
      <p class="url" style="animation: fadeIn 0.5s 1.8s both">${url}</p>
    </div>`;
}

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
for (const title of TITLES) {
  const html = { caption, center, card }[title.kind](title);
  await page.setContent(`<style>${style}</style>${html}`, {
    waitUntil: "load",
  });
  await page.evaluate(() => document.fonts.ready);
  const out = `${dir}/${title.id}`;
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const frames = Math.round(title.seconds * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate(
      (ms) => {
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = ms;
        }
      },
      (i * 1000) / FPS,
    );
    await page.screenshot({
      path: `${out}/${String(i).padStart(4, "0")}.png`,
      omitBackground: title.kind !== "card",
    });
  }
  console.log(`${title.id}: ${frames} frames`);
}
await browser.close();
