const banks = new WeakMap();
const shotAsset = "./audio/pistol-shot.wav";
const impactKinds = new Set(["impact-surface", "impact-protected"]);
const effectAssets = {
  "reload-release": ["pistol-reload-release.wav", 0.45],
  "reload-belt": ["pistol-reload-belt.wav", 0.4],
  "reload-seat": ["pistol-reload-seat.wav", 0.56],
  "reload-rack": ["pistol-reload-rack.wav", 0.48],
  "reload-land": ["pistol-magazine-land.wav", 0.28],
  "climb-grip": ["climb-grip.wav", 0.28],
  "climb-pull": ["climb-pull.wav", 0.3],
  "climb-step": ["climb-step.wav", 0.34],
};

function fallbackEffect(ctx, kind) {
  const duration =
    kind === "reload-belt" || kind === "climb-pull"
      ? 0.45
      : kind === "reload-land"
        ? 0.5
        : 0.3;
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * duration),
    ctx.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let seed = 83741,
    low = 0,
    body = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    low += (noise - low) * 0.16;
    body += (noise - body) * 0.025;
    const t = i / ctx.sampleRate;
    const click = (time, decay) =>
      time < 0 ? 0 : Math.exp(-time * decay) * Math.min(1, time * 1800);
    const mechanical =
      kind === "reload-land"
        ? click(t, 38) + 0.35 * click(t - 0.11, 54)
        : kind === "reload-rack"
          ? click(t, 75) + 0.8 * click(t - 0.12, 105)
          : kind === "reload-seat"
            ? click(t, 90) + 0.7 * click(t - 0.045, 100)
            : click(t, 125) + 0.2 * click(t - 0.07, 55);
    samples[i] =
      kind === "climb-grip"
        ? low * Math.exp(-t * 30) * 0.5 +
          (noise - low) * Math.exp(-t * 60) * 0.12
        : kind === "climb-step"
          ? body * Math.exp(-t * 24) * 3 + low * Math.exp(-t * 60) * 0.3
          : kind === "reload-belt" || kind === "climb-pull"
            ? low * Math.sin((Math.PI * t) / duration) ** 2 * 0.7
            : (noise - low) * mechanical * 0.3 +
              Math.sin(t * 2 * Math.PI * 930) * mechanical * 0.09;
  }
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak > 0)
    for (let i = 0; i < samples.length; i++) samples[i] *= 0.63 / peak;
  return buffer;
}

function fallbackShot(ctx, variant) {
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * 0.34),
    ctx.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let seed = 49231 + variant * 751,
    low = 0,
    body = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    const t = i / ctx.sampleRate;
    low += (noise - low) * 0.27;
    body += (noise - body) * 0.035;
    const attack = Math.min(1, t / 0.0007);
    const crack = (noise - low) * Math.exp(-t * 140) * 0.75;
    const pressure = body * Math.exp(-t * 29) * 2.8;
    const tail = low * Math.exp(-t * 32) * 0.32;
    const clickTime = Math.max(0, t - 0.028);
    const slide =
      t < 0.028 ? 0 : (noise - low) * Math.exp(-clickTime * 190) * 0.1;
    samples[i] =
      Math.tanh((crack + pressure + tail + slide) * attack * 1.6) * 0.74;
  }
  return buffer;
}

function impactEffect(ctx, kind) {
  const protectedHit = kind === "impact-protected";
  const duration = protectedHit ? 0.3 : 0.22;
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * duration),
    ctx.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let seed = 42617,
    low = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    low += (noise - low) * 0.12;
    const t = i / ctx.sampleRate;
    const attack = Math.min(1, t / 0.001);
    const strike = (noise - low) * Math.exp(-t * 125) * 0.45;
    const grit = low * Math.exp(-t * 32) * 1.8;
    const ring = protectedHit
      ? (Math.sin(t * Math.PI * 2 * 1730) +
          Math.sin(t * Math.PI * 2 * 2783) * 0.4) *
        Math.exp(-t * 24) *
        0.16
      : Math.sin(t * Math.PI * 2 * 145) * Math.exp(-t * 45) * 0.14;
    samples[i] = (strike + grit + ring) * attack;
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0)
    for (let i = 0; i < samples.length; i++) samples[i] *= 0.63 / peak;
  return buffer;
}

export function prepareEquipmentAudio(sound) {
  const ctx = sound?.ctx;
  if (!ctx || !sound.fx) return null;
  if (banks.has(ctx)) return banks.get(ctx);
  const bank = {
    clips: [0, 1, 2].map((v) => fallbackShot(ctx, v)),
    next: 0,
    source: "procedural",
    impacts: Object.fromEntries(
      [...impactKinds].map((kind) => [kind, impactEffect(ctx, kind)]),
    ),
    reload: Object.fromEntries(
      Object.keys(effectAssets).map((kind) => [
        kind,
        fallbackEffect(ctx, kind),
      ]),
    ),
    sources: Object.fromEntries(
      Object.keys(effectAssets).map((kind) => [kind, "procedural"]),
    ),
    events: [],
    voices: new Set(),
  };
  banks.set(ctx, bank);
  const load = (asset, apply) =>
    fetch(new URL(asset, import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error(`Equipment audio ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then(apply);
  bank.ready = Promise.allSettled([
    load(shotAsset, (clip) => {
      bank.clips = [clip];
      bank.source = "atlas";
    }),
    ...Object.entries(effectAssets).map(([kind, [asset]]) =>
      load(`./audio/${asset}`, (clip) => {
        bank.reload[kind] = clip;
        bank.sources[kind] = "atlas";
      }),
    ),
  ]);
  return bank;
}

export function equipmentSound(sound, kind, options = {}) {
  const ctx = sound?.ctx;
  if (!ctx || !sound.fx) return;
  const at = ctx.currentTime + (options.delay || 0);
  const gain = ctx.createGain();
  gain.connect(sound.fx);
  if (kind === "shot" || effectAssets[kind] || impactKinds.has(kind)) {
    const bank = prepareEquipmentAudio(sound);
    const index = bank.next++;
    const source = ctx.createBufferSource();
    source.buffer =
      kind === "shot"
        ? bank.clips[index % bank.clips.length]
        : impactKinds.has(kind)
          ? bank.impacts[kind]
          : bank.reload[kind];
    source.playbackRate.value = [1, 0.985, 1.015][index % 3];
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = kind === "shot" ? 10500 : 8500;
    gain.gain.value =
      (impactKinds.has(kind) ? 0.28 : (effectAssets[kind]?.[1] ?? 0.68)) *
      (options.level ?? 1);
    const pan = ctx.createStereoPanner();
    pan.pan.value = options.pan || 0;
    source.connect(filter).connect(pan).connect(gain);
    if (bank.voices.size >= 16) {
      const oldest = bank.voices.values().next().value;
      oldest.stop();
      oldest.onended();
    }
    bank.voices.add(source);
    bank.events.push({
      kind,
      at,
      pan: pan.pan.value,
      source:
        kind === "shot"
          ? bank.source
          : impactKinds.has(kind)
            ? "procedural"
            : bank.sources[kind],
    });
    if (bank.events.length > 32) bank.events.shift();
    source.start(at);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      pan.disconnect();
      gain.disconnect();
      bank.voices.delete(source);
    };
    return;
  }
  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(640, at);
  oscillator.frequency.exponentialRampToValueAtTime(180, at + 0.17);
  oscillator.connect(gain);
  gain.gain.setValueAtTime(0.12, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.23);
  oscillator.start(at);
  oscillator.stop(at + 0.24);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}
