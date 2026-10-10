import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = git(
  "rev-parse",
  "--verify",
  "--end-of-options",
  `${process.argv[2] || "HEAD"}^{commit}`,
);
if (!/^[a-f0-9]{40}$/.test(commit))
  throw new Error("Expected a full Git commit SHA");
const repo = git("rev-parse", "--show-toplevel");
const output = path.resolve(process.argv[3] || "outputs/release");
const recipe = path.resolve(
  process.env.FARSEEK_RECIPE_DIR || path.join(repo, "../404-game-recipe"),
);
const work = mkdtempSync(path.join(os.tmpdir(), "farseek-release-"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

try {
  const tree = execFileSync("git", ["-C", repo, "archive", commit, "game"], {
    maxBuffer: 100 * 1024 * 1024,
  });
  execFileSync("tar", ["-xf", "-", "-C", work], { input: tree });
  const files = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = lstatSync(file);
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile())
        files[path.relative(work, file).split(path.sep).join("/")] = sha256(
          readFileSync(file),
        );
      else
        throw new Error("Release files must be ordinary files or directories");
    }
  };
  walk(path.join(work, "game"));
  execFileSync(
    process.execPath,
    [path.join(recipe, "harness/ship.mjs"), path.join(work, "game")],
    { stdio: "inherit" },
  );
  mkdirSync(output, { recursive: true });
  const archive = path.join(output, "release.tar.gz");
  execFileSync("tar", ["-czf", archive, "game"], {
    cwd: work,
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const manifest = {
    schema: 1,
    commit,
    releaseId: `${date}-${commit.slice(0, 12)}`,
    archive: "release.tar.gz",
    sha256: sha256(readFileSync(archive)),
    files,
  };
  writeFileSync(
    path.join(output, "release.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      commit,
      releaseId: manifest.releaseId,
      files: Object.keys(files).length,
      output,
    }),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
