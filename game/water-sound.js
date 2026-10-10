export class WaterSound {
  // `input` carries what is heard in the world; the filter closes over it as the head goes under.
  constructor(ctx, input, output, effects, noise) {
    Object.assign(this, { ctx, effects, noise });
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 18000;
    this.filter.Q.value = 0.55;
    input.connect(this.filter).connect(output);
    this.phase = null;
    this.wet = null;
    this.bubbleClock = 1.8;
    this.counts = { strokes: 0, kicks: 0, bubbles: 0, air: 0 };
  }

  update(dt, hero, immersion = 0, phase = 0) {
    const water = Math.max(0, Math.min(1, immersion));
    const t = this.ctx.currentTime;
    this.immersion = water;
    this.filter.frequency.setTargetAtTime(18000 - water * 17050, t, 0.16);
    const wet = water > 0.5;
    if (this.wet === true && !wet) this.air();
    this.wet = wet;
    if (!hero.swimming || !wet) {
      this.phase = null;
      this.bubbleClock = 1.8;
      return;
    }
    const effort = Math.min(
      1,
      Math.hypot(hero.swimSpeed, hero.swimVertical) / 3.2,
    );
    const cycle = phase / (Math.PI * 2);
    if (this.phase !== null && cycle >= this.phase && effort > 0.08) {
      for (const [at, kick] of [
        [0.18, false],
        [0.57, true],
      ]) {
        if (Math.floor(cycle - at) > Math.floor(this.phase - at))
          this.stroke(effort, kick);
      }
    }
    this.phase = cycle;
    this.bubbleClock -= dt;
    if (this.bubbleClock <= 0) {
      this.bubbleClock = 2.6 - effort * 1.1 + Math.random() * 0.5;
      this.bubble(0.35 + effort * 0.65);
    }
  }

  wash(from, to, duration, level) {
    const { ctx } = this;
    const at = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.65;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + duration);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(band).connect(gain).connect(this.effects);
    source.onended = () => {
      source.disconnect();
      band.disconnect();
      gain.disconnect();
    };
    source.start(at, Math.random(), duration + 0.05);
  }

  stroke(effort, kick = false) {
    this.counts[kick ? "kicks" : "strokes"]++;
    this.wash(
      kick ? 180 : 420,
      kick ? 90 : 160,
      kick ? 0.23 : 0.38,
      (kick ? 0.06 : 0.1) * Math.max(0.15, effort),
    );
  }

  bubble(strength = 1) {
    this.counts.bubbles++;
    const { ctx } = this;
    const at = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const start = at + i * 0.09;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      const base = 210 + Math.random() * 150;
      oscillator.frequency.setValueAtTime(base, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        base * 2.4,
        start + 0.075,
      );
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.032 * strength, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      pan.pan.value = (Math.random() - 0.5) * 0.6;
      oscillator.connect(gain).connect(pan).connect(this.effects);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        pan.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.13);
    }
  }

  air() {
    this.counts.air++;
    this.wash(1200, 380, 0.65, 0.085);
  }
}
