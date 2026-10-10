# High density and slower hardware budgets

```sh
node receipts/verification-aim-swimming/startup-gate.mjs http://localhost:3002/ --out=receipts/verification-aim-swimming/startup-budget-review --desktop --quality=fast
node receipts/verification-aim-swimming/render-review.mjs
node receipts/verification-aim-swimming/render-summary.mjs
```

The strict gate keeps its 20 second, 10 MB, 900 draw, 1.5 million triangle and 1 metre movement limits. Run timing checks with exclusive use of Chrome. A simulated viewport or desktop Metal run is not a physical phone test.

`game/render-budget.js` budgets post processing, portal targets, shadow maps and range. `game/gate.js` budgets stable distant views while keeping nearby and cinematic portal views fresh. High preserves the original matched submission counts; scene silhouettes and collisions must remain intact.

The initial [throttled desktop attempt](../receipts/verification-aim-swimming/startup-desktop/verdict.json) waited for the next world after the actual New game click and failed movement. `app/campaign.js` now starts the requested resident world and prepares neighbors in the background. The [next attempt](../receipts/verification-aim-swimming/startup-desktop-background/verdict.json) moves 3.2 m with no exception, but records 20.9 seconds, 1,022 draws and 1,613,132 triangles in High.

The final Fast policy narrows court shadows to 28 m. Character and scenery load concurrently, with a character readiness barrier before world wiring. The [final strict gate](../receipts/verification-aim-swimming/startup-fast-ready/verdict.json) passes at 18.3 seconds, 8.2 MB, 892 draws, 1,479,149 triangles and 3.2 m movement, with no exception or missing response. Probe texture generation was removed, but its isolated startup run did not materially change readiness time.

Matched forest and sea views preserve High submission counts and restore original shadow reach. Fast lowers mean forest draws by 41.3% and triangles by 26.4%. The [sample summary](../receipts/verification-aim-swimming/rendering/summary.json) includes mean and 95th percentile CPU and GPU times; the final forest Balanced GPU sample is slower than its baseline despite fewer submissions.

The [quality loop 22 strict desktop Fast gate](../receipts/verification-render-quality/loop-22-current-showcase/startup-fast/verdict.json) passes at 19.52 seconds, 8,689,694 body bytes, 785 draws, 1,464,818 triangles and 3.19 metres. Median FPS is 60 with no exception, missing response or external runtime host. Its recorded source revision retains 0.48 seconds of readiness margin; further first-world work needs an unchanged strict gate. Glacier snow and seabed sand remain separately loaded. This receipt does not establish a physical phone result or resolve the intermittent box exception.

The [adventure polish strict Fast gate](../receipts/verification-adventure-polish/startup-final/verdict.json) passes at 15.009 seconds against its captured 19.590 second baseline, with 9,186,585 body bytes, 796 draws, 1,486,830 triangles, median 60 fps and 3.19 metres of actual movement. Character declaration cloning remaps object references without JSON serialisation of geometry, and render preparation applies the selected quality before warming the court. The final movement corrections are included in the 385-source manifest. No browser exception, missing response or external runtime host is recorded; the separate startup box investigation remains open.

The [zero hitch engine](../receipts/verification-zero-hitch/README.md) replays the explorer's garment fit, builds the heaviest factories and detail pixels in workers, slices long world loops, gives the Wildwood's trees distance levels and builds each world's door pipelines during preparation. On main with the vault, in alternating desktop rounds, the title's first interactive frame median fell from 3,347 to 2,083 ms and title preparation frames over 50 ms from 4 to 0, with 980 programs throughout; with cold shaders, a door's first view of its prepared world fell from 72 to 194 ms to under 8 ms. `worlds/gpu-budget.js` now chooses the residency tier from the device's estimated graphics memory; the `neighbors` and `next` tiers are verified only with simulated pointers and memory. On desktops a world returning to the residency window reruns its whole preparation in the background (`onRestore`), although only its render targets were released.

Next action: profile the default quality on a physical phone, including the residency tier it receives, and High density on slower desktop graphics, then budget the measured bottlenecks with matched views and actual adjacent entry. A targets-only restore could resize and apply the render budget without preparing the world again. The preceding High startup failure describes its tested revision, before concurrent loading; a final High startup timing requires a separate gate. Do not infer the cause of the intermittent box exception from performance failures.
