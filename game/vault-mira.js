import * as THREE from "three";

// Mira in the vault: a small warm light that cannot take form yet. It drifts ahead along the
// nave to the next trial, waits there over what matters, and comes back towards Nyra when she
// falls far behind. Its light is a lantern's amber, the one warm light people carry.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SPEED = 4.2;

function glowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      const a = Math.max(0, Math.exp(-r * r * 4.5) - Math.exp(-4.5));
      data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class MiraLight {
  constructor(scene) {
    const texture = glowTexture();
    this.group = new THREE.Group();
    this.group.name = "Mira's light";
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 14, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.4, 1.45, 0.55),
        toneMapped: false,
        fog: false,
      }),
    );
    this.aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: 0xffc06a,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.aura.scale.setScalar(0.9);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: 0xff9a3c,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.halo.scale.setScalar(2.2);
    const count = 90;
    this.seeds = Array.from({ length: count }, (_, i) => [
      (i * 0.618) % 1,
      ((i * 0.377) % 1) * 0.8 + 0.2,
      ((i * 0.719) % 1) - 0.5,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.motes = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: texture,
        color: 0xffcf8a,
        size: 0.07,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.motes.frustumCulled = false;
    this.light = new THREE.PointLight(0xffb062, 5, 9, 1.6);
    this.group.add(this.core, this.aura, this.halo, this.motes, this.light);
    this.group.renderOrder = 5;
    scene.add(this.group);
    this.path = [];
    this.time = 0;
    this.goal = V(0, 2.2, 6);
    this.group.position.copy(this.goal);
    this.waiting = false;
  }

  // Off along the waypoints to a new place to wait.
  go(points) {
    this.path = points.map((p) => p.clone());
    this.goal = this.path[this.path.length - 1].clone();
  }

  place(point) {
    this.path = [];
    this.goal.copy(point);
    this.group.position.copy(point);
  }

  get moving() {
    return this.path.length > 0;
  }

  update(dt, hero, { brightness = 1, camera = null } = {}) {
    this.time += dt;
    const p = this.group.position;
    if (this.path.length) {
      const next = this.path[0];
      const d = p.distanceTo(next);
      const step = SPEED * dt;
      if (d <= step) {
        p.copy(next);
        this.path.shift();
      } else p.addScaledVector(next.clone().sub(p).divideScalar(d), step);
    } else {
      // Waiting: a slow circle round the place it keeps, and a bob.
      const t = this.time;
      const want = V(
        this.goal.x + Math.sin(t * 0.7) * 0.35,
        this.goal.y + Math.sin(t * 1.3) * 0.12,
        this.goal.z + Math.cos(t * 0.7) * 0.35,
      );
      p.lerp(want, Math.min(1, dt * 2.5));
    }
    const far = hero ? Math.hypot(hero.pos.x - p.x, hero.pos.z - p.z) : 0;
    this.waiting = !this.path.length && far > 10;
    const call = this.waiting
      ? 0.25 + 0.25 * Math.max(0, Math.sin(this.time * 3))
      : 0;
    // Close to the lens the glow would fill the frame: it thins out instead.
    const lens = camera ? camera.position.distanceTo(p) : 9;
    const glow = brightness * (1 + call);
    const k = glow * THREE.MathUtils.smoothstep(lens, 0.8, 3.2);
    this.core.scale.setScalar(0.94 + Math.sin(this.time * 3.1) * 0.06);
    this.aura.material.opacity = (0.72 + Math.sin(this.time * 2.2) * 0.1) * k;
    this.halo.material.opacity = 0.3 * k;
    this.motes.material.opacity = Math.min(1, k);
    this.light.intensity = 5 * glow;
    const pos = this.motes.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const [a, b, c] = this.seeds[i];
      const angle = a * Math.PI * 2 + this.time * (0.6 + b);
      const r = 0.08 + b * 0.22;
      pos.setXYZ(
        i,
        Math.cos(angle) * r,
        c * 0.45 + Math.sin(this.time + a * 9) * 0.05,
        Math.sin(angle) * r,
      );
    }
    pos.needsUpdate = true;
  }
}
