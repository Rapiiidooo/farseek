// Cuts the teaser from the recorded shots on the timeline's beat grid: the cuts in order, a
// letterbox that opens on the drop, white flashes on the big hits, the captions and the card,
// a light grade with grain, and the three sound stems mixed under a ducked score.
//   node scripts/teaser/edit.mjs [dir]
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, writeFile, stat } from "node:fs/promises";
import { CUTS, FLASHES, TITLES, END, FPS, DROP } from "./timeline.mjs";

const dir = process.argv[2] || "outputs/teaser";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const ff = (args) =>
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
const frames = (s) => Math.round(s * FPS);
const TAGS = [
  ...["-color_range", "tv", "-colorspace", "bt709"],
  ...["-color_primaries", "bt709", "-color_trc", "bt709"],
];

// The picture: every cut trimmed from its take and laid end to end.
const inputs = [];
const input = (args) => {
  const key = args.join(" ");
  let i = inputs.findIndex((x) => x.key === key);
  if (i < 0) i = inputs.push({ key, args }) - 1;
  return i;
};
const graph = [];
const pieces = [];
CUTS.forEach((cut, i) => {
  const until = i + 1 < CUTS.length ? CUTS[i + 1].at : END;
  const length = frames(until) - frames(cut.at);
  const id = `c${i}`;
  if (cut.take === "black")
    graph.push(
      `color=black:s=1920x1080:r=${FPS}:d=${(length / FPS).toFixed(4)},format=yuv420p,setsar=1[${id}]`,
    );
  else {
    const k = input(["-i", `${dir}/${cut.take}.mp4`]);
    const from = frames(cut.from);
    graph.push(
      `[${k}:v]trim=start_frame=${from}:end_frame=${from + length},setpts=PTS-STARTPTS,` +
        `${cut.eq ? `eq=${cut.eq},` : ""}format=yuv420p,setsar=1[${id}]`,
    );
  }
  pieces.push(`[${id}]`);
});
graph.push(`${pieces.join("")}concat=n=${pieces.length}:v=1:a=0[cut]`);
// Grade: a touch of contrast and warmth, a soft vignette and moving grain.
graph.push(
  `[cut]eq=contrast=1.05:saturation=1.08:gamma=1.03,vignette=angle=PI/14:mode=forward,` +
    `noise=c0s=4:c0f=t+u:c1s=1:c1f=t+u:c2s=1:c2f=t+u[graded]`,
);
let v = "[graded]";
// The letterbox: 2.39:1 bars that slide away on the drop.
const bar = 138;
graph.push(
  `color=black:s=1920x${bar}:r=${FPS}:d=${END}[top]`,
  `color=black:s=1920x${bar}:r=${FPS}:d=${END}[bottom]`,
  `${v}[top]overlay=x=0:y='if(lt(t,${DROP}),0,-${bar}*min(1,(t-${DROP})/0.18))':eval=frame[lb1]`,
  `[lb1][bottom]overlay=x=0:y='if(lt(t,${DROP}),H-${bar},H-${bar}+${bar}*min(1,(t-${DROP})/0.18))':eval=frame[lb2]`,
);
v = "[lb2]";
// White flashes on the hits: [at, seconds, strength].
FLASHES.forEach(([at, seconds, strength], i) => {
  graph.push(
    `color=white:s=1920x1080:r=${FPS}:d=${seconds},format=rgba,` +
      `colorchannelmixer=aa=${strength},fade=t=out:st=0:d=${seconds}:alpha=1,` +
      `setpts=PTS-STARTPTS+${at}/TB[f${i}]`,
    `${v}[f${i}]overlay=eof_action=pass[fl${i}]`,
  );
  v = `[fl${i}]`;
});
// Captions and the card, rendered by titles.mjs.
TITLES.forEach((title, i) => {
  const k = input([
    "-framerate",
    String(FPS),
    "-i",
    `${dir}/titles/${title.id}/%04d.png`,
  ]);
  graph.push(
    `[${k}:v]format=rgba,setpts=PTS-STARTPTS+${title.at}/TB[t${i}]`,
    `${v}[t${i}]overlay=eof_action=pass[ti${i}]`,
  );
  v = `[ti${i}]`;
});
// The screenshots are full range BT.601; the delivery is limited range BT.709.
graph.push(
  `${v}fade=t=in:st=0:d=0.5,trim=end=${END},` +
    `scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,` +
    `format=yuv420p[out]`,
);
await writeFile(`${dir}/picture-graph.txt`, graph.join(";\n"));
ff([
  ...inputs.flatMap((x) => x.args),
  "-/filter_complex",
  `${dir}/picture-graph.txt`,
  "-map",
  "[out]",
  ...["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high"],
  ...["-r", String(FPS), "-pix_fmt", "yuv420p", ...TAGS, `${dir}/picture.mp4`],
]);

