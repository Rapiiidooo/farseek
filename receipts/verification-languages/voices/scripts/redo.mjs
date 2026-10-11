// Generates fresh candidate takes of chosen lines in a new frame, several per line, with the voice,
// model and settings of the first set, then downloads them so the best accent can be kept.
//   node outputs/voice-l10n/atlas/redo.mjs <fr|es|zh|hi> <round> <takes> <label,...> [budget]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { authorization, session } from "./mcp.mjs";

const [id, round, takes, only, budget = "1500"] = process.argv.slice(2);
const LANGUAGE = { fr: "French", es: "Spanish", zh: "Mandarin Chinese", hi: "Hindi" }[id];
if (!LANGUAGE || !round || !(Number(takes) > 0) || !only || !(Number(budget) > 0))
  throw new Error("usage: redo.mjs <fr|es|zh|hi> <round> <takes> <label,...> [budget]");
const here = (path) => new URL(`${id}/${path}`, import.meta.url);
const script = JSON.parse(
  await readFile(new URL(`../script-${id}.json`, import.meta.url), "utf8"),
);
const wanted = only.split(",");
const lines = script.filter((line) => wanted.includes(line.clip));
assert.equal(lines.length, wanted.length, "unknown label");
const nodes = lines.flatMap((line) =>
  Array.from({ length: Number(takes) }, (_, k) => ({ ...line, label: `${line.clip}-t${k + 1}` })),
);
const { pid } = JSON.parse(await readFile(here("project.json"), "utf8"));
const frame = `Mira ${id.toUpperCase()} redo ${round}`;
const prompt = `Create a new frame named "${frame}" in this project holding exactly ${nodes.length} independent text to speech nodes, one per labeled line below, each labeled with its label. Several labels share the same text on purpose: each is a separate take, so run each node on its own and never reuse another node's output. Use the same backend, model, voice and settings on every node, as on the frames "Mira ${id.toUpperCase()} scenes" and "Mira ${id.toUpperCase()} vault": ElevenLabs text to speech, the model ElevenLabs Eleven v3, the stock catalog voice "Narration :: Warm & Inviting :: Pleasant :: Nikki (F)", stability 0.5, similarity 0.75, style exaggeration low or default, speaker boost on, normal speed, mp3 output at 44.1 kHz, language ${LANGUAGE} (${id}) if the node has a language setting. Speak exactly the quoted text, with no added words, tags or sound effects; the delivery notes in parentheses are guidance only and must not be spoken. Every take must be a fresh synthesis, never a cached copy of an earlier output with the same text: run each node with the output cache bypassed, and if the node has a seed setting give each node a different seed. Leave the other frames and their nodes untouched. Run every node, then report a table with the columns Label | Node ID | Status | Error | Output fid | Cached, one row per label, the label in bold (for example | **${nodes[0].label}** | ... |), the fid in backticks and Cached saying yes or no.

Lines:
${nodes.map((line) => `${line.label} (${line.delivery}): "${line.text}"`).join("\n")}`;
const args = { pid, budget_credits: Number(budget), prompt };
const out = here(`redo-${round}/`);
await mkdir(out, { recursive: true });
await writeFile(new URL("args.json", out), JSON.stringify(args, null, 2) + "\n");
const s = await session();
const started = Date.now();
const result = await s.call("prompt_project_agent", args, 1800);
await writeFile(
  new URL("report.json", out),
  JSON.stringify({ seconds: (Date.now() - started) / 1000, result }, null, 2) + "\n",
);
const sc = result?.structuredContent ?? {};
console.log(
  `${frame}: ${((Date.now() - started) / 1000).toFixed(0)} s, ${sc.cost_credits ?? "?"} credits, exhausted ${sc.budget_exhausted ?? "?"}`,
);

const table = sc.response_text ?? result?.content?.[0]?.text ?? "";
const fids = new Map();
for (const [, label, fid] of table.matchAll(
  /\|\s*\*\*([a-z0-9-]+-t\d+)\*\*\s*\|[^\n]*?`([0-9a-f-]{36})`/g,
))
  fids.set(label, fid);
const auth = await authorization();
const files = [];
const missing = [];
for (const { label } of nodes) {
  const fid = fids.get(label);
  const one = fid && (await s.call("get_workspace_asset", { fid }));
  const asset = one?.structuredContent?.asset;
  if (!asset) {
    missing.push(label);
    continue;
  }
  const url = new URL(asset.download.url);
  assert.equal(url.origin, "https://api.prod-market.atlas.design");
  const response = await fetch(url, { headers: { Authorization: auth }, redirect: "error" });
  assert.equal(response.status, 200, `${label} HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, asset.size_bytes);
  await writeFile(new URL(`${label}.mp3`, out), bytes);
  files.push({
    label,
    fid,
    description: asset.description,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(new URL("downloads.json", out), JSON.stringify({ files, missing }, null, 2) + "\n");
console.log(`${files.length} takes downloaded, missing ${missing.join(", ") || "none"}`);
const { files: originals } = JSON.parse(await readFile(here("downloads.json"), "utf8"));
const seen = new Map(originals.map((file) => [file.sha256, `original ${file.label}`]));
for (const file of files) {
  if (seen.has(file.sha256)) console.log(`${file.label} is a copy of ${seen.get(file.sha256)}`);
  else seen.set(file.sha256, file.label);
}
