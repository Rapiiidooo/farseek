// Each world's air: looping beds, scattered one-shots placed around the listener, and local
// sources (fires, the bog, vents, frozen falls, open doors) panned and attenuated by distance.
import { BRAZIERS } from "./court.js";
import { BOG, bogEdge } from "./forest-bog.js";

// Mirrors the frozen falls placed by frozen.js: [x, z of the face, ground].
const FROST_FALLS = [
  [-10, -3, 0],
  [10, -10, 0],
  [-7.5, -163, 0.6],
  [8, -163, 0.6],
];

// Beds: noise colour, filter, level, how far gusts wander the band and the level, and for the
// sea whether the layer belongs under water or in the shield's air.
const BEDS = {
  court: [
    {
      noise: "white",
      type: "bandpass",
      f: 380,
      q: 0.7,
      level: 0.07,
      swing: 160,
      gust: 0.4,
    },
    {
      noise: "white",
      type: "highpass",
      f: 5200,
      q: 0.4,
      level: 0.012,
      gust: 0.8,
      rate: 0.17,
    },
  ],
  two: [
    {
      noise: "white",
      type: "bandpass",
      f: 240,
      q: 0.9,
      level: 0.09,
      swing: 70,
      gust: 0.4,
    },
    {
      noise: "brown",
      type: "lowpass",
      f: 140,
      q: 0.5,
      level: 0.05,
      gust: 0.25,
      rate: 0.06,
    },
  ],
  three: [
    {
      noise: "white",
      type: "bandpass",
      f: 620,
      q: 0.55,
      level: 0.09,
      swing: 240,
      gust: 0.4,
    },
    {
      noise: "white",
      type: "bandpass",
      f: 1900,
      q: 4,
      level: 0.014,
      swing: 520,
      gust: 0.9,
      rate: 0.29,
    },
    {
      noise: "brown",
      type: "lowpass",
      f: 320,
      q: 0.5,
      level: 0.07,
      gust: 0.3,
      rate: 0.07,
    },
  ],
  four: [
    {
      noise: "white",
      type: "bandpass",
      f: 950,
      q: 2.2,
      level: 0.1,
      swing: 320,
      gust: 0.4,
    },
    {
      noise: "white",
      type: "bandpass",
      f: 480,
      q: 0.8,
      level: 0.06,
      swing: 120,
      gust: 1,
      rate: 0.11,
    },
  ],
  forest: [
    {
      noise: "white",
      type: "bandpass",
      f: 1600,
      q: 0.5,
      level: 0.035,
      swing: 400,
      gust: 0.4,
    },
    {
      noise: "white",
      type: "bandpass",
      f: 3400,
      q: 0.7,
      level: 0.014,
      swing: 600,
      gust: 0.9,
      rate: 0.19,
    },
    {
      noise: "brown",
      type: "lowpass",
      f: 220,
      q: 0.5,
      level: 0.035,
      gust: 0.2,
    },
  ],
  sea: [
    {
      noise: "white",
      type: "bandpass",
      f: 210,
      q: 0.8,
      level: 0.08,
      swing: 90,
      gust: 0.4,
    },
    {
      noise: "brown",
      type: "lowpass",
      f: 110,
      q: 0.7,
      level: 0.14,
      gust: 0.35,
      rate: 0.05,
      under: true,
    },
    {
      noise: "brown",
      type: "lowpass",
      f: 360,
      q: 0.6,
      level: 0.06,
      gust: 0.3,
      dry: true,
    },
  ],
  space: [
    { noise: "brown", type: "lowpass", f: 160, q: 0.4, level: 0.02, gust: 0.2 },
  ],
  // The builders' vault: a stone hall's still air, a low rumble of the rock round it and a
  // faint resonance of the network in its walls.
  vault: [
    {
      noise: "brown",
      type: "lowpass",
      f: 95,
      q: 0.5,
      level: 0.06,
      gust: 0.15,
      rate: 0.04,
    },
    {
      noise: "white",
      type: "bandpass",
      f: 520,
      q: 3,
      level: 0.012,
      swing: 60,
      gust: 0.5,
      rate: 0.07,
    },
    {
      noise: "white",
      type: "highpass",
      f: 4200,
      q: 0.4,
      level: 0.005,
      gust: 0.6,
      rate: 0.11,
    },
  ],
};

