// Writes a local listening page: per line the shipped take, the chosen clone and the other clones,
// under two shipped France-accented takes for the timbre.
//   node outputs/voice-l10n/clone/compare.mjs <choices.json> <preview-dir> <out.html>
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [choicesPath, previewDir, outPath] = process.argv.slice(2);
const choices = JSON.parse(await readFile(choicesPath, "utf8"));
const script = new Map(
  JSON.parse(await readFile("outputs/voice-l10n/script-fr.json", "utf8")).map((line) => [line.clip, line]),
);
const from = path.dirname(outPath);
const rel = (file) => path.relative(from, file).split(path.sep).join("/");
const shipped = (clip) => rel(`game/audio/voice/fr/${clip}.mp3`);
const preview = (file) => rel(path.join(previewDir, `${path.basename(file, path.extname(file))}.mp3`));
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const score = (take, unspellable) =>
  `Canada ${take.small.Canada.toFixed(2)} / ${take.large.Canada.toFixed(2)} · France ${take.small.France.toFixed(2)} / ${take.large.France.toFixed(2)} · ${take.heard.seconds.toFixed(1)} s · ${unspellable ? "prénom seul, texte non vérifié" : `texte ${Math.round(take.heard.match * 100)} %`}`;
const player = (label, src, note = "") =>
  `<div class="take"><span>${label}</span><audio controls preload="none" src="${src}"></audio><small>${note}</small></div>`;

const rows = choices.map(({ clip, pick, unspellable, takes }) => {
  const line = script.get(clip);
  const chosen = takes.find((take) => take.file === pick);
  const others = takes.filter((take) => take !== chosen);
  return `<section>
<h2>${clip}</h2>
<p class="text">${escape(line.text)}</p>
<p class="slot">Créneau ${line.slot.toFixed(1)} s · ${escape(line.delivery)}</p>
${player("Actuelle (Atlas)", shipped(clip), "accent canadien")}
${chosen ? player("Clone retenu", preview(chosen.file), score(chosen, unspellable)) : `<p class="none">Aucune prise clonée ne passe les deux modèles.</p>`}
<details><summary>Autres prises clonées (${others.length})</summary>
${others.map((take) => player(path.basename(take.file, path.extname(take.file)), preview(take.file), `${take.ok ? "" : "refusée · "}${score(take, unspellable)}`)).join("\n")}
</details>
</section>`;
});

await writeFile(
  outPath,
  `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Clone de Mira</title>
<style>
  :root { --bg: #f6f3ee; --ink: #1d1a16; --muted: #6b645a; --card: #fffdf9; --line: #e2dbd0; --accent: #a5532a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #15130f; --ink: #efe9df; --muted: #a39a8c; --card: #1e1b16; --line: #332e26; --accent: #e08a5c; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  h2 { font-size: 1rem; margin: 0 0 6px; color: var(--accent); }
  .intro { color: var(--muted); margin: 0 0 20px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 0 0 14px; }
  .text { margin: 0 0 2px; font-size: 1.05rem; }
  .slot { margin: 0 0 10px; color: var(--muted); font-size: 0.85rem; }
  .take { display: grid; grid-template-columns: 9rem 1fr; gap: 2px 12px; align-items: center; margin: 6px 0; }
  .take audio { width: 100%; height: 32px; }
  .take small { grid-column: 2; color: var(--muted); font-size: 0.78rem; }
  details { margin-top: 8px; } summary { cursor: pointer; color: var(--muted); }
  .none { color: var(--accent); }
  @media (max-width: 520px) { .take { grid-template-columns: 1fr; } .take small { grid-column: 1; } }
</style>
</head>
<body>
<main>
<h1>Mira en français, clone local</h1>
<p class="intro">Chatterbox Multilingual (licence MIT) imite la voix de Mira à partir de ses prises à l'accent de France. Pour chaque réplique : la prise actuelle, puis la prise clonée que les deux modèles entendent avec l'accent de France. Scores : petit / grand modèle.</p>
<section>
<h2>Référence de timbre</h2>
<p class="slot">Deux des quatre prises actuelles à l'accent de France qui servent d'exemple au clone.</p>
${player("radio-2", shipped("radio-2"))}
${player("reunion-3b", shipped("reunion-3b"))}
</section>
${rows.join("\n")}
</main>
</body>
</html>
`,
);
console.log(`${outPath}: ${choices.length} lines`);
