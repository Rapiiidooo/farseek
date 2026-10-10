// Writes the run's summary page next to report.json; every image path is relative to the run.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const escape = (text) =>
  String(text ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const badge = (ok) =>
  `<span class="badge ${ok ? "pass" : "fail"}">${ok ? "pass" : "fail"}</span>`;

function stepsTable(steps) {
  const rows = steps.map(
    (
      s,
    ) => `<tr><td>${badge(s.status === "pass")}</td><td><b>${escape(s.id)}</b><br><small>${escape(s.title)}</small></td>
      <td class="num">${s.seconds.toFixed(0)} s${s.load ? `<br><small>load ${s.load.join(" to ")}</small>` : ""}</td>
      <td>${s.failures.length ? `<ul>${s.failures.map((f) => `<li>${escape(f)}</li>`).join("")}</ul>` : ""}${s.warnings?.length ? `<small>For review, not failing: ${s.warnings.map(escape).join("; ")}</small><br>` : ""}
      <a href="${escape(s.log)}">log</a></td></tr>`,
  );
  return `<table><thead><tr><th></th><th>Step</th><th class="num">Time</th><th>Findings</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function viewsSection(step) {
  const views = step?.details?.views;
  if (!views?.length) return "";
  const cards = [...views]
    .sort((a, b) => Number(a.passed) - Number(b.passed))
    .map((v) => {
      const img = (suffix) => `views/output/${v.id}.${suffix}.png`;
      if (v.noise)
        return `<figure class="view"><figcaption><b>${escape(v.id)}</b> new baseline · repeat ssim ${v.noise.ssim} · worst tile ${v.noise.tileSsim} · colour ${v.noise.tileDeltaE}</figcaption>
        <img class="single" src="${img("thumb")}" alt="new baseline"></figure>`;
      return `<figure class="view ${v.passed ? "" : "bad"}">
        <figcaption>${badge(v.passed)} <b>${escape(v.id)}</b> ssim ${v.ssim ?? "?"} · worst tile ${v.tileSsim ?? "?"} · colour ${v.tileDeltaE ?? "?"}
        ${v.failed?.length ? `<br>${escape(v.failed.join("; "))}` : ""}</figcaption>
        <div class="trio"><img src="${img("baseline.thumb")}" alt="baseline"><img src="${img("thumb")}" alt="current"><img src="${img("diff.thumb")}" alt="difference"></div>
      </figure>`;
    });
  const intro = views.some((v) => v.noise)
    ? "New baselines with the difference between two separate captures."
    : "Baseline, tonight, difference (dissimilar windows in red, failing tiles framed).";
  const layout = views.every((v) => v.noise) ? "grid" : "";
  return `<h2>Fixed views</h2><p>${intro}</p><div class="${layout}">${cards.join("")}</div>`;
}

function flashSection(steps) {
  const routes = steps.filter((s) => s.flash);
  if (!routes.length) return "";
  const parts = routes.map((s) => {
    const worlds = Object.entries(s.flash.worlds)
      .map(
        ([id, w]) =>
          `<tr><td>${escape(id)}</td><td class="num">${w.frames}</td><td class="num">${w.dtMedian}</td><td class="num">${w.dtP95}</td><td class="num">${w.dtMax}</td><td class="num">${(w.maxZero * 100).toFixed(2)}%</td><td class="num">${w.black}</td><td class="num">${w.cuts ?? ""}</td><td class="num">${w.costMedian ?? ""} / ${w.costP95 ?? ""}</td></tr>`,
      )
      .join("");
    const events = s.flash.events
      .map(
        (
          e,
        ) => `<figure class="view ${e.kinds.every((k) => k.startsWith("regional")) ? "" : "bad"}"><figcaption>${escape(e.world)} frame ${e.i}: ${escape(e.kinds.join(", "))}</figcaption>
        <div class="trio">${e.images.map((f) => `<img src="${escape(`${s.id}/${f}`)}" alt="">`).join("")}</div></figure>`,
      )
      .join("");
    return `<h3>${escape(s.id)}: ${s.flash.captured} frames, ${s.flash.flagged} flagged</h3>
      <table><thead><tr><th>World</th><th class="num">Frames</th><th class="num">Median ms</th><th class="num">P95 ms</th><th class="num">Max ms</th><th class="num">Most black</th><th class="num">Black frames</th><th class="num">Camera cuts</th><th class="num">Recorder ms</th></tr></thead><tbody>${worlds}</tbody></table>${events}`;
  });
  return `<h2>Flash detector</h2>${parts.join("")}`;
}

function hitchSection(step) {
  const crossings = step?.details?.crossings;
  if (!crossings) return "";
  const rows = crossings
    .map(
      (c) =>
        `<tr><td>${escape(c.from)} to ${escape(c.to)}${c.back ? " (back)" : ""}</td><td class="num">${Math.round(c.enterMs)}</td><td class="num">${c.worst[0]?.[1] ?? ""}</td><td class="num">${c.over50}</td><td class="num">${c.programs}</td></tr>`,
    )
    .join("");
  return `<h2>Door crossings</h2><table><thead><tr><th>Crossing</th><th class="num">Entered after ms</th><th class="num">Worst frame ms</th><th class="num">Frames over 50 ms</th><th class="num">Programs</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function writeReport(dir, report) {
  await writeFile(
    join(dir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const steps = report.steps;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Farseek nightly ${escape(report.date)}</title>
<style>
:root{--bg:#f6f4ef;--fg:#1d1b18;--muted:#6b665d;--line:#d9d4c9;--pass:#2f7d4f;--fail:#b3261e;--card:#fff;--link:#1f5fa8}
@media (prefers-color-scheme:dark){:root{--bg:#171614;--fg:#ece8e1;--muted:#a39d92;--line:#3a3732;--card:#211f1c;--link:#8ab8f0}}
a{color:var(--link)}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
main{max-width:1180px;margin:auto}h1{margin:0 0 4px}small,.muted{color:var(--muted)}
table{border-collapse:collapse;width:100%;margin:8px 0 20px;background:var(--card)}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}ul{margin:0;padding-left:18px}
.badge{display:inline-block;padding:1px 8px;border-radius:9px;color:#fff;font-size:12px;text-transform:uppercase}.pass{background:var(--pass)}.fail{background:var(--fail)}
.view{margin:0 0 16px;padding:8px;background:var(--card);border:1px solid var(--line)}.view.bad{border-color:var(--fail)}
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}.trio img{width:100%;height:auto;display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0 12px}.single{width:100%;height:auto;display:block;margin-top:6px}
@media (max-width:640px){.trio{grid-template-columns:1fr}}
</style></head><body><main>
<h1>${badge(report.passed)} Farseek nightly, ${escape(report.date)}</h1>
<p class="muted">${escape(report.mode)} run of ${escape(report.root)} at ${escape(report.base)}, ${Math.round(report.seconds / 60)} min, sources ${escape(report.sources.hash.slice(0, 12))} (${report.sources.files} files)</p>
${stepsTable(steps)}
${viewsSection(steps.find((s) => s.id === "views"))}
${flashSection(steps)}
${hitchSection(steps.find((s) => s.id === "hitch"))}
</main></body></html>`;
  await writeFile(join(dir, "index.html"), html);
}
