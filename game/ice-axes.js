import { progress } from "./store.js";

// Mira's ice axes: taken at the foot of the frozen reach's first fall, and owned by any save
// that has reached the wildwood, so older saves keep them without a new field.
export const iceAxes = { taken: false };

export function axesOwned() {
  return iceAxes.taken || progress.reached.has("forest");
}

export function syncAxes(hero) {
  if (hero) hero.axes = axesOwned();
}
