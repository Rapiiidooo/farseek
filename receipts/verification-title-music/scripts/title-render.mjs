// Renders the game's own Sound graph offline (master, makeup and limiter included) at default
// settings: the title's tune, the court's music for reference, the title's silent world, and a
// New game that crosses from the title into the court. Reports BS.1770 loudness and writes WAVs.
//   node title-render.mjs <outDir> [--url=http://localhost:3002/] [--only=title,court] [--part=lead|pads]
// --part renders the tune or the pads alone, to weigh one against the other.
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { measure, wav } from "./loudness.mjs";

const out = process.argv[2] || "outputs/title-music";
const base =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3002/";
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",");
const part = process.argv.find((a) => a.startsWith("--part="))?.slice(7) || "";
await mkdir(out, { recursive: true });

// plan: [seconds, call, argument] applied in order; `title` is Sound.setTitle.
const JOBS = [
  { name: "title", seconds: 160, plan: [[0, "title", true]], skip: 2 },
  {
    name: "court",
    seconds: 160,
    ambience: 0,
    plan: [[0, "music", "court"]],
    skip: 2,
  },
  {
    name: "title-world",
    seconds: 30,
    music: 0,
    plan: [[0, "title", true]],
    skip: 2,
  },
  {
    name: "play-world",
    seconds: 30,
    music: 0,
    plan: [
      [0, "title", true],
      [0.2, "title", false],
    ],
    skip: 6,
  },
  {
    name: "new-game",
    seconds: 110,
    plan: [
      [0, "title", true],
      [70, "title", false],
      [70, "music", "court"],
    ],
    skip: 2,
    windows: true,
  },
];

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}favicon.svg`);
const results = [];
for (const job of JOBS.filter((j) => !only || only.includes(j.name))) {
  const data = await page.evaluate(
    async (job, part) => {
      const RATE = 48000;
      const off = new OfflineAudioContext(2, RATE * job.seconds, RATE);
      window.AudioContext = function () {
        return off;
      };
      const { Sound } = await import(`/sound.js?offline=${Math.random()}`);
      const s = new Sound({
        volume: 0.8,
        music: job.music ?? 0.7,
        ambience: job.ambience ?? 0.8,
        effects: 0.9,
      });
      s.start();
      if (part === "lead") s.pad = () => {};
      if (part === "pads") s.musicNote = () => {};
      s.setPlace("court");
      const hero = { pos: { x: 0, z: 0 }, feet: 0, state: "ground", speed: 0 };
      const plan = [...job.plan];
      const apply = (now) => {
        while (plan.length && plan[0][0] <= now + 1e-6) {
          const [, call, arg] = plan.shift();
          if (call === "title") s.setTitle(arg);
          else {
            s.startMusic();
            s.setMusic(arg);
          }
          clearInterval(s.musicTimer);
        }
      };
      apply(0);
      const Q = 128 / RATE;
      const tick = Math.round(0.1 / Q) * Q;
      for (let t = tick; t < job.seconds - 0.2; t += tick)
        off.suspend(t).then(() => {
          const now = off.currentTime;
          apply(now);
          if (s.music) s.scheduleMusic(now);
          s.ambience.update(tick, { hero, immersion: 0 });
          off.resume();
        });
      if (s.music) s.scheduleMusic(0);
      const buffer = await off.startRendering();
      const encode = (f) => {
        const bytes = new Uint8Array(f.buffer);
        let text = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(text);
      };
      return {
        rate: RATE,
        channels: [
          encode(buffer.getChannelData(0)),
          encode(buffer.getChannelData(1)),
        ],
      };
    },
    job,
    part,
  );
  const channels = data.channels.map((b64) => {
    const bytes = Buffer.from(b64, "base64");
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  });
  const skip = Math.round(data.rate * job.skip);
  const m = measure(
    channels.map((c) => c.subarray(skip)),
    data.rate,
  );
  const name = part ? `${job.name}-${part}` : job.name;
  const row = { name, plan: job.plan, ...m };
  // Short-term loudness every 3 s, to follow a crossing.
  if (job.windows) {
    row.windows = [];
    for (let t = 0; t + 3 <= job.seconds; t += 3) {
      const a = Math.round(t * data.rate),
        b = Math.round((t + 3) * data.rate);
      const w = measure(
        channels.map((c) => c.subarray(a, b)),
        data.rate,
      );
      row.windows.push({ t, lufs: w.integratedLufs, peak: w.samplePeakDbfs });
    }
  }
  results.push(row);
  await writeFile(`${out}/${name}.wav`, wav(channels, data.rate));
  console.log(
    `${name.padEnd(12)} ${m.integratedLufs} LUFS, TP ${m.truePeakDbtp} dBTP, short max ${m.shortTermMaxLufs}`,
  );
}
await writeFile(
  `${out}/title-render${part ? `-${part}` : ""}${only ? `-${only.join("-")}` : ""}.json`,
  JSON.stringify({ base, results, errors }, null, 1),
);
if (errors.length) console.log("errors", errors);
await browser.close();
