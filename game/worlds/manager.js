import { WORLDS } from "./catalog.js";
import { WorldGPUCache } from "./gpu-cache.js";

const LIFECYCLE = [
  "build",
  "wire",
  "enter",
  "leave",
  "startStory",
  "update",
  "render",
  "renderInto",
  "reset",
  "solve",
  "resize",
];

export class WorldManager {
  constructor({
    renderer,
    assets,
    services,
    provided = {},
    onBuilt = () => {},
    beforeWire = () => {},
    onRestore = () => {},
    onEvent = () => {},
    yieldWork = async () => {},
    schedule = (work) => work(),
    onBackgroundError = () => {},
    definitions = WORLDS,
    retainAll = false,
    keepPrevious = true,
    residency = null,
  }) {
    Object.assign(this, {
      renderer,
      assets,
      services,
      provided,
      onBuilt,
      beforeWire,
      onRestore,
      onEvent,
      schedule,
      onBackgroundError,
      definitions,
      yieldWork,
      retainAll,
      keepPrevious,
      residency,
    });
    this.instances = new Map();
    this.pending = new Map();
    this.jobs = new Map();
    this.failures = new Map();
    this.solved = new Set();
    this.waiting = [];
    this.running = null;
    this.idle = null;
    this.queue = Promise.resolve();
    this.current = null;
    this.desired = null;
    this.trimPending = false;
    this.gpuCache = new WorldGPUCache(yieldWork);
  }

  definition(id) {
    const definition = this.definitions.find((world) => world.id === id);
    if (!definition) throw new Error(`Unknown world: ${id}`);
    return definition;
  }

  get(id) {
    return this.instances.get(id);
  }

  neighbors(id) {
    const index = this.definitions.indexOf(this.definition(id));
    return this.definitions.slice(Math.max(0, index - 1), index + 2);
  }

  // The worlds kept uploaded around one: its neighbours, or on small budgets the world and its next.
  window(id) {
    const index = this.definitions.indexOf(this.definition(id));
    return this.neighbors(id).filter(
      (world) => this.keepPrevious || this.definitions.indexOf(world) >= index,
    );
  }

  isPrepared(id) {
    return this.window(id).every((world) => this.isResident(world.id));
  }

  isResident(id) {
    return this.get(id)?.gpuResident === true;
  }

  async prepare(id) {
    this.onEvent("prepare", { id });
    this.desired = id;
    await this.ensure(id);
    for (const definition of this.window(id)) await this.ensure(definition.id);
    return this.get(id);
  }

  // Neighbors first, then (when every world stays resident) the rest by distance; a far world
  // already built is restored when needed rather than ahead.
  ahead(id) {
    const index = this.definitions.indexOf(this.definition(id));
    return this.definitions
      .map((definition, at) => ({ definition, at }))
      .filter(({ at }) =>
        this.retainAll
          ? at !== index
          : Math.abs(at - index) === 1 && (this.keepPrevious || at > index),
      )
      .sort(
        (a, b) =>
          Math.abs(a.at - index) - Math.abs(b.at - index) || b.at - a.at,
      )
      .filter(
        ({ definition, at }) =>
          Math.abs(at - index) <= 1 || !this.get(definition.id),
      )
      .map(({ definition }) => definition);
  }

  prefetch(id) {
    this.desired = id;
    for (const definition of this.ahead(id)) {
      if (this.isResident(definition.id) || this.pending.has(definition.id))
        continue;
      this.ensure(definition.id, { background: true }).catch((error) => {
        this.failures.set(definition.id, String(error.message || error));
        this.onBackgroundError(definition.id, error);
      });
    }
    this.scheduleTrim();
  }

  // What a start at `id` prepares before play: the world, every queued preparation and, `ahead`,
  // what `prefetch` adds; settling runs them all.
  toPrepare(id, { ahead = true } = {}) {
    const ids = new Set([
      id,
      ...(ahead ? this.pending.keys() : []),
      ...(ahead ? this.ahead(id).map((definition) => definition.id) : []),
    ]);
    const running = [...this.jobs].find(
      ([, job]) => job === this.running?.job,
    )?.[0];
    return [...ids]
      .filter((world) => !this.isResident(world))
      .map((world) => ({
        id: world,
        restore: !!this.get(world),
        running: world === running,
      }));
  }

