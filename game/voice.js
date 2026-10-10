import { t, language } from "./i18n.js";

// Mira's lines, each with its subtitle, through one gain under the master volume.
// `sound.voiceActive` is true while a line is heard, so the mix can make room for it.

const LEVEL = 0.85;
const SPEAKER = t("Mira");
const voices = new WeakMap();
// Pauses a scene keeps after a line, before the next one or its own end.
export const LINE_GAP = 0.2;
export const LAST_GAP = 0.3;

// A scene's clock rate while a line plays: slower when the line runs past the room the scene
// gives it, as a translated take can, so the next line and the camera's next move wait for it.
export const paceFor = (room, spoken) => room / Math.max(room, spoken);

export function miraVoice(sound) {
  let voice = voices.get(sound);
  if (!voice) voices.set(sound, (voice = new Voice(sound)));
  return voice;
}

export function applyVoiceVolume(sound) {
  voices.get(sound)?.applyVolume();
}

class Voice {
  constructor(sound) {
    this.sound = sound;
    this.clips = new Map();
    this.lines = new Set();
    this.waiting = new Set();
    this.log = [];
    this.beatAt = 0;
  }

  get ctx() {
    return this.sound.ctx;
  }

  bus() {
    const ctx = this.ctx;
    if (!ctx || !this.sound.master) return null;
    if (this.gain?.context !== ctx) {
      this.gain = ctx.createGain();
      this.gain.gain.value = this.level();
      this.gain.connect(this.sound.master);
      this.noise = null;
    }
    return this.gain;
  }

  level() {
    return LEVEL * (this.sound.settings?.voice ?? 0.9);
  }

  applyVolume() {
    if (!this.gain) return;
    this.gain.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
  }

  // Fetched ahead of the scene that needs them, decoded once the audio has started.
  prepare(ids) {
    for (const id of ids) this.load(id);
  }

  load(id) {
    let clip = this.clips.get(id);
    if (!clip) {
      clip = { id, state: "loading" };
      this.clips.set(id, clip);
      // A language without its own take of a line falls back on the English one.
      const take = (folder) =>
        fetch(
          new URL(`./audio/voice/${folder}${id}.mp3`, import.meta.url),
        ).then((response) => {
          if (!response.ok) throw new Error(`Voice ${id} ${response.status}`);
          return response.arrayBuffer();
        });
      (language === "en"
        ? take("")
        : take(`${language}/`).catch(() => take(""))
      )
        .then((bytes) => {
          clip.bytes = bytes;
          this.decode(clip);
        })
        .catch(() => (clip.state = "failed"));
    }
    this.decode(clip);
    return clip;
  }

  decode(clip) {
    const ctx = this.ctx;
    if (!ctx || !clip.bytes || clip.buffer || clip.decoding) return;
    clip.decoding = ctx
      .decodeAudioData(clip.bytes.slice(0))
      .then((buffer) => {
        clip.buffer = buffer;
        clip.state = "ready";
      })
      .catch(() => (clip.state = "failed"));
  }

  // How long a line takes: its take once decoded, otherwise the English take's `seconds`.
  length(line) {
    return this.clips.get(line.id)?.buffer?.duration ?? line.seconds;
  }

  // One line: { id, text, mode: "radio" | "tape" | "live", seconds }. A clip still on its
  // way gets a moment to arrive before the line falls back to its subtitle.
  say(line, hud) {
    const clip = this.load(line.id);
    hud?.subtitle(line.text, this.length(line) + 0.4, SPEAKER);
    const entry = { line, hud, clip, offset: 0, owned: true };
    const record = { id: line.id, mode: line.mode, source: "pending" };
    this.log.push(record);
    if (this.log.length > 40) this.log.shift();
    const begin = () => {
      this.waiting.delete(entry);
      if (entry.done) return;
      if (clip.buffer && this.bus()) {
        record.source = "clip";
        this.lines.add(entry);
        this.start(entry);
        this.watch();
      } else {
        record.source = "fallback";
        this.chirp(line.mode);
      }
    };
    if (clip.state === "loading" && this.ctx) {
      this.waiting.add(entry);
      entry.timer = setTimeout(begin, 450);
    } else begin();
  }

