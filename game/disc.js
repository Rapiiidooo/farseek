import * as THREE from "three";
import createOrb from "./assets/relay_orb.js";
import { traceAim } from "./targeting.js";
import { equipmentSound } from "./equipment-sound.js";
import { RelayTether } from "./relay-pull.js";

const CHARGE_TIME = 10;
const GLASS = new THREE.Color(0xa8f3e6);
let haloMap = null;

function haloTexture() {
  if (haloMap) return haloMap;
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(
        (x + 0.5) / (size / 2) - 1,
        (y + 0.5) / (size / 2) - 1,
      );
      const offset = (y * size + x) * 4;
      pixels.fill(255, offset, offset + 3);
      pixels[offset + 3] = Math.max(0, 1 - r) ** 2.2 * 255;
    }
  haloMap = new THREE.DataTexture(pixels, size, size);
  haloMap.magFilter = haloMap.minFilter = THREE.LinearFilter;
  haloMap.needsUpdate = true;
  return haloMap;
}

const own = (mesh) => {
  const material = mesh.material.clone();
  material.onBeforeCompile = mesh.material.onBeforeCompile;
  material.customProgramCacheKey = mesh.material.customProgramCacheKey;
  mesh.material = material;
  return material;
};

export class SunDisc {
  constructor(mesh, world, sound) {
    Object.assign(this, { mesh, world, sound });
    this.state = "hidden";
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.charge = 0;
    this.cooldown = 0;
    this.activations = 0;
    this.pulse = 0;
    this.spin = 0;
    this.time = 0;
    this.glass = 0;
    this.targets = [];
    this.beams = [];
    this.hitThisThrow = new Set();
    this.lens = [];
    this.center = new THREE.Vector3(...(mesh.userData.center || [0, 0.105, 0]));
    mesh.visible = false;
    const parts = mesh.userData.parts || {};
    parts.lens?.traverse((o) => {
      if (o.isMesh) this.lens.push(own(o));
    });
    // Every material the charged look animates exists from here on; charging only moves values.
    this.shell = [];
    parts.shell?.traverse((o) => {
      if (!o.isMesh) return;
      const material = own(o);
      material.transparent = true;
      o.renderOrder = 3;
      this.shell.push({
        material,
        color: material.color.clone(),
        metalness: material.metalness,
        roughness: material.roughness,
      });
    });
    this.crystal = [];
    parts.core?.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      this.crystal.push(own(o));
    });
    this.strands = [];
    parts.swirl?.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.renderOrder = 1;
      this.strands.push(o);
    });
    if (this.strands.length) {
      const material = own(this.strands[0]);
      for (const strand of this.strands) strand.material = material;
      this.strandLight = material;
    }
    this.lining = [];
    parts.lining?.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.renderOrder = 2;
      this.lining.push(own(o));
    });
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture(),
        color: new THREE.Color(0.4, 1.6, 1.5),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.halo.name = "Relay charge halo";
    this.halo.position.copy(this.center);
    this.halo.renderOrder = 4;
    this.halo.visible = false;
    mesh.add(this.halo);
    this.link = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.014, 1, 8),
      new THREE.MeshBasicMaterial({
        color: 0x6effe8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.link.frustumCulled = false;
    this.link.name = "Relay connection";
    mesh.add(this.link);
    this.tether = new RelayTether();
    mesh.add(this.tether.mesh);
    this.destination = new THREE.Vector3();
    this.kind = "orb";
  }

  get charged() {
    return this.charge > 0;
  }
  get chargeLeft() {
    return this.charge / CHARGE_TIME;
  }
  get ready() {
    return this.state === "held";
  }

  display(scene, at) {
    Object.assign(this, { state: "display", scene, displayAt: at.clone() });
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    scene.add(this.mesh);
    this.mesh.position.copy(at).sub(this.center);
    this.charge = this.pulse = this.cooldown = this.glass = 0;
    this.link.material.opacity = 0;
    if (!this.displayLight) {
      this.displayLight = new THREE.PointLight(0x39e3d0, 4, 4, 1.8);
      scene.add(this.displayLight);
    }
    this.displayLight.position.copy(at).add(new THREE.Vector3(0, 0.25, 0));
    this.displayLight.intensity = 4;
  }

  reset() {
    this.charge = this.pulse = this.cooldown = this.glass = 0;
    this.hitThisThrow.clear();
    if (this.scene && this.displayAt) this.display(this.scene, this.displayAt);
  }

  stow() {
    if (this.state === "display") return;
    this.scene?.attach(this.mesh);
    this.mesh.visible = false;
    this.state = "stowed";
    this.pulse = 0;
    this.link.material.opacity = 0;
    this.tether.hide();
  }

  attach(hand, grip = this.grip) {
    if (this.displayLight) this.displayLight.intensity = 0;
    this.hand = hand;
    this.grip = grip?.clone() || new THREE.Vector3(0, -0.36, 0.08);
    this.state = "held";
    this.mesh.visible = true;
    hand.add(this.mesh);
    const scale = 1 / (hand.getWorldScale(new THREE.Vector3()).x || 1);
    this.mesh.scale.setScalar(scale);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.position
      .copy(this.grip)
      .addScaledVector(
        new THREE.Vector3(
          ...(this.mesh.userData.gripOffset || [0, 0.015, 0.075]),
        ),
        scale,
      )
      .addScaledVector(this.center, -scale);
  }

  handPosition(out = new THREE.Vector3()) {
    this.hand.updateWorldMatrix(true, false);
    return out.copy(this.grip).applyMatrix4(this.hand.matrixWorld);
  }

  throw(scene, camera, fallbackYaw) {
    if (!this.ready || this.cooldown > 0) return false;
    const from = this.handPosition();
    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.y = THREE.MathUtils.clamp(forward.y + 0.12, -0.15, 0.35);
    if (forward.lengthSq() < 1e-6)
      forward.set(Math.sin(fallbackYaw), 0, Math.cos(fallbackYaw));
    const crystals = this.beams.map((beam) => ({
      radius: 0.45,
      center: () => beam.from,
      alive: () => beam.active(),
      onHit: () => {
        this.charge = CHARGE_TIME;
        this.sound?.play("charge");
      },
    }));
    const aim = traceAim(
      this.world,
      from,
      forward,
      [...crystals, ...this.targets],
      { ignoreProps: true },
    );
    this.prev.copy(from);
    this.pos.copy(aim.point);
    this.destination.copy(aim.point);
    this.hitThisThrow.clear();
    this.chargeFromBeams();
    if (aim.target) {
      this.hitThisThrow.add(aim.target);
      aim.target.onHit(this);
    }
    this.pulse = 1;
    this.activations++;
    this.cooldown = 0.48;
    equipmentSound(this.sound, "relay");
    return true;
  }

  // A charged pulse that stuns a creature or cracks a core spends the stored light.
  spend() {
    this.charge = 0;
  }

  // Charged, the shell clears to glass round a bright swirling crystal and a halo; the last
  // three seconds flicker faster and faster. Dormant, it is opaque bronze over a dark crystal.
  shine(dt) {
    this.time += dt;
    const charged = this.charge > 0;
    this.glass +=
      ((charged ? 1 : 0) - this.glass) * Math.min(1, dt * (charged ? 7 : 2.4));
    if (this.glass < 0.002) this.glass = 0;
    const left = this.charge / CHARGE_TIME;
    const rate = 9 + Math.max(0, 3 - this.charge) * 7;
    const flicker =
      charged && this.charge < 3
        ? Math.sin(this.time * rate) > 0
          ? 1
          : 0.3
        : 1;
    const power = this.glass * (0.4 + 0.6 * left) * flicker;
    for (const material of this.lens)
      material.emissiveIntensity = 0.16 + power * 2.2 + this.pulse * 1.4;
    for (const { material, color, metalness, roughness } of this.shell) {
      material.opacity = 1 - this.glass * 0.76;
      material.metalness = metalness + (0.1 - metalness) * this.glass;
      material.roughness = roughness + (0.05 - roughness) * this.glass;
      material.color.copy(color).lerp(GLASS, this.glass * 0.6);
    }
    for (const material of this.crystal)
      material.emissiveIntensity = 0.2 + power * 2.3 + this.pulse * this.glass;
    for (const material of this.lining)
      material.opacity = 1 - this.glass * 0.94;
    if (this.strandLight) {
      this.strandLight.opacity = Math.min(1, power * 1.1);
      this.strands[0].parent.rotation.y += dt * (0.4 + power * 1.6);
      for (let i = 0; i < this.strands.length; i++)
        this.strands[i].rotation.y +=
          dt * (i % 2 ? -1 : 1) * (1.4 + power * 4.2);
    }
    const halo = power * 0.55 + this.pulse * 0.3 * this.glass;
    this.halo.visible = halo > 0.01;
    this.halo.material.opacity = Math.min(1, halo);
    this.halo.scale.setScalar(
      0.12 + power * 0.06 + Math.sin(this.time * 5.3) * 0.008 * power,
    );
  }

  update(dt, hero) {
    this.charge = Math.max(0, this.charge - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.pulse = Math.max(0, this.pulse - dt * 3.8);
    this.shine(dt);
    if (this.state === "display") {
      this.spin += dt * 0.8;
      this.mesh.position.copy(this.displayAt).sub(this.center);
      this.mesh.position.y += Math.sin(this.spin * 2) * 0.035;
      this.mesh.rotation.y = this.spin;
      return;
    }
    this.link.material.opacity = this.ready ? this.pulse * 0.8 : 0;
    if (this.ready && this.pulse > 0) {
      this.mesh.updateWorldMatrix(true, false);
      const end = this.mesh.worldToLocal(this.destination.clone());
      const delta = end.clone().sub(this.center);
      this.link.position.copy(this.center).addScaledVector(delta, 0.5);
      this.link.scale.y = delta.length();
      this.link.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
    }
    if (hero && this.ready) hero.orbPulse = this.pulse;
  }

  chargeFromBeams() {
    for (const beam of this.beams) {
      if (
        beam.active() &&
        segmentDistance(this.prev, this.pos, beam.from, beam.to) < 0.45
      ) {
        if (this.charge < CHARGE_TIME - 0.5) this.sound?.play("charge");
        this.charge = CHARGE_TIME;
      }
    }
  }
}

function segmentDistance(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1),
    d2 = q2.clone().sub(p2),
    r = p1.clone().sub(p2);
  const a = d1.dot(d1),
    e = d2.dot(d2),
    f = d2.dot(r);
  let s = 0,
    t = 0;
  if (a <= 1e-9 && e <= 1e-9) return r.length();
  if (a <= 1e-9) t = THREE.MathUtils.clamp(f / e, 0, 1);
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) s = THREE.MathUtils.clamp(-c / a, 0, 1);
    else {
      const b = d1.dot(d2),
        denom = a * e - b * b;
      s =
        denom !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s),
    c2 = p2.clone().addScaledVector(d2, t);
  return c1.distanceTo(c2);
}

export function fallbackDisc() {
  return createOrb(THREE);
}
