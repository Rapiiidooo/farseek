# Relic showcase

```bash
npm start    # http://localhost:3002/, this checkout
R=receipts/verification-relic-showcase/scripts
node $R/relic-stage-check.mjs <outDir> [url]
node $R/relic-pause.mjs <outDir> [url]
node $R/relic-shots.mjs <outDir> [url] <en|fr|es|zh|hi> <desktop|phone>
node scripts/relic-check.mjs <outDir>
```

The owner asked for the relics to be shown like a video game carousel: the item in 3D in the middle of the screen, turned to the next one, clicked for its account. The Relics screen was a grid of text cards over the court ([before](frames/before-public.jpg)).

## What changed

- `game/relic-showcase.js` draws a stage in place of the world while the Relics screens are open (`ui.renderStage`, called by the loop before `worlds.render`): a dark warm room, a pool of light ringed with the builders' cyan, and every relic floating on a gentle arc. The chosen one turns slowly at the front, its neighbours wait dimmer at the sides, and relics not found yet stand as dark shapes. The room has its own lights and a small reflection environment, and it restores the renderer's target, clipping planes and exposure after each draw. It loads on first opening (a dynamic import, so the title's modules are unchanged) and builds in about 0.14 s here.
- Relics with a model show it as their world does (aged paper tinted, the lantern's flame lit). Relics that are records get a figure from `game/relic-figures.js`: a page in Mira's hand around the sketch it describes (the transit file stamped VOID with her ring and three routes, the wandering isle between two amber stations, the cairn trail across the floes, the three cyan valves over the tide, the three practice plates), and the builders' stone with its sun and road lit in their light.
- `game/app/ui.js` turns the screen: left and right (arrow keys, the bound movement keys, a gamepad, through `menu.onTurn`), the arrow medallions, a pip, or a drag or swipe across the stage, which follows the finger and settles on the nearest relic. A click or tap on the chosen relic, or Inspect, opens its account beside it; there a drag or left and right turn it over. The caption names the relic, its world and its line, or "Not found yet" and the hint for one still hidden, and Inspect is off for those. The HUD and the local test links stay hidden over the stage, and Back in a long account stays at its foot.
- `scripts/relic-check.mjs` reads the pips instead of the cards, and the title's count from its label and detail.

## Results

- [Interaction check](data/relic-stage.json) ([`relic-stage-check.mjs`](scripts/relic-stage-check.mjs)): 19 of 19 on a 1280 by 720 desktop and a 390 by 844 phone, with keys, the bound D key, the arrows, a pip, a mouse drag, a click on the chosen and on a hidden relic, Enter on Inspect, Escape, a swipe, a tap and Back.
- [Pause path](data/pause.json): from the pause menu in play the stage replaces the world without the HUD, Back returns to the paused world with it, play resumes; the first build took 139 ms and a second opening 17 ms.
- The [relic check](data/relic-check.log) passes 48 of 48: every relic taken in its world with real keys, the screen listing found and hidden relics after a reload, and forgetting the progress.
- Frames in five languages, desktop and phone, with no cut heading or relic name ([shots](data/)): [English](frames/desktop-en-open.jpg), [the radio](frames/desktop-en-radio.jpg), [mid-drag](frames/desktop-dragged.jpg), [a hidden relic](frames/desktop-en-hidden.jpg), [inspecting](frames/desktop-en-inspect.jpg), [Spanish](frames/desktop-es-radio.jpg), [Hindi](frames/desktop-hi-stone.jpg), [French phone](frames/phone-fr-open.jpg) and [its account](frames/phone-fr-inspect.jpg), [Chinese phone account](frames/phone-zh-inspect.jpg), [from the pause menu](frames/pause-relics.jpg).
- The ship check (334 modules, 2 pages), the translation check (1,071 keys), the architecture checks and the boot preload check pass.

## Not checked

The owner's hands and eyes, physical phones, Safari, a real gamepad, and a slow GPU drawing the stage.
