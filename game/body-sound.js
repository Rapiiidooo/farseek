// Nyra's breath and effort, read from the hero's state each frame: breathing that follows
// exertion, short non-verbal efforts on state changes, a gasp on surfacing and strain when air runs low.

// Formants of a few open vowels for an adult female voice: [centre Hz, gain, bandwidth Hz].
const VOWELS = {
  a: [
    [850, 1, 100],
    [1420, 0.55, 120],
    [2900, 0.25, 170],
  ],
  u: [
    [460, 1, 80],
    [1080, 0.4, 100],
    [2650, 0.18, 150],
  ],
  e: [
    [680, 1, 90],
    [1650, 0.45, 110],
    [2850, 0.22, 160],
  ],
  n: [
    [480, 1, 90],
    [1500, 0.28, 130],
    [2700, 0.14, 170],
  ],
};

// Each effort: pitch contour, length, vowel, breathiness, level, how often it sounds.
const EFFORTS = {
  jump: {
    f0: [290, 245],
    length: 0.13,
    vowel: "e",
    breath: 0.45,
    level: 0.045,
    chance: 0.45,
  },
  pull: {
    f0: [252, 226],
    length: 0.3,
    vowel: "n",
    breath: 0.25,
    level: 0.05,
    chance: 0.8,
    press: true,
  },
  land: {
    f0: [238, 178],
    length: 0.21,
    vowel: "u",
    breath: 0.35,
    level: 0.055,
    chance: 1,
  },
  hurt: {
    f0: [345, 258],
    length: 0.26,
    vowel: "a",
    breath: 0.5,
    level: 0.065,
    chance: 1,
    rough: true,
  },
  roll: {
    f0: [232, 205],
    length: 0.15,
    vowel: "u",
    breath: 0.8,
    level: 0.03,
    chance: 0.6,
  },
  swing: {
    f0: [295, 252],
    length: 0.14,
    vowel: "e",
    breath: 0.45,
    level: 0.04,
    chance: 0.55,
  },
  axe: {
    f0: [262, 232],
    length: 0.17,
    vowel: "n",
    breath: 0.35,
    level: 0.04,
    chance: 0.45,
    press: true,
  },
};

const CLIMBING = new Set(["hang", "climb", "wall"]);

// Where each recorded sound sits in audio/nyra-voice.wav: [offset, length] in seconds, and the
// gain each kind plays at. Kinds absent here (swing, axe) use the jump and pull takes.
const SPRITE = {
  jump: [
    [0.08, 0.3918],
    [0.5518, 0.3713],
  ],
  pull: [
    [1.0031, 0.5192],
    [1.6023, 0.63],
  ],
  land: [[2.3123, 0.5652]],
  hurt: [
    [2.9575, 0.5947],
    [3.6322, 0.2729],
  ],
  roll: [[3.9851, 0.53]],
  gasp: [[4.5951, 0.78]],
  exhale: [
    [5.4551, 0.21],
    [5.7451, 0.21],
    [6.0351, 0.25],
    [6.3651, 0.26],
  ],
  inhale: [
    [6.7051, 0.16],
    [6.9451, 0.16],
    [7.1851, 0.26],
    [7.5251, 0.22],
  ],
};
const TAKES = { swing: "jump", axe: "pull" };
const CLIP_LEVEL = {
  jump: 0.12,
  pull: 0.1,
  land: 0.135,
  hurt: 0.2,
  roll: 0.09,
  gasp: 0.155,
  swing: 0.1,
  axe: 0.08,
  breath: 0.08,
};
const banks = new WeakMap();

