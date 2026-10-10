// Development probe: renders the music offline through the game's own Sound class, one place
// after another as a play-through would change them, and reports the loudness of every half
// second, a spectrogram and a WAV to listen to. Nothing plays aloud and no game is loaded.
//   node scripts/music-preview.mjs [outDir] [--url=http://localhost:3002/] [--effects]
// --effects renders the wind and footfalls of each world instead of the music; --part=lead or
// --part=pads renders the tune or the pads alone, to weigh one against the other.
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const out = process.argv[2]?.startsWith("--")
  ? "outputs/music-preview"
  : process.argv[2] || "outputs/music-preview";
const base =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/";
const effects = process.argv.includes("--effects");
const expansion = process.argv.includes("--expansion");
const part = process.argv.find((a) => a.startsWith("--part="))?.slice(7) || "";
await mkdir(out, { recursive: true });

// Seconds from the start at which the music changes place, as a play-through would.
const PLAN = effects
  ? [
      [0, "court"],
      [12, "two"],
      [24, "three"],
      [36, "four"],
      [48, "forest"],
      [60, "sea"],
    ]
  : expansion
    ? [
        [0, "forest"],
        [45, "sea"],
        [90, "guardian"],
        [120, "sea"],
        [145, "finale"],
      ]
    : [
        [0, "court"],
        [70, "court-open"],
        [100, "world2"],
        [150, "fight"],
        [165, "world2"],
        [185, "isles"],
        [260, "frost"],
        [345, "finale"],
      ];
