# Languages

```bash
node scripts/i18n-check.mjs                                   # keys, tables, placeholders, tags, hidden t()
node scripts/i18n-check.mjs --write=outputs/i18n/strings.json # the key list translators work from
node scripts/i18n-set.mjs fr '{"English key": "traduction"}'  # add or change entries
PORT=3012 npm start
node receipts/verification-languages/scripts/screens.mjs en,fr,es,zh,hi [--phone]
node receipts/verification-languages/scripts/touch-fit.mjs   # every touch label against its button
node scripts/playthrough.mjs <dir> "--url=http://localhost:3012/?nolock=1&lang=fr"
node scripts/nightly.mjs
```

Farseek now plays in English, French, Spanish, Simplified Chinese and Hindi. The game follows the browser's language, Settings offers the five languages and Automatic, and a `lang` query forces one; automated browsers keep English. The English text is the key of `t()` (`game/i18n.js`): 1,065 strings across 50 modules and the page are marked, and each language table (`game/i18n/<id>.js`, loaded only for that language) covers all of them with the same placeholders and tags. Chinese and Hindi use the system's faces for their scripts, Hindi without letter spacing, which would break its joined headline. Mira speaks each language in her own recorded takes (see Voices below). The translators' [glossaries](glossaries/) fix each language's names and terms.

## Results

- [Translation check](check.txt): 1,065 keys, and for French, Spanish, Chinese and Hindi 0 missing, 0 stale and 0 mismatched entries, with no translation call hidden by a local `t`.
- English is unchanged: the [full nightly review](nightly.json) passes 15 of 15 steps on the marked tree (every route, the ten crossings, fixed views, menus, touch, relics and starts).
- The [French play-through](playthrough-fr.log) completes levels 1 to 4 and enters the Wildwood with no error and 982 shader programs throughout, so no logic depends on English text along that route.
- Twelve screens were captured per language at 1280x720, and on a 412x915 phone for the four new languages. Those reviewed (title, settings, controls, levels, loading, notes, hints and play) show no clipped text or missing glyph: [English hint](frames/en-hint.jpg), French [hint](frames/fr-hint.jpg), [loading](frames/fr-loading.jpg) and [notes](frames/fr-notes.jpg), Spanish [title](frames/es-title.jpg) and [levels](frames/es-levels.jpg), Chinese [title](frames/zh-title.jpg), [notes](frames/zh-notes.jpg) and [controls](frames/zh-controls.jpg), Hindi [title](frames/hi-title.jpg), [hint](frames/hi-hint.jpg) and [levels](frames/hi-levels.jpg).
- [Touch labels](touch-fit.txt): every label of every touch button fits in all five languages after French Roll became "Rouler" ([French](frames/fr-touch.jpg), [Chinese](frames/zh-touch.jpg), [Hindi](frames/hi-touch.jpg)).

## Voices

The copies in `voices/scripts/` ran from `outputs/voice-l10n/`, the Atlas ones from its `atlas/` folder; put them back there to run them again.

```bash
node outputs/voice-l10n/scripts.mjs                     # each language's lines, notes and room in its scene
node outputs/voice-l10n/atlas/generate.mjs fr           # then continue.mjs fr <scenes|vault> for a set left unfinished
node outputs/voice-l10n/atlas/download.mjs fr
python3 -I outputs/voice-l10n/atlas/process.py fr
<faster-whisper venv>/bin/python -I outputs/voice-l10n/check.py fr [medium]
node outputs/voice-l10n/beats.mjs <dir> --url=http://localhost:3012/ --lang=fr --only=radio,camp,ice,castle [--extra=14]
node scripts/vault-check.mjs <dir> "--url=http://localhost:3012/?nolock=1&chapter=vault&lang=fr"
<voxlect venv>/bin/python -I outputs/voice-l10n/dialect.py <small|large> <out.json> <audio...>
<chatterbox venv>/bin/python -I outputs/voice-l10n/clone/clone.py fr outputs/voice-l10n/clone/fr <takes|first-last> <label,...>
<faster-whisper venv>/bin/python -I outputs/voice-l10n/heard.py fr medium <out.json> <audio...>
node outputs/voice-l10n/choose.mjs fr <choices.json> <small.json> <large.json> <heard.json> reunion-1
node outputs/voice-l10n/clone/install.mjs fr <choices.json> <weights revision>   # then process.py fr and notice.mjs
```

