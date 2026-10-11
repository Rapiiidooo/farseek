// Writes the provenance section of the translated takes for game/audio/NOTICE.txt from the
// downloads and scripts, so every file id and line is copied rather than typed.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const NAMES = { fr: "French", es: "Spanish", zh: "Mandarin Chinese", hi: "Hindi" };
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const blocks = [
  "Farseek Mira's voice in French, Spanish, Chinese and Hindi",
  "",
  "Each language's 37 lines were generated through Atlas with ElevenLabs Text to Speech, model Eleven v3, with the catalog voice and settings of the English lines (Nikki; stability 0.5, similarity 0.75, normal speed), from the game's own translated subtitles. Processing is the same as for the English lines.",
];
const cloned = async (id) =>
  existsSync(new URL(`clone/${id}/chosen.json`, import.meta.url))
    ? read(`clone/${id}/chosen.json`)
    : null;
const french = await cloned("fr");
if (french)
  blocks.push(
    "",
    `The ${french.takes.length} French lines whose Atlas takes carried a Canadian accent were then regenerated locally with ${french.model}, weights ${french.weights}, ${french.license} license, cloning the same voice from four of its France-accented French takes (${french.refs["recorded.wav"].join(" and ")} for recorded lines, ${french.refs["live.wav"].join(" and ")} for live ones). They carry the model's inaudible Perth watermark, and a lookahead limiter holds their peaks at the shared loudness.`,
  );
for (const id of ["fr", "es", "zh", "hi"]) {
  const { pid } = await read(`atlas/${id}/project.json`);
  const { files } = await read(`atlas/${id}/downloads.json`);
  const clones = new Map(((await cloned(id))?.takes ?? []).map((take) => [take.clip, take]));
  const script = Object.fromEntries(
    (await read(`script-${id}.json`)).map((line) => [line.clip, line.text]),
  );
  blocks.push(
    "",
    `${NAMES[id]}: Atlas project ${pid}`,
    ...files.map((file) => {
      const clone = clones.get(file.label);
      const source = clone ? `local clone, seed ${clone.seed}, reference ${clone.ref}` : file.fid;
      return `voice/${id}/${file.label}.mp3: ${source}, "${script[file.label]}"`;
    }),
  );
}
blocks.push(
  "",
  "Exact prompts, node reports, downloads, transcripts and processing: receipts/verification-languages/voices/. Provider terms govern generated output; no separate CC0 or public-domain license is asserted.",
);
console.log(blocks.join("\n"));
