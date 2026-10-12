// Stems over each place's tune: a lifted layer after a discovery, a tension layer while danger
// lasts, and stings in the place's key. Notes are scheduled only while a stem can be heard.

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Each place's palette: the percussion kit under danger, the tension stem's level and the
// voice that lifts after a find.
const PALETTE = {
  title: { kit: null, tension: 0, lift: null },
  court: { kit: "desert", tension: 0.75, lift: "harp" },
  "court-open": { kit: "desert", tension: 1, lift: "harp" },
  world2: { kit: "wood", tension: 0.82, lift: "box" },
  fight: { kit: "wood", tension: 1, lift: null, div: 2 },
  isles: { kit: "air", tension: 1.35, lift: "harp" },
  frost: { kit: "ice", tension: 0.85, lift: "celesta" },
  forest: { kit: "skin", tension: 1.25, lift: "harp" },
  sea: { kit: "deep", tension: 0.62, lift: "celesta" },
  guardian: { kit: "deep", tension: 1.05, lift: null, div: 2 },
  finale: { kit: null, tension: 1, lift: "celesta" },
  vault: { kit: "desert", tension: 0.8, lift: "harp" },
};

// Sixteen steps a measure of four beats at three levels of danger: where the low drum, the
// middle voice and the ticks fall.
const PATTERNS = [
  { low: [0, 8], mid: [], tick: [4, 12] },
  { low: [0, 6, 8], mid: [4, 12], tick: [2, 10, 14] },
  {
    low: [0, 3, 6, 8, 11, 14],
    mid: [4, 12],
    tick: [1, 3, 5, 7, 9, 11, 13, 15],
  },
];
const OSTINATO = [0, 3, 6, 8, 11, 14];
const LIFT_HOLD = { relic: 16, door: 26, solve: 10 };
const STING_DELAY = { relic: 0.5, door: 0.6, solve: 0.3 };

export class MusicStems {
  constructor(sound) {
    this.sound = sound;
    const { ctx, music } = sound;
    this.ctx = ctx;
    this.danger = 0;
    this.dangerTarget = 0;
    this.lift = 0;
    this.liftLevel = 0;
    this.liftUntil = 0;
    this.phase = 0;
    this.lastSting = -Infinity;
    this.appliedAt = null;
    this.targets = new WeakMap();
    this.counts = { steps: 0, drones: 0, hits: 0, arps: 0, stings: 0 };
    this.stings = [];
    this.stingBus = ctx.createGain();
    this.stingBus.connect(music.tone);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    this.stingBus.connect(send).connect(music.hall);
  }

  setDanger(level, phase = 0) {
    this.dangerTarget = Math.max(0, Math.min(1, Number(level) || 0));
    this.phase = Number(phase) || 0;
  }

  discover(kind = "solve") {
    const now = this.ctx.currentTime;
    const level = kind === "solve" ? 0.6 : 1;
    this.liftLevel =
      now < this.liftUntil ? Math.max(this.liftLevel, level) : level;
    this.liftUntil = Math.max(this.liftUntil, now + (LIFT_HOLD[kind] ?? 10));
    if (kind !== "solve" || now - this.lastSting > 5) this.play(kind);
  }

  // Fast into danger, slow out of it; a find fades out once danger rises.
  apply(t) {
    const dt = Math.max(0, Math.min(0.5, t - (this.appliedAt ?? t)));
    this.appliedAt = t;
    const target = this.dangerTarget;
    const rate = target > this.danger ? 0.35 : 2.8;
    this.danger += (target - this.danger) * (1 - Math.exp(-dt / rate));
    if (Math.abs(this.danger - target) < 0.004) this.danger = target;
    if (t >= this.liftUntil) this.liftLevel = 0;
    const liftTarget = this.liftLevel * (1 - 0.85 * this.danger);
    this.lift += (liftTarget - this.lift) * (1 - Math.exp(-dt / 1.6));
    if (Math.abs(this.lift - liftTarget) < 0.003) this.lift = liftTarget;
    const M = this.sound.music;
    for (const L of Object.values(M.layers)) {
      if (!L.on && !(L.until > t)) continue;
      this.set(
        L.tension.gain,
        this.danger * (PALETTE[L.mode]?.tension ?? 1),
        t,
        0.12,
      );
      this.set(L.lift.gain, this.lift, t, 0.3);
      this.set(L.lead.gain, 1 - 0.5 * this.danger, t, 0.3);
    }
    this.set(M.tone.frequency, 4200 + 2200 * this.lift, t, 0.6);
  }

  set(param, value, t, tau) {
    if (!Number.isFinite(value) || this.targets.get(param) === value) return;
    this.targets.set(param, value);
    param.setTargetAtTime(value, t, tau);
  }

