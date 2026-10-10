import { detailBatch, consolidateDetails } from "../prop-detail.js";

export default function (THREE) {
  const root = new THREE.Group();
  root.name = "Relay orb";
  const bronze = new THREE.MeshStandardMaterial({
    color: 0xac824b,
    metalness: 0.78,
    roughness: 0.3,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x263b39,
    metalness: 0.55,
    roughness: 0.34,
  });
  const light = new THREE.MeshStandardMaterial({
    color: 0x307c72,
    emissive: 0x39e3d0,
    emissiveIntensity: 0.6,
    metalness: 0.3,
    roughness: 0.2,
  });
  // The stored light: a faceted crystal and two strands that swirl round it once it charges.
  const crystal = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    emissive: 0x39e3d0,
    emissiveIntensity: 0.22,
    metalness: 0.05,
    roughness: 0.16,
  });
  const strandLight = new THREE.MeshBasicMaterial({
    color: 0x39e3d0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.068, 1), crystal);
  core.name = "Relay crystal";
  core.position.y = 0.105;
  root.add(core);
  const swirl = new THREE.Group();
  swirl.name = "Relay swirl";
  swirl.position.y = 0.105;
  for (const [index, turn] of [
    [0, 1],
    [1, -1],
  ]) {
    const points = [];
    for (let k = 0; k <= 48; k++) {
      const t = k / 48;
      const polar = 0.38 + t * (Math.PI - 0.76);
      const around = turn * t * Math.PI * 3.4 + index * Math.PI;
      points.push(
        new THREE.Vector3(
          Math.sin(polar) * Math.cos(around) * 0.08,
          Math.cos(polar) * 0.08,
          Math.sin(polar) * Math.sin(around) * 0.08,
        ),
      );
    }
    const strand = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, 0.0042, 5),
      strandLight,
    );
    strand.name = `Relay swirl strand ${index}`;
    strand.userData.noShadow = true;
    swirl.add(strand);
  }
  // A dark lining closes the seams between the shells; it clears with the shell when charged.
  const lining = new THREE.Mesh(
    new THREE.SphereGeometry(0.086, 40, 24),
    new THREE.MeshStandardMaterial({
      color: 0x16211f,
      metalness: 0.3,
      roughness: 0.55,
      transparent: true,
    }),
  );
  lining.name = "Relay lining";
  lining.position.y = 0.105;
  lining.userData.noShadow = true;
  root.add(lining);
  root.add(swirl);
  const lens = new THREE.Group();
  root.add(lens);
  for (let i = 0; i < 6; i++) {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.098,
        12,
        20,
        (i * Math.PI) / 3 + 0.065,
        Math.PI / 3 - 0.13,
        0.18,
        Math.PI - 0.36,
      ),
      bronze,
    );
    shell.position.y = 0.105;
    root.add(shell);
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(0.091, 0.003, 6, 48),
      light,
    );
    seam.rotation.y = (i * Math.PI) / 3;
    seam.position.y = 0.105;
    lens.add(seam);
  }
  for (const side of [-1, 1]) {
    const inset = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 20, 12),
      light,
    );
    inset.scale.y = 0.38;
    inset.position.y = 0.105 + side * 0.093;
    lens.add(inset);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.025, 0.005, 8, 32),
      bronze,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = inset.position.y;
    root.add(ring);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), dark);
    stud.position.set(Math.sin(a) * 0.098, 0.105, Math.cos(a) * 0.098);
    root.add(stud);
  }

  const details = detailBatch(THREE, root);
  for (let belt = -1; belt <= 1; belt += 2) {
    const y = 0.105 + belt * 0.04;
    details.ring(dark, 0.0901, 0.001, [0, y, 0]);
    for (let i = 0; i < 30; i++) {
      const a = (i * Math.PI) / 15;
      details.bolt(
        dark,
        i % 5 ? 0.0011 : 0.0018,
        [Math.sin(a) * 0.0885, y, Math.cos(a) * 0.0885],
        [Math.sin(a), belt * 0.45, Math.cos(a)],
      );
    }
  }
  details.finish();
  consolidateDetails(THREE, root);
  consolidateDetails(THREE, lens);
  const shell = root.children.find((o) => o.isMesh && o.material === bronze);
  shell.name = "Relay shell";

  const size = 0.48;
  root.traverse((o) => {
    o.position.multiplyScalar(size);
    if (o.isMesh) {
      o.geometry.scale(size, size, size);
      o.castShadow = o.receiveShadow = !o.userData.noShadow;
    }
  });
  root.userData.parts = { lens, shell, core, swirl, lining };
  root.userData.center = [0, 0.105 * size, 0];
  root.userData.gripOffset = [0, 0.015 * size, 0.075 * size];
  root.userData.description =
    "A palm-sized bronze relay that links remotely to ancient mechanisms.";
  return root;
}
