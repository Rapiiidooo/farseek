# Level select

```bash
PORT=3006 node scripts/serve.mjs   # serves this worktree; 3002 stays the main checkout's server
node scripts/level-shots.mjs outputs/level-shots/round1 --url=http://localhost:3006/            # every candidate view
node scripts/level-shots.mjs outputs/level-shots/chosen --url=http://localhost:3006/ --encode   # the chosen views to game/ui/levels/
R=receipts/verification-level-select/scripts
node $R/contact-sheet.mjs receipts/verification-level-select/candidates receipts/verification-level-select/frames/candidates.jpg
node $R/level-screens.mjs outputs/screens --url=http://localhost:3006/ --saves=all,partial
node $R/level-screens.mjs outputs/screens-first --url=http://localhost:3006/ --saves=first --langs=en,fr
node $R/turn-probe.mjs outputs/turn.json http://localhost:3006/
node $R/picture-requests.mjs outputs/pictures-all.json http://localhost:3006/ all   # and `first`
node scripts/menu-check.mjs outputs/menu '--url=http://localhost:3006/?nolock=1'
node scripts/touch-check.mjs outputs/touch --url=http://localhost:3006/
node ../404-game-recipe/harness/ship.mjs game   # from a worktree: the recipe's absolute path
node scripts/i18n-check.mjs; node scripts/architecture-check.mjs outputs/architecture; node scripts/boot-preload.mjs --check
FARSEEK_RECIPE_DIR=<recipe> node scripts/build-release.mjs 0c6f0d3 outputs/release-check
```

The owner found the levels screen not "gaming friendly" after asking for the relics screen to become a carousel. Commits `a9e982b`, `50e2c0e`, `9129b1f` and `0c6f0d3` turn it into a level select: one world at a time, its picture centre stage, the neighbours smaller and dimmed at the sides, turned with left and right. The checks below served the game folder of `0c6f0d3`; the pictures were captured from the worlds of `fbbd574`, which these commits leave unchanged.

## Screen

The selected world fills the stage as a card: a frame of the game itself, the "Level n" kicker in the world's colour, its title, its line and its starts as buttons carrying the builders' peak glyph, lit by the focus. Its neighbours peek in at a fifth smaller under a dark veil and slide when it turns; a click on one turns to it. Arrow medallions at the card's sides light with the builders' turquoise under the pointer, under keyboard focus and for a moment at each turn, with the movement key that turns that way beneath them (hidden on touch). Diamond pips, one per card in its world's colour, mark the place. Worlds not reached stay behind one sealed door, a plain carved ring with three dormant lenses round a dashed medallion holding the unknown glyph, the same whichever world it hides, so the screen never tells how many remain. The final world says "Completed." once the campaign is finished, as before.

