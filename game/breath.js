import { tuning } from "./combat-tuning.js";

export class Breath {
  constructor(capacity = 45) {
    this.base = capacity;
    this.capacity = capacity * tuning().breath;
    this.reset();
  }

  reset() {
    this.capacity = this.base * tuning().breath;
    this.remaining = this.capacity;
    this.ratio = 1;
    this.submerged = false;
    this.drowning = 0;
  }

  update(dt, submerged, onDrown) {
    const capacity = this.base * tuning().breath;
    if (capacity !== this.capacity) {
      this.remaining *= capacity / this.capacity;
      this.capacity = capacity;
    }
    this.submerged = submerged;
    this.remaining = Math.max(
      0,
      Math.min(this.capacity, this.remaining + dt * (submerged ? -1 : 12)),
    );
    this.ratio = this.remaining / this.capacity;
    if (this.remaining > 0 || !submerged) this.drowning = 0;
    else {
      this.drowning += dt;
      if (this.drowning >= 2) {
        this.drowning -= 2;
        onDrown?.();
      }
    }
  }
}
