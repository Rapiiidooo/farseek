// One sheet of every candidate view, a row per world, the chosen one named as such, from the
// candidates' small frames (ImageMagick's montage).
//   node receipts/verification-level-select/scripts/contact-sheet.mjs <candidatesDir> <out.jpg>
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const [dir, out] = process.argv.slice(2);
const ORDER = ["court", "two", "three", "four", "five", "six", "vault"];
const CHOSEN = {
  court: "floor",
  two: "corner",
  three: "wide",
  four: "lake",
  five: "avenue",
  six: "archive",
  vault: "medallions",
};
const files = readdirSync(dir).filter((name) => name.endsWith(".jpg"));
const rows = ORDER.map((world) =>
  files.filter((name) => name.startsWith(`${world}-`)).sort(),
);
const width = Math.max(...rows.map((row) => row.length));
const args = [
  "montage",
  "-font",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
];
for (const [i, row] of rows.entries())
  for (let k = 0; k < width; k++) {
    const name = row[k];
    if (!name) {
      args.push("-label", "", "xc:#141010[240x135!]");
      continue;
    }
    const view = name.slice(ORDER[i].length + 1, -4);
    args.push(
      "-label",
      `${ORDER[i]} ${view}${view === CHOSEN[ORDER[i]] ? " (chosen)" : ""}`,
      path.join(dir, name),
    );
  }
args.push(
  "-tile",
  `${width}x${rows.length}`,
  "-geometry",
  "240x135+6+6",
  "-background",
  "#141010",
  "-fill",
  "#e8cfa4",
  "-pointsize",
  "13",
  "-quality",
  "80",
  out,
);
execFileSync("magick", args);
console.log(`${out}: ${rows.flat().length} candidates in ${rows.length} rows`);
