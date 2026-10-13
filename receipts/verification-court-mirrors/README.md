# Court mirrors

```bash
PORT=3009 node scripts/serve.mjs   # this branch; "before" runs served git archive ef08595 (game, scripts) on PORT=3010
R=receipts/verification-court-mirrors
node $R/check.mjs http://localhost:3009 $R/check.json
node $R/measure.mjs before-1 http://localhost:3010 $R/measure/before-1.json   # after-1 on 3009; three runs each, interleaved
node $R/summarize.mjs
node $R/frames.mjs before http://localhost:3010; node $R/frames.mjs after http://localhost:3009; node $R/compare.mjs
node $R/software.mjs after http://localhost:3009   # before on 3010
node $R/capture-time.mjs http://localhost:3009
node scripts/playthrough.mjs <dir> "--url=http://localhost:3009/?nolock=1"   # and 3010
node scripts/architecture-check.mjs <dir>; node scripts/boot-preload.mjs --check; node ../404-game-recipe/harness/ship.mjs game
```

The owner noted that only one mirror at a time showed its reflection; the others read as flat gold discs. Commit `c60308a` gives every mirror of the Sunken Court a reflection. All results below come from that commit against its parent `ef08595`, in headless Chrome on Metal (Apple M5 Max) at 1280 by 720.

## What changed

- **A capture per mirror.** During the court's preparation (`precompile`), `CourtMirrors.capture` draws a half float cube from the centre of each of the four polished faces, 256 px a face on High and 128 px on Balanced, Fast and software renderers. The cascades are refitted to every cube face so its shadows are right (software renderers keep the current ones), and the mirror itself, Nyra and the portal membrane are left out. Each mirror reads its capture where the reflected ray meets the floor or an 8 m sphere, so the reflection shifts across the face like the live one.
- **Several live reflections.** The mirrors `rank` keeps (within 12 m, in view, facing and unobstructed, largest on screen first, as `select` ordered them) reflect live, each through a target of its own clipped by the oblique near plane: up to 4 on High, 2 on Balanced, 1 on Fast and on software renderers (`RENDER_BUDGETS`). A frame redraws the best mirror when the camera or the mirror moved or 100 ms passed, and one other in turn, the oldest first; the best's target is 512, 384 or 256 px, the others half that. A mirror blends between its capture and its live view over 0.25 s, so entering or leaving the budget never pops. Inside another reflection, a capture or a view through a door, mirrors show their captures only.
- **Cheaper live views.** Nyra's meshes are never frustum culled, so every reflection used to draw her about 300k triangles; she is now left out of live views she is not in. The mirrors no longer update the whole scene's matrices each frame.
- **One program, no compile in play.** The mirror materials keep a single key (`fd-court-mirror-2`). The captures draw with the composer's programs and build the pipelines of the half float targets before play. Without post (the phone rig tier) the court is compiled for the screen, so the preparation now also compiles its target variants.
- **Release.** Leaving the court frees the live targets; releasing its GPU resources frees the captures too (`releaseTargets`, called by `WorldGPUCache`), and the restore's preparation captures again.

## Frames

Before on the left, after on the right, half size; full frames are in [frames/before](frames/before) and [frames/after](frames/after), whose `frames.json` holds each mirror's blend weights.

| View                                  | High                                            | Balanced                                            | Fast                                            |
| ------------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Floor chapter start, 3 mirrors        | [sheet](frames/compare/floor-start-high.jpg)    | [sheet](frames/compare/floor-start-balanced.jpg)    | [sheet](frames/compare/floor-start-fast.jpg)    |
| East floor, puzzle solved, 3 mirrors  | [sheet](frames/compare/east-floor-high.jpg)     | [sheet](frames/compare/east-floor-balanced.jpg)     | [sheet](frames/compare/east-floor-fast.jpg)     |
| West, gate side, 2 mirrors in frame   | [sheet](frames/compare/west-gate-high.jpg)      | [sheet](frames/compare/west-gate-balanced.jpg)      | [sheet](frames/compare/west-gate-fast.jpg)      |
| Gate side from above, 3 mirrors       | [sheet](frames/compare/gate-high-high.jpg)      | [sheet](frames/compare/gate-high-balanced.jpg)      | [sheet](frames/compare/gate-high-fast.jpg)      |
| Overview, 3 mirrors beyond live reach | [sheet](frames/compare/overview-high.jpg)       | [sheet](frames/compare/overview-balanced.jpg)       | [sheet](frames/compare/overview-fast.jpg)       |
| West with Nyra, 2 mirrors in frame    | [sheet](frames/compare/west-gate-nyra-high.jpg) | [sheet](frames/compare/west-gate-nyra-balanced.jpg) | [sheet](frames/compare/west-gate-nyra-fast.jpg) |

