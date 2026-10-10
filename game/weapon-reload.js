import * as THREE from "three";

export const RELOAD_DURATION = 2.65;
export const PISTOL_CAPACITY = 32;
export const RELOAD_TIMING = Object.freeze({
  release: 0.38,
  belt: 0.94,
  seat: 1.42,
  rack: 1.72,
});

export function reloadPose(elapsed) {
  const smooth = (a, b) => THREE.MathUtils.smoothstep(elapsed, a, b);
  return {
    elapsed,
    phase: THREE.MathUtils.clamp(elapsed / RELOAD_DURATION, 0, 1),
    spread: smooth(0.04, 0.3) * (1 - smooth(0.58, 1.08)),
    dock: smooth(0.72, 1.12) * (1 - smooth(1.8, 2.14)),
    insertion: smooth(1.1, 1.4),
    dip: smooth(0.58, 1.12) * (1 - smooth(1.75, 2.15)),
    rack: smooth(1.53, 1.66) * (1 - smooth(1.72, 1.8)),
    extract: smooth(0.31, RELOAD_TIMING.release),
    blend: smooth(0, 0.24) * (1 - smooth(2.03, RELOAD_DURATION)),
  };
}

export class DroppedMagazines {
  constructor(limit = 12, onImpact = null) {
    this.limit = limit;
    this.onImpact = onImpact;
    this.items = [];
    this.dropped = 0;
    this.landed = 0;
    this.vertices = new WeakMap();
    this.support = new THREE.Vector3();
    this.vertical = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
  }

