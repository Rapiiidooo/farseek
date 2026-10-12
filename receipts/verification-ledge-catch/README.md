# Catching a ledge or a wall

```bash
npm start    # http://localhost:3002/, this checkout
R=receipts/verification-ledge-catch/scripts
node $R/catch-frames.mjs <outDir> [url] [side|follow]   # the jump to the court's crack and the drop from the west platform, frame by frame
node $R/catch-wall.mjs <outDir> [url]                   # the leap onto the frozen reach's scarred fall with Mira's axes
python3 $R/sheet.py <outDir> <crack|edge|wall> <out.jpg> <eight frame numbers>
node scripts/animation-check.mjs --out <dir>; node receipts/verification-traversal-walls/walls-review.mjs <dir> --url=http://localhost:3002
```

The owner asked for a better movement when Nyra catches hold of a wall. A catch moved her body in a frame: `beginHang` and `beginWall` put her on the hold and handed the difference to the visual offsets `snap` and `stepLift`, which fade in about 70 to 90 ms. Dropping from the top of the court's west platform into a hang, she stood on the edge, then hung 1.86 m lower three frames later ([before](frames/edge-before.jpg)); a jump to the crack ended the same way, 0.6 m lower in a frame ([before](frames/crack-before.jpg)).

## What changed

- `game/hero.js` and `game/wall-climb.js`: a catch records where the body was (`hero.arrival`: the offset and the vertical speed) instead of adding it to `snap` and `stepLift`. Play is unchanged: the explorer's position, holds and timing are exactly as before.
- `game/animation/arrival.js`, used by the animator: a jump's catch carries the body on to its hold with its momentum, on critically damped springs, never below the hang the straight arms allow; on a wall, where hands and picks plant at once, twice as fast. A drop from the top runs over 0.8 s: she turns to face the stone and crouches at the edge with her hands on it, then lowers down the face into the hang. The hang's own swing on arrival is kept for catches and left out of drops.

## Results

Frames one simulation frame apart, every few frames shown: [the drop after](frames/edge-after.jpg) (crouched at the edge, then down the face) against [before](frames/edge-before.jpg), [the jump to the crack after](frames/crack-after.jpg) against [before](frames/crack-before.jpg), and [the leap onto the ice after](frames/ice-after.jpg) against [before](frames/ice-before.jpg) ([data](data/)). The animation contracts pass [62 of 62](data/animation-check.json), palms and picks on their holds included (a slower wall arrival failed that contract, hence the faster one); the [wall review](data/walls-review.log) passes 10 of 10 with real input on the ice and the ivy; the play-through completes with no error and the touch check passes 66 of 66.

## Not checked

The rope swing's catch, which still uses `snap`; physical devices; the owner's eye on the timing.
