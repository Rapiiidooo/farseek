import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [out, ...shots] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
for (const spec of shots) {
  const [name, query] = spec.split("|");
  await page.goto(`http://localhost:3002/?nolock=1&${query}`, {
    waitUntil: "load",
  });
  await page.waitForFunction(
    () => window.__READY__ === true && window.__GAME__?.mode === "play",
    { timeout: 180000 },
  );
  await page.addStyleTag({
    content:
      "#hud,#touch,#chapter-card,#subtitle,#local-tools{display:none!important}",
  });
  await sleep(3500);
  await page.screenshot({
    path: `${out}-${name}.jpg`,
    type: "jpeg",
    quality: 88,
  });
  console.log(
    name,
    JSON.stringify(
      await page.evaluate(() => ({
        pos: window.__GAME__.pos,
        feet: window.__GAME__.feet,
        state: window.__GAME__.state,
      })),
    ),
  );
}
await browser.close();
