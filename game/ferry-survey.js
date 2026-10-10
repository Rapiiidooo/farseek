import * as THREE from "three";

export const SURVEY_RELIC = "dawn-survey";
export const SURVEY_LAYOUT = {
  near: { isle: "ledge", dx: -2.8, dz: -2.5, scale: 0.85 },
  far: { isle: "far", dx: -2.5, dz: 2, scale: 0.85 },
  crystal: { isle: "ledge", dx: 2, dz: -2.4, scale: 0.65 },
};
const AMBER = 0xffba54;

export class FerrySurvey {
  constructor(isles, layout = SURVEY_LAYOUT) {
    Object.assign(this, { isles, layout, services: isles.services });
    this.stations = [];
    this.lit = new Set();
    this.active = false;
    this.claimed = false;
    this.time = 0;
    this.noticeAt = -99;
  }

  async build() {
    const { assets, scene, world } = this.isles;
    for (const id of ["near", "far"]) {
      const spot = this.layout[id];
      const c = this.isles.isle(spot.isle).collider;
      const x = c.x + spot.dx,
        z = c.z + spot.dz;
      const y = this.isles.groundAt(x, z);
      if (!Number.isFinite(y)) throw new Error("Survey station has no ground");
      const model = await assets.make("light_pylon", { keepHierarchy: true });
      if (!model) throw new Error("Survey station asset is missing");
      model.position.set(x, y, z);
      model.scale.multiplyScalar(spot.scale);
      model.rotation.y = Math.atan2(12 - x, -118 - z);
      model.updateMatrixWorld(true);
      const materials = [];
      for (const name of ["lens", "slot"])
        model.userData.parts?.[name]?.traverse((node) => {
          if (!node.isMesh) return;
          node.material = node.material.clone();
          node.material.color.setHex(0x805c25);
          node.material.emissive.setHex(AMBER);
          materials.push(node.material);
        });
      const center = new THREE.Vector3(
        ...model.userData.lens.center,
      ).applyMatrix4(model.matrixWorld);
      const station = {
        id,
        model,
        materials,
        center,
        box: {
          minX: x - 0.65,
          maxX: x + 0.65,
          minZ: z - 0.65,
          maxZ: z + 0.65,
          minY: y - 0.2,
          maxY: y + 1.8,
        },
      };
      station.target = {
        radius: Math.max(0.35, model.userData.lens.radius * spot.scale + 0.12),
        center: () => center,
        alive: () => this.active && !this.claimed && !this.lit.has(id),
        onHit: (disc) => this.strike(id, disc),
      };
      world.addRound(
        x,
        z,
        0.62 * spot.scale,
        y - 1,
        y + 2.4 * spot.scale,
        "prop",
      );
      scene.add(model);
      this.stations.push(station);
    }
    const spot = this.layout.crystal,
      c = this.isles.isle(spot.isle).collider;
    const x = c.x + spot.dx,
      z = c.z + spot.dz,
      y = this.isles.groundAt(x, z);
    if (!Number.isFinite(y)) throw new Error("Survey crystal has no ground");
    const model = await assets.make("crystal_emitter", { keepHierarchy: true });
    if (!model) throw new Error("Survey crystal asset is missing");
    model.position.set(x, y, z);
    model.scale.multiplyScalar(spot.scale);
    model.updateMatrixWorld(true);
    const materials = [];
    for (const name of ["crystal", "grooves"])
      model.userData.parts?.[name]?.traverse((node) => {
        if (!node.isMesh) return;
        node.material = node.material.clone();
        node.material.emissive.setHex(0x39e3d0);
        materials.push(node.material);
      });
    const center = new THREE.Vector3(...model.userData.beam).applyMatrix4(
      model.matrixWorld,
    );
    this.crystal = { model, center, materials };
    this.beam = {
      from: center,
      to: center.clone().add(new THREE.Vector3(0, 2, 0)),
      active: () => this.active && !this.ready,
    };
    world.addRound(
      x,
      z,
      0.62 * spot.scale,
      y - 1,
      y + 2.1 * spot.scale,
      "prop",
    );
    scene.add(model);
    this.reset();
  }

  get ready() {
    return this.lit.size === 2 && !this.claimed;
  }

  interactables() {
    if (!this.crystal || this.claimed) return [];
    const station = this.stations.find(
      (s) => s.id === (this.ready ? "far" : "near"),
    );
    return [
      {
        kind: "use",
        box: station.box,
        ref: { use: () => this.use() },
        prompt: `relic:${this.ready ? "Collect Mira's route survey" : this.active ? "Pause ferry survey" : this.lit.size ? "Resume ferry survey" : "Begin ferry survey"}`,
      },
    ];
  }

