// Contracts of the world catalog, the asset store, the world manager, the background work
// budget and the page's module preloads, without a browser (see docs/architecture.md).
//   node scripts/architecture-check.mjs [outDir]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { WorldManager } from "../game/worlds/manager.js";
import { WorldWorkBudget } from "../game/worlds/work-budget.js";
import { WORLDS, CHAPTERS, LAB_LEVELS } from "../game/worlds/catalog.js";
import { ASSET_CATALOG, runtimeAsset } from "../game/asset-catalog.js";
import { AssetStore } from "../game/asset-store.js";

const out = process.argv[2] || "outputs/architecture-check";
const checks = [];
async function check(name, work) {
  const details = await work();
  checks.push({ name, ok: true, details });
  console.log(`PASS ${name}`);
}

// Controllers that record their builds; a world listed in `gates` builds once its gate resolves.
function fakeWorlds(ids, events, gates = {}) {
  return ids.map((id) => ({
    id,
    title: id,
    load: async () => ({
      default: class {
        constructor() {
          this.id = id;
          this.exit = { crossed: () => false };
          this.active = false;
          this.solution = false;
          this.initialized = false;
        }
        async build() {
          events.push(`build:${id}`);
          if (gates[id]) await gates[id].promise;
        }
        wire() {}
        enter() {
          assert.equal(this.initialized, true, `${id} entered before reset`);
          this.active = true;
        }
        leave() {
          this.active = false;
        }
        startStory() {}
        update() {}
        render() {}
        renderInto() {}
        reset() {
          this.initialized = true;
          this.solution = false;
        }
        solve() {
          this.solution = true;
        }
        resize() {}
      },
    }),
  }));
}

await check(
  "Chapters, lab entries and runtime assets keep their identifiers",
  () => {
    assert.deepEqual(
      CHAPTERS.map((chapter) => chapter.id),
      [
        "court",
        "floor",
        "checkpoint",
        "isles",
        "frost",
        "forest",
        "sea",
        "vault",
      ],
    );
    assert.deepEqual(
      WORLDS.map((world) => world.id),
      ["court", "two", "three", "four", "five", "six", "vault"],
    );
    assert.deepEqual(
      LAB_LEVELS.map((level) => level.name),
      WORLDS.map((world) => world.title),
    );
    const ids = ASSET_CATALOG.map((asset) => asset.id);
    assert.equal(new Set(ids).size, ids.length, "asset identifiers repeat");
    const missing = ids.filter(
      (id) => !existsSync(new URL(`../game/assets/${id}.js`, import.meta.url)),
    );
    assert.deepEqual(missing, [], "catalog entries without a factory");
    assert.equal(runtimeAsset("hero_explorer").id, "hero_realistic");
    assert.equal(runtimeAsset("sun_disc").id, "relay_orb");
    assert(runtimeAsset("hero_explorer").keepHierarchy);
    assert.throws(() => runtimeAsset("missing"), /Unknown asset/);
    return {
      worlds: WORLDS.length,
      chapters: CHAPTERS.length,
      assets: ids.length,
    };
  },
);

await check(
  "Asset probes deduplicate requests, cache empty factories and record failures",
  async () => {
    const calls = [],
      failures = [];
    const model = (meshes) => ({
      traverse: (visit) => visit({ isMesh: meshes }),
    });
    const assets = new AssetStore(
      async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith("/shield_console.js"))
          throw new Error("Unavailable factory");
        return model(!url.endsWith("/ice_block.js"));
      },
      () => {},
      (failure) => failures.push(failure),
    );
    await Promise.all([assets.probe("far_gate"), assets.probe("far_gate")]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.surfaces, false);
    assert(assets.has("far_gate"));
    assert.equal(await assets.make("ice_block"), null);
    assert.equal(await assets.make("ice_block"), null);
    assert.equal(
      calls.filter((c) => c.url.endsWith("/ice_block.js")).length,
      1,
    );
    await assert.rejects(assets.probe("shield_console"), /Unavailable factory/);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].name, "shield_console");
    assert.equal(failures[0].phase, "probe");
    assert(assets.failures.has("shield_console"));
    assert.equal(assets.pending.size, 0);
    return { requests: calls.length, failures: failures.length };
  },
);

