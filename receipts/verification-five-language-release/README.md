# Five-language release

```bash
npm ci --ignore-scripts && npm run check && node scripts/save-check.mjs && python3 scripts/release-check.py
node scripts/build-release.mjs HEAD outputs/release
python3 scripts/deploy-release.py outputs/release "$(git rev-parse HEAD)" --verify-only
node receipts/verification-five-language-release/public-check.mjs
U=https://farseek.rapidoai.dev/
node scripts/playthrough.mjs <dir> --url="${U}?nolock=1"
node scripts/forest-check.mjs <dir> --url="${U}?nolock=1&chapter=forest"   # sea-check and vault-check likewise, vault-check also with &lang=fr
node scripts/menu-check.mjs <dir> "--url=${U}?nolock=1"
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node ../404-game-recipe/harness/live.mjs $U [--desktop]
node receipts/verification-five-language-release/live/start-window.mjs [url] [out.json]
node outputs/start-window-latency.mjs <url> <out.json> 300 1000000   # copy in live/, run from outputs/
```

Release `20261011-786db0f7878d` publishes commit `786db0f7878d15f4651f0ca6bad70f4e104483ae` on `farseek.rapidoai.dev` and `fardoor.rapidoai.dev`. Over release `20261010-74fd2cec631f` it adds a loading screen that follows each world's preparation ([receipt](../verification-loading-screen/README.md)), the game in French, Spanish, Chinese and Hindi with Mira's voice in each ([receipt](../verification-languages/README.md)), title and loading art built from every world ([receipt](../verification-art-direction/README.md)) and a level list that keeps unreached worlds unknown. The [manifest](release.json) lists its 634 runtime files. The private builder's archive (SHA-256 `ea2671cdf8c5b7a8447bd1200b5c63b1b225d0f01c957200504787e08e26f041`) holds the same 634 files with the same hashes as the repository's package. It was checked again on the VM before the immutable-release installer switched `current` and passed its HTTP check. That check now accepts attributes on the page's title, which carries `translate="no"` since the languages; the earlier check would have refused this page and restored the previous release. Release `20261010-74fd2cec631f` stays on the VM for rollback.

## Results

- Before packaging: `npm ci`, the ship check (332 modules, 2 pages), the save check, 23 release tests and the verify-only validation pass on that commit.
- [Public review](public.json): all 634 files served on `farseek.rapidoai.dev` match the manifest, as do the page, main module and tracker on the alias, and the 16 analytics route checks pass unchanged.
- Campaign routes on the public URL, one browser at a time ([summary](routes/summary.txt)). The [play-through](routes/playthrough.log) from the title completes levels 1 to 4 and enters the Wildwood with 982 shader programs throughout. The [forest](routes/forest.log) passes the castle, its guards, the ordered address, the sea crossing and return. The [sea](routes/sea.log) passes its 24 checks through the reunion into the vault, and the [vault](routes/vault.log) its 30 checks to the credits, again [in French](routes/vault-fr.log), with Mira's 20 lines played from their clips in both. The [menu check](routes/menu.log) passes 21 of 21; its process then hung while closing Chrome and was stopped. No route records a page or WebGL error or a shader compiled during play. [Frames](frames/) include the [title](frames/playthrough-01-title.jpg) and the [French vault](frames/vault-fr-01-arrival.jpg).
- Recipe live gate: both runs fail ([phone](routes/live-phone.log), [desktop](routes/live-desktop.log)). The phone holds its keys during the level's opening scene, while the touch stick is hidden ([frame](live/phone.jpg)); the desktop holds its key while the loading screen still prepares the worlds ahead ([frame](live/desktop.jpg)). The previous release passed the phone run and failed the desktop run the same way.
- Start window ([runs](live/compare/)): on the public URL the title is ready after 12.8 to 13.7 s and play begins 22.9 to 24.9 s after New game, against 4.0 s and 9.0 s for the previous release on 10 October. Served locally, this commit and `74fd2ce` are both ready in 2.2 s and play 5.1 to 6.1 s after the click; under 300 ms of emulated latency at 1 MB/s both take 21 s and 31 to 32 s. The release does not slow the start: today each public request took 0.6 to 0.9 s (0.2 s to connect, 0.2 s for TLS, 0.2 s of waiting), and the start's chain of requests makes it latency-bound.

## Not checked

The owner's hand test, physical phones, gamepads, Safari and headphones; Spanish, Chinese and Hindi on the public URL; the strict startup gate. The jam entry and the `jam-entry` media still name `13a7767`. The commits are local: nothing is pushed.
