# Language choice

```bash
npm start    # http://localhost:3002/, this checkout
node receipts/verification-language-choice/scripts/language-choice.mjs <outDir> [url]
```

The owner asked why the language could not be changed easily in Settings. The row was a cycler: one click stepped to the next language (Automatic, English, Français, Español, 中文, हिन्दी), and 1.2 s after the last step the page reloaded into whatever the row showed, back on the title ([before](frames/before-settling-cycler.jpg)). Reaching Spanish from French took two quick clicks; a pause between them reloaded into English and sent the player back to the title to start again.

## What changed

- The Language row now opens a screen of its own listing the six choices, each written in itself, the one in use marked by a lit medallion and in focus; Automatic names the browser's language beside it (`browserLanguage` in `i18n.js`).
- One click, tap or Enter on a language reloads the game in it at once. From the title the game comes back on Settings with the Language row in focus (`far-door-reopen` in session storage, read by `ui.reopenMenu`); during play the level starts again from its own start, as before. A choice that leaves the text unchanged (French while Automatic already shows French) saves it without a reload.
- The settling groove and its timer are gone from `setting-controls.js`, `ui.js` and the styles; the other five selects keep their cyclers. Rows that open a screen of their own end in a chevron.

## Results

[`language-choice.mjs`](scripts/language-choice.mjs) passes [8 of 8](data/language-choice.json) in a browser set to French: Automatic shows French, the row opens all six with Automatic marked, one click reloads into Spanish in about 0.1 s and comes back on Settings with Idioma in focus, the keys open the list on Español and choose Automatique back into French, choosing French while Automatic shows French does not reload, a phone taps its way into Hindi and back on Settings, and a change from the pause menu restarts the level in English with no menu reopened. No page error. Frames: [the list](frames/list-fr-desktop.jpg), [back on Settings in Spanish](frames/back-on-settings-es.jpg), [the phone's list](frames/list-fr-phone.jpg) and [Settings in Hindi](frames/back-on-settings-hi-phone.jpg).

## Not checked

The owner's hand, Safari and physical phones.
