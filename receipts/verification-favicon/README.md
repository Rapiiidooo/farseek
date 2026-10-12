# Favicon

```bash
PORT=3007 node scripts/serve.mjs   # or npm start on 3002
R=receipts/verification-favicon
node $R/sheet.mjs $R/sheet.png "Before=$R/before/favicon.svg" "A tile=$R/candidates/a-tile.svg" "B crescent=$R/candidates/b-crescent.svg" "C door=$R/candidates/c-door.svg" "D notched=$R/candidates/d-notched.svg" "E lenses=$R/candidates/e-lenses.svg"
node $R/icons.mjs   # game/favicon.svg to game/favicon-32.png and game/apple-touch-icon.png
node $R/tab-probe.mjs $R/tab "http://localhost:3007/?nolock=1" 1   # then 2 for a 2x screen
magick identify -regard-warnings game/favicon-32.png game/apple-touch-icon.png
node ../404-game-recipe/harness/ship.mjs game; node scripts/boot-preload.mjs --check
npm run format:check -- game/index.html $R/*.mjs $R/README.md
```

The owner asked for a modern favicon. The [old one](before/favicon.svg) drew a sand ring with a gradient, a glowing membrane, three lenses and a bronze base on a dark rounded square, with a [180 px rendering](before/apple-touch-icon.png) for iOS; at 16 px the lenses and the base blur into the ring (first row of the [sheet](sheet.png)).

## Candidates

Three flat marks in the interface's own colours: `--sand` (#e8cfa4) and `--light` (#39e3d0) from `game/style.css`, on the page's `theme-color` (#140e0a). Each sits on a 64-unit grid with radii in multiples of 4, so at 16 px its rings land on whole pixels.

- [A tile](candidates/a-tile.svg): the door, a ring and its light, on the old dark rounded square.
- [B crescent](candidates/b-crescent.svg): the ring holding a lit crescent, the boldest address glyph, as a round dark medallion.
- [C door](candidates/c-door.svg): the door as a round dark medallion, a thick sand ring, a dark groove and the turquoise light.
- [D notched](candidates/d-notched.svg): C with the ring cut at the three lenses' places.
- [E lenses](candidates/e-lenses.svg): C with the door's three address lenses back on the ring, flat, each ringed in the ground's dark.

[`sheet.png`](sheet.png) renders each in Chrome at 16, 32, 48 and 180 px on Chrome's light (#ffffff) and dark (#202124) tab colours, with 16 and 32 px also magnified 4 and 2 times to show their pixels.

## Choice

E ships. Reviewing C on the merged tree, the round door read as a generic target or record button, with nothing of Farseek's door left; D's cuts read as a peace sign and overran the disc at 180 px. E keeps C's proportions and adds back the one feature every door in the game carries, its three address lenses, so the mark stays the old icon's door, flattened. At 16 px the lenses are turquoise specks on the ring and the door still reads; from 32 px they are clear. What follows was C's reasoning against A and B, which still holds for E.

C was the first choice. Without the square's corners its ring spans 14 of the 16 pixels against 12 for A, and at 16 px it draws a 2 px ring, a 1 px groove and an 8 px light. On a white tab bar the dark rim outlines it (contrast 19.1:1); on a dark one the rim merges and the sand ring makes the edge (10.7:1 against #202124). B's crescent shrinks to a cyan C two pixels thick at 16 px, and the crescent medallion already stands for Relics in the menus (`relics` in `game/app/ui.js`). A's tile shrinks the ring to 12 pixels and leaves a dark square around it on dark tab bars.

## Shipped

| File                        | Format and size      | Content                                                             |
| --------------------------- | -------------------- | ------------------------------------------------------------------- |
| `game/favicon.svg`          | SVG, 430 B           | Flat circles: the disc, the ring, the light and three lenses        |
| `game/favicon-32.png`       | 32×32 RGBA, 1,514 B  | Transparent outside the disc                                        |
| `game/apple-touch-icon.png` | 180×180 RGB, 5,505 B | Opaque; the mark at 144 px on #140e0a, since iOS rounds the corners |

`game/index.html` links the PNG after the SVG (`<link rel="icon" type="image/png" sizes="32x32" href="./favicon-32.png" />`); `theme-color` stays #140e0a, the mark's ground. [`icons.mjs`](icons.mjs) rasterizes the SVG in headless Chrome and writes both PNGs with Node's zlib; a second run gives identical bytes. The asset lab (`character.html`) links the same SVG, and the release packs the whole `game/` folder, so the new PNG ships without a file list.

## Checks

- [`tab-probe.mjs`](tab-probe.mjs) loads the page in Chrome 155 at device scale 1 and 2, rerun on the merged tree with E. Both times Chrome requests only `/favicon.svg`, and its favicon store keeps a [16 px](tab/stored-1x.png) and a [32 px](tab/stored-2x.png) bitmap of the new mark ([scale 1](tab/probe-scale-1.json), [scale 2](tab/probe-scale-2.json)). The PNG serves browsers without SVG icons.
- `scripts/serve.mjs` serves the three files as `image/svg+xml` and `image/png`.
- `magick identify -regard-warnings` decodes both PNGs; sampled pixels match the palette exactly, the touch icon is opaque and the 32 px corners are transparent.
- The ship check, the preload check and the formatter pass (on the merged tree: 337 modules, 2 pages, 162 title modules).

## Not checked

Safari and Firefox tabs, a phone's home screen, Windows display scaling and the owner's eye.
