# Spare magazine pouches

```bash
npm start    # http://localhost:3002/, this checkout
node receipts/verification-pouches/scripts/belt-box.mjs    # the pouches, the spare magazines and the trousers' front in the hips' frame
node receipts/verification-axes-on-pack/scripts/axes-cam.mjs <outPrefix> "side|chapter=forest&cam=1.2,1.0,-4.1,0,0.95,-4.5"
```

The owner found the magazines still floating. The two pouches holding the spare magazines hang from the belt beside the buckle (`equipment.js`), placed for the explorer's earlier, fuller trousers: their back stood at z 0.118 in the hips' frame while the slimmer trousers' front stands at 0.079 to 0.09, so they hung 3 to 4 cm in front of her, and the spare magazines' tops 6 to 7 cm ([before](frames/side-before.jpg)).

## What changed

The pouches' middle now sits at z 0.1125 (`POUCH_Z`), their back on the trousers, with their lids, studs and stitching and the spare magazines' attachments moved with them ([side](frames/side-after.jpg), [front](frames/front-after.jpg), [measured](data/belt-after.json)). The reload still reaches the spare magazines through their attachments.

## Results

The pistols still fire 24 rounds and reload to 24, the finger contract (both hands closed through a reload) passes 25 of 25, the animation contracts 62 of 62 and the touch check 66 of 66.

## Not checked

The reload seen frame by frame from the side, and the owner's eye.
