// Contact sheets of both hands, before and after, through every scenario of scenarios.js.
//   node receipts/verification-finger-life/capture.mjs <before-root> <after-root> <out-dir> [names...]
// Each root is a checkout holding game/; the before root is the base commit's game/ extracted.
import http from "node:http";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const [beforeRoot, afterRoot, out, ...only] = process.argv.slice(2);
if (!beforeRoot || !afterRoot || !out)
  throw new Error("usage: capture.mjs <before-root> <after-root> <out-dir>");
const here = import.meta.dirname;
const roots = {
  before: path.resolve(beforeRoot),
  after: path.resolve(afterRoot),
};
const TYPES = {
  ".js": "text/javascript",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".html": "text/html",
};
const page = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/after/game/vendor/three.module.js","three/addons/":"/after/game/vendor/"}}</script>
<style>body{margin:0;background:#1b2128}</style></head><body>
<script type="module" src="/capture/capture-page.js"></script>
<script type="module" src="/capture/scenarios.js"></script>
</body></html>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost").pathname;
  try {
    if (url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(page);
    }
    if (url === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    const [, scope, ...rest] = url.split("/");
    const base = scope === "capture" ? here : roots[scope];
    const file = path.resolve(base, rest.join("/"));
    if (!base || !file.startsWith(base + path.sep)) throw new Error(url);
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const report = { roots, scenarios: {}, errors: [] };
try {
  const tab = await browser.newPage();
  tab.on("pageerror", (error) => report.errors.push(error.message));
  tab.on(
    "console",
    (message) =>
      message.type() === "error" && report.errors.push(message.text()),
  );
  await tab.goto(`http://127.0.0.1:${server.address().port}/`, {
    waitUntil: "load",
  });
  await tab.waitForFunction(() => window.READY && window.SCENARIOS, {
    timeout: 60000,
  });
  const names = only.length
    ? only
    : await tab.evaluate(() => Object.keys(window.SCENARIOS));
  for (const name of names) {
    const result = await tab.evaluate(
      (name) => window.CAPTURE.run(window.SCENARIOS[name]),
      name,
    );
    const save = (file, url) =>
      writeFile(path.join(out, file), Buffer.from(url.split(",")[1], "base64"));
    await save(`${name}.jpg`, result.image);
    for (const request of result.closeUps)
      await save(`${name}-${request.name}.jpg`, request.image);
    report.scenarios[name] = {
      sheet: `${name}.jpg`,
      closeUps: result.closeUps.map((r) => `${name}-${r.name}.jpg`),
      samples: result.samples,
    };
    console.log(name, "captured");
  }
} finally {
  await writeFile(
    path.join(out, "capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const child = browser.process();
  await browser.close();
  child?.stdout?.destroy();
  child?.stderr?.destroy();
  server.close();
}
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
