// Generates one language's lines with a native catalog voice of that language, in new frames,
// to compare with the takes in the English voice.
//   node outputs/voice-l10n/atlas/native.mjs <zh|hi|fr|es> <scenes|vault>
import { readFile, writeFile } from "node:fs/promises";
import { session } from "./mcp.mjs";

const [id, set] = process.argv.slice(2);
const LANGUAGE = { fr: "French", es: "Spanish", zh: "Mandarin Chinese", hi: "Hindi" }[id];
const here = (path) => new URL(`${id}/${path}`, import.meta.url);
const script = JSON.parse(await readFile(new URL(`../script-${id}.json`, import.meta.url), "utf8"));
const lines = script.filter((line) => line.clip.startsWith("vault-") === (set === "vault"));
const { pid } = JSON.parse(await readFile(here("project.json"), "utf8"));
const prompt = `In this project, create a new frame named "Mira ${id.toUpperCase()} native ${set}" holding exactly ${lines.length} independent ElevenLabs text to speech nodes, one per line below, each labeled with its id followed by "-native" (for example radio-1-native). Leave every other frame and node untouched. Use one stock catalog voice for all of them, chosen as a native ${LANGUAGE} speaker: a woman in her thirties, warm, calm, clear and grounded, standard accent, never breathy or theatrical. Use the model ElevenLabs Eleven v3, stability 0.5, similarity 0.75, style exaggeration low or default, speaker boost on, normal speed, mp3 at 44.1 kHz, language ${LANGUAGE} (${id}) if the node has a language setting. Speak exactly the quoted text, with no added words, tags or sound effects; the parentheses are delivery notes, never spoken. Run every node, then report the chosen voice's name and description, and a table with the columns Label | Node ID | Status | Error | Output fid, one row per line, the label without the "-native" suffix in bold (for example | **radio-1** | ... |) and the output fid in backticks.

Lines:
${lines.map((line) => `${line.clip} (${line.delivery}): "${line.text}"`).join("\n")}`;
const args = { pid, budget_credits: 1500, prompt };
const s = await session();
const started = Date.now();
const result = await s.call("prompt_project_agent", args, 1800);
await writeFile(
  here(`native-${set}-${Date.now()}.json`),
  JSON.stringify({ arguments: args, seconds: (Date.now() - started) / 1000, result }, null, 2) + "\n",
);
const sc = result?.structuredContent ?? {};
console.log(`${id} native ${set}: ${((Date.now() - started) / 1000).toFixed(0)} s, ${sc.cost_credits ?? "?"} credits, ${result?.isError ? "error" : "ok"}`);
