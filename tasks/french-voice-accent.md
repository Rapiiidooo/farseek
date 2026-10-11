# French voice accent

The owner hears a Canadian French accent on several of Mira's French takes (`game/audio/voice/fr/`) and wants them redone with the accent of the others.

## Detection

`outputs/voice-l10n/dialect.py <small|large> <out.json> <audio...>` scores takes with the Voxlect French dialect classifier (arXiv 2508.01691: Africa, France, Canada, Swiss/Belgium/German). Results and a calibration on macOS voices that exist in both fr_FR and fr_CA are in `outputs/voice-l10n/accent/`; `outputs/voice-l10n/fr-accents.html` plays every take with its scores.

- Canada on both models (0.91 to 1.00): `castle-2`, `ice-1`, `reunion-2`, `vault-bay-court`, `vault-done-checkpoint`.
- One model only, or too short to judge: `vault-arrival`, `vault-power-frost`, `vault-reveal-next`, `vault-bank-forest`, `vault-done-forest`, `reunion-1`, `radio-1`. The owner heard all seven as Canadian, so these twelve are the lines to redo, and a take counts as France only when both models give Canada under 0.1 (the kept takes reach 0.06, apart from `vault-reveal-address` at 0.20 on the large model).
- Calibration: the small model put no fr_FR clip above 0.07 Canada but missed most fr_CA clips; the large model catches more fr_CA clips and also flags fr_FR clips.

Environment: a Python 3.12 venv with `torch`, `transformers==4.46.3`, `loralib`, `huggingface_hub<1.0` and `numpy<2.3`; `outputs/voice-l10n/voxlect-src` is the Voxlect repository with its two `.cuda()` calls sent to the model's device.

## Blocker

Atlas has refused `prompt_project_agent` with `ACCESS_EXPIRED: Workspace access has expired` (HTTP 402) since 10 October 19:46 UTC, last tried on 11 October 15:20 UTC; a refused call spends no credits, and `whoami` and asset listing still work. The key acts in the 404 Game Jam workspace, whose plan, subscription status and credits show only in Studio (`app.atlas.design`, Settings, Workspace, Plan & credits), not through MCP. The French project holds no other take of these lines.

## Next

1. When generation works, run `node outputs/voice-l10n/atlas/redo.mjs fr <round> 3 <label,...>`: three takes per line in a new frame, downloaded to `outputs/voice-l10n/atlas/fr/redo-<round>/`.
2. Score them with both models and `check.py`; per line keep the take with no Canada signal and the best France score, the current take included.
3. Move each replaced original to `fr/replaced/`, put the new one in `fr/originals/` and its fid in `downloads.json`, then run `process.py fr` (unchanged takes must keep their hashes), `notice.mjs`, `check.py fr medium` and `beats.mjs` for the affected scenes.
4. Copy the scripts and scores to `receipts/verification-languages/voices/` and update its README.
