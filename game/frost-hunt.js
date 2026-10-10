import * as THREE from "three";
import { FrostLynx } from "./frost-lynx.js";
import { Blood } from "./fx.js";
import { damageAmount, recoverHealth } from "./composure.js";
import { equipmentFor } from "./equipment.js";

// Open snow above the frozen pond, between the notch and the stair down to the lake shore: away
// from the frozen falls and the thin ice, and on the route every player crosses.
export const PLATEAU = Object.freeze({
  minX: -9.2,
  maxX: 9.2,
  minZ: -91.1,
  maxZ: -76.4,
  top: 3.8,
});
const COVERS = [
  { x: -4.6, z: -84.6, kind: "spire", yaw: 0.6, scale: 0.85 },
  { x: 5.7, z: -88.6, kind: "boulder", yaw: 0.9, scale: 0.62 },
];
const LAIR = { x: -5.6, z: -86, yaw: 0.6 };
const NOTCH = { x: 3, z: -75.2 };
const RESPAWN = { x: 3, z: -76.7, yaw: Math.PI };
const MAX = 4;

export class FrostHunt {
  constructor(frozen, services) {
    this.frozen = frozen;
    this.services = services;
    this.health = MAX;
    this.said = new Set();
    this.mark = new THREE.Vector3();
  }

  async build() {
    const F = this.frozen;
    this.covers = [];
    for (const c of COVERS)
      if (c.kind === "spire") {
        const box = await F.spire(c.x, c.z, c.yaw, c.scale);
        this.covers.push({ x: c.x, z: c.z, r: box.r });
      } else {
        await F.instanced(
          "boulder_cluster",
          [[c.x, c.z, c.yaw, c.scale]],
          (o, [x, z, yaw, k]) => {
            const ground = F.groundAt(x, z);
            F.world.addRound(x, z, 1.25 * k, -10, ground + 2.2 * k, "prop");
            return [x, ground, z, yaw, k];
          },
          { snowcap: true },
        );
        this.covers.push({ x: c.x, z: c.z, r: 1.25 * c.scale });
      }
    this.covers.push({ x: 8.2, z: -84, r: 0.48 }, { x: -8, z: -80, r: 0.55 });
    const model = await F.assets.make("frost_lynx", { keepHierarchy: true });
    this.blood = new Blood(F.scene, (x, z) => F.groundAt(x, z));
    this.lynx = new FrostLynx(F.scene, F.world, model, {
      lair: { ...LAIR, feet: F.groundAt(LAIR.x, LAIR.z) },
      bounds: PLATEAU,
      covers: this.covers,
      sound: this.services.sound,
      blood: this.blood,
      guarded: (hero) =>
        Math.hypot(hero.pos.x - NOTCH.x, hero.pos.z - NOTCH.z) < 3.4,
    });
    const L = this.lynx;
    L.onWindup = () =>
      this.once("windup", () =>
        this.services.hud?.hint(
          "Frost lynx",
          `It crouches and kicks up snow before it pounces. ${this.services.hud.press("roll", true)} to roll aside, then answer while it lands.`,
          9,
          { queue: true },
        ),
      );
    L.onPulled = (lynx, hidden) => {
      if (hidden)
        this.once("dragged", () =>
          this.services.hud?.subtitle("Out of the snow with you.", 2.5),
        );
    };
    L.onDazed = () =>
      this.once("dazed", () =>
        this.services.hud?.subtitle(
          "Dazzled, not hurt. Now, while it blinks.",
          3,
        ),
      );
    L.onDefeat = () =>
      this.services.hud?.subtitle(
        "It will not hunt this ledge again. On to the lake.",
        4,
      );
  }

  wire({ dust, heroModel }) {
    this.lynx.dust = dust;
    this.heroModel = heroModel;
  }

  onPlateau(hero) {
    return (
      hero.feet > PLATEAU.top - 0.45 &&
      hero.feet < PLATEAU.top + 3 &&
      Math.abs(hero.pos.x) < 10 &&
      hero.pos.z < -74.6 &&
      hero.pos.z > -92.4
    );
  }

