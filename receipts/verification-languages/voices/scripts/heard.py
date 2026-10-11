"""Transcribes candidate takes named <clip>-t<k>.mp3 and scores them against the script.

Run with the scratch faster-whisper environment from the repository root:
  <venv>/bin/python -I outputs/voice-l10n/heard.py <fr|es|zh|hi> <model> <out.json> <audio...>
"""

import difflib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

LANGUAGE, SIZE, OUT, *PATHS = sys.argv[1:]
HERE = Path(__file__).parent
script = {line["clip"]: line for line in json.loads((HERE / f"script-{LANGUAGE}.json").read_text())}
model = WhisperModel(SIZE, device="cpu", compute_type="int8")
# The recognizer writes small numbers as digits where the script spells them.
NUMBERS = {"fr": "zéro un deux trois quatre cinq six sept huit neuf dix".split()}.get(LANGUAGE, [])


def pcm(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def plain(text):
    text = re.sub(r"\b(10|\d)\b", lambda m: NUMBERS[int(m[1])] if NUMBERS else m[1], text)
    text = unicodedata.normalize("NFKC", text).lower()
    text = "".join(c for c in text if unicodedata.category(c)[0] in "LNZ")
    return re.sub(r"\s+", " ", text).strip()


rows = []
for path in map(Path, PATHS):
    clip = re.sub(r"-t\d+$", "", path.stem)
    audio = pcm(path)
    segments, info = model.transcribe(audio, language=None, beam_size=5)
    heard = " ".join(s.text.strip() for s in segments)
    score = difflib.SequenceMatcher(None, plain(script[clip]["text"]), plain(heard)).ratio()
    rows.append(
        {
            "file": str(path),
            "clip": clip,
            "detected": info.language,
            "match": round(score, 3),
            "seconds": round(len(audio) / 16000, 2),
            "heard": heard,
        }
    )
    print(f"{path.stem:26} {info.language} match {score:.2f} {len(audio) / 16000:5.2f}s  {heard}", flush=True)

Path(OUT).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
