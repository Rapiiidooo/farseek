# Pistol rounds

```bash
npm start    # http://localhost:3002/, this checkout
node receipts/verification-pistol-rounds/scripts/rounds-probe.mjs <out.json> [url]
U=http://localhost:3002/
node scripts/forest-check.mjs <dir> "--url=${U}?nolock=1&chapter=forest"   # sea-check and vault-check likewise
```

The owner asked for the pistols to carry about 24 rounds, 12 each. They alternated 32 between reloads (`PISTOL_CAPACITY` in `game/weapon-reload.js`, read by the equipment, its kit label and the character studio); it is now 24.

## Results

- [`rounds-probe.mjs`](scripts/rounds-probe.mjs) draws the pistols in the wildwood and fires with real clicks: the kit holds 24, each shot takes one, the 24th leaves none and the reload brings back 24 ([data](data/rounds.json)).
- With a magazine of 12 a pistol, the routes that fight still pass: the [forest](logs/forest.log) with its grove and castle guards and the sea crossing, the [sea](logs/sea.log) 24 of 24 with the guardian, and the [vault](logs/vault.log) 30 of 30.

## Not checked

How the shorter magazine feels in the owner's hands in the castle keeper's and the guardian's fights.
