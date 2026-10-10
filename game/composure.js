import { tuning } from "./combat-tuning.js";

/** Refills one pip at a time after an unbroken quiet spell out of a fight; true when one returns. */
export function recoverHealth(
  owner,
  dt,
  { max = 4, sound = null, active = true } = {},
) {
  const state = (owner.composure ??= { quiet: 0, wait: 0, last: owner.health });
  if (owner.health < state.last) state.quiet = state.wait = 0;
  state.last = owner.health;
  if (!active || owner.health <= 0 || owner.health >= max) {
    state.wait = 0;
    if (!active || owner.health >= max) state.quiet = 0;
    return false;
  }
  state.quiet += dt;
  const { recoveryDelay, recoveryStep } = tuning();
  if (state.quiet < recoveryDelay) return false;
  state.wait -= dt;
  if (state.wait > 0) return false;
  state.wait = recoveryStep;
  owner.health = Math.min(max, Math.floor(owner.health) + 1);
  state.last = owner.health;
  sound?.play("heal");
  return true;
}

/** True while a hostile foe stands within reach: composure returns only out of a fight. */
export function threatened(hero, foes, range = 14) {
  return foes.some(
    (foe) =>
      foe.hostile &&
      !foe.defeated &&
      Math.hypot(hero.pos.x - foe.pos.x, hero.pos.z - foe.pos.z) < range,
  );
}

/** A hit scaled by the difficulty: pips are spent in halves on Story and Hard. */
export function damageAmount(base = 1) {
  return base * tuning().damage;
}
