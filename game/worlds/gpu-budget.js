import { WORLDS } from "./catalog.js";

// How many worlds stay uploaded on this device. A world holds about 80 MB of geometry and
// textures plus its render targets, whose size follows the quality setting.
const WORLD_MB = 80;
const TARGET_MB = { high: 45, balanced: 20, fast: 10 };
const WINDOWS = { all: WORLDS.length, neighbors: 3, next: 2 };

export function residencyPolicy({
  software = false,
  coarse = false,
  deviceMemory,
  maxTextureSize = 16384,
  quality = "high",
} = {}) {
  // Browsers that do not report memory are assumed typical for their kind of pointer.
  let memory = deviceMemory ?? (coarse ? 4 : 8);
  if (maxTextureSize < 8192) memory = Math.min(memory, 2);
  const budget = Math.round(memory * 1024 * (coarse ? 0.15 : 0.25));
  const perWorld = WORLD_MB + (TARGET_MB[quality] ?? TARGET_MB.high);
  const need = Object.fromEntries(
    Object.entries(WINDOWS).map(([tier, worlds]) => [tier, worlds * perWorld]),
  );
  // Phones and software renderers keep at most the active world and its neighbours.
  const tier =
    !software && !coarse && need.all <= budget
      ? "all"
      : software || need.neighbors <= budget
        ? "neighbors"
        : "next";
  return {
    retainAll: tier === "all",
    keepPrevious: tier !== "next",
    residency: { tier, budget, need },
  };
}
