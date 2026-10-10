# Nightly review

`node scripts/nightly.mjs` is built and verified ([runbook](../docs/nightly.md), [receipt](../receipts/verification-nightly/README.md)). These items remain.

- **Baselines:** regenerate them on each merged tree that changes visuals or chapter starts (`node scripts/nightly.mjs --update-baselines`), look at the report's thumbnails, then commit `receipts/nightly-baselines/`.
- **Schedule:** the owner decides whether to install the LaunchAgent template or the cron line in the runbook; the machine must be awake and logged in at 03:00.
- **Concealment flicker:** while Nyra hangs close to the lens, `FollowCamera.conceal` can hide her for a single frame (`receipts/verification-nightly/finding-conceal-court.png`). The flash rules accept it as designed; a minimum hide time would remove the flicker.
- **Crossing headroom:** under heavy CPU contention the crossings into and out of the forest are the first to show 60 to 120 ms frames; an idle machine holds 17 ms.
