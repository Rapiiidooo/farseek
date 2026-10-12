# Breathing

```bash
npm start    # http://localhost:3002/, this checkout
node receipts/verification-breathing/scripts/breath-probe.mjs <out.json> [http://localhost:3002/ | https://farseek.rapidoai.dev/]
```

The owner found the heroine's breathing far too strange and asked for it to be subtler, and heard only when she really runs. In `body-sound.js` running raised her exertion past the breathing threshold within about 2.4 s, climbing within about 2.6 s, and walking let it fall so slowly that she kept panting some 20 s after stopping; each in-breath played half again as loud as an out-breath.

## What changed

- Exertion now rises mostly from running (above 4.5 m/s, 0.05 a second at full speed); climbing, swinging, pushing and swimming add a little, and hanging still adds nothing. It falls by 0.16 a second standing and 0.1 walking.
- Breathing starts above 0.55 (about eleven seconds of running) and stops below 0.45, so it eases within a few seconds of stopping. Its period runs from 2.3 s down to 1.5 s with a little jitter, it opens on an out-breath, and the recorded takes play at 0.032 at most, the in-breath at 0.6 of the out-breath. The synthesized fallback follows the same levels and no longer voices a vowel on hard out-breaths.
- Jumps, climbs, rolls, landings, hits, the surfacing gasp and the strain of low air are unchanged.

## Results

[`breath-probe.mjs`](scripts/breath-probe.mjs) drives the body sound on its own clock through 5 s of walking, 20 s of running, 8 s standing, 12 s of climbing and 5 s standing, with the recorded takes loaded:

|                       | Public release     | After                   |
| --------------------- | ------------------ | ----------------------- |
| First breath          | 2.8 s into the run | 11.3 s into the run     |
| Breaths while running | 24                 | 10                      |
| After stopping        | 17, until the end  | 4, over the first 2.9 s |
| While climbing        | 18                 | none                    |
| Loudest in / out      | 0.12 / 0.08        | 0.019 / 0.030           |

Data: [before](data/breaths-before-public.json), [after](data/breaths-after.json).

## Not checked

The owner's ears: whether the takes themselves still sound strange at this level. If they do, the next step is new takes, not tuning.