Mira's 37 lines exist in each language, 148 takes in all (6.5 MB, loaded only in their language), generated through Atlas with the voice, model and settings of her English takes from the game's translated subtitles, and processed like them (-18 LUFS, 64 kbps mono). `game/voice.js` plays `audio/voice/<id>/` and falls back on the English take; translated takes run longer, so a scene slows its clock while a line overruns its room (`paceFor`), and English keeps its exact timing. About 807 Atlas credits were spent; `game/audio/NOTICE.txt` lists every take's file id and line.

The owner heard a Canadian accent on several French takes. The Voxlect French dialect classifier ([arXiv 2508.01691](https://arxiv.org/abs/2508.01691)), in its Whisper small and large versions, gave five takes a Canada score of 0.91 to 1.00 on both and seven more on one or too short to judge ([small](fr/accent/dialect-small-fr.json), [large](fr/accent/dialect-large-fr.json)); macOS voices that exist in fr_FR and fr_CA calibrate them ([small](fr/accent/calib-small.json), [large](fr/accent/calib-large.json)), and the owner confirmed all twelve by ear. Atlas could not redo them, since the workspace's credits are spent ([refused attempts](fr/atlas-redo/)). Chatterbox Multilingual (MIT) cloned the voice locally from four France-accented takes, `radio-2` and `ice-2` for recorded lines and `reunion-3b` and `reunion-3a` for live ones, in four to twelve takes per line ([takes](fr/clone/manifest.json)). The take kept for each line is one both models hear as France (Canada under 0.1) with the script heard, preferring an exact transcript and a take within the line's room ([scores](fr/clone/scores/choices.json), [kept](fr/clone/chosen.json)); `Nyra.` alone skips the transcript, which cannot spell the name. The owner approved the twelve by ear. Only their files changed, the other 25 keep their bytes, and a lookahead limiter brings the peakier clones to the shared loudness (-18.1 to -18.8 LUFS, [processing](fr/processed.json)).

- Speech recognition matches every [French](fr/check-fr.json) and [Spanish](es/check-es.json) take to its script (0.92 to 1.00) apart from numbers written as digits and the name Nyra. [Hindi](hi/check-hi.json) matches with the recognizer's spelling variants. [Chinese](zh/check-zh.json) matches on 33 of 37 lines with the medium model; `camp-1` (第十五天 heard 底纸五天) and `vault-done-frost` (四枚 heard 自买) probably mispronounce, since these takes use her English voice. A native Mandarin voice was prepared (`scripts/native.mjs`) but Atlas refused new generation once the workspace's credits were spent (ACCESS_EXPIRED, HTTP 402).
- In play, in [French](play/scenes-fr.log), [Spanish](play/scenes-es.log), [Chinese](play/scenes-zh.log) and [Hindi](play/scenes-hi.log), the radio, camp, ice and castle scenes play every line from its own take with no two lines at once; the Chinese and Hindi radio scenes outlast the English watch and pass with a longer one ([Chinese](play/radio-zh-longer-watch.json), [Hindi](play/radio-hi-longer-watch.json)). The vault route plays its 20 lines from their takes with no error in every language ([French](play/vault-fr.txt), [Spanish](play/vault-es.txt), [Chinese](play/vault-zh.txt), [Hindi](play/vault-hi.txt)), and English is unchanged ([vault](play/vault-en.txt)). With the French clones, the four scenes and the vault route pass again, and the reunion plays `reunion-1` and `reunion-2` from their clips ([log](play/reunion-fr.log)); that scene's check still expects the credits after the reunion, which now come after the vault.
- Scenes slow to at most 0.77 of their speed in French, 0.73 in Spanish, 0.69 in Hindi and 0.63 in Chinese while a long line plays; the checkpoint radio scene lasts 23 s in French, 25 s in Spanish, 26 s in Hindi and 29 s in Chinese against 22.6 s in English.

## Not checked

The owner, a French speaker, listened to the French takes; no native speaker has read the other translations or listened to their takes, which were written and generated by models and reviewed by sampling and by speech recognition. Whether the catalog voice's terms cover a clone made outside ElevenLabs was not reviewed; the owner chose to ship the twelve clones. Physical phones, Safari and Windows fonts for Chinese and Hindi are untested. Some English lines still read "1 seconds" at the last second, and Arabic, the fifth most spoken language, would need a right-to-left layout.
