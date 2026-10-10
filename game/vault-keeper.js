import * as THREE from "three";
import { Warden, fallbackWarden } from "./wardens.js";
import { Telegraphs } from "./fx.js";
import { BAYS, buildSeal } from "./vault.js";
import { crystalWell } from "./vault-crystal.js";
import { t } from "./i18n.js";

// The checkpoint's bay: an elder Warden of the builders keeps the seal and stamps anyone who
// comes near. The seal answers only while its keeper's eye is dark: charge the orb at the
// crystal and stun the keeper with a charged pulse, turn its stamp aside with the relay's
// shield so it reels, or send it on its break with the pistols, then press the seal.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BAY = BAYS[1];
export const KEEPER = {
  post: { x: 24.5, z: -12, yaw: -Math.PI / 2 },
  seal: { x: 31.2, z: -12, yaw: -Math.PI / 2 },
  crystal: { x: 12.4, z: -6.0 },
  alarm: 8.5,
  // Seconds a turned stamp leaves the keeper reeling.
  reel: 3,
  scale: 1.3,
};

// The builders' own construct: sandstone where the checkpoint's clerks are chalk, basalt for
// their ochre, with the mask, stamp and eye of the Wardens.
function elder(model) {
  const swap = new Map([
    [0xc9c2d8, 0xb98a5e],
    [0xd9a441, 0x3a3531],
  ]);
  model.traverse((o) => {
    if (!o.isMesh || !o.material?.color) return;
    for (const [from, to] of swap)
      if (Math.abs(o.material.color.getHex() - from) < 0x040404) {
        o.material = o.material.clone();
        o.material.color.setHex(to);
      }
  });
  model.scale.setScalar(KEEPER.scale);
  return model;
}

export class KeeperTrial {
  constructor(vault) {
    this.vault = vault;
    this.bay = BAY;
    this.id = BAY.id;
    this.done = false;
    this.time = 0;
    this.quietUntil = 0;
  }

  async build() {
    const { vault } = this;
    const { scene, world, assets } = vault;
    const m = vault.mat,
      S = vault.masonry;
    const area = `bay ${BAY.id}`;
    S.block(area, 9, -2, BAY.z0, 33, 0, BAY.z1, m.base, m.night, {
      plain: true,
    });
    // A raised basalt dais under the seal, one low step.
    S.block(area, 28.6, 0, -16, 33, 0.3, -8, m.basalt, m.nightWall, {
      grab: false,
    });
    this.well = await crystalWell(vault, KEEPER.crystal.x, 0, KEEPER.crystal.z);
    this.seal = await buildSeal(vault, BAY, { ...KEEPER.seal, floor: 0.3 });
    const model =
      (await assets.make("warden", { keepHierarchy: true })) ||
      fallbackWarden();
    this.keeper = new Warden(scene, world, elder(model), {
      x: KEEPER.post.x,
      z: KEEPER.post.z,
      yaw: KEEPER.post.yaw,
      bubbles: vault.services.bubbles,
      sound: vault.services.sound,
      combatStyle: "keeper",
      glyph: BAY.glyph,
      route: [[KEEPER.post.x, KEEPER.post.z]],
    });
    this.keeper.home.yaw = KEEPER.post.yaw;
    this.telegraphs = new Telegraphs(scene, 1);
    this.keeper.onTelegraph = (w, at) => {
      if (!at) return this.telegraphs.hide(w);
      this.telegraphs.show(
        w,
        at.x,
        this.vault.world.ground(at.x, at.z, 0.05, 2, 0.4),
        at.z,
        "ground",
      );
      const slot = this.telegraphs.items.find((s) => s.owner === w);
      slot?.m.scale.setScalar(w.stampRadius / 0.9);
    };
    this.keeper.onStunned = () => this.onStun?.();
    this.keeper.onBreak = () => this.onStun?.();
    for (const [x, z, s] of [
      [31.6, -18.4, 1.1],
      [31.4, -5.6, 0.9],
      [10.6, -18.6, 1],
      [20, -18.8, 0.8],
    ]) {
      const plant = await assets.make("lumen_plant", { keepHierarchy: true });
      if (!plant) continue;
      plant.position.set(x, 0, z);
      plant.scale.setScalar(s);
      scene.add(plant);
      world.addRound(x, z, 0.35 * s, 0, 1.1 * s, "prop");
    }
    // The keeper still keeps a queue to its seal, as the checkpoint's clerks do.
    for (const [x, z] of [
      [21.5, -15.4],
      [25, -15.4],
      [21.5, -8.6],
      [25, -8.6],
    ]) {
      const post = await assets.make("queue_post");
      if (!post) continue;
      post.position.set(x + 0.587, 0, z);
      scene.add(post);
      world.addRound(x, z, 0.22, 0, 1.1, "prop", null, { thin: true });
    }
    this.glow = new THREE.PointLight(0xb69cff, 7, 16, 1.6);
    this.glow.position.set(26, 4.5, -12);
    scene.add(this.glow);
  }