// One-shots: what, how often in seconds, and for the sea whether under water or in the air.
const EVENTS = {
  court: [{ kind: "insects", every: [4, 11] }],
  two: [
    { kind: "cricket", every: [0.45, 1.5] },
    { kind: "clatter", every: [7, 16] },
  ],
  three: [
    { kind: "creak", every: [5, 12] },
    { kind: "timber", every: [8, 18] },
  ],
  four: [
    { kind: "groan", every: [7, 15] },
    { kind: "crack", every: [10, 24] },
    { kind: "sift", every: [6, 13] },
  ],
  forest: [
    { kind: "bird", every: [1.2, 4.7] },
    { kind: "boar", every: [22, 45] },
    { kind: "leaves", every: [3, 8] },
  ],
  sea: [
    { kind: "bubbles", every: [2, 6], under: true },
    { kind: "deep", every: [12, 26], under: true },
    { kind: "drip", every: [1.4, 4.5], dry: true },
  ],
  space: [{ kind: "tone", every: [5, 11] }],
  vault: [
    { kind: "sift", every: [9, 20] },
    { kind: "drip", every: [4, 11] },
    { kind: "tone", every: [16, 34] },
  ],
};

// Each place's level in dB, measured to sit about -24 LUFS under the music (space lower).
const TRIM = {
  court: 1.3,
  two: 5.8,
  three: -1.6,
  four: 1.9,
  forest: 2.1,
  sea: 2.1,
  space: 6.5,
  vault: 2.4,
};
const SPACE_TONES = [72, 74, 76, 79, 81, 84, 86, 88];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Ambience {
  constructor(sound) {
    this.sound = sound;
    const ctx = (this.ctx = sound.ctx);
    this.out = sound.ambienceBus;
    this.place = null;
    this.layer = null;
    this.timers = new Map();
    this.emitters = new Map();
    this.emitterClock = 0;
    this.immersion = 0;
    this.counts = { events: 0, sources: 0, crossings: 0 };
    this.recent = [];
    this.white = noiseBuffer(ctx, "white", 4);
    this.brown = noiseBuffer(ctx, "brown", 4);
    this.crackle = crackleBuffer(ctx, 3);
    this.bubbling = bubblingBuffer(ctx, 3);
  }

  setPlace(place) {
    if (place === this.place) return;
    const now = this.ctx.currentTime;
    const crossing = now - (this.sound.crossingAt ?? -9) < 1.6;
    this.release(this.layer, crossing ? 0.12 : 0.9);
    for (const id of [...this.emitters.keys()]) this.dropEmitter(id, 0.3);
    this.timers.clear();
    this.place = place;
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.out);
    const beds = (BEDS[place] || []).map((spec) => this.bed(spec, bus));
    const level = 10 ** ((TRIM[place] ?? 0) / 20);
    this.layer = { place, bus, beds, at: now, level };
    bus.gain.setTargetAtTime(
      level,
      now + (crossing ? 0.3 : 0.05),
      crossing ? 0.9 : 1.2,
    );
    for (const e of EVENTS[place] || [])
      this.timers.set(e, e.every[0] * (0.5 + Math.random()));
  }

  // The doorway: the world behind falls away under the whoosh; the next one rises after.
  crossing() {
    this.counts.crossings++;
    const t = this.ctx.currentTime;
    const L = this.layer;
    if (L) {
      const g = L.bus.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      // A place entered just before the whoosh (the space door) waits for the membrane instead.
      if (t - L.at < 0.3) g.setTargetAtTime(L.level, t + 0.3, 0.9);
      else g.setTargetAtTime(0.15 * L.level, t, 0.25);
    }
    for (const e of this.emitters.values()) if (e.kind === "gate") e.swell = 1;
  }

  bed(spec, bus) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = spec.noise === "brown" ? this.brown : this.white;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.value = spec.f;
    filter.Q.value = spec.q;
    const gain = ctx.createGain();
    gain.gain.value = spec.under ? 0 : spec.level;
    src.connect(filter).connect(gain).connect(bus);
    src.start(ctx.currentTime, Math.random() * 3);
    return { spec, src, filter, gain, phase: Math.random() * 20 };
  }

  release(layer, tau) {
    if (!layer) return;
    const t = this.ctx.currentTime;
    layer.bus.gain.cancelScheduledValues(t);
    layer.bus.gain.setValueAtTime(layer.bus.gain.value, t);
    layer.bus.gain.setTargetAtTime(0, t, tau);
    for (const b of layer.beds) {
      b.src.stop(t + tau * 6 + 0.1);
      b.src.onended = () => {
        b.src.disconnect();
        b.filter.disconnect();
        b.gain.disconnect();
      };
    }
    setTimeout(() => layer.bus.disconnect(), (tau * 6 + 0.5) * 1000);
  }

  // frame: { hero, immersion, gates, vents, camera position, cameraMatrix elements }
  update(dt, frame) {
    if (!this.layer || !(dt > 0)) return;
    const t = this.ctx.currentTime;
    this.immersion = frame.immersion || 0;
    for (const [e, left] of this.timers) {
      const next = left - dt;
      if (next > 0) {
        this.timers.set(e, next);
        continue;
      }
      this.timers.set(
        e,
        e.every[0] + Math.random() * (e.every[1] - e.every[0]),
      );
      const wet = this.immersion > 0.5;
      if ((e.under && !wet) || (e.dry && wet)) continue;
      this.event(e.kind);
    }
    if ((this.emitterClock -= dt) <= 0) {
      this.emitterClock = 1 / 15;
      for (const b of this.layer.beds) this.gust(b, t);
      this.updateEmitters(frame, t);
    }
  }

  gust(b, t) {
    const s = b.spec,
      p = b.phase,
      rate = s.rate ?? 0.13;
    let level =
      s.level *
      Math.max(
        0,
        1 +
          Math.sin((t + p) * rate) *
            s.gust *
            (1 + 0.3 * Math.sin((t + p) * rate * 2.7)),
      );
    if (s.under) level *= this.immersion;
    if (s.dry) level *= 1 - this.immersion;
    b.gain.gain.setTargetAtTime(level, t, 0.8);
    if (s.swing)
      b.filter.frequency.setTargetAtTime(
        Math.max(
          40,
          s.f +
            Math.sin((t + p) * 0.21) * s.swing +
            Math.sin((t + p) * 0.73) * s.swing * 0.4,
        ),
        t,
        0.5,
      );
  }

  // A one-shot somewhere around: its own pan and distance, a darker tone when farther.
  event(kind, options = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02 + (options.delay || 0);
    const far = options.far ?? 0.35 + Math.random() * 0.65;
    const pan = ctx.createStereoPanner();
    pan.pan.value = options.pan ?? (Math.random() * 2 - 1) * 0.85;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1800 + 9000 * far;
    const gain = ctx.createGain();
    gain.gain.value = far;
    tone
      .connect(gain)
      .connect(pan)
      .connect(this.layer?.bus || this.out);
    const end = this.voice(kind, t, tone);
    this.counts.events++;
    this.recent.push({ kind, at: +t.toFixed(2), place: this.place });
    if (this.recent.length > 24) this.recent.shift();
    const stopper = ctx.createConstantSource();
    stopper.offset.value = 0;
    stopper.connect(gain);
    stopper.onended = () => {
      stopper.disconnect();
      tone.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    stopper.start(t);
    stopper.stop(t + end + 0.2);
  }

  voice(kind, t, into) {
    const S = this.sound,
      r = Math.random;
    switch (kind) {
      case "insects": {
        const f = 4300 + r() * 900,
          length = 1.4 + r() * 1.8;
        this.buzz(t, f, 6, 44 + r() * 20, length, 0.014, into);
        return length;
      }
      case "cricket": {
        const f = 4200 + r() * 700;
        for (let i = 0; i < 3; i++)
          this.chirp(t + i * 0.034, f, 0.018, 0.012, into);
        return 0.15;
      }
      case "clatter": {
        const n = 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const at = t + i * (0.07 + r() * 0.08);
          this.noiseHit(at, "bandpass", 900 + r() * 700, 2, 0.06, 0.05, into);
          S.ring(170 + r() * 40, at, 0.12, 0.03, into, "sine", 0.002);
        }
        this.echo(t, n * 0.12, into);
        return n * 0.15 + 1;
      }
      case "creak": {
        const length = 0.4 + r() * 0.5;
        this.creak(t, 30 + r() * 30, 620 + r() * 300, length, 0.03, into);
        return length;
      }
      case "timber": {
        const length = 0.6 + r() * 0.6;
        this.creak(t, 20 + r() * 15, 320 + r() * 140, length, 0.035, into);
        return length;
      }
      case "groan": {
        const length = 1 + r() * 1.2;
        this.groan(t, 48 + r() * 24, 180 + r() * 120, length, 0.035, into);
        return length;
      }
      case "crack": {
        this.noiseHit(t, "highpass", 1500, 0.7, 0.03, 0.08, into);
        this.noiseHit(t + 0.01, "lowpass", 420, 0.7, 1.2, 0.05, into, 0.01);
        this.echo(t, 0.3, into);
        return 1.6;
      }
      case "sift": {
        this.noiseHit(t, "highpass", 6000, 0.5, 1.4, 0.012, into, 0.6);
        return 1.5;
      }
      case "bird":
        return this.bird(t, into);
      case "boar": {
        const n = 1 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++)
          this.grunt(t + i * 0.32, 80 + r() * 25, 0.3, 0.05, into);
        return n * 0.35 + 0.1;
      }
      case "leaves": {
        const length = 0.6 + r() * 0.8;
        for (let at = 0; at < length; at += 0.05 + r() * 0.09)
          this.noiseHit(
            t + at,
            "bandpass",
            2800 + r() * 2400,
            0.9,
            0.08,
            0.008 + r() * 0.01,
            into,
          );
        return length + 0.1;
      }
      case "bubbles": {
        const n = 4 + Math.floor(r() * 6);
        for (let i = 0; i < n; i++)
          this.blip(t + i * (0.05 + r() * 0.08), 300 + r() * 500, 0.03, into);
        return n * 0.13;
      }
      case "deep": {
        const length = 1.6 + r();
        this.groan(t, 34 + r() * 14, 110 + r() * 40, length, 0.05, into);
        return length;
      }
      case "drip": {
        this.drip(t, 0.028, into);
        this.drip(t + 0.17, 0.008, into);
        return 0.4;
      }
      case "thud": {
        this.noiseHit(t, "lowpass", 320, 0.8, 0.5, 0.05, into, 0.006);
        S.ring(62, t, 0.4, 0.05, into, "sine", 0.004);
        return 0.6;
      }
      case "tone": {
        const notes = [0, 1].map(
          () => SPACE_TONES[Math.floor(r() * SPACE_TONES.length)],
        );
        notes.forEach((n, i) =>
          this.glow(t + i * 0.8, hz(n), 5 + r() * 2, 0.012, into),
        );
        return 7.5;
      }
      default:
        return 0;
    }
  }

  buzz(t, f, q, rate, length, level, into) {
    const ctx = this.ctx;
    const src = this.noise(this.white, t, length + 0.1);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = f;
    band.Q.value = q;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = rate;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + length * 0.3);
    env.gain.setValueAtTime(level, t + length * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(band).connect(am).connect(env).connect(into);
    lfo.start(t);
    lfo.stop(t + length + 0.1);
  }

  chirp(t, f, length, level, into) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 0.97, t + length);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g).connect(into);
    o.start(t);
    o.stop(t + length + 0.02);
  }

  // Friction: a slow jittery pulse train through a narrow resonance.
  creak(t, rate, f, length, level, into) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(rate, t);
    o.frequency.linearRampToValueAtTime(
      rate * (0.7 + Math.random() * 0.8),
      t + length,
    );
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 6;
    band.frequency.setValueAtTime(f, t);
    band.frequency.linearRampToValueAtTime(
      f * (0.85 + Math.random() * 0.3),
      t + length,
    );
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + length * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(band).connect(g).connect(into);
    o.start(t);
    o.stop(t + length + 0.05);
  }

  groan(t, f, band, length, level, into) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.78, t + length);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 3;
    filter.frequency.value = band;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + length * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(filter).connect(g).connect(into);
    o.start(t);
    o.stop(t + length + 0.05);
  }

  grunt(t, f, length, level, into) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 1.15, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.8, t + length);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 2;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(filter).connect(g).connect(into);
    o.start(t);
    o.stop(t + length + 0.05);
  }

  bird(t, into) {
    const ctx = this.ctx;
    const base = 2300 + Math.random() * 1700;
    let at = t;
    for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) {
      const f = base * (0.9 + Math.random() * 0.25);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * 1.4, at + 0.06);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.022, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
      o.connect(g).connect(into);
      o.start(at);
      o.stop(at + 0.1);
      at += 0.09 + Math.random() * 0.07;
    }
    return at - t + 0.1;
  }

  blip(t, f, level, into) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 2.3, t + 0.07);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(into);
    o.start(t);
    o.stop(t + 0.12);
  }

  drip(t, level, into) {
    const ctx = this.ctx;
    const f = 1100 + Math.random() * 900;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.03);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(into);
    o.start(t);
    o.stop(t + 0.1);
  }

  glow(t, f, length, level, into) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + length * 0.35);
    g.gain.linearRampToValueAtTime(0, t + length);
    g.connect(into);
    for (const [ratio, part] of [
      [1, 1],
      [2, 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const pg = ctx.createGain();
      pg.gain.value = part;
      o.connect(pg).connect(g);
      o.start(t);
      o.stop(t + length + 0.05);
    }
  }

  noiseHit(t, type, f, q, length, level, into, attack = 0.002) {
    const ctx = this.ctx;
    const src = this.noise(this.white, t, length + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = f;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter).connect(g).connect(into);
  }

  // Two darker repeats off distant rock.
  echo(t, length, into) {
    for (const [delay, level] of [
      [0.26, 0.02],
      [0.55, 0.01],
    ])
      this.noiseHit(
        t + delay,
        "bandpass",
        700,
        1.2,
        length + 0.2,
        level,
        into,
        0.01,
      );
  }

  noise(buffer, t, length) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const room = buffer.duration - length - 0.01;
    src.start(t, room > 0 ? Math.random() * room : 0, length);
    return src;
  }

  // A stamp's thud answered by the valley: two delayed, darkening repeats on alternate sides.
  stampEcho() {
    if (!this.layer) return;
    this.event("thud", { delay: 0.24, pan: -0.6, far: 0.55 });
    this.event("thud", { delay: 0.52, pan: 0.6, far: 0.3 });
  }

  // Local sources around the listener, refreshed fifteen times a second.
  updateEmitters(frame, t) {
    const listener = frame.hero?.pos;
    if (!listener) return;
    const ly = (frame.hero.feet ?? 0) + 1.5;
    const right = rightVector(frame);
    const wanted = new Map();
    const add = (id, kind, x, y, z, options = {}) => {
      const d = Math.hypot(x - listener.x, y - ly, z - listener.z);
      const reach = options.reach ?? 30;
      if (d > reach) return;
      wanted.set(id, { kind, x, y, z, d, ...options });
    };
    if (this.place === "court")
      BRAZIERS.forEach(([x, z], i) =>
        add(`fire${i}`, "fire", x, 1.4, z, { ref: 2, reach: 26 }),
      );
    if (this.place === "forest") {
      const edge = Math.max(0, bogEdge(listener.x, listener.z));
      if (edge < 32)
        wanted.set("bog", {
          kind: "bog",
          x: BOG.x,
          y: BOG.level,
          z: BOG.z,
          d: edge + 2,
          ref: 3,
        });
    }
    if (this.place === "four")
      FROST_FALLS.forEach(([x, z, y], i) =>
        add(`falls${i}`, "falls", x, y + 1.5, z, { ref: 3, reach: 20 }),
      );
    for (const [i, vent] of (frame.vents || []).entries()) {
      const p = vent.mesh?.position;
      add(`vent${i}`, "vent", p?.x ?? 0, p?.y ?? 24, p?.z ?? vent.z ?? 0, {
        ref: 3,
        reach: 28,
        state: vent.active ? 1 : vent.warning ? 0.45 : 0.06,
      });
    }
    for (const [i, gate] of (frame.gates || []).entries())
      add(`gate${i}`, "gate", gate.center.x, gate.center.y, gate.center.z, {
        ref: 3.5,
        reach: 40,
        gate,
      });
    for (const id of this.emitters.keys())
      if (!wanted.has(id)) this.dropEmitter(id, 0.6);
    for (const [id, w] of wanted) {
      let e = this.emitters.get(id);
      if (!e) {
        e = this.makeEmitter(w.kind);
        if (!e) continue;
        this.emitters.set(id, e);
        this.counts.sources++;
      }
      const near = Math.min(1, w.ref / Math.max(w.ref, w.d)) ** 1.15;
      const edge = Math.min(1, Math.max(0, ((w.reach ?? 30) - w.d) / 6));
      let level = e.level * near * edge * (w.state ?? 1);
      if (e.kind === "gate") {
        if (e.swell > 0) {
          level *= 1 + e.swell * 0.8;
          e.swell = Math.max(0, e.swell - 0.08);
        }
        e.pressure.gain.setTargetAtTime(
          w.d < 6 ? (1 - w.d / 6) * 0.05 : 0,
          t,
          0.2,
        );
      }
      const dx = w.x - (frame.camera?.x ?? listener.x),
        dz = w.z - (frame.camera?.z ?? listener.z);
      const len = Math.hypot(dx, dz) || 1;
      const pan = right
        ? Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / len)) * 0.8
        : 0;
      e.gain.gain.setTargetAtTime(level, t, 0.12);
      e.pan.pan.setTargetAtTime(pan, t, 0.08);
      e.tone.frequency.setTargetAtTime(2500 + 15000 * near, t, 0.2);
    }
  }

  makeEmitter(kind) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 8000;
    tone
      .connect(gain)
      .connect(pan)
      .connect(this.layer?.bus || this.out);
    const nodes = [];
    const loop = (buffer, rate = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = rate;
      src.start(ctx.currentTime, Math.random() * buffer.duration);
      nodes.push(src);
      return src;
    };
    const filtered = (src, type, f, q, level) => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = f;
      filter.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = level;
      src.connect(filter).connect(g).connect(tone);
      nodes.push(filter, g);
      return g;
    };
    const e = { kind, gain, pan, tone, nodes, level: 1 };
    switch (kind) {
      case "fire":
        filtered(loop(this.brown), "lowpass", 600, 0.6, 0.11);
        filtered(loop(this.crackle), "highpass", 900, 0.5, 0.11);
        e.level = 0.9;
        break;
      case "bog":
        filtered(loop(this.bubbling), "lowpass", 900, 0.6, 0.16);
        filtered(loop(this.brown), "lowpass", 150, 0.8, 0.08);
        e.level = 1;
        break;
      case "falls":
        filtered(loop(this.bubbling, 2.6), "bandpass", 2600, 0.8, 0.06);
        e.level = 0.8;
        break;
      case "vent":
        filtered(loop(this.white), "highpass", 1400, 0.6, 0.05);
        filtered(loop(this.brown), "lowpass", 260, 0.7, 0.14);
        e.level = 1;
        break;
      case "gate": {
        const hum = ctx.createGain();
        hum.gain.value = 1;
        hum.connect(tone);
        nodes.push(hum);
        for (const [f, level] of [
          [55, 0.03],
          [110.2, 0.022],
          [164.8, 0.012],
        ]) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const g = ctx.createGain();
          g.gain.value = level;
          o.connect(g).connect(hum);
          o.start();
          nodes.push(o, g);
        }
        const shimmer = filtered(loop(this.white), "bandpass", 2200, 3, 0.03);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.6;
        const depth = ctx.createGain();
        depth.gain.value = 0.015;
        lfo.connect(depth).connect(shimmer.gain);
        lfo.start();
        nodes.push(lfo, depth);
        const pressure = ctx.createGain();
        pressure.gain.value = 0;
        const sub = ctx.createOscillator();
        sub.frequency.value = 41.2;
        sub.connect(pressure).connect(tone);
        sub.start();
        nodes.push(sub, pressure);
        e.pressure = pressure;
        e.swell = 0;
        e.level = 0.5;
        break;
      }
      default:
        return null;
    }
    return e;
  }

  dropEmitter(id, tau) {
    const e = this.emitters.get(id);
    if (!e) return;
    this.emitters.delete(id);
    const t = this.ctx.currentTime;
    e.gain.gain.cancelScheduledValues(t);
    e.gain.gain.setValueAtTime(e.gain.gain.value, t);
    e.gain.gain.setTargetAtTime(0, t, tau);
    const end = t + tau * 6 + 0.1;
    for (const n of e.nodes) if (n.stop) n.stop(end);
    setTimeout(
      () => {
        for (const n of e.nodes) n.disconnect();
        e.tone.disconnect();
        e.gain.disconnect();
        e.pan.disconnect();
      },
      (tau * 6 + 0.4) * 1000,
    );
  }

  telemetry() {
    return {
      place: this.place,
      beds: this.layer?.beds.length ?? 0,
      emitters: [...this.emitters.entries()].map(([id, e]) => ({
        id,
        kind: e.kind,
        gain: +e.gain.gain.value.toFixed(4),
        pan: +e.pan.pan.value.toFixed(2),
      })),
      ...this.counts,
      recent: this.recent.map((e) => ({ ...e })),
    };
  }
}

