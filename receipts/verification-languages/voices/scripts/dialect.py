# Scores French speech by dialect with Voxlect (arXiv 2508.01691): Africa, France, Canada,
# Swiss/Belgium/German. Weights come from the Voxlect checkpoint, so the backbone is built
# from its config alone.
#   python dialect.py <small|large> <out.json> <audio...>
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from transformers import WhisperConfig, WhisperModel

sys.path.insert(0, str(Path(__file__).parent / "voxlect-src"))

LABELS = ["Africa", "France", "Canada", "Swiss/Belgium/German"]
RATE = 16000
WINDOW = 15 * RATE


def from_config(name, **options):
    options.pop("ignore_mismatched_sizes", None)
    return WhisperModel(WhisperConfig.from_pretrained(name, **options))


WhisperModel.from_pretrained = staticmethod(from_config)
from src.model.dialect.whisper_dialect import WhisperWrapper  # noqa: E402


def load(path):
    pcm = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(pcm, dtype=np.float32).copy()


def windows(audio):
    if len(audio) <= WINDOW:
        return [audio]
    step = 10 * RATE
    starts = list(range(0, len(audio) - WINDOW, step)) + [len(audio) - WINDOW]
    return [audio[s : s + WINDOW] for s in starts]


def main():
    size, out, *paths = sys.argv[1:]
    repo = {
        "small": "tiantiaf/voxlect-french-dialect-whisper-small",
        "large": "tiantiaf/voxlect-french-dialect-whisper-large-v3",
    }[size]
    torch.manual_seed(0)
    model = WhisperWrapper.from_pretrained(repo).eval()
    from huggingface_hub import hf_hub_download
    from safetensors import safe_open
    with safe_open(hf_hub_download(repo, "model.safetensors"), "pt") as f:
        saved = set(f.keys())
    own = set(model.state_dict().keys())
    print(f"weights: {len(own & saved)} loaded, {len(own - saved)} missing, {len(saved - own)} unused", flush=True)
    results = []
    with torch.inference_mode():
        for path in paths:
            audio = load(path)
            probs = []
            for part in windows(audio):
                x = torch.from_numpy(part)[None]
                logits = model(x, length=torch.tensor([len(part)]))
                probs.append(F.softmax(logits, dim=1)[0].numpy())
            p = np.mean(probs, axis=0)
            row = {
                "file": str(path),
                "seconds": round(len(audio) / RATE, 2),
                **{label: round(float(v), 4) for label, v in zip(LABELS, p)},
            }
            results.append(row)
            print(f"{Path(path).name:28s} {row['seconds']:5.1f}s  France {row['France']:.3f}  Canada {row['Canada']:.3f}  Africa {row['Africa']:.3f}  CH/BE {row['Swiss/Belgium/German']:.3f}", flush=True)
    Path(out).write_text(json.dumps({"model": repo, "labels": LABELS, "results": results}, indent=2) + "\n")


if __name__ == "__main__":
    main()
