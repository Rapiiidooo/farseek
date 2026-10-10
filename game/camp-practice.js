import * as THREE from "three";
import { prepareVisuals } from "./shader-preparation.js";

export const PRACTICE_RELIC = "camp-drill";
export const PRACTICE_SECONDS = 12;
export const PRACTICE_LAYOUT = {
  targets: [
    [5.6, 0.9],
    [7, 0.9],
    [8.4, 0.9],
  ],
  note: [3.6, 5.1],
};

export class CampPractice {
  constructor(isles, layout = PRACTICE_LAYOUT) {
    Object.assign(this, { isles, layout, services: isles.services });
    this.stations = [];
    this.hits = new Set();
    this.active = false;
    this.ready = false;
    this.claimed = false;
    this.left = PRACTICE_SECONDS;
    this.time = 0;
  }

  async build() {
    const { assets, scene, world } = this.isles;
    const camp = this.isles.isle("camp").collider;
    const prototype = await assets.make("stamp_plate", { keepHierarchy: true });
    if (!prototype) throw new Error("Camp practice plate is missing");
    for (const [id, [dx, dz]] of this.layout.targets.entries()) {
      const x = camp.x + dx,
        z = camp.z + dz;
      const y = this.isles.groundAt(x, z);
      if (!Number.isFinite(y))
        throw new Error("Camp practice target has no ground");
      const model = prototype.clone(true);
      model.userData.parts = Object.fromEntries(
        Object.entries(prototype.userData.parts ?? {}).map(([name, part]) => [
          name,
          model.getObjectByName(part.name),
        ]),
      );
      const materials = [];
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.material = node.material.clone();
        if (node.material.emissive.getHex() === 0x39e3d0) {
          node.material.emissive.setHex(0xffba54);
          materials.push(node.material);
        }
      });
      model.scale.setScalar(0.65);
      model.rotation.x = Math.PI / 2 - 0.12;
      model.position.set(x, 0, z);
      model.updateMatrixWorld(true);
      model.position.y =
        y - new THREE.Box3().setFromObject(model).min.y + 0.005;
      model.updateMatrixWorld(true);
      const center = new THREE.Vector3(
        ...prototype.userData.field.center,
      ).applyMatrix4(model.matrixWorld);
      const station = { id, model, materials, center };
      station.target = {
        kind: "practice",
        radius: 0.35,
        center: () => center,
        alive: () => this.active && !this.hits.has(id),
        onHit: (hit) => this.strike(id, hit),
      };
      station.collider = world.addRound(
        x,
        z,
        0.24,
        y - 0.02,
        y + 1.2,
        "prop",
        null,
        {
          cam: false,
          thin: true,
        },
      );
      scene.add(model);
      this.stations.push(station);
    }
    const [dx, dz] = this.layout.note;
    const x = camp.x + dx,
      z = camp.z + dz,
      y = this.isles.groundAt(x, z);
    if (!Number.isFinite(y))
      throw new Error("Camp practice note has no ground");
    const model = await assets.make("field_scroll");
    if (!model) throw new Error("Camp practice note is missing");
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.material = node.material.clone();
      node.material.emissive.setHex(0xe8b05b);
      node.material.emissiveIntensity = 0.12;
      node.castShadow = false;
    });
    model.scale.setScalar(1.5);
    model.position.set(x, y + 0.015, z);
    model.rotation.y = -0.4;
    scene.add(model);
    this.note = {
      model,
      center: new THREE.Vector3(x, y + 0.8, z),
      box: {
        minX: x - 0.5,
        maxX: x + 0.5,
        minZ: z - 0.5,
        maxZ: z + 0.5,
        minY: y - 0.2,
        maxY: y + 1.4,
      },
    };
    this.reset();
  }

  atCamp(hero) {
    return (
      !!hero &&
      !hero.swimming &&
      this.isles.grounded(this.isles.isle("camp"), hero)
    );
  }

  nearNote(hero) {
    const at = this.note?.center;
    return (
      this.atCamp(hero) &&
      !!at &&
      Math.hypot(hero.pos.x - at.x, hero.pos.z - at.z) < 2.2
    );
  }

  interactables() {
    if (!this.note || this.claimed || !this.isles.pistolsTaken) return [];
    return [
      {
        kind: "use",
        box: this.note.box,
        ref: { use: () => this.use() },
        prompt: `relic:${this.ready ? "Collect Mira's camp record" : this.active ? "Stop pistol practice" : "Begin pistol practice"}`,
      },
    ];
  }

  use() {
    if (!this.nearNote(this.hero) || this.claimed) return false;
    if (this.ready) {
      const fresh = this.services.discoverRelic?.(PRACTICE_RELIC);
      if (!fresh && !this.services.relicFound?.(PRACTICE_RELIC)) return false;
      this.claimed = true;
      this.refresh();
      this.isles.guideKey = null;
      return true;
    }
    if (this.active) return this.stop();
    if (this.hero.equipment !== "pistols" || !this.hero.weaponActive) {
      this.services.hud?.subtitle(
        "Select Twin pistols in Kit, then begin the drill.",
        4,
      );
      return false;
    }
    this.active = true;
    this.hits.clear();
    this.left = PRACTICE_SECONDS;
    this.guideKey = null;
    this.hintShown = true;
    this.isles.guideKey = null;
    this.services.hud?.clearSubtitle?.();
    this.services.hud?.hint(
      "Pistol practice",
      "Hit each amber plate once within twelve seconds of the first hit.",
      8,
    );
    this.refresh();
    return true;
  }

  stop() {
    this.active = false;
    this.hits.clear();
    this.left = PRACTICE_SECONDS;
    this.guideKey = null;
    this.isles.guideKey = null;
    this.services.hud?.clearHint?.();
    this.refresh();
    return true;
  }

  strike(id, hit) {
    if (
      !this.active ||
      this.ready ||
      this.claimed ||
      this.left <= 0 ||
      this.hits.has(id) ||
      !this.stations.some((s) => s.id === id) ||
      hit?.kind !== "pistol" ||
      this.hero?.equipment !== "pistols" ||
      !this.hero.weaponActive ||
      !this.atCamp(this.hero)
    )
      return false;
    const camp = this.isles.isle("camp").collider;
    if (
      !Number.isFinite(hit.pos?.x) ||
      !Number.isFinite(hit.pos?.y) ||
      !Number.isFinite(hit.pos?.z) ||
      Math.hypot(
        hit.pos.x - this.hero.pos.x,
        hit.pos.y - this.hero.feet - 1.2,
        hit.pos.z - this.hero.pos.z,
      ) > 1.5 ||
      Math.hypot(this.hero.pos.x - camp.x, this.hero.pos.z - camp.z) > 10
    )
      return false;
    this.hits.add(id);
    if (this.hintShown) {
      this.services.hud?.clearHint?.();
      this.hintShown = false;
    }
    this.services.sound?.play("clink");
    if (this.hits.size === this.stations.length) {
      this.ready = true;
      this.active = false;
      this.services.hud?.clearHint?.();
      this.services.hud?.subtitle(
        "Still steady. Mira left her camp record beside the plates.",
        4,
      );
    }
    this.refresh();
    return true;
  }

  update(dt, hero) {
    this.hero = hero;
    if (dt <= 0) return;
    this.time += dt;
    if (this.active && !this.atCamp(hero)) this.stop();
    if (this.active && hero.aiming && this.hintShown) {
      this.services.hud?.clearHint?.();
      this.hintShown = false;
    }
    if (this.active && this.hits.size) {
      this.left = Math.max(0, this.left - dt);
      if (this.left === 0) {
        this.stop();
        this.services.hud?.subtitle(
          "Take your time to aim. Begin again at the camp record.",
          4,
        );
      }
    }
    this.refresh();
  }

  guide(hud) {
    if (
      this.claimed ||
      (!this.active && !this.ready) ||
      !this.atCamp(this.hero)
    )
      return false;
    hud.objective(
      this.ready
        ? "Collect Mira's camp record"
        : "Complete the optional pistol drill",
      this.ready
        ? "The record waits beside the three amber plates"
        : `Plates: ${this.hits.size} of 3 · ${this.hits.size ? `${Math.ceil(this.left)} seconds left` : "The first hit starts the clock"}`,
    );
    const key = `${this.ready}:${[...this.hits].join()}`;
    if (this.guideKey !== key) {
      hud.setMarkers(
        this.ready
          ? [this.note.center]
          : this.stations
              .filter((s) => !this.hits.has(s.id))
              .map((s) => s.center),
      );
      this.guideKey = key;
      this.isles.guideKey = null;
    }
    return true;
  }

  refresh() {
    for (const station of this.stations)
      for (const material of station.materials)
        material.emissiveIntensity = this.hits.has(station.id)
          ? 2.4
          : this.active
            ? 0.9 + Math.sin(this.time * 2.2 + station.id) * 0.12
            : 0.18;
    if (this.note) this.note.model.visible = !this.claimed;
  }

  prepareForCompile(on) {
    prepareVisuals(
      this,
      on,
      this.note ? [[this.note.model, "visible", true]] : [],
    );
  }

  reset() {
    this.active = false;
    this.claimed = !!this.services.relicFound?.(PRACTICE_RELIC);
    this.ready = this.claimed;
    this.hits = new Set(this.claimed ? this.stations.map((s) => s.id) : []);
    this.left = PRACTICE_SECONDS;
    this.time = 0;
    this.guideKey = null;
    this.hintShown = false;
    this.refresh();
  }

  telemetry() {
    return {
      active: this.active,
      ready: this.ready,
      claimed: this.claimed,
      hits: [...this.hits],
      left: this.left,
      targets: this.stations.map((s) => ({ id: s.id, at: s.center.toArray() })),
      note: this.note?.center.toArray(),
    };
  }
}
