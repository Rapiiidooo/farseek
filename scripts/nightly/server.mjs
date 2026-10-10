// Serves the checkout the nightly runs in, on a free loopback port.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createServer } from "node:net";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Starts scripts/serve.mjs from `root` and resolves once it answers. */
export async function startServer(root, { port, log }) {
  port ||= await freePort();
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const file = createWriteStream(log);
  child.stdout.pipe(file);
  child.stderr.pipe(file);
  let exited = null;
  child.once("exit", (code, signal) => (exited = { code, signal }));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100 && !exited; i++) {
    const ok = await fetch(`${base}/`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok)
      return {
        base,
        port,
        pid: child.pid,
        alive: () => !exited,
        async stop() {
          if (exited) return;
          child.kill("SIGTERM");
          for (let k = 0; k < 20 && !exited; k++) await sleep(100);
          if (!exited) child.kill("SIGKILL");
        },
      };
    await sleep(150);
  }
  child.kill("SIGKILL");
  throw new Error(
    `the game server did not start on port ${port}${exited ? ` (exit ${exited.code})` : ""}`,
  );
}
