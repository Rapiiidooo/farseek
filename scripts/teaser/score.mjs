// Renders the teaser's sound offline in Chrome, in three stems on the timeline's beat grid: a
// score in the vault's C minor (drums, low strings, braams, risers, the game's celesta), the
// game's own effects played through its Sound class at their moments in the cut, and Mira's
// recorded lines, the first through the game's radio chain.
//   node scripts/teaser/score.mjs [outDir] [--url=http://localhost:3002/]
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";
import { DROP, BEAT, END, SOUND, EFFECTS } from "./timeline.mjs";

const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir =
  process.argv.slice(2).find((a) => !a.startsWith("--")) || "outputs/teaser";
const base = arg("url") || "http://localhost:3002/";

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on(
  "console",
  (m) =>
    m.type() === "error" &&
    !/Failed to load resource/.test(m.text()) &&
    errors.push(m.text()),
);
page.on(
  "response",
  (r) =>
    r.status() >= 400 &&
    !r.url().endsWith("/favicon.ico") &&
    errors.push(`${r.status()} ${r.url()}`),
);
await page.goto(`${base}favicon.svg`);

for (const stem of ["music", "effects", "voice"]) {
  const wav = await page.evaluate(render, {
    stem,
    DROP,
    BEAT,
    END,
    SOUND,
    EFFECTS,
  });
  await writeFile(`${dir}/stem-${stem}.wav`, Buffer.from(wav, "base64"));
  console.log(`${dir}/stem-${stem}.wav`);
}
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
await browser.close();

