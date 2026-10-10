// Runs one nightly step as a child process with its own TMPDIR, watches the browsers it
// launches, and turns exit codes, monitor findings and the step's own judge into failures.
import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { loadavg } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { watchBrowsers } from "./monitor.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(args, { cwd, env, log, timeout }) {
  return new Promise((resolve) => {
    const file = createWriteStream(log);
    const tail = [];
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const keep = (chunk) => {
      file.write(chunk);
      tail.push(...String(chunk).split("\n").filter(Boolean));
      tail.splice(0, Math.max(0, tail.length - 30));
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    let timedOut = false;
    const timer = setTimeout(async () => {
      timedOut = true;
      child.kill("SIGTERM");
      await sleep(5000);
      if (child.exitCode === null) child.kill("SIGKILL");
    }, timeout);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      file.end();
      resolve({ code, signal, timedOut, tail });
    });
  });
}

/** Ends any browser still running from this step's profile directory. */
async function killStray(tmp) {
  const { stdout } = await promisify(execFile)("ps", ["-axo", "pid=,command="]);
  const stray = stdout
    .split("\n")
    .filter((line) => line.includes(tmp))
    .map((line) => Number(line.trim().split(/\s+/)[0]))
    .filter((pid) => pid && pid !== process.pid);
  for (const pid of stray) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  return stray.length;
}

function frameSummary(frames, limits) {
  const worlds = {};
  for (const [, , dt, L, zero, world, space, cut, cost] of frames) {
    const w = (worlds[world ?? "none"] ||= {
      frames: 0,
      dts: [],
      maxZero: 0,
      black: 0,
      minL: Infinity,
      maxL: 0,
      cuts: 0,
      costs: [],
    });
    w.frames++;
    w.costs.push(cost);
    w.cuts += cut ? 1 : 0;
    w.dts.push(dt);
    if (!space) {
      w.maxZero = Math.max(w.maxZero, zero);
      if (zero >= limits.blackArea) w.black++;
    }
    w.minL = Math.min(w.minL, L);
    w.maxL = Math.max(w.maxL, L);
  }
  for (const w of Object.values(worlds)) {
    const d = w.dts.sort((a, b) => a - b);
    const c = w.costs.sort((a, b) => a - b);
    Object.assign(w, {
      dtMedian: d[Math.floor(d.length / 2)],
      dtP95: d[Math.floor(d.length * 0.95)],
      dtMax: d.at(-1),
      costMedian: c[Math.floor(c.length / 2)],
      costP95: c[Math.floor(c.length * 0.95)],
    });
    delete w.dts;
    delete w.costs;
  }
  return worlds;
}

async function saveEvents(events, out) {
  const saved = [];
  // Images finish encoding after the frame, so events arrive out of order.
  events.sort((a, b) => a.target - b.target || a.i - b.i);
  for (const [n, event] of events.entries()) {
    const files = [];
    for (const [k, url] of (event.images || []).entries()) {
      const file = `flash-${String(n + 1).padStart(2, "0")}-${["before", "flagged", "after"][k]}.png`;
      await writeFile(
        join(out, file),
        Buffer.from(url.split(",")[1], "base64"),
      );
      files.push(file);
    }
    saved.push({ ...event, images: files });
  }
  return saved;
}