  // The next half second of sixteenths of the place's beat (eighths for the quick cues).
  schedule(L, t) {
    const div = PALETTE[L.mode]?.div ?? 4;
    const step = L.cue.bar / 8 / div;
    if (!(L.stepNext >= t - 0.25)) {
      const bar = lastBar(L, t);
      if (!bar) return;
      const k = Math.max(0, Math.ceil((t - bar.at) / step - 1e-6));
      L.stepNext = bar.at + k * step;
      L.step = k;
    }
    while (L.stepNext < t + 0.45) {
      this.step(L, L.stepNext, L.step, step, div);
      L.stepNext += step;
      L.step++;
    }
  }

  step(L, at, count, length, div) {
    const chord = chordAt(L, at);
    if (!chord) return;
    const palette = PALETTE[L.mode] || {};
    const index = count % 16;
    if (this.dangerTarget > 0.03 || this.danger > 0.03) {
      this.counts.steps++;
      if (!(L.droneUntil > at + length)) {
        const end = barEnd(L, at);
        this.drone(L, at, end + 0.6, chord[0]);
        L.droneUntil = end;
      }
      if (palette.kit) this.percussion(L, at, index, palette.kit);
      if (!L.cue.pulse && this.level() >= 2 && OSTINATO.includes(index))
        this.sound.pluck(
          hz(chord[0] - 12),
          at,
          Math.min(0.5, length * 1.6),
          index === 0 ? 0.07 : 0.05,
          L.tension,
        );
    }
    if (palette.lift && this.lift > 0.02 && count % div === 0) {
      const tops = chord.slice(2).map((n) => n + 12);
      const turn = [0, 1, 2, 1, 2, 0, 1, 2][(count / div) % 8];
      this.counts.arps++;
      this.sound.musicNote(
        palette.lift,
        hz(tops[turn % tops.length]),
        at,
        length * div * 0.9,
        (L.cue.level || 0.08) * 0.55,
        { lead: L.lift },
      );
    }
  }

  level() {
    const d = this.danger;
    const boss = this.phase >= 2 ? this.phase : 1;
    return Math.min(3, Math.max(d > 0.82 ? 3 : d > 0.55 ? 2 : 1, boss));
  }

  percussion(L, at, index, kit) {
    const pattern = PATTERNS[this.level() - 1];
    const accent = index === 0 ? 1.25 : 1;
    if (pattern.low.includes(index))
      this.hit(kit, "low", at, accent, L.tension);
    if (pattern.mid.includes(index))
      this.hit(kit, "mid", at, accent, L.tension);
    if (pattern.tick.includes(index)) this.hit(kit, "tick", at, 1, L.tension);
  }

  hit(kit, part, at, v, into) {
    this.counts.hits++;
    switch (`${kit}:${part}`) {
      case "desert:low":
        return this.drum(at, 112, 70, 0.34, 0.2 * v, into, 0.05);
      case "desert:mid":
        return this.knock(at, 690, 0.07, 0.07 * v, into, 0.05);
      case "desert:tick":
        return this.shake(at, 6200, 0.06, 0.03, into);
      case "wood:low":
        return this.drum(at, 96, 62, 0.28, 0.19 * v, into, 0.04);
      case "wood:mid":
        return this.knock(at, 1180, 0.06, 0.06 * v, into, 0.02);
      case "wood:tick":
        return this.knock(at, 1960, 0.03, 0.022, into, 0);
      case "air:low":
        return this.drum(at, 74, 52, 0.55, 0.17 * v, into, 0.03);
      case "air:mid":
        return this.shake(at, 2300, 0.28, 0.035 * v, into);
      case "air:tick":
        return this.shake(at, 7200, 0.05, 0.02, into);
      case "ice:low":
        return this.drum(at, 64, 44, 0.6, 0.2 * v, into, 0.02);
      case "ice:mid":
        return this.ping(at, 2637, 0.32, 0.035 * v, into);
      case "ice:tick":
        return this.ping(at, 3951, 0.09, 0.014, into);
      case "skin:low":
        return this.drum(at, 88, 58, 0.4, 0.2 * v, into, 0.06);
      case "skin:mid":
        return this.drum(at, 196, 150, 0.14, 0.08 * v, into, 0.09);
      case "skin:tick":
        return this.shake(at, 5200, 0.05, 0.028, into);
      case "deep:low":
        return this.drum(at, 54, 34, 0.95, 0.24 * v, into, 0.03);
      case "deep:mid":
        return this.knock(at, 430, 0.13, 0.05 * v, into, 0.03);
      case "deep:tick":
        return this.shake(at, 3200, 0.08, 0.022, into);
      default:
    }
  }

