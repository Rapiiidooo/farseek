# Title and loading art

```bash
node receipts/verification-art-direction/source/shot.mjs "receipts/verification-art-direction/source/logo.html#clear" logo.png
magick logo.png -trim +repage logo-trim.png && cwebp -q 86 -alpha_q 100 logo-trim.png -o game/ui/logo.webp
node receipts/verification-art-direction/source/shot.mjs "receipts/verification-art-direction/source/backdrop.html?w=1920&h=1080" worlds.png 1920 1080
cwebp -q 72 worlds.png -o game/ui/worlds-landscape.webp      # and w=1080&h=1920 for worlds-portrait.webp
node scripts/menu-check.mjs <dir> "--url=http://localhost:3002/?nolock=1"
node scripts/touch-check.mjs <dir> --url=http://localhost:3002/
```

The owner asked for the title and the loading screen to carry every world rather than the court's sand and the builders' turquoise alone: a snowy piece, a sandy piece, a forested one. The logo is now a piece of each world in the order of the journey ([render](frames/logo-4.jpg), [first draft](frames/logo-1.jpg)): sandstone with a dune at its foot, the checkpoint's basalt with lilac flora, a dawn isle on golden cloud, ice under snow with icicles, bark climbed by ivy with lime spores, drowned stone under caustics with rising bubbles, and the vault's masonry split by amber light. The loading screen's backdrop sets every world around the gate, clockwise from the court at the lower left to the vault at the lower right, dark under the title ([landscape](frames/backdrop-landscape.jpg), [portrait](frames/backdrop-portrait.jpg)). Both are drawn in the browser from the game's own textures (`source/`), rendered once and shipped as WebP: the logo is 84 kB, the backdrops 21 and 19 kB, each preloaded with the page.

## Results

- In the game: the [loading screen](frames/game-loading.jpg), the [title](frames/game-title.jpg) and a [phone in portrait](frames/phone-loading.jpg).
- The [menu check](menu-check.log) passes 21 of 21 and the [touch check](touch-check.txt) 56 of 56 with the new title.

Not checked: other browsers' rendering of the shipped WebP files beyond Chrome, and how the art reads to the owner on their own screens.
