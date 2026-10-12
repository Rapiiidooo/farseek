# Idle posture

```bash
npm start    # http://localhost:3002/, this checkout
R=receipts/verification-idle-posture/scripts
node $R/idle-back.mjs <outPrefix> [url] [chapter]    # standing idle from behind, three quarters and the side
node $R/idle-measure.mjs [url]                        # the standing pose in the model's frame
node scripts/animation-check.mjs --out <dir>
```

The owner compared Nyra standing still with a reference frame from another game, where the heroine stands at ease: feet about shoulder width apart, her weight on one leg, arms hanging a little away from the body with soft elbows. Nyra stood with her feet nearly together, legs straight and parallel, and her arms hanging almost straight against her hips ([before](frames/back-before.jpg)).

## What changed

- `game/animation/feet.js`: at rest the feet plant 0.32 m apart (`STANCE`, half the distance) instead of the legs' own 0.2 m, the left a little ahead, both turned out a little; once she has stood still for 0.6 s, a foot more than 5 cm short of that base steps out to it, one foot at a time.
- `game/animation/locomotion.js`: standing, she settles her weight on one leg and moves it to the other every 6 to 13 s (a deterministic draw), easing over about a second: her hips shift over the standing leg and drop a little on the free side, and her spine and head lean back towards level. The idle sway that rocked her hips continuously is gone. Her arms hang 0.08 rad further out and her elbows bend 0.2 rad more.

## Straight knees, a lighter shift

The owner still found her crooked at rest, and the first pass showed why: standing, both knees bent about 20°. The feet's solve lowers the hips until each stance leg is 12 mm short of straight (`feet.js`), slack that keeps the stride's knees soft but left her half crouched when still. Standing, the slack is now 6.5 mm; it must stay above the 3 mm the final solve keeps, or a planted foot reads as out of reach and steps again and again (a first try at 3 mm did exactly that). Sampled twice a second over 16 s of standing ([`knees.mjs`](scripts/knees.mjs)), the standing leg bends 15° and the free one 16 to 25°, against 20° and 20 to 24° on the public release ([after](data/knees-after.json), [before](data/knees-before-public.json)). The weight shift is lighter too: the hips move 2 cm over the standing leg and drop 2° on the free side, the spine and head lean back by about half that. [Before and after](frames/compare-straight-knees.jpg): behind, then the side.

## Results

Measured in the model's frame ([public release](data/before-public.json), [after](data/after.json)): the feet stand 0.31 m apart instead of 0.20, the hands hang 0.26 to 0.30 m out from the centre instead of 0.24, the elbows bend 30° instead of 19°, and the hips sit over the standing leg. Frames: [behind](frames/back-after.jpg), [three quarters](frames/three-quarter-after.jpg) and [side](frames/side-after.jpg), against [behind](frames/back-before.jpg), [three quarters](frames/three-quarter-before.jpg) and [side](frames/side-before.jpg) before. The [animation contracts](data/animation-check.json) pass 62 of 62, the stride, turning, landing and support checks among them.

## Not checked

The walk and the run, which the owner means to compare with a reference video next; physical devices; the owner's eye.
