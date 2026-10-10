import * as THREE from "three";
import { t } from "./i18n.js";

export const TRAIL_RELIC = "winter-crossing";
const CAIRNS = [
  [4.2, -100.2],
  [2.8, -139.8],
];

export class IceTrail {
  constructor(frozen) {
    this.frozen = frozen;
    this.services = frozen.services;
    this.stations = [];
    this.marker = new THREE.Vector3();
    this.reset();
  }

  build() {
    const cairns = CAIRNS.map(([x, z]) =>
      this.frozen.cairns.find((c) => c.x === x && c.z === z),
    );
    if (cairns.some((c) => !c)) return;
    for (const cairn of cairns) {
      const { x, z } = cairn;
      const materials = new Map();
      cairn.model.traverse((node) => {
        if (!node.isMesh || node.material.name !== "fabric") return;
        if (!materials.has(node.material)) {
          const material = node.material.clone();
          material.emissive.setHex(0xffb45d);
          materials.set(node.material, material);
        }
        node.material = materials.get(node.material);
      });
      this.stations.push({
        ...cairn,
        materials: [...materials.values()],
        center: new THREE.Vector3(x, cairn.model.position.y + 1.3, z),
        useBox: {
          minX: x - 0.5,
          maxX: x + 0.5,
          minZ: z - 0.5,
          maxZ: z + 0.5,
          minY: cairn.model.position.y - 0.2,
          maxY: cairn.model.position.y + 1.6,
        },
      });
    }
    this.refresh();
  }

  get available() {
    return this.stations.length === 2 && !this.claimed;
  }

  get ready() {
    return this.completed && !this.claimed;
  }

  get recovering() {
    return this.frozen.thin.some((t) => !t.box.solid || t.phase !== "still");
  }

  near(station, hero = this.hero) {
    return (
      !!hero &&
      ["ground", "roll"].includes(hero.state) &&
      Math.hypot(hero.pos.x - station.x, hero.pos.z - station.z) < 2.2 &&
      hero.feet > station.useBox.minY - 0.1 &&
      hero.feet < station.useBox.maxY
    );
  }

  interactables() {
    if (!this.available) return [];
    const id = this.ready ? 1 : 0;
    return [
      {
        kind: "use",
        box: this.stations[id].useBox,
        ref: { use: () => this.use(id) },
        prompt: `relic:${this.ready ? t("Collect Mira's winter crossing") : this.active ? t("Stop cairn trail") : this.recovering ? t("Cairn trail is refreezing") : t("Begin cairn trail")}`,
      },
    ];
  }

  use(id) {
    if (!this.available || !this.stations[id] || !this.near(this.stations[id]))
      return false;
    if (this.ready) {
      if (id !== 1) return false;
      const fresh = this.services.discoverRelic?.(TRAIL_RELIC);
      if (!fresh && !this.services.relicFound?.(TRAIL_RELIC)) return false;
      this.claimed = true;
      this.frozen.guideKey = null;
      this.refresh();
      return true;
    }
    if (id !== 0) return false;
    if (this.active) {
      this.stop(t("The trail is stopped. Begin again at this cairn."));
      return true;
    }
    if (this.recovering) {
      this.services.hud?.subtitle(
        t("Let every sheet freeze before beginning another crossing."),
        3,
      );
      return false;
    }
    this.active = true;
    this.passed = 0;
    this.frozen.guideKey = null;
    this.services.hud?.subtitle(
      t("Run each ice sheet, then jump both floes without falling."),
      5,
    );
    this.refresh();
    return true;
  }

  stop(text = null) {
    if (!this.active) return false;
    this.active = false;
    this.passed = 0;
    this.frozen.guideKey = null;
    if (text) this.services.hud?.subtitle(text, 4);
    this.refresh();
    return true;
  }

  fail() {
    return this.stop(
      t("The crossing broke. Start another attempt at the shore cairn."),
    );
  }

