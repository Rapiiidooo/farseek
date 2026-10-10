// Asks one language's project agent to finish its sets: create any missing node, run every node
// without an output, and report every label's fid. Optional labels limit it to those lines.
//   node outputs/voice-l10n/atlas/continue.mjs <fr|es|zh|hi> <scenes|vault> [label,...]
import { readFile, writeFile } from "node:fs/promises";
import { session } from "./mcp.mjs";

const [id, set, only] = process.argv.slice(2);
const LANGUAGE = { fr: "French", es: "Spanish", zh: "Mandarin Chinese", hi: "Hindi" }[id];
const here = (path) => new URL(`${id}/${path}`, import.meta.url);
const script = JSON.parse(
  await readFile(new URL(`../script-${id}.json`, import.meta.url), "utf8"),
);
const lines = script
  .filter((line) => line.clip.startsWith("vault-") === (set === "vault"))
  .filter((line) => !only || only.split(",").includes(line.clip));
const { pid } = JSON.parse(await readFile(here("project.json"), "utf8"));
const frame = `Mira ${id.toUpperCase()} ${set}`;
const prompt = `In this project the frame "${frame}" should hold one ElevenLabs text to speech node per line below, labeled with its id, all with the same settings: the model ElevenLabs Eleven v3, the stock catalog voice "Narration :: Warm & Inviting :: Pleasant :: Nikki (F)", stability 0.5, similarity 0.75, style exaggeration low or default, speaker boost on, normal speed, mp3 at 44.1 kHz, language ${LANGUAGE} (${id}) if the node has a language setting. Create any node that is missing, set each node's text to exactly the quoted ${LANGUAGE} text below (the parentheses are delivery notes, never spoken), ${only ? "and run these nodes again even if they already have an output" : "and run every node that has no output yet; leave nodes that already have an output as they are"}. Then report a table with the columns Label | Node ID | Status | Error | Output fid, one row for every line below, the label in bold (for example | **radio-1** | ... |) and the output fid in backticks.

Lines:
${lines.map((line) => `${line.clip} (${line.delivery}): "${line.text}"`).join("\n")}`;
const args = { pid, budget_credits: 1500, prompt };
const name = `continue-${set}-${Date.now()}.json`;
const s = await session();
const started = Date.now();
const result = await s.call("prompt_project_agent", args, 1800);
await writeFile(
  here(name),
  JSON.stringify({ arguments: args, seconds: (Date.now() - started) / 1000, result }, null, 2) + "\n",
);
const sc = result?.structuredContent ?? {};
console.log(
  `${id} ${set}: ${((Date.now() - started) / 1000).toFixed(0)} s, ${sc.cost_credits ?? "?"} credits, exhausted ${sc.budget_exhausted ?? "?"}`,
);
