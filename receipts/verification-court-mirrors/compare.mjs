// Side-by-side sheets of the before and after frames (ImageMagick), at half size.
//   node receipts/verification-court-mirrors/compare.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const frames = new URL("frames/", import.meta.url).pathname;
mkdirSync(frames + "compare", { recursive: true });
const VIEWS = [
  "floor-start",
  "east-floor",
  "west-gate",
  "gate-high",
  "overview",
  "west-gate-nyra",
];
for (const view of VIEWS)
  for (const quality of ["high", "balanced", "fast"])
    execFileSync("magick", [
      `${frames}before/${view}-${quality}.jpg`,
      `${frames}after/${view}-${quality}.jpg`,
      "-resize",
      "50%",
      "+append",
      "-quality",
      "80",
      `${frames}compare/${view}-${quality}.jpg`,
    ]);
console.log(`${VIEWS.length * 3} sheets in ${frames}compare`);