// The sound: the score ducked under Mira, the game's effects, Mira, then brought to -14 LUFS.
const mix =
  `[0:a]volume=0.7[music];[2:a]asplit=2[voice][key];` +
  `[music][key]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=400:makeup=1[ducked];` +
  `[1:a]volume=0.8[effects];` +
  `[ducked][effects][voice]amix=inputs=3:weights=1 1 0.95:normalize=0,` +
  `atrim=end=${END},afade=t=out:st=${(END - 1.2).toFixed(3)}:d=1.2[out]`;
ff([
  ...["-i", `${dir}/stem-music.wav`, "-i", `${dir}/stem-effects.wav`],
  ...["-i", `${dir}/stem-voice.wav`, "-filter_complex", mix, "-map", "[out]"],
  ...["-c:a", "pcm_f32le", "-ar", "48000", `${dir}/mix.wav`],
]);
const measure = (file, extra = "") => {
  const r = spawnSync(
    FFMPEG,
    [
      ...["-hide_banner", "-nostats", "-i", file, "-af"],
      `${extra}loudnorm=I=-14:TP=-1.0:LRA=9:print_format=json`,
      ...["-f", "null", "-"],
    ],
    { encoding: "utf8" },
  );
  const from = r.stderr.lastIndexOf("{");
  return JSON.parse(r.stderr.slice(from, r.stderr.indexOf("}", from) + 1));
};
const m = measure(`${dir}/mix.wav`);
ff([
  ...["-i", `${dir}/mix.wav`, "-af"],
  `loudnorm=I=-14:TP=-1.0:LRA=9:measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
    `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
  ...["-ar", "48000", `${dir}/master.wav`],
]);
ff([
  ...["-i", `${dir}/picture.mp4`, "-i", `${dir}/master.wav`],
  ...[
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
  ],
  ...["-movflags", "+faststart", "-shortest", `${dir}/farseek-teaser.mp4`],
]);
// A lighter copy for sharing: the same picture held under 8 Mb/s.
ff([
  ...["-i", `${dir}/farseek-teaser.mp4`, "-c:v", "libx264", "-preset", "slow"],
  ...["-crf", "21", "-maxrate", "8M", "-bufsize", "16M", "-profile:v", "high"],
  ...[
    "-pix_fmt",
    "yuv420p",
    ...TAGS,
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
  ],
  `${dir}/farseek-teaser-web.mp4`,
]);
const done = measure(`${dir}/master.wav`);
const size = (await stat(`${dir}/farseek-teaser.mp4`)).size;
const web = (await stat(`${dir}/farseek-teaser-web.mp4`)).size;
const report = {
  seconds: END,
  cuts: CUTS.map((c, i) => ({
    ...c,
    until: i + 1 < CUTS.length ? CUTS[i + 1].at : END,
  })),
  loudness: { integrated: +done.input_i, truePeak: +done.input_tp },
  megabytes: +(size / 1e6).toFixed(1),
  webMegabytes: +(web / 1e6).toFixed(1),
};
await writeFile(`${dir}/edit.json`, JSON.stringify(report, null, 1));
console.log(
  `${END}s, ${report.megabytes} MB (web ${report.webMegabytes} MB), ${done.input_i} LUFS, ${done.input_tp} dBTP`,
);
