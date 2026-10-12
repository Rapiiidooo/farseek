# Title music

```bash
npm start    # http://localhost:3002/, this checkout
R=receipts/verification-title-music/scripts
node $R/title-render.mjs outputs/title-music [--url=http://localhost:3002/] [--only=title,court] [--part=lead|pads]
node $R/title-probe.mjs <out.json> [http://localhost:3002/ | https://farseek.rapidoai.dev/]
node receipts/verification-mute-start-menu/scripts/mute-probe.mjs <dir>
node receipts/verification-mute-start-menu/scripts/sound-probe.mjs new <out.json> http://localhost:3002/ 1 20
```

The owner found the wind on the main menu horrible and asked for soft music instead. On the public release the title never started the music: the audio context stayed suspended until a menu entry was chosen, then the court's air played alone (dry wind and sand hiss). After Quit to title the court's harp came back with its wind.

## What changed

- `game/sound.js`: a `title` cue plays the journey's tune on a new `piano` voice (a muted strike whose upper partials die first) in D major, 9.6 s bars, over open chords (D add 9, B minor 7, G major 7, A sus 2), with a short echo and a large room. `setTitle(true)` starts it and holds the ambience duck at zero, set outright while the context is suspended, so no wind leaks at the resume; it also clears any danger and the beam hum. `setTitle(false)` lets the world's air fade back in. `music-stems.js` gives the title no percussion, tension or lift.
- `game/app/campaign.js`: the title calls `setTitle(true)`; a start calls `setTitle(false)` before its own cue. Both also call `duck(false)`: the pause menu's 35% duck used to outlive it after Restart level or Quit to title, leaving the game and the title at about a third of their volume until the next pause.
- `game/app/bootstrap.js`: the first press anywhere (a click, a tap or a key) resumes the context, so the tune starts with the first gesture rather than the first menu choice.

## Results

- Offline render through the game's own graph at default settings ([`title-render.mjs`](scripts/title-render.mjs), [results](data/title-render.json)): the title sits at -19.8 LUFS integrated, true peak -6.8 dBTP, against -17.6 LUFS for the court's music, so it is about 2 LU softer than play. The piano carries it and the pads sit 8 dB under it (5.4 dB for the court's harp), measured before the 2 dB trim, which scales both alike ([lead](data/title-render-lead-title-court.json), [pads](data/title-render-pads-title-court.json)). With the music off, the title's world is silent; after `setTitle(false)` the court's air comes back at -25.4 LUFS. A New game after 70 s fades the piano out as the harp and the air come in, with no jump past the court's own level ([windows](data/title-render.json)). Spectrograms: [title](figures/title-spectrum.jpg), [court](figures/court-spectrum.jpg), [New game](figures/new-game-spectrum.jpg); nothing sits above about 2.5 kHz but faint overtones.
- In Chrome with the real autoplay rule ([`title-probe.mjs`](scripts/title-probe.mjs)), [after](data/probe-after.json) and [public release before](data/probe-before-public.json):

| Moment                         | Public release                       | After                                    |
| ------------------------------ | ------------------------------------ | ---------------------------------------- |
| Title, before any gesture      | silent, suspended                    | silent, suspended                        |
| Title, after a click beside it | still suspended                      | piano rising, air silent (-180 dB)       |
| Title, 10 s later              | suspended (wind once a menu is used) | piano at full level, output -25 dBFS RMS |
| Play after New game            | harp and wind                        | harp and wind, piano faded               |
| Paused                         | master 0.21                          | master 0.21                              |
| Play after Restart level       | master stays 0.21                    | master 0.6                               |
| Title after Quit to title      | harp and wind, master 0.21           | piano, air -105 dB, master 0.6           |

- The [mute probe](data/mute-probe.log) passes its 14 checks and a New game logs [no bell](data/bells-new-after.json), play beginning 1.0 s after the click. The ship check (332 modules, 2 pages), the architecture checks and the boot preload check pass.

## Not checked

The owner's ears: whether the piano reads as soft and warm on their speakers and headphones. The renders in `outputs/title-music/` (`title.wav`, `title-120s.mp3`) are local and not committed.
