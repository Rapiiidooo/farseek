// Loads the page in Chrome, lists the icon files it requests, then saves the bitmaps Chrome's
// favicon store keeps for the page's tab on 1x and 2x screens.
//   node receipts/verification-favicon/tab-probe.mjs <outDir> [url] [deviceScale]
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";

const [out, url = "http://localhost:3007/?nolock=1", scale = "1"] =
  process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--force-color-profile=srgb", `--force-device-scale-factor=${scale}`],
});
try {
  const page = await browser.newPage();
  const requested = [];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/favicon|touch-icon/.test(path)) requested.push(path);
    if (path === "/__load-error") request.abort();
    else request.continue();
  });
  await page.goto(url, { waitUntil: "load" });
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const store = await browser.newPage();
  const stored = {};
  for (const factor of ["1x", "2x"]) {
    const response = await store.goto(
      `chrome://favicon/size/16@${factor}/${url}`,
    );
    const bytes = await response.buffer();
    writeFileSync(`${out}/stored-${factor}.png`, bytes);
    stored[factor] = `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
  }
  const report = {
    url,
    deviceScale: Number(scale),
    chrome: await browser.version(),
    requested,
    stored,
  };
  writeFileSync(
    `${out}/probe-scale-${scale}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
