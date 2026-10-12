# Finger life

```sh
python3 scripts/build-hero-finger-rig.py <checkout holding receipts/verification-realism/sources>
node receipts/verification-finger-life/finger-check.mjs --out receipts/verification-finger-life
node scripts/animation-check.mjs --before <main>/receipts/verification-realism/baseline/hero-anim.js --out receipts/verification-finger-life/animation-after
mkdir -p /tmp/finger-before && git archive ef08595 game | tar -x -C /tmp/finger-before
ln -s "$PWD/node_modules" /tmp/finger-before/node_modules
node receipts/verification-finger-life/capture.mjs /tmp/finger-before . receipts/verification-finger-life/frames
node receipts/verification-finger-life/cost.mjs /tmp/finger-before . > receipts/verification-finger-life/cost.json
PORT=3008 node scripts/serve.mjs
node receipts/verification-finger-life/game-probe.mjs receipts/verification-finger-life/game --url=http://localhost:3008
node receipts/verification-finger-life/studio-probe.mjs receipts/verification-finger-life/studio --url=http://localhost:3008
node scripts/playthrough.mjs <dir> '--url=http://localhost:3008/?nolock=1'
node <main>/receipts/verification-traversal-walls/walls-review.mjs <dir> --url=http://localhost:3008
node ../404-game-recipe/harness/ship.mjs game
node scripts/architecture-check.mjs
```

The owner found Nyra's fingers far too static. They were: each glove was one baked mesh whose only control was a `relax` morph towards the grip, driven by running speed alone, and every hold swapped instantly to a separate rigid grip mesh. No finger had a joint.

## What changed

- `scripts/build-hero-finger-rig.py` reads the CC0 MakeHuman hand that posed both shipped gloves, asserts that it reproduces `gloves-relaxed.js` and the grip of `gloves.js` vertex for vertex (7.7e-9 m), and writes `game/assets/explorer/gloves-rig.js`: fifteen finger bones with their axes and angles, and each vertex's weights smoothed by the same pass that refined the posed vertices ([rig-build.json](rig-build.json)).
- `hero-gloves.js` skins the relaxed glove to those bones under a `FingerRoot` carrying the source hand's frame and non-uniform scale, and declares each bone's relaxed, grip and open turns. The grip mesh is unchanged.
- `animation/fingers.js` replaces `showHands`: one curl per finger on a spring of its own, one slerp per bone between the declared turns. Free hands keep a cascade from the index to the little finger with slow unmatched drift and a small gesture every few seconds, form a loose running fist that loosens on the forward swing, flex briefly on a landing, a hit or a roll, part in a jump, a fall or a glide on ice, and cup through a swimming stroke. A hop down a step keeps the stride's hands.
- Holds keep the grip mesh: at once for both pistols, the reload, the orb and Mira's axes; for a ledge, the rope and ivy the open glove reaches, curls closed on arrival and hands over to the grip, and a release eases open from the curled glove. `locomotion.js` exposes each arm's swing.
- Reduced motion (the animator's existing `prefers-reduced-motion` flag) keeps the targets and drops the drift, gestures and impulses.

## Results

| Check                                                                 | Before                                             | After                                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Animation contracts](animation-after/numeric.json)                   | 62 of 62 ([before](animation-before/numeric.json)) | 62 of 62; every value identical except the running hand curl, 0.50 and 0.50 then 0.45 and 0.56 |
| [Finger contract](finger-check.json) ([log](finger-check.log))        | not applicable                                     | 25 of 25                                                                                       |
| [In-game probe](game/game-probe.json), court                          | not applicable                                     | 7 of 7; fit replayed, 967 programs before and after                                            |
| [Wall review](game/walls-review.json), frost axes and castle ivy      | not applicable                                     | 10 of 10; 967 programs through both climbs                                                     |
| [Play-through](playthrough.log), levels 1 to 4 and the forest         | not run                                            | completed, no errors, 967 programs from preparation to the forest                              |
| [Studio probe](studio/studio-probe.json), both explorers, six motions | not applicable                                     | 12 runs, no errors                                                                             |
| Ship check                                                            | not run                                            | 334 modules parse; `gloves-rig.js` flagged as base64 data, as the other explorer data files    |
| Architecture check                                                    | not run                                            | 9 of 9, 161 title modules preloaded                                                            |
| [Animator cost](cost.json), median per frame                          | 0.557 to 0.567 ms, 162 nodes                       | 0.584 to 0.592 ms, 194 nodes; the fingers alone 3 µs for both hands                            |

