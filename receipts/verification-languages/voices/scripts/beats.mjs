// Plays each of Mira's scenes in headless Chrome and records what it shows and sounds like:
// screenshots at fixed moments, the subtitle and its speaker, the voice telemetry, the level
// measured on the voice gain, shader programs and page errors.
//   node receipts/verification-mira-voice/beats.mjs [outDir] [--url=http://localhost:3014/]
//   [--only=radio,camp,ice,castle,reunion] [--fallback] [--skip] [--pause] [--frames]
// --frames freezes the game at each shot time on the scene's own clock for exact stills.
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const out =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ||
  "outputs/mira-beats";
const base =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:3014/";
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",");
const fallback = process.argv.includes("--fallback");
// A language's takes: --lang=fr loads the game in French; its speaker label may differ.
const lang = process.argv.find((a) => a.startsWith("--lang="))?.slice(7);
const speaker =
  process.argv.find((a) => a.startsWith("--speaker="))?.slice(10) || "Mira";
const skipping = process.argv.includes("--skip");
const pausing = process.argv.includes("--pause");
const framing = process.argv.includes("--frames");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Forest setup: both seals lit and the castle approach cleared, the explorer on it.
const castleReady = () => {
  const { worldFive: five, hero } = window.__FD__;
  const L = five.level;
  L.locked[0] = L.locked[1] = true;
  for (const p of L.pylons) p.lit = true;
  for (const g of L.guards) {
    g.defeated = true;
    g.hp = 0;
    g.state = "break";
  }
  hero.spawn(-31, -226, L.groundAt(-31, -226), Math.PI);
};
const finale = () => window.__FD__.app.campaign.finale();
const toCamp = () => {
  const { worldThree: three, hero } = window.__FD__;
  const home = three.isles.isle("camp").collider;
  hero.spawn(
    home.x,
    home.z + 9,
    three.isles.groundAt(home.x, home.z + 9),
    Math.PI,
  );
};
const toShore = () => window.__FD__.hero.spawn(-0.5, -92.9, 2.5, Math.PI);
const downPath = () => window.__FD__.hero.spawn(0.2, -6.2, 0, Math.PI);

