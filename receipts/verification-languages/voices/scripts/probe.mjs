// Asks the project agent a read-only question under a tiny credit cap, to tell an expired
// workspace apart from a credit hold the balance cannot cover.
//   node outputs/voice-l10n/atlas/probe.mjs <fr|es|zh|hi> <budget>
import { readFile, writeFile } from "node:fs/promises";
import { session } from "./mcp.mjs";

const [id, budget] = process.argv.slice(2);
const { pid } = JSON.parse(await readFile(new URL(`${id}/project.json`, import.meta.url), "utf8"));
const args = {
  pid,
  budget_credits: Number(budget),
  prompt: "Do not create, modify or run anything. Reply only with the names of the frames in this project.",
};
const s = await session();
const started = Date.now();
const result = await s.call("prompt_project_agent", args, 600);
const seconds = (Date.now() - started) / 1000;
await writeFile(
  new URL(`${id}/probe-${started}.json`, import.meta.url),
  JSON.stringify({ args, seconds, result }, null, 2) + "\n",
);
const sc = result?.structuredContent ?? {};
console.log(`${seconds.toFixed(0)} s, cost ${sc.cost_credits ?? "?"}, error ${result?.isError ? result.content?.[0]?.text : "none"}`);
console.log((sc.response_text ?? "").slice(0, 400));
