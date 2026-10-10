# Teaser of the epics round

A 31.6 second teaser cut from the uncommitted working tree on `main` after the epics round, on which `node scripts/nightly.mjs` passed 15 of 15 steps the same night. The live site does not serve these features yet.

```bash
npm start                                           # the game on http://localhost:3002
node scripts/teaser/record.mjs all                  # every take, outputs/teaser/<take>.mp4
node scripts/teaser/titles.mjs                      # captions and the closing card
node scripts/teaser/score.mjs                       # score, game effects and Mira's lines
node scripts/teaser/edit.mjs                        # farseek-teaser.mp4 and the web copy
node scripts/teaser/record.mjs lynx --proof=20      # one shot again, a JPEG proof every 20 frames
```

- **Takes:** `scripts/teaser/shots.mjs` opens each chapter with a seeded `Math.random`, plays its moment with real keys in virtual time (the clock of `scripts/record-trailer.mjs`), and films one frame per sixtieth of a second at 1920x1080. A lens of the shot's own (`scripts/teaser/rig.js`) replaces the follow camera only while the frame renders, so steering, aiming, swimming and the shield still read the game's camera. The lynx's leap plays slower than real time because the game steps less per frame, not by interpolation.
- **Cut:** `scripts/teaser/timeline.mjs` holds every cut, caption, effect and line on a 120 beats a minute grid with the drop at 4.6 s. The edit opens a 2.39:1 letterbox on the drop, flashes white on four hits, sets the captions in the game's faces, grades lightly with grain, and delivers limited range BT.709.
- **Sound:** no external music. The score is synthesized offline in the vault's C minor (drums, low strings, braams, risers, the game's celesta voice) and ends on the door's rising notes in C major. Each game effect plays alone through the game's `Sound` class, is levelled, then placed on its frame; the pistol shots are the game's recording. Mira's recorded lines: `radio-1` through the game's radio chain, `vault-reveal-next` and `reunion-4`. The score ducks under her voice.

| Time         | Shots                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| 0 to 4.6     | Mira's light beside Nyra before the vault's window on space; Nyra walks into the drowned city's door   |
| 4.6 to 12.6  | Rope swing across the isles (two angles), ice axes, castle ivy, the sea current, the isles at dawn     |
| 12.6 to 17.6 | The frost lynx's pounce met by the shield in slow motion, the tether dragging it out, both pistols     |
| 17.6 to 20.6 | Court, isles, frozen reach, wildwood, drowned causeway and city, half a second each                    |
| 21.1 to 27.6 | The two lights meeting in space, the six medallions, the vault door, the next door, Nyra walking to it |
| 27.6 to 31.6 | Title card                                                                                             |

## Results

- `media/teaser/farseek-teaser.mp4`: 31.6 s, H.264 High 1920x1080 at 60 fps, AAC 48 kHz stereo at 256 kb/s, 55.5 MB; integrated loudness -14.1 LUFS, true peak -1.0 dBTP. `media/teaser/farseek-teaser-web.mp4` is the same cut held under 8 Mb/s (25.3 MB); `media/teaser/poster.jpg` is the swing's release.
- Both files decode completely with no error. Every take recorded with no page or console error.
- Not checked: listening on speakers or headphones (only loudness, band balance and timing were measured), and playback on a phone.

## Limits

- The world behind the vault's next door is still the scene of boxes; the teaser shows it only blurred through the door's water.
- The recorder slices `virtualClock` out of `scripts/record-trailer.mjs`; that script's own routes predate the swings and the axes and no longer run end to end.
- Publishing the teaser before the features are deployed would show a game the live URL does not serve.
