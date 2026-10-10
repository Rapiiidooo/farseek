"""Trims, filters and loudness-matches one language's takes of Mira's lines into mono mp3 clips.

Run from the repository root: python3 -I outputs/voice-l10n/atlas/process.py <fr|es|zh|hi>
"""

import array
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

LANGUAGE = sys.argv[1]
HERE = Path(__file__).parent / LANGUAGE
SOURCE = HERE / "originals"
OUTPUT = Path("game/audio/voice") / LANGUAGE
RATE = 44100
TARGET_LUFS = -18.0
PEAK_LIMIT = 10 ** (-1.5 / 20)
# A soft first word ("And") starts at once, so the lead keeps 80 ms before the first loud window.
LEAD, TAIL = 0.08, 0.2
OUTPUT.mkdir(parents=True, exist_ok=True)


def decode(path, filters=None):
    command = ["ffmpeg", "-v", "error", "-i", str(path)]
    if filters:
        command += ["-af", filters]
    command += ["-f", "f32le", "-ac", "1", "-ar", str(RATE), "pipe:1"]
    return array.array("f", subprocess.run(command, check=True, capture_output=True).stdout)


def loudness(path):
    report = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stderr
    summary = report[report.rfind("Summary:") :]
    integrated = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    peak = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary).group(1))
    return integrated, peak


def speech_bounds(samples):
    window = int(RATE * 0.01)
    threshold = 10 ** (-42 / 20)
    loud = [
        i
        for i in range(0, len(samples) - window, window)
        if math.sqrt(sum(v * v for v in samples[i : i + window]) / window) > threshold
    ]
    start = max(0, loud[0] - int(LEAD * RATE))
    end = min(len(samples), loud[-1] + window + int(TAIL * RATE))
    return start / RATE, end / RATE


results = []
for source in sorted(SOURCE.glob("*.mp3")):
    name = source.stem
    raw = decode(source)
    start, end = speech_bounds(raw)
    trim = f"atrim=start={start:.4f}:end={end:.4f},asetpts=PTS-STARTPTS,highpass=f=75"
    staging = HERE / f"staging-{name}.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-af", trim, "-ac", "1", "-ar", str(RATE), "-c:a", "pcm_f32le", str(staging)],
        check=True,
    )
    integrated, peak_db = loudness(staging)
    gain_db = TARGET_LUFS - integrated
    trimmed = decode(staging)
    peak = max(abs(v) for v in trimmed)
    if peak * 10 ** (gain_db / 20) > PEAK_LIMIT:
        gain_db = 20 * math.log10(PEAK_LIMIT / peak)
    duration = len(trimmed) / RATE
    output = OUTPUT / f"{name}.mp3"
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", str(staging),
            "-af", f"volume={gain_db:.4f}dB,afade=t=in:d=0.004,afade=t=out:st={max(0, duration - 0.04):.4f}:d=0.04",
            "-ac", "1", "-ar", str(RATE), "-c:a", "libmp3lame", "-b:a", "64k", str(output),
        ],
        check=True,
    )
    staging.unlink()
    final = decode(output)
    final_peak = max(abs(v) for v in final)
    final_lufs, _ = loudness(output)
    assert final_peak < 0.95, (name, final_peak)
    results.append(
        {
            "name": name,
            "source": str(source.relative_to(HERE)),
            "output": str(output),
            "trim": [round(start, 3), round(end, 3)],
            "duration": round(len(final) / RATE, 3),
            "sourceLufs": integrated,
            "gainDb": round(gain_db, 2),
            "lufs": final_lufs,
            "peak": round(final_peak, 4),
            "bytes": output.stat().st_size,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        }
    )
    print(f"{name}: {results[-1]['duration']} s, {final_lufs} LUFS, peak {final_peak:.3f}, {output.stat().st_size} bytes")
(HERE / "processed.json").write_text(
    json.dumps({"passed": True, "targetLufs": TARGET_LUFS, "files": results}, indent=2) + "\n"
)
print("total bytes", sum(r["bytes"] for r in results))
