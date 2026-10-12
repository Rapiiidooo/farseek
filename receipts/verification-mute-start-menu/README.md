# Mute, start and menu

```bash
npm start    # http://localhost:3002/, this checkout; the "before" runs served a worktree of a1516ab on PORT=3003
R=receipts/verification-mute-start-menu/scripts
node $R/sound-probe.mjs <new|continue:sea> <out.json> [url] [titleWait] [playWait]
node $R/mute-probe.mjs <outDir> [url]
node $R/start-probe.mjs <new|continue:sea|continue:vault> <out.json> [url] [titleWait] [playSeconds]
node $R/title-timeline.mjs <url> 300
node $R/title-requests.mjs <url>
node $R/menu-shots.mjs <outDir> <en|fr|es|zh|hi> <desktop|phone> [url]
node $R/network-probe.mjs https://farseek.rapidoai.dev/?nolock=1 <out.json>
node outputs/start-window-latency.mjs <url> <out.json> 300 1000000   # copy of ../verification-five-language-release/live/
node scripts/menu-check.mjs <dir>; node scripts/touch-check.mjs <dir>; node scripts/playthrough.mjs <dir>
node scripts/vault-check.mjs <dir> --url="http://localhost:3002/?nolock=1&chapter=vault"   # sea-check, forest-check likewise
node scripts/architecture-check.mjs; node scripts/boot-preload.mjs --check; node scripts/i18n-check.mjs
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node ../404-game-recipe/harness/live.mjs http://localhost:3002/ [--desktop]
```

The owner asked why the game had no quick mute, why it loaded slowly and why gong sounds repeated at the start, then for the menus to stop wrapping and look less generic. Commits `908fda3`, `87e0d8e`, `c4f8c1c` and `5fe8007` answer them.

## Bells

The gongs were the doors' medallion bells. A world built with an open arrival door, reset or solved for a later start opened it through `Gate.forceOpen`, whose `ignite` rang each medallion. On the title the audio context is suspended, so those bells waited and all played at the first click; each world prepared after the click rang its own group. `forceOpen` now lights medallions silently, which two skipped scenes already obtained by detaching the door's sound around it; the frost ring's reset and the isles' solve light theirs the same way. Bells counted by [`sound-probe.mjs`](scripts/sound-probe.mjs), [before](data/bells-new-early-before.json) and [after](data/bells-new-early-after.json):

| Start                     | Before | After |
| ------------------------- | ------ | ----- |
| New game 1 s after ready  | 17     | 0     |
| New game 15 s after ready | 19     | 0     |
| Continue at the sea       | 32     | 0     |

Bells still ring when a door opens in play: its channels, its arming sequence, Mira's journal and the guardian's defeat call `ignite` as before.

## Mute

M (the key printed M, or M's place on a layout without Latin letters), a speaker in the menu's top right corner on the title and pause screens, and a box at the top of Settings, Audio, toggle `settings.muted`. It zeroes the master and mix buses, so Mira's voice goes silent too, and survives a reload; a muted start sets the buses before the first resume, so no click leaks through. A key bound to an action, a key being bound, a focused select and a held key leave it alone. [`mute-probe.mjs`](scripts/mute-probe.mjs) passes its [14 checks](data/mute.json), including AZERTY's comma and M keys. On a phone the speaker shares the touch pause button's corner: the tap that paused the game first muted it too, so a click now counts only when its press began on the speaker. The [touch check](logs/touch.log) passes 59 of 59 with three new checks on that corner, and the [menu check](logs/menu.log) 25 of 25 with four on the mute.

## Start

A start from the menus now waits only for the world and its neighbours, requested together so no queued world slips in between (`WorldManager.prepare`); the other worlds prepare behind play after a 2.5 s hold. Starts by address still prepare everything first, which the nightly views and route checks rely on. Served locally with [`start-probe.mjs`](scripts/start-probe.mjs), after a 1 s wait on the title:

| Start               | Play after the click, before | After  | All worlds ready after play began |
| ------------------- | ---------------------------- | ------ | --------------------------------- |
| New game            | 4.65 s                       | 0.95 s | 22 s                              |
| Continue at the sea | 6.55 s                       | 3.40 s | 7 s                               |
| Continue at vault   | 4.80 s                       | 3.45 s | 10.6 s                            |

During 40 s of play at most one frame exceeds 50 ms, at the very start: a title preparation step running at the click overruns the first frame once by about 85 ms, under the loading screen's fade ([long animation frame](data/start-new-after.json)).

The title also waited on serial downloads: [`title-timeline.mjs`](scripts/title-timeline.mjs) under 300 ms of emulated latency counts [31 waves](data/title-timeline-300ms-before.txt) of requests, among them the court's 21 assets fetched one after another. `index.html` now preloads the 159 modules the title imports (written and checked by `scripts/boot-preload.mjs`), and the court's build preloads its assets (`AssetStore.preload`), leaving [6 waves](data/title-timeline-300ms-after.txt). The title still downloads the same 199 requests and 4.82 MB. With 300 ms of latency at 1 MB/s, the title is ready after 15.5 s instead of 20.9 s and play begins 6.1 s after New game instead of 31.2 s ([before](data/latency-300ms-before.json), [after](data/latency-300ms-after.json)). Before these changes the public release reached the title after 4.0 s and play 9.0 s after New game, and every file it serves carries `Cache-Control: no-cache`, so a return visit revalidates all of them ([network](data/network-public-before.json)); that header is the server's and is unchanged.

## Menu

The title and pause lists give each entry a builders' glyph in a medallion, lit with the focus, and light runs along a groove under the entry in focus instead of a bar and a gradient. A detail follows its label on the same line (the level to continue, relics found as 3/13) instead of "Continue · title"; the pause screen names the level in its kicker and the world in its title. Headings, labels and buttons keep to one line and are set smaller when long (`fitLines`); level cards take two columns; the settings and controls screens no longer repeat their title as a kicker; the confirmation asks its question under a short title. [`menu-shots.mjs`](scripts/menu-shots.mjs) finds no wrapped, cut or sideways scrolling line on the title, settings, levels and pause screens in the five languages, at 1280 by 720 and on a 390 by 844 phone ([French before](data/menu-lines-before-fr-desktop.json), [after](data/menu-lines-after-fr-desktop.json)). Frames: [title before](frames/title-fr-before.jpg) and [after](frames/title-fr-after.jpg), [levels before](frames/levels-fr-before.jpg) and [after](frames/levels-fr-after.jpg), [pause](frames/pause-fr-after.jpg), [Spanish phone title](frames/title-es-phone-after.jpg) and [settings](frames/settings-es-phone-after.jpg).

## Checks

The ship check (332 modules, 2 pages), save check, 23 release tests, translations (1,066 keys in four tables), 9 architecture checks and the formatter pass. On the final tree the [menu](logs/menu.log), [touch](logs/touch.log) and [play-through](logs/playthrough.log) checks pass; the [vault](logs/vault.log) (30 of 30), [sea](logs/sea.log) (24 of 24) and [forest](logs/forest.log) checks passed before the menu commit, which changes no route. The recipe's live gates pass locally on [desktop](logs/live-desktop.log) and three times on [phone](logs/live-phone-1.log); a fourth phone run beside a running play-through held its keys during the opening scene ([log](logs/live-phone-beside-playthrough.log)). Before the start change the desktop gate failed locally.

## Not checked

The owner's ears and hands, physical phones and Safari, a gamepad on the new menu, the nightly views, and the public site, which these runs did not touch.