  drop(source, scene, world, hero, side) {
    if (!scene) return;
    source.updateWorldMatrix(true, true);
    if (!this.vertices.has(source)) {
      const inverse = source.matrixWorld.clone().invert();
      const vertices = new Map();
      source.traverse((node) => {
        const positions = node.geometry?.attributes.position;
        if (!positions) return;
        const matrix = inverse.clone().multiply(node.matrixWorld);
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(matrix);
          const key = p
            .toArray()
            .map((v) => Math.round(v * 1e6))
            .join(",");
          vertices.set(key, p.toArray());
        }
      });
      this.vertices.set(
        source,
        new Float32Array([...vertices.values()].flat()),
      );
    }
    const mesh = source.clone();
    source.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    scene.add(mesh);
    mesh.name = "Dropped empty magazine";
    const right = new THREE.Vector3(Math.cos(hero.yaw), 0, -Math.sin(hero.yaw));
    const extraction = new THREE.Vector3(
      ...(source.parent?.userData.magazineAxis || [0, -1, 0]),
    ).transformDirection(source.parent?.matrixWorld || new THREE.Matrix4());
    this.items.push({
      mesh,
      world,
      side,
      age: 0,
      velocity: new THREE.Vector3(hero.vel?.x || 0, 0, hero.vel?.z || 0)
        .multiplyScalar(0.45)
        .addScaledVector(extraction, 0.85)
        .addScaledVector(right, side * 0.55),
      spin: new THREE.Vector3(4.8, side * 2.1, side * 7.2),
      scale: mesh.scale.clone(),
      vertices: this.vertices.get(source),
      drift: hero.level?.driftAt?.bind(hero.level),
      resting: false,
      bounced: false,
    });
    this.dropped++;
    while (this.items.length > this.limit)
      this.items.shift().mesh.removeFromParent();
  }

  update(dt) {
    const substeps = Math.max(1, Math.ceil(dt * 90));
    const step = dt / substeps;
    for (const item of this.items) {
      item.age += dt;
      item.mesh.scale
        .copy(item.scale)
        .multiplyScalar(THREE.MathUtils.clamp(6 - item.age, 0, 1));
      for (let i = 0; i < substeps && !item.resting; i++) {
        const p = item.mesh.position;
        const previous = p.y + this.lowest(item, item.normal).y;
        item.velocity.y -= step * 9.8;
        p.addScaledVector(item.velocity, step);
        item.mesh.rotateX(item.spin.x * step);
        item.mesh.rotateY(item.spin.y * step);
        item.mesh.rotateZ(item.spin.z * step);
        const offset = this.lowest(item, item.normal);
        let bottom = p.y + offset.y;
        const origin = Math.max(previous, bottom) + 0.16;
        const hit = item.world?.ray(
          p.x + offset.x,
          origin,
          p.z + offset.z,
          0,
          -1,
          0,
          origin - bottom + 0.03,
          (box) => !box.thin,
        );
        const ground = item.world?.ground?.(
          p.x + offset.x,
          p.z + offset.z,
          0.001,
          origin,
          0,
        );
        const surface = Math.max(
          hit ? origin - hit.t : -Infinity,
          ground ?? -Infinity,
        );
        let floor = Number.isFinite(surface)
          ? surface +
            (item.drift?.(p.x + offset.x, p.z + offset.z, surface) || 0)
          : null;
        if (floor !== null && !item.normal && bottom - floor < 0.1) {
          item.normal = this.floorNormal(
            item,
            p.x + offset.x,
            p.z + offset.z,
            surface,
          );
          const x = offset.x,
            z = offset.z;
          this.lowest(item, item.normal);
          floor -=
            ((offset.x - x) * item.normal.x + (offset.z - z) * item.normal.z) /
            item.normal.y;
          bottom = p.y + offset.y;
        }
        if (floor !== null && bottom <= floor + 0.0005) {
          p.y = floor - offset.y + 0.0005;
          item.floor = floor;
          item.contact = { x: p.x + offset.x, z: p.z + offset.z };
          if (!item.impacted) {
            item.impacted = true;
            this.onImpact?.({
              side: item.side,
              strength: THREE.MathUtils.clamp(-item.velocity.y / 4.5, 0.2, 1),
            });
          }
          if (!item.bounced && item.velocity.y < -1.2) {
            item.velocity.y *= -0.24;
            item.velocity.x *= 0.45;
            item.velocity.z *= 0.45;
            item.spin.multiplyScalar(0.25);
            item.bounced = true;
          } else {
            item.resting = true;
            item.velocity.set(0, 0, 0);
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
              item.mesh.quaternion,
            );
            item.restRotation = new THREE.Quaternion()
              .setFromUnitVectors(new THREE.Vector3(0, 1, 0), item.normal)
              .multiply(
                new THREE.Quaternion().setFromEuler(
                  new THREE.Euler(
                    Math.PI / 2,
                    Math.atan2(forward.x, forward.z),
                    0,
                    "YXZ",
                  ),
                ),
              );
            this.landed++;
          }
        }
      }
      if (item.resting) {
        item.mesh.quaternion.slerp(item.restRotation, 1 - Math.exp(-dt * 24));
        const offset = this.lowest(item, item.normal);
        const p = item.mesh.position;
        item.floor -=
          ((p.x + offset.x - item.contact.x) * item.normal.x +
            (p.z + offset.z - item.contact.z) * item.normal.z) /
          item.normal.y;
        const ground = item.world?.ground?.(
          p.x + offset.x,
          p.z + offset.z,
          0.001,
          item.floor + 0.1,
          0,
        );
        if (Number.isFinite(ground) && Math.abs(ground - item.floor) < 0.1)
          item.floor =
            ground +
            (item.drift?.(p.x + offset.x, p.z + offset.z, ground) || 0);
        p.y = item.floor - offset.y + 0.0005;
        item.contact = { x: p.x + offset.x, z: p.z + offset.z };
      }
    }
    this.items = this.items.filter((item) => {
      if (item.age < 6) return true;
      item.mesh.removeFromParent();
      return false;
    });
  }

  floorNormal(item, x, z, height) {
    const at = (dx, dz) =>
      item.world?.ground?.(x + dx, z + dz, 0.001, height + 0.2, 0);
    const east = at(0.08, 0),
      north = at(0, 0.08);
    if (
      ![east, north].every(Number.isFinite) ||
      Math.max(Math.abs(east - height), Math.abs(north - height)) > 0.08
    )
      return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(
      (height - east) / 0.08,
      1,
      (height - north) / 0.08,
    ).normalize();
  }

  lowest(item, normal = null) {
    const { mesh, vertices } = item;
    this.rotation.copy(mesh.quaternion).invert();
    this.vertical.set(0, 1, 0);
    if (normal) this.vertical.copy(normal);
    this.vertical.applyQuaternion(this.rotation).multiply(mesh.scale);
    let lowest = Infinity,
      index = 0;
    for (let i = 0; i < vertices.length; i += 3) {
      const height =
        vertices[i] * this.vertical.x +
        vertices[i + 1] * this.vertical.y +
        vertices[i + 2] * this.vertical.z;
      if (height < lowest) {
        lowest = height;
        index = i;
      }
    }
    return this.support
      .fromArray(vertices, index)
      .multiply(mesh.scale)
      .applyQuaternion(mesh.quaternion);
  }

  clear() {
    for (const item of this.items) item.mesh.removeFromParent();
    this.items.length = 0;
  }
}
