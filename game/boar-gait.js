import * as THREE from "three";

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const legNames = ["frontLeft", "frontRight", "backLeft", "backRight"];
const diagonal = [0, 0.5, 0.5, 0];
const gallop = [0.08, 0, 0.52, 0.6];
const up = new THREE.Vector3(0, 1, 0);
const lateral = new THREE.Vector3(1, 0, 0);
const hoofCache = new WeakMap();

function hoofParts(geometry) {
  if (hoofCache.has(geometry)) return hoofCache.get(geometry);
  const partitions = [[], []];
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 3) {
    const bucket = positions.getY(i) < -0.29 ? 0 : 1;
    partitions[bucket].push(i, i + 1, i + 2);
  }
  const parts = partitions.map((indices) => {
    const result = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const array = new attribute.array.constructor(
        indices.length * attribute.itemSize,
      );
      indices.forEach((index, target) => {
        for (let component = 0; component < attribute.itemSize; component++)
          array[target * attribute.itemSize + component] =
            attribute.array[index * attribute.itemSize + component];
      });
      result.setAttribute(
        name,
        new THREE.BufferAttribute(
          array,
          attribute.itemSize,
          attribute.normalized,
        ),
      );
    }
    return result;
  });
  hoofCache.set(geometry, parts);
  return parts;
}

export class BoarGait {
  constructor(boar) {
    this.boar = boar;
    this.body = boar.joints.body;
    this.weight = 0;
    this.running = 0;
    this.lean = 0;
    this.lastYaw = boar.home.yaw;
    this.contacts = [];
    this.forward = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.hip = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.pole = new THREE.Vector3();
    this.knee = new THREE.Vector3();
    this.local = new THREE.Vector3();
    this.worldScale = new THREE.Vector3();
    this.orientation = new THREE.Quaternion();
    this.parentRotation = new THREE.Quaternion();
    this.toeRotation = new THREE.Quaternion();
    this.normal = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.basis = new THREE.Matrix4();
    boar.model.updateMatrixWorld(true);
    this.legs = legNames
      .map((name, index) => {
        const upper = boar.joints[name];
        const lower = boar.joints[name + "Lower"];
        if (!upper || !lower) return null;
        const hoof = lower.children.find(
          (node) => node.isMesh && node.material.name === "hoof",
        );
        if (!hoof) return null;
        const [soleGeometry, clawGeometry] = hoofParts(hoof.geometry);
        const claws = new THREE.Mesh(clawGeometry, hoof.material);
        claws.name = name + "Lower-dewclaws";
        claws.castShadow = hoof.castShadow;
        claws.receiveShadow = hoof.receiveShadow;
        lower.add(claws);
        hoof.geometry = soleGeometry;
        hoof.geometry.computeBoundingBox();
        const ankle = new THREE.Group();
        ankle.name = name + "-hoof-pivot";
        ankle.position.set(0, -0.33, 0.046);
        lower.add(ankle);
        ankle.add(hoof);
        hoof.position.sub(ankle.position);
        const sole = new THREE.Vector3(
          0,
          hoof.geometry.boundingBox.min.y,
          0.046,
        ).add(hoof.position);
        boar.model.updateMatrixWorld(true);
        const rest = boar.model.worldToLocal(ankle.localToWorld(sole.clone()));
        const standing = rest.clone();
        rest.z = boar.model.worldToLocal(
          upper.getWorldPosition(new THREE.Vector3()),
        ).z;
        return {
          name,
          index,
          upper,
          lower,
          ankle,
          sole,
          rest,
          standing,
          first: lower.position.clone().normalize(),
          second: ankle.position.clone().normalize(),
          length1: lower.position.length(),
          length2: ankle.position.length(),
          planted: false,
          initialized: false,
          shift: diagonal[index],
          anchor: new THREE.Vector3(),
          release: new THREE.Vector3(),
          desired: new THREE.Vector3(),
          soleWorld: new THREE.Vector3(),
          lift: 0,
        };
      })
      .filter(Boolean);
  }