Before, only the best mirror reflected and every other one was flat gold. After, the mirrors beyond reach or budget show their captures, and on High and Balanced the two nearest reflect live. In both west views the best ranked mirror, the catcher, sits just outside the frame, so before the mirror in front of the camera stayed gold; after, it is the second live one and shows Nyra's back.

## Frame cost

[`measure.mjs`](measure.mjs) flies the camera through eight keys over the court floor, warms one 600-frame lap and records two, per tier, three runs per build ([data](measure), [summary](summary.json)). It times the court's render on the main thread and, with `EXT_disjoint_timer_query_webgl2`, the GPU time of the mirror pass and of the whole frame. Medians and 95th percentiles in ms, averaged over the three runs:

| Tier     | Build  | Court render, main thread | GPU frame   | GPU mirror pass | Draw calls | Reflection renders per frame |
| -------- | ------ | ------------------------- | ----------- | --------------- | ---------- | ---------------------------- |
| High     | before | 4.33 / 5.40               | 5.19 / 6.78 | 0.45 / 1.27     | 876 / 995  | 0: 50%, 1: 50%               |
| High     | after  | 3.90 / 6.20               | 4.83 / 7.33 | 0.46 / 2.79     | 871 / 1099 | 0: 50%, 1: 28%, 2: 22%       |
| Balanced | before | 4.30 / 5.30               | 5.03 / 6.45 | 0.42 / 1.11     | 876 / 981  | 0: 50%, 1: 50%               |
| Balanced | after  | 3.93 / 6.23               | 4.90 / 6.98 | 0.42 / 2.50     | 870 / 1078 | 0: 50%, 1: 28%, 2: 22%       |
| Fast     | before | 4.13 / 5.27               | 3.71 / 5.01 | 0.67 / 1.23     | 782 / 897  | 0: 50%, 1: 50%               |
| Fast     | after  | 3.93 / 5.10               | 3.71 / 5.49 | 0.40 / 1.64     | 771 / 894  | 0: 50%, 1: 50%               |

Medians fall because live views no longer draw Nyra; the 95th percentile rises by 0.8 to 0.9 ms of main thread and about 0.5 ms of GPU on High and Balanced, in the frames that draw two reflections. Fast stays within run-to-run noise (its GPU 95th percentile ranged from 4.8 to 6.3 ms over three runs). The frame interval stays at the 16.7 ms vsync on this machine in every case. The captures take 22 to 27 ms of the court's preparation ([capture-time.json](capture-time.json)).

## Programs and behaviour

- The [play-through](playthrough-after.json) completes with 207 programs at the first start, 982 after world preparation and 982 at the forest, as [before](playthrough-before.json): nothing compiles in play.
- [`check.mjs`](check.mjs) passes [18 cases](check.json): four captures at 256 px and one program key; 2, 2 and 1 live mirrors from the floor start on High, Balanced and Fast with at most two drawn per frame; full and half target sizes; redraws every 100 ms with a still camera and every frame when moving; renderer state and Nyra restored after a live view, also when it throws; the oblique near plane; a smooth fall back to the capture when a mirror leaves the budget; captures only through a door; live targets freed on leaving and restored on return; captures freed by a GPU release and taken again by the restore; no program compiled throughout.
- [`software.mjs`](software.mjs): under SwiftShader the title is ready after 35.5 s [before](software-before.json) and [after](software-after.json), one mirror reflects live and all four show their captures, with no compile in play. On the phone rig tier (`?q=phone`, no post) the base compiled 33 programs in play when the first mirror reflected (979 to 1012); after, the preparation compiles them (1038 at load) and play compiles none.
- The [architecture check](architecture-check.txt), [module preloads](boot-preload.txt), [ship check](ship.txt) and formatter pass.

GPU memory: the captures hold 18 MiB on High and 4.5 MiB on the other tiers (colour and six depth buffers per mirror); each live mirror keeps one target, 3 MiB at 512 px.

## Not checked

- No pose on the court floor qualifies more than two mirrors for a live view (12 m, facing, unobstructed), so High's budget of four never binds and High differs from Balanced only in target and capture sizes.
- A capture shows the court as it was prepared; the block, the beams, the gate and Nyra move only in live views. A changed quality's capture size applies from the court's next preparation.
- Physical phones, slower GPUs and the nightly fixed views were not run; the court's views with mirrors will differ from the nightly baselines.
