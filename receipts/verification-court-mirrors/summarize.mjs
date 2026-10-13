// Averages the measure runs per label and tier and prints a Markdown table.
//   node receipts/verification-court-mirrors/summarize.mjs
import { readdir, readFile, writeFile } from "node:fs/promises";

const dir = new URL("measure/", import.meta.url);
const runs = {};
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(await readFile(new URL(file, dir), "utf8"));
  const label = data.label.replace(/-\d+$/, "");
  (runs[label] ??= []).push(data);
}
const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;
const summary = {};
for (const [label, list] of Object.entries(runs))
  for (const tier of ["high", "balanced", "fast"]) {
    const tiers = list.map((run) => run.tiers[tier]);
    const pick = (key, stat) =>
      +mean(tiers.map((t) => t[key][stat])).toFixed(2);
    const renders = {};
    for (const t of tiers)
      for (const [count, frames] of Object.entries(t.reflections.perFrame))
        renders[count] = (renders[count] ?? 0) + frames;
    const total = Object.values(renders).reduce((s, v) => s + v, 0);
    (summary[tier] ??= {})[label] = {
      runs: tiers.length,
      frames: tiers.reduce((s, t) => s + t.frames, 0),
      interval: [pick("interval", "median"), pick("interval", "p95")],
      cpu: [pick("cpu", "median"), pick("cpu", "p95")],
      gpu: [pick("gpu", "median"), pick("gpu", "p95")],
      mirrorGpu: [pick("gpuMirrors", "median"), pick("gpuMirrors", "p95")],
      calls: [pick("calls", "median"), pick("calls", "p95")],
      reflections: Object.fromEntries(
        Object.entries(renders).map(([count, frames]) => [
          count,
          +((frames / total) * 100).toFixed(1),
        ]),
      ),
      meanReflections: +(
        Object.entries(renders).reduce((s, [c, f]) => s + c * f, 0) / total
      ).toFixed(2),
      programs: [...new Set(tiers.map((t) => t.programs))],
    };
  }
const rows = [
  "| Tier | Build | Frame interval ms | Court render CPU ms | GPU ms | Mirror GPU ms | Draw calls | Reflection renders per frame |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
];
const pair = ([median, p95]) => `${median} / ${p95}`;
for (const [tier, labels] of Object.entries(summary))
  for (const [label, s] of Object.entries(labels))
    rows.push(
      `| ${tier} | ${label} | ${pair(s.interval)} | ${pair(s.cpu)} | ${pair(s.gpu)} | ${pair(s.mirrorGpu)} | ${pair(s.calls)} | ${Object.entries(
        s.reflections,
      )
        .map(([count, share]) => `${count}: ${share}%`)
        .join(", ")} (mean ${s.meanReflections}) |`,
    );
console.log(rows.join("\n"));
await writeFile(
  new URL("summary.json", import.meta.url),
  JSON.stringify(summary, null, 2) + "\n",
);
