const contexts = new WeakMap();
const CLIPS = {
  "boar-alert": { gain: 0.35, duration: 0.75 },
  "boar-charge": { gain: 0.38, duration: 1.1 },
  "boar-hurt": { gain: 0.3, duration: 0.45 },
  "ice-fall": { gain: 0.32, duration: 0.65 },
  "ice-impact": { gain: 0.4, duration: 0.7, file: "ice-fall.wav" },
  "boar-step": { gain: 0.16, duration: 0.11 },
};

function fallback(ctx, name, duration) {
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * duration),
    ctx.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let seed = 781,
    phase = 0,
    low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / ctx.sampleRate,
      u = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    low += (noise - low) * 0.07;
    const envelope = Math.min(1, t / 0.008) * Math.exp(-u * 5) * (1 - u);
    if (name === "ice-fall") {
      phase += (Math.PI * 2 * (2400 - u * 1200)) / ctx.sampleRate;
      samples[i] =
        (Math.sin(phase) * 0.08 + noise * 0.015) * Math.sin(Math.PI * u);
    } else if (name === "ice-impact")
      samples[i] = (noise * 0.45 + low * 0.35) * envelope;
    else if (name === "boar-step")
      samples[i] = (low * 0.6 + Math.sin(t * 420) * 0.5) * envelope;
    else {
      phase +=
        (Math.PI * 2 * (name === "boar-hurt" ? 190 : 95) * (1 - u * 0.4)) /
        ctx.sampleRate;
      const pulse = 0.7 + Math.sin(t * 47) * 0.3;
      samples[i] =
        (Math.sin(phase) * 0.35 + Math.sin(phase * 2.07) * 0.1 + low * 0.65) *
        envelope *
        pulse;
    }
  }
  return buffer;
}

function bank(ctx) {
  if (!contexts.has(ctx))
    contexts.set(ctx, {
      buffers: new Map(),
      pending: new Map(),
      fallbacks: new Map(),
      voices: new Set(),
      events: [],
      serial: 0,
    });
  return contexts.get(ctx);
}

export function prepareEncounterAudio(sound, place = sound.place) {
  if (!sound.ctx) return Promise.resolve([]);
  const state = bank(sound.ctx);
  const names =
    place === "forest"
      ? ["boar-alert", "boar-charge", "boar-hurt"]
      : place === "four"
        ? ["ice-impact"]
        : [];
  return Promise.allSettled(
    names.map((name) => {
      if (state.buffers.has(name)) return Promise.resolve();
      if (!state.pending.has(name)) {
        const request = fetch(
          new URL(
            `./audio/${CLIPS[name].file || name + ".wav"}`,
            import.meta.url,
          ),
        )
          .then((response) => {
            if (!response.ok)
              throw new Error(`Encounter audio ${response.status}: ${name}`);
            return response.arrayBuffer();
          })
          .then((bytes) => sound.ctx.decodeAudioData(bytes))
          .then((buffer) => state.buffers.set(name, buffer))
          .finally(() => state.pending.delete(name));
        state.pending.set(name, request);
      }
      return state.pending.get(name);
    }),
  );
}

export function encounterSound(sound, name, strength = 1) {
  const clip = CLIPS[name];
  if (!clip) return false;
  if (!sound.ctx) return true;
  const ctx = sound.ctx,
    state = bank(ctx);
  if (!state.buffers.has(name) && !state.fallbacks.has(name))
    state.fallbacks.set(name, fallback(ctx, name, clip.duration));
  const buffer = state.buffers.get(name) || state.fallbacks.get(name);
  if (state.voices.size >= 8) {
    const oldest = state.voices.values().next().value;
    state.voices.delete(oldest);
    oldest.stop();
  }
  if (name === "ice-impact")
    for (const voice of state.voices)
      if (voice.encounterName === "ice-fall") {
        state.voices.delete(voice);
        voice.stop();
      }
  const source = ctx.createBufferSource(),
    gain = ctx.createGain();
  source.buffer = buffer;
  source.encounterName = name;
  source.playbackRate.value = [1, 0.985, 1.015][state.serial++ % 3];
  gain.gain.value = clip.gain * Math.max(0, Math.min(1, Number(strength) || 0));
  source.connect(gain).connect(sound.fx || sound.master || ctx.destination);
  source.onended = () => {
    state.voices.delete(source);
    source.disconnect();
    gain.disconnect();
  };
  state.voices.add(source);
  state.events.push({
    name,
    source: state.buffers.has(name) ? "atlas-local" : "procedural",
    at: ctx.currentTime,
  });
  if (state.events.length > 32) state.events.shift();
  source.start();
  return true;
}

export function encounterAudioState(sound) {
  const state = sound.ctx && contexts.get(sound.ctx);
  return state
    ? {
        loaded: [...state.buffers.keys()],
        pending: [...state.pending.keys()],
        voices: state.voices.size,
        events: state.events.map((event) => ({ ...event })),
      }
    : { loaded: [], pending: [], voices: 0, events: [] };
}