await check(
  "Worlds load once, keep their state on return and defer solved predecessors",
  async () => {
    const events = [];
    const manager = new WorldManager({
      renderer: {},
      assets: {},
      services: () => ({}),
      definitions: fakeWorlds(
        WORLDS.map((world) => world.id),
        events,
      ),
    });
    const first = manager.ensure("court");
    assert.equal(manager.ensure("court"), first);
    await first;
    await manager.prepare("six");
    assert(manager.isPrepared("six"));
    assert.deepEqual(manager.telemetry().loaded.toSorted(), [
      "court",
      "five",
      "six",
      "vault",
    ]);
    assert.deepEqual(Object.keys(manager.telemetry()).toSorted(), [
      "loaded",
      "pending",
      "released",
      "residency",
      "resident",
    ]);
    manager.solveBefore("six");
    assert(manager.get("five").solution);
    manager.enter("six");
    await manager.prepare("five");
    assert(manager.get("four").solution, "a later predecessor loads solved");
    assert.equal(manager.get("four").exit.destination, manager.get("five"));
    const sea = manager.get("six");
    manager.enter("five");
    assert.equal(sea.active, false);
    manager.enter("six");
    assert.equal(manager.current, sea);
    assert.equal(events.filter((e) => e === "build:six").length, 1);
    manager.reset();
    assert.equal(manager.solved.size, 0);
    assert([...manager.instances.values()].every((world) => !world.solution));
    await manager.queue;
    assert.deepEqual(manager.telemetry().pending, []);
    return { loaded: manager.telemetry().loaded, events };
  },
);

await check(
  "A failed world load clears its request and can retry",
  async () => {
    let attempts = 0;
    const [definition] = fakeWorlds(["court"], []);
    const load = definition.load;
    definition.load = async () => {
      attempts++;
      if (attempts === 1) throw new Error("Temporary load failure");
      return load();
    };
    const manager = new WorldManager({
      renderer: {},
      assets: {},
      services: () => ({}),
      definitions: [definition],
    });
    await assert.rejects(manager.ensure("court"), /Temporary load failure/);
    assert.deepEqual(manager.telemetry().loaded, []);
    assert.deepEqual(manager.telemetry().pending, []);
    assert(manager.failures.has("court"));
    await manager.ensure("court");
    assert.equal(attempts, 2);
    assert.deepEqual(manager.telemetry().loaded, ["court"]);
    assert(!manager.failures.has("court"));
    return { attempts };
  },
);

await check(
  "Background preparation yields to foreground requests and crossing holds",
  async () => {
    const events = [];
    const gates = { b: Promise.withResolvers() };
    const ids = ["a", "b", "c", "d", "e"];
    const budget = new WorldWorkBudget();
    const manager = new WorldManager({
      definitions: fakeWorlds(ids, events, gates),
      services: () => ({}),
      retainAll: true,
      schedule: (work, job) => budget.run(work, job),
      yieldWork: () => budget.yield(),
    });
    await manager.ensure("a");
    manager.enter("a");
    manager.prefetch("a");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(manager.running?.job.background, true, "b runs in background");
    const d = manager.ensure("d");
    assert.equal(
      manager.running.job.background,
      false,
      "a waiting foreground request promotes the running job",
    );
    gates.b.resolve();
    await d;
    assert.deepEqual(events.slice(0, 3), ["build:a", "build:b", "build:d"]);
    await manager.queue;
    assert.deepEqual(manager.telemetry().loaded.toSorted(), ids);
    const held = new WorldManager({
      definitions: fakeWorlds(ids, []),
      services: () => ({}),
      schedule: (work, job) => budget.run(work, job),
    });
    let start = performance.now();
    budget.hold(300);
    await held.ensure("a", { background: true });
    const background = performance.now() - start;
    assert(background >= 280, `background ignored the hold (${background} ms)`);
    start = performance.now();
    budget.hold(2000);
    await held.ensure("b");
    const foreground = performance.now() - start;
    assert(
      foreground < 1500,
      `foreground waited for the hold (${foreground} ms)`,
    );
    start = performance.now();
    budget.hold(4000);
    const c = held.ensure("c", { background: true });
    setTimeout(() => held.ensure("c"), 100);
    await c;
    const promoted = performance.now() - start;
    assert(promoted < 3000, `a promoted job kept waiting (${promoted} ms)`);
    return { order: events, background, foreground, promoted };
  },
);

