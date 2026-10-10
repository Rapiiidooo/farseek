// Nightly review of this checkout: serves it on a free port, runs every check and route,
// measures the ten door crossings, watches routes for flashes, WebGL errors and shader
// programs compiled during play, compares fixed camera views with baselines, and writes a
// dated report. Exits nonzero when anything fails.
//   node scripts/nightly.mjs [--quick] [--only=<ids>] [--skip=<ids>] [--out=outputs/nightly]
//     [--keep=14] [--hitch-ms=50] [--port=<n>] [--update-baselines]
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { writeReport } from "./nightly/report.mjs";
import { runStep } from "./nightly/runner.mjs";
import { startServer } from "./nightly/server.mjs";
import { plan } from "./nightly/steps.mjs";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const flag = (name) => process.argv.includes(`--${name}`);
const option = (name, fallback) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const list = (name) => option(name)?.split(",").filter(Boolean);

const update = flag("update-baselines");
const quick = flag("quick");
const outRoot = resolve(option("out", join(root, "outputs/nightly")));
const keep = Number(option("keep", 14));
const hitchMs = Number(option("hitch-ms", 50));
const baselines = resolve(
  option("baselines", join(root, "receipts/nightly-baselines")),
);

async function sources() {
  const hash = createHash("sha256");
  let files = 0;
  const walk = async (dir) => {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "_verify") await walk(path);
      } else if (entry.isFile()) {
        hash.update(relative(root, path));
        hash.update(await readFile(path));
        files++;
      }
    }
  };
  await walk(join(root, "game"));
  const git = await promisify(execFile)("git", [
    "-C",
    root,
    "rev-parse",
    "HEAD",
  ]).then(
    (r) => r.stdout.trim(),
    () => null,
  );
  return { hash: hash.digest("hex"), files, git };
}

async function runDirectory() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (let n = 1; ; n++) {
    const dir = join(outRoot, n === 1 ? date : `${date}-${n}`);
    const exists = await stat(dir).then(
      () => true,
      () => false,
    );
    if (!exists) {
      await mkdir(dir, { recursive: true });
      return { dir, date };
    }
  }
}

async function retain() {
  const runs = [];
  for (const name of await readdir(outRoot).catch(() => [])) {
    const report = await readFile(join(outRoot, name, "report.json"), "utf8")
      .then(JSON.parse)
      .catch(() => null);
    if (report?.tool === "farseek-nightly")
      runs.push({ name, started: report.started });
  }
  runs.sort((a, b) => b.started.localeCompare(a.started));
  for (const old of runs.slice(keep))
    await rm(join(outRoot, old.name), { recursive: true, force: true });
  return runs.slice(keep).map((r) => r.name);
}

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const check = pkg.scripts.check.replace(/^node\s+/, "").split(/\s+/);
const { dir, date } = await runDirectory();
const started = new Date();
const tmpRoot = await mkdtemp(join(tmpdir(), "farseek-nightly-"));
const report = {
  tool: "farseek-nightly",
  date,
  started: started.toISOString(),
  mode: update
    ? "update-baselines"
    : list("only")
      ? `only ${list("only").join(", ")}`
      : quick
        ? "quick"
        : "full",
  root,
  hitchMs,
  sources: await sources(),
  steps: [],
  passed: false,
};
let server = null;
try {
  server = await startServer(root, {
    port: Number(option("port", 0)),
    log: join(dir, "server.log"),
  });
  report.base = server.base;
  const only = update ? ["views"] : list("only");
  const skip = list("skip") || [];
  const all = plan({ base: server.base, check, hitchMs, update, baselines });
  const unknown = [...(only || []), ...skip].filter(
    (id) => !all.some((s) => s.id === id),
  );
  if (unknown.length)
    throw new Error(
      `unknown steps ${unknown.join(", ")}; the steps are ${all.map((s) => s.id).join(", ")}`,
    );
  const steps = all.filter(
    (s) =>
      (only ? only.includes(s.id) : !quick || s.quick) && !skip.includes(s.id),
  );
  console.log(
    `nightly ${report.mode}: ${steps.length} steps, ${server.base}, ${dir}`,
  );
  for (const [k, step] of steps.entries()) {
    if (!server.alive()) throw new Error("the game server stopped");
    const context = { root, runDir: dir, tmpRoot, base: server.base };
    let record = await runStep(step, context);
    if (
      step.confirm &&
      record.status === "fail" &&
      record.timing &&
      record.failures.every((f) => /ms frame/.test(f))
    ) {
      console.log(`  ${step.id}: slow frames, measuring again to confirm`);
      const again = await runStep(step, { ...context, attempt: "confirm" });
      again.first = { failures: record.failures, seconds: record.seconds };
      again.seconds = Math.round((again.seconds + record.seconds) * 10) / 10;
      record = again;
    }
    report.steps.push(record);
    console.log(
      `[${k + 1}/${steps.length}] ${record.status.toUpperCase()} ${step.id} (${record.seconds} s)${record.warnings?.length ? `, ${record.warnings.length} frames for review` : ""}${record.failures.length ? `\n    ${record.failures.slice(0, 6).join("\n    ")}` : ""}`,
    );
  }
  report.passed =
    report.steps.length > 0 && report.steps.every((s) => s.status === "pass");
} catch (error) {
  report.error = String(error.stack || error);
  console.error(report.error);
} finally {
  await server?.stop();
  await rm(tmpRoot, { recursive: true, force: true });
  report.seconds = Math.round((Date.now() - started.getTime()) / 1000);
  await writeReport(dir, report);
  await writeFile(
    join(outRoot, "latest.json"),
    JSON.stringify(
      {
        dir: relative(outRoot, dir),
        date,
        passed: report.passed,
        mode: report.mode,
        seconds: report.seconds,
      },
      null,
      2,
    ) + "\n",
  );
  const removed = await retain();
  console.log(
    `${report.passed ? "PASSED" : "FAILED"} in ${Math.round(report.seconds / 60)} min: ${join(dir, "index.html")}${removed.length ? ` (removed ${removed.join(", ")})` : ""}`,
  );
}
process.exitCode = report.error ? 2 : report.passed ? 0 : 1;
