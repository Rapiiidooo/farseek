"""Speaks script lines in Mira's voice with Chatterbox Multilingual (MIT), cloned from France-accented
takes: refs/live.wav for lines delivered live, refs/recorded.wav for recorded ones.

Run from the repository root with the scratch Chatterbox environment:
  <venv>/bin/python -I outputs/voice-l10n/clone/clone.py <fr> <out-dir> <takes|first-last> <label,...> [cfg] [exaggeration]
"""

import json
import sys
import time
from pathlib import Path

import soundfile as sf
import torch
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

LANGUAGE, OUT, TAKES, ONLY, *rest = sys.argv[1:]
CFG = float(rest[0]) if rest else 0.5
EXAGGERATION = float(rest[1]) if len(rest) > 1 else 0.5
HERE = Path(__file__).parent
script = {line["clip"]: line for line in json.loads((HERE.parent / f"script-{LANGUAGE}.json").read_text())}
lines = [script[label] for label in ONLY.split(",")]
out = Path(OUT)
out.mkdir(parents=True, exist_ok=True)

device = "mps" if torch.backends.mps.is_available() else "cpu"
model = ChatterboxMultilingualTTS.from_pretrained(device=device)
manifest = []
current = None
for line in lines:
    ref = HERE / "refs" / ("live.wav" if line["delivery"].startswith("live") else "recorded.wav")
    if ref != current:
        model.prepare_conditionals(str(ref), exaggeration=EXAGGERATION)
        current = ref
    first, last = map(int, TAKES.split("-")) if "-" in TAKES else (1, int(TAKES))
    for take in range(first, last + 1):
        torch.manual_seed(take)
        started = time.time()
        wav = model.generate(line["text"], language_id=LANGUAGE, exaggeration=EXAGGERATION, cfg_weight=CFG)
        path = out / f"{line['clip']}-t{take}.wav"
        sf.write(path, wav.squeeze(0).numpy(), model.sr)
        seconds = wav.shape[-1] / model.sr
        manifest.append(
            {
                "file": str(path),
                "clip": line["clip"],
                "take": take,
                "seed": take,
                "ref": ref.name,
                "cfg": CFG,
                "exaggeration": EXAGGERATION,
                "seconds": round(seconds, 2),
                "slot": round(line["slot"], 2),
                "compute": round(time.time() - started, 1),
            }
        )
        print(f"{path.name:28} {seconds:5.2f}s (slot {line['slot']:.2f}) in {time.time() - started:4.1f}s", flush=True)

previous = json.loads((out / "manifest.json").read_text()) if (out / "manifest.json").exists() else []
done = {row["file"] for row in manifest}
(out / "manifest.json").write_text(
    json.dumps([row for row in previous if row["file"] not in done] + manifest, indent=2) + "\n"
)