await check(
  "Settling finishes every queued world in the foreground",
  async () => {
    const budget = new WorldWorkBudget();
    const manager = new WorldManager({
      definitions: fakeWorlds(["p", "q", "r", "s"], []),
      services: () => ({}),
      retainAll: true,
      schedule: (work, job) => budget.run(work, job),
    });
    await manager.ensure("p");
    manager.enter("p");
    budget.hold(10000);
    manager.prefetch("p");
    const progress = [];
    const start = performance.now();
    await manager.settle((done, total) => progress.push(`${done}/${total}`));
    assert(performance.now() - start < 5000, "settling waited for the hold");
    assert.deepEqual(manager.telemetry().loaded.toSorted(), [
      "p",
      "q",
      "r",
      "s",
    ]);
    const [done, total] = progress.at(-1).split("/");
    assert.equal(done, total);
    return { progress };
  },
);

await check(
  "A start's preparation list matches what settling prepares",
  async () => {
    const events = [];
    const gates = { q: Promise.withResolvers() };
    const manager = new WorldManager({
      definitions: fakeWorlds(["p", "q", "r", "s"], events, gates),
      services: () => ({}),
      retainAll: true,
    });
    await manager.ensure("p");
    manager.enter("p");
    manager.prefetch("p");
    await new Promise((r) => setTimeout(r, 20));
    const list = manager.toPrepare("p");
    assert.deepEqual(
      list.map(({ id }) => id).toSorted(),
      ["q", "r", "s"],
      "every unprepared world is listed once, the resident start left out",
    );
    assert.deepEqual(
      list.filter(({ running }) => running).map(({ id }) => id),
      ["q"],
      "the world being prepared is marked as running",
    );
    assert.deepEqual(manager.toPrepare("p", { ahead: false }), []);
    gates.q.resolve();
    await manager.settle();
    assert.deepEqual(
      events.filter((event) => event !== "build:p").toSorted(),
      list.map(({ id }) => `build:${id}`).toSorted(),
    );
    assert.deepEqual(manager.toPrepare("p"), []);
    return { list };
  },
);

await check(
  "A start from the menus waits for its window alone, requested together",
  async () => {
    const events = [];
    const gates = { q: Promise.withResolvers() };
    const ids = ["p", "q", "r", "s", "t", "u", "v"];
    const budget = new WorldWorkBudget();
    const manager = new WorldManager({
      definitions: fakeWorlds(ids, events, gates),
      services: () => ({}),
      retainAll: true,
      schedule: (work, job) => budget.run(work, job),
      yieldWork: () => budget.yield(),
    });
    await manager.ensure("p");
    manager.enter("p");
    manager.prefetch("p");
    await new Promise((r) => setTimeout(r, 20));
    const list = manager.toPrepare("u", { ahead: false, around: true });
    assert.deepEqual(
      list.map(({ id }) => id).toSorted(),
      ["q", "t", "u", "v"],
      "the start, its neighbours and the preparation it waits behind",
    );
    const prepared = manager.prepare("u");
    gates.q.resolve();
    await prepared;
    assert.deepEqual(
      events.slice(1),
      ["build:q", "build:t", "build:u", "build:v"],
      "no queued world slips in before the window",
    );
    assert(manager.pending.has("r") && manager.pending.has("s"));
    await manager.queue;
    assert.deepEqual(manager.telemetry().loaded.toSorted(), ids);
    return { list, order: events };
  },
);

await check("The page preloads every module the title imports", () =>
  execFileSync(
    process.execPath,
    [new URL("./boot-preload.mjs", import.meta.url).pathname, "--check"],
    { encoding: "utf8" },
  ).trim(),
);

await mkdir(out, { recursive: true });
await writeFile(`${out}/checks.json`, JSON.stringify(checks, null, 2) + "\n");
