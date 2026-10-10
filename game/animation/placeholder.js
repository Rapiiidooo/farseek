import * as THREE from "three";

export function placeholderHero() {
  const g = new THREE.Group();
  const mat = (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const indigo = mat(0x2d3656),
    canvas = mat(0xcdbf9f),
    leather = mat(0x4b2e1e),
    scarf = mat(0xc2412d),
    skin = mat(0x9c6b4e);
  const joint = (parent, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };
  const part = (parent, geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const hips = joint(g, 0, 0.95, 0);
  part(hips, new THREE.BoxGeometry(0.36, 0.2, 0.22), canvas, 0, -0.02, 0);
  const spine = joint(hips, 0, 0.1, 0);
  part(spine, new THREE.BoxGeometry(0.42, 0.44, 0.26), indigo, 0, 0.22, 0);
  const head = joint(spine, 0, 0.47, 0);
  part(head, new THREE.SphereGeometry(0.13, 12, 10), skin, 0, 0.12, 0);
  part(
    head,
    new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12),
    scarf,
    0,
    0.05,
    0,
  );
  const scarfTail = joint(spine, -0.08, 0.44, -0.12);
  part(scarfTail, new THREE.BoxGeometry(0.1, 0.4, 0.03), scarf, 0, -0.2, 0);
  const limb = (side, isArm) => {
    const x = side * (isArm ? 0.25 : 0.1);
    const upper = joint(isArm ? spine : hips, x, isArm ? 0.4 : -0.03, 0);
    const len = isArm ? 0.3 : 0.44;
    part(
      upper,
      new THREE.BoxGeometry(0.11, len, 0.12),
      isArm ? indigo : canvas,
      0,
      -len / 2,
      0,
    );
    const lower = joint(upper, 0, -len, 0);
    part(
      lower,
      new THREE.BoxGeometry(0.1, len, 0.11),
      isArm ? leather : canvas,
      0,
      -len / 2,
      0,
    );
    if (!isArm)
      part(
        lower,
        new THREE.BoxGeometry(0.12, 0.08, 0.24),
        leather,
        0,
        -len - 0.02,
        0.05,
      );
    return [upper, lower];
  };
  const [leftUpperArm, leftLowerArm] = limb(1, true);
  const [rightUpperArm, rightLowerArm] = limb(-1, true);
  const [leftUpperLeg, leftLowerLeg] = limb(1, false);
  const [rightUpperLeg, rightLowerLeg] = limb(-1, false);
  g.userData.joints = {
    hips,
    spine,
    head,
    leftUpperArm,
    leftLowerArm,
    rightUpperArm,
    rightLowerArm,
    leftUpperLeg,
    leftLowerLeg,
    rightUpperLeg,
    rightLowerLeg,
    scarfTail,
  };
  g.userData.grip = { hands: 2.05 };
  return g;
}
