// Lists in index.html every module the title needs, so the browser fetches them together
// instead of discovering them one import at a time; `--check` fails when the list is stale.
//   node scripts/boot-preload.mjs [--check]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeAsset } from "../game/asset-catalog.js";

const root = fileURLToPath(new URL("../game/", import.meta.url));
const page = path.join(root, "index.html");
const START =
  "<!-- The title's modules, written by scripts/boot-preload.mjs. -->";
const END = "<!-- End of the title's modules. -->";

// Imported while the title loads beyond main.js's own imports: the game, the explorer, the
// shadow cascades and composer passes the court's rig loads, and what the court's assets import.
// The court's build preloads those assets itself (`AssetStore.preload`).
const ENTRIES = [
  "main.js",
  "app/bootstrap.js",
  path.relative(root, fileURLToPath(runtimeAsset("hero_explorer").path)),
  "vendor/csm/CSM.js",
  "vendor/postprocessing/EffectComposer.js",
  "vendor/postprocessing/RenderPass.js",
  "vendor/postprocessing/OutputPass.js",
  "architecture-detail.js",
  "nature-detail.js",
  "props-detail.js",
];

const html = () => readFileSync(page, "utf8");
const map = {};
for (const [, key, value] of html()
  .match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]
  .matchAll(/"([^"]+)"\s*:\s*"(\.\/[^"]+)"/g))
  map[key] = value.slice(2);

function resolve(from, spec) {
  if (map[spec]) return map[spec];
  for (const [key, value] of Object.entries(map))
    if (key.endsWith("/") && spec.startsWith(key))
      return value + spec.slice(key.length);
  if (!spec.startsWith(".")) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
}

// Static imports only: `import ... from`, `export ... from` and bare `import "..."`.
const STATIC =
  /(?:^|[;\n}])\s*(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"']+)["']/g;

function titleModules() {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const full = path.join(root, file);
    if (!existsSync(full)) throw new Error(`${file} is imported but missing`);
    const source = readFileSync(full, "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      "",
    );
    for (const [, spec] of source.matchAll(STATIC)) {
      const target = resolve(file, spec);
      if (target) visit(target);
    }
  };
  ENTRIES.forEach(visit);
  seen.delete("main.js");
  return [...seen].sort();
}

const modules = titleModules();
const current = html();
const at = current.indexOf(START);
const end = current.indexOf(END);
if (at < 0 || end < 0) throw new Error("index.html has no preload markers");
if (process.argv.includes("--check")) {
  const listed = [
    ...current.slice(at, end).matchAll(/href="\.\/([^"]+)"/g),
  ].map(([, file]) => file);
  if (listed.join() !== modules.join()) {
    const missing = modules.filter((file) => !listed.includes(file));
    const stale = listed.filter((file) => !modules.includes(file));
    console.error(
      `index.html's title modules are stale (missing ${missing.join(", ") || "none"}, extra ${stale.join(", ") || "none"}): run node scripts/boot-preload.mjs`,
    );
    process.exit(1);
  }
  console.log(`${modules.length} title modules preloaded`);
} else {
  const indent = current.slice(current.lastIndexOf("\n", at) + 1, at);
  const block = [
    START,
    ...modules.map((file) => `<link rel="modulepreload" href="./${file}" />`),
    END,
  ].join(`\n${indent}`);
  writeFileSync(
    page,
    current.slice(0, at) + block + current.slice(end + END.length),
  );
  execFileSync("npm", ["run", "format", "--", page], { stdio: "ignore" });
  console.log(`${modules.length} title modules written to index.html`);
}
