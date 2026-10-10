import * as THREE from "three";
import { Breath } from "./breath.js";
import { coldWaterMaterial, setColdWaterTime } from "./cold-water.js";
import { BAYS, buildSeal } from "./vault.js";
import { CurrentField } from "./sea-currents.js";
import { t } from "./i18n.js";

// The drowned archive's bay: a flooded well. Steps lead down into the water on its west side;
// at the bottom a passage runs east to a small chamber whose seal must be pressed underwater,
// on one breath, against the current that pours out of it. The archive's swimming, breath and
// currents apply.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BAY = BAYS[5];
export const WELL = {
  minX: 17,
  maxX: 25,
  minZ: -56,
  maxZ: -48,
  surface: -0.5,
  bottom: -11,
  tunnel: { x0: 25, x1: 29, z0: -53.2, z1: -50.8, top: -8.6 },
  chamber: { x0: 29, x1: 32.5, z0: -55, z1: -49, top: -6.5 },
  steps: [
    [17, 17.9, -0.45],
    [17.9, 18.8, -0.9],
    [18.8, 19.7, -1.35],
  ],
  stepZ: [-53.5, -50.5],
  seal: { x: 31.75, z: -52, yaw: -Math.PI / 2 },
  breath: 25,
  // Water pouring out of the chamber, along the passage and across the well's floor.
  current: {
    box: {
      minX: 20.5,
      maxX: 29.4,
      minY: -11,
      maxY: -7.6,
      minZ: -54.4,
      maxZ: -49.6,
    },
    flow: { x: -1, z: 0 },
    speed: 1,
  },
};

export class WellTrial {
  constructor(vault) {
    this.vault = vault;
    this.bay = BAY;
    this.id = BAY.id;
    this.done = false;
    this.time = 0;
    this.breath = new Breath(WELL.breath);
    this.head = new THREE.Vector3();
    this.volume = {
      active: () => this.wet(this.vault.hero),
      minX: WELL.minX + 0.3,
      maxX: WELL.chamber.x1 - 0.3,
      minZ: WELL.minZ + 0.3,
      maxZ: WELL.maxZ - 0.3,
      bottom: WELL.bottom + 0.2,
      top: WELL.surface - 0.35,
      current: (time, pos, feet) => {
        if (!pos || !this.current) return { x: 0, z: 0 };
        const v = this.current.at(pos.x, feet + 0.9, pos.z);
        return { x: v.x, z: v.z };
      },
    };
  }

  // Inside the water. Swimming lasts until the feet rise near the surface; standing on a step
  // takes a deeper water to start swimming again, so the surface does not flicker between the two.
  wet(hero) {
    if (!hero) return false;
    const { x, z } = hero.pos;
    const W = WELL,
      C = W.chamber;
    const well = x > W.minX && x < W.maxX && z > W.minZ && z < W.maxZ;
    const deep =
      x >= W.maxX && x < C.x1 && z > C.z0 && z < C.z1 && hero.feet < C.top;
    if (!well && !deep) return false;
    return hero.feet < W.surface - (hero.swimming ? 0.3 : 1.0);
  }

