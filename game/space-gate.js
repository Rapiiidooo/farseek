import * as THREE from "three";
import createGate from "./assets/far_gate.js";
import { liquidMaterial, liquidUniforms } from "./gate.js";

// The last door adrift: the ring and its water alone, with nothing to stand on.
export function spaceGate() {
  const root = new THREE.Group();
  root.name = "Drifting far door";
  const ring = createGate(THREE, { base: false });
  ring.position.y = -ring.userData.portal.center[1];
  ring.traverse((node) => {
    if (!node.isMesh) return;
    node.material = node.material.clone();
    node.material.fog = false;
    if (node.material.emissive?.getHex()) node.material.emissiveIntensity = 1.6;
  });
  root.add(ring);
  const uniforms = liquidUniforms({ sky: 0x1a1d3a, glow: 2.2 });
  const membrane = new THREE.Mesh(
    new THREE.CircleGeometry(ring.userData.portal.radius - 0.02, 96),
    liquidMaterial(uniforms),
  );
  membrane.name = "Drifting door water";
  membrane.renderOrder = 4;
  root.add(membrane);
  root.userData.animate = (time) => {
    uniforms.uTime.value = time;
  };
  return root;
}
