import * as THREE from "three";

// With reduced motion a cinematic's camera follows its path through a soft spring, so sweeps
// and turns slow down; a cut (a jump of several metres) is still taken at once.
export class CalmCamera {
  constructor(lag = 0.45) {
    this.lag = lag;
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.active = false;
  }

  reset() {
    this.active = false;
  }

  apply(camera, dt) {
    if (!this.active || camera.position.distanceTo(this.position) > 6) {
      this.position.copy(camera.position);
      this.quaternion.copy(camera.quaternion);
      this.active = true;
      return;
    }
    const k = 1 - Math.exp(-dt / this.lag);
    this.position.lerp(camera.position, k);
    this.quaternion.slerp(camera.quaternion, k);
    camera.position.copy(this.position);
    camera.quaternion.copy(this.quaternion);
  }
}