const SECONDS = effects ? 72 : expansion ? 180 : 400;

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && m.location().url !== `${base}favicon.ico`)
    errors.push(m.text());
});
await page.goto(`${base}favicon.svg`);
const result = await page.evaluate(
  async (PLAN, SECONDS, effects, part) => {
    const { Sound } = await import("/sound.js");
    const RATE = 44100;
    const off = new OfflineAudioContext(2, RATE * SECONDS, RATE);
    window.AudioContext = function () {
      return off;
    };
    const s = new Sound({
      volume: 0.8,
      music: effects ? 0 : 0.7,
      effects: effects ? 0.9 : 0,
    });
    s.start();
    if (part === "lead") s.pad = () => {};
    if (part === "pads") s.musicNote = () => {};
    if (!effects) {
      s.startMusic();
      clearInterval(s.musicTimer);
    }
    // A walker for the footfalls: always on the ground, at a jog.
    const hero = { pos: { x: 0, z: 0 }, state: "ground", speed: 4 };
    const plan = [...PLAN];
    const q = 128 / RATE;
    const tickEvery = Math.round(0.1 / q) * q;
    for (let t = tickEvery; t < SECONDS - 0.2; t += tickEvery)
      off.suspend(t).then(() => {
        const now = off.currentTime;
        while (plan.length && plan[0][0] <= now + 1e-6) {
          const [, where] = plan.shift();
          if (effects) s.setPlace(where);
          else s.setMusic(where);
        }
        if (effects) s.update(tickEvery, hero, null);
        else s.scheduleMusic(now);
        off.resume();
      });
    // The first place at time zero.
    const [, first] = plan.shift();
    if (effects) s.setPlace(first);
    else s.setMusic(first);
    if (!effects) s.scheduleMusic(0);
    const buf = await off.startRendering();
    const L = buf.getChannelData(0),
      R = buf.getChannelData(1);
    // Loudness of every half second, in dB of full scale.
    const win = RATE / 2,
      windows = [];
    let peakAll = 0;
    for (let i = 0; i + win <= L.length; i += win) {
      let sum = 0,
        peak = 0;
      for (let j = i; j < i + win; j++) {
        const m = (L[j] + R[j]) / 2;
        sum += m * m;
        peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]));
      }
      peakAll = Math.max(peakAll, peak);
      windows.push({
        t: i / RATE,
        rms: 10 * Math.log10(sum / win + 1e-12),
        peak: 20 * Math.log10(peak + 1e-12),
      });
    }
    // A spectrogram, on a log frequency scale from 60 Hz to 8 kHz.
    const N = 4096,
      hop = RATE / 4,
      frames = Math.floor((L.length - N) / hop);
    const H = 320;
    const c = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "canvas",
    );
    c.width = frames;
    c.height = H + 40;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, c.width, c.height);
    const re = new Float64Array(N),
      im = new Float64Array(N);
    const fft = () => {
      for (let i = 1, j = 0; i < N; i++) {
        let bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
          [re[i], re[j]] = [re[j], re[i]];
          [im[i], im[j]] = [im[j], im[i]];
        }
      }
      for (let len = 2; len <= N; len <<= 1) {
        const a = (-2 * Math.PI) / len;
        for (let i = 0; i < N; i += len)
          for (let k = 0; k < len / 2; k++) {
            const cr = Math.cos(a * k),
              ci = Math.sin(a * k);
            const xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
            const xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
            re[i + k + len / 2] = re[i + k] - xr;
            im[i + k + len / 2] = im[i + k] - xi;
            re[i + k] += xr;
            im[i + k] += xi;
          }
      }
    };
    const img = g.createImageData(frames, H);
    for (let f = 0; f < frames; f++) {
      const o = f * hop;
      for (let i = 0; i < N; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
        re[i] = ((L[o + i] + R[o + i]) / 2) * w;
        im[i] = 0;
      }
      fft();
      for (let y = 0; y < H; y++) {
        const hzv = 60 * Math.pow(8000 / 60, 1 - y / (H - 1));
        const k = Math.round((hzv * N) / RATE);
        const db = 20 * Math.log10(Math.hypot(re[k], im[k]) / N + 1e-12);
        const v = Math.max(0, Math.min(1, (db + 110) / 70));
        const p = (y * frames + f) * 4;
        img.data[p] = 255 * Math.min(1, v * 1.6);
        img.data[p + 1] = 255 * Math.max(0, v * 1.4 - 0.35);
        img.data[p + 2] = 255 * Math.max(0, 0.6 - v) * (v > 0.02);
        img.data[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = "#fff";
    g.font = "12px sans-serif";
    for (const [t, where] of PLAN) {
      const x = (t * RATE) / hop;
      g.fillRect(x, 0, 1, H + 6);
      g.fillText(where, x + 3, H + 18);
    }
    for (const hzv of [100, 250, 500, 1000, 2000, 4000]) {
      const y = (1 - Math.log(hzv / 60) / Math.log(8000 / 60)) * (H - 1);
      g.fillRect(0, y, 6, 1);
      g.fillText(`${hzv}`, 8, y + 4);
    }
    // 16-bit WAV of the whole render.
    const bytes = new ArrayBuffer(44 + L.length * 4);
    const v = new DataView(bytes);
    const str = (o, s) =>
      [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    str(0, "RIFF");
    v.setUint32(4, 36 + L.length * 4, true);
    str(8, "WAVEfmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, RATE, true);
    v.setUint32(28, RATE * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    str(36, "data");
    v.setUint32(40, L.length * 4, true);
    for (let i = 0, o = 44; i < L.length; i++, o += 4) {
      v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    }
    const u8 = new Uint8Array(bytes);
    let bin = "";
    for (let i = 0; i < u8.length; i += 0x8000)
      bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return {
      windows,
      peakAll: 20 * Math.log10(peakAll + 1e-12),
      png: c.toDataURL("image/png"),
      wav: btoa(bin),
    };
  },
  PLAN,
  SECONDS,
  effects,
  part,
);
const name = effects ? "effects" : part ? `music-${part}` : "music";
await writeFile(
  `${out}/${name}-spectrogram.png`,
  Buffer.from(result.png.split(",")[1], "base64"),
);
await writeFile(`${out}/${name}.wav`, Buffer.from(result.wav, "base64"));
// Loudness per place, and the largest jump from one half second to the next.
const report = [];
for (const [i, [t, where]] of PLAN.entries()) {
  const end = PLAN[i + 1]?.[0] ?? SECONDS;
  const w = result.windows.filter((x) => x.t >= t + 8 && x.t < end);
  if (!w.length) continue;
  const mean =
    10 *
    Math.log10(w.reduce((a, x) => a + Math.pow(10, x.rms / 10), 0) / w.length);
  report.push({
    where,
    from: t,
    rmsDb: +mean.toFixed(1),
    peakDb: +Math.max(...w.map((x) => x.peak)).toFixed(1),
  });
}
let jump = { db: 0, t: 0 };
for (let i = 1; i < result.windows.length; i++) {
  const d = result.windows[i].rms - result.windows[i - 1].rms;
  if (result.windows[i].rms > -60 && d > jump.db)
    jump = { db: d, t: result.windows[i].t };
}
const summary = {
  places: report,
  peakDb: +result.peakAll.toFixed(1),
  largestRiseDb: +jump.db.toFixed(1),
  at: jump.t,
  errors,
};
await writeFile(
  `${out}/${name}-levels.json`,
  JSON.stringify({ ...summary, windows: result.windows }, null, 1),
);
console.log(JSON.stringify(summary, null, 1));
await browser.close();