export async function runStep(
  step,
  { root, runDir, tmpRoot, base, attempt = "" },
) {
  const out = join(runDir, step.id, attempt);
  // Some checks empty their own folder first, so they get one inside the step's.
  const output = join(out, "output");
  const tmp = join(tmpRoot, `${step.id}${attempt ? `-${attempt}` : ""}`);
  await mkdir(output, { recursive: true });
  await mkdir(tmp, { recursive: true });
  const monitor = step.browser
    ? watchBrowsers(tmp, { recorder: step.recorder })
    : null;
  const started = Date.now();
  const load = loadavg()[0];
  const result = await run(step.args(output), {
    cwd: root,
    env: { ...process.env, TMPDIR: `${tmp}/`, FARSEEK_BASE: base },
    log: join(out, "log.txt"),
    timeout: step.timeout * 60000,
  });
  const stray = await killStray(tmp);
  const report = monitor ? await monitor.stop() : null;
  const record = {
    id: step.id,
    title: step.title,
    attempt: attempt || undefined,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    // Frame timings mean little when other processes keep every core busy.
    load: [load, loadavg()[0]].map((v) => Math.round(v * 10) / 10),
    exit: result.code ?? result.signal,
    failures: [],
    tail: result.tail.slice(-12),
    log: join(step.id, attempt, "log.txt"),
  };
  if (result.timedOut)
    record.failures.push(`timed out after ${step.timeout} min`);
  else if (result.code !== 0) {
    const reason = result.tail.findLast((line) =>
      /Error[:\s[]|^\s*FAIL|FAILED|failed/.test(line),
    );
    record.failures.push(
      `exited with ${result.code ?? result.signal}${reason ? `: ${reason.trim().slice(0, 200)}` : ""}`,
    );
  }
  if (stray) record.strayBrowsers = stray;
  if (report) {
    const limits = step.recorder?.limits;
    const late = report.programs.filter((p) => p.late);
    record.monitor = {
      browsers: report.browsers,
      pages: report.pages,
      errors: report.errors,
      webgl: report.webgl,
      programEvents: report.programs.length,
      late,
      recorderErrors: report.recorderErrors.slice(0, 10),
    };
    if (report.programs.length)
      await writeFile(
        join(out, "programs.json"),
        JSON.stringify(report.programs, null, 1) + "\n",
      );
    if (!report.browsers)
      record.failures.push("no browser was seen: the monitor did not run");
    const messages = new Map();
    for (const e of [...report.errors, ...report.webgl]) {
      const text = `${e.kind}: ${e.text.split("\n")[0]}`;
      messages.set(text, (messages.get(text) || 0) + 1);
    }
    for (const [text, count] of [...messages].slice(0, 6))
      record.failures.push(count > 1 ? `${text} (${count} times)` : text);
    if (messages.size > 6)
      record.failures.push(`${messages.size - 6} more distinct browser errors`);
    for (const p of late.slice(0, 5))
      record.failures.push(
        `shader compiled during play in ${p.world}: ${p.from} to ${p.to} programs (${p.added.map((a) => a.name).join(", ")})`,
      );
    if (step.recorder && !report.installed)
      record.failures.push("the in-page recorder was never installed");
    if (step.recorder?.pixels) {
      const captured = report.frames.length;
      const worlds = frameSummary(report.frames, limits);
      const events = await saveEvents(report.events, out);
      const black = Object.values(worlds).reduce((a, w) => a + w.black, 0);
      record.flash = {
        captured,
        flagged: events.length,
        black,
        worlds,
        events,
      };
      if (captured < step.minFrames)
        record.failures.push(
          `the flash detector saw ${captured} frames, fewer than ${step.minFrames}`,
        );
      // Regional spikes alone come from geometry sweeping past the lens as often as from faults,
      // so they are shown for review; black frames and whole-frame spikes fail.
      const regional = (e) => e.kinds.every((k) => k.startsWith("regional"));
      const flashes = events.filter((e) => !regional(e));
      for (const e of flashes.slice(0, 5))
        record.failures.push(
          `flash in ${e.world} at frame ${e.i}: ${e.kinds.join(", ")}`,
        );
      if (flashes.length > 5)
        record.failures.push(`${flashes.length - 5} more flashes`);
      record.warnings = events
        .filter(regional)
        .map((e) => `${e.world} frame ${e.i}: ${e.kinds.join(", ")}`);
      if (black)
        record.failures.push(
          `${black} frames with more than ${limits.blackArea * 100}% exactly black pixels`,
        );
      await writeFile(
        join(out, "frames.json.gz"),
        gzipSync(JSON.stringify(report.frames)),
      );
    }
  }
  if (step.judge) {
    const verdict = await step.judge(output);
    record.failures.push(...verdict.failures);
    record.details = verdict.details;
    record.timing = verdict.timing;
  }
  record.status = record.failures.length ? "fail" : "pass";
  await writeFile(
    join(out, "step.json"),
    JSON.stringify(record, null, 2) + "\n",
  );
  return record;
}
