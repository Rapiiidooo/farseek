// Forces the two loading failures a player can meet and films the screen: the game code itself
// (main.js's path) and a world needed to start a chapter (the UI's path), then retries.
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const base = "http://localhost:3012/";
const out = new URL("./failure/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const result = {};
const look = (page) =>
  page.evaluate(() => {
    const bar = document.querySelector("#loading .bar");
    const fill = bar.querySelector("span").getBoundingClientRect();
    const box = bar.getBoundingClientRect();
    return {
      text: document.querySelector("#load-step").textContent,
      failed: bar.classList.contains("failed"),
      fraction: +((fill.right - box.left) / box.width).toFixed(3),
      retry: !document.querySelector("#load-actions").hidden,
      overlay: !document.querySelector("#loading").hidden,
      ready: window.__READY__ === true,
      mode: window.__GAME__?.mode ?? null,
    };
  });
try {
  for (const [name, blocked, query] of [
    ["code", /\/app\/bootstrap\.js/, ""],
    ["world", /\/worlds\/isles\/index\.js/, "?chapter=isles&nolock=1"],
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    let block = true;
    await page.setRequestInterception(true);
    page.on("request", (request) =>
      block && blocked.test(request.url())
        ? request.abort()
        : request.continue(),
    );
    await page.goto(base + query, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => !document.querySelector("#load-actions").hidden,
      { timeout: 60000 },
    );
    await new Promise((r) => setTimeout(r, 600));
    const failed = await look(page);
    await page.screenshot({ path: `${out}${name}-failed.png` });
    block = false;
    await page.click("#load-retry");
    await page.waitForFunction(
      () =>
        window.__READY__ === true && document.querySelector("#loading").hidden,
      { timeout: 120000 },
    );
    const recovered = await look(page);
    await page.screenshot({ path: `${out}${name}-recovered.png` });
    result[name] = { failed, recovered };
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(out + "result.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
