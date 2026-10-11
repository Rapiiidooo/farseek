# French voice accent

The owner hears a Canadian French accent on several of Mira's French takes (`game/audio/voice/fr/`) and wants them redone with the accent of the others.

## Detection

`outputs/voice-l10n/dialect.py <small|large> <out.json> <audio...>` scores takes with the Voxlect French dialect classifier (arXiv 2508.01691: Africa, France, Canada, Swiss/Belgium/German). Results and a calibration on macOS voices that exist in both fr_FR and fr_CA are in `outputs/voice-l10n/accent/`; `outputs/voice-l10n/fr-accents.html` plays every take with its scores.

- Canada on both models (0.91 to 1.00): `castle-2`, `ice-1`, `reunion-2`, `vault-bay-court`, `vault-done-checkpoint`.
- One model only, or too short to judge: `vault-arrival`, `vault-power-frost`, `vault-reveal-next`, `vault-bank-forest`, `vault-done-forest`, `reunion-1`, `radio-1`. The owner heard all seven as Canadian, so these twelve are the lines to redo, and a take counts as France only when both models give Canada under 0.1 (the kept takes reach 0.06, apart from `vault-reveal-address` at 0.20 on the large model).
- Calibration: the small model put no fr_FR clip above 0.07 Canada but missed most fr_CA clips; the large model catches more fr_CA clips and also flags fr_FR clips.

Environment: a Python 3.12 venv with `torch`, `transformers==4.46.3`, `loralib`, `huggingface_hub<1.0` and `numpy<2.3`; `outputs/voice-l10n/voxlect-src` is the Voxlect repository with its two `.cuda()` calls sent to the model's device.

## Blocker

The Atlas workspace has no usable credits. Its plan is a Trial whose 600-credit allowance (249 unspent) expired on 30 September; Studio shows the plan and balance (`app.atlas.design`, the credits pill in the top bar, or Settings, Workspace, Plan & credits), MCP shows neither. The 10 October voices spent about 807 credits after that date, probably from non-expiring credits, until that evening. Since then `prompt_project_agent` refuses a 1500-credit budget with `ACCESS_EXPIRED: Workspace access has expired` (HTTP 402) and accepts a 100-credit budget but stops after 4 credits with `Agent credit budget exhausted` (`outputs/voice-l10n/atlas/fr/redo-scenes/report.json`, 11 October). `whoami` and asset listing still work, and the French project holds no other take of these lines.

## Next

1. Once the workspace has credits, run `node outputs/voice-l10n/atlas/redo.mjs fr <round> 3 <label,...> <budget>` in batches of five to seven lines: three takes per line in a new frame, downloaded to `outputs/voice-l10n/atlas/fr/redo-<round>/`. Atlas caches outputs by input, so the prompt asks for fresh syntheses and the script reports any take identical to an original.
2. Score the takes with `dialect.py` (both sizes) and `heard.py fr medium`, then `choose.mjs` keeps per line the take that both models hear as France with the script heard in French; the current takes of these lines are out, since the owner heard them as Canadian.
3. Move each replaced original to `fr/replaced/`, put the new one in `fr/originals/` and its fid in `downloads.json`, then run `process.py fr` (unchanged takes must keep their hashes), `notice.mjs`, `check.py fr medium` and `beats.mjs` for the affected scenes.
4. Copy the scripts and scores to `receipts/verification-languages/voices/` and update its README.