async function render({ stem, DROP, BEAT, END, SOUND, EFFECTS }) {
  const RATE = 48000;
  const seconds = END + 1.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(RATE * seconds), RATE);
  const beat = (n) => DROP + n * BEAT;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let seed = 1234567;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };

  // Calls that must happen at a moment of the render, as the game schedules from `now`.
  const Q = 128 / RATE;
  const slots = new Map();
  const later = (time, fn) => {
    const k = Math.max(1, Math.ceil(time / Q - 1e-6));
    if (k * Q >= seconds) return;
    if (!slots.has(k)) {
      slots.set(k, []);
      ctx.suspend(k * Q).then(() => {
        for (const f of slots.get(k)) f();
        slots.delete(k);
        ctx.resume();
      });
    }
    slots.get(k).push(fn);
  };

  const noiseBuffer = (() => {
    const b = ctx.createBuffer(2, RATE * 3, RATE);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    }
    return b;
  })();
  const impulse = (length, decay, dark) => {
    const n = Math.floor(RATE * length);
    const b = ctx.createBuffer(2, n, RATE);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let low = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        low += (rnd() * 2 - 1 - low) * (1 - dark * k);
        d[i] = low * Math.pow(1 - k, decay);
      }
    }
    return b;
  };

  const out = ctx.createGain();
  out.connect(ctx.destination);
  const bus = ctx.createGain();
  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 32;
  rumble.Q.value = 0.7;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.ratio.value = 3;
  glue.attack.value = 0.012;
  glue.release.value = 0.22;
  glue.knee.value = 8;
  bus.connect(rumble).connect(glue).connect(out);
  const hall = ctx.createConvolver();
  hall.buffer = impulse(3.2, 2.6, 0.55);
  const hallIn = ctx.createGain();
  hallIn.connect(hall).connect(bus);
  const room = ctx.createConvolver();
  room.buffer = impulse(1.1, 3.2, 0.4);
  const roomIn = ctx.createGain();
  roomIn.connect(room).connect(bus);
  const send = (node, wet, into = hallIn) => {
    const g = ctx.createGain();
    g.gain.value = wet;
    node.connect(g).connect(into);
    return node;
  };
  const shaper = (amount) => {
    const w = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    w.curve = curve;
    w.oversample = "4x";
    return w;
  };
  const env = (at, peak, attack, decay, into, shape = "exp") => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    if (shape === "exp")
      g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(into);
    return g;
  };
  const osc = (type, f, at, end, into) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    o.connect(into);
    o.start(at);
    o.stop(end);
    return o;
  };
  const noise = (at, end, into, offset = rnd() * 1.5) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer;
    s.loop = true;
    s.connect(into);
    s.start(at, offset);
    s.stop(end);
    return s;
  };
  const filter = (type, f, q, into) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    if (into) b.connect(into);
    return b;
  };
  const pan = (p, into) => {
    const s = ctx.createStereoPanner();
    s.pan.value = p;
    s.connect(into);
    return s;
  };

  // --- instruments -------------------------------------------------------------------
  // A big drum: a falling skin, a felt thump and the stick's slap, driven a little.
  function drum(at, level = 1, pitch = 1, where = 0) {
    const drive = shaper(1.6);
    const dest = pan(where, bus);
    drive.connect(dest);
    send(drive, 0.22);
    const body = env(at, 0.75 * level, 0.002, 0.5, drive);
    const o = osc("sine", 160 * pitch, at, at + 0.8, body);
    o.frequency.exponentialRampToValueAtTime(54 * pitch, at + 0.1);
    const skin = env(at, 0.35 * level, 0.002, 0.22, drive);
    noise(at, at + 0.3, filter("bandpass", 210 * pitch, 1.1, skin));
    const slap = env(at, 0.18 * level, 0.001, 0.035, drive);
    noise(at, at + 0.05, filter("highpass", 2200, 0.7, slap));
  }
  function snare(at, level = 1) {
    const g = env(at, 0.32 * level, 0.001, 0.2, bus);
    send(g, 0.25, roomIn);
    noise(at, at + 0.25, filter("highpass", 1400, 0.6, g));
    const b = env(at, 0.25 * level, 0.001, 0.09, bus);
    const o = osc("triangle", 210, at, at + 0.12, b);
    o.frequency.exponentialRampToValueAtTime(160, at + 0.08);
  }
  function tick(at, level = 1, where = 0.3) {
    const g = env(at, 0.1 * level, 0.001, 0.05, pan(where, bus));
    noise(at, at + 0.06, filter("highpass", 7600, 0.7, g));
  }
  function tom(at, f, level = 1) {
    const g = env(at, 0.55 * level, 0.002, 0.45, bus);
    send(g, 0.2);
    const o = osc("sine", f * 1.6, at, at + 0.6, g);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.06);
    const n = env(at, 0.12 * level, 0.001, 0.08, bus);
    noise(at, at + 0.1, filter("bandpass", f * 4, 1, n));
  }
  // The hit under a cut: a long sub, a body of noise and a metal clang in the hall.
  function boom(at, level = 1) {
    const sub = env(at, 0.7 * level, 0.004, 2.4, bus);
    const o = osc("sine", 72, at, at + 3, sub);
    o.frequency.exponentialRampToValueAtTime(29, at + 1.8);
    const body = env(at, 0.5 * level, 0.002, 0.9, bus);
    send(body, 0.5);
    noise(at, at + 1.2, filter("lowpass", 700, 0.8, body));
    const metal = env(at, 0.09 * level, 0.002, 1.6, hallIn);
    for (const f of [181, 263, 412, 587, 911])
      osc("triangle", f, at, at + 1.8, metal);
    drum(at, 1.1 * level, 0.85);
    const crash = env(at, 0.16 * level, 0.002, 1.7, bus);
    send(crash, 0.35);
    noise(at, at + 1.9, filter("highpass", 4200, 0.6, crash));
    const ring = env(at, 0.05 * level, 0.002, 1.2, bus);
    noise(at, at + 1.3, filter("bandpass", 9000, 1.5, ring));
  }
  // A brass-like wall of saws on the chord's root, opening and closing its filter.
  function braam(at, root, length = 2.4, level = 1) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.32 * level, at + 0.03);
    g.gain.setTargetAtTime(0.2 * level, at + 0.2, 0.4);
    g.gain.setTargetAtTime(0, at + length, 0.35);
    const drive = shaper(2.4);
    drive.connect(g);
    g.connect(bus);
    send(g, 0.45);
    const lp = filter("lowpass", 180, 3, drive);
    lp.frequency.setValueAtTime(180, at);
    lp.frequency.exponentialRampToValueAtTime(3200, at + 0.12);
    lp.frequency.exponentialRampToValueAtTime(900, at + length);
    const formant = filter("peaking", 1100, 1.2, lp);
    formant.gain.value = 5;
    for (const [m, cents, v] of [
      [root - 12, -8, 1],
      [root - 12, 8, 1],
      [root, -5, 0.8],
      [root, 6, 0.8],
      [root + 7, 0, 0.5],
      [root + 12, 4, 0.35],
    ]) {
      const v1 = ctx.createGain();
      v1.gain.value = v * 0.3;
      v1.connect(formant);
      const o = osc("sawtooth", hz(m), at, at + length + 1.6, v1);
      o.detune.value = cents;
    }
  }
  // Noise rising through a sweeping band and a tone gliding up, cut dead at `end`.
  function riser(from, end, level = 1) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, from);
    g.gain.exponentialRampToValueAtTime(0.22 * level, end - 0.02);
    g.gain.linearRampToValueAtTime(0, end);
    g.connect(bus);
    send(g, 0.3);
    const bp = filter("bandpass", 300, 2.2, g);
    bp.frequency.setValueAtTime(300, from);
    bp.frequency.exponentialRampToValueAtTime(7200, end);
    noise(from, end, bp);
    const tg = ctx.createGain();
    tg.gain.value = 0;
    tg.gain.setValueAtTime(0.0001, from);
    tg.gain.exponentialRampToValueAtTime(0.05 * level, end - 0.02);
    tg.gain.linearRampToValueAtTime(0, end);
    tg.connect(bus);
    for (const m of [48, 55, 60]) {
      const o = osc(
        "sawtooth",
        hz(m),
        from,
        end,
        filter("lowpass", 2400, 0.7, tg),
      );
      o.frequency.exponentialRampToValueAtTime(hz(m + 24), end);
    }
  }
  // A swell of air that pulls into a cut.
  function swell(from, end, level = 1) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, from);
    g.gain.exponentialRampToValueAtTime(0.3 * level, end - 0.01);
    g.gain.linearRampToValueAtTime(0, end);
    g.connect(bus);
    const lp = filter("lowpass", 400, 0.7, g);
    lp.frequency.setValueAtTime(400, from);
    lp.frequency.exponentialRampToValueAtTime(9000, end);
    noise(from, end, lp);
  }
  function whoosh(at, level = 1, dir = 1) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, at - 0.22);
    g.gain.exponentialRampToValueAtTime(0.12 * level, at - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.6 * dir, at - 0.22);
    p.pan.linearRampToValueAtTime(0.6 * dir, at + 0.25);
    g.connect(p).connect(bus);
    const bp = filter("bandpass", 500, 1.4, g);
    bp.frequency.setValueAtTime(500, at - 0.22);
    bp.frequency.exponentialRampToValueAtTime(3200, at);
    bp.frequency.exponentialRampToValueAtTime(700, at + 0.25);
    noise(at - 0.22, at + 0.3, bp);
  }
  // Low strings bowed short: two saws through a closing filter.
  function spiccato(at, m, level = 1, length = 0.18) {
    const g = env(at, 0.17 * level, 0.006, length, bus);
    send(g, 0.18);
    const lp = filter("lowpass", 1400, 1.2, g);
    lp.frequency.setValueAtTime(3600, at);
    lp.frequency.exponentialRampToValueAtTime(800, at + length);
    for (const c of [-6, 6])
      osc("sawtooth", hz(m), at, at + length + 0.1, lp).detune.value = c;
  }
  // Held strings or voices: detuned saws swelling in, darkened.
  function pad(at, length, notes, level = 1, bright = 1400) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.setTargetAtTime(0.06 * level, at, 0.35);
    g.gain.setTargetAtTime(0, at + length, 0.5);
    g.connect(bus);
    send(g, 0.6);
    const lp = filter("lowpass", bright, 0.8, g);
    for (const m of notes)
      for (const c of [-9, 0, 9]) {
        const o = osc("sawtooth", hz(m), at, at + length + 3, lp);
        o.detune.value = c;
      }
  }
  // High strings: bright saws with a slow vibrato, swelling in.
  function strings(at, length, notes, level = 1) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.setTargetAtTime(0.035 * level, at, 0.18);
    g.gain.setTargetAtTime(0, at + length, 0.25);
    g.connect(bus);
    send(g, 0.5);
    const lp = filter("lowpass", 5200, 0.7, g);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = ctx.createGain();
    depth.gain.value = 9;
    lfo.connect(depth);
    lfo.start(at);
    lfo.stop(at + length + 1.5);
    for (const m of notes)
      for (const c of [-6, 6]) {
        const o = osc("sawtooth", hz(m), at, at + length + 1.5, lp);
        o.detune.value = c;
        depth.connect(o.detune);
      }
  }

  // The game's celesta: a clear tone, its octave and a cold shimmer above.
  function celesta(at, m, level = 1, length = 2.6) {
    const into = ctx.createGain();
    into.connect(bus);
    send(into, 0.7);
    for (const [ratio, v, decay] of [
      [1, 1, 1],
      [2, 0.3, 0.55],
      [3.01, 0.1, 0.3],
      [4.17, 0.07, 0.18],
      [6.8, 0.03, 0.08],
    ]) {
      const g = env(at, 0.09 * level * v, 0.003, length * decay, into);
      osc("sine", hz(m) * ratio, at, at + length * decay + 0.1, g);
    }
  }
  // A sine under the chord, its root folded into the octave from E1 to D#2.
  function sub(at, m, length, level = 1) {
    m = 28 + ((((m - 28) % 12) + 12) % 12);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.2 * level, at + 0.05);
    g.gain.setTargetAtTime(0, at + length - 0.1, 0.12);
    g.connect(bus);
    osc("sine", hz(m), at, at + length + 0.6, g);
  }

  // --- the score -----------------------------------------------------------------------
  if (stem === "music") {
    const C = 48,
      Ab = 44,
      Bb = 46,
      Eb = 51;
    // Intro: a dark drone, the vault's celesta and a heartbeat under Mira's radio.
    pad(0.1, DROP - 0.4, [36, 43], 0.55, 420);
    for (const [t, m] of [
      [0.35, 67],
      [1.25, 75],
      [2.05, 74],
      [2.85, 72],
      [3.5, 79],
    ])
      celesta(t, m, 0.6, 3.2);
    for (const t of [1.0, 1.55, 2.6, 3.15]) drum(t, 0.22, 0.8);
    riser(DROP - 1.6, DROP, 0.8);
    swell(DROP - 0.6, DROP, 0.8);

    // The drop: eight bars that climb, the chord changing every two bars, then every bar.
    const chords = [
      [C, [48, 55, 60, 63]],
      [C, [48, 55, 60, 63]],
      [Ab, [44, 51, 56, 60]],
      [Ab, [44, 51, 56, 60]],
      [Eb, [39, 46, 55, 58]],
      [Bb, [46, 53, 58, 62]],
      [C, [48, 55, 60, 63]],
      [Ab, [44, 51, 56, 60]],
    ];
    const OST = [0, 0, 7, 0, 3, 0, 7, 0, 10, 0, 7, 0, 3, 0, 7, 12];
    for (let bar = 0; bar < 8; bar++) {
      const [root, notes] = chords[bar];
      const t0 = beat(bar * 4);
      const hot = bar >= 4;
      const low = root > 47 ? root - 12 : root;
      if (bar === 0 || bar === 2 || bar >= 4)
        braam(t0, root, hot ? 1.7 : 3.4, bar === 0 ? 1.1 : hot ? 0.7 : 0.8);
      if (bar === 0) boom(t0, 1.2);
      else if (bar === 4) boom(t0, 1);
      pad(
        t0,
        2,
        notes.map((n) => n + 12),
        hot ? 1 : 0.8,
        hot ? 2600 : 1900,
      );
      if (hot)
        strings(
          t0,
          2,
          notes.map((n) => n + 24),
          0.9,
        );
      sub(t0, low - 12, hot ? 2 : 2, 0.9);
      for (let s = 0; s < 16; s++) {
        const t = t0 + (s * BEAT) / 4;
        spiccato(t, low + OST[s] + (hot ? 12 : 0), s % 4 === 0 ? 1 : 0.7);
      }
      const kicks = hot ? [0, 3, 6, 8, 10, 11, 14] : [0, 6, 8, 14];
      for (const s of kicks) drum(t0 + (s * BEAT) / 4, s % 8 === 0 ? 1 : 0.7);
      for (const s of [4, 12]) snare(t0 + (s * BEAT) / 4, hot ? 1 : 0.8);
      for (let s = 0; s < 16; s += hot ? 1 : 2)
        tick(t0 + (s * BEAT) / 4, s % 4 === 2 ? 1 : 0.6, s % 2 ? -0.3 : 0.3);
    }
    // The last bar before the break: a roll into silence.
    const rollFrom = beat(28),
      rollTo = beat(32);
    for (let t = rollFrom, step = BEAT / 2; t < rollTo - 0.01; t += step) {
      snare(t, 0.4 + (0.8 * (t - rollFrom)) / (rollTo - rollFrom));
      if (t > rollFrom + 1) step = BEAT / 4;
      if (t > rollFrom + 1.5) step = BEAT / 8;
    }
    for (const [k, f] of [
      [30, 140],
      [30.5, 120],
      [31, 100],
      [31.5, 82],
    ])
      tom(beat(k), f, 0.9);
    riser(beat(26), rollTo, 1);

    // The break: one held note.
    celesta(beat(32), 84, 0.7, 2.8);

    // The vault: half time, a wall of brass on each new chord, Mira over it.
    // Hits fall before her line and in its one pause, so the words stay clear.
    const climax = [
      [33, Ab, [56, 60, 63, 68], 6],
      [39, Bb, [58, 62, 65, 70], 4],
    ];
    for (const [b, root, notes, beats] of climax) {
      const t0 = beat(b);
      const length = beats * BEAT;
      braam(t0, root, Math.min(2.4, length), b === 33 ? 1 : 0.8);
      boom(t0, b === 33 ? 1.1 : 0.8);
      pad(t0, length, notes, 1.3, 1300);
      pad(
        t0,
        length,
        notes.map((n) => n - 12),
        0.9,
        700,
      );
      sub(t0, root - 24, length, 0.8);
    }
    pad(beat(43), 1.5, [60, 63, 67, 72], 1.2, 1500);
    sub(beat(43), C - 24, 1.5, 0.7);
    drum(beat(43), 0.6);
    drum(beat(44), 0.7);
    drum(beat(44.5), 0.8);
    drum(beat(45), 0.9);
    drum(beat(45.5), 1);
    riser(beat(42.5), beat(46), 1.1);
    swell(beat(45), beat(46), 1);

    // The title: the door's answer in C major, rising celesta over a swelling chord.
    const title = beat(46);
    boom(title, 1.4);
    braam(title, 48, 3.2, 1.1);
    pad(title, 3.4, [60, 64, 67, 72], 1.4, 1600);
    pad(title, 3.4, [36, 43, 48], 1, 600);
    [72, 76, 79, 84].forEach((m, i) =>
      celesta(
        title + 0.35 + i * 0.16,
        m,
        i === 3 ? 1.2 : 0.9,
        i === 3 ? 3.4 : 1,
      ),
    );
    celesta(title + 0.35 + 3 * 0.16, 96, 0.4, 2.6);
  }

  // --- the game's effects --------------------------------------------------------------
  if (stem === "effects") {
    const { Sound } = await import("/sound.js?teaser");
    const files = new Map();
    const file = async (name) => {
      if (!files.has(name))
        files.set(
          name,
          await ctx.decodeAudioData(
            await (await fetch(`/audio/${name}`)).arrayBuffer(),
          ),
        );
      return files.get(name);
    };
    // Each of the game's effects is played alone through a Sound of its own, then brought
    // to one loudness: their own levels were set for play, under a mix that is not here.
    const LEAD = (4 * 128) / RATE;
    const alone = async (name, arg) => {
      const solo = new OfflineAudioContext(2, Math.ceil(RATE * 3.5), RATE);
      window.AudioContext = function () {
        return solo;
      };
      const s = new Sound({ volume: 0.8, music: 0, ambience: 0, effects: 1 });
      s.start();
      solo.suspend(LEAD).then(() => {
        s.play(name, arg);
        solo.resume();
      });
      return solo.startRendering();
    };
    // The loudest 0.4 s of a buffer, as an RMS level.
    const peakRms = (buffer) => {
      const L = buffer.getChannelData(0),
        R = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
      const w = Math.floor(RATE * 0.4);
      let best = 0,
        sum = 0;
      for (let i = 0; i < L.length; i++) {
        sum += L[i] * L[i] + R[i] * R[i];
        if (i >= w) sum -= L[i - w] * L[i - w] + R[i - w] * R[i - w];
        best = Math.max(best, sum);
      }
      return Math.sqrt(best / (2 * w)) || 1e-6;
    };
    const place = (buffer, t, gain, where = 0) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = (0.1 / peakRms(buffer)) * gain;
      source.connect(g).connect(pan(where, bus));
      source.start(Math.max(0, t));
    };
    // [t, name, dB, arg] plays the game's own effect, [t, "file", wav, dB, pan] one of its
    // recordings, [t, "whoosh", level] the cut's air.
    const gain = (db) => Math.pow(10, (db ?? 0) / 20);
    for (const e of EFFECTS) {
      const [t, name] = e;
      if (name === "whoosh") whoosh(t, e[2] ?? 1, rnd() < 0.5 ? -1 : 1);
      else if (name === "file")
        place(await file(e[2]), t, gain(e[3]), e[4] ?? 0);
      else place(await alone(name, e[3]), t - LEAD, gain(e[2]));
    }
  }

  // --- Mira ----------------------------------------------------------------------------
  if (stem === "voice") {
    const clip = async (id) =>
      ctx.decodeAudioData(
        await (await fetch(`/audio/voice/${id}.mp3`)).arrayBuffer(),
      );
    for (const [t, what, id, mode] of SOUND) {
      if (what !== "voice") continue;
      const buffer = await clip(id);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.connect(bus);
      if (mode === "radio") {
        // The game's radio: band limited, driven, over static that keys up with the line.
        const low = filter("highpass", 330, 0.7, null);
        const high = filter("lowpass", 3300, 0.8, null);
        const presence = filter("peaking", 1700, 1.1, null);
        presence.gain.value = 4;
        const drive = shaper(1.8);
        gain.gain.value = 0.42;
        source
          .connect(low)
          .connect(high)
          .connect(presence)
          .connect(drive)
          .connect(gain);
        send(gain, 0.12, roomIn);
        const hiss = env(
          t - 0.03,
          0.02,
          0.03,
          buffer.duration + 0.2,
          bus,
          "hold",
        );
        hiss.gain.setTargetAtTime(0, t + buffer.duration + 0.1, 0.08);
        noise(
          t - 0.03,
          t + buffer.duration + 0.6,
          filter("bandpass", 2600, 0.5, hiss),
        );
        const key = env(t - 0.02, 0.03, 0.01, 0.15, bus);
        osc("sine", 1250, t - 0.02, t + 0.2, key);
      } else {
        gain.gain.value = mode === "hall" ? 1.15 : 1.25;
        source.connect(filter("highpass", 90, 0.7, gain));
        send(
          gain,
          mode === "hall" ? 0.22 : 0.08,
          mode === "hall" ? hallIn : roomIn,
        );
      }
      source.start(t);
    }
  }

  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0),
    R = buf.getChannelData(1);
  const bytes = new ArrayBuffer(44 + L.length * 8);
  const v = new DataView(bytes);
  const str = (o, text) =>
    [...text].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + L.length * 8, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 8, true);
  v.setUint16(32, 8, true);
  v.setUint16(34, 32, true);
  str(36, "data");
  v.setUint32(40, L.length * 8, true);
  for (let i = 0, o = 44; i < L.length; i++, o += 8) {
    v.setFloat32(o, L[i], true);
    v.setFloat32(o + 4, R[i], true);
  }
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000)
    bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
