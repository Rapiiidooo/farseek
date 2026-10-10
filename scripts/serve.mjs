import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { ASSET_CATALOG } from "../game/asset-catalog.js";
import { recordLoadFailure } from "./load-diagnostics.mjs";

const compress = promisify(gzip);

const root = path.resolve("game");
const port = Number(process.env.PORT || 3002);
const labAssets = new Set(ASSET_CATALOG.map((entry) => entry.id));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === "/__load-error") {
      await recordLoadFailure(req, res, server.address().port);
      return;
    }
    const labItem = /^\/labs\/([^/]+)\/?$/.exec(pathname);
    const lab = pathname === "/labs" || (labItem && labAssets.has(labItem[1]));
    if (pathname === "/character.html" || pathname === "/labs/") {
      res.writeHead(308, {
        Location: `/labs${url.search}`,
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }
    const file = path.resolve(
      root,
      "." +
        (pathname === "/" ? "/index.html" : lab ? "/character.html" : pathname),
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(file);
    const acceptsGzip = req.headers["accept-encoding"]
      ?.split(",")
      .some((value) => {
        const [encoding, ...parameters] = value.trim().toLowerCase().split(";");
        const quality = parameters.find((parameter) =>
          parameter.trim().startsWith("q="),
        );
        return (
          encoding.trim() === "gzip" &&
          (!quality || Number(quality.trim().slice(2)) > 0)
        );
      });
    const encoded =
      acceptsGzip &&
      body.length > 1024 &&
      /\.(html|js|css|json|svg|txt)$/.test(file);
    const payload = encoded ? await compress(body) : body;
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      Vary: "Accept-Encoding",
      "Content-Length": payload.length,
      ...(encoded ? { "Content-Encoding": "gzip" } : {}),
    });
    res.end(payload);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Farseek: http://localhost:${server.address().port}`),
);
