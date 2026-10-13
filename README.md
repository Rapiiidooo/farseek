# Farseek

[![The first door, dialled with sunlight, opens onto another world](media/farseek-loop.webp)](https://github.com/Rapiiidooo/farseek/releases/tag/jam-entry)

**[Play it in your browser](https://farseek.rapidoai.dev/)** · **[Watch the trailer](https://github.com/Rapiiidooo/farseek/releases/download/jam-entry/farseek-trailer.mp4)** (95 s, 1080p60, or [720p](https://github.com/Rapiiidooo/farseek/releases/download/jam-entry/farseek-trailer-720p.mp4))

A browser adventure in seven levels. Play as Nyra Varen and follow Mira's lost expedition through a sunken desert court, a bureaucratic checkpoint, floating isles and a frozen reach. Redirect sunlight, turn the Wardens' rules against them, cross timed bridges and recover the missing address from the ice.

The campaign continues through the Wildwood, with poisonous spores, broken stepping stones, guarded seals and a castle address puzzle. The Drowned Archive begins with a swim down to a submerged control desk. Activate its air shield, climb onto the dry causeway and cross pressure vents, a timed bridge and a broken stair to the Tide Guardian. Dodge its marked attacks, jump its last phase's wave and channel the charged relay orb into its exposed core to open the final door. Nyra dissolves into a golden light and crosses the gate into space, where Mira's light meets hers before both reach the Builders' Vault, whose six trials end the game.

The public link serves the seven-level game in English, French, Spanish, Chinese and Hindi, with a loading screen that follows each world's preparation, a quick mute, menus that keep to one line, a 3D relic stage and a reflection in every court mirror (release `20261013-e7973643dde5`). The trailer and stills below still show the earlier four-level jam release.

The [world detail film](media/local-tour/quality/world-detail.mp4) presents eight current camera studies across all six worlds. Stone, bark, leaves, litter, snow and sand have calibrated local surface detail; smoother rock, denser foliage and kelp ribbons retain the original world designs. Grounded boar and deer steps and continuous bird flight refine woodland movement. The [quality receipts](receipts/verification-render-quality/README.md) preserve the 22 verified passes, exact source revisions, candidate choices and behavior checks.

Open the [developer gallery](media/local-tour/index.html) to compare sixteen preserved Nyra milestones, from Before and After through After 15. The current dual reload film shows revision eighteen and actual R input in the lab. Each level switches between a 15-second preview and 45 seconds of continuous play. The Wildwood chapter uses the current explorer, terrain and enclosed gate banks; the other chapters, [90-second tour](media/local-tour/farseek-six-levels.mp4) and [extended 4:30 tour](media/local-tour/farseek-six-levels-long.mp4) retain their archived footage. The [gallery review](receipts/verification-gallery-iterations/README.md) records source hashes, browser playback and boundary checks. A [prepared developer host](docs/developer-hosting.md) combines the current game, isolated chapter testing, lab and gallery behind authentication. The [20-second modern warrior comparison](media/local-tour/hero-modern-warrior.mp4) preserves revision nine’s outfit, walk, run and breaststroke beside revision eight, each with its own animation. With the local server running, [the asset lab](http://localhost:3002/labs) opens the current revision eighteen explorer and all 67 asset factories. Direct links use `/labs/<asset-id>`, such as [Nyra](http://localhost:3002/labs/hero_realistic) or [the Far gate](http://localhost:3002/labs/far_gate). Nyra has neutral resting lips, softer brows, denser sculpted arms, an open V neckline and fitted leather boots, plus a bronze crescent with seven small original symbols and varied finishing on a fine linked chain. A continuous neck transition and closed neckline and armhole binding finish her top; [the neck contact review](receipts/verification-necklace-raccord/README.md) records the attachment and garment checks. Her held pistol elbows extend further during idle and walking; [the focused review](receipts/verification-nyra-finish/README.md) records geometry, movement and browser checks. Search or filter the library, orbit and zoom, inspect a mesh, toggle wireframe and bounds, or pause and step a character animation. Equip Nyra with the relay orb or twin pistols. Holstered, In hand and Aim are separate pistol poses that work while idle, moving, paused or stepping; Test shot previews recoil. Explorer versions appear newest first, including the exact submitted Second explorer and original First explorer. Chapter buttons start any of the six levels in an isolated test session. [Capture details](receipts/level-tour/README.md) describe the earlier chapter videos.

The environments and original explorer were produced through the [404 game recipe](https://github.com/404-Repo/404-game-recipe/blob/main/GAME.md) loop; briefs and sheets are in [receipts/candidates](receipts/candidates/). Continued development adds an anatomical explorer with CC0 MakeHuman geometry, skin, hair and facial targets, original clothing and procedural animation. [Asset provenance](receipts/verification-realism/source-audit.md) records the exact sources and licenses. The music and ambient effects are synthesized in the browser. Original Atlas effects provide pistol shots, the dual magazine exchange and ledge grip, pull and landing sounds, with local files and procedural fallbacks. [Audio provenance](game/audio/NOTICE.txt) records the generated sources.

The [12-second gait comparison](receipts/verification-gait-fluid/final-render/walk-run-before-after.mp4) shows the revised walking and running cycle on the same revision eleven character, including braking and restarting. The [latest armed motion comparison](receipts/verification-weapon-motion/iteration-2/weapon-motion-before-after.mp4) shows calmer arm transitions and corrected lateral and backward steps. The [combat correction review](receipts/verification-combat-corrections/README.md) records compact pistols, fitted holsters, stable moving shots and the repaired temple interior. The [studio equipment review](receipts/verification-studio-equipment/README.md) documents the three pistol poses. The [controls and world review](receipts/verification-control-world-polish/README.md) records the wider reload, grounded magazines, sculpted sternum, persistent pace, orb pickup gate, worn masonry, shared textures and mantle contacts.

<p>
<img src="media/screenshots/01-mirrors.jpg" width="49%" alt="Sunlight sent from mirror to mirror towards the gate of the sunken court">
<img src="media/screenshots/02-first-door.jpg" width="49%" alt="The first door open onto the checkpoint's world">
<img src="media/screenshots/03-checkpoint.jpg" width="49%" alt="The checkpoint under a ringed planet">
<img src="media/screenshots/04-far-door.jpg" width="49%" alt="The far door open onto the dawn isles">
<img src="media/screenshots/05-bridge-of-light.jpg" width="49%" alt="A pylon's bridge of light between two isles">
<img src="media/screenshots/06-frozen-stream.jpg" width="49%" alt="Sliding down a frozen stream">
<img src="media/screenshots/07-great-ring.jpg" width="49%" alt="The great ring open onto a wild forest">
<img src="media/screenshots/08-drowned-city.jpg" width="49%" alt="The drowned city beyond the last door">
</p>

The trailer and these stills preserve the entered jam release ([capture details](receipts/trailer/README.md)). Earlier screenshots and character comparisons are in [the expansion receipts](receipts/verification-expansion/README.md). The initial campaign recheck is in [the clean pass report](receipts/verification-clean-pass/README.md), and explorer and deployment tooling checks are in [the visual delivery report](receipts/verification-visual-delivery/README.md). The previous movement and underwater pass is preserved in [its report](receipts/verification-motion-underwater/README.md). The anatomical face is documented in [the realism report](receipts/verification-realism/README.md); the preceding torso, gloves and boots are documented in [the body review](receipts/verification-upper-body/README.md) and [the movement review](receipts/verification-movement-silhouette/README.md). The preceding outfit and animation review is in [the modern warrior report](receipts/verification-modern-warrior/README.md). The preceding lab, equipment and revision ten review is in [the lab and combat report](receipts/verification-lab-combat/README.md). The [asset detail review](receipts/verification-asset-polish/README.md) covers sixty scenery, object and supporting-character models. The [experience review](receipts/verification-experience-polish/README.md) records the preceding gait pass, gentler forest route, damage feedback, underwater shield and space epilogue.

## Run it

```bash
npm install
npm start            # http://localhost:3002
```

The local server compresses text assets with gzip; restart an already running server after changing its script.

Keyboard and mouse, a gamepad, or a touch screen. Movement keys follow the physical layout, so ZQSD works on AZERTY. New games begin walking. Shift toggles running until pressed again, including after stops and pauses; gamepads use R3 and touch uses the Walking or Running badge. On a phone, the stick follows that mode (a light push walks carefully and stops at edges), a drag on the picture looks around, and the buttons show the actions that apply. Escape or the pause button pauses. Controls in the menus rebinds every key, mouse button and gamepad button, and Settings groups the camera options (horizontal inversion, field of view, recentering), subtitle size and backing, high contrast and reduce motion. The game follows the browser's language among English, French, Spanish, Chinese and Hindi, and Settings changes it; Mira speaks each language. On localhost, Test levels opens any chapter without overwriting campaign progress; [the isolated local session](http://localhost:3002/?lab=1) and the asset lab expose those shortcuts. Published menus show only chapters reached in the campaign.

Press Tab or I for the equipment wheel, 1 for the relay orb after its physical pickup and 2 for twin pistols. Left click channels the held orb or fires alternating pistol shots. Right click aims, R reloads thirty-two rounds, sixteen per pistol and Q rolls. With the orb equipped, R also channels light. Charge the orb at a crystal, then link to mechanisms or an exposed guardian core; walls block links and bullets. Traversal holsters weapons. Gamepads use Y for the wheel, the stick and A to equip, RT to act and LB to reload. Touch uses Kit, Link or Fire, with reload in the wheel.

Underwater, hold Space to rise or C to dive, then use E at the shield control desk. A gamepad uses A, B and X; touch shows Rise, Dive and Use. The shield restores ordinary jumping and combat controls.

## Check it

```bash
node scripts/playthrough.mjs outputs/playthrough   # original four levels through playable forest entry
node scripts/forest-check.mjs outputs/forest-check # forest challenges through the sea door
node scripts/sea-check.mjs outputs/sea-check --recovery # swimming, air shield, seals, boss and recovery
node scripts/animation-check.mjs                   # gait, feet, turns, contacts and swimming poses
node scripts/save-check.mjs                        # old saves, six-level completion and relics
node scripts/menu-check.mjs outputs/menu-check     # menus, levels, pause, the ways back, the notes, a knockout
node scripts/touch-check.mjs outputs/touch-check   # the phone controls and layout, with real touch events
node scripts/music-preview.mjs outputs/music-preview   # renders the music offline: loudness, spectrogram, WAV
node scripts/music-preview.mjs outputs/expansion-music --expansion # forest, sea, boss and ending
node ../404-game-recipe/harness/ship.mjs game       # every module parses, nothing escapes the folder
```

The scripts need the local server running, Google Chrome installed and the recipe cloned beside this folder. The 404 jam gate runs from the recipe folder against the live URL with no options: `node harness/jam.mjs https://farseek.rapidoai.dev/ --commit=<sha>`. The play-through verifies shader counts after background preparation settles; `--from=w2`, `--from=w3` or `--from=w4` starts it at the checkpoint, on the isles or in the frozen reach.

## Prepare a release

```bash
npm run release:check
npm run release:build -- HEAD outputs/release
npm run release:verify -- outputs/release "$(git rev-parse HEAD)"
```

Packaging includes only the requested commit's `game/` folder; uncommitted changes are excluded. The [deployment guide](docs/deployment.md) documents the existing manual scripts and the prepared CI for `main`. Automatic publication requires the private workflow, runner and access configuration described there, followed by explicit opt-in. The workflow is prepared locally and has not been activated.