  ensure(id, { background = false } = {}) {
    this.definition(id);
    if (this.isResident(id)) return Promise.resolve(this.get(id));
    if (this.pending.has(id)) {
      const job = this.jobs.get(id);
      if (!background && job.background) {
        job.background = false;
        this.promote();
      }
      return this.pending.get(id);
    }
    const job = { background, phase: "queued" };
    this.onEvent("scheduled", { id, background });
    this.jobs.set(id, job);
    const request = this.enqueue(job, () => this.load(id, job));
    this.pending.set(id, request);
    request.then(
      () => {
        this.pending.delete(id);
        this.jobs.delete(id);
        this.scheduleTrim();
      },
      (error) => {
        this.pending.delete(id);
        this.jobs.delete(id);
        this.failures.set(id, String(error?.message || error));
        this.onEvent("failed", {
          id,
          phase: job.phase,
          background: job.background,
          message: String(error?.message || error),
          stack: String(error?.stack || error),
        });
      },
    );
    if (!background) this.promote();
    return request;
  }

  async load(id, job) {
    const cached = this.get(id);
    this.onEvent(cached ? "restore" : "build", {
      id,
      background: job.background,
    });
    if (cached) {
      job.phase = "restore";
      await this.onRestore(id, cached, job);
      cached.gpuResident = true;
      this.onEvent("prepared", { id, restored: true });
      this.failures.delete(id);
      return cached;
    }
    const definition = this.definition(id);
    if (!this.provided[id]) this.assets?.prefetch?.();
    const services = this.services();
    job.phase = "module";
    const instance =
      this.provided[id] ||
      new (await definition.load()).default(
        this.renderer,
        this.assets,
        services,
      );
    instance.services = services;
    // A world's module and constructor run apart from the first steps of its build.
    await this.yieldWork();
    job.phase = "build";
    for (const method of LIFECYCLE)
      if (typeof instance[method] !== "function")
        throw new Error(`${id} has no ${method} lifecycle method`);
    await instance.build();
    job.phase = "dependencies";
    this.onEvent("dependencies", { id });
    await this.beforeWire(id, instance, job);
    const wiredServices = this.services();
    instance.services = wiredServices;
    job.phase = "wire";
    await instance.wire(wiredServices);
    this.onEvent("wired", { id });
    job.phase = "reset";
    instance.reset();
    job.phase = "prepare";
    await this.onBuilt(id, instance, job);
    if (this.solved.has(id)) {
      job.phase = "solve";
      instance.solve();
    }
    instance.gpuResident = true;
    this.instances.set(id, instance);
    this.failures.delete(id);
    this.connect();
    this.onEvent("prepared", { id, restored: false });
    return instance;
  }

  // Jobs run one at a time; a waiting foreground job goes next and stops the running one from yielding.
  enqueue(job, work) {
    const request = new Promise((resolve, reject) =>
      this.waiting.push({ job, work, resolve, reject }),
    );
    if (!this.idle) {
      let settle;
      this.queue = new Promise((resolve) => (settle = resolve));
      this.idle = settle;
    }
    queueMicrotask(() => this.pump());
    return request;
  }

  promote() {
    if (
      this.running?.job.background &&
      this.waiting.some((e) => !e.job.background)
    )
      this.running.job.background = false;
  }

  // Finishes every queued preparation in the foreground, reporting how many remain.
  async settle(onProgress = () => {}) {
    const total = this.waiting.length + (this.running ? 1 : 0);
    while (this.running || this.waiting.length) {
      for (const entry of this.waiting) entry.job.background = false;
      if (this.running) this.running.job.background = false;
      onProgress(total - this.waiting.length - (this.running ? 1 : 0), total);
      await (this.running?.done ?? this.queue);
    }
    onProgress(total, total);
  }

  pump() {
    if (this.running) return;
    const index = Math.max(
      0,
      this.waiting.findIndex((entry) => !entry.job.background),
    );
    const entry = this.waiting.splice(index, 1)[0];
    if (!entry) {
      const idle = this.idle;
      this.idle = null;
      idle?.();
      return;
    }
    this.running = entry;
    this.promote();
    entry.done = Promise.resolve()
      .then(() => this.schedule(entry.work, entry.job))
      .then(entry.resolve, entry.reject)
      .finally(() => {
        this.running = null;
        this.pump();
      });
  }

