import * as THREE from "three";

// A charging crystal of the builders, as in the archive and on the isles: the crystal emitter
// with its light climbing straight up. Linking the orb to it charges the orb.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LIGHT = 0x39e3d0;

export async function crystalWell(vault, x, y, z, { reach = 7 } = {}) {
  const { scene, world, assets } = vault;
  const object = await assets.make("crystal_emitter", { keepHierarchy: true });
  const at = object?.userData.beam || [0, 1.55, 0];
  if (object) {
    object.position.set(x, y, z);
    object.userData.parts?.crystal?.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.emissive = new THREE.Color(LIGHT);
      m.material.emissiveIntensity = 2.2;
    });
    scene.add(object);
  }
  const center = V(x + at[0], y + at[1], z + at[2]);
  const material = new THREE.MeshBasicMaterial({
    color: LIGHT,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
  // The follow camera can pass through the beam, which would then cover the view.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLens;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvLens = mvPosition.xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLens;")
      .replace(
        "#include <opaque_fragment>",
        "diffuseColor.a *= smoothstep(0.25, 1.2, length(vLens));\n#include <opaque_fragment>",
      );
  };
  material.customProgramCacheKey = () => "fd-beam-lens";
  const height = Math.max(2, reach - at[1]);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, height, 8, 1, true),
    material,
  );
  mesh.position.copy(center).add(V(0, height / 2, 0));
  mesh.renderOrder = 2;
  scene.add(mesh);
  world.addRound(x, z, 0.6, y - 0.5, y + 2, "prop");
  const beam = {
    from: center,
    to: center.clone().add(V(0, height, 0)),
    active: () => true,
  };
  const sound = vault.services.sound;
  let time = 0;
  return {
    center,
    beam,
    mesh,
    target: {
      radius: 0.5,
      center: () => center,
      alive: () => true,
      onHit: (disc) => {
        disc.charge = 10;
        sound?.play("charge");
      },
    },
    update(dt) {
      time += dt;
      material.opacity = 0.5 + Math.sin(time * 4.3) * 0.08;
    },
  };
}
