# Nightly review

```sh
node scripts/nightly.mjs                      # every step, about 25 minutes
node scripts/nightly.mjs --quick              # the quick subset, about 10 minutes
node scripts/nightly.mjs --only=views,sea     # chosen steps; --skip=<ids> leaves steps out
node scripts/nightly.mjs --update-baselines   # accept tonight's fixed views as the baselines
cat outputs/nightly/latest.json               # names the last run's folder and verdict
```

Options: `--out=<dir>` (default `outputs/nightly`), `--keep=<runs>` (default 14, older runs are deleted), `--hitch-ms=<ms>` (default 50), `--port=<port>` (default a free one).

The command serves the checkout it runs in through `scripts/serve.mjs` on a free port, runs each step as its own process and writes `report.json` and `index.html` (thumbnails, flashes, crossings) in `outputs/nightly/<date>/`. It exits 1 when a step fails and 2 when the harness itself fails. Every browser step runs with its own `TMPDIR`; the monitor (`scripts/nightly/monitor.mjs`) finds the step's Chrome profile there and attaches a second DevTools client, so the check scripts stay unchanged.

| Step                                   | Fails when                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| modules, architecture, save, animation | the file checks' own assertions fail                                                      |
| views                                  | a fixed view drifts from its baseline (SSIM, worst tile SSIM, worst tile colour distance) |
| hitch                                  | a crossing frame exceeds the limit in the measurement and again in its confirmation run   |
| markers, touch, menu, relic, starts    | the check fails                                                                           |
| sea, vault, forest, playthrough        | the route fails, or the flash detector sees a black or flashing frame, or too few frames  |
| every browser step                     | a page error, a console error, a WebGL warning, or a shader program compiled during play  |

`--quick` runs the four file checks, views, hitch, markers, sea, vault and forest.

## Fixed views

`scripts/nightly/views.json` lists the cameras (the `?cam=x,y,z,tx,ty,tz` convention), the quality, the pinned time, the per-world clocks and the frames of play before the freeze. The capture seeds `Math.random`, plays exactly 1/60 s a frame for those frames and stops the loop, pins the grass clock and every `uTime`, hides Nyra and renders once, so two captures match pixel for pixel whatever the load. Baselines are 640x360 PNGs with their measured repeat noise in `receipts/nightly-baselines/`; a view may carry its own `limits`.

After merging visual or route changes, regenerate the baselines once the merged tree is the reference, look at the new images, then commit them:

```sh
node scripts/nightly.mjs --update-baselines
```

## Flash detector

`scripts/nightly/recorder.js` wraps `worlds.render` in pages opened with `?debug=1`: every frame is resolved, reduced to 1/8 and read back two frames later through a pixel buffer, so the frame never waits for it. `scripts/nightly/flash-rules.js` fails on exactly black regions and one-frame luminance spikes of the whole frame; one-frame spikes over several regions only appear in the report for review, since geometry sweeping past the lens makes them too. Luminance changes that camera cuts, camera shake, muzzle flashes or the follow camera hiding Nyra explain are ignored. Each flag saves the frame and its neighbours. The same wrapper reports any program created while no world preparation runs.

## Scheduling (not installed)

The owner decides whether to install either. The machine must be awake and logged in at the scheduled time, since the checks drive Chrome on the GPU of the user session; `sudo pmset repeat wakeorpoweron MTWRFSU 02:55:00` wakes it. A LaunchAgent catches up after sleep, cron does not. Run the nightly once by hand first so `outputs/nightly/` exists for the log.

```sh
cp scripts/nightly/farseek-nightly.plist ~/Library/LaunchAgents/com.farseek.nightly.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.farseek.nightly.plist
launchctl bootout gui/$(id -u)/com.farseek.nightly   # to remove it
```

Cron line (`crontab -e`), adjusting the paths to the checkout and Node 24:

```sh
0 3 * * * cd /Users/rapido/perso/bittensor/404/farseek && /opt/homebrew/opt/node@24/bin/node scripts/nightly.mjs >> outputs/nightly/cron.log 2>&1
```
