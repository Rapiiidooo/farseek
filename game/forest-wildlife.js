import * as THREE from "three";

const bounds = new THREE.Box3();

export function wildlifeTarget(animal, species, height, radius, health) {
  const point = new THREE.Vector3();
  const rest = new THREE.Vector3();
  Object.assign(animal, { species, hp: health, health, fallen: 0, struck: 0 });
  const target = {
    kind: "wildlife",
    species,
    radius,
    center: () => {
      animal.o.updateWorldMatrix(true, false);
      return animal.o.localToWorld(point.set(0, height, 0));
    },
    alive: () => animal.hp > 0,
    onHit: (shot) => {
      if (shot.kind !== "pistol" || animal.hp <= 0) return false;
      animal.hp--;
      animal.struck = 0.32;
      target.blood?.spray(shot.point, shot.direction, radius);
      if (animal.hp === 0) {
        // Between the fallen body and the legs, where the ground stays visible.
        target.blood?.pool(
          () => rest.copy(animal.o.position).lerp(target.center(), 0.5),
          species === "deer" ? 0.62 : 0.12,
          () => !!animal.resting,
        );
        animal.fallen = 0;
        animal.fallFrom = animal.o.position.clone();
        animal.fallYaw = animal.o.rotation.y;
        animal.velocity = new THREE.Vector3();
        if (species === "bird") {
          const f = animal.f,
            r = f.r + animal.dr;
          animal.velocity.set(
            -Math.sin(animal.a) * r * f.speed,
            0,
            Math.cos(animal.a) * r * 0.7 * f.speed,
          );
        }
      }
      return true;
    },
  };
  animal.target = target;
  return target;
}

export function fallenWildlife(animal, dt, ground) {
  if (animal.hp > 0) {
    animal.struck = Math.max(0, animal.struck - dt);
    return false;
  }
  animal.fallen += dt;
  if (animal.resting) return true;
  const k = THREE.MathUtils.smoothstep(animal.fallen, 0, 0.65);
  if (animal.species === "deer") {
    animal.o.position.copy(animal.fallFrom);
    animal.o.rotation.set(0, animal.fallYaw, k * 1.38);
    for (const key of ["frontLeft", "frontRight", "backLeft", "backRight"])
      if (animal.parts[key]) animal.parts[key].rotation.x = k * 0.65;
    if (animal.parts.head) animal.parts.head.rotation.x = k * 0.32;
  } else {
    animal.velocity.y -= dt * 9.8;
    animal.o.position.addScaledVector(animal.velocity, dt);
    animal.o.rotation.x = k * 0.35;
    animal.o.rotation.z = k * 1.45;
    if (animal.parts.leftWing) animal.parts.leftWing.rotation.z = k * 0.45;
    if (animal.parts.rightWing) animal.parts.rightWing.rotation.z = -k * 0.45;
  }
  animal.o.updateMatrixWorld(true);
  bounds.setFromObject(animal.o);
  const floor = ground(animal.o.position.x, animal.o.position.z) + 0.015;
  if (animal.species === "deer" || bounds.min.y <= floor) {
    animal.o.position.y += floor - bounds.min.y;
    animal.resting = k === 1;
    if (animal.species === "bird") animal.velocity.set(0, 0, 0);
  }
  return true;
}

export function resetWildlife(animal) {
  animal.hp = animal.health;
  animal.struck = animal.fallen = 0;
  animal.resting = false;
  animal.o.rotation.set(0, 0, 0);
  for (const part of Object.values(animal.parts))
    if (part.isObject3D) part.rotation.set(0, 0, 0);
}
