// Renders a design page in headless Chrome and saves it as a PNG.
//   node outputs/da/shot.mjs <page.html> <out.png> [width] [height]
import puppeteer from "puppeteer-core";
import path from "node:path";
const [page, out, width = 1600, height = 560] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--allow-file-access-from-files"],
});
try {
  const tab = await browser.newPage();
  await tab.setViewport({ width: Number(width), height: Number(height), deviceScaleFactor: 1 });
  const errors = [];
  tab.on("pageerror", (e) => errors.push(String(e.message)));
  tab.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await tab.goto(`file://${path.resolve(page)}`, { waitUntil: "load" });
  await tab.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));
  await tab.screenshot({ path: out, omitBackground: page.includes("#clear") });
  console.log(out, errors.length ? errors.join(" | ") : "no errors");
} finally {
  await browser.close();
}
