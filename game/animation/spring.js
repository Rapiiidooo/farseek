export class Spring {
  constructor(v = 0) {
    this.v = v;
    this.dv = 0;
  }

  step(target, dt, freq, damping) {
    const w = freq * Math.PI * 2;
    // Semi-implicit Euler turns unstable once w·h nears 1 with this much damping, so
    // substep until each step is a small fraction of the spring's period.
    const n = Math.max(1, Math.ceil(dt * w * 4));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = w * w * (target - this.v) - 2 * damping * w * this.dv;
      this.dv += a * h;
      this.v += this.dv * h;
    }
    return this.v;
  }
}
