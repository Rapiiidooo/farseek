# French voice accent

The owner hears a Canadian French accent on several of Mira's French takes (`game/audio/voice/fr/`) and wants them redone with the accent of the others.

## Detection

`outputs/voice-l10n/dialect.py <small|large> <out.json> <audio...>` scores takes with the Voxlect French dialect classifier (arXiv 2508.01691: Africa, France, Canada, Swiss/Belgium/German). Results and a calibration on macOS voices that exist in both fr_FR and fr_CA are in `outputs/voice-l10n/accent/`; `outputs/voice-l10n/fr-accents.html` plays every take with its scores.

- Canada on both models (0.91 to 1.00): `castle-2`, `ice-1`, `reunion-2`, `vault-bay-court`, `vault-done-checkpoint`.
- One model only, or too short to judge: `vault-arrival`, `vault-power-frost`, `vault-reveal-next`, `vault-bank-forest`, `vault-done-forest`, `reunion-1`, `radio-1`. The owner heard all seven as Canadian, so these twelve are the lines to redo, and a take counts as France only when both models give Canada under 0.1 (the kept takes reach 0.06, apart from `vault-reveal-address` at 0.20 on the large model).
- Calibration: the small model put no fr_FR clip above 0.07 Canada but missed most fr_CA clips; the large model catches more fr_CA clips and also flags fr_FR clips.

Environment: a Python 3.12 venv with `torch`, `transformers==4.46.3`, `loralib`, `huggingface_hub<1.0` and `numpy<2.3`; `outputs/voice-l10n/voxlect-src` is the Voxlect repository with its two `.cuda()` calls sent to the model's device.

## Atlas

The Atlas workspace has no usable credits. Its plan is a Trial whose 600-credit allowance (249 unspent) expired on 30 September; Studio shows the plan and balance (`app.atlas.design`, the credits pill in the top bar, or Settings, Workspace, Plan & credits), MCP shows neither. The 10 October voices spent about 807 credits after that date, probably from non-expiring credits, until that evening. Since then `prompt_project_agent` refuses a 1500-credit budget with `ACCESS_EXPIRED: Workspace access has expired` (HTTP 402) and accepts a 100-credit budget but stops after 4 credits with `Agent credit budget exhausted` (`outputs/voice-l10n/atlas/fr/redo-scenes/report.json`, 11 October). Once it has credits, `node outputs/voice-l10n/atlas/redo.mjs fr <round> 3 <label,...> <budget>` generates fresh takes in batches of five to seven lines; Atlas caches outputs by input, so the script reports any take identical to an original.

## Local clone

```bash
<chatterbox-venv>/bin/python -I outputs/voice-l10n/clone/clone.py fr outputs/voice-l10n/clone/fr <takes|first-last> <label,...>
<voxlect-venv>/bin/python -I outputs/voice-l10n/dialect.py <small|large> outputs/voice-l10n/clone/scores/dialect-<size>.json outputs/voice-l10n/clone/fr/*.wav
<whisper-venv>/bin/python -I outputs/voice-l10n/heard.py fr medium outputs/voice-l10n/clone/scores/heard.json outputs/voice-l10n/clone/fr/*.wav
node outputs/voice-l10n/choose.mjs fr outputs/voice-l10n/clone/scores/choices.json <small> <large> <heard> reunion-1
python3 -I outputs/voice-l10n/clone/preview.py outputs/voice-l10n/clone/preview outputs/voice-l10n/clone/fr/*.wav
node outputs/voice-l10n/clone/compare.mjs outputs/voice-l10n/clone/scores/choices.json outputs/voice-l10n/clone/preview outputs/voice-l10n/clone/compare.html
```

Chatterbox Multilingual (`chatterbox-tts==0.1.7`, MIT, Perth watermark in every output; Python 3.12 venv plus `setuptools<81` for Perth's `pkg_resources`) clones Mira from France-accented shipped takes: `refs/recorded.wav` (`radio-2`, `ice-2`) for recorded lines and `refs/live.wav` (`reunion-3b`, `reunion-3a`) for live ones. Every one of the twelve lines has a take that both models hear as France with the script heard (`reunion-1` is the name alone, which the recognizer cannot spell). `outputs/voice-l10n/clone/compare.html` plays each shipped take against the chosen clone and the other takes, loudness-matched like the game.

Open decisions for the owner: whether the clone's timbre matches Mira's other French lines by ear, and whether shipping a copy of the ElevenLabs catalog voice made outside ElevenLabs is acceptable under that voice's terms.

## Next

1. If the owner keeps the clones, convert each chosen take to mp3 in `outputs/voice-l10n/atlas/fr/originals/` (the replaced originals go to `fr/replaced/`), then run `process.py fr` (unchanged takes must keep their hashes), `check.py fr medium` and `beats.mjs` for the affected scenes.
2. Describe the cloned lines in Mira's section of `game/audio/NOTICE.txt` (`notice.mjs` only knows Atlas fids): model, licence, watermark, references and seeds from `outputs/voice-l10n/clone/fr/manifest.json`.
3. Copy the scripts and scores to `receipts/verification-languages/voices/` and update its README.
