import * as THREE from "three";
import { tubeSet, loft } from "./rope-loft.js";

// A swing rope's free swing runs on fixed steps, so where it hangs when the explorer reaches for
// it never depends on the frame rate; the drawn rope follows that line and bends at her hands.
export const ROPE_STEP = 1 / 240;
const RINGS = 30,
  SIDES = 7,
  RADIUS = 0.042,
  GRAVITY = 21;

export class SwingRope {
  constructor({ pivot, heading, length = 5.6, grip = [3.4, 5.1], material }) {
    this.pivot = pivot.clone();
    this.heading = new THREE.Vector2(heading.x, heading.y).normalize();
    this.length = length;
    this.grip = grip;
    this.material = material;
    this.angle = 0;
    this.spin = 0;
    this.across = 0;
    this.carry = 0;
    this.held = null;
    this.points = new Float32Array(RINGS * 3);
    this.previous = new Float32Array(RINGS * 3);
    this.tail = 0;
    this.time = 0;
    this.reset();
  }

  build(scene) {
    const { geometry, parts } = tubeSet([{ rings: RINGS, sides: SIDES }], {
      dynamic: true,
    });
    this.start = parts[0].start;
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    geometry.boundingSphere = new THREE.Sphere(
      this.pivot.clone().setY(this.pivot.y - this.length / 2),
      this.length,
    );
    scene.add(this.mesh);
    this.draw(0);
    return this;
  }

  reset() {
    this.angle = this.spin = this.carry = 0;
    this.held = null;
    this.direction = this.heading.clone();
    this.place();
    this.previous.set(this.points);
  }

  // A point on the hanging line `s` metres below the pivot.
  at(s, out = new THREE.Vector3()) {
    const d = this.direction;
    return out.set(
      this.pivot.x + d.x * Math.sin(this.angle) * s,
      this.pivot.y - Math.cos(this.angle) * s,
      this.pivot.z + d.y * Math.sin(this.angle) * s,
    );
  }

  grab(hero) {
    this.held = hero;
  }

  release(angle, spin, direction) {
    this.held = null;
    this.direction.copy(direction);
    this.angle = angle;
    this.spin = spin;
    this.carry = 0;
  }

  step(dt) {
    if (this.held) return;
    this.carry += dt;
    const reach = this.length * 0.55;
    while (this.carry >= ROPE_STEP - 1e-9) {
      this.carry -= ROPE_STEP;
      const accel =
        -(GRAVITY / reach) * Math.sin(this.angle) - 0.55 * this.spin;
      this.spin += accel * ROPE_STEP;
      this.angle += this.spin * ROPE_STEP;
    }
  }

  place(dt = 0) {
    const p = this.points,
      q = this.previous,
      n = RINGS,
      seg = this.length / (n - 1);
    const hero = this.held;
    if (hero && (hero.state !== "swing" || hero.pendulum?.rope !== this))
      this.held = null;
    if (!this.held) {
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const s = i * seg;
        this.at(s, v);
        const lag = -this.spin * 0.05 * (s / this.length) ** 2;
        p[i * 3] = v.x + this.direction.x * lag;
        p[i * 3 + 1] = v.y;
        p[i * 3 + 2] = v.z + this.direction.y * lag;
      }
      q.set(p);
      return;
    }
    const grip = hero.pendulum.grip;
    const k = Math.min(
      n - 2,
      Math.max(1, Math.round(hero.pendulum.length / seg)),
    );
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      p[i * 3] = this.pivot.x + (grip.x - this.pivot.x) * t;
      p[i * 3 + 1] = this.pivot.y + (grip.y - this.pivot.y) * t;
      p[i * 3 + 2] = this.pivot.z + (grip.z - this.pivot.z) * t;
    }
    if (dt > 0) {
      const damp = Math.exp(-dt * 5),
        fall = GRAVITY * dt * dt;
      for (let i = k + 1; i < n; i++) {
        const x = p[i * 3],
          y = p[i * 3 + 1],
          z = p[i * 3 + 2];
        p[i * 3] += (x - q[i * 3]) * damp;
        p[i * 3 + 1] += (y - q[i * 3 + 1]) * damp - fall;
        p[i * 3 + 2] += (z - q[i * 3 + 2]) * damp;
        q[i * 3] = x;
        q[i * 3 + 1] = y;
        q[i * 3 + 2] = z;
      }
    }
    // A heavy rope keeps on below the hands rather than folding back over them.
    for (let pass = 0; pass < 4; pass++)
      for (let i = k + 1; i < n; i++) {
        const a = (i - 1) * 3,
          b = i * 3,
          o = (i - 2) * 3;
        let dx = p[a] - p[o],
          dy = p[a + 1] - p[o + 1],
          dz = p[a + 2] - p[o + 2];
        const l = Math.hypot(dx, dy, dz) || 1;
        dx = p[a] + (dx / l) * seg - p[b];
        dy = p[a + 1] + (dy / l) * seg - p[b + 1];
        dz = p[a + 2] + (dz / l) * seg - p[b + 2];
        p[b] += dx * 0.34;
        p[b + 1] += dy * 0.34;
        p[b + 2] += dz * 0.34;
        const ex = p[b] - p[a],
          ey = p[b + 1] - p[a + 1],
          ez = p[b + 2] - p[a + 2];
        const f = seg / (Math.hypot(ex, ey, ez) || 1);
        p[b] = p[a] + ex * f;
        p[b + 1] = p[a + 1] + ey * f;
        p[b + 2] = p[a + 2] + ez * f;
      }
    for (let i = 0; i <= k; i++) {
      q[i * 3] = p[i * 3];
      q[i * 3 + 1] = p[i * 3 + 1];
      q[i * 3 + 2] = p[i * 3 + 2];
    }
  }

  update(dt) {
    this.time += dt;
    this.step(dt);
    this.place(dt);
    this.draw();
  }

  draw() {
    const geometry = this.mesh?.geometry;
    if (!geometry) return;
    const seg = this.length / (RINGS - 1);
    const knotAt = this.length - 0.16,
      lowKnot = this.grip[1] - 0.95;
    loft(
      geometry.attributes.position,
      geometry.attributes.normal,
      this.start,
      this.points,
      RINGS,
      SIDES,
      (i) => {
        const s = i * seg;
        const bump = (c, w, h) => h * Math.max(0, 1 - Math.abs(s - c) / w);
        return (
          RADIUS *
          (1 +
            bump(knotAt, 0.2, 0.9) +
            bump(lowKnot, 0.16, 0.6) +
            (i === RINGS - 1 ? -0.3 : 0))
        );
      },
      [-this.direction.y, 0, this.direction.x],
    );
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
  }

  telemetry() {
    const rest = this.at(this.grip[0] + 0.6);
    return {
      pivot: this.pivot.toArray().map((v) => +v.toFixed(2)),
      heading: [+this.heading.x.toFixed(3), +this.heading.y.toFixed(3)],
      grip: this.grip,
      held: !!this.held,
      angle: +this.angle.toFixed(3),
      mark: rest.toArray().map((v) => +v.toFixed(2)),
    };
  }
}