  scheduleTrim() {
    if (!this.desired || this.trimPending) return;
    this.trimPending = true;
    const job = { background: true, phase: "trim" };
    this.enqueue(job, async () => {
      const protectedIds = new Set([
        ...this.window(this.desired).map((world) => world.id),
        ...(this.current
          ? this.window(this.definitionForCurrent().id).map((world) => world.id)
          : []),
        ...this.pending.keys(),
      ]);
      const retained = [...this.instances]
        .filter(([id]) => this.retainAll || protectedIds.has(id))
        .map(([, world]) => world);
      for (const [id, world] of this.instances) {
        if (!protectedIds.has(id) && world.gpuResident)
          await this.gpuCache.release(world, retained, {
            targetsOnly: this.retainAll,
          });
      }
    })
      .catch((error) => this.onBackgroundError("resources", error))
      .finally(() => {
        this.trimPending = false;
      });
  }

  connect() {
    for (const [index, definition] of this.definitions.entries()) {
      const current = this.get(definition.id);
      if (!current) continue;
      const previous = this.get(this.definitions[index - 1]?.id);
      const next = this.doorTo(index) ? this.get(this.doorTo(index).id) : null;
      if (next && current.exit) current.exit.destination = next;
      current.connect?.({ previous, next });
    }
  }

  enter(id, options = {}) {
    const next = this.get(id);
    if (!this.isResident(id))
      throw new Error(`World ${id} must be prepared before entering`);
    if (this.current !== next) this.current?.leave();
    this.current = next;
    next.enter(options);
    this.onEvent("entered", { id });
    this.scheduleTrim();
    return next;
  }

  reset() {
    this.solved.clear();
    for (const world of this.instances.values()) world.reset();
  }

  solveBefore(id) {
    const index = this.definitions.indexOf(this.definition(id));
    for (const world of this.definitions.slice(0, index)) {
      this.solved.add(world.id);
      this.get(world.id)?.solve();
    }
  }

  update(dt, hero, state, commands) {
    this.current.update(dt, hero, state, commands);
  }

  render(camera, dt) {
    this.current.beforeRender?.(camera);
    this.current.render(camera, dt);
  }

  crossing(hero) {
    const definition = this.definitionForCurrent();
    const index = this.definitions.indexOf(definition);
    if (this.current.returnCrossed?.(hero))
      return {
        to: this.definitions[index - 1].id,
        opts: { back: true, x: hero.pos.x - this.current.gateCenter.x },
      };
    if (this.doorTo(index) && this.current.exit.crossed(hero))
      return { to: this.definitions[index + 1].id, opts: {} };
    return null;
  }

  // The world behind a world's exit door; one entered from its predecessor's finale has none.
  doorTo(index) {
    const next = this.definitions[index + 1];
    return next && next.entry !== "finale" ? next : null;
  }

  // The world a world's finale leads on to, when the campaign does not end there.
  finaleTo(index) {
    const next = this.definitions[index + 1];
    return next?.entry === "finale" ? next : null;
  }

  definitionForCurrent() {
    for (const [id, instance] of this.instances)
      if (instance === this.current) return this.definition(id);
    throw new Error("No active world");
  }

  resize(width, height) {
    for (const world of this.instances.values())
      if (world.gpuResident) world.resize(width, height);
  }

  telemetry() {
    return {
      loaded: [...this.instances.keys()],
      pending: [...this.pending.keys()],
      resident: [...this.instances]
        .filter(([, world]) => world.gpuResident)
        .map(([id]) => id),
      released: { ...this.gpuCache.released },
      residency: this.residency ?? {
        tier: this.retainAll ? "all" : this.keepPrevious ? "neighbors" : "next",
      },
    };
  }

  streaming() {
    return {
      jobs: [...this.jobs].map(([id, job]) => ({ id, ...job })),
      background: [...this.jobs]
        .filter(([, job]) => job.background)
        .map(([id]) => id),
      failures: Object.fromEntries(this.failures),
    };
  }
}
