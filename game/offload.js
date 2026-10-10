import * as THREE from "three";
import { decodeTree, FORMAT } from "./offload-codec.js";
import { setPixelScheduler } from "./pixel-jobs.js";

// Pure building work runs on a small pool of module workers. Every caller keeps an exact path on
// the main thread: a worker that fails or answers late changes timing, never the result.
const POOL = Math.max(
  1,
  Math.min(2, (globalThis.navigator?.hardwareConcurrency || 2) - 1),
);
let pool = null;
let unavailable = typeof Worker === "undefined";
let sequence = 0;
// One job per worker at a time, so pixels a preparation waits for overtake queued factories.
const queue = [];
const outstanding = new Set();
const factories = new Map();

export const offloadTelemetry = {
  workers: 0,
  jobs: 0,
  failed: 0,
  fallbacks: 0,
  factories: {},
  refused: {},
};

function fail() {
  unavailable = true;
  for (const worker of pool || []) {
    worker.job?.reject(new Error("No worker"));
    worker.terminate();
  }
  for (const job of queue.splice(0)) job.reject(new Error("No worker"));
  pool = null;
  offloadTelemetry.workers = 0;
}

function workers() {
  if (unavailable) return null;
  if (!pool) {
    try {
      pool = Array.from({ length: POOL }, () => {
        // The stamp a release adds to this module's address keeps the worker's code in step.
        const worker = new Worker(
          new URL(
            "./offload-worker.js" + new URL(import.meta.url).search,
            import.meta.url,
          ),
          { type: "module" },
        );
        worker.job = null;
        worker.onmessage = ({ data }) => {
          const job = worker.job;
          worker.job = null;
          if (data.error) job.reject(new Error(data.error));
          else job.resolve(data.result);
          dispatch();
        };
        worker.onerror = (event) => {
          event.preventDefault();
          fail();
        };
        return worker;
      });
      offloadTelemetry.workers = pool.length;
    } catch {
      fail();
    }
  }
  return pool;
}

let idle = null;

// Idle workers close after a while, so phones do not keep their memory between preparations.
function dispatch() {
  clearTimeout(idle);
  for (const worker of pool || []) {
    if (worker.job || !queue.length) continue;
    const job = queue.shift();
    worker.job = job;
    worker.postMessage({ id: job.id, kind: job.kind, input: job.input });
  }
  if (pool && !queue.length && pool.every((worker) => !worker.job))
    idle = setTimeout(() => {
      if (queue.length || pool?.some((worker) => worker.job)) return;
      for (const worker of pool || []) worker.terminate();
      pool = null;
      offloadTelemetry.workers = 0;
    }, 20000);
}

function run(kind, input, priority = 0) {
  if (!workers()) return null;
  offloadTelemetry.jobs++;
  return new Promise((resolve, reject) => {
    const job = { id: ++sequence, kind, input, priority, resolve, reject };
    const at = queue.findIndex((other) => other.priority < priority);
    queue.splice(at < 0 ? queue.length : at, 0, job);
    dispatch();
  });
}

function track(promise) {
  outstanding.add(promise);
  promise.finally(() => outstanding.delete(promise));
}

// Texture images whose pixels a worker computes; reading one before it answers computes it here.
export function deferredPixels(kind, input, compute) {
  let result = null;
  const job = run(kind, input, 1);
  if (job)
    track(
      job.then(
        (value) => {
          result ??= value;
        },
        () => {
          offloadTelemetry.failed++;
        },
      ),
    );
  const resolve = () => {
    if (!result) {
      offloadTelemetry.fallbacks++;
      result = compute();
    }
    return result;
  };
  return (name, size) => ({
    width: size,
    height: size,
    get data() {
      return resolve()[name];
    },
  });
}

setPixelScheduler(deferredPixels);

// Resolves once the pixel work requested so far has arrived, or after the timeout.
export function pixelsSettled(timeout = 5000) {
  if (!outstanding.size) return Promise.resolve();
  let timer;
  return Promise.race([
    Promise.all([...outstanding]),
    new Promise((resolve) => (timer = setTimeout(resolve, timeout))),
  ]).finally(() => clearTimeout(timer));
}

const factoryKey = (url, options) =>
  options === undefined ? url : `${url}#${JSON.stringify(options)}`;

// Starts building an import-free factory in a worker; the tree arrives as transferable buffers.
export function prebuild(url, options) {
  const key = factoryKey(url, options);
  if (!factories.has(key)) {
    const started = performance.now();
    const job = run("factory", { url, options });
    const entry = { data: null, module: null };
    entry.payload = job
      ? job.then(
          (payload) => {
            if (payload?.format !== FORMAT) throw new Error("Worker format");
            entry.data = payload;
            offloadTelemetry.factories[key.split("/").pop()] = Math.round(
              performance.now() - started,
            );
            return payload;
          },
          (error) => {
            offloadTelemetry.failed++;
            offloadTelemetry.refused[key.split("/").pop()] = error.message;
            return null;
          },
        )
      : Promise.resolve(null);
    factories.set(key, entry);
  }
  return factories.get(key).payload;
}

// A fresh copy of a prebuilt tree, or null. Every copy owns its buffers: callers such as the
// mountain ranges recolor theirs in place, and a later copy must start from the worker's values.
export function prebuiltTree(url, options) {
  const entry = factories.get(factoryKey(url, options));
  if (!entry?.data) return null;
  try {
    return decodeTree(THREE, structuredClone(entry.data));
  } catch (error) {
    entry.data = null;
    offloadTelemetry.failed++;
    offloadTelemetry.refused[url.split("/").pop()] = String(error.message);
    return null;
  }
}

// A module URL whose default export returns the prebuilt tree, or builds it here when it cannot.
// A worker that has not answered within `wait` milliseconds is not waited for again.
export async function prebuiltModule(url, wait = 8000) {
  const entry = factories.get(url);
  if (!entry || entry.declined) return null;
  let timer;
  const payload = await Promise.race([
    entry.payload,
    new Promise((resolve) => (timer = setTimeout(resolve, wait, null))),
  ]).finally(() => clearTimeout(timer));
  if (!payload) {
    entry.declined = !entry.data;
    if (entry.declined)
      offloadTelemetry.refused[url.split("/").pop()] ??= "timeout";
    return null;
  }
  entry.module ??= URL.createObjectURL(
    new Blob(
      [
        `import { prebuiltTree } from ${JSON.stringify(import.meta.url)};\n` +
          `import * as factory from ${JSON.stringify(url)};\n` +
          `const build = factory.default || factory.build || factory.create;\n` +
          `export default (THREE) => prebuiltTree(${JSON.stringify(url)}) ?? build(THREE);\n`,
      ],
      { type: "text/javascript" },
    ),
  );
  return entry.module;
}
