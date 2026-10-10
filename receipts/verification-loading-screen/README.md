# Loading screen

```bash
PORT=3012 npm start
node receipts/verification-loading-screen/scripts/probe.mjs <name> [--phone] [--url=http://localhost:3012/]
node receipts/verification-loading-screen/scripts/screencast.mjs <name>      # the bar read from compositor frames
node receipts/verification-loading-screen/scripts/failure.mjs                # game code and world failures, then Try again
node scripts/architecture-check.mjs <dir>
node scripts/nightly.mjs --only=modules,architecture,save,views,hitch,markers,menu,touch,starts
```

The bar now follows the work it stands for. The first load eases through the court's carving and lighting; a start lists the worlds it must prepare (`WorldManager.toPrepare`), weighs each by its usual preparation time, and moves as each one's preparation begins and ends, naming it when the player has reached it ("Preparing the Wildwood…", otherwise "Preparing the worlds ahead…"). Each stage is a CSS transition that the compositor keeps playing while preparation blocks the page, and stops short of its end until the stage is done; the bar never runs backwards and reaches its end before the screen fades. Marks for the worlds already reached show which are ready and which one is being prepared, each in its world's colour; the screen never tells how many worlds lie ahead. The logo, the bar's band and the ring take every world's colour. A tip names a control for the device in use when a start lasts. The screen paints before the first preparation step, and its card never moves when a line appears. A failure turns the bar vermilion where it stopped, with the existing Try again.

## Results

- [Before](baseline.json) ([frame](frames/before-new-game.jpg)): New game started the bar at 100%, then moved it backwards 79 times as two sources wrote 70% and 75 to 100% in turn, and said "Ready." at 70%; the first load's bar stood still for 1.5 s.
- [After](after.json): no backward move in either load; the largest step is 5.8% and the longest stillness seen by the page 0.7 s, during a main thread block. [Read from compositor frames](screencast.json), the bar keeps moving through those blocks ([court](frames/initial-court.jpg), [isles](frames/new-game-isles.jpg), [tip](frames/new-game-tip.jpg)); only the overlay's fade reads as backward steps there. Frames stop for up to 0.26 s while the GPU compiles a world's shaders, which no page animation can cover.
- [Failures](failure.json): a blocked game module and a blocked world module both show the failed bar and Try again ([frame](frames/failed.jpg)), and both recover to the title and to play.
- [Phone](phone.json) ([frame](frames/phone-ready.jpg)): no backward move; worlds outside the phone's resident window keep the small "later" mark.
- `scripts/architecture-check.mjs` adds a check that a start's list matches what settling prepares. The [nightly steps](nightly.json) touched by starts and overlays pass 9 of 9.

Not changed: how long a start takes. New game still prepares every world the title has not (the start window in [the follow-up task](../../tasks/epics-round-followups.md)).
