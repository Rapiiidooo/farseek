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

Farseek now plays in English, French, Spanish, Simplified Chinese and Hindi. The game follows the browser's language, Settings offers the five languages and Automatic, and a `lang` query forces one; automated browsers keep English. The English text is the key of `t()` (`game/i18n.js`): 1,065 strings across 50 modules and the page are marked, and each language table (`game/i18n/<id>.js`, loaded only for that language) covers all of them with the same placeholders and tags. Chinese and Hindi use the system's faces for their scripts, Hindi without letter spacing, which would break its joined headline. Mira's recorded voice stays English under translated subtitles. The translators' [glossaries](glossaries/) fix each language's names and terms.

## Results

- [Translation check](check.txt): 1,065 keys, and for French, Spanish, Chinese and Hindi 0 missing, 0 stale and 0 mismatched entries, with no translation call hidden by a local `t`.
- English is unchanged: the [full nightly review](nightly.json) passes 15 of 15 steps on the marked tree (every route, the ten crossings, fixed views, menus, touch, relics and starts).
- The [French play-through](playthrough-fr.log) completes levels 1 to 4 and enters the Wildwood with no error and 982 shader programs throughout, so no logic depends on English text along that route.
- Twelve screens were captured per language at 1280x720, and on a 412x915 phone for the four new languages. Those reviewed (title, settings, controls, levels, loading, notes, hints and play) show no clipped text or missing glyph: [English hint](frames/en-hint.jpg), French [hint](frames/fr-hint.jpg), [loading](frames/fr-loading.jpg) and [notes](frames/fr-notes.jpg), Spanish [title](frames/es-title.jpg) and [levels](frames/es-levels.jpg), Chinese [title](frames/zh-title.jpg), [notes](frames/zh-notes.jpg) and [controls](frames/zh-controls.jpg), Hindi [title](frames/hi-title.jpg), [hint](frames/hi-hint.jpg) and [levels](frames/hi-levels.jpg).
- [Touch labels](touch-fit.txt): every label of every touch button fits in all five languages after French Roll became "Rouler" ([French](frames/fr-touch.jpg), [Chinese](frames/zh-touch.jpg), [Hindi](frames/hi-touch.jpg)).

## Not checked

No native speaker has read the translations; they were written by language models and reviewed by sampling. Physical phones, Safari and Windows fonts for Chinese and Hindi are untested. Some English lines still read "1 seconds" at the last second, and Arabic, the fifth most spoken language, would need a right-to-left layout.
