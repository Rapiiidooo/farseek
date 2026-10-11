// Picks one candidate take per line: France on both Voxlect models (Canada under 0.1) and the script heard
// in the right language; then the cleanest transcript, the line's slot, any Canada signal and the France score.
// Lines listed as unspellable (an invented name alone) skip the transcript test.
//   node outputs/voice-l10n/choose.mjs <fr|es|zh|hi> <out.json> <small.json> <large.json> <heard.json> [unspellable,...]
import { readFile, writeFile } from "node:fs/promises";

const [id, out, ...inputs] = process.argv.slice(2);
const unspellable = new Set(inputs[3]?.split(",") ?? []);
const [small, large, heard] = await Promise.all(
  inputs.slice(0, 3).map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);
const byFile = (rows) => new Map(rows.map((row) => [row.file, row]));
const s = byFile(small.results);
const l = byFile(large.results);
const slots = new Map(
  JSON.parse(await readFile(new URL(`script-${id}.json`, import.meta.url), "utf8")).map((line) => [line.clip, line.slot]),
);
const lines = new Map();
for (const h of heard) {
  const a = s.get(h.file);
  const b = l.get(h.file);
  const take = {
    file: h.file,
    canada: Math.max(a.Canada, b.Canada),
    france: (a.France + b.France) / 2,
    small: a,
    large: b,
    heard: h,
    ok: a.Canada < 0.1 && b.Canada < 0.1 && (unspellable.has(h.clip) || (h.match >= 0.85 && h.detected === id)),
    clean: unspellable.has(h.clip) || h.match >= 0.95,
    fits: h.seconds <= slots.get(h.clip) + 0.5,
  };
  if (!lines.has(h.clip)) lines.set(h.clip, []);
  lines.get(h.clip).push(take);
}
const choices = [];
for (const [clip, takes] of lines) {
  const signal = (take) => (take.canada < 0.05 ? 0 : take.canada);
  takes.sort(
    (x, y) =>
      y.ok - x.ok || y.clean - x.clean || y.fits - x.fits || signal(x) - signal(y) || y.france - x.france,
  );
  const pick = takes.find((take) => take.ok) ?? null;
  choices.push({ clip, pick: pick?.file ?? null, unspellable: unspellable.has(clip), takes });
  for (const take of takes)
    console.log(
      `${take === pick ? "*" : " "} ${take.file.split("/").pop().padEnd(28)} Canada ${take.small.Canada.toFixed(3)} / ${take.large.Canada.toFixed(3)}  France ${take.small.France.toFixed(3)} / ${take.large.France.toFixed(3)}  match ${take.heard.match.toFixed(2)} ${take.heard.detected}  ${take.heard.seconds.toFixed(1)}/${slots.get(clip).toFixed(1)} s`,
    );
  if (!pick) console.log(`  ${clip}: no take passes`);
}
await writeFile(out, JSON.stringify(choices, null, 2) + "\n");
console.log(`${choices.filter((c) => c.pick).length} of ${choices.length} lines have a France take`);