  start(entry) {
    const ctx = this.ctx;
    const { line, clip } = entry;
    const at = ctx.currentTime + 0.05;
    const out = ctx.createGain();
    out.connect(this.bus());
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    const nodes = [source, out];
    const node = (made) => (nodes.push(made), made);
    let head = out;
    if (line.mode === "radio") head = this.radio(node, out, at);
    else if (line.mode === "tape") head = this.tape(node, out, at, source);
    source.connect(head);
    source.start(at, entry.offset);
    entry.nodes = nodes;
    entry.out = out;
    entry.started = at;
    entry.playing = true;
    const left = clip.buffer.duration - entry.offset;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this.finish(entry), (left + 0.5) * 1000);
    source.onended = () => this.finish(entry);
    this.sound.voiceActive = true;
  }

  // Band-limited and a little driven, under a bed of static that keys up and down.
  radio(node, out, at) {
    const ctx = this.ctx;
    const low = node(filter(ctx, "highpass", 330, 0.7));
    const high = node(filter(ctx, "lowpass", 3300, 0.8));
    const presence = node(filter(ctx, "peaking", 1700, 1.1, 4));
    const drive = node(ctx.createWaveShaper());
    drive.curve = softClip(1.8);
    const makeup = node(ctx.createGain());
    makeup.gain.value = 0.54;
    low.connect(high).connect(presence).connect(drive).connect(makeup);
    makeup.connect(out);
    this.hiss(node, out, at, 2600, 0.028);
    const key = node(ctx.createOscillator());
    const keyGain = node(ctx.createGain());
    key.frequency.value = 1250;
    keyGain.gain.setValueAtTime(0, at - 0.02);
    keyGain.gain.linearRampToValueAtTime(0.035, at - 0.01);
    keyGain.gain.setTargetAtTime(0, at + 0.03, 0.02);
    key.connect(keyGain).connect(out);
    key.start(at - 0.02);
    key.stop(at + 0.2);
    return low;
  }

  // Warm and a little narrow, with the slow wow of a small field recorder.
  tape(node, out, at, source) {
    const ctx = this.ctx;
    const low = node(filter(ctx, "highpass", 130, 0.7));
    const high = node(filter(ctx, "lowpass", 5600, 0.7));
    const body = node(filter(ctx, "lowshelf", 260, 0.7, 2.5));
    const makeup = node(ctx.createGain());
    makeup.gain.value = 0.85;
    low.connect(high).connect(body).connect(makeup);
    makeup.connect(out);
    const wow = node(ctx.createOscillator());
    const depth = node(ctx.createGain());
    wow.frequency.value = 0.55;
    depth.gain.value = 0.0025;
    wow.connect(depth).connect(source.playbackRate);
    wow.start(at);
    this.hiss(node, out, at, 5200, 0.009);
    return low;
  }

  hiss(node, out, at, frequency, level) {
    const ctx = this.ctx;
    const source = node(ctx.createBufferSource());
    source.buffer = this.noiseBuffer();
    source.loop = true;
    const band = node(filter(ctx, "bandpass", frequency, 0.5));
    const gain = node(ctx.createGain());
    gain.gain.setValueAtTime(0, at - 0.03);
    gain.gain.linearRampToValueAtTime(level, at);
    source.connect(band).connect(gain).connect(out);
    source.start(at - 0.03, Math.random());
  }

  noiseBuffer() {
    if (this.noise) return this.noise;
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 7919;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = (seed >>> 0) / 2147483648 - 1;
    }
    return (this.noise = buffer);
  }

  // Without its clip a line keeps its subtitle and a short, soft radio chirp.
  chirp(mode) {
    const ctx = this.ctx,
      bus = this.bus();
    if (!ctx || !bus) return;
    const at = ctx.currentTime + 0.02;
    const gain = ctx.createGain();
    gain.connect(bus);
    const level = mode === "live" ? 0.025 : 0.04;
    const tones = [1320, 990].map((frequency, i) => {
      const tone = ctx.createOscillator();
      tone.frequency.value = frequency;
      const envelope = ctx.createGain();
      const start = at + i * 0.09;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(level, start + 0.008);
      envelope.gain.setTargetAtTime(0, start + 0.05, 0.015);
      tone.connect(envelope).connect(gain);
      tone.start(start);
      tone.stop(start + 0.16);
      return [tone, envelope];
    });
    tones[1][0].onended = () => {
      for (const [tone, envelope] of tones) {
        tone.disconnect();
        envelope.disconnect();
      }
      gain.disconnect();
    };
  }

  finish(entry) {
    if (entry.done) return;
    entry.done = true;
    clearTimeout(entry.timer);
    this.silence(entry);
    this.lines.delete(entry);
    this.refresh();
  }

  silence(entry, fade = 0) {
    if (!entry.playing) return;
    entry.playing = false;
    const ctx = this.ctx;
    const nodes = entry.nodes;
    const end = () => {
      for (const n of nodes) {
        n.onended = null;
        if (n.stop)
          try {
            n.stop();
          } catch {
            /* never started */
          }
        n.disconnect();
      }
    };
    if (fade > 0 && ctx) {
      entry.out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(end, fade * 1000 + 40);
    } else end();
  }

  refresh() {
    this.sound.voiceActive = [...this.lines].some((e) => e.playing);
    if (![...this.lines].some((e) => e.owned)) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  // A scene calls this every frame it runs. When its frames stop (a pause, the notes, a
  // hidden tab) its lines wait, and they resume where they were with their subtitle.
  alive() {
    this.beatAt = performance.now();
    for (const entry of this.lines)
      if (entry.owned && !entry.playing && !entry.done && this.ctx) {
        const left = entry.clip.buffer.duration - entry.offset;
        entry.hud?.subtitle(entry.line.text, left + 0.4, SPEAKER);
        this.start(entry);
      }
  }

  watch() {
    this.beatAt = performance.now();
    this.watchdog ??= setInterval(() => {
      if (performance.now() - this.beatAt < 300) return;
      for (const entry of this.lines)
        if (entry.owned && entry.playing) {
          entry.offset = Math.min(
            entry.clip.buffer.duration,
            entry.offset + Math.max(0, this.ctx.currentTime - entry.started),
          );
          clearTimeout(entry.timer);
          this.silence(entry, 0.08);
        }
      this.refresh();
    }, 100);
  }

  // The scene is over: lines still speaking finish on their own.
  release() {
    for (const entry of this.lines) entry.owned = false;
    this.refresh();
  }

  // Skipped: every line fades out at once.
  stop() {
    for (const entry of this.waiting) {
      entry.done = true;
      clearTimeout(entry.timer);
    }
    this.waiting.clear();
    for (const entry of [...this.lines]) {
      entry.done = true;
      clearTimeout(entry.timer);
      this.silence(entry, 0.12);
      this.lines.delete(entry);
    }
    this.refresh();
  }

  telemetry() {
    return {
      active: !!this.sound.voiceActive,
      level: this.gain ? +this.gain.gain.value.toFixed(3) : null,
      playing: [...this.lines].filter((e) => e.playing).map((e) => e.line.id),
      lines: this.log.map((l) => ({ ...l })),
      clips: Object.fromEntries(
        [...this.clips].map(([id, clip]) => [id, clip.state]),
      ),
    };
  }
}

function filter(ctx, type, frequency, q, gain = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

function softClip(amount) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}
