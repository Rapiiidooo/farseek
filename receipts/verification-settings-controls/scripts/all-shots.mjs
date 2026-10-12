// Runs settings-shots.mjs for the five languages on both viewports, one browser at a time.
//   node receipts/verification-settings-controls/scripts/all-shots.mjs <outDir> <before|after> [url]
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [out, tag, url = "http://localhost:3005/"] = process.argv.slice(2);
const script = fileURLToPath(new URL("./settings-shots.mjs", import.meta.url));
for (const kind of ["desktop", "phone"])
  for (const lang of ["en", "fr", "es", "zh", "hi"]) {
    const run = spawnSync(
      process.execPath,
      [script, out, lang, kind, tag, url],
      { encoding: "utf8", timeout: 180000 },
    );
    const line = (run.stdout || "").trim().split("\n").pop();
    console.log(`${lang} ${kind} exit ${run.status} ${line}`);
  }