  once(key, fn) {
    if (this.said.has(key)) return;
    this.said.add(key);
    fn();
  }

  update(dt, hero, { cinematic = false } = {}) {
    const L = this.lynx;
    if (!L) return;
    const on = this.onPlateau(hero) && !cinematic;
    if (on && !this.met) {
      this.met = true;
      this.services.hud?.subtitle(
        "Fresh tracks, and not Mira's. The orb tugs toward them.",
        4,
      );
      if (this.heroModel) equipmentFor(this.heroModel)?.grant("pull");
    }
    this.grace = Math.max(0, this.grace - dt);
    this.engaged =
      on && L.alive() && this.grace <= 0 && !hero.swimming && this.met;
    L.update(dt, hero, {
      engaged: this.engaged,
      onPounce: (lynx) => this.strike(hero, lynx),
    });
    this.blood.update(dt);
    const hud = this.services.hud;
    this.threat = this.engaged && L.hostile && !L.guarded(hero);
    if (
      recoverHealth(this, dt, {
        max: MAX,
        sound: this.services.sound,
        active: !this.threat,
      }) &&
      this.shown
    )
      hud?.health(this.health, MAX);
    const show = (this.engaged && L.hostile) || this.health < MAX;
    if (show) {
      hud?.health(this.health, MAX);
      this.shown = true;
    } else if (this.shown) {
      hud?.hideHealth();
      this.shown = false;
    }
  }

  strike(hero, lynx) {
    if (!hero.takeHit(lynx.pos.x, lynx.pos.z, 4)) return false;
    this.strikes++;
    this.health -= damageAmount();
    this.services.hud?.health(Math.max(0, this.health), MAX);
    this.shown = true;
    if (this.health <= 0) this.knockout(hero);
    return true;
  }

  knockout(hero) {
    hero.spawn(RESPAWN.x, RESPAWN.z, PLATEAU.top, RESPAWN.yaw);
    hero.invulnerable = 2;
    this.services.sound?.play("respawn");
    this.services.hud?.blackout("The lynx drives you back to the ledge.");
    this.health = MAX;
    this.services.hud?.health(MAX, MAX);
    this.lynx.ground(true);
    this.lynx.goHome();
    this.grace = 3;
    this.onKnockout?.();
  }

  // While the lynx hunts, the objective follows the fight instead of the route.
  guide(hud) {
    const L = this.lynx;
    if (!L || !this.engaged || !L.hostile) {
      if (this.guiding) {
        this.guiding = false;
        this.frozen.guideKey = null;
      }
      return false;
    }
    const s = L.state;
    const sub =
      s === "windup"
        ? "It crouches and kicks up snow: roll aside before it leaps"
        : s === "hidden" || s === "dash"
          ? "Gone to ground. Hold the link on it to drag it into the open"
          : ["land", "stagger", "sprawl", "pulled"].includes(s)
            ? "Off balance: shoot it now"
            : "It circles in the open snow. A pulse dazzles it";
    hud.objective("Frost lynx", sub);
    if (!this.guiding) {
      this.guiding = true;
      hud.setMarkers([() => this.mark.copy(L.head()).setY(L.head().y + 0.4)]);
    }
    return true;
  }

  reset() {
    this.health = MAX;
    this.strikes = 0;
    this.composure = null;
    this.met = false;
    this.engaged = false;
    this.grace = 0;
    this.guiding = false;
    this.shown = false;
    this.said.clear();
    this.blood?.clear();
    this.lynx?.reset();
  }

  telemetry() {
    return {
      met: !!this.met,
      engaged: !!this.engaged,
      health: this.health,
      strikes: this.strikes,
      threat: !!this.threat,
      quiet: +(this.composure?.quiet ?? 0).toFixed(2),
      covers: this.covers?.map((c) => [c.x, c.z, +c.r.toFixed(2)]) ?? [],
      lynx: this.lynx?.telemetry() ?? null,
    };
  }
}
