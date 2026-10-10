import * as THREE from "three";
import { clamp } from "./world.js";
import { ROPE_STEP } from "./swing-rope.js";

// The rope swing as a pendulum about the rope's pivot, integrated on the rope's fixed step so
// that every frame rate swings the same arc.
const R = 0.32,
  GRAVITY = 21,
  // Below the hands the body's weight hangs this far down the rope.
  WEIGHT = 1.0,
  DAMP = 0.12,
  PUMP = 5.2,
  LIMIT = 1.25,
  CATCH = 0.7,
  STEER = 0.55,
  STEER_LIMIT = 0.3,
  COOL = 0.6;

const plane = new THREE.Vector3(),
  probe = new THREE.Vector3();

export const swinging = {
  catchRope(dt, input) {
    this.pendulum = null;
    this.ropeCool = Math.max(0, (this.ropeCool ?? 0) - dt);
    if (!this.ropes?.length || this.ropeCool > 0 || this.stun > 0) return false;
    if (input.drop) return false;
    const hx = this.pos.x,
      hy = this.feet + this.hands - 0.12,
      hz = this.pos.z;
    let best = null;
    for (const rope of this.ropes) {
      const [lo, hi] = rope.grip;
      rope.at(lo, plane);
      rope.at(hi, probe);
      const ax = probe.x - plane.x,
        ay = probe.y - plane.y,
        az = probe.z - plane.z;
      const len2 = ax * ax + ay * ay + az * az || 1;
      const t = clamp(
        ((hx - plane.x) * ax + (hy - plane.y) * ay + (hz - plane.z) * az) /
          len2,
        0,
        1,
      );
      const d = Math.hypot(
        plane.x + ax * t - hx,
        plane.y + ay * t - hy,
        plane.z + az * t - hz,
      );
      if (d < CATCH && (!best || d < best.d))
        best = { rope, d, length: lo + (hi - lo) * t };
    }
    return !!best && this.beginSwing(best.rope, best.length);
  },

  beginSwing(rope, length) {
    const h = rope.heading;
    const along = this.vel.x * h.x + this.vel.z * h.y;
    const facing = Math.sin(this.yaw) * h.x + Math.cos(this.yaw) * h.y;
    const sign =
      Math.abs(along) > 0.5 ? Math.sign(along) : Math.sign(facing) || 1;
    const dir = new THREE.Vector2(h.x * sign, h.y * sign);
    const p = rope.pivot;
    const ox = this.pos.x - p.x,
      oz = this.pos.z - p.z;
    const forward = ox * dir.x + oz * dir.y;
    const down = p.y - (this.feet + this.hands);
    const angle = clamp(Math.atan2(forward, Math.max(0.2, down)), -1, 1);
    const reach = length + WEIGHT;
    const tangent =
      (this.vel.x * dir.x + this.vel.z * dir.y) * Math.cos(angle) +
      this.vel.y * Math.sin(angle);
    const before = { x: this.pos.x, z: this.pos.z, feet: this.feet };
    const swing = {
      rope,
      length,
      reach,
      angle,
      spin: clamp(tangent / reach, -3, 3),
      dir,
      heading: dir.clone(),
      steer: 0,
      carry: 0,
      pump: 0,
      grip: new THREE.Vector3(),
      t: 0,
    };
    this.pendulum = swing;
    this.placeOnRope();
    if (!this.bodyFree()) {
      this.pendulum = null;
      Object.assign(this.pos, { x: before.x, z: before.z });
      this.feet = before.feet;
      return false;
    }
    this.state = "swing";
    this.t = 0;
    rope.grab(this);
    this.snap.x += before.x - this.pos.x;
    this.snap.z += before.z - this.pos.z;
    this.stepLift += before.feet - this.feet;
    this.yaw = Math.atan2(dir.x, dir.y);
    this.waterLanding = false;
    this.buffer = 0;
    this.events.push("grab");
    return true;
  },

  placeOnRope(swing = this.pendulum) {
    const p = swing.rope.pivot,
      d = swing.dir,
      s = Math.sin(swing.angle),
      c = Math.cos(swing.angle);
    swing.grip.set(
      p.x + d.x * s * swing.length,
      p.y - c * swing.length,
      p.z + d.y * s * swing.length,
    );
    const body = swing.length + this.hands;
    this.pos.x = p.x + d.x * s * body;
    this.pos.z = p.z + d.y * s * body;
    this.feet = p.y - c * body;
  },

  swing(dt, input) {
    const sw = this.pendulum;
    if (!sw) return this.dropRope(0);
    sw.t += dt;
    this.prompt = "swing";
    if (dt <= 0) return;
    if (input.jump && sw.t > 0.12) return this.dropRope(1);
    if (input.drop && sw.t > 0.12) return this.dropRope(0);
    // The stick reads in the swing's own frame, so a camera turned to watch the arc does not
    // turn forward into a steer.
    const ahead = Math.atan2(sw.heading.x, sw.heading.y);
    const yaw = Math.cos(input.camYaw - ahead) >= 0 ? ahead : ahead + Math.PI;
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    sw.wish = {
      x: fx * input.move.y - fz * input.move.x,
      z: fz * input.move.y + fx * input.move.x,
    };
    sw.carry += dt;
    while (sw.carry >= ROPE_STEP - 1e-9) {
      sw.carry -= ROPE_STEP;
      if (!this.swingStep(ROPE_STEP)) return;
    }
    this.placeOnRope();
    const v = sw.spin * sw.reach;
    this.vel.x = sw.dir.x * Math.cos(sw.angle) * v;
    this.vel.z = sw.dir.y * Math.cos(sw.angle) * v;
    this.vel.y = Math.sin(sw.angle) * v;
    this.yaw = Math.atan2(sw.dir.x, sw.dir.y);
  },

  // One fixed step of the pendulum; false when the swing ended against the world.
  swingStep(h) {
    const sw = this.pendulum,
      wish = sw.wish;
    const side = wish.x * -sw.dir.y + wish.z * sw.dir.x;
    sw.steer = clamp(sw.steer + side * STEER * h, -STEER_LIMIT, STEER_LIMIT);
    const cs = Math.cos(sw.steer),
      sn = Math.sin(sw.steer);
    sw.dir.set(
      sw.heading.x * cs - sw.heading.y * sn,
      sw.heading.x * sn + sw.heading.y * cs,
    );
    sw.pump = wish.x * sw.dir.x + wish.z * sw.dir.y;
    const pump =
      Math.abs(sw.pump) > 0.2 &&
      (sw.pump * sw.spin > 0 || Math.abs(sw.spin) < 0.3)
        ? PUMP * sw.pump
        : 0;
    const accel =
      -(GRAVITY / sw.reach) * Math.sin(sw.angle) -
      DAMP * sw.spin +
      pump / sw.reach;
    const angle = sw.angle,
      spin = sw.spin;
    sw.spin += accel * h;
    if (spin * sw.spin < 0 && Math.abs(angle) > 0.25) this.events.push("rope");
    const top = GRAVITY * sw.reach * (1 - Math.cos(LIMIT));
    const height = GRAVITY * sw.reach * (1 - Math.cos(sw.angle));
    const kinetic = 0.5 * (sw.spin * sw.reach) ** 2;
    if (height + kinetic > top)
      sw.spin =
        (Math.sign(sw.spin) * Math.sqrt(Math.max(0, 2 * (top - height)))) /
        sw.reach;
    sw.angle += sw.spin * h;
    if (angle * sw.angle < 0 && Math.abs(sw.spin * sw.reach) > 4)
      this.events.push("swing");
    this.placeOnRope();
    if (this.bodyFree()) return true;
    const ground = this.world.ground(
      this.pos.x,
      this.pos.z,
      R * 0.6,
      this.feet + 0.45,
      0,
    );
    if (ground > -Infinity && ground >= this.feet - 0.05) {
      this.feet = Math.max(this.feet, ground);
      this.dropRope(0);
      return false;
    }
    sw.angle = angle;
    sw.spin = -spin * 0.3;
    this.placeOnRope();
    return true;
  },

  bodyFree() {
    const sw = this.pendulum,
      w = this.world;
    if (
      !w.free(
        this.pos.x,
        this.pos.z,
        R * 0.8,
        this.feet + 0.05,
        this.feet + 0.9,
      )
    )
      return false;
    const k = (this.hands - 0.55) / this.hands;
    const cx = sw.grip.x + (this.pos.x - sw.grip.x) * k,
      cy = sw.grip.y + (this.feet - sw.grip.y) * k,
      cz = sw.grip.z + (this.pos.z - sw.grip.z) * k;
    return w.free(cx, cz, R, cy - 0.35, cy + 0.35);
  },

  dropRope(boost) {
    const sw = this.pendulum;
    this.state = "air";
    this.t = 0;
    this.fallStart = this.feet;
    this.jumpCut = true;
    this.sinceJump = 0;
    this.coyote = 0;
    this.regrab = 0.2;
    this.ropeCool = COOL;
    if (sw) {
      const v = sw.spin * sw.reach;
      this.vel.x = sw.dir.x * Math.cos(sw.angle) * v + sw.dir.x * 0.7 * boost;
      this.vel.z = sw.dir.y * Math.cos(sw.angle) * v + sw.dir.y * 0.7 * boost;
      this.vel.y = Math.sin(sw.angle) * v + 1.5 * boost;
      sw.rope.release(sw.angle, sw.spin, sw.dir);
    }
    this.pendulum = null;
    this.events.push(boost ? "jump" : "let-go");
  },
};