const CASES = [
  {
    id: "radio",
    query: "chapter=checkpoint",
    setup: downPath,
    shots: [1.5, 7.5, 13, 19.5],
  },
  {
    id: "camp",
    query: "chapter=isles",
    setup: toCamp,
    shots: [2.5, 8.5, 15, 19.5],
  },
  {
    id: "ice",
    query: "chapter=frost",
    setup: toShore,
    shots: [2, 4.4, 7, 10.5],
  },
  {
    id: "castle",
    query: "chapter=forest",
    setup: castleReady,
    shots: [2, 6.9, 8.6, 10.8, 16],
  },
  {
    id: "reunion",
    query: "chapter=sea",
    setup: finale,
    pauseAt: 12,
    skipAt: 10.5,
    shots: [8.5, 10.6, 13, 17.5, 22, 29.5],
  },
].filter((c) => !only || only.includes(c.id));

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const results = [];
try {
  for (const c of CASES) results.push(await play(c));
} finally {
  await writeFile(
    `${out}/result${fallback ? "-fallback" : ""}${skipping ? "-skip" : ""}${pausing ? "-pause" : ""}${framing ? "-frames" : ""}.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  await browser.close();
}
const failed = results.filter((r) => r.problems.length);
for (const r of results)
  console.log(
    `${r.id}: ${r.problems.length ? "FAIL " + r.problems.join("; ") : "ok"} | lines ${r.lines.map((l) => `${l.id}:${l.source}`).join(" ")} | peak rms ${r.peakRms} | programs ${r.programs.join("->")}`,
  );
process.exitCode = failed.length ? 1 : 0;

async function play(c) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The aborted voice requests of the fallback run report themselves; nothing else may.
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !/404/.test(m.text()) &&
      !(fallback && /ERR_FAILED/.test(m.text())) &&
      errors.push(m.text()),
  );
  if (fallback) {
    await page.setRequestInterception(true);
    page.on("request", (request) =>
      /\/audio\/voice\//.test(request.url())
        ? request.abort()
        : request.continue(),
    );
  }
  const voiceRequests = [];
  page.on(
    "request",
    (request) =>
      /\/audio\/voice\//.test(request.url()) &&
      voiceRequests.push(request.url()),
  );
  await page.goto(
    `${base}?nolock=1&debug=1&${c.query}${lang ? `&lang=${lang}` : ""}`,
    { waitUntil: "load" },
  );
  await page.waitForFunction(
    () =>
      window.__READY__ &&
      document.querySelector("#loading")?.hidden &&
      window.__GAME__?.mode === "play",
    { timeout: 240000 },
  );
  await page.waitForFunction(() => !window.__FD__.app.worlds.pending.size, {
    timeout: 240000,
  });
  // A probe on the voice gain measures what the clips actually put through it.
  await page.evaluate(async () => {
    const { miraVoice } = await import("./voice.js");
    const sound = window.__FD__.app.sound;
    sound.start();
    const voice = miraVoice(sound);
    const probe = { rms: 0, peak: 0, voiced: 0 };
    window.__PROBE__ = probe;
    // Every change of pause, voice and scene, logged on the page's own frames.
    window.__VLOG__ = [];
    let last = "";
    const watch = () => {
      const state = window.__FD__.app.state;
      const scene = state.cinematic?.beat ?? (state.cinematic ? "shot" : "");
      const playing = voice.telemetry().playing.join(",");
      const key = `${state.paused}|${!!sound.voiceActive}|${playing}|${scene}`;
      if (key !== last) {
        last = key;
        window.__VLOG__.push({
          t: Math.round(performance.now()),
          paused: state.paused,
          active: !!sound.voiceActive,
          playing,
          scene,
        });
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    const data = new Float32Array(2048);
    let analyser = null;
    setInterval(() => {
      const gain = voice.bus();
      if (!gain) return;
      if (!analyser || analyser.context !== gain.context) {
        analyser = gain.context.createAnalyser();
        analyser.fftSize = 2048;
        gain.connect(analyser);
      }
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      probe.rms = Math.sqrt(sum / data.length);
      probe.peak = Math.max(probe.peak, probe.rms);
      if (sound.voiceActive) probe.voiced = Math.max(probe.voiced, probe.rms);
    }, 50);
  });
  if (c.setup)
    await page.waitForFunction(
      () => !document.querySelector("#chapter-card").classList.contains("on"),
      { timeout: 20000 },
    );
  const programsBefore = await page.evaluate(() => window.__GAME__.programs);
  if (c.setup) await page.evaluate(c.setup);
  const isBeat = (s) =>
    c.id === "reunion"
      ? s.sea?.epilogue?.stage && s.sea.epilogue.stage !== "off"
      : s.beat === c.id;
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < 60000) {
    s = await page.evaluate(() => window.__GAME__);
    if (isBeat(s)) break;
    await sleep(50);
  }
  const problems = [];
  if (!isBeat(s)) problems.push(`beat ${c.id} never started`);
  if (framing) {
    const stills = [];
    for (const at of c.shots) {
      // The page itself pauses on the frame the scene's clock passes `at`.
      await page.evaluate(
        (at, reunion) => {
          window.__FROZEN__ = null;
          const tick = () => {
            const state = window.__FD__.app.state;
            const t = reunion
              ? window.__FD__.worldSix.epilogue.time
              : state.cinematic?.t;
            if ((t ?? 0) >= at) {
              state.paused = true;
              window.__FROZEN__ = t;
            } else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        },
        at,
        c.id === "reunion",
      );
      await page.waitForFunction(() => window.__FROZEN__ !== null, {
        timeout: 90000,
      });
      await sleep(400);
      const path = `${out}/${c.id}-${String(at).replace(".", "_")}s.png`;
      await page.screenshot({ path });
      stills.push({
        at,
        path,
        subtitle: await page.evaluate(
          () => document.querySelector("#subtitle").textContent,
        ),
      });
      await page.evaluate(() => (window.__FD__.app.state.paused = false));
    }
    if (errors.length) problems.push(`errors: ${errors.join(" | ")}`);
    await page.close();
    return { id: c.id, problems, stills, lines: [], programs: [], peakRms: 0 };
  }
  const start = Date.now();
  const timeline = [];
  const shots = [...c.shots];
  let skipped = null,
    paused = null;
  // A translated scene can run longer than the English one: --extra=<s> widens the watch.
  const extra = Number(process.argv.find((a) => a.startsWith("--extra="))?.slice(8) || 6);
  const end = (c.shots.at(-1) + (pausing ? 21 : extra)) * 1000;
  while (Date.now() - start < end) {
    const t = (Date.now() - start) / 1000;
    const sample = await page.evaluate(() => {
      const g = window.__GAME__;
      const el = document.querySelector("#subtitle");
      return {
        beat: g.beat,
        cinematic: g.cinematic,
        stage: g.sea?.epilogue?.stage,
        voiceActive: g.voice.active,
        playing: g.voice.playing,
        rms: +window.__PROBE__.rms.toFixed(4),
        subtitle: el.classList.contains("on") ? el.textContent : "",
        speaker: el.querySelector(".speaker")?.textContent ?? null,
        letterbox: document
          .querySelector("#letterbox")
          .classList.contains("on"),
        card: !document.querySelector("#starward-card").hidden,
        mode: g.mode,
        credits: g.credits,
      };
    });
    timeline.push({ t: +t.toFixed(2), ...sample });
    if (skipping && !skipped && t > (c.skipAt ?? 3.2)) {
      skipped = {
        at: t,
        page: await page.evaluate(() => Math.round(performance.now())),
      };
      await page.keyboard.press("Enter");
    }
    if (pausing && !paused && t > (c.pauseAt ?? 3) && sample.voiceActive) {
      await page.keyboard.press("Escape");
      paused = {
        at: t,
        page: await page.evaluate(() => Math.round(performance.now())),
      };
    }
    if (pausing && paused && !paused.resumed && t > paused.at + 2.5) {
      paused.during = sample;
      await page.evaluate(() => window.__FD__.app.ui.pause(false));
      paused.resumed = t;
    }
    if (!skipping && shots.length && t >= shots[0]) {
      const at = shots.shift();
      await page.screenshot({
        path: `${out}/${c.id}-${String(at).replace(".", "_")}s${fallback ? "-fallback" : ""}${pausing ? "-pause" : ""}.png`,
      });
    }
    if (skipped && !skipped.cleared && !sample.cinematic && !sample.voiceActive)
      skipped.cleared = t;
    if (c.id !== "reunion" && !sample.cinematic && t > 2 && !skipping) break;
    if (c.id === "reunion" && sample.credits) break;
    await sleep(80);
  }
  const final = await page.evaluate(() => window.__GAME__);
  const { log, voicedRms } = await page.evaluate(() => ({
    log: window.__VLOG__,
    voicedRms: window.__PROBE__.voiced,
  }));
  const lines = final.voice.lines;
  const voiced = timeline.filter((x) => x.voiceActive);
  const quiet = timeline.filter((x) => !x.voiceActive && !x.cinematic);
  if (!lines.length) problems.push("no line said");
  if (!fallback && lines.some((l) => l.source !== "clip"))
    problems.push(`lines not from clips: ${JSON.stringify(lines)}`);
  if (fallback && lines.some((l) => l.source !== "fallback"))
    problems.push(`lines not falling back: ${JSON.stringify(lines)}`);
  if (!fallback && !log.some((e) => e.active))
    problems.push("voiceActive never true");
  if (fallback && log.some((e) => e.active))
    problems.push("voiceActive true without clips");
  if (!fallback && !skipping && voicedRms < 0.005)
    problems.push("no level on the voice gain while voiceActive");
  if (final.voice.active) problems.push("voiceActive still true at the end");
  if (!timeline.some((x) => x.speaker === speaker))
    problems.push(`no subtitle with the ${speaker} speaker label`);
  if (timeline.some((x) => (x.playing?.length ?? 0) > 1))
    problems.push("two lines heard at once");
  if (lang && !fallback && voiceRequests.some((url) => !url.includes(`/voice/${lang}/`)))
    problems.push(`takes outside ${lang}: ${voiceRequests.join(", ")}`);
  if (skipping) {
    const settled = log.filter((e) => e.t <= skipped.page + 1500).at(-1);
    if (!settled || settled.active || (c.id !== "reunion" && settled.scene))
      problems.push("skip did not end the scene and its voice within 1.5 s");
    else skipped.cleared = true;
  }
  if (pausing) {
    const held = log.filter((e) => e.paused);
    const stopped = held.find((e) => !e.active);
    const resumed = log.find(
      (e) => !e.paused && e.active && e.t > (held.at(-1)?.t ?? Infinity),
    );
    if (!paused) problems.push("never paused during a line");
    else if (!stopped) problems.push("voice kept playing under the pause menu");
    else if (held.some((e) => e.active && e.t > stopped.t))
      problems.push("voice restarted under the pause menu");
    else if (!resumed) problems.push("voice did not resume after the pause");
    else
      Object.assign(paused, {
        stoppedAfter: (stopped.t - paused.page) / 1000,
        resumedLine: resumed.playing,
      });
  }
  if (c.id === "reunion") {
    const card = timeline.findIndex((x) => x.card);
    const said = timeline.findIndex((x) => x.speaker === speaker);
    if (!skipping && !(said >= 0 && card > said))
      problems.push("reunion lines did not come before the card");
    if (!final.credits) problems.push("credits did not follow");
  }
  if (errors.length) problems.push(`errors: ${errors.join(" | ")}`);
  const programsAfter = final.programs;
  if (programsAfter !== programsBefore)
    problems.push(`programs ${programsBefore} -> ${programsAfter}`);
  await page.close();
  return {
    id: c.id,
    problems,
    programs: [programsBefore, programsAfter],
    lines,
    clips: final.voice.clips,
    peakRms: +Math.max(0, ...timeline.map((x) => x.rms)).toFixed(4),
    voicedRms: +voicedRms.toFixed(4),
    log,
    voicedSamples: voiced.length,
    quietSamples: quiet.length,
    skipped,
    paused,
    timeline,
    errors,
  };
}
