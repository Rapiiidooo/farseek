import * as THREE from "three";
import { traceAim } from "./targeting.js";

export const PULL_HOLD = 0.25;
const PULL_TIME = 1.1;
const PULL_COOLDOWN = 1.2;
const PULL_RANGE = 16;
const POINTS = 20;

export class RelayTether {
  constructor() {
    const positions = new Float32Array(POINTS * 2 * 3);
    const index = [];
    for (let i = 0; i < POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setIndex(index);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x6effe8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.name = "Relay tether";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.mesh.userData.noShadow = true;
    this.inverse = new THREE.Matrix4();
    this.point = new THREE.Vector3();
    this.next = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.vertex = new THREE.Vector3();
  }

  show(from, to, t, eye) {
    const parent = this.mesh.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    this.inverse.copy(parent.matrixWorld).invert();
    const array = this.mesh.geometry.attributes.position.array;
    const taut = Math.min(1, t * 5);
    const at = (u, out) =>
      out
        .copy(from)
        .lerp(to, u)
        .addScaledVector(
          this.view.set(0, 1, 0),
          -Math.sin(Math.PI * u) * 0.22 * (1 - taut),
        );
    for (let i = 0; i < POINTS; i++) {
      const u = i / (POINTS - 1);
      at(u, this.point);
      at(Math.min(1, u + 0.02), this.next).sub(
        at(Math.max(0, u - 0.02), this.vertex),
      );
      const wave = Math.sin(u * 22 - t * 26) * 0.012 * Math.sin(Math.PI * u);
      this.view.copy(eye).sub(this.point);
      this.side.crossVectors(this.next, this.view).normalize();
      this.point.addScaledVector(this.side, wave);
      const width = 0.012 + 0.01 * Math.sin(Math.PI * u) + 0.006 * taut;
      for (const [k, sign] of [
        [0, 1],
        [1, -1],
      ]) {
        this.vertex
          .copy(this.point)
          .addScaledVector(this.side, sign * width)
          .applyMatrix4(this.inverse);
        array.set(this.vertex.toArray(), (i * 2 + k) * 3);
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.material.opacity = 0.55 + 0.35 * taut;
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
    this.mesh.material.opacity = 0;
  }
}

// Holding the link on a light target drags it toward Nyra for a moment: a creature off its feet
// or out of cover. One pull per hold, then a short pause.
export class RelayPull {
  constructor(sound) {
    this.sound = sound;
    this.target = null;
    this.held = 0;
    this.t = 0;
    this.cooldown = 0;
    this.spent = false;
    this.pulls = 0;
    this.from = new THREE.Vector3();
    this.forward = new THREE.Vector3();
  }

  get active() {
    return !!this.target;
  }

  find(orb, hero, camera) {
    const candidates = orb.targets.filter(
      (target) => typeof target.pull === "function" && target.alive(),
    );
    if (!candidates.length || !hero.world) return null;
    orb.handPosition(this.from);
    camera.getWorldDirection(this.forward);
    return traceAim(hero.world, this.from, this.forward, candidates, {
      range: PULL_RANGE,
      cone: 20,
      ignoreProps: true,
    }).target;
  }

  clear(world, from, to) {
    const dx = to.x - from.x,
      dy = to.y - from.y,
      dz = to.z - from.z,
      d = Math.hypot(dx, dy, dz) || 1;
    const hit = world.ray(
      from.x,
      from.y,
      from.z,
      dx / d,
      dy / d,
      dz / d,
      d,
      (box) => !box.thin && box.kind !== "prop",
    );
    return !hit || hit.t > d - 0.6;
  }

  update(dt, { held, allowed, orb, hero, camera }) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const tether = orb?.tether;
    if (!held || !allowed || !orb?.ready) {
      this.held = 0;
      this.spent = false;
      this.release();
      tether?.hide();
      return;
    }
    // A press that linked a crystal or a mechanism is a charge or a pulse, never a pull.
    if (this.held === 0)
      this.spent =
        orb.charge > 9.9 ||
        [...(orb.hitThisThrow ?? [])].some(
          (target) => typeof target.pull !== "function",
        );
    this.held += dt;
    if (this.target) {
      this.t += dt;
      orb.handPosition(this.from);
      const centre = this.target.center();
      const holding =
        this.target.alive() &&
        this.t < PULL_TIME &&
        this.from.distanceTo(centre) < PULL_RANGE + 2 &&
        this.clear(hero.world, this.from, centre) &&
        this.target.pull({ phase: "hold", dt, from: hero.pos, hero }) !== false;
      if (holding) {
        tether?.show(this.from, centre, this.t, camera.position);
        return;
      }
      this.release();
    }
    tether?.hide();
    if (this.held < PULL_HOLD || this.spent || this.cooldown > 0) return;
    const target = this.find(orb, hero, camera);
    if (!target) return;
    this.spent = true;
    if (target.pull({ phase: "start", from: hero.pos, hero }) === false) return;
    this.target = target;
    this.t = 0;
    this.pulls++;
    this.sound?.play("tether");
  }

  release() {
    if (!this.target) return;
    this.target.pull({ phase: "release" });
    this.target = null;
    this.cooldown = PULL_COOLDOWN;
    this.sound?.play("catch");
  }

  reset() {
    this.release();
    this.held = this.cooldown = 0;
    this.spent = false;
  }

  telemetry() {
    return {
      active: this.active,
      held: +this.held.toFixed(2),
      cooldown: +this.cooldown.toFixed(2),
      pulls: this.pulls,
      target: this.target?.kind ?? null,
    };
  }
}
