// Adds or replaces entries of one language table, keeping keys in the order the check lists them.
//   node scripts/i18n-set.mjs <fr|es|zh|hi> '{"English key": "translation"}'
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const [id, json] = process.argv.slice(2);
const file = new URL(`../game/i18n/${id}.js`, import.meta.url);
const current = (await import(pathToFileURL(file.pathname))).default;
const table = { ...current, ...JSON.parse(json) };
const sorted = Object.fromEntries(
  Object.entries(table).sort(([a], [b]) => a.localeCompare(b)),
);
await writeFile(file, `export default ${JSON.stringify(sorted, null, 2)};\n`);
execFileSync("npm", ["run", "format", "--", file.pathname], {
  stdio: "ignore",
});
console.log(`${id}: ${Object.keys(sorted).length} entries`);
