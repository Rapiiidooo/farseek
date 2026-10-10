import * as THREE from "three";

const smooth = (start, end, value) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

export function poseBirdFlight(
  bird,
  time,
  { amplitude = 0.68, harmonic = 0.12, attack = 0.22, release = 1.5 } = {},
) {
  const { f, a, seed } = bird,
    radius = f.r + bird.dr,
    speed = f.speed,
    vx = -Math.sin(a) * radius * speed,
    vz = Math.cos(a) * radius * 0.7 * speed,
    vy = Math.cos(a * 3 + seed) * 6 * speed,
    horizontal = Math.hypot(vx, vz),
    ax = -Math.cos(a) * radius * speed * speed,
    az = -Math.sin(a) * radius * 0.7 * speed * speed,
    turn = (vz * ax - vx * az) / Math.max(1e-9, horizontal * horizontal),
    pitch = -Math.atan2(vy, horizontal),
    yaw = Math.atan2(vx, vz),
    bank = Math.max(
      -0.45,
      Math.min(0.45, Math.atan((-turn * horizontal) / 9.8)),
    ),
    cycle = (((time + seed) % 3.2) + 3.2) % 3.2,
    envelope = smooth(0, attack, cycle) * (1 - smooth(1, release, cycle)),
    phase = cycle * 14,
    flap =
      0.08 +
      envelope * (amplitude * Math.sin(phase) + harmonic * Math.sin(phase * 2)),
    sweep = envelope * 0.16 * Math.max(0, Math.cos(phase)) ** 2,
    featherPitch = envelope * 0.065 * Math.sin(phase + 0.65);
  bird.o.position.set(
    f.cx + Math.cos(a) * radius,
    f.cy + bird.dy + Math.sin(a * 3 + seed) * 2,
    f.cz + Math.sin(a) * radius * 0.7,
  );
  bird.o.rotation.set(pitch, yaw, bank, "YXZ");
  if (bird.parts.leftWing)
    bird.parts.leftWing.rotation.set(featherPitch, sweep, flap);
  if (bird.parts.rightWing)
    bird.parts.rightWing.rotation.set(featherPitch, -sweep, -flap);
  // A rising wing folds its hand back, a beating one flexes its tips up; a glide keeps a little flex.
  const rise =
    envelope *
    (amplitude * Math.cos(phase) + 2 * harmonic * Math.cos(phase * 2));
  const fold = smooth(0.05, 0.75, rise / amplitude);
  const flex = Math.max(
    smooth(0.05, 0.75, -rise / amplitude),
    0.22 * (1 - envelope),
  );
  for (const mesh of wingMeshes(bird)) {
    mesh.morphTargetInfluences[0] = fold;
    mesh.morphTargetInfluences[1] = flex;
  }
  return { pitch, yaw, bank, flap, sweep, envelope, fold, flex };
}

// Morphed casters keep a depth material of their own: switching the shared one between
// morphed and plain casters makes its program depend on the shadow pass's drawing order.
function wingMeshes(bird) {
  if (!bird.wingMeshes) {
    bird.wingMeshes = [bird.parts.leftWing, bird.parts.rightWing]
      .filter(Boolean)
      .flatMap((wing) => wing.children)
      .filter((mesh) => mesh.isMesh && mesh.morphTargetInfluences?.length >= 2);
    for (const mesh of bird.wingMeshes)
      mesh.customDepthMaterial ??= new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        side: mesh.material.side,
      });
  }
  return bird.wingMeshes;
}
