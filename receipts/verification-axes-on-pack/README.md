# Ice axes on the pack

```bash
npm start    # http://localhost:3002/, this checkout
R=receipts/verification-axes-on-pack/scripts
node $R/axes-cam.mjs <outPrefix> "side|chapter=forest&cam=1.4,1.45,-4.5,0,1.3,-4.5" "back|chapter=forest&cam=0,1.5,-3.1,0,1.25,-4.5"
node $R/pack-box.mjs     # the pack and both axes in the model's frame, as posed
node $R/frost-axes.mjs   # the pair waiting at the fall's foot and the ground under it
node scripts/animation-check.mjs --out <dir>
```

The owner found Mira's ice axes floating in the air. Once taken, the axes ride crossed on Nyra's pack (`STOW` in `game/animation/wall.js`), placed for the explorer's earlier backpack. Her outfit now carries the slim hydration pack of `hero-warrior.js`, whose outer panel stands at z -0.149 in the model's frame as posed, and the shafts were stowed at -0.232 and -0.252: a hand's width behind the pack with nothing holding them, plain from the side ([before](frames/side-before.jpg), [from behind](frames/back-before.jpg)).

## What changed

The two shafts now cross against the pack's outer panel, the first at z -0.17 and the second over it at -0.2, at the same height and angle ([side](frames/side-after.jpg), [three quarters](frames/three-quarter-after.jpg), [behind](frames/back-after.jpg)). Measured as posed ([data](data/pack-box-after.json)), the first axe's box reaches the panel and the second rests on the first.

## Results

- The [animation contracts](data/animation-check.json) pass 62 of 62, among them "Axes ride the pack once owned and off the climb" and "Axe picks bite the ice at planted holds".
- The pair waiting at the foot of the frozen reach's first fall stands on the snow (ground 0, its tips 7 cm into it) and leans its heads on the ice ([frame](frames/waiting-at-the-fall.jpg)); it was not floating and is unchanged.

## Lashing

The owner then asked for a small cord to hold them. A red cord (`LASHING` in `wall.js`) is knotted where the shafts cross and runs out to the pack's four corners, bowing a little over the shafts; it rides the spine with the axes and shows only while they are stowed ([behind](frames/lashing-back.jpg), [three quarters](frames/lashing-three-quarter.jpg), [side](frames/lashing-side.jpg)). Built with the axes before any world prepares its shaders, it compiles nothing during play: the [wall review](data/walls-review.log) passes 10 of 10, frost and ivy climbs included, the animation contracts 62 of 62.

## Not checked

Every animation from every angle, and the owner's eye.
