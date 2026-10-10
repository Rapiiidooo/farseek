export class WorldWorkBudget {
  constructor(milliseconds = 4) {
    this.milliseconds = milliseconds;
    this.deadline = 0;
    this.job = null;
    this.yields = 0;
    this.quietUntil = 0;
  }

  // Background work waits out cinematic moments such as a door crossing.
  hold(milliseconds) {
    this.quietUntil = Math.max(
      this.quietUntil,
      performance.now() + milliseconds,
    );
  }

  async run(work, job) {
    this.job = job;
    this.deadline = performance.now();
    try {
      await this.yield();
      return await work();
    } finally {
      this.job = null;
    }
  }

  async yield(force = false) {
    if (!this.job?.background) return;
    if (!force && performance.now() < this.deadline) return;
    this.yields++;
    do {
      if (globalThis.scheduler?.postTask)
        await globalThis.scheduler.postTask(() => {}, {
          priority: "background",
        });
      else
        await new Promise((resolve) => {
          if (globalThis.requestIdleCallback)
            requestIdleCallback(resolve, { timeout: 50 });
          else setTimeout(resolve, 0);
        });
      const quiet = this.quietUntil - performance.now();
      if (quiet > 0 && this.job?.background)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(quiet, 250)),
        );
    } while (this.job?.background && performance.now() < this.quietUntil);
    this.deadline = performance.now() + this.milliseconds;
  }

  // GPU uploads queue behind the frame; one heavy step per frame keeps the queue from stalling a later frame.
  async frame() {
    if (!this.job?.background) return;
    if (globalThis.requestAnimationFrame)
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await this.yield(true);
  }
}
