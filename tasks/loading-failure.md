# Loading failure

The owner encountered the loading error overlay while starting the game.

1. Capture the full error stack, failed requests and loading stage on the normal title and New game path.
2. Fix the identified cause and add a focused regression check that exercises the failing path.
3. Verify actual gameplay, run the project gates and record the tested sources in receipts.

The historical `startup-box-error.md` remains open until evidence identifies its cause.

Normal New game, all six chapter resumes and a network/CPU throttled startup did not reproduce the exception. The server was absent at session entry and has been restarted; that observation does not establish the cause of the reported overlay.

`game/load-diagnostics.js` records the original stack and loading stage through `scripts/load-diagnostics.mjs` into `receipts/verification-loading-failure/live/errors.jsonl` on local previews. `withLoading` retains a failed stage and offers a single retry; only successful work marks the page ready. Keyboard and touch recovery preserve the requested chapter. A real failed character or chapter import uses page reload to clear the browser's cached module failure. Synthetic New game and background checkpoint failures verify full stack delivery, the foreground overlay, uninterrupted background gameplay and clean reload/retry. A failed telemetry context probe does not throw. Earlier evidence is in `receipts/verification-loading-failure/synthetic/` and `receipts/verification-runtime-flow/streaming/`.

The [autonomous review receipt](../receipts/verification-five-iterations/README.md) verifies actual character and chapter request failures, 26 error identity and lifecycle retry cases, and four journal request boundaries. Asset preflight imports preserve the original network error rather than silently producing empty geometry. Reports include bounded load trace, frame history, pending lifecycle phases and asset failure records. `window.__LOAD_ERROR__` exposes the context immediately; the active diagnostic server uses the current handler and persists these fields. These controlled failures do not identify the owner's intermittent exception.

The [reticle swimming receipt](../receipts/verification-aim-swimming/README.md) adds a bounded 48 event load trace, residency, pending jobs and input context. Final keyboard routes and the throttled Fast New game gate capture no original exception. A concurrent startup probe introduced a separate `userData` access before the character was ready; the readiness barrier, refreshed wiring services and 38 resource and dependency checks verify its correction. Its preserved stack is not evidence for the original `box` error.

The new `receipts/verification-startup-box/` pass reproduces three failures before application diagnostics exist: aborted bootstrap and Three.js requests and an unavailable WebGL context. Previously each left the initial loader without a journal entry or retry. The two-path correction records the available original stack and import or initialization stage without requiring a renderer and exposes the existing reload action. Three real retries return to the court and move through actual keyboard input. Eight cold startup/restart trials, 39 deaths and respawns and fourteen transition checks did not reproduce the owner's random failure. A separate loss of the old local server interrupted one diagnostic attempt; the fresh logged server passes the three recovery cases. Neither observation identifies the original report.

The corrected tree passes the unchanged strict Fast gate at 15.138 seconds and the 249-module project ship gate. Its source audit identifies exactly two runtime changes against the 385-file adventure review manifest.

Next step: inspect the next original load error and fix its identified source. Controlled failures and successful retries do not establish a fix for the owner's intermittent failure.
