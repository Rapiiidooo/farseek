import * as THREE from "three";
import { prepareVisuals } from "./shader-preparation.js";
import { t } from "./i18n.js";

export const TIDE_RELIC = "tide-proof";
const PLACEMENTS = [
  [2.1, 26, -56.8, -0.6],
  [-8.4, 24, -88, 0.4],
];

export class TideSketch {
  constructor(archive) {
    this.archive = archive;
    this.services = archive.services;
    this.stations = [];
    this.reset();
  }

  async build() {
    const prototype = await this.archive.assets.make("field_scroll");
    const materials = new Map();
    prototype.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      if (!materials.has(node.material)) {
        const material = node.material.clone();
        material.emissive.setHex(0xe8b05b);
        material.emissiveIntensity = 0.12;
        materials.set(node.material, material);
      }
      node.material = materials.get(node.material);
    });
    for (const [x, y, z, yaw] of PLACEMENTS) {
      const model = prototype.clone(true);
      model.scale.setScalar(1.8);
      model.position.set(x, y + 0.015, z);
      model.rotation.y = yaw;
      this.archive.scene.add(model);
      this.stations.push({
        model,
        center: new THREE.Vector3(x, y + 0.9, z),
        box: {
          minX: x - 0.55,
          maxX: x + 0.55,
          minZ: z - 0.55,
          maxZ: z + 0.55,
          minY: y - 0.2,
          maxY: y + 1.6,
        },
      });
    }
    const [x, y, z, yaw] = PLACEMENTS[1];
    const lid = await this.archive.assets.make("push_block");
    lid.scale.set(0.75, 0.18, 0.85);
    lid.position.set(x, y, z);
    lid.rotation.y = yaw;
    lid.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.material = this.archive.stone;
    });
    this.archive.scene.add(lid);
    const bounds = new THREE.Box3().setFromObject(lid);
    const box = this.archive.world.add(
      bounds.min.x,
      bounds.min.y,
      bounds.min.z,
      bounds.max.x,
      bounds.max.y,
      bounds.max.z,
      "prop",
      null,
      { stand: false, grab: false },
    );
    this.cache = {
      lid,
      home: lid.position.clone(),
      bounds: bounds.clone(),
      box,
    };
    this.refresh();
  }

  get marks() {
    return [1, 2, 4].filter((bit) => this.proof & bit).length;
  }

  get ready() {
    return this.completed && !this.claimed;
  }

  get accessible() {
    return this.ready && this.opening >= 1;
  }

  near(id, distance = 2.2) {
    const station = this.stations[id],
      hero = this.archive.hero;
    return (
      !!station &&
      !!hero &&
      ["ground", "roll"].includes(hero.state) &&
      Math.hypot(hero.pos.x - station.center.x, hero.pos.z - station.center.z) <
        distance &&
      hero.feet > station.box.minY - 0.1 &&
      hero.feet < station.box.maxY
    );
  }

  interactables() {
    if (this.claimed || this.archive.boss.active) return [];
    const id = this.ready ? 1 : 0;
    if (
      !this.stations[id] ||
      (id === 0 && this.archive.ready) ||
      (id === 1 && !this.accessible)
    )
      return [];
    return [
      {
        kind: "use",
        box: this.stations[id].box,
        ref: { use: () => this.use(id) },
        prompt: `relic:${this.ready ? t("Take Mira's tide proof") : t("Read Mira's tide sketch")}`,
      },
    ];
  }

  use(id) {
    if (this.claimed || this.archive.boss.active || !this.near(id))
      return false;
    if (id === 1) {
      if (!this.accessible) return false;
      const fresh = this.services.discoverRelic?.(TIDE_RELIC);
      if (!fresh && !this.services.relicFound?.(TIDE_RELIC)) return false;
      this.claimed = true;
      this.refresh();
      return true;
    }
    if (id !== 0 || this.archive.ready) return false;
    this.inspected = true;
    this.services.hud?.hint(
      t("Mira's tide sketch"),
      t(
        "Vent a cyan mark in each guardian phase, then recover her note after the fight.",
      ),
      8,
    );
    this.refresh();
    return true;
  }

  vent(phase) {
    if (
      !this.inspected ||
      this.claimed ||
      this.completed ||
      ![1, 2, 3].includes(phase)
    )
      return false;
    const bit = 1 << (phase - 1);
    if (this.proof & bit) return false;
    this.proof |= bit;
    return true;
  }

  finish() {
    if (
      !this.inspected ||
      this.proof !== 7 ||
      this.claimed ||
      this.archive.boss.state !== "defeated"
    )
      return false;
    this.completed = true;
    this.services.sound?.play("slide");
    this.services.hud?.subtitle(
      t(
        "The stone beside the last door is moving. Mira left something underneath.",
      ),
      5,
    );
    this.refresh();
    return true;
  }

  update(dt) {
    if (dt <= 0 || !this.completed || this.opening >= 1) return;
    this.opening = Math.min(1, this.opening + dt / 1.8);
    this.refresh();
  }

  resetAttempt() {
    if (this.completed || this.claimed) return;
    this.proof = 0;
  }

  refresh() {
    if (this.stations[0])
      this.stations[0].model.visible = !this.claimed && !this.completed;
    if (this.stations[1])
      this.stations[1].model.visible = this.ready && this.opening > 0.8;
    if (this.cache) {
      const { lid, home, bounds, box } = this.cache;
      const shift = THREE.MathUtils.smoothstep(this.opening, 0, 1) * -1.6;
      lid.position.copy(home);
      lid.position.x += shift;
      box.minX = bounds.min.x + shift;
      box.maxX = bounds.max.x + shift;
    }
  }

  reset() {
    this.claimed = !!this.services.relicFound?.(TIDE_RELIC);
    this.completed = this.claimed;
    this.inspected = this.claimed;
    this.proof = this.claimed ? 7 : 0;
    this.opening = this.claimed ? 1 : 0;
    this.refresh();
  }

  prepareForCompile(on) {
    prepareVisuals(
      this,
      on,
      this.stations.map((station) => [station.model, "visible", true]),
    );
  }

  telemetry() {
    return {
      inspected: this.inspected,
      marks: this.marks,
      proof: this.proof,
      completed: this.completed,
      ready: this.ready,
      claimed: this.claimed,
      opening: this.opening,
      accessible: this.accessible,
      stations: this.stations.map((station) => ({
        at: station.center.toArray(),
        visible: station.model.visible,
      })),
    };
  }
}