// Fetched once per audio context when play first updates, so it never competes with loading;
// until it decodes, the voice is synthesized.
function voiceBank(ctx) {
  if (!banks.has(ctx)) {
    const bank = { buffer: null, failed: false, serial: 0 };
    banks.set(ctx, bank);
    fetch(new URL("./audio/nyra-voice.wav", import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error(`Nyra voice ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => (bank.buffer = buffer))
      .catch(() => (bank.failed = true));
  }
  return banks.get(ctx);
}

export class BodySound {
  constructor(sound) {
    this.sound = sound;
    const ctx = (this.ctx = sound.ctx);
    this.out = ctx.createGain();
    this.out.connect(sound.fx);
    this.exertion = 0;
    this.breathClock = 0.5;
    this.inhaling = true;
    this.under = 0;
    this.lastVocal = -9;
    this.heartClock = 0;
    this.strainClock = 1;
    this.prev = null;
    this.counts = {
      breaths: 0,
      efforts: 0,
      gasps: 0,
      beats: 0,
      strains: 0,
      recorded: 0,
    };
    this.recent = [];
    this.bank = null;
  }

  // One recorded take of a kind, with a slight change of rate so repeats differ.
  clip(kind, t, level, rate = 1) {
    const buffer = this.bank?.buffer;
    const takes = SPRITE[TAKES[kind] || kind];
    if (!buffer || !takes) return false;
    const [offset, length] = takes[this.bank.serial++ % takes.length];
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const g = this.ctx.createGain();
    g.gain.value = level;
    src.connect(g).connect(this.out);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start(t, offset, length);
    this.counts.recorded++;
    return true;
  }

  update(dt, hero, signals = {}) {
    if (!hero || !(dt > 0)) return;
    this.bank ??= voiceBank(this.ctx);
    const s = hero.state;
    const speed = Number.isFinite(hero.speed) ? hero.speed : 0;
    const prev = this.prev;
    const silent = signals.place === "space" || signals.lightForm;
    if (prev && !silent) this.transitions(hero, prev);
    this.prev = {
      state: s,
      sinceJump: hero.sinceJump ?? 9,
      stun: hero.stun ?? 0,
      landing: hero.landing ?? 0,
    };
    let gain = 0;
    if (s === "ground" && speed > 3.2) gain = 0.075 * Math.min(1, speed / 5.6);
    else if (CLIMBING.has(s))
      gain = s === "hang" && !hero.shimmy ? 0.025 : 0.07;
    else if (s === "swing") gain = 0.04;
    else if (s === "shove" || s === "grab") gain = 0.04;
    else if (s === "swim")
      gain =
        0.05 *
        Math.min(
          1,
          Math.hypot(hero.swimSpeed || 0, hero.swimVertical || 0) / 3.2,
        );
    const rest =
      s === "ground" && speed < 1 ? 0.06 : s === "ground" ? 0.025 : 0.01;
    this.exertion = Math.max(
      0,
      Math.min(1, this.exertion + (gain - (gain ? 0 : rest)) * dt),
    );
    const immersion = signals.immersion || 0;
    const wet = immersion > 0.5;
    if (wet) this.under += dt;
    else if (this.under > 0) {
      if (this.under > 2.5 && !silent)
        this.gasp(signals.breath?.ratio ?? Math.max(0, 1 - this.under / 45));
      this.under = 0;
    }
    if (silent) return;
    const low = signals.breath?.submerged && signals.breath.ratio < 0.3;
    if (wet) this.holding(dt, low ? signals.breath.ratio : null);
    else this.breathing(dt);
  }

  transitions(hero, prev) {
    const s = hero.state;
    if ((hero.sinceJump ?? 9) < prev.sinceJump - 1e-6 && s === "air") {
      this.exertion = Math.min(1, this.exertion + 0.05);
      const running = (hero.speed || 0) > 4;
      this.effort("jump", running ? 1.4 : 0.8);
    }
    if (s === "climb" && prev.state !== "climb") this.climbed = false;
    if (s === "climb" && !this.climbed && (hero.t ?? 0) >= 0.28) {
      this.climbed = true;
      this.exertion = Math.min(1, this.exertion + 0.08);
      this.effort("pull");
    }
    if (s === "roll" && prev.state !== "roll") {
      this.exertion = Math.min(1, this.exertion + 0.06);
      this.effort("roll");
    }
    if (prev.state === "air" && s === "ground") {
      const drop = (hero.fallStart ?? 0) - (hero.feet ?? 0);
      if (drop > 3.2 || (hero.landing ?? 0) >= 0.97) {
        this.exertion = Math.min(1, this.exertion + 0.1);
        this.effort("land");
      }
    }
    if ((hero.stun ?? 0) > prev.stun + 0.3) {
      this.exertion = Math.min(1, this.exertion + 0.12);
      this.effort("hurt");
    }
    if (s === "swing" && prev.state !== "swing") this.effort("swing");
  }

  // Effort from outside the hero's states, such as an axe strike.
  effort(kind, odds = 1) {
    const spec = EFFORTS[kind];
    if (!spec) return;
    const now = this.ctx.currentTime;
    if (kind !== "hurt" && now - this.lastVocal < 0.55) return;
    if (Math.random() > spec.chance * odds) return;
    this.lastVocal = now;
    this.counts.efforts++;
    this.note(kind);
    if (!this.clip(kind, now + 0.01, CLIP_LEVEL[kind] ?? 0.12))
      this.vocal(spec, now + 0.01);
  }

  note(kind) {
    this.recent.push({ kind, at: +this.ctx.currentTime.toFixed(2) });
    if (this.recent.length > 24) this.recent.shift();
  }

  breathing(dt) {
    const e = this.exertion;
    if (e < 0.18) {
      this.breathClock = Math.min(this.breathClock, 0.4);
      return;
    }
    if ((this.breathClock -= dt) > 0) return;
    const period = 3 - 1.9 * e;
    const strength = Math.min(1, (e - 0.12) / 0.75);
    const length = (this.inhaling ? 0.4 : 0.48) * period;
    this.breath(
      this.inhaling,
      strength,
      Math.max(0.28, Math.min(0.95, length)),
    );
    this.breathClock = length + (this.inhaling ? 0.04 : 0.1) * period;
    this.inhaling = !this.inhaling;
  }

  // Under water she holds her breath; when it runs low, her throat strains and her heart races.
  holding(dt, ratio) {
    this.breathClock = 0.2;
    this.inhaling = true;
    if (ratio === null) return;
    const urgency = 1 - Math.max(0, ratio) / 0.3;
    if ((this.heartClock -= dt) <= 0) {
      this.heartClock = 0.85 - 0.35 * urgency;
      this.heartbeat(0.6 + 0.4 * urgency);
    }
    if ((this.strainClock -= dt) <= 0) {
      this.strainClock = 2.2 - 0.9 * urgency + Math.random() * 0.5;
      this.counts.strains++;
      this.note("strain");
      this.vocal(
        {
          f0: [210, 196],
          length: 0.24,
          vowel: "n",
          breath: 0.05,
          level: 0.03 * (0.6 + 0.4 * urgency),
          press: true,
        },
        this.ctx.currentTime + 0.01,
      );
    }
  }

  gasp(ratio) {
    const depth = 1 - Math.max(0, Math.min(1, ratio));
    this.exertion = Math.max(this.exertion, 0.45 + 0.5 * depth);
    this.counts.gasps++;
    this.note("gasp");
    this.breathClock = 0.55;
    this.inhaling = false;
    const t = this.ctx.currentTime + 0.02;
    if (this.clip("gasp", t, CLIP_LEVEL.gasp * (0.7 + 0.3 * depth))) return;
    this.air(t, true, 0.5, 0.06 + 0.03 * depth, 900, 2700);
    this.vocal(
      {
        f0: [250, 300],
        length: 0.12,
        vowel: "a",
        breath: 0.9,
        level: 0.025 + 0.02 * depth,
      },
      t,
    );
  }

  breath(inhale, strength, length) {
    this.counts.breaths++;
    const t = this.ctx.currentTime + 0.01;
    const recorded =
      CLIP_LEVEL.breath * (0.35 + 0.65 * strength) * (inhale ? 1.5 : 1);
    const rate = Math.max(0.8, Math.min(1.08, 0.3 / length));
    if (this.clip(inhale ? "inhale" : "exhale", t, recorded, rate)) return;
    const level = 0.012 + 0.03 * strength;
    if (inhale) this.air(t, true, length, level * 0.75, 1600, 2100);
    else {
      this.air(t, false, length, level, 1250, 950);
      if (strength > 0.75 && Math.random() < 0.4)
        this.vocal(
          {
            f0: [215, 190],
            length: Math.min(0.25, length * 0.5),
            vowel: "a",
            breath: 0.9,
            level: level * 0.35,
          },
          t,
        );
    }
  }

  // Air through the mouth: band-passed noise whose centre glides, shaped as an in or out breath.
  air(t, inhale, length, level, from, to) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.sound.noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.85;
    band.frequency.setValueAtTime(from, t);
    band.frequency.linearRampToValueAtTime(to, t + length);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0;
    const peak = t + length * (inhale ? 0.65 : 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, peak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(band).connect(hp).connect(g).connect(this.out);
    src.start(t, Math.random() * 1.2, length + 0.05);
  }

  heartbeat(level) {
    this.counts.beats++;
    const t = this.ctx.currentTime + 0.01;
    for (const [delay, f, k] of [
      [0, 56, 1],
      [0.2, 49, 0.7],
    ])
      this.sound.ring(
        f,
        t + delay,
        0.16,
        0.12 * level * k,
        this.out,
        "sine",
        0.008,
      );
  }

  // A short voiced sound: a buzzing source through three formants, with breath at the onset.
  vocal(spec, t) {
    const ctx = this.ctx;
    const j = 1 + (Math.random() - 0.5) * 0.1;
    const length = spec.length * (0.9 + Math.random() * 0.2);
    const end = t + length;
    const sum = ctx.createGain();
    sum.gain.value = spec.level;
    sum.connect(this.out);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(spec.f0[0] * j, t);
    o.frequency.exponentialRampToValueAtTime(spec.f0[1] * j, end);
    const jitter = ctx.createOscillator();
    jitter.frequency.value = 13 + Math.random() * 11;
    const jitterDepth = ctx.createGain();
    jitterDepth.gain.value = spec.f0[0] * 0.015;
    jitter.connect(jitterDepth).connect(o.frequency);
    const tilt = ctx.createBiquadFilter();
    tilt.type = "lowpass";
    tilt.frequency.value = spec.press ? 3000 : 1900;
    tilt.Q.value = 0.5;
    const voiced = ctx.createGain();
    voiced.gain.value = 0;
    voiced.gain.setValueAtTime(0.0001, t);
    voiced.gain.exponentialRampToValueAtTime(
      1,
      t + Math.min(0.03, length * 0.25),
    );
    voiced.gain.setValueAtTime(1, t + length * 0.45);
    voiced.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(tilt).connect(voiced);
    if (spec.rough) {
      const rough = ctx.createGain();
      rough.gain.value = 0.75;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = spec.f0[0] * 0.5 * j;
      const depth = ctx.createGain();
      depth.gain.value = 0.25;
      lfo.connect(depth).connect(rough.gain);
      voiced.connect(rough);
      lfo.start(t);
      lfo.stop(end + 0.05);
      this.formants(rough, spec.vowel, sum, j);
    } else this.formants(voiced, spec.vowel, sum, j);
    const breath = ctx.createBufferSource();
    breath.buffer = this.sound.noise;
    const shape = ctx.createBiquadFilter();
    shape.type = "bandpass";
    shape.frequency.value = 1500;
    shape.Q.value = 0.5;
    const breathy = ctx.createGain();
    breathy.gain.value = 0;
    breathy.gain.setValueAtTime(0.0001, t);
    breathy.gain.exponentialRampToValueAtTime(
      0.35 + spec.breath * 0.4,
      t + 0.015,
    );
    breathy.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, spec.breath * 0.18),
      t + 0.06,
    );
    breathy.gain.exponentialRampToValueAtTime(0.0001, end);
    breath.connect(shape).connect(breathy);
    this.formants(breathy, spec.vowel, sum, j);
    o.start(t);
    o.stop(end + 0.05);
    jitter.start(t);
    jitter.stop(end + 0.05);
    breath.start(t, Math.random() * 1.2, length + 0.06);
  }

  formants(source, vowel, into, scale) {
    const ctx = this.ctx;
    for (const [f, gain, width] of VOWELS[vowel] || VOWELS.a) {
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = f * (0.97 + (scale - 1) * 0.5);
      band.Q.value = f / width;
      const g = ctx.createGain();
      g.gain.value = gain * 3;
      source.connect(band).connect(g).connect(into);
    }
  }

  telemetry() {
    return {
      exertion: +this.exertion.toFixed(3),
      under: +this.under.toFixed(2),
      ...this.counts,
      recent: this.recent.map((r) => ({ ...r })),
    };
  }
}
