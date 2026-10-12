# Mute, start and menu release

```bash
npm ci --ignore-scripts && npm run check && node scripts/save-check.mjs && python3 scripts/release-check.py
node scripts/build-release.mjs HEAD outputs/release
python3 scripts/deploy-release.py outputs/release "$(git rev-parse HEAD)" --verify-only
node receipts/verification-mute-start-menu-release/public-check.mjs
U=https://farseek.rapidoai.dev/
node scripts/playthrough.mjs <dir> --url="${U}?nolock=1"
node scripts/forest-check.mjs <dir> --url="${U}?nolock=1&chapter=forest"   # sea-check and vault-check likewise, vault-check also with &lang=fr
node scripts/menu-check.mjs <dir> "--url=${U}?nolock=1"; node scripts/touch-check.mjs <dir> --url=$U
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node ../404-game-recipe/harness/live.mjs $U [--desktop]
node receipts/verification-five-language-release/live/start-window.mjs $U <out.json>
node receipts/verification-mute-start-menu/scripts/network-probe.mjs "${U}?nolock=1" <out.json>
node receipts/verification-mute-start-menu/scripts/sound-probe.mjs new <out.json> $U 1 20
```

Release `20261012-ef085952c3c5` publishes commit `ef085952c3c53838fceaeeca9b704a19d6fcc487` on `farseek.rapidoai.dev` and `fardoor.rapidoai.dev`. Over release `20261011-786db0f7878d` it lights the medallions of doors opened out of sight in silence, adds a quick mute, starts play once the worlds around the start are ready, preloads the title's modules and the court's assets, and keeps every menu line on one line with the builders' glyphs ([receipt](../verification-mute-start-menu/README.md)). The [manifest](release.json) lists its 634 runtime files. The private builder's archive (SHA-256 `4bafbbaef21cd701a587cd9915bcf3840c528f910ea47adb59a0afe36165cc23`) holds the same 634 files with the same hashes as the repository's package; it was checked again on the VM before the immutable-release installer switched `current` and passed its HTTP check. GitHub's validation of the pushed commit passed. Release `20261011-786db0f7878d` stays on the VM for rollback.

## Results

- Before packaging: `npm ci`, the ship check (332 modules, 2 pages), the save check, 23 release tests and the verify-only validation pass on that commit.
- [Public review](public.json): all 634 files served on `farseek.rapidoai.dev` match the manifest, as do the page, main module and tracker on the alias, and the 16 analytics route checks pass unchanged.
- Campaign routes on the public URL, one browser at a time ([summary](routes/summary.txt)). The [play-through](routes/playthrough.log) completes levels 1 to 4 and enters the Wildwood with no error. The [forest](routes/forest.log) passes its castle, address and sea crossing; the [sea](routes/sea.log) passes 24 of 24 and the [vault](routes/vault.log) 30 of 30, again [in French](routes/vault-fr.log) with Mira's 20 lines played from their clips. The [menu check](routes/menu.log) passes 25 of 25, mute included, then hung while closing Chrome as on the previous release and was stopped (exit 143). The [touch check](routes/touch.log) passes 59 of 59, including the pause tap that no longer mutes. [Frames](frames/): [title](frames/title-public.jpg), [pause](frames/pause-public.jpg), [phone title](frames/title-phone-public.jpg).
- Start window on the public URL ([runs](live/)): the title is ready after 2.7 to 2.8 s and play begins 2.3 to 2.8 s after New game, against 12.8 to 13.7 s and 22.9 to 24.9 s with the previous release on 11 October and 4.0 s and 9.0 s on 10 October. A [first visit](live/network.json) makes the same 199 requests (5.29 MB) before the title; a return visit is ready after 2.2 s. A New game logs [no bell](live/bells-new-game.json).
- Recipe live gate: the [desktop run](routes/live-desktop.log) passes, moving 3.2 m ([frame](frames/live-desktop.jpg)); the previous release failed it. The [phone run](routes/live-phone.log) fails: it waits a fixed 1.5 s after its tap, the phone emulation was still under the loading screen with the stick hidden, so it held keys instead, which the start clears; play then ran its opening scene ([frame](frames/live-phone.jpg)). Served locally, where play begins under a second after the tap, the phone run passes.

## Not checked

The owner's hand test, physical phones, gamepads, Safari and headphones; Spanish, Chinese and Hindi on the public URL; the strict startup gate. The jam entry and the `jam-entry` media still name `13a7767`.
