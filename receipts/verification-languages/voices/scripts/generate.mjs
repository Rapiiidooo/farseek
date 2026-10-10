// Generates Mira's lines in one language through Atlas, with the voice, model and settings of
// the English takes: one project per language, the scene lines and the vault lines as two sets.
//   node outputs/voice-l10n/atlas/generate.mjs <fr|es|zh|hi>
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { session } from "./mcp.mjs";

const id = process.argv[2];
const LANGUAGE = { fr: "French", es: "Spanish", zh: "Mandarin Chinese", hi: "Hindi" }[id];
if (!LANGUAGE) throw new Error("usage: generate.mjs <fr|es|zh|hi>");
const here = (path) => new URL(path, import.meta.url);
const out = here(`${id}/`);
await mkdir(out, { recursive: true });
const script = JSON.parse(
  await readFile(new URL(`../script-${id}.json`, import.meta.url), "utf8"),
);
const sets = [
  ["scenes", script.filter((line) => !line.clip.startsWith("vault-"))],
  ["vault", script.filter((line) => line.clip.startsWith("vault-"))],
];
const s = await session();
const save = async (name, value) =>
  writeFile(new URL(name, out), JSON.stringify(value, null, 2) + "\n");
const text = (result) => {
  const body = result?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
};

let pid;
try {
  pid = JSON.parse(await readFile(new URL("project.json", out), "utf8")).pid;
} catch {
  const created = text(
    await s.call("create_project", {
      name: `Farseek Mira voice ${id.toUpperCase()}`,
      description: `Mira's spoken lines in ${LANGUAGE} for the browser adventure Farseek: the same warm adult female voice as the English set, plain and human delivery, no music or effects. Used in game with subtitles.`,
    }),
  );
  pid = created.pid;
  if (!pid) throw new Error(`project not created: ${JSON.stringify(created)}`);
  await save("project.json", { pid, created });
  // Its takes are listed for download only once the workspace may read the project.
  await s.call("set_project_team_access", { pid, access_level: "workspace_read" });
}

for (const [name, lines] of sets) {
  const prompt = `Build and run a voice-over set for one game character in this project. Create a frame named "Mira ${id.toUpperCase()} ${name}" holding exactly ${lines.length} independent text to speech nodes, one per line below, each labeled with its id. Use the same backend, model, voice and settings on every node: ElevenLabs text to speech, the model ElevenLabs Eleven v3, the stock catalog voice "Narration :: Warm & Inviting :: Pleasant :: Nikki (F)" (Warm, Measured, and Clear), stability 0.5, similarity 0.75, style exaggeration low or default, speaker boost on, normal speed, mp3 output at 44.1 kHz. The lines are in ${LANGUAGE}: if the node has a language setting, set it to ${LANGUAGE} (${id}); otherwise leave it automatic. It is the same character who speaks English elsewhere in the game, so keep this one voice on every node and let it speak natural, fluent ${LANGUAGE}. Speak exactly the quoted text, with no added words, tags or sound effects; the delivery notes in parentheses are guidance only and must not be spoken. Run every node, then report a table with the columns Label | Node ID | Status | Error | Output fid, one row per line, the label in bold (for example | **radio-1** | ... |) and the fid in backticks.

Lines:
${lines.map((line) => `${line.clip} (${line.delivery}): "${line.text}"`).join("\n")}`;
  const args = { pid, budget_credits: 1500, prompt };
  await save(`args-${name}.json`, args);
  const started = Date.now();
  const result = await s.call("prompt_project_agent", args, 1800);
  await save(`generate-${name}.json`, {
    seconds: (Date.now() - started) / 1000,
    result,
  });
  console.log(`${id} ${name}: ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