  async build() {
    const { vault } = this;
    const { scene, world, assets } = vault;
    const m = vault.mat,
      S = vault.masonry;
    const area = `bay ${BAY.id}`;
    this.current = new CurrentField({
      ...WELL.current,
      edge: 0.8,
      streaks: 70,
    }).build(scene);
    const W = WELL,
      T = W.tunnel,
      C = W.chamber;
    const floor = (x0, y0, z0, x1, y1, z1, top = m.drowned) =>
      S.block(area, x0, y0, z0, x1, y1, z1, m.drowned, top, { grab: false });
    floor(9, -12, BAY.z0, W.minX, 0, BAY.z1);
    floor(W.minX, -12, BAY.z0, W.maxX, 0, W.minZ);
    floor(W.minX, -12, W.maxZ, W.maxX, 0, BAY.z1);
    floor(W.maxX, C.top, BAY.z0, 33, 0, BAY.z1);
    floor(W.maxX, -12, BAY.z0, 33, C.top, C.z0);
    floor(W.maxX, -12, C.z1, 33, C.top, BAY.z1);
    floor(W.maxX, -12, C.z0, T.x1, C.top, T.z0);
    floor(W.maxX, -12, T.z1, T.x1, C.top, C.z1);
    floor(W.maxX, T.top, T.z0, T.x1, C.top, T.z1);
    floor(C.x1, -12, C.z0, 33, C.top, C.z1);
    floor(W.minX, -12, W.minZ, C.x1, W.bottom, W.maxZ);
    for (const [x0, x1, top] of W.steps)
      floor(x0, W.bottom, W.stepZ[0], x1, top, W.stepZ[1], m.bone);
    // A bone kerb round the well's mouth.
    for (const [x0, z0, x1, z1] of [
      [W.minX - 0.4, W.minZ - 0.4, W.maxX + 0.4, W.minZ],
      [W.minX - 0.4, W.maxZ, W.maxX + 0.4, W.maxZ + 0.4],
      [W.maxX, W.minZ, W.maxX + 0.4, W.maxZ],
    ])
      S.block(area, x0, 0, z0, x1, 0.18, z1, m.bone, m.bone, { grab: false });
    // The water's face, seen through from above and from below.
    this.water = coldWaterMaterial(THREE);
    this.water.color.setHex(0x1d5560);
    this.water.emissive.setHex(0x0d3a40);
    this.water.transparent = true;
    this.water.opacity = 0.78;
    this.water.side = THREE.DoubleSide;
    this.water.depthWrite = false;
    this.water.normalMap.repeat.set(3, 3);
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(W.maxX - W.minX, W.maxZ - W.minZ).rotateX(
        -Math.PI / 2,
      ),
      this.water,
    );
    surface.position.set(
      (W.minX + W.maxX) / 2,
      W.surface,
      (W.minZ + W.maxZ) / 2,
    );
    surface.renderOrder = 2;
    scene.add(surface);
    this.seal = await buildSeal(vault, BAY, { ...W.seal, floor: W.bottom });
    for (const [name, x, z, scale, yaw] of [
      ["ruin_column", 31.2, -46.2, 0.42, 0.4],
      ["ruin_column", 31.2, -57.8, 0.42, 1.9],
      ["rubble_pile", 11.2, -57.6, 0.8, 0.7],
      ["rubble_pile", 27.4, -46.6, 0.6, 2.4],
    ]) {
      const o = await assets.make(name);
      if (!o) continue;
      o.position.set(x, 0, z);
      o.rotation.y = yaw;
      o.scale.setScalar(scale);
      scene.add(o);
      world.addRound(
        x,
        z,
        name === "ruin_column" ? 0.55 : scale * 0.8,
        0,
        name === "ruin_column" ? 4 : scale,
        "prop",
      );
    }
    this.deep = new THREE.PointLight(0x39e3d0, 10, 14, 1.4);
    this.deep.position.set(30, -9, -52);
    scene.add(this.deep);
    for (const [name, x, z, s, yaw] of [
      ["sea_kelp", 18.2, -55.2, 2.4, 0.3],
      ["sea_kelp", 24.1, -48.9, 2.8, 1.7],
      ["sea_kelp", 23.8, -55.1, 2.2, 2.6],
      ["sea_coral", 21.4, -49.0, 1.6, 0.8],
      ["sea_coral", 30.4, -54.2, 1.2, 2.1],
      ["sea_kelp", 29.6, -49.6, 2.0, 1.1],
    ]) {
      const o = await assets.make(name);
      if (!o) continue;
      o.position.set(x, W.bottom, z);
      o.rotation.y = yaw;
      o.scale.setScalar(s);
      scene.add(o);
    }
  }

  near(hero) {
    return (
      Math.hypot(
        hero.pos.x - this.seal.center.x,
        hero.feet + 0.9 - this.seal.center.y,
        hero.pos.z - this.seal.center.z,
      ) < 2.4
    );
  }

  headWater(hero) {
    const head = this.vault.headJoint;
    if (head) head.getWorldPosition(this.head);
    else this.head.set(hero.pos.x, hero.feet + 1.5, hero.pos.z);
    const W = WELL;
    const { x, z, y } = this.head;
    const inside =
      (x > W.minX && x < W.maxX && z > W.minZ && z < W.maxZ) ||
      (x >= W.maxX && x < W.chamber.x1 && z > W.chamber.z0 && z < W.chamber.z1);
    return inside && y < W.surface ? 1 : 0;
  }

  // The camera's depth in the well's water, 0 above it.
  waterAt(point) {
    const W = WELL;
    const inside =
      (point.x > W.minX &&
        point.x < W.maxX &&
        point.z > W.minZ &&
        point.z < W.maxZ) ||
      (point.x >= W.maxX &&
        point.x < W.chamber.x1 &&
        point.z > W.chamber.z0 &&
        point.z < W.chamber.z1 &&
        point.y < W.chamber.top);
    return inside && point.y < W.surface ? 1 : 0;
  }

  update(dt, hero, { interact, playable }) {
    this.time += dt;
    setColdWaterTime(this.water, this.time);
    this.current.update(dt);
    if (!playable) return;
    this.breath.update(dt, this.headWater(hero) > 0.5, () => this.onDrown?.());
    if (this.done || !hero.swimming) return;
    if (this.near(hero)) {
      hero.prompt = `relic:${t("Press the seal")}`;
      if (interact) {
        this.done = true;
        this.seal.light();
        this.vault.services.sound?.play("pylon");
        this.onDone?.(this);
      }
    }
  }

  interactables() {
    return [];
  }

  guide(hero) {
    if (hero.swimming && hero.feet < WELL.bottom + 3.5)
      return {
        title: t("The flooded well"),
        sub: t("Swim east along the passage and press the seal"),
        point: this.seal.center,
      };
    if (hero.swimming)
      return {
        title: t("The flooded well"),
        sub: t(
          "Dive: look down and swim, or hold the dive key. Watch your breath",
        ),
        point: V(WELL.maxX - 1, WELL.bottom + 1.2, -52),
      };
    return {
      title: t("The flooded well"),
      sub: t("Take the steps down into the water"),
      point: V(18.4, 0.4, -52),
    };
  }

  hint(hud) {
    return [
      BAY.title,
      t(
        "Swim toward the reticle; {drop} dives and {jump} rises. The seal is at the end of the passage below. Come back up for air before your breath runs out.",
        { drop: hud.k("drop"), jump: hud.k("jump") },
      ),
    ];
  }

  reset() {
    this.done = false;
    this.breath.reset();
    this.seal.light(false);
  }

  solve() {
    this.done = true;
    this.seal.light();
  }

  telemetry() {
    return {
      done: this.done,
      breath: +this.breath.remaining.toFixed(2),
      submerged: this.breath.submerged,
      seal: this.seal.center.toArray(),
      surface: WELL.surface,
      steps: WELL.steps,
      tunnel: WELL.tunnel,
      current: WELL.current,
    };
  }
}
