export class Credits {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.roll = root.querySelector(".roll");
    this.running = false;
  }

  play(onDone, { speed = 52, linger = false } = {}) {
    this.onDone = onDone;
    this.speed = speed;
    this.linger = linger;
    this.root.classList.toggle("space", linger);
    this.root.hidden = false;
    this.running = true;
    this.y = innerHeight;
    this.hold = 0;
    this.age = 0;
    this.place();
  }

  place() {
    this.roll.style.transform = `translate(-50%, ${this.y.toFixed(1)}px)`;
  }

  update(dt) {
    if (!this.running) return;
    this.age += dt;
    // Ignore the key that may still be down from the moment the roll began.
    if (
      this.age > 0.6 &&
      (this.input.pressed("skip") || this.input.pressed("pause"))
    )
      return this.stop(true);
    const last = this.roll.querySelector(".end");
    const stop = innerHeight * 0.45 - last.offsetTop;
    if (this.y > stop) this.y = Math.max(stop, this.y - dt * this.speed);
    else if (!this.linger && (this.hold += dt) > 3.5) return this.stop(true);
    this.place();
  }

  stop(finished = false) {
    if (!this.running) return;
    this.running = false;
    this.root.hidden = true;
    this.root.classList.remove("space");
    const done = this.onDone;
    this.onDone = null;
    if (finished) done?.();
  }
}
