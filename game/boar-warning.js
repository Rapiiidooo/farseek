import * as THREE from "three";

let texture;
const random = (seed) => {
  const value = Math.sin(seed * 127.1) * 43758.5453;
  return value - Math.floor(value);
};

function dustTexture() {
  if (texture) return texture;
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot(
        (x + 0.5) / (size / 2) - 1,
        (y + 0.5) / (size / 2) - 1,
      );
      const offset = (y * size + x) * 4;
      pixels.fill(255, offset, offset + 3);
      pixels[offset + 3] =
        Math.max(0, 1 - radius) ** 1.6 *
        (0.72 + random(x + y * size) * 0.28) *
        255;
    }
  texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class BoarWarning {
  constructor(scene, groundAt) {
    this.groundAt = groundAt;
    this.count = 28;
    this.particles = Array.from({ length: this.count }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      duration: 0,
      size: 0,
      scale: 1,
    }));
    this.serial = this.clock = 0;
    this.emitting = false;
    this.scraping = false;
    const geometry = new THREE.BufferGeometry();
    for (const [name, size] of [
      ["position", 3],
      ["dustOpacity", 1],
      ["dustScale", 1],
    ])
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(this.count * size), size),
      );
    const material = new THREE.PointsMaterial({
      color: 0x9d866b,
      map: dustTexture(),
      size: 0.16,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "attribute float dustOpacity;\nattribute float dustScale;\nvarying float vDustOpacity;\n" +
        shader.vertexShader.replace(
          "gl_PointSize = size;",
          "gl_PointSize = size * dustScale;\nvDustOpacity = dustOpacity;",
        );
      shader.fragmentShader =
        "varying float vDustOpacity;\n" +
        shader.fragmentShader.replace(
          "#include <color_fragment>",
          "#include <color_fragment>\ndiffuseColor.a *= vDustOpacity;",
        );
    };
    material.customProgramCacheKey = () => "fd-boar-dust-v1";
    this.cloud = new THREE.Points(geometry, material);
    this.cloud.name = "boar-hoof-dust";
    this.cloud.visible = false;
    scene.add(this.cloud);
  }

  show(boar, target) {
    this.emitting = !!target;
    if (!target && ["patrol", "break", "stagger"].includes(boar.state))
      this.clear();
  }

  clear() {
    this.emitting = false;
    this.scraping = false;
    this.clock = this.serial = 0;
    for (const particle of this.particles) particle.life = 0;
    for (const attribute of Object.values(this.cloud.geometry.attributes)) {
      attribute.array.fill(0);
      attribute.needsUpdate = true;
    }
    this.cloud.geometry.computeBoundingSphere();
    this.cloud.visible = false;
  }

  impact(boar) {
    for (const leg of boar.locomotion?.legs || [])
      for (let i = 0; i < 3; i++) this.emit(boar, leg.soleWorld);
  }

  emit(boar, foot) {
    const ground = this.groundAt(foot.x, foot.z);
    if (
      !Number.isFinite(ground) ||
      Math.abs(foot.y - ground) > 0.035 * boar.scale
    )
      return;
    const serial = this.serial++;
    const particle = this.particles[serial % this.count];
    const scatter = (random(serial + 3) - 0.5) * 0.025 * boar.scale;
    const x =
      foot.x -
      Math.sin(boar.yaw) * 0.018 * boar.scale +
      Math.cos(boar.yaw) * scatter;
    const z =
      foot.z -
      Math.cos(boar.yaw) * 0.018 * boar.scale -
      Math.sin(boar.yaw) * scatter;
    particle.position.set(x, ground + 0.016, z);
    const spread = (random(serial + 11) - 0.5) * 0.35;
    particle.velocity.set(
      -Math.sin(boar.yaw) * 0.22 + Math.cos(boar.yaw) * spread,
      0.2 + random(serial + 29) * 0.12,
      -Math.cos(boar.yaw) * 0.22 - Math.sin(boar.yaw) * spread,
    );
    particle.duration = particle.life = 0.38 + random(serial + 47) * 0.25;
    particle.size = (0.55 + random(serial + 67) * 0.4) * boar.scale;
    particle.scale = boar.scale;
  }

  update(dt, boar) {
    if (dt <= 0) return;
    let scraping = false;
    if (this.emitting && boar.state === "charge") {
      this.clock = 0;
      for (const leg of boar.locomotion?.contacts || []) {
        this.emit(boar, leg.soleWorld);
        this.emit(boar, leg.soleWorld);
      }
    } else if (this.emitting && boar.state === "windup") {
      const leg = boar.locomotion?.legs.find(
        (foot) => foot.name === "frontRight",
      );
      scraping = !!leg && leg.lift < 0.02 && Math.sin(boar.t * 15) < -0.1;
      if (scraping) {
        if (!this.scraping) this.clock = 0.1;
        this.clock += Math.min(dt, 0.1);
        while (this.clock >= 0.1) {
          this.clock -= 0.1;
          this.emit(boar, leg.soleWorld);
          this.emit(boar, leg.soleWorld);
        }
      } else this.clock = 0;
    } else this.clock = 0;
    this.scraping = scraping;
    const { position, dustOpacity, dustScale } = this.cloud.geometry.attributes;
    let alive = 0;
    for (const [i, particle] of this.particles.entries()) {
      particle.life = Math.max(0, particle.life - dt);
      if (particle.life > 0) {
        particle.velocity.y -= dt * 0.7;
        particle.position.addScaledVector(particle.velocity, dt);
        const ground = this.groundAt(particle.position.x, particle.position.z);
        if (!Number.isFinite(ground)) {
          particle.life = 0;
          dustOpacity.setX(i, 0);
          continue;
        }
        particle.position.y = THREE.MathUtils.clamp(
          particle.position.y,
          ground + 0.015,
          ground + 0.18 * particle.scale,
        );
        const elapsed = 1 - particle.life / particle.duration;
        dustOpacity.setX(i, Math.sin(Math.PI * elapsed) * (1 - elapsed));
        dustScale.setX(i, particle.size * (1 + elapsed * 0.7));
        position.setXYZ(
          i,
          particle.position.x,
          particle.position.y,
          particle.position.z,
        );
        alive++;
      } else dustOpacity.setX(i, 0);
    }
    this.cloud.visible = alive > 0;
    if (alive) {
      for (const attribute of [position, dustOpacity, dustScale])
        attribute.needsUpdate = true;
      this.cloud.geometry.computeBoundingSphere();
    }
  }
}
