# Intermittent error during new game verification

```sh
node receipts/verification-combat-corrections/desktop-stack.mjs http://localhost:3002/ --out=receipts/verification-combat-corrections/desktop-investigation --desktop
```

Run with the existing local server on port 3002 and exclusive use of Chrome. This instrumented copy preserves the recipe gate's network, CPU and input procedure, and retains full page/console error details.

The original [desktop gate](../receipts/verification-combat-corrections/desktop/verdict.json) recorded one `Cannot read properties of undefined (reading 'box')` exception. Its page error handler retained only the message, so the source and phase are unknown. Loading, actual New game click, movement, weight, draw and triangle budgets otherwise passed.

Four subsequent instrumented gates on the same frozen runtime passed without error: `desktop-stack/`, `desktop-trial-1/`, `desktop-trial-2/`, `desktop-trial-3/`. A separate `start-probe.mjs` repeated loading and movement without a page exception, but its first run did not capture console errors. These passes do not establish a fix for the initial exception.

Static review found no incomplete objects in court interactables, no unguarded actionable target in Hero and no viable undefined music cue path. The movement receipt includes repeated terrace falls and respawns, which may be relevant but do not localize the failure. No speculative runtime guard was added.

The requested temple, pistol, arm and moving-shot corrections pass their focused CPU/browser gates. The animator SHA is `e50bde769ca5940f13aa2a23887026c3b65453f8cf8d914681a42ddc4b366057`; the complete final source snapshot hashes are in the correction receipt.

The [current receipt](../receipts/verification-aim-swimming/README.md) adds full input and residency context, a bounded load trace and a strict throttled Fast startup pass. A separate `userData` exception introduced by a concurrent startup probe was localized and corrected through the character readiness barrier; it does not identify this original `box` access.

The current diagnostic pass is in `receipts/verification-startup-box/`. The original automated gate predates the owner's later random loading report; their shared cause is unproven. None of the 295 local diagnostic records present at investigation entry contains the `box` exception. Eight cold New game and restart trials on the captured adventure-polish tree produced no browser exceptions or failed requests. Four of these intentionally run off the terrace under 2x or 4x CPU throttling and record 39 actual deaths and respawns. The preceding four walking trials did not reproduce the fall route and establish only loading and restart coverage. Fourteen native browser checks cover foreground entry, restart, title return, New game and Continue during adjacent preparation across all six worlds, including actual court GPU release and restoration.

Three controlled early failures expose a separate diagnostic gap: a failed bootstrap request, failed Three.js dependency and unavailable WebGL context never reach the old journal and leave the initial loader without recovery. The two-path correction catches bootstrap imports and synchronous initialization, preserves the original error without requiring a renderer and exposes the existing reload action. All three faults now persist their full available stacks and recover into actual New game movement on a fresh logged server. The initial post-change dependency retry timed out; a subsequent navigation found the old local server absent. Its former process output is unavailable, so the reason for that stop remains unknown. Preserve both attempts. This correction does not identify the original `box` access.

The corrected tree passes the unchanged strict Fast gate at 15.138 seconds with no errors, and the project ship gate parses 249 modules and two pages. Its 385-file source audit confirms exactly two changed runtime files and preserves all three recipe modules. Final transition checks also wait for the loading overlay to disappear after Continue.

Next step: capture the next original exception through the strengthened journal and add a deterministic regression fixture at its identified failing access. Successful repeats and controlled failures do not resolve the original report.

The saved [final audit](../receipts/verification-startup-box/final-audit.json) verifies the 385 source hashes, fourteen final transitions and three recoveries. The [server check](../receipts/verification-startup-box/server-check.json) observed 300 journal records and no `box` failure; recheck the live process and newer records after session recovery. Existing probe failures and controlled imports are separate evidence. The completed movement and adventure work is preserved in `receipts/verification-adventure-polish/`; its runtime manifest is the baseline for the two-file diagnostic patch. Both loading tasks remain open.
