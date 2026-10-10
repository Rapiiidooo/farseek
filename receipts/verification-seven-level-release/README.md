# Seven-level release

```bash
npm ci --ignore-scripts && npm run check && node scripts/save-check.mjs && python3 scripts/release-check.py
node scripts/build-release.mjs HEAD outputs/release
python3 scripts/deploy-release.py outputs/release "$(git rev-parse HEAD)" --verify-only
node receipts/verification-seven-level-release/public-check.mjs
U=https://farseek.rapidoai.dev/
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node ../404-game-recipe/harness/live.mjs $U [--desktop]
node receipts/verification-seven-level-release/live/start-window.mjs
node scripts/playthrough.mjs <dir> --url="${U}?nolock=1"
node scripts/forest-check.mjs <dir> --url="${U}?nolock=1&chapter=forest"   # sea-check and vault-check likewise
```

Release `20261010-74fd2cec631f` publishes commit `74fd2cec631f6c8d94321944900691ddc48be879` on `farseek.rapidoai.dev` and `fardoor.rapidoai.dev`. It is the seven-level game of commit `4a04e8d` (six-world expansion, owner review and epics round over `c09a2c8`), plus the teaser's scripts, which ship nothing in `game/`. The [manifest](release.json) lists its 476 runtime files. The private builder's archive (SHA-256 `a84777bf476b6ac25df8bb000ec7496b6aa77c65799fc6a9d17fb8548c3856bb`) holds the same 476 files with the same hashes as the repository's package. It was checked again on the VM before the existing immutable-release installer switched `current` and passed its HTTP check. The previous release `20261008-c09a2c85d5a2`, which the site served until then, stays on the VM for rollback.

## Results

- Before packaging: `npm ci`, the ship check (326 modules, 2 pages), the save check, 23 release tests and the verify-only validation pass on that commit.
- [Public review](public.json): all 476 files served on `farseek.rapidoai.dev` match the manifest, as do the page, main module and tracker on the alias, and the 16 analytics route checks pass unchanged. Pages and modules are served gzipped with `no-cache` and HSTS; HTTP answers 301 to HTTPS with the query kept.
- Campaign routes on the public URL, one browser at a time with real keys ([summary](routes/summary.txt)): the play-through from the title completes levels 1 to 4 and enters the Wildwood with 982 shader programs from start to forest; the forest route passes the castle, its guards, the ordered address, the sea crossing and return; the sea's 24 checks and the vault's 30 checks pass through the Tide Guardian, the reunion, the six seals, the reveal, the next door and the credits, with Mira's 20 vault lines played from their clips. No route records a page, console or WebGL error, or a shader compiled during play. [Frames](frames/) show each world.
- Recipe live gate: the phone viewport is ready in 4.9 s, starts from a real touch and moves 3.2 m ([frame](live/phone.jpg)). The desktop run fails: its 4 s key hold starts at the New game click, which keeps "Preparing the worlds ahead…" on screen ([frame](live/desktop.jpg)). [Measured](live/start-window.json) with the same headless browser, play begins 9.0 s after the click (19.4 s in an earlier run), then a 4 s hold walks Nyra 3.2 m to the terrace edge ([frame](live/desktop-after-start.jpg)). This is the start window of [the follow-up task](../../tasks/epics-round-followups.md).

## Not checked

The owner's hand test, physical phones, gamepads, Safari and headphones; the strict startup gate, which still fails on weight and the start window. The jam entry and the `jam-entry` media still name `13a7767`. The commits are local: nothing is pushed.