The finger contract checks that the skinned glove matches the shipped relaxed glove at rest (2e-7 m) and stays within 1.9 mm of the grip mesh fully curled, that the grip mesh keeps its shipped vertices, that clones bind their own bones, that every free finger moves unmatched over the cascade at rest, that drift agrees at 30, 60 and 120 Hz, that reduced motion holds still, that running hands stay between 0.38 and 0.55, that a landing and a hit flex briefly, that pistols, a reload and the orb keep the grip mesh closed on every frame, that a released grip eases open, that the ledge and the rope open the hand before closing it within 0.22 s, that the axes never leave closed fists on ice, that ivy hands open in transit and stay closed on planted holds, and that updates add no nodes, geometry or materials.

## Frames

Each [contact sheet](frames/) shows the after body, then each hand before and after, from the thumb's side; [capture.json](frames/capture.json) records every finger's curl and which mesh shows. The paired close-ups are before on the left and after on the right.

- At rest: [sheet](frames/standing.jpg), [left at 3 s](frames/standing-left-3s.jpg), [right at 6 s](frames/standing-right-6s.jpg); walking: [sheet](frames/walking.jpg); running: [sheet](frames/running.jpg), [left](frames/running-left.jpg).
- A landing: [sheet](frames/landing.jpg), [flex](frames/landing-left-flex.jpg); a hit and a roll: [sheet](frames/hit-roll.jpg); swimming: [sheet](frames/swimming.jpg).
- A ledge catch: [sheet](frames/ledge.jpg), [reaching open](frames/ledge-right-reach.jpg), [holding](frames/ledge-right-hold.jpg); the rope: [sheet](frames/rope.jpg), [reaching](frames/rope-right-reach.jpg), [closing](frames/rope-left-closing.jpg).
- Ice with the axes: [sheet](frames/ice.jpg), [fist on the shaft](frames/ice-right-axe.jpg); ivy: [sheet](frames/ivy.jpg), [between holds](frames/ivy-left-between-holds.jpg).
- Pistols held and aimed: [sheet](frames/pistols.jpg), [aiming](frames/pistols-right-aim.jpg); the reload: [sheet](frames/reload.jpg).
- In play: [standing, left](game/game-standing-left.jpg), [standing, right](game/game-standing-right.jpg), [running](game/game-running-left.jpg), [court hang](game/playthrough-hang.jpg), [frost axes](game/walls-frost-axe-close.jpg), [castle ivy](game/walls-ivy-close.jpg); the studio: [upper body](studio/studio-upper.jpg).

## Limits

- The curled glove differs from the grip mesh by up to 1.9 mm near the knuckles, so the hand-over is not exact; it happens on a moving, nearly closed hand.
- Holds have no tremor; the grip mesh is the shipped one. Hands on a block or a mirror's handles still close at once.
- At the end of a mantle the released hands take the reaching pose until she stands.
- Running down the court's terraces, each drop of a metre loosens the fist and each landing flexes it, between 0.2 and 0.76.
- The in-game Settings box for reduced motion calms the camera only; the fingers follow the system preference, as the body springs do.
- The generator needs the untracked MakeHuman sources of the main checkout. The capture drives gaits, the landing, the ledge and the rope through synthetic hero states, the walls through the explorer's own controller and the pistols through the lab's equipment. Nightly fixed views were not rerun, and no physical device was used.

## Relaxed rest

The owner still found the fingers a little clenched at rest. A free hand now rests half way from the glove's bind pose to the open hand (`CASCADE` in `fingers.js`, from -0.3 for the thumb and -0.52 for the index to -0.28 for the little finger), so the fingers hang in a soft curve instead of a hook; the running fist is unchanged. The landing and hit contract now reads the fingers' own curl, since the lab's clamped `handCurl` stays at zero below the bind pose. Before and after, the bind-pose rest on the left of each frame: [left hand](relaxed/standing-left-3s.jpg), [right hand](relaxed/standing-right-6s.jpg), [standing](relaxed/standing.jpg), [walking](relaxed/walking.jpg). The finger contract passes [25 of 25](relaxed/finger-check.json), the animation contracts 62 of 62, the wall review 10 of 10 and the play-through completes with no error.
