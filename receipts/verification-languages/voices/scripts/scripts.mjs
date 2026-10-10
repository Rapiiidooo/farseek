// Builds each language's voice script from the English scripts and the translation tables:
// clip id, text to speak (the subtitle), delivery note, and the longest the clip may last.
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url).pathname;
const read = async (path) => JSON.parse(await readFile(root + path, "utf8"));
const first = await read("receipts/verification-mira-voice/atlas/script.json");
const vault = await read("receipts/verification-builders-vault/atlas/script.json");
const english = Object.fromEntries(
  (await readFile(new URL("./english-durations.txt", import.meta.url), "utf8"))
    .trim()
    .split("\n")
    .map((row) => row.split(" "))
    .map(([id, seconds]) => [id, Number(seconds)]),
);

// Cue times of the scenes that run on a timetable (mira-scenes.js, starward.js,
// vault-memory.js), each ending where the next line or the scene's own end begins.
const SCENES = [
  [["radio-1", 0.9], ["radio-2", 5.4], ["radio-3", 11.4], ["radio-4", 16], ["end", 22.6]],
  [["camp-1", 0.9], ["camp-2", 7.4], ["camp-3", 13.8], ["end", 19.8]],
  [["ice-1", 0.8], ["ice-2", 5.2], ["end", 11]],
  [["castle-1", 0.9], ["castle-2", 6.9], ["castle-3", 13.2], ["end", 18.3]],
  [["reunion-1", 9], ["reunion-2", 11.2], ["reunion-3", 16.2], ["reunion-4", 21.4], ["end", 28]],
  [["vault-reveal-address", 0.4], ["masks", 5], ["vault-reveal-fate", 9.6], ["vault-reveal-doors", 17], ["us", 22.6], ["vault-reveal-next", 27.4], ["end", 33]],
];
const slots = {};
for (const scene of SCENES)
  for (let i = 0; i < scene.length - 1; i++) {
    const [id, at] = scene[i];
    const room = scene[i + 1][1] - at - 0.25;
    if (id === "reunion-3") slots["reunion-3a"] = slots["reunion-3b"] = room;
    else slots[id] = room;
  }

const lines = [
  ...first.lines.map((l) => ({ clip: l.id, text: l.text, delivery: l.delivery })),
  ...vault.lines.map((l) => ({ clip: l.clip, text: l.text, delivery: l.delivery })),
];
for (const id of ["fr", "es", "zh", "hi"]) {
  const table = (await import(`${root}game/i18n/${id}.js`)).default;
  const script = lines.map((line) => {
    const text = table[line.text];
    if (!text) throw new Error(`${id}: no translation for ${line.clip}`);
    // Lines spoken when the player gets somewhere may run a little past the English take.
    const slot = slots[line.clip] ?? +(english[line.clip] * 1.3).toFixed(2);
    return { ...line, english: line.text, text, englishSeconds: english[line.clip], slot };
  });
  await writeFile(
    new URL(`./script-${id}.json`, import.meta.url),
    JSON.stringify(script, null, 2) + "\n",
  );
  console.log(id, script.length, "lines");
}
