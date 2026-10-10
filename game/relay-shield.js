import * as THREE from "three";

export const SHIELD_TIME = 1.2;
export const SHIELD_RECHARGE = 6;
const ARC = THREE.MathUtils.degToRad(140);
const COVER = Math.cos(THREE.MathUtils.degToRad(85));
const UP = new THREE.Vector3(0, 1, 0);

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFlash;
  varying vec2 vUv;
  void main() {
    vec2 cell = vec2(vUv.x * 14.0, vUv.y * 10.0);
    cell.x += 0.5 * floor(cell.y);
    vec2 f = abs(fract(cell) - 0.5);
    float seam = smoothstep(0.4, 0.49, max(f.x, f.y));
    float rim = smoothstep(0.8, 1.0, abs(vUv.x - 0.5) * 2.0);
    float band = 1.0 - smoothstep(0.0, 0.12, abs(fract(vUv.y - uTime * 0.8) - 0.5));
    float fade = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.86, 1.0, vUv.y));
    float a = (0.08 + seam * 0.3 + rim * 0.45 + band * 0.12 + uFlash * 0.5) * uOpacity * fade;
    vec3 color = mix(vec3(0.22, 0.89, 0.82), vec3(0.85, 1.0, 0.96), clamp(rim * 0.5 + uFlash * 0.7, 0.0, 1.0));
    gl_FragColor = vec4(color, clamp(a, 0.0, 1.0));
  }`;

// A curved ward of the builders' light raised in front of Nyra for a moment. It turns aside what
// strikes from its side, or bursts right under her, then needs a few seconds to gather again.
export class RelayShield {
  constructor(model, sound) {
    this.model = model;
    this.sound = sound;
    this.left = 0;
    this.recharge = 0;
    this.yaw = 0;
    this.flash = 0;
    this.time = 0;
    this.raised = 0;
    this.deflected = 0;
    this.matrix = new THREE.Matrix4();
    this.local = new THREE.Matrix4();
    this.turn = new THREE.Quaternion();
    this.at = new THREE.Vector3();
    this.size = new THREE.Vector3();
    const uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uFlash: { value: 0 },
    };
    const geometry = new THREE.CylinderGeometry(
      0.82,
      0.82,
      1.55,
      24,
      1,
      true,
      -ARC / 2,
      ARC,
    );
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.name = "Relay shield";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.mesh.userData.noShadow = true;
    this.mesh.castShadow = false;
    // Folded to a point while lowered, so the explorer's measured bounds never include it.
    this.mesh.scale.setScalar(0);
    model.add(this.mesh);
  }

  // The explorer's looks swap her materials between worlds; the ward's uniforms go with them.
  get uniforms() {
    return this.mesh.material.uniforms;
  }

  get active() {
    return this.left > 0;
  }

  get ready() {
    return this.left <= 0 && this.recharge <= 0;
  }

  raise(yaw) {
    if (!this.ready) return false;
    this.left = SHIELD_TIME;
    this.yaw = yaw;
    this.flash = 0.6;
    this.raised++;
    this.sound?.play("shield");
    return true;
  }

  // Covered: anything landing within a step of her, or arriving from the ward's side.
  covers(x, z, hero) {
    if (!this.active || !hero) return false;
    const dx = x - hero.pos.x,
      dz = z - hero.pos.z,
      d = Math.hypot(dx, dz);
    if (d < 1.1) return true;
    const facing = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / d;
    return facing > COVER;
  }

  deflect(x, z, hero) {
    if (!this.covers(x, z, hero)) return false;
    this.flash = 1;
    this.deflected++;
    this.sound?.play("clink");
    return true;
  }

  update(dt, hero, yaw) {
    this.time += dt;
    const wasActive = this.left > 0;
    this.left = Math.max(0, this.left - dt);
    if (wasActive && this.left === 0) this.recharge = SHIELD_RECHARGE;
    else if (!this.left && this.recharge > 0) {
      this.recharge = Math.max(0, this.recharge - dt);
      if (this.recharge === 0) this.sound?.play("lock");
    }
    if (this.left > 0 && Number.isFinite(yaw))
      this.yaw +=
        Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw)) *
        Math.min(1, dt * 10);
    this.flash = Math.max(0, this.flash - dt * 3);
    const rise = Math.min(1, (SHIELD_TIME - this.left) / 0.12);
    const fall = Math.min(1, this.left / 0.18);
    const opacity = this.left > 0 ? Math.min(rise, fall) : 0;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uOpacity.value = opacity;
    this.uniforms.uFlash.value = this.flash;
    this.mesh.visible = opacity > 0.001;
    if (!this.mesh.visible || !hero) {
      this.mesh.scale.setScalar(0);
      return;
    }
    this.model.updateWorldMatrix(true, false);
    this.at.set(hero.pos.x, hero.feet + 0.95, hero.pos.z);
    const swell = 0.92 + 0.08 * rise + this.flash * 0.05;
    this.matrix.compose(
      this.at,
      this.turn.setFromAxisAngle(UP, this.yaw),
      this.size.set(swell, 1, swell),
    );
    this.local.copy(this.model.matrixWorld).invert().multiply(this.matrix);
    this.local.decompose(
      this.mesh.position,
      this.mesh.quaternion,
      this.mesh.scale,
    );
  }

  reset() {
    this.left = this.recharge = this.flash = 0;
    this.uniforms.uOpacity.value = this.uniforms.uFlash.value = 0;
    this.mesh.visible = false;
    this.mesh.scale.setScalar(0);
  }

  telemetry() {
    return {
      active: this.active,
      ready: this.ready,
      left: +this.left.toFixed(2),
      recharge: +this.recharge.toFixed(2),
      raised: this.raised,
      deflected: this.deflected,
      yaw: +this.yaw.toFixed(3),
    };
  }
}
