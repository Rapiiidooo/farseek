# Settings controls

```bash
PORT=3005 node scripts/serve.mjs   # this worktree: fbbd574 (main) for the before runs, 50c2095 for the after runs
R=receipts/verification-settings-controls/scripts
node $R/all-shots.mjs <outDir> <before|after> [url]   # settings-shots.mjs in en, fr, es, zh and hi, at 1280 by 720 and on a 390 by 844 phone
node $R/settings-shots.mjs <outDir> <lang> <desktop|phone> <before|after> [url]
node $R/settings-paths.mjs <outDir> [url]
node scripts/menu-check.mjs <dir> '--url=http://localhost:3005/?nolock=1'
node scripts/touch-check.mjs <dir> '--url=http://localhost:3005/'
node ../404-game-recipe/harness/ship.mjs game   # npm run check, from the main checkout
node scripts/i18n-check.mjs; node scripts/boot-preload.mjs --check
node scripts/architecture-check.mjs; node scripts/save-check.mjs
npm run format:check -- <changed files>
```

The owner found the dropdowns in Settings ugly. Commit `50c2095` draws the six selects as option cyclers and the sliders and boxes in the menus' look; `1f3ec59` documents the module, the language's reload timing and two traps.

## What changed

- **Cyclers:** Aim, Language, Image quality, Subtitle size, Subtitle backing and Difficulty show their option in the display font between two chevrons in medallions, which light with the row's focus and brighten under the pointer; a pip per option under the value marks where the cycle stands. The left arrow steps back, the right arrow or the value steps forward, and left, right, the d-pad and Enter still step the focused row through `Menu.adjust`.
- **Value store:** `setting-controls.js` builds each cycler from its select at `bind` and keeps the select inside it, rendered out of sight and still the row's labelled control, so `settingChanged`, the save and screen readers use it as before. The arrows and the value are `aria-hidden`, outside the tab order and without `data-action`; a click sets `selectedIndex` and dispatches `change`, and `settingChanged` shows every change, from a click, a key, the pad or the select itself.
- **Width:** all option names share one cell, so the widest sets the width and the arrows stay put. Wider than 600 px every cycler takes 7.25rem, which holds every option in the five languages, so the arrows form one column; on a phone the cycler keeps its natural width with a tighter gap and a 1rem value.
- **Sliders and boxes:** a range is a groove filled with the builders' light up to a medallion thumb that lights with the focus (the field of view still shows its degrees in its name); a box is a switch whose medallion slides right and lights when on.
- **Touch:** each arrow answers across at least 44 px, reaching outward so a tap on the value never steps back, the value across 44 px of height and a range across its row; rows stay 48 px.
- **Language:** a cycler steps one language at a time, so reloading at each step would take five reloads, each back on the title, to reach Hindi from Automatic. The reload now comes 1.2 s after the last step while a groove fills in the pips' place, and stepping back to the language loaded cancels it. Keys, pad and the select follow the same rule.

## Results

[`settings-paths.mjs`](scripts/settings-paths.mjs) passes [21 of 21](logs/paths.log) ([data](data/paths.json)) in Chrome. Chrome's accessibility tree still holds six comboboxes named by their rows, with their values, and no unnamed button; every cycler opens on its saved option. Arrows step Image quality through its three options and back, saving each, with the arrows in the same place for every option; the value steps Subtitle size and applies it. Right and left on Difficulty, Enter on Aim and a stubbed gamepad's d-pad on Subtitle backing step and save. A drag on Master volume and right on Field of view move, save and fill their grooves (62°); a click on a switch, then on its row's name, turns Invert vertical look on and off. Two quick steps on Language reload once into French, 1.3 s after the last; a step away and back keeps the French page, and left on the row reloads into English. On a phone the rows measure 48 px, 72 hit probes land on their arrow or value, and taps step Difficulty.

[`settings-shots.mjs`](scripts/settings-shots.mjs) finds no wrapped, cut or overflowing line, before or after, in the five languages at 1280 by 720 and on the phone ([data](data/), [after run](logs/shots-after.log)). On the phone `fitLines` already set two long range names smaller in French and Spanish; the cyclers add French Subtitle size (94%) and Spanish Image quality and Subtitle size (90% and 93%), while English, Chinese and Hindi keep every name at full size ([French before](data/lines-fr-phone-before.json), [after](data/lines-fr-phone-after.json)).

Frames, with a select row focused: [English desktop before](frames/settings-aim-en-desktop-before.jpg) and [after](frames/settings-aim-en-desktop-after.jpg), [French phone before](frames/settings-language-fr-phone-before.jpg) and [after](frames/settings-language-fr-phone-after.jpg), [Spanish phone foot before](frames/settings-difficulty-es-phone-before.jpg) and [after](frames/settings-difficulty-es-phone-after.jpg), [French desktop foot](frames/settings-difficulty-fr-desktop-after.jpg), [Hindi phone](frames/settings-aim-hi-phone-after.jpg) and [Chinese desktop](frames/settings-language-zh-desktop-after.jpg). Close-ups at twice the scale: [focused Aim](frames/row-aim-focused.jpg), [arrow under the pointer](frames/row-quality-hover.jpg), [language settling](frames/row-language-settling.jpg), [focused range](frames/row-fov-focused.jpg), [dragged range](frames/row-volume-dragged.jpg) and [switch on](frames/row-switch-on.jpg).

The [ship check](logs/ship.log) (333 modules, 2 pages), [translations](logs/i18n.log) (1,066 keys, no new string), [preload list](logs/preload.log) (160 title modules, `setting-controls.js` added), [architecture](logs/architecture.log) (9 checks), [save check](logs/save.log), [menu check](logs/menu.log) (25 of 25), [touch check](logs/touch.log) (59 of 59) and the [formatter](logs/format.log) pass.

Merged on `main` after the relic showcase, the foot of Settings and Controls keeps one row: its buttons may shrink, `fitLines` sets a long label smaller, and the Spanish reset reads "Borrar el progreso". The Spanish phone's foot no longer wraps or covers Difficulty ([frame](frames/settings-difficulty-es-phone-merged.jpg)), and the five languages on both viewports still show no wrapped, cut or overflowing line ([Spanish](data/lines-es-phone-merged.json), [French](data/lines-fr-phone-merged.json) phones).

## Open

- Not checked: physical phones and Safari, Firefox (the ranges carry `-moz` rules unseen here), a physical gamepad (a stubbed pad drove the game's own polling), a real screen reader (Chrome's accessibility tree was read), and high contrast, which leaves these controls unchanged.
