// Procedural one-shots for traversal and combat verbs: ropes and swings, the ice axe and vines,
// the orb's pull and shield, recovered health, the frost predator and water currents.

const NAMES = new Set([
  "rope",
  "swing",
  "axe",
  "vine",
  "tether",
  "shield",
  "heal",
  "predator",
  "pounce",
  "current",
]);
const SPACING = { rope: 0.35, vine: 0.25, current: 0.6, swing: 0.2 };
const played = new WeakMap();

export function actionSound(sound, name, arg) {
  if (!NAMES.has(name)) return false;
  const ctx = sound.ctx;
  const now = ctx.currentTime;
  let last = played.get(sound);
  if (!last) played.set(sound, (last = new Map()));
  if (now - (last.get(name) ?? -9) < (SPACING[name] ?? 0.05)) return true;
  last.set(name, now);
  const strength = Number.isFinite(Number(arg))
    ? Math.max(0.2, Math.min(1, Number(arg)))
    : 1;
  const t = now + 0.005;
  const out = sound.fx;
  const r = Math.random;
  switch (name) {
    // Fibre under load: a slow ratchet of friction through a narrow resonance.
    case "rope":
      creak(
        ctx,
        t,
        26 + r() * 18,
        700 + r() * 250,
        0.45 + r() * 0.3,
        0.05 * strength,
        out,
      );
      return true;
    case "swing":
      whoosh(sound, t, 0.5, 350, 1400, 0.07 * strength, out);
      return true;
    // The pick bites: a hard click, a short metallic ring and crushed ice.
    case "axe":
      noise(sound, t, "highpass", 3500, 0.7, 0.03, 0.12 * strength, out);
      sound.ring(2140, t, 0.22, 0.03 * strength, out, "sine", 0.001);
      sound.ring(3310, t, 0.14, 0.018 * strength, out, "sine", 0.001);
      noise(sound, t + 0.01, "bandpass", 1600, 1, 0.14, 0.08 * strength, out);
      sound.ring(150, t, 0.12, 0.08 * strength, out, "sine", 0.002);
      sound.body?.effort("axe");
      return true;
    case "vine":
      for (let at = 0; at < 0.38; at += 0.04 + r() * 0.06)
        noise(
          sound,
          t + at,
          "bandpass",
          2600 + r() * 2600,
          0.9,
          0.07,
          (0.03 + r() * 0.03) * strength,
          out,
        );
      noise(sound, t, "lowpass", 600, 0.6, 0.35, 0.05 * strength, out, 0.08);
      return true;
    // The orb reaches out and draws: a rising tone with a tremble, over a stretched hiss.
    case "tether": {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(920, t + 0.45);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 * strength, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 17;
      const depth = ctx.createGain();
      depth.gain.value = 40;
      lfo.connect(depth).connect(o.frequency);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.6);
      lfo.start(t);
      lfo.stop(t + 0.6);
      whoosh(sound, t, 0.45, 2400, 900, 0.03 * strength, out);
      return true;
    }
    case "shield":
      for (const [f, level] of [
        [659.25, 0.035],
        [987.77, 0.025],
        [1318.5, 0.015],
      ]) {
        sound.ring(f, t, 0.9, level * strength, out, "sine", 0.06);
        sound.ring(
          f * 1.004,
          t,
          0.9,
          level * 0.6 * strength,
          out,
          "sine",
          0.06,
        );
      }
      whoosh(sound, t, 0.35, 900, 3200, 0.03 * strength, out);
      return true;
    // A pip refilled: two soft bronze notes, a fifth apart in the music's key.
    case "heal": {
      const root = sound.musicRoot?.() ?? 523.25;
      sound.ring(root, t, 0.9, 0.05, out, "sine", 0.004);
      sound.ring(root * 2.76, t, 0.4, 0.012, out, "sine", 0.004);
      sound.ring(root * 1.5, t + 0.12, 1.1, 0.045, out, "sine", 0.004);
      return true;
    }
    // A rough low growl: a buzzing source, beaten by a fast flutter, under a throaty resonance.
    case "predator":
      growl(ctx, t, 72 + r() * 14, 1 + r() * 0.3, 0.09 * strength, out);
      sound.alerted?.(0.75);
      return true;
    case "pounce":
      growl(ctx, t, 110 + r() * 20, 0.38, 0.1 * strength, out);
      whoosh(sound, t + 0.05, 0.4, 500, 1800, 0.06 * strength, out);
      sound.alerted?.(0.9);
      return true;
    case "current":
      noise(sound, t, "lowpass", 520, 0.6, 1.3, 0.09 * strength, out, 0.35);
      whoosh(sound, t, 1.2, 220, 640, 0.05 * strength, out);
      for (let i = 0; i < 5; i++) {
        const at = t + 0.2 + r() * 0.8,
          f = 260 + r() * 400;
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(f, at);
        o.frequency.exponentialRampToValueAtTime(f * 2.2, at + 0.06);
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.02 * strength, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + 0.1);
      }
      return true;
    default:
      return true;
  }
}

function noise(sound, t, type, f, q, length, level, into, attack = 0.002) {
  const ctx = sound.ctx;
  const src = ctx.createBufferSource();
  src.buffer = sound.noise;
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
  src.start(t, Math.random() * 0.8, length + 0.05);
}

function whoosh(sound, t, length, from, to, level, into) {
  const ctx = sound.ctx;
  const src = ctx.createBufferSource();
  src.buffer = sound.noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.1;
  band.frequency.setValueAtTime(from, t);
  band.frequency.exponentialRampToValueAtTime(to, t + length);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + length * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(band).connect(g).connect(into);
  src.start(t, Math.random() * 0.8, length + 0.05);
}

function creak(ctx, t, rate, f, length, level, into) {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(rate, t);
  o.frequency.linearRampToValueAtTime(
    rate * (0.6 + Math.random() * 0.9),
    t + length,
  );
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 7;
  band.frequency.setValueAtTime(f, t);
  band.frequency.linearRampToValueAtTime(f * 0.88, t + length);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + length * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(band).connect(g).connect(into);
  o.start(t);
  o.stop(t + length + 0.05);
}

function growl(ctx, t, f, length, level, into) {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(f * 0.9, t);
  o.frequency.linearRampToValueAtTime(f * 1.12, t + length * 0.4);
  o.frequency.linearRampToValueAtTime(f * 0.85, t + length);
  const flutter = ctx.createGain();
  flutter.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.value = 24 + Math.random() * 10;
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  lfo.connect(depth).connect(flutter.gain);
  const throat = ctx.createBiquadFilter();
  throat.type = "bandpass";
  throat.frequency.value = 340;
  throat.Q.value = 1.6;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.06);
  g.gain.setValueAtTime(level, t + length * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(flutter).connect(throat).connect(lp).connect(g).connect(into);
  o.connect(lp);
  o.start(t);
  o.stop(t + length + 0.05);
  lfo.start(t);
  lfo.stop(t + length + 0.05);
}