The screen opens on the world of `progress.last`, or the first one. Up and down move between the starts and Back, Enter starts, left and right turn (arrow keys, the bound movement keys, the gamepad's d-pad and stick, through `menu.onTurn`), Escape goes back. A turn plays the menu's `ui` sound; under Reduce motion or the system's reduced motion the cards jump instead of sliding. The first start of the new world takes the focus after a turn, unless the player had taken it to Back. On a phone a swipe drags the row and turns it past 48 px, and the click that ends a swipe never presses what lies under the finger. Cards are 16:9 with the text over the foot of the picture on a desktop, stack the text under the picture on a tall screen and set it beside the picture on a short screen on its side.

`game/carousel.js` holds the stage, the arrows, the pips, the swipe and the rule that only the middle card's buttons take the menu's focus; `game/level-select.js` builds the world cards on it, and `app/ui.js` wires `menu.onTurn` through a `turners` table that a relics carousel can join. The pictures are requested when the screen first opens and kept for the session: [none on the title, 7 on opening a finished save (252,784 bytes), none on a second opening](data/pictures-all.json), [one for a save at the first world](data/pictures-first.json). The title's preload list gains the two modules and no picture.

## Pictures

[`scripts/level-shots.mjs`](../../scripts/level-shots.mjs) starts each world by address with the camera held (`?cam=`, moved between views through `?debug=1`'s parameters), hides every layer over the canvas, waits for every world to settle and captures 1920 by 1080 frames; `--encode` scales the chosen frame to 960 by 540 with `cwebp -m 6 -sharp_yuv`, at quality 70 or lower until it weighs under 60,000 bytes. Three rounds tried 38 viewpoints, seeded from the nightly fixed views and the teaser's shots ([sheet](frames/candidates.jpg), [every candidate](candidates/)).

| World      | Chosen view  | Lens → target                   | Field of view | Picture             |
| ---------- | ------------ | ------------------------------- | ------------- | ------------------- |
| Court      | `floor`      | 21, 2.4, 30 → 14.5, 5.2, 9      | 48°           | 57,560 bytes at q65 |
| Checkpoint | `corner`     | 7, 6.5, -6 → -2, 2.4, -33       | 46°           | 25,188 bytes at q70 |
| Isles      | `wide`       | -4.5, 5.3, 4.2 → 6, 0.2, -50    | 42°           | 21,068 bytes at q70 |
| Frost      | `lake`       | 4, 6, -92 → 0, 1.5, -150        | 46°           | 27,220 bytes at q70 |
| Wildwood   | `avenue`     | 0.8, 2.6, -6.5 → -0.5, 4.5, -48 | 44°           | 54,632 bytes at q65 |
| Archive    | `archive`    | 8, 37, -12 → -2, 29, -50        | 46°           | 23,000 bytes at q70 |
| Vault      | `medallions` | 0, 2.4, -36 → 0, 3.8, -67       | 46°           | 44,116 bytes at q70 |

Each choice keeps its subject in the upper middle, clear of the text at the card's foot and of a phone's centre crop: the gate between its two colossi from the court floor (the terrace views add cliff and camp clutter), the ringed planet over the Wardens' plaza and its beam, the isles and their rings over the gold cloud (the rim view is mostly sun), the frozen lake's floes leading to the island's ring under the peaks with a snow pine for depth (the canyon view sits inside the arrival ring), the trail under the canopy with its shafts and the stag, the causeway's beacons before the shield and the drowned city (the city views are mostly kelp), the sealed door's six medallions between the nave's pillars and two bays. The explorer is hidden in every view. Creatures move, so a recapture differs in where the stag or the Wardens stand. [Capture record](data/pictures-chosen.json), [log](logs/pictures-chosen.log).

## Checks

- [`level-screens.mjs`](scripts/level-screens.mjs) turns through every card in English, French, Spanish, Chinese and Hindi at 1280 by 720, 1920 by 1080, a 390 by 844 phone and the same phone on its side, with a finished save, a save at the drowned archive (the vault sealed) and a save at the first world: 48 runs and 296 cards in which no heading, label or button wraps or is cut, no card's text runs past it, nothing lies off screen and the page never scrolls ([log](logs/screens.log), [first saves](logs/screens-first.log), [data](data/level-screens.json), [first saves' data](data/level-screens-first.json)). `fitLines` sets four lines smaller, the smallest to 81% of its size: the Spanish vault title on a phone (19.4 px for 24 px) and on its side, and two French starts on its side.
- [`turn-probe.mjs`](scripts/turn-probe.mjs) passes 8 of 8: one `ui` sound per turn, the medallion lit for a moment and under the pointer, the cards sliding, a stand-in gamepad's d-pad and stick turning through the menu's polling, no slide under either reduced motion, and the card's text above its picture while the picture fades in ([results](data/turn.json), [log](logs/turn.log), [hover](frames/hover-desktop-en.jpg)).
- The [menu check](logs/menu.log) passes 33 of 33 ([results](data/menu-results.json)), eleven of them on this screen: the reached worlds and one sealed door, opening on the last world with its start in focus, arrow keys and A/D turning one world's starts at a time, the first world's shut arrow, Back keeping its focus, the arrow medallions, the sealed door last with no start, a world further along started from its card, and from the pause menu the world in play and its second start.
- The [touch check](logs/touch.log) passes 66 of 66, seven of them on this screen: a first save's world and sealed door, a swipe each way, a tap on each arrow, the screen fitting in portrait and on its side, and a tap on a later world's start playing it.
- The ship check (334 modules, 2 pages), translations (1,068 keys in four tables, two new for the arrows' labels), the 9 architecture checks, the title's 161 preloaded modules and the formatter pass. A release built from `0c6f0d3` holds 643 files, the 7 pictures and 2 modules among them ([record](data/release-check.json)).

While verifying, the screens caught three faults now fixed: a fresh save opened on the sealed door (its card has no world, which matched a missing last world), lines fitted before the display face's heavy weight had loaded were cut once it arrived (`fitLines` now runs again on `document.fonts` `loadingdone`, for every menu), and a picture fading in painted over its card's text.

## Frames

Desktop: [court, English](frames/court-desktop-en.jpg), [vault, French](frames/vault-desktop-fr.jpg), [frost, Spanish](frames/frost-desktop-es.jpg), [vault, Chinese](frames/vault-desktop-zh.jpg), [court, Hindi](frames/court-desktop-hi.jpg), [1920 by 1080](frames/court-wide-en.jpg), [from the pause menu](frames/pause-desktop-en.jpg), [sealed door](frames/sealed-desktop-en.jpg). Phone: [court, English](frames/court-phone-en.jpg), [frost, French](frames/frost-phone-fr.jpg), [vault, Spanish](frames/vault-phone-es.jpg), [sealed door, Chinese](frames/sealed-phone-zh.jpg), [vault, Hindi](frames/vault-phone-hi.jpg), [on its side, French](frames/vault-landscape-fr.jpg), [on its side, sealed door](frames/sealed-landscape-en.jpg).

## Not checked

The owner's eyes and hands, physical phones and Safari, a real gamepad (a stand-in object answered `navigator.getGamepads`), the nightly views and the public site. Frames were taken on localhost, where the screen also shows the local test session's line under its title.