  reset() {
    this.weight = this.running = this.lean = 0;
    this.lastYaw = this.boar.yaw ?? this.boar.home.yaw;
    this.contacts.length = 0;
    for (const leg of this.legs) {
      leg.initialized = leg.planted = false;
      leg.shift = diagonal[leg.index];
      leg.ankle.quaternion.identity();
    }
  }

  point(leg, distance, target, standing = false) {
    const { pos, yaw, scale, feet } = this.boar;
    const rest = standing ? leg.standing : leg.rest;
    const x = rest.x * scale,
      z = rest.z * scale + distance;
    target.set(
      pos.x + x * Math.cos(yaw) + z * Math.sin(yaw),
      feet,
      pos.z - x * Math.sin(yaw) + z * Math.cos(yaw),
    );
    const ground = this.boar.world.ground(target.x, target.z, 0.07, feet, 0.5);
    target.y = Number.isFinite(ground) ? ground : feet;
    return target;
  }

  update(dt, speed) {
    const boar = this.boar;
    this.contacts.length = 0;
    if (!this.body || !this.legs.length) return;
    if (boar.state === "break") {
      this.reset();
      return;
    }
    const moving =
      ["patrol", "chase", "charge"].includes(boar.state) && speed > 0.02;
    const blend = 1 - Math.exp(-dt * 14);
    const wanted = moving
      ? clamp(speed / 0.7, 0, 1)
      : ["windup", "recover", "sweep-windup", "sweep"].includes(boar.state)
        ? 0.6
        : boar.state === "stagger"
          ? 0.8
          : 0;
    this.weight += (wanted - this.weight) * blend;
    const turn = Math.atan2(
      Math.sin(boar.yaw - this.lastYaw),
      Math.cos(boar.yaw - this.lastYaw),
    );
    this.lean +=
      (clamp((turn / Math.max(dt, 0.001)) * speed * 0.012, -0.07, 0.07) -
        this.lean) *
      blend;
    this.lastYaw = boar.yaw;
    this.running += ((boar.state === "charge" ? 1 : 0) - this.running) * blend;
    const pace = clamp((speed - 1.2) / 2.5, 0, 1);
    const stride = mix(mix(0.9, 1.25, pace), 1.8, this.running) * boar.scale;
    const duty = mix(mix(0.66, 0.52, pace), 0.37, this.running);
    boar.gait += ((speed * dt) / stride) * Math.PI * 2;
    this.body.position.y =
      boar.rest.body.position.y -
      mix(0.125, 0.145, this.running) * this.weight +
      Math.cos(boar.gait * 2) * mix(0.008, 0.018, this.running) * this.weight;
    this.body.rotation.x =
      Math.sin(boar.gait * 2) * 0.012 * this.running * this.weight;
    this.body.rotation.z =
      (Math.sin(boar.gait) * 0.012 * (1 - this.running) + this.lean) *
      this.weight;
    for (const leg of this.legs) {
      if (!moving) {
        this.point(leg, 0, leg.desired, true);
        leg.initialized = false;
        leg.planted = true;
        leg.lift = 0;
        if (boar.state === "windup" && leg.name === "frontRight") {
          const paw = Math.sin(boar.t * 15);
          leg.desired.x += Math.sin(boar.yaw) * paw * 0.09 * boar.scale;
          leg.desired.z += Math.cos(boar.yaw) * paw * 0.09 * boar.scale;
          leg.lift = Math.max(0, paw);
          leg.desired.y += leg.lift * 0.065 * boar.scale;
        }
        continue;
      }
      leg.shift +=
        (mix(diagonal[leg.index], gallop[leg.index], this.running) -
          leg.shift) *
        blend;
      const phase = (((boar.gait / (Math.PI * 2) + leg.shift) % 1) + 1) % 1;
      const planted = phase < duty;
      const stroke = stride * duty;
      const ahead = this.point(leg, stroke / 2, this.target);
      if (!leg.initialized) {
        this.point(leg, stroke * (0.5 - Math.min(phase / duty, 1)), leg.anchor);
        leg.release.copy(leg.anchor);
        leg.initialized = true;
      } else if (planted && !leg.planted) {
        leg.anchor.copy(ahead);
        if (speed > 0.5) this.contacts.push(leg);
      } else if (!planted && leg.planted) leg.release.copy(leg.anchor);
      if (planted) {
        leg.desired.copy(leg.anchor);
        leg.lift = 0;
      } else {
        const swing = (phase - duty) / (1 - duty);
        const ease = swing * swing * (3 - 2 * swing);
        leg.desired.lerpVectors(leg.release, ahead, ease);
        leg.lift = Math.sin(swing * Math.PI);
        leg.desired.y += leg.lift * mix(0.095, 0.15, this.running) * boar.scale;
      }
      this.point(leg, 0, this.target, true);
      leg.desired.lerp(this.target, 1 - this.weight);
      leg.planted = planted;
    }
  }

