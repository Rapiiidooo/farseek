import { settings } from "./store.js";

// Read at each windup, hit and breath rather than cached, so a settings change applies live;
// Standard keeps the original timings exactly.
export const DIFFICULTIES = Object.freeze({
  story: Object.freeze({
    damage: 0.5,
    windup: 1.35,
    speed: 0.85,
    stun: 1.3,
    opening: 1.3,
    coreWindow: 1.3,
    breath: 1.5,
    recoveryDelay: 3,
    recoveryStep: 1.2,
  }),
  standard: Object.freeze({
    damage: 1,
    windup: 1,
    speed: 1,
    stun: 1,
    opening: 1,
    coreWindow: 1,
    breath: 1,
    recoveryDelay: 5,
    recoveryStep: 2,
  }),
  hard: Object.freeze({
    damage: 1.5,
    windup: 0.8,
    speed: 1.1,
    stun: 0.8,
    opening: 0.8,
    coreWindow: 0.8,
    breath: 0.75,
    recoveryDelay: 9,
    recoveryStep: 3.5,
  }),
});

export function difficulty() {
  return Object.hasOwn(DIFFICULTIES, settings.difficulty)
    ? settings.difficulty
    : "standard";
}

export function tuning() {
  return DIFFICULTIES[difficulty()];
}
