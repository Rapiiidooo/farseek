// Puts each line's chosen clone in place of its Atlas take: the clone's WAV becomes the line's
// original, the Atlas mp3 moves to replaced/, and chosen.json records what the notice cites.
//   node outputs/voice-l10n/clone/install.mjs <fr> <choices.json> <model-revision>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const [id, choicesPath, revision] = process.argv.slice(2);
assert.match(revision ?? "", /^[0-9a-f]{40}$/, "usage: install.mjs <fr> <choices.json> <model-revision>");
const atlas = `outputs/voice-l10n/atlas/${id}`;
const choices = JSON.parse(await readFile(choicesPath, "utf8"));
const manifest = JSON.parse(await readFile(`outputs/voice-l10n/clone/${id}/manifest.json`, "utf8"));
await mkdir(`${atlas}/replaced`, { recursive: true });
const takes = [];
for (const { clip, pick } of choices) {
  assert(pick, `${clip} has no chosen take`);
  const row = manifest.find((entry) => entry.file === pick);
  assert(row, `${pick} is not in the manifest`);
  if (existsSync(`${atlas}/originals/${clip}.mp3`))
    await rename(`${atlas}/originals/${clip}.mp3`, `${atlas}/replaced/${clip}.mp3`);
  await copyFile(pick, `${atlas}/originals/${clip}.wav`);
  const bytes = await readFile(pick);
  takes.push({
    clip,
    take: row.take,
    seed: row.seed,
    ref: row.ref,
    cfg: row.cfg,
    exaggeration: row.exaggeration,
    seconds: row.seconds,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  `outputs/voice-l10n/clone/${id}/chosen.json`,
  JSON.stringify(
    {
      model: "Chatterbox Multilingual (chatterbox-tts 0.1.7, ChatterboxMultilingualTTS)",
      weights: `ResembleAI/chatterbox@${revision}`,
      license: "MIT",
      watermark: "Perth implicit watermark, applied by the model",
      refs: { "recorded.wav": ["radio-2", "ice-2"], "live.wav": ["reunion-3b", "reunion-3a"] },
      takes,
    },
    null,
    2,
  ) + "\n",
);
console.log(`${takes.length} clones installed in ${atlas}/originals`);