  update(dt, hero) {
    this.hero = hero;
    if (dt <= 0) return;
    this.time += dt;
    if (!this.active) return;
    if (hero.feet < -1.5 || hero.pos.z > -98 || hero.pos.z < -141) {
      this.fail();
      return;
    }
    const { thin, floes } = this.frozen;
    if (this.passed < thin.length) {
      const ice = thin[this.passed],
        b = ice.box;
      if (
        b.solid &&
        ["still", "crack"].includes(ice.phase) &&
        ["ground", "roll"].includes(hero.state) &&
        Math.abs(hero.feet - b.maxY) < 0.08 &&
        hero.pos.x > b.minX - 0.15 &&
        hero.pos.x < b.maxX + 0.15 &&
        hero.pos.z > b.minZ - 0.15 &&
        hero.pos.z < b.maxZ + 0.15
      )
        this.passed++;
    } else if (this.passed < thin.length + floes.length) {
      if (this.frozen.onFloe(floes[this.passed - thin.length], hero))
        this.passed++;
    } else if (
      ["ground", "roll"].includes(hero.state) &&
      Math.abs(hero.feet - 0.6) < 0.08 &&
      hero.pos.z < -134.4 &&
      Math.abs(
        this.frozen.world.ground(
          hero.pos.x,
          hero.pos.z,
          0.192,
          hero.feet,
          0.1,
        ) - 0.6,
      ) < 0.08
    ) {
      this.active = false;
      this.completed = true;
      this.frozen.guideKey = null;
      this.services.sound?.play("chime");
      this.services.hud?.subtitle(
        t(
          "A clean crossing. Mira's record waits at the red cairn on this shore.",
        ),
        4,
      );
    }
    this.refresh();
  }

  guiding(hero) {
    return (
      this.available &&
      (this.active ||
        (this.ready &&
          hero.pos.z < -134.4 &&
          Math.hypot(
            hero.pos.x - this.stations[1].x,
            hero.pos.z - this.stations[1].z,
          ) < 6))
    );
  }

  guide(hud, hero) {
    if (!this.guiding(hero)) return false;
    const { thin, floes } = this.frozen;
    const surface =
      this.passed < thin.length
        ? thin[this.passed]
        : floes[this.passed - thin.length];
    const b = surface?.box;
    if (b)
      this.marker.set(
        (b.minX + b.maxX) / 2,
        b.maxY + 1.1,
        (b.minZ + b.maxZ) / 2,
      );
    else this.marker.copy(this.stations[1].center);
    hud.objective(
      this.ready
        ? t("Collect Mira's winter crossing")
        : t("Follow the optional cairn trail"),
      this.ready
        ? t("Read the record at the island's red ribbon cairn")
        : this.passed < thin.length
          ? t(
              "Ice sheets: {done} of {total} · Touch each sheet before it breaks",
              { done: this.passed, total: thin.length },
            )
          : this.passed < thin.length + floes.length
            ? t("Floes: {done} of {total} · Wait for safe jumps", {
                done: this.passed - thin.length,
                total: floes.length,
              })
            : t("Land safely on the island to finish the crossing"),
    );
    hud.setMarkers([this.marker]);
    return true;
  }

  refresh() {
    for (const [id, station] of this.stations.entries())
      for (const material of station.materials)
        material.emissiveIntensity = this.claimed
          ? 0
          : this.ready && id === 1
            ? 1.5
            : this.active && id === 0
              ? 0.8 + Math.sin(this.time * 2.2) * 0.12
              : 0.12;
  }

  reset() {
    this.active = false;
    this.claimed = !!this.services.relicFound?.(TRAIL_RELIC);
    this.completed = this.claimed;
    this.passed = this.claimed ? 6 : 0;
    this.time = 0;
    this.frozen.guideKey = null;
    this.refresh();
  }

  telemetry() {
    return {
      active: this.active,
      ready: this.ready,
      claimed: this.claimed,
      passed: this.passed,
      stations: this.stations.map((s) => ({ at: s.center.toArray() })),
    };
  }
}