  solve() {
    if (this.weight < 0.001) {
      for (const leg of this.legs) leg.ankle.quaternion.identity();
      return;
    }
    const { yaw, model } = this.boar;
    model.updateMatrixWorld(true);
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    for (const leg of this.legs) {
      const sample = (dx, dz) =>
        this.boar.world.ground(
          leg.desired.x + dx,
          leg.desired.z + dz,
          0.01,
          this.boar.feet,
          0.5,
        );
      const gx = (sample(0.08, 0) - sample(-0.08, 0)) / 0.16;
      const gz = (sample(0, 0.08) - sample(0, -0.08)) / 0.16;
      this.normal
        .set(
          Number.isFinite(gx) ? -clamp(gx, -0.35, 0.35) : 0,
          1,
          Number.isFinite(gz) ? -clamp(gz, -0.35, 0.35) : 0,
        )
        .normalize();
      this.tangent
        .copy(this.forward)
        .addScaledVector(this.normal, -this.forward.dot(this.normal))
        .normalize();
      this.right.crossVectors(this.normal, this.tangent).normalize();
      this.basis.makeBasis(this.right, this.normal, this.tangent);
      this.orientation.setFromRotationMatrix(this.basis);
      leg.upper.getWorldPosition(this.hip);
      leg.upper.getWorldScale(this.worldScale);
      const scale = this.worldScale.y;
      this.toeRotation.setFromAxisAngle(lateral, leg.lift * 0.2 * this.weight);
      this.parentRotation.copy(this.orientation).multiply(this.toeRotation);
      this.target
        .copy(leg.sole)
        .multiplyScalar(scale)
        .applyQuaternion(this.parentRotation);
      this.target.subVectors(leg.desired, this.target);
      this.direction.subVectors(this.target, this.hip);
      const distance = clamp(
        this.direction.length(),
        Math.abs(leg.length1 - leg.length2) * scale + 0.001,
        (leg.length1 + leg.length2) * scale - 0.001,
      );
      this.direction.normalize();
      this.target.copy(this.hip).addScaledVector(this.direction, distance);
      const l1 = leg.length1 * scale,
        l2 = leg.length2 * scale;
      const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
      this.pole
        .copy(this.forward)
        .multiplyScalar(leg.name.startsWith("front") ? -1 : 1);
      this.pole
        .addScaledVector(this.direction, -this.pole.dot(this.direction))
        .normalize();
      this.knee
        .copy(this.hip)
        .addScaledVector(this.direction, along)
        .addScaledVector(
          this.pole,
          Math.sqrt(Math.max(0, l1 * l1 - along * along)),
        );
      this.local.copy(this.knee);
      this.body.worldToLocal(this.local).sub(leg.upper.position).normalize();
      leg.upper.quaternion.setFromUnitVectors(leg.first, this.local);
      leg.upper.updateWorldMatrix(false, false);
      this.local.copy(this.target);
      leg.upper.worldToLocal(this.local).sub(leg.lower.position).normalize();
      leg.lower.quaternion.setFromUnitVectors(leg.second, this.local);
      leg.lower.updateWorldMatrix(false, false);
      leg.lower.getWorldQuaternion(this.parentRotation).invert();
      leg.ankle.quaternion
        .copy(this.parentRotation)
        .multiply(this.orientation)
        .multiply(this.toeRotation);
      leg.ankle.updateWorldMatrix(false, false);
      leg.soleWorld.copy(leg.sole).applyMatrix4(leg.ankle.matrixWorld);
    }
  }
}
