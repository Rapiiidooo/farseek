import { t } from "./i18n.js";

export const FOREST_REFUGES = [
  [0, -12],
  [8, -64],
  [0, -115],
  [8, -153],
  [-24, -207],
  [-34, -254],
];

const LINES = [
  t("Mira left a light beside the trail. A place to catch your breath."),
  t("She stopped here before the spore beds. The light still holds."),
  t("Her sketch lies beside the grove. She was still heading for the castle."),
  t("Beyond the grove, another lantern keeps the trail marked."),
  t("A last shelter before the guards. Keep the light in sight."),
  t("Mira rested here before the sea. The archive was her next destination."),
];

export class TrailRefuges {
  constructor(level) {
    this.level = level;
    this.points = [];
    this.visited = new Set();
    this.active = -1;
  }

  async build() {
    const { assets, scene, world } = this.level;
    const template = await assets.make("path_lantern", { keepHierarchy: true });
    template.userData = { ...template.userData, parts: {} };
    for (const [id, [x, z]] of FOREST_REFUGES.entries()) {
      const model = template.clone(true);
      model.userData.parts.crystal = model.getObjectByName("crystal");
      const px = x + 3.1;
      const y = this.level.groundAt(px, z);
      model.name = "trail-refuge";
      model.scale.setScalar(0.65);
      model.position.set(px, y, z);
      const materials = new Map();
      model.userData.parts.crystal.traverse((node) => {
        if (!node.isMesh) return;
        if (!materials.has(node.material))
          materials.set(node.material, node.material.clone());
        node.material = materials.get(node.material);
      });
      scene.add(model);
      const collider = world.addRound(px, z, 0.22, y - 0.05, y + 1.56, "prop");
      const box = {
        minX: px - 0.4,
        maxX: px + 0.4,
        minZ: z - 0.4,
        maxZ: z + 0.4,
        minY: y,
        maxY: y + 1.7,
      };
      this.points.push({
        id,
        x,
        z,
        model,
        collider,
        box,
        materials: [...materials.values()],
      });
    }
    this.refresh();
  }

  near(point, hero = this.hero) {
    if (!hero || hero.state !== "ground") return false;
    const { position } = point.model;
    const ground = this.level.groundAt(hero.pos.x, hero.pos.z);
    return (
      Math.hypot(hero.pos.x - position.x, hero.pos.z - position.z) < 1.5 &&
      Number.isFinite(ground) &&
      Math.abs(hero.feet - ground) < 0.08
    );
  }

  threatened(hero = this.hero) {
    if (!hero) return true;
    return (
      this.level.guards.some(
        (guard) =>
          !guard.defeated &&
          Math.hypot(hero.pos.x - guard.pos.x, hero.pos.z - guard.pos.z) < 10,
      ) ||
      this.level.spores.some(
        (spore) =>
          spore.active &&
          Math.hypot(hero.pos.x - spore.x, hero.pos.z - spore.z) <
            spore.radius + 1.2,
      )
    );
  }

  interactables() {
    const threatened = this.threatened();
    return this.points.map((point) => ({
      kind: "use",
      box: point.box,
      prompt: `relic:${threatened ? t("Leave danger before resting") : t("Rest at the trail lantern")}`,
      ref: { use: () => this.rest(point.id) },
    }));
  }

  rest(id) {
    const point = this.points[id];
    const hero = this.hero;
    if (!point || !this.near(point, hero) || this.threatened(hero))
      return false;
    this.level.checkpoint = Math.max(this.level.checkpoint, id);
    this.level.safe = {
      x: point.x,
      z: point.z,
      feet: this.level.groundAt(point.x, point.z),
      yaw: Math.PI,
    };
    hero.safe = { ...this.level.safe };
    this.level.health = 4;
    this.visited.add(id);
    this.active = id;
    this.refresh();
    this.level.services.sound?.play("lamp");
    this.level.services.hud?.subtitle(LINES[id], 4);
    return true;
  }

  reach(id) {
    this.visited.add(id);
    this.active = id;
    this.refresh();
    this.level.services.hud?.hint(
      t("Trail refuge"),
      t(
        "Return here after a knockout. Rest at the lantern to recover strength.",
      ),
      5,
    );
  }

  update(hero) {
    this.hero = hero;
    this.refresh();
  }

  refresh() {
    for (const point of this.points) {
      const lit = this.visited.has(point.id);
      for (const material of point.materials) {
        material.color.setHex(lit ? 0x246b61 : 0x755534);
        material.emissive.setHex(lit ? 0x56dfb4 : 0xe2aa5c);
        material.emissiveIntensity =
          point.id === this.active
            ? 1.7 + 0.15 * Math.sin(this.level.time * 2)
            : lit
              ? 1.1
              : 0.55;
      }
    }
  }

  reset() {
    this.visited.clear();
    this.active = -1;
    this.hero = null;
    this.refresh();
  }

  telemetry() {
    return {
      active: this.active,
      visited: [...this.visited],
      points: this.points.map((point) => ({
        at: point.model.position.toArray(),
        rest: [point.x, point.z],
      })),
    };
  }
}
