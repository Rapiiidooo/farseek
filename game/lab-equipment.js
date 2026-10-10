import * as THREE from "three";
import { Equipment } from "./equipment.js";
import { SunDisc, fallbackDisc } from "./disc.js";
import { reloadArms } from "./animation/reload.js";

const emptyWorld = {
  ray: (x, y, z, dx, dy, dz, range) =>
    dy < 0 && y > 0 && -y / dy <= range ? { t: -y / dy } : null,
};
const aimCamera = { getWorldDirection: (out) => out.set(0, 0, 1) };

export class LabEquipment {
  constructor(model, animator) {
    this.model = model;
    this.animator = animator;
    this.selected = "off";
    this.active = false;
    this.aim = false;
    this.carry = "held";
    this.resources = new Set();
    this.kit = new Equipment(model);
    this.collect(this.kit.pouches);
    this.kit.bind(animator);
    const orb = fallbackDisc();
    this.collect(orb);
    this.orb = new SunDisc(orb, emptyWorld);
    this.roots = [...this.kit.guns.map(({ holster }) => holster), orb];
    for (const root of this.roots) {
      root.traverse((node) => {
        if (!node.isMesh) return;
        if (!node.name) node.name = `${root.name} ${node.geometry.type}`;
        node.castShadow = !node.userData.noShadow;
        node.receiveShadow = true;
      });
      this.collect(root);
      root.removeFromParent();
    }
  }

  collect(root) {
    root.traverse((node) => {
      if (node.geometry) this.resources.add(node.geometry);
      for (const material of node.material
        ? Array.isArray(node.material)
          ? node.material
          : [node.material]
        : [])
        this.resources.add(material);
    });
  }

  detach() {
    for (const { gun, holster } of this.kit.guns) {
      gun.removeFromParent();
      holster.removeFromParent();
    }
    this.orb.mesh.removeFromParent();
    this.orb.mesh.visible = false;
  }

  select(value, active = this.active) {
    if (!["off", "orb", "pistols"].includes(value))
      throw new Error("Unknown equipment");
    this.kit.reset();
    this.detach();
    this.orb.stow();
    this.selected = value;
    this.active = active;
    if (!active || value === "off") return;
    if (value === "orb") {
      this.orb.attach(this.animator.ik.right.hand, this.animator.ik.right.palm);
      this.kit.syncOrb(this.orb);
    }
    this.kit.select(value);
    for (const entry of this.kit.guns) {
      this.kit.joints.hips.add(entry.holster);
      entry.drawn = undefined;
      this.kit.mount(entry, false);
    }
  }

  setActive(active) {
    if (active !== this.active) this.select(this.selected, active);
  }

  setCarry(value) {
    if (!["holstered", "held", "aim"].includes(value))
      throw new Error("Unknown carry pose");
    this.carry = value;
    this.kit.shotBuffer = 0;
    this.aim = value === "aim";
    if (!this.aim) this.kit.aimTime = 0;
  }

  setAim(value) {
    this.setCarry(value ? "aim" : "held");
  }

  refreshPose(hero) {
    if (["ground", "air"].includes(hero.state) && !hero.swimming) {
      for (const side of ["left", "right"])
        for (const part of ["UpperArm", "LowerArm", "Hand"]) {
          const name = side + part;
          const joint = this.animator.joints[name];
          const rest = this.animator.rest[name]?.rot;
          const spring = this.animator.springs[name];
          if (joint && rest && spring)
            joint.rotation.set(
              rest.x + spring[0].v,
              rest.y + spring[1].v,
              rest.z + spring[2].v,
            );
        }
      this.animator.weaponWeight.v = hero.weaponAim || 0;
      this.animator.weaponWeight.dv = 0;
      this.animator.weaponArms(0, hero, true);
      reloadArms.call(this.animator, hero);
      if (!hero.weaponActive) {
        this.animator.handCurl.left = 0;
        if (!hero.holding) this.animator.handCurl.right = 0;
      }
    }
    this.animator.showHands(hero, 0);
    this.model.updateMatrixWorld(true);
  }

  prepare(dt, hero) {
    hero.world = emptyWorld;
    hero.equipment = undefined;
    hero.holding = hero.weaponActive = false;
    hero.weaponAim =
      hero.fireRecoilLeft =
      hero.fireRecoilRight =
      hero.orbPulse =
        0;
    if (!this.active || this.selected === "off") return;
    if (this.aim) this.kit.aimTime = 1;
    this.kit.prepare(
      dt,
      hero,
      aimCamera,
      this.orb,
      this.selected === "pistols" && this.carry === "holstered",
    );
  }

  update(dt, hero) {
    if (!this.active || this.selected === "off") return;
    this.orb.update(dt, hero);
    if (
      this.kit.shotBuffer > 0 &&
      this.kit.fire(hero, emptyWorld, aimCamera, [])
    )
      this.kit.prepare(0, hero, aimCamera, this.orb);
    this.kit.updateVisuals();
  }

  fire(hero) {
    if (!this.active || this.selected !== "pistols" || !hero.weaponActive)
      return false;
    if (!this.kit.requestFire()) return false;
    const fired = this.kit.fire(hero, emptyWorld, aimCamera, []);
    if (fired) {
      this.kit.prepare(0, hero, aimCamera, this.orb);
      this.kit.updateVisuals();
    }
    return true;
  }

  reload(hero) {
    if (!this.active || this.selected !== "pistols" || !hero.weaponActive)
      return false;
    if (!this.kit.reload()) return false;
    this.kit.prepare(0, hero, aimCamera, this.orb);
    return true;
  }

  parts() {
    if (!this.active || this.selected === "off") return [];
    const parts = this.kit.guns.flatMap(({ gun, key }) => [
      { name: `${key} pistol`, section: "equipment", node: gun },
      {
        name: `${key} slide`,
        section: "equipment",
        node: gun.userData.parts.slide,
      },
      {
        name: `${key} magazine`,
        section: "equipment",
        node: gun.userData.parts.magazine,
      },
    ]);
    if (this.selected === "orb")
      parts.push({
        name: "Relay orb",
        section: "equipment",
        node: this.orb.mesh,
      });
    return parts;
  }

  dispose() {
    this.kit.dropped.clear();
    this.detach();
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}
