import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";

const media = "media/local-tour";
const receipt = "receipts/level-tour/motion";
const raw = "outputs/level-tour-motion";
const staging = `${raw}/export`;
const ffmpeg = "/opt/homebrew/bin/ffmpeg";
const ffprobe = "/opt/homebrew/bin/ffprobe";
const chapters = ["court", "checkpoint", "isles", "frost", "forest", "sea"];
for (const directory of [staging, `${staging}/posters`, receipt])
  await mkdir(directory, { recursive: true });
const sha = (value) => createHash("sha256").update(value).digest("hex");
async function runtimeSnapshot(directory = "game") {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const result = {};
  for (const entry of entries) {
    if (entry.name === "_verify") continue;
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(result, await runtimeSnapshot(file));
    else if (
      entry.isFile() &&
      /\.(js|json|html|css|svg|png|jpg|jpeg|webp|woff2|mp3|ogg|wav)$/.test(
        entry.name,
      )
    )
      result[file] = sha(await readFile(file));
  }
  return result;
}
const currentRuntime = await runtimeSnapshot();
const ff = (args) =>
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: "inherit",
  });
const probe = (file) =>
  JSON.parse(
    execFileSync(
      ffprobe,
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
const conform =
  "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p";
const encode = [
  "-c:v",
  "libx264",
  "-preset",
  "fast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-color_range",
  "tv",
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-c:a",
  "aac",
  "-ar",
  "48000",
  "-b:a",
  "160k",
  "-movflags",
  "+faststart",
];
const outputs = [],
  clips = [];
async function validate(file, seconds) {
  const data = probe(file);
  const video = data.streams.find((stream) => stream.codec_type === "video");
  const audio = data.streams.find((stream) => stream.codec_type === "audio");
  assert(
    video.codec_name === "h264" &&
      video.pix_fmt === "yuv420p" &&
      video.color_range === "tv" &&
      video.color_space === "bt709" &&
      video.width === 1280 &&
      video.height === 720 &&
      video.avg_frame_rate === "30/1",
    `${file}: compatible video`,
  );
  assert(
    audio.codec_name === "aac" &&
      audio.channels === 2 &&
      Number(audio.sample_rate) === 48000,
    `${file}: compatible sound`,
  );
  assert(
    Math.abs(Number(data.format.duration) - seconds) < 0.06,
    `${file}: expected duration`,
  );
  ff(["-i", file, "-f", "null", "-"]);
  return {
    seconds: Number(data.format.duration),
    bytes: Number(data.format.size),
    sha256: sha(await readFile(file)),
    video: {
      codec: video.codec_name,
      width: video.width,
      height: video.height,
      frameRate: video.avg_frame_rate,
      pixelFormat: video.pix_fmt,
      range: video.color_range,
      colorSpace: video.color_space,
    },
    audio: {
      codec: audio.codec_name,
      channels: audio.channels,
      sampleRate: audio.sample_rate,
    },
  };
}
for (let i = 0; i < chapters.length; i++) {
  const session = chapters[i];
  const capture = JSON.parse(
    await readFile(`${receipt}/${session}.json`, "utf8"),
  );
  assert(
    capture.schema === 2 &&
      capture.requestedSeconds === 45 &&
      !capture.errors.length &&
      !capture.dry &&
      !capture.preview,
    `${session}: final extended capture`,
  );
  assert(
    capture.provenance.runtimeUnchanged &&
      capture.provenance.audioRuntimeUnchanged,
    `${session}: runtime stable throughout capture and audio replay`,
  );
  assert.deepEqual(
    capture.provenance.runtimeSha256,
    currentRuntime,
    `${session}: current complete runtime`,
  );
  assert(
    capture.frames >= 45 * 30,
    `${session}: at least 45 seconds of actual footage`,
  );
  const sourceFile = `${raw}/${session}-mixed.mp4`;
  const source = probe(sourceFile);
  const name = `${String(i + 1).padStart(2, "0")}-${session}`;
  for (const [variant, seconds, suffix] of [
    ["short", 15, ""],
    ["long", 45, "-long"],
  ]) {
    const filename = `${name}${suffix}.mp4`;
    const stage = `${staging}/${filename}`;
    ff([
      "-i",
      sourceFile,
      "-t",
      String(seconds),
      "-vf",
      conform,
      "-af",
      "loudnorm=I=-20:TP=-1.5:LRA=11",
      ...encode,
      stage,
    ]);
    const checked = await validate(stage, seconds);
    clips.push({
      session,
      number: i + 1,
      title: capture.title,
      variant,
      file: `${media}/${filename}`,
      ...checked,
      sourceFile,
      sourceSeconds: Number(source.format.duration),
      cuts: [[0, seconds]],
      sourceFrames: [0, seconds * 30],
      continuous: true,
    });
    outputs.push(filename);
  }
  ff([
    "-ss",
    "2",
    "-i",
    `${staging}/${name}.mp4`,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    `${staging}/posters/${name}.jpg`,
  ]);
  outputs.push(`posters/${name}.jpg`);
  if (session === "sea")
    ff([
      "-i",
      `${staging}/${name}-long.mp4`,
      "-vf",
      "fps=2/15,scale=480:-1,tile=3x2",
      "-frames:v",
      "1",
      `${receipt}/sea-storyboard.jpg`,
    ]);
  console.log(`${session}: short and extended clips validated`);
}
const combined = [];
for (const [variant, seconds, suffix] of [
  ["short", 90, ""],
  ["long", 270, "-long"],
]) {
  const selected = clips.filter((clip) => clip.variant === variant);
  const list =
    selected
      .map(
        (clip) =>
          `file '${process.cwd()}/${staging}/${clip.file.split("/").at(-1)}'`,
      )
      .join("\n") + "\n";
  const concat = `${raw}/concat-${variant}.txt`;
  await writeFile(concat, list);
  const filename = `farseek-six-levels${suffix}.mp4`;
  const stage = `${staging}/${filename}`;
  ff([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concat,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    stage,
  ]);
  const checked = await validate(stage, seconds);
  combined.push({ variant, file: `${media}/${filename}`, ...checked });
  outputs.push(filename);
  ff([
    "-i",
    stage,
    "-vf",
    `fps=1/${seconds / 12},scale=480:-1,tile=4x3`,
    "-frames:v",
    "1",
    `${receipt}/contact-sheet-${variant}.jpg`,
  ]);
}
assert.deepEqual(
  await runtimeSnapshot(),
  currentRuntime,
  "Runtime remains unchanged through final editing",
);
await copyFile(
  "receipts/level-tour/edit.json",
  "receipts/level-tour/initial-edit.json",
  constants.COPYFILE_EXCL,
).catch((error) => {
  if (!["ENOENT", "EEXIST"].includes(error.code)) throw error;
});
await mkdir(`${media}/posters`, { recursive: true });
for (const filename of outputs.sort(
  (a, b) => Number(!a.includes("-long")) - Number(!b.includes("-long")),
))
  await rename(`${staging}/${filename}`, `${media}/${filename}`);
const report = {
  schema: 2,
  runtimeSha256: currentRuntime,
  heroSha256: currentRuntime["game/assets/hero_explorer.js"],
  animationSha256: currentRuntime["game/hero-anim.js"],
  clips,
  combined,
  validation:
    "All fourteen exports matched the full runtime snapshot, passed stream contracts and decoded completely before replacing the previous files",
};
await writeFile(`${receipt}/edit.json`, JSON.stringify(report, null, 2) + "\n");
await writeFile(
  "receipts/level-tour/edit.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      clips: clips.map(({ session, variant, seconds, bytes }) => ({
        session,
        variant,
        seconds,
        bytes,
      })),
      combined,
    },
    null,
    2,
  ),
);