function rightVector(frame) {
  const e = frame.cameraMatrix;
  if (e) {
    const len = Math.hypot(e[0], e[2]);
    if (len > 1e-4) return { x: e[0] / len, z: e[2] / len };
  }
  const yaw = frame.hero?.yaw;
  return Number.isFinite(yaw) ? { x: -Math.cos(yaw), z: Math.sin(yaw) } : null;
}

function noiseBuffer(ctx, colour, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buffer.getChannelData(c);
    let low = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      if (colour === "brown") {
        low = (low + 0.02 * white) / 1.02;
        d[i] = low * 3.5;
      } else d[i] = white;
    }
    // Seamless loop: blend the last 50 ms into the first.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[n - fade + i] = d[n - fade + i] * (1 - k) + d[i] * k;
    }
  }
  return buffer;
}

// Embers: sparse decaying clicks of random size, a few dozen a second.
function crackleBuffer(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buffer.getChannelData(0);
  const rate = ctx.sampleRate;
  for (let k = 0; k < seconds * 26; k++) {
    const start = Math.floor(Math.random() * (n - rate * 0.02));
    const size = Math.random() ** 2.5;
    const decay = 900 + Math.random() * 2500;
    for (let i = 0; i < rate * 0.02; i++)
      d[start + i] +=
        (Math.random() * 2 - 1) * size * Math.exp((-i / rate) * decay);
  }
  return buffer;
}

// Bubbles rising through mud: short upward chirps at random pitches.
function bubblingBuffer(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buffer.getChannelData(0);
  const rate = ctx.sampleRate;
  for (let k = 0; k < seconds * 7; k++) {
    const length = Math.floor(rate * (0.03 + Math.random() * 0.06));
    const start = Math.floor(Math.random() * (n - length));
    const f = 110 + Math.random() * 320,
      size = 0.3 + Math.random() * 0.7;
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const u = i / length;
      phase += (2 * Math.PI * f * (1 + 1.6 * u)) / rate;
      d[start + i] += Math.sin(phase) * size * Math.sin(Math.PI * u) * (1 - u);
    }
  }
  return buffer;
}
