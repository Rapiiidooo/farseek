import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve(process.argv[2] || "outputs/developer-review");
const sourceRoot = process.cwd();
assert(output.startsWith(path.join(sourceRoot, "outputs") + path.sep));
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const publicRoot = path.join(output, "public");
const files = [];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of (await readdir(source, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (entry.name.startsWith(".") || entry.name === "_verify") continue;
    assert(!entry.isSymbolicLink(), `Unexpected link: ${source}/${entry.name}`);
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (
      entry.isFile() &&
      /\.(js|json|html|css|svg|png|jpg|jpeg|webp|woff2|mp3|mp4|ogg|wav|txt|zip)$/.test(
        entry.name,
      )
    ) {
      const original = await readFile(from);
      let delivered = original;
      if (from === path.join(sourceRoot, "game/local-preview.js")) {
        const text = original.toString();
        const anchor =
          'export const LOCAL_PREVIEW = [\n  "localhost",\n  "127.0.0.1",\n  "::1",\n  "[::1]",\n].includes(globalThis.location?.hostname);';
        assert.equal(text.split(anchor).length, 2, "Local preview contract");
        delivered = Buffer.from(
          text.replace(anchor, "export const LOCAL_PREVIEW = true;"),
        );
      }
      await writeFile(to, delivered, { flag: "wx" });
      files.push({
        source: path.relative(sourceRoot, from),
        file: path.relative(publicRoot, to),
        bytes: delivered.length,
        sourceSha256: sha(original),
        sha256: sha(delivered),
      });
    }
  }
}
await copyTree(path.join(sourceRoot, "game"), publicRoot);
await copyTree(
  path.join(sourceRoot, "media/local-tour"),
  path.join(publicRoot, "gallery"),
);
await writeFile(
  path.join(output, "developer.json"),
  JSON.stringify(
    {
      schema: 1,
      purpose: "Authenticated developer review of the working checkout",
      game: "/",
      lab: "/labs",
      gallery: "/gallery/",
      mutations: [
        "LOCAL_PREVIEW is true in this isolated artifact; campaign test sessions remain separate from saved progress",
      ],
      files,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Prepared ${files.length} public files at ${publicRoot}; no upload performed.`,
);
