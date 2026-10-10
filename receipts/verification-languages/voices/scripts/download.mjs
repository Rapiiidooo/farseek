// Downloads one language's generated takes, matched to their labels by the agent's report
// tables, through the authorized header loader (the header stays in memory).
//   node outputs/voice-l10n/atlas/download.mjs <fr|es|zh|hi>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { authorization, session } from "./mcp.mjs";

const id = process.argv[2];
const here = (path) => new URL(`${id}/${path}`, import.meta.url);
const script = JSON.parse(
  await readFile(new URL(`../script-${id}.json`, import.meta.url), "utf8"),
);
const wanted = new Set(script.map((line) => line.clip));
// Later reports win: a rerun of a line replaces its earlier take.
const labels = new Map();
const reports = (await readdir(here(""))).filter((name) =>
  /^(generate|continue)-.*\.json$/.test(name),
);
reports.sort(
  (a, b) => (a.startsWith("generate") ? 0 : 1) - (b.startsWith("generate") ? 0 : 1) || a.localeCompare(b),
);
for (const name of reports) {
  const report = JSON.parse(await readFile(here(name), "utf8"));
  const result = report.result;
  const table =
    result?.structuredContent?.response_text ?? result?.content?.[0]?.text ?? "";
  for (const [, label, fid] of table.matchAll(
    /\|\s*\*\*([a-z0-9-]+)\*\*\s*\|[^\n]*?`([0-9a-f-]{36})`/g,
  ))
    if (wanted.has(label)) labels.set(label, fid);
}
const { pid } = JSON.parse(await readFile(here("project.json"), "utf8"));
const s = await session();
const items = new Map();
let cursor = null;
do {
  const listed = await s.call("list_workspace_assets", {
    media_type: "audio",
    project_pid: pid,
    origin: "generated",
    ...(cursor ? { cursor } : {}),
  });
  const page = listed.structuredContent ?? {};
  for (const item of page.items ?? []) items.set(item.fid, item);
  cursor = page.has_more ? page.next_cursor : null;
} while (cursor);
const auth = await authorization();
await mkdir(here("originals/"), { recursive: true });
const files = [];
const missing = [];
for (const label of wanted) {
  const fid = labels.get(label);
  // The listing pages by date and can stop short; a take it misses is fetched by its fid.
  if (fid && !items.has(fid)) {
    const one = await s.call("get_workspace_asset", { fid });
    if (one?.structuredContent?.asset) items.set(fid, one.structuredContent.asset);
  }
  const asset = fid && items.get(fid);
  if (!asset) {
    missing.push(label);
    continue;
  }
  const url = new URL(asset.download.url);
  assert.equal(url.origin, "https://api.prod-market.atlas.design");
  const response = await fetch(url, {
    headers: { Authorization: auth },
    redirect: "error",
  });
  assert.equal(response.status, 200, `${label} HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, asset.size_bytes);
  await writeFile(here(`originals/${label}.mp3`), bytes);
  files.push({
    label,
    fid,
    description: asset.description,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
files.sort((a, b) => a.label.localeCompare(b.label));
await writeFile(
  here("downloads.json"),
  JSON.stringify({ files, missing }, null, 2) + "\n",
);
console.log(`${id}: ${files.length} downloaded, missing ${missing.join(", ") || "none"}`);