  // Its eye takes a moment to light again after a stun or a break.
  // A stamp turned aside by the shield leaves the keeper reeling, its eye dark for a moment.
  reel() {
    const k = this.keeper;
    k.state = "stun";
    k.stunTime = KEEPER.reel;
    k.t = 0;
    k.target = null;
    k.attacksRemaining = 0;
    k.onTelegraph?.(k, null);
    this.vault.services.sound?.play("warden-hit");
    this.parried = (this.parried ?? 0) + 1;
    this.onStun?.();
  }

  get quiet() {
    return (
      ["stun", "break"].includes(this.keeper.state) ||
      this.time < this.quietUntil
    );
  }

  orbTargets() {
    return [this.well.target];
  }

  orbBeams() {
    return [this.well.beam];
  }

  combatTargets() {
    return this.done ? [] : [this.keeper];
  }

  interactables() {
    if (this.done) return [];
    return [
      {
        kind: "use",
        box: this.seal.box,
        ref: this,
        prompt: `relic:${t("Press the keeper's seal")}`,
      },
    ];
  }

  use() {
    if (this.done) return false;
    if (!this.quiet) {
      this.vault.services.sound?.play("clink");
      this.vault.services.hud?.subtitle(
        t("It will not answer while the keeper's eye is on it."),
        3,
      );
      this.keeper.provoke();
      return false;
    }
    this.done = true;
    this.seal.light();
    this.vault.services.sound?.play("plate");
    this.onDone?.(this);
    return true;
  }

  update(dt, hero, { camera, playable }) {
    const k = this.keeper;
    this.time += dt;
    if (["stun", "break"].includes(k.state)) this.quietUntil = this.time + 1.5;
    const inside =
      hero.pos.x > 9.4 && hero.pos.z > BAY.z0 && hero.pos.z < BAY.z1;
    const near = Math.hypot(hero.pos.x - k.pos.x, hero.pos.z - k.pos.z);
    if (
      playable &&
      !this.done &&
      inside &&
      near < KEEPER.alarm &&
      k.state === "patrol"
    )
      k.provoke();
    // Leaving the bay ends the chase; the keeper goes back to its post.
    if (!inside && k.hostile) k.calm(null);
    if (this.done && k.hostile) k.calm(null);
    const onSlam = (w, x, z, hit) => {
      if (!hit) return "ground";
      const turned = hero.shield?.deflected ?? 0;
      this.vault.hurt(x, z, 4.5);
      if ((hero.shield?.deflected ?? 0) > turned) this.reel();
      return "hit";
    };
    if (playable) k.update(dt, hero, [k], { onSlam, camera });
    this.telegraphs.update(dt);
    this.well.update(dt);
    if (!this.done)
      this.vault.hall.setMedallion(this.seal.medal, this.quiet ? 0.45 : 0);
  }

  guide(hero, disc) {
    if (this.quiet)
      return {
        title: t("Quiet the keeper"),
        sub: t("Its eye is dark: run to the seal and press it"),
        point: this.seal.center,
      };
    if (!disc?.charged)
      return {
        title: t("Quiet the keeper"),
        sub: t(
          "Turn its stamp aside with the shield, or charge the orb at the crystal",
        ),
        point: this.well.center,
      };
    return {
      title: t("Quiet the keeper"),
      sub: t("Pulse the keeper with the charged orb to stun it"),
      point: V(this.keeper.pos.x, 2.6, this.keeper.pos.z),
    };
  }

  hint(hud) {
    return [
      BAY.title,
      t(
        "The seal answers only while its keeper is stunned. Raise the shield with {shield} as it stamps and it reels, or link to the crystal with {throw} and pulse it with the charged orb. Three pistol hits also send it on its break.",
        { shield: hud.k("shield"), throw: hud.k("throw") },
      ),
    ];
  }

  reset() {
    this.done = false;
    this.quietUntil = 0;
    this.parried = 0;
    this.keeper.reset();
    this.telegraphs.clear();
    this.seal.light(false);
  }

  solve() {
    this.done = true;
    this.seal.light();
  }

  telemetry() {
    const k = this.keeper;
    return {
      done: this.done,
      keeper: {
        state: k.state,
        hostile: k.hostile,
        hp: k.hp,
        pos: [+k.pos.x.toFixed(2), +k.pos.z.toFixed(2)],
        center: k.center().toArray(),
      },
      quiet: this.quiet,
      parried: this.parried ?? 0,
      crystal: this.well.center.toArray(),
      seal: this.seal.center.toArray(),
    };
  }
}
