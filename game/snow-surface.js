import { mineralSurface } from "./mineral-surface.js";

export function snowSurface(
  THREE,
  material,
  { tile = 1.1, strength = 0.25 } = {},
) {
  return mineralSurface(THREE, material, {
    tile,
    strength,
    source: new URL("./textures/snow-grain-albedo.webp", import.meta.url).href,
  });
}
