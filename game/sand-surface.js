import { mineralSurface } from "./mineral-surface.js";

export function sandSurface(THREE, material) {
  return mineralSurface(THREE, material, {
    strength: 0.3,
    tile: 2,
    source: new URL("./textures/sand-grain-albedo.webp", import.meta.url).href,
  });
}
