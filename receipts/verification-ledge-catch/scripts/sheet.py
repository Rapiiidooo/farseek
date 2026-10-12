# Lays eight frames of a sequence side by side, four to a row, with ffmpeg.
#   python3 sheet.py <dir> <prefix> <out.jpg> <frame> x8
import subprocess, sys

folder, prefix, out, *frames = sys.argv[1:]
inputs, scaled = [], []
for i, n in enumerate(frames):
    inputs += ["-i", f"{folder}/{prefix}-{int(n):03d}.jpg"]
    scaled.append(f"[{i}]scale=480:270[v{i}]")
layout = "|".join(f"{(i % 4) * 480}_{(i // 4) * 270}" for i in range(len(frames)))
graph = ";".join(scaled) + ";" + "".join(f"[v{i}]" for i in range(len(frames)))
graph += f"xstack=inputs={len(frames)}:layout={layout}"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", graph, "-frames:v", "1", "-q:v", "4", out], check=True)
