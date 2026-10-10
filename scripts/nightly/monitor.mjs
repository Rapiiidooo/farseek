// Watches the Chrome instances a check script launches without changing the script: each
// script runs with its own TMPDIR, so its puppeteer profile and DevToolsActivePort appear
// there. The monitor attaches a second DevTools client to every page, collects exceptions,
// console errors and WebGL warnings, and installs the in-page recorder on game pages.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { flashKinds } from "./flash-rules.js";
import { installRecorder } from "./recorder.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WEBGL =
  /WebGL|GL_INVALID|GL ERROR|CONTEXT_LOST|THREE\.WebGL(Program|Renderer)|shader/i;

class Client {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.next = 1;
    this.calls = new Map();
    this.listeners = new Set();
    this.closed = new Promise((resolve) => {
      this.socket.addEventListener("close", resolve);
      this.socket.addEventListener("error", resolve);
    });
    this.socket.addEventListener("message", (message) => {
      const data = JSON.parse(message.data);
      if (data.id && this.calls.has(data.id)) {
        const { resolve, reject, timer } = this.calls.get(data.id);
        clearTimeout(timer);
        this.calls.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      } else if (data.method) for (const listen of this.listeners) listen(data);
    });
    this.closed.then(() => {
      for (const { reject, timer } of this.calls.values()) {
        clearTimeout(timer);
        reject(new Error("DevTools connection closed"));
      }
      this.calls.clear();
    });
  }
  open() {
    return new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }
  send(method, params = {}, sessionId, timeout = 15000) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.calls.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeout);
      this.calls.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  close() {
    try {
      this.socket.close();
    } catch {}
  }
}

/**
 * Starts watching `dir` for puppeteer profiles. With `recorder` ({ pixels, limits, maxImages })
 * every game page opened with ?debug=1 gets the in-page recorder.
 */
export function watchBrowsers(dir, { recorder = null } = {}) {
  const report = {
    browsers: 0,
    pages: 0,
    errors: [],
    webgl: [],
    frames: [],
    events: [],
    programs: [],
    recorderErrors: [],
    installed: 0,
  };
  const seen = new Set();
  const clients = [];
  const loops = [];
  let running = true;
  const install = `(${installRecorder})(${JSON.stringify(recorder || {})}, ${flashKinds})`;
  const note = (list, entry) => {
    if (list.length < 200) list.push(entry);
  };

  async function poll(client, sessionId, target) {
    let present = false;
    while (running) {
      try {
        const probe = await client.send(
          "Runtime.evaluate",
          {
            expression: present
              ? "window.__NIGHTLY__ ? window.__NIGHTLY__.drain() : 'missing'"
              : "window.__NIGHTLY__ ? 'present' : window.__FD__?.app ? 'ready' : 'waiting'",
            returnByValue: true,
          },
          sessionId,
        );
        const value = probe.result?.value;
        if (value === "ready") {
          const result = await client.send(
            "Runtime.evaluate",
            { expression: install, returnByValue: true },
            sessionId,
          );
          if (result.result?.value === "installed") report.installed++;
          present = result.result?.value === "installed";
        } else if (value === "present") present = true;
        else if (value === "missing") present = false;
        else if (value && typeof value === "object") {
          for (const f of value.frames) report.frames.push([target, ...f]);
          report.events.push(...value.events.map((e) => ({ ...e, target })));
          report.programs.push(
            ...value.programs.map((p) => ({ ...p, target })),
          );
          report.recorderErrors.push(...value.errors);
        }
      } catch (error) {
        // Navigation destroys contexts and busy pages time out; only a detached page ends the loop.
        if (
          /connection closed|No session|session with given id/i.test(
            error.message,
          )
        )
          return;
      }
      await sleep(500);
    }
  }

  async function attach(client, targetInfo) {
    if (seen.has(targetInfo.targetId) || targetInfo.type !== "page") return;
    seen.add(targetInfo.targetId);
    const { sessionId } = await client.send("Target.attachToTarget", {
      targetId: targetInfo.targetId,
      flatten: true,
    });
    report.pages++;
    await Promise.all([
      client.send("Runtime.enable", {}, sessionId),
      client.send("Log.enable", {}, sessionId),
    ]);
    if (recorder) loops.push(poll(client, sessionId, report.pages));
  }

  async function connect(port, path) {
    const client = new Client(`ws://127.0.0.1:${port}${path}`);
    await client.open();
    clients.push(client);
    report.browsers++;
    client.listeners.add((message) => {
      const { method, params } = message;
      if (
        method === "Target.targetCreated" ||
        method === "Target.targetInfoChanged"
      )
        attach(client, params.targetInfo).catch(() => {});
      else if (method === "Runtime.exceptionThrown") {
        const d = params.exceptionDetails;
        note(report.errors, {
          kind: "page error",
          text: `${d.exception?.description || d.text}`.slice(0, 600),
        });
      } else if (method === "Runtime.consoleAPICalled") {
        const text = params.args
          .map((a) => a.value ?? a.description ?? "")
          .join(" ")
          .slice(0, 600);
        if (params.type === "error")
          note(report.errors, { kind: "console error", text });
        else if (params.type === "warning" && WEBGL.test(text))
          note(report.webgl, { kind: "console warning", text });
      } else if (method === "Log.entryAdded") {
        const { level, text, source, url } = params.entry;
        if (source === "network" && /favicon\.ico/.test(url || "")) return;
        const entry = {
          kind: `${source} ${level}`,
          text: `${text} ${url || ""}`.trim().slice(0, 600),
        };
        if (WEBGL.test(text) && (level === "warning" || level === "error"))
          note(report.webgl, entry);
        else if (level === "error") note(report.errors, entry);
      }
    });
    await client.send("Target.setDiscoverTargets", { discover: true });
  }

  const scanning = (async () => {
    while (running) {
      const names = await readdir(dir).catch(() => []);
      for (const name of names) {
        if (!name.startsWith("puppeteer_dev_chrome_profile-") || seen.has(name))
          continue;
        const text = await readFile(
          join(dir, name, "DevToolsActivePort"),
          "utf8",
        ).catch(() => null);
        const [port, path] = text?.trim().split("\n") ?? [];
        if (!port || !path) continue;
        seen.add(name);
        await connect(port, path).catch((error) =>
          report.recorderErrors.push(`attach: ${error.message}`),
        );
      }
      await sleep(150);
    }
  })();

  return {
    report,
    async stop() {
      running = false;
      await scanning;
      await Promise.race([Promise.all(loops), sleep(3000)]);
      for (const client of clients) client.close();
      return report;
    },
  };
}