  use() {
    if (!this.crystal || this.claimed) return false;
    if (this.ready) {
      const fresh = this.services.discoverRelic?.(SURVEY_RELIC);
      if (!fresh && !this.services.relicFound?.(SURVEY_RELIC)) return false;
      this.claimed = true;
      this.active = false;
      this.isles.guideKey = null;
      this.services.hud?.clearHint?.();
      this.refresh();
      return true;
    }
    if (this.active) {
      this.pause();
      this.services.hud?.subtitle(
        "The survey is paused. Its measurements are kept.",
        3,
      );
      return true;
    }
    this.active = true;
    this.guideKey = null;
    this.isles.guideKey = null;
    this.services.hud?.clearSubtitle?.();
    this.services.hud?.hint(
      "Ferry survey",
      "Pulse both amber lenses from the drifting isle; link to this crystal to recharge.",
      9,
    );
    this.refresh();
    return true;
  }

  pause() {
    this.active = false;
    this.guideKey = null;
    this.isles.guideKey = null;
    this.services.hud?.clearHint?.();
    this.refresh();
  }

  strike(id, disc) {
    if (
      !this.active ||
      this.claimed ||
      this.lit.has(id) ||
      !this.stations.some((s) => s.id === id)
    )
      return false;
    const aboard =
      this.hero && this.isles.grounded(this.isles.isle("ferry"), this.hero);
    if (!disc.charged || !aboard) {
      this.services.sound?.play("clink");
      if (this.time - this.noticeAt > 3) {
        this.noticeAt = this.time;
        this.services.hud?.subtitle(
          aboard
            ? "Link to the crystal for light, then pulse the amber lens."
            : "The survey measures the moving route. Pulse its lenses from the ferry.",
          3,
        );
      }
      return false;
    }
    this.lit.add(id);
    this.guideKey = null;
    this.services.sound?.play("pylon");
    if (this.ready) {
      this.services.hud?.clearHint?.();
      this.services.hud?.subtitle(
        "Both stations answered. Mira's survey waits on the far bank.",
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
    if (this.active && !["ledge", "ferry", "far"].includes(this.isles.on))
      this.pause();
    this.refresh();
  }

  guide(hud, hero, disc) {
    if (
      this.claimed ||
      (!this.active && !this.ready) ||
      !["ledge", "ferry", "far"].includes(this.isles.on)
    )
      return false;
    const ferry = this.isles.isle("ferry").collider;
    const aboard = this.isles.grounded(this.isles.isle("ferry"), hero);
    const key = `${this.ready}:${aboard}:${!!disc?.charged}:${this.lit.size}`;
    this.boardMark ??= new THREE.Vector3();
    this.boardMark.set(ferry.x, ferry.maxY + 1.2, ferry.z);
    hud.objective(
      this.ready
        ? "Collect Mira's route survey"
        : "Complete the optional ferry survey",
      this.ready
        ? "The far amber station holds the completed survey"
        : aboard
          ? `Survey lenses: ${this.lit.size} of 2 · ${disc?.charged ? "Pulse an amber lens" : "Link to the crystal for light"}`
          : "Board the drifting isle and pulse both amber lenses from it",
    );
    if (key !== this.guideKey) {
      hud.setMarkers(
        this.ready
          ? [this.stations[1].center]
          : !aboard
            ? [this.boardMark]
            : !disc?.charged
              ? [this.crystal.center]
              : this.stations
                  .filter((s) => !this.lit.has(s.id))
                  .map((s) => s.center),
      );
      this.guideKey = key;
    }
    return true;
  }

  refresh() {
    for (const station of this.stations)
      for (const material of station.materials)
        material.emissiveIntensity = this.lit.has(station.id)
          ? 2.4
          : this.active
            ? 0.7 + Math.sin(this.time * 2.2) * 0.12
            : 0.22;
    for (const material of this.crystal?.materials ?? [])
      material.emissiveIntensity = this.active && !this.ready ? 2.2 : 0.3;
  }

  reset() {
    this.active = false;
    this.claimed = !!this.services.relicFound?.(SURVEY_RELIC);
    this.lit = new Set(this.claimed ? ["near", "far"] : []);
    this.guideKey = null;
    this.noticeAt = -99;
    this.time = 0;
    this.refresh();
  }

  telemetry() {
    return {
      active: this.active,
      ready: this.ready,
      claimed: this.claimed,
      lit: [...this.lit],
      stations: this.stations.map((s) => ({
        id: s.id,
        at: s.center.toArray(),
      })),
      crystal: this.crystal?.center.toArray(),
    };
  }
}
