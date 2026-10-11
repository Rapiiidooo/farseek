"""Gives candidate takes the game's voice treatment (trim, 75 Hz highpass, -18 LUFS, peak under
-1.5 dBFS, 64 kbps mono mp3) so they can be compared with the shipped takes by ear.

  python3 -I outputs/voice-l10n/clone/preview.py <out-dir> <audio...>
"""

import array
import math
import re
import subprocess
import sys
from pathlib import Path

RATE = 44100
TARGET_LUFS = -18.0
PEAK_LIMIT = 10 ** (-1.5 / 20)
LEAD, TAIL = 0.08, 0.2


def decode(path):
    command = ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "pipe:1"]
    return array.array("f", subprocess.run(command, check=True, capture_output=True).stdout)


def lufs(path):
    report = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128", "-f", "null", "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stderr
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", report[report.rfind("Summary:") :]).group(1))


def bounds(samples):
    window = int(RATE * 0.01)
    threshold = 10 ** (-42 / 20)
    loud = [
        i
        for i in range(0, len(samples) - window, window)
        if math.sqrt(sum(v * v for v in samples[i : i + window]) / window) > threshold
    ]
    return max(0, loud[0] - int(LEAD * RATE)) / RATE, min(len(samples), loud[-1] + window + int(TAIL * RATE)) / RATE


out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for source in map(Path, sys.argv[2:]):
    start, end = bounds(decode(source))
    staging = out / f"staging-{source.stem}.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-af",
         f"atrim=start={start:.4f}:end={end:.4f},asetpts=PTS-STARTPTS,highpass=f=75",
         "-ac", "1", "-ar", str(RATE), "-c:a", "pcm_f32le", str(staging)],
        check=True,
    )
    gain = TARGET_LUFS - lufs(staging)
    trimmed = decode(staging)
    peak = max(abs(v) for v in trimmed)
    if peak * 10 ** (gain / 20) > PEAK_LIMIT:
        gain = 20 * math.log10(PEAK_LIMIT / peak)
    duration = len(trimmed) / RATE
    target = out / f"{source.stem}.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(staging), "-af",
         f"volume={gain:.4f}dB,afade=t=in:d=0.004,afade=t=out:st={max(0, duration - 0.04):.4f}:d=0.04",
         "-ac", "1", "-ar", str(RATE), "-c:a", "libmp3lame", "-b:a", "64k", str(target)],
        check=True,
    )
    staging.unlink()
    print(f"{target.name}: {duration:.2f} s, gain {gain:+.1f} dB")
