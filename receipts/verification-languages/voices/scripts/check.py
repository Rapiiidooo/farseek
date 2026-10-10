"""Checks one language's processed takes: what the speech recognizer hears against the script,
the language it detects, and how much each line slows its scene.

Run with the scratch faster-whisper environment from the repository root:
  <venv>/bin/python -I outputs/voice-l10n/check.py <fr|es|zh|hi>
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

LANGUAGE = sys.argv[1]
HERE = Path(__file__).parent
script = json.loads((HERE / f"script-{LANGUAGE}.json").read_text())
processed = {
    f["name"]: f for f in json.loads((HERE / "atlas" / LANGUAGE / "processed.json").read_text())["files"]
}
model = WhisperModel(sys.argv[2] if len(sys.argv) > 2 else "small", device="cpu", compute_type="int8")
# Without a hint the recognizer writes Mandarin in traditional characters.
PROMPT = {"zh": "以下是普通话的句子，使用简体中文。", "hi": "यह हिंदी में बोला गया वाक्य है।"}.get(LANGUAGE)


def pcm(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def plain(text):
    text = unicodedata.normalize("NFKC", text).lower()
    text = "".join(c for c in text if unicodedata.category(c)[0] in "LNZ")
    return re.sub(r"\s+", "" if LANGUAGE == "zh" else " ", text).strip()


rows = []
for line in script:
    clip = line["clip"]
    audio = pcm(Path("game/audio/voice") / LANGUAGE / f"{clip}.mp3")
    segments, info = model.transcribe(audio, language=None, beam_size=5, initial_prompt=PROMPT)
    heard = " ".join(s.text.strip() for s in segments)
    score = difflib.SequenceMatcher(None, plain(line["text"]), plain(heard)).ratio()
    seconds = processed[clip]["duration"]
    rate = line["slot"] / max(line["slot"], seconds + 0.2)
    rows.append(
        {
            "clip": clip,
            "detected": info.language,
            "match": round(score, 3),
            "seconds": seconds,
            "english": round(line["englishSeconds"], 3),
            "slot": round(line["slot"], 2),
            "pace": round(rate, 3),
            "text": line["text"],
            "heard": heard,
        }
    )
    flag = "" if score >= 0.85 and info.language == LANGUAGE else "  <-- check"
    print(f"{clip:22} {info.language} match {score:.2f} {seconds:5.2f}s pace {rate:.2f}{flag}")

(HERE / f"check-{LANGUAGE}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
low = [r for r in rows if r["match"] < 0.85 or r["detected"] != LANGUAGE]
print(f"{LANGUAGE}: {len(rows)} takes, {len(low)} to check, slowest pace {min(r['pace'] for r in rows):.2f}")