  // A skin struck: the pitch falls as it rings, over a short thump of noise.
  drum(at, from, to, decay, level, into, thump) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + decay * 0.45);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g).connect(into);
    o.start(at);
    o.stop(at + decay + 0.05);
    if (thump > 0) this.noise(at, "lowpass", 380, 0.7, 0.03, thump, into);
  }

  knock(at, f, decay, level, into, click) {
    this.sound.ring(f, at, decay, level, into, "sine", 0.002);
    this.sound.ring(
      f * 1.48,
      at,
      decay * 0.6,
      level * 0.5,
      into,
      "sine",
      0.002,
    );
    if (click > 0) this.noise(at, "highpass", 2200, 0.7, 0.012, click, into);
  }

  shake(at, f, decay, level, into) {
    this.noise(at, "bandpass", f, 1.3, decay, level, into, 0.012);
  }

  ping(at, f, decay, level, into) {
    this.sound.ring(f, at, decay, level, into, "sine", 0.002);
    this.sound.ring(
      f * 2.76,
      at,
      decay * 0.4,
      level * 0.3,
      into,
      "sine",
      0.002,
    );
  }

  noise(at, type, f, q, decay, level, into, attack = 0.002) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.sound.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = f;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    src.connect(filter).connect(g).connect(into);
    src.start(at, Math.random() * 1.5, decay + 0.05);
  }

  // A low bowed tone on the chord's root, its colour opening and closing slowly.
  drone(L, at, until, root) {
    const ctx = this.ctx;
    this.counts.drones++;
    const f = hz(root - 12);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(180, at);
    lp.frequency.linearRampToValueAtTime(420, (at + until) / 2);
    lp.frequency.linearRampToValueAtTime(220, until);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.setTargetAtTime(0.05, at, 0.35);
    g.gain.setTargetAtTime(0, until - 0.3, 0.3);
    lp.connect(g).connect(L.tension);
    for (const [ratio, cents, level] of [
      [1, -6, 1],
      [1, 6, 1],
      [1.5, 0, 0.35],
    ]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f * ratio;
      o.detune.value = cents;
      const lg = ctx.createGain();
      lg.gain.value = level;
      o.connect(lg).connect(lp);
      o.start(at);
      o.stop(until + 1.6);
    }
  }

  // The music answers a find just after its effect: the chord's upper notes rising in the
  // place's key, the top one held, and for a door a swelling chord beneath.
  play(kind) {
    const M = this.sound.music;
    const L = M?.layers[M.mode];
    if (!L) return;
    const now = this.ctx.currentTime;
    const at = now + (STING_DELAY[kind] ?? 0.3);
    const chord = chordAt(L, at) || L.cue.chords[0];
    const voice = PALETTE[L.mode]?.lift || "celesta";
    const level = (L.cue.level || 0.08) * (kind === "solve" ? 0.6 : 1.1);
    let tops = chord.slice(1).map((n) => n + 12);
    while (tops[0] < 62) tops = tops.map((n) => n + 12);
    const notes = kind === "solve" ? tops.slice(-2) : tops.slice(-4);
    const gap = kind === "door" ? 0.16 : 0.11;
    this.lastSting = now;
    this.counts.stings++;
    this.stings.push({ kind, at: +at.toFixed(3), mode: M.mode });
    if (this.stings.length > 16) this.stings.shift();
    const lane = { lead: this.stingBus };
    notes.forEach((n, i) => {
      const last = i === notes.length - 1;
      this.sound.musicNote(
        voice,
        hz(n),
        at + i * gap,
        last ? 2.4 : gap * 2,
        level * (last ? 1.2 : 1),
        lane,
      );
      if (last)
        this.sound.musicNote(
          "celesta",
          hz(n + 12),
          at + i * gap,
          2,
          level * 0.4,
          lane,
        );
    });
    if (kind === "door")
      for (const n of chord.slice(0, 4))
        this.sound.pad(hz(n), at, 3.4, 0.016, this.stingBus);
  }

  telemetry() {
    return {
      danger: +this.danger.toFixed(3),
      dangerTarget: +this.dangerTarget.toFixed(3),
      lift: +this.lift.toFixed(3),
      phase: this.phase,
      level: this.level(),
      ...this.counts,
      stings: this.stings.map((s) => ({ ...s })),
    };
  }
}

function lastBar(L, at) {
  let found = null;
  for (const bar of L.timeline || []) if (bar.at <= at + 0.45) found = bar;
  return found;
}

function chordAt(L, at) {
  let chord = null;
  for (const bar of L.timeline || [])
    if (bar.at <= at + 1e-6) chord = bar.chord;
  return chord || L.timeline?.[0]?.chord || null;
}

function barEnd(L, at) {
  let end = at + L.cue.bar;
  for (const bar of L.timeline || [])
    if (bar.at <= at + 1e-6) end = bar.at + L.cue.bar;
  return Math.max(end, at + 0.5);
}
