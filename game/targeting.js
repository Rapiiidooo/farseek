import * as THREE from "three";

export function traceShot(
  world,
  origin,
  direction,
  targets = [],
  range = 45,
  slack = 0,
) {
  const forward = direction.clone().normalize();
  const obstruction = world?.ray(
    origin.x,
    origin.y,
    origin.z,
    forward.x,
    forward.y,
    forward.z,
    range,
    (box) => !box.thin,
  );
  let distance = obstruction?.t ?? range;
  let target = null;
  for (const candidate of targets) {
    if (!candidate.alive()) continue;
    const offset = candidate.center().clone().sub(origin);
    const along = offset.dot(forward);
    const radius = (candidate.radius || 0.35) + slack;
    const radialSq = offset.lengthSq() - along * along;
    if (along < 0 || radialSq > radius * radius) continue;
    const entry = Math.max(0, along - Math.sqrt(radius * radius - radialSq));
    if (entry > distance) continue;
    distance = entry;
    target = candidate;
  }
  return {
    target,
    point: origin.clone().addScaledVector(forward, distance),
    direction: forward,
    distance,
    obstruction: target ? null : obstruction,
  };
}

export function traceAim(
  world,
  origin,
  direction,
  targets,
  { range = 24, cone = 26, flat = true, ignoreProps = false } = {},
) {
  const forward = direction.clone().normalize();
  const aim = flat
    ? new THREE.Vector3(forward.x, 0, forward.z).normalize()
    : forward;
  const filter = (box) => !box.thin && !(ignoreProps && box.kind === "prop");
  let selected = null;
  let best = THREE.MathUtils.degToRad(cone);
  for (const target of targets) {
    if (!target.alive()) continue;
    const center = target.center().clone();
    const delta = center.clone().sub(origin);
    const distance = delta.length();
    if (distance < 0.15 || distance > range || !Number.isFinite(distance))
      continue;
    const toward = delta.clone().divideScalar(distance);
    const angle = aim.angleTo(
      flat ? new THREE.Vector3(toward.x, 0, toward.z).normalize() : toward,
    );
    if (angle > best) continue;
    const obstruction = world.ray(
      origin.x,
      origin.y,
      origin.z,
      toward.x,
      toward.y,
      toward.z,
      distance,
      filter,
    );
    if (
      obstruction &&
      obstruction.t < distance - (target.radius || 0.35) - 0.08
    )
      continue;
    best = angle;
    selected = { target, point: center, distance, direction: toward };
  }
  if (selected) return selected;
  const obstruction = world.ray(
    origin.x,
    origin.y,
    origin.z,
    forward.x,
    forward.y,
    forward.z,
    range,
    filter,
  );
  const distance = obstruction?.t ?? range;
  return {
    target: null,
    point: origin.clone().addScaledVector(forward, distance),
    distance,
    direction: forward,
    obstruction,
  };
}
