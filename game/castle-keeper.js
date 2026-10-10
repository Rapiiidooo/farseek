import { Warden } from "./wardens.js";
import { tuning } from "./combat-tuning.js";

export const KEEPER_HEALTH = 6;
export const KEEPER_CADENCES = Object.freeze({
  single: 1,
  paired: 2,
  triple: 3,
});

export class CastleKeeper extends Warden {
  constructor(scene, world, model, options) {
    super(scene, world, model, {
      ...options,
      combatStyle: "keeper",
      glyph: "crescent",
    });
    this.boss = true;
    this.maxHp = KEEPER_HEALTH;
    this.hp = this.maxHp;
    this.cadence = Object.hasOwn(KEEPER_CADENCES, options.cadence)
      ? options.cadence
      : "paired";
    this.windowDamage = 0;
    this.hitCooldown = 0;
    this.blockCooldown = 0;
    this.phaseAnnounced = false;
    this.combat = this.profile();
    this.windupDuration = this.combat.windup;
  }

  get phaseNumber() {
    return this.hp > this.maxHp / 2 ? 1 : 2;
  }

  profile() {
    const phase = this.phaseNumber;
    return {
      speed: phase === 1 ? 1.8 : 2.05,
      reach: 2.05,
      radius: phase === 1 ? 1.7 : 1.85,
      windup: phase === 1 ? 1.35 : 1.15,
      followup: phase === 1 ? 1.05 : 0.95,
      recovery: phase === 1 ? 2.2 : 2.1,
      stamps: Math.min(3, KEEPER_CADENCES[this.cadence] + phase - 1),
    };
  }

  get counterOpen() {
    return (
      !this.defeated &&
      this.hp > 0 &&
      this.state === "recover" &&
      this.windowDamage < 3
    );
  }

  windUp(hero, followup = false) {
    if (!followup) this.combat = this.profile();
    super.windUp(hero, followup);
  }

  onHit(hit) {
    if (!this.alive() || this.defeated || this.hp <= 0) return false;
    if (hit?.kind === "orb" && hit.charged && !this.counterOpen) {
      hit.spend?.();
      this.state = "recover";
      this.recoveryTime = this.combat.recovery * tuning().stun;
      this.t = 0;
      this.windowDamage = 0;
      this.target = null;
      this.attacksRemaining = 0;
      this.onTelegraph?.(this, null);
      this.sound?.play("warden-hit");
      return true;
    }
    if (!this.counterOpen || hit?.kind !== "pistol") {
      if (!this.hostile) this.provoke("");
      if (this.blockCooldown === 0) {
        this.sound?.play("clink");
        this.onBlocked?.();
        this.blockCooldown = 0.75;
      }
      return false;
    }
    if (this.hitCooldown > 0) return false;
    this.windowDamage += 1;
    this.hp -= 1;
    this.hitCooldown = 0.12;
    this.sound?.play("warden-hit");
    if (this.hp === 0) {
      this.state = "break";
      this.t = 0;
      this.target = null;
      this.attacksRemaining = 0;
      this.onTelegraph?.(this, null);
      this.sound?.play("warden-down");
      this.onBreak?.(this);
    } else if (this.phaseNumber === 2 && !this.phaseAnnounced) {
      this.phaseAnnounced = true;
      this.onPhase?.();
    }
    return true;
  }

  update(dt, hero, others, context) {
    if (dt <= 0) return;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.blockCooldown = Math.max(0, this.blockCooldown - dt);
    const previous = this.state;
    super.update(dt, hero, others, context);
    if (previous !== "recover" && this.state === "recover")
      this.windowDamage = 0;
    if (this.tag) {
      this.tag.position.y = this.feet + 2.05;
      for (const material of [this.tagMat, this.glyphMat]) {
        material.emissive.setHex(this.counterOpen ? 0x39e3d0 : 0xffb24a);
        material.emissiveIntensity =
          this.defeated || this.hp <= 0 ? 0.2 : this.counterOpen ? 2.8 : 1.8;
      }
    }
    if (this.telegraph?.visible)
      this.telegraph.material.opacity =
        0.45 + 0.3 * Math.min(1, this.t / this.windupDuration);
  }

  animate(dt, speed) {
    super.animate(dt, speed);
    for (const material of this.eye) {
      material.emissive.setHex(this.counterOpen ? 0x39e3d0 : 0xffb24a);
      material.emissiveIntensity =
        this.defeated || this.hp <= 0
          ? 0.2
          : this.counterOpen
            ? 2.6
            : this.state === "windup"
              ? 3.2
              : 1.4;
    }
  }

  reset() {
    super.reset();
    this.hp = this.maxHp;
    this.windowDamage = 0;
    this.hitCooldown = 0;
    this.blockCooldown = 0;
    this.phaseAnnounced = false;
    this.combat = this.profile();
    this.windupDuration = this.combat.windup;
  }
}
