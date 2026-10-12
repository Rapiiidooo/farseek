# Menus round, merged

```bash
npm start    # http://localhost:3002/, this checkout at ce8d6a4
U=http://localhost:3002/
node scripts/menu-check.mjs <dir> "--url=${U}?nolock=1"; node scripts/touch-check.mjs <dir> --url=$U
node receipts/verification-level-select/scripts/turn-probe.mjs <out.json> $U
node receipts/verification-settings-controls/scripts/settings-paths.mjs <dir> $U
node receipts/verification-relic-showcase/scripts/relic-stage-check.mjs <dir> $U
node scripts/playthrough.mjs <dir>; node scripts/relic-check.mjs <dir>
node scripts/forest-check.mjs <dir> "--url=${U}?nolock=1&chapter=forest"   # sea-check and vault-check likewise
npm run check; node scripts/i18n-check.mjs; node scripts/boot-preload.mjs --check; node scripts/architecture-check.mjs; node scripts/save-check.mjs
```

The owner asked, one after another, for soft music instead of the title's wind, for the relics and the levels as video game carousels, and for better looking dropdowns in Settings. The title music and the relic showcase were built on `main`; the level select and the settings controls were built in two isolated copies and applied on top, their conflicts being plain unions (the `fitLines` selectors, the screens that turn, two pairs of translation keys and an architecture paragraph). After the merge the foot of Settings and Controls keeps one row.

| Part              | Receipt                                                                       |
| ----------------- | ----------------------------------------------------------------------------- |
| Title music       | [verification-title-music](../verification-title-music/README.md)             |
| Relic showcase    | [verification-relic-showcase](../verification-relic-showcase/README.md)       |
| Level select      | [verification-level-select](../verification-level-select/README.md)           |
| Settings controls | [verification-settings-controls](../verification-settings-controls/README.md) |

## Results on the merged tree

- [Menu check](logs/menu.log) 33 of 33 and [touch check](logs/touch.log) 66 of 66, with the level select's new checks.
- [Level turn probe](logs/turn-probe.log) 8 of 8, [settings paths](logs/settings-paths.log) 21 of 21, [relic stage](logs/relic-stage.log) 19 of 19.
- [Play-through](logs/playthrough.log): levels 1 to 4 and the Wildwood with no error, 207 shader programs at the first start and 982 after preparation, as before. [Forest](logs/forest.log) with its castle, address and sea crossing, [sea](logs/sea.log) 24 of 24, [vault](logs/vault.log) 30 of 30, [relics in their worlds](logs/relic-check.log) 48 of 48.
- The ship check (337 modules, 2 pages), translations (1,073 keys in four tables), the boot preload list (162 title modules; the relic stage loads on demand), the architecture checks (9), the save check and the formatter pass.

## Not checked

The owner's hand test, physical phones and gamepads, Safari and Firefox, headphones, and the public site, which these runs did not touch.
