import * as THREE from "three";
import { tuning } from "./combat-tuning.js";

const clamp = THREE.MathUtils.clamp;
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const LEGS = ["frontLeft", "frontRight", "backLeft", "backRight"];
const WALK = [0.25, 0.75, 0, 0.5];
const BOUND = [0, 0.1, 0.55, 0.65];

export const LYNX = Object.freeze({
  hp: 3,
  radius: 0.45,
  stalkSpeed: 2.3,
  dashSpeed: 6,
  stalkDistance: 6.5,
  pounceMin: 3,
  pounceMax: 7.5,
  windup: 0.95,
  leapSpeed: 9,
  hitRadius: 0.95,
  landing: 1.3,
  dazzle: 2.4,
  stun: 4.5,
  sprawl: 1.5,
  stagger: 0.35,
  pullSpeed: 6.5,
  pullStop: 2.3,
});

// It pounces on the spot where it last saw Nyra, so moving during the crouch is the dodge; the orb
// dazzles it or drags it from cover, and only bullets wound it.
export class FrostLynx {
  constructor(scene, world, model, options) {
    Object.assign(this, { scene, world, model }, options);
    this.kind = "lynx";
    this.radius = LYNX.radius;
    this.joints = model.userData.joints || {};
    this.rest = Object.fromEntries(
      Object.entries(this.joints).map(([name, joint]) => [
        name,
        {
          position: joint.position.clone(),
          rotation: joint.rotation.clone(),
        },
      ]),
    );
    this.legs = LEGS.map((name, index) => this.legFor(name, index)).filter(
      Boolean,
    );
    this.pose = {
      crouch: 0,
      pitch: 0,
      roll: 0,
      sway: 0,
      neck: 0,
      look: 0,
      tilt: 0,
      jaw: 0,
      ears: 0,
      droop: 0,
      tail: 0,
      lash: 0,
    };
    this.pos = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.centreAt = new THREE.Vector3();
    this.headAt = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.inverse = new THREE.Matrix4();
    model.traverse((node) => {
      if (node.isMesh) node.castShadow = node.receiveShadow = true;
    });
    scene.add(model);
    this.reset();
  }

  // Each leg is solved in its own plane: upper and lower bones, the knee bending the way it rests.
  legFor(name, index) {
    const upper = this.joints[name],
      lower = this.joints[name + "Lower"],
      paw = this.joints[name + "Paw"];
    if (!upper || !lower || !paw) return null;
    const u1 = lower.position,
      u2 = paw.position;
    const phi1 = Math.atan2(u1.z, -u1.y),
      phi2 = Math.atan2(u2.z, -u2.y);
    const reachZ = u1.z + u2.z,
      reachY = u1.y + u2.y;
    const sign = Math.sign(phi1 - Math.atan2(reachZ, -reachY)) || 1;
    const body = this.joints.body;
    return {
      name,
      index,
      upper,
      lower,
      paw,
      hip: upper.position.clone(),
      l1: Math.hypot(u1.y, u1.z),
      l2: Math.hypot(u2.y, u2.z),
      phi1,
      phi2,
      sign,
      front: index < 2,
      side: upper.position.x >= 0 ? 1 : -1,
      home: new THREE.Vector3(
        body.position.x + upper.position.x,
        body.position.y + upper.position.y + reachY,
        body.position.z + upper.position.z + reachZ,
      ),
      angles: [0, 0, 0],
      want: [0, 0, 0],
    };
  }

  center() {
    return this.centreAt.set(
      this.pos.x,
      this.feet + 0.6 + this.air,
      this.pos.z,
    );
  }

  head() {
    return this.headAt.set(
      this.pos.x + Math.sin(this.yaw) * 0.5,
      this.feet + 1.05 + this.air,
      this.pos.z + Math.cos(this.yaw) * 0.5,
    );
  }

  alive() {
    return this.hp > 0 && this.state !== "break";
  }

  get hidden() {
    return this.state === "hidden" || this.state === "lair";
  }

  get hostile() {
    return this.alive() && !["lair", "dazzled", "stunned"].includes(this.state);
  }

  onHit(hit) {
    if (!this.alive()) return false;
    if (hit?.kind === "orb") return this.pulse(hit);
    if (hit?.kind !== "pistol" || this.hitCooldown > 0) return false;
    this.hp -= 1;
    this.hitCooldown = 0.12;
    this.wounds++;
    this.blood?.spray(hit.point, hit.direction, 0.75);
    this.sound?.play("boar-hurt", 0.55);
    this.ground(true);
    if (this.hp <= 0) {
      this.enter("break");
      this.blood?.pool(
        () =>
          new THREE.Vector3(
            this.pos.x + Math.cos(this.yaw) * 0.12,
            this.feet,
            this.pos.z - Math.sin(this.yaw) * 0.12,
          ),
        0.48,
        () => this.state === "break" && this.t > 0.8,
      );
      this.onDefeat?.(this);
      return true;
    }
    this.enter("stagger");
    this.staggerTime = LYNX.stagger * (hit.stagger ?? 1);
    this.onWound?.(this);
    return true;
  }

  // A plain pulse dazzles it for a moment; a charged one spends its light to stun it for longer.
  pulse(orb) {
    const stun = tuning().stun;
    if (orb.charged) {
      orb.spend?.();
      this.ground(true);
      this.enter("stunned");
      this.dazeTime = LYNX.stun * stun;
      this.dazeGuard = this.dazeTime + 3;
      this.sound?.play("warden-hit");
      this.onDazed?.(this, true);
      return true;
    }
    if (this.dazeGuard > 0) {
      this.sound?.play("predator");
      return false;
    }
    this.ground(true);
    this.enter("dazzled");
    this.dazeTime = LYNX.dazzle * stun;
    this.dazeGuard = this.dazeTime + 4;
    this.sound?.play("warden-hit");
    this.onDazed?.(this, false);
    return true;
  }

  pull({ phase, from, dt = 0 }) {
    if (phase === "release") {
      if (this.state === "pulled") this.enter("sprawl");
      return true;
    }
    if (!this.alive()) return false;
    if (phase === "start") {
      this.wasHidden = this.hidden;
      if (this.wasHidden) this.fromCover++;
      this.ground(true);
      this.enter("pulled");
      this.sound?.play("predator");
      this.onPulled?.(this, this.wasHidden);
      return true;
    }
    const dx = from.x - this.pos.x,
      dz = from.z - this.pos.z,
      d = Math.hypot(dx, dz);
    if (d <= LYNX.pullStop) return false;
    const step = Math.min(d - LYNX.pullStop, LYNX.pullSpeed * dt);
    this.yaw += wrap(Math.atan2(dx, dz) - this.yaw) * Math.min(1, dt * 8);
    this.move(this.pos.x + (dx / d) * step, this.pos.z + (dz / d) * step);
    if (Math.random() < dt * 9)
      this.dust?.burst(this.pos.x, this.feet, this.pos.z, 0.35, 2);
    return true;
  }

  repel(hero) {
    const dx = this.pos.x - hero.pos.x,
      dz = this.pos.z - hero.pos.z,
      d = Math.hypot(dx, dz) || 1;
    this.ground(true);
    this.move(this.pos.x + (dx / d) * 1.2, this.pos.z + (dz / d) * 1.2);
    this.enter("sprawl");
    this.sound?.play("boar-hurt", 0.4);
    this.onRepelled?.(this);
  }

  enter(state) {
    this.state = state;
    this.t = 0;
  }

  ground(now = false) {
    if (this.state === "pounce" || now) {
      this.air = 0;
      const g = this.world.ground(
        this.pos.x,
        this.pos.z,
        0.2,
        this.feet + 0.6,
        0.6,
      );
      if (Number.isFinite(g) && g > -1e3) this.feet = g;
    }
  }

  move(x, z) {
    const previous = { ...this.pos };
    this.pos.x = x;
    this.pos.z = z;
    this.world.resolve(this.pos, 0.36, this.feet, 0.85, 0.35);
    const b = this.bounds;
    this.pos.x = clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = clamp(this.pos.z, b.minZ, b.maxZ);
    const g = this.world.ground(this.pos.x, this.pos.z, 0.2, this.feet, 0.5);
    if (!Number.isFinite(g) || g < this.feet - 0.6) {
      Object.assign(this.pos, previous);
      return false;
    }
    this.feet = g;
    return true;
  }

  steer(dt, x, z, speed, rate = 7) {
    const dx = x - this.pos.x,
      dz = z - this.pos.z,
      d = Math.hypot(dx, dz);
    if (d < 0.02) return d;
    this.yaw += wrap(Math.atan2(dx, dz) - this.yaw) * Math.min(1, dt * rate);
    const step = Math.min(d, speed * dt);
    this.move(this.pos.x + (dx / d) * step, this.pos.z + (dz / d) * step);
    return d;
  }

  face(x, z, dt, rate = 6) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw += clamp(wrap(want - this.yaw), -rate * dt, rate * dt);
  }

  sees(hero) {
    const dx = hero.pos.x - this.pos.x,
      dz = hero.pos.z - this.pos.z,
      d = Math.hypot(dx, dz) || 1;
    const hit = this.world.ray(
      this.pos.x,
      this.feet + 0.45,
      this.pos.z,
      dx / d,
      0,
      dz / d,
      d,
      (box) => !box.thin,
    );
    return !hit || hit.t > d - 0.5;
  }

  canPounce(hero, distance) {
    return (
      distance >= LYNX.pounceMin &&
      distance <= LYNX.pounceMax &&
      ["ground", "roll"].includes(hero.state) &&
      !hero.swimming &&
      hero.stun <= 0 &&
      Math.abs(hero.feet - this.feet) < 0.6 &&
      !this.guarded?.(hero) &&
      this.sees(hero)
    );
  }

  // The far side of the nearest cover from Nyra, or its lair when nothing fits.
  coverFrom(hero) {
    let best = null,
      score = Infinity;
    for (const c of this.covers) {
      const dx = c.x - hero.pos.x,
        dz = c.z - hero.pos.z,
        d = Math.hypot(dx, dz) || 1;
      const x = c.x + (dx / d) * (c.r + 0.65),
        z = c.z + (dz / d) * (c.r + 0.65);
      const b = this.bounds;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (Math.hypot(x - hero.pos.x, z - hero.pos.z) < 3.6) continue;
      const cost = Math.hypot(x - this.pos.x, z - this.pos.z);
      if (cost < score) {
        score = cost;
        best = { x, z };
      }
    }
    return best || { x: this.lair.x, z: this.lair.z };
  }

  retreat(hero) {
    this.goal = this.coverFrom(hero);
    this.enter("dash");
  }

  update(dt, hero, { engaged = false, onPounce } = {}) {
    if (dt <= 0) return;
    const T = tuning();
    const before = { ...this.pos };
    this.t += dt;
    this.time += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.dazeGuard = Math.max(0, this.dazeGuard - dt);
    const dx = hero.pos.x - this.pos.x,
      dz = hero.pos.z - this.pos.z,
      distance = Math.hypot(dx, dz);
    const speed = T.speed;
    this.look(hero);
    switch (this.state) {
      case "lair":
        if (engaged) {
          this.enter("hidden");
          this.wait = 1.8;
        }
        break;
      case "hidden":
        this.face(hero.pos.x, hero.pos.z, dt, 2.5);
        if (!engaged) {
          if (this.t > 2) this.goHome();
          break;
        }
        if (this.t < this.wait) break;
        if (this.canPounce(hero, distance)) this.windUp();
        else {
          this.enter("stalk");
          this.orbit = Math.random() < 0.5 ? -1 : 1;
          this.stalkTime = (2.2 + Math.random() * 1.4) / speed;
        }
        break;
      case "stalk": {
        if (!engaged) {
          this.goHome();
          break;
        }
        const d = distance || 1;
        const radial = clamp((distance - LYNX.stalkDistance) * 0.8, -1, 1);
        let vx = (dx / d) * radial + (-dz / d) * this.orbit * 0.8,
          vz = (dz / d) * radial + (dx / d) * this.orbit * 0.8;
        const length = Math.hypot(vx, vz) || 1;
        const b = this.bounds;
        const nx = this.pos.x + (vx / length) * 1.5,
          nz = this.pos.z + (vz / length) * 1.5;
        if (nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ)
          this.orbit = -this.orbit;
        this.move(
          this.pos.x + (vx / length) * LYNX.stalkSpeed * speed * dt,
          this.pos.z + (vz / length) * LYNX.stalkSpeed * speed * dt,
        );
        this.face(hero.pos.x, hero.pos.z, dt, 4);
        if (this.t > this.stalkTime && this.canPounce(hero, distance))
          this.windUp();
        else if (this.t > this.stalkTime + 4) this.retreat(hero);
        break;
      }
      case "dash": {
        const left = this.steer(
          dt,
          this.goal.x,
          this.goal.z,
          LYNX.dashSpeed * speed,
          9,
        );
        if (Math.random() < dt * 6)
          this.dust?.burst(this.pos.x, this.feet, this.pos.z, 0.3, 2);
        if (left < 0.3 || this.t > 4) {
          this.enter(this.goal.home && !engaged ? "lair" : "hidden");
          this.wait = 2.2 + Math.random() * 1.6;
        }
        break;
      }
      case "windup": {
        const k = this.t / this.windupTime;
        if (k < 0.8) this.face(hero.pos.x, hero.pos.z, dt, 7);
        for (const [mark, strength] of [
          [0.3, 0.5],
          [0.65, 0.7],
        ])
          if (this.lastK < mark && k >= mark)
            this.dust?.burst(
              this.pos.x - Math.sin(this.yaw) * 0.4,
              this.feet,
              this.pos.z - Math.cos(this.yaw) * 0.4,
              strength,
              6,
            );
        this.lastK = k;
        if (!engaged) this.retreat(hero);
        else if (k >= 1) this.leap(hero, T);
        break;
      }
      case "pounce": {
        const k = Math.min(1, this.t / this.flight);
        const x = this.from.x + (this.leapTo.x - this.from.x) * k,
          z = this.from.z + (this.leapTo.z - this.from.z) * k;
        this.move(x, z);
        this.air = Math.sin(Math.PI * k) * this.arc;
        const close =
          Math.hypot(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z) <
            LYNX.hitRadius * 0.75 && k > 0.55;
        if (k >= 1 || close) {
          this.air = 0;
          this.dust?.burst(this.pos.x, this.feet, this.pos.z, 1.1, 14);
          this.sound?.play("thud");
          const reach = Math.hypot(
            hero.pos.x - this.pos.x,
            hero.pos.z - this.pos.z,
          );
          if (
            reach < LYNX.hitRadius &&
            Math.abs(hero.feet - this.feet) < 1.1 &&
            !["hang", "climb"].includes(hero.state)
          ) {
            if (hero.shield?.deflect(this.pos.x, this.pos.z, hero)) {
              this.repel(hero);
              break;
            }
            this.struck = !!onPounce?.(this);
          }
          this.enter("land");
          this.landTime = LYNX.landing * T.opening;
        }
        break;
      }
      case "land":
        if (this.t >= this.landTime) {
          if (this.struck || Math.random() < 0.45) this.retreat(hero);
          else {
            this.enter("stalk");
            this.orbit = -this.orbit || 1;
            this.stalkTime = (1.6 + Math.random()) / speed;
          }
          this.struck = false;
        }
        break;
      case "stagger":
        if (this.t >= this.staggerTime) this.retreat(hero);
        break;
      case "dazzled":
      case "stunned":
        if (this.t >= this.dazeTime) {
          this.enter("stalk");
          this.orbit = this.orbit || 1;
          this.stalkTime = 1.2 / speed;
        }
        break;
      case "pulled":
        if (this.t > 1.8) this.enter("sprawl");
        break;
      case "sprawl":
        if (this.t >= LYNX.sprawl * T.opening) this.retreat(hero);
        break;
      case "break":
        break;
    }
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / dt;
    this.vel.x = (this.pos.x - before.x) / dt;
    this.vel.z = (this.pos.z - before.z) / dt;
    this.animate(
      dt,
      this.state === "pounce" || this.state === "pulled" ? 0 : moved,
    );
    this.place();
  }

  goHome() {
    this.goal = { x: this.lair.x, z: this.lair.z, home: true };
    this.enter("dash");
  }

  windUp() {
    this.enter("windup");
    this.windupTime = LYNX.windup * tuning().windup;
    this.lastK = 0;
    this.sound?.play("predator");
    this.onWindup?.(this);
  }

  leap(hero, T) {
    const lead = T.windup < 1 ? 0.18 : 0;
    let x = hero.pos.x + hero.vel.x * lead,
      z = hero.pos.z + hero.vel.z * lead;
    const dx = x - this.pos.x,
      dz = z - this.pos.z,
      d = Math.hypot(dx, dz) || 1;
    const reach = Math.min(d, LYNX.pounceMax + 0.5);
    x = this.pos.x + (dx / d) * reach;
    z = this.pos.z + (dz / d) * reach;
    this.from = { ...this.pos };
    this.leapTo = { x, z };
    this.yaw = Math.atan2(dx, dz);
    this.flight = clamp(reach / (LYNX.leapSpeed * T.speed), 0.42, 0.85);
    this.arc = 0.55 + reach * 0.07;
    this.struck = false;
    this.enter("pounce");
    this.sound?.play("pounce");
    this.dust?.burst(this.pos.x, this.feet, this.pos.z, 0.9, 10);
  }

  animate(dt, speed) {
    const J = this.joints;
    if (!J.body) return;
    const P = this.pose;
    const t = this.time;
    const s = this.state;
    const want = {
      crouch: 0,
      pitch: 0,
      roll: 0,
      sway: 0,
      neck: 0,
      look: 0,
      tilt: 0,
      jaw: 0,
      ears: 0,
      droop: 0,
      tail: 0,
      lash: Math.sin(t * 1.7) * 0.15,
    };
    let legs = "gait";
    if (s === "lair" || s === "hidden") {
      want.crouch = 1.15;
      want.pitch = 0.06;
      want.neck = 0.3;
      want.tail = -0.2;
      want.lash = Math.sin(t * 2.4) * 0.1;
    } else if (s === "stalk") {
      want.crouch = 0.55;
      want.pitch = 0.07;
      want.neck = 0.35;
      want.ears = 0.15;
      want.tail = -0.15;
      want.lash = Math.sin(t * 3.2) * 0.25;
    } else if (s === "dash") {
      want.crouch = 0.2;
      want.neck = 0.15;
      want.tail = 0.2;
    } else if (s === "windup") {
      const k = smooth(this.t / 0.25);
      want.crouch = 1.05 * k;
      want.pitch = 0.16 * k;
      want.neck = 0.45 * k;
      want.sway = Math.sin(t * 24) * 0.07 * k;
      want.roll = Math.sin(t * 24) * 0.05 * k;
      want.jaw = 0.45 * k;
      want.ears = 1 * k;
      want.tail = 0.1;
      want.lash = Math.sin(t * 16) * 0.6 * k;
    } else if (s === "pounce") {
      legs = "leap";
      const k = this.t / this.flight;
      want.pitch = k < 0.5 ? -0.32 : 0.28 * smooth((k - 0.5) * 2);
      want.neck = 0.1;
      want.jaw = 0.55;
      want.ears = 1;
      want.tail = 0.35;
    } else if (s === "land") {
      const k = Math.exp(-this.t * 4);
      want.crouch = 0.7 * k + 0.25;
      want.roll = Math.sin(this.t * 26) * 0.12 * Math.max(0, 1 - this.t * 1.4);
      want.neck = 0.25;
      want.tilt = Math.sin(this.t * 30) * 0.3 * Math.max(0, 1 - this.t * 1.6);
      want.ears = 0.4 * k;
    } else if (s === "stagger") {
      const k = 1 - smooth(this.t / this.staggerTime);
      want.crouch = 0.5;
      want.pitch = -0.2 * k;
      want.roll = 0.2 * k;
      want.neck = -0.3 * k;
      want.ears = 0.9;
      want.jaw = 0.4 * k;
    } else if (s === "dazzled" || s === "stunned") {
      const deep = s === "stunned" ? 1 : 0.6;
      want.crouch = 0.45 * deep;
      want.roll = Math.sin(t * 2.3) * 0.12 * deep;
      want.sway = Math.sin(t * 1.7) * 0.1 * deep;
      want.neck = 0.4 * deep;
      want.tilt = Math.sin(t * 1.9) * 0.45 * deep;
      want.droop = deep;
      want.jaw = 0.12;
      want.tail = -0.35;
    } else if (s === "pulled") {
      legs = "brace";
      want.crouch = 0.35;
      want.pitch = -0.18;
      want.neck = -0.2;
      want.jaw = 0.5;
      want.ears = 1;
      want.lash = Math.sin(t * 20) * 0.5;
    } else if (s === "sprawl") {
      legs = "sprawl";
      const up = smooth((this.t - LYNX.sprawl * 0.6) / (LYNX.sprawl * 0.4));
      want.crouch = 1.9 * (1 - up) + 0.4 * up;
      want.roll = 0.22 * (1 - up);
      want.neck = 0.15;
      want.tilt = 0.25 * (1 - up);
      want.ears = 0.6;
      want.droop = 0.4 * (1 - up);
    } else if (s === "break") {
      legs = "limp";
      const fall = smooth(this.t / 0.6);
      want.crouch = 2.1 * fall;
      want.roll = 1.35 * fall;
      want.neck = 0.5 * fall;
      want.tilt = 0.4 * fall;
      want.droop = fall;
      want.jaw = 0.2 * fall;
      want.tail = -0.2;
      want.lash = 0;
    }
    const blend = 1 - Math.exp(-dt * (s === "break" ? 6 : 12));
    for (const key of Object.keys(want)) P[key] += (want[key] - P[key]) * blend;
    const rest = this.rest;
    const bob =
      legs === "gait" && speed > 0.1
        ? -Math.abs(Math.sin(this.gait * Math.PI * 2)) *
          Math.min(0.035, speed * 0.008)
        : 0;
    J.body.position.set(
      rest.body.position.x + P.sway * 0.25,
      rest.body.position.y - 0.2 * P.crouch + bob,
      rest.body.position.z,
    );
    J.body.rotation.set(
      rest.body.rotation.x + P.pitch,
      rest.body.rotation.y + P.sway,
      rest.body.rotation.z + P.roll,
    );
    this.posture(dt, speed, legs);
    const look = this.lookAngle ?? 0;
    if (J.neck)
      J.neck.rotation.set(
        rest.neck.rotation.x + P.neck - P.pitch * 0.6,
        rest.neck.rotation.y + clamp(look * 0.4, -0.45, 0.45),
        rest.neck.rotation.z,
      );
    if (J.head)
      J.head.rotation.set(
        rest.head.rotation.x - P.neck * 0.4,
        rest.head.rotation.y + clamp(look * 0.6, -0.6, 0.6),
        rest.head.rotation.z + P.tilt,
      );
    if (J.jaw)
      J.jaw.rotation.x =
        rest.jaw.rotation.x + P.jaw * (0.85 + 0.15 * Math.sin(t * 30));
    for (const [name, side] of [
      ["leftEar", 1],
      ["rightEar", -1],
    ]) {
      const ear = J[name];
      if (!ear) continue;
      const twitch = Math.max(0, Math.sin(t * 0.9 + side * 2) - 0.92) * 3;
      ear.rotation.set(
        rest[name].rotation.x - P.ears * 0.85 + twitch * 0.2,
        rest[name].rotation.y,
        rest[name].rotation.z - side * (P.ears * 0.35 + P.droop * 0.7),
      );
    }
    if (J.tail)
      J.tail.rotation.set(
        rest.tail.rotation.x + P.tail,
        rest.tail.rotation.y + P.lash,
        rest.tail.rotation.z,
      );
  }

  // Legs: planted strides by two-bone reach in the gait, fixed shapes in the air and on the ground.
  posture(dt, speed, mode) {
    const body = this.joints.body;
    body.updateMatrix();
    this.inverse.copy(body.matrix).invert();
    const moving = mode === "gait" && speed > 0.08;
    const bounding = speed > 3.5;
    const frequency = moving ? 0.9 + speed * 0.32 : 0;
    this.gait = (this.gait + dt * frequency) % 1;
    const stride = moving ? Math.min(1.1, speed / frequency) : 0;
    const duty = bounding ? 0.42 : 0.62;
    const lift = 0.06 + 0.05 * Math.min(1, speed / 4);
    const crouch = this.pose.crouch;
    for (const leg of this.legs) {
      if (mode === "gait" || mode === "brace") {
        let z = 0,
          y = 0;
        if (moving) {
          const p = (this.gait + (bounding ? BOUND : WALK)[leg.index]) % 1;
          if (p < duty) z = stride / 2 - stride * (p / duty);
          else {
            const u = (p - duty) / (1 - duty);
            z = -stride / 2 + stride * smooth(u);
            y = Math.sin(Math.PI * u) * lift;
          }
        } else if (this.state === "windup" && !leg.front)
          y = Math.max(0, Math.sin(this.time * 24 + leg.side * 1.6)) * 0.035;
        if (mode === "brace") z += leg.front ? 0.2 : -0.12;
        else z += (leg.front ? 0.05 : -0.03) * Math.min(1, crouch);
        this.target
          .set(
            leg.home.x * (1 + 0.15 * Math.min(1, crouch)),
            leg.home.y + y,
            leg.home.z + z,
          )
          .applyMatrix4(this.inverse);
        this.solve(leg, this.target);
      } else {
        const out = leg.side;
        const shape = {
          leap: leg.front ? [-1.25, -0.35] : [1.0, 0.65],
          sprawl: leg.front ? [-1.0, 0.6] : [1.15, -0.4],
          limp: leg.front ? [-0.5, 0.7] : [0.7, -0.6],
        }[mode];
        leg.want[0] = shape[0];
        leg.want[1] = shape[1];
        leg.want[2] = -(shape[0] + shape[1]) * 0.5;
        leg.upper.rotation.z =
          mode === "sprawl" ? -out * 0.45 : mode === "limp" ? -out * 0.2 : 0;
      }
      if (mode === "gait" || mode === "brace") leg.upper.rotation.z = 0;
      const rate = mode === "gait" ? 40 : 14;
      const k = 1 - Math.exp(-dt * rate);
      for (let i = 0; i < 3; i++)
        leg.angles[i] += (leg.want[i] - leg.angles[i]) * k;
      leg.upper.rotation.x = leg.angles[0];
      leg.lower.rotation.x = leg.angles[1];
      leg.paw.rotation.x = leg.angles[2];
    }
  }

  solve(leg, target) {
    const dy = target.y - leg.hip.y,
      dz = target.z - leg.hip.z;
    const d = clamp(
      Math.hypot(dy, dz),
      Math.abs(leg.l1 - leg.l2) + 0.02,
      leg.l1 + leg.l2 - 0.003,
    );
    const toward = Math.atan2(dz, -dy);
    const bend = Math.acos(
      clamp((leg.l1 ** 2 + d * d - leg.l2 ** 2) / (2 * leg.l1 * d), -1, 1),
    );
    const phi1 = toward + leg.sign * bend;
    const kneeY = leg.hip.y - Math.cos(phi1) * leg.l1,
      kneeZ = leg.hip.z + Math.sin(phi1) * leg.l1;
    const phi2 = Math.atan2(target.z - kneeZ, -(target.y - kneeY));
    const r1 = leg.phi1 - phi1;
    const r2 = leg.phi2 - r1 - phi2;
    leg.want[0] = r1;
    leg.want[1] = r2;
    leg.want[2] = -(r1 + r2 + this.joints.body.rotation.x);
  }

  place() {
    this.model.position.set(this.pos.x, this.feet + this.air, this.pos.z);
    this.model.rotation.set(0, this.yaw, 0, "YXZ");
  }

  look(hero) {
    const want = Math.atan2(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z);
    this.lookAngle = clamp(wrap(want - this.yaw), -1, 1);
  }

  reset() {
    this.hp = LYNX.hp;
    this.wounds = this.fromCover = 0;
    this.pos.x = this.lair.x;
    this.pos.z = this.lair.z;
    this.feet = this.lair.feet;
    this.yaw = this.lair.yaw;
    this.vel.x = this.vel.z = 0;
    this.air = 0;
    this.time = this.t = 0;
    this.gait = 0;
    this.hitCooldown = this.dazeGuard = 0;
    this.wait = 0;
    this.orbit = 1;
    this.struck = false;
    this.goal = null;
    this.lookAngle = 0;
    this.state = "lair";
    for (const key of Object.keys(this.pose)) this.pose[key] = 0;
    for (const [name, joint] of Object.entries(this.joints)) {
      joint.position.copy(this.rest[name].position);
      joint.rotation.copy(this.rest[name].rotation);
    }
    for (const leg of this.legs) {
      leg.angles.fill(0);
      leg.want.fill(0);
    }
    this.pose.crouch = 1.15;
    this.model.visible = true;
    this.animate(0.016, 0);
    this.place();
  }

  telemetry() {
    const r = (v) => +v.toFixed(2);
    return {
      state: this.state,
      since: r(this.t),
      hp: this.hp,
      at: [r(this.pos.x), r(this.feet + this.air), r(this.pos.z)],
      hidden: this.hidden,
      windup: this.state === "windup" ? r(this.t / this.windupTime) : 0,
      crouch: r(this.windupTime ?? 0),
      leapTo:
        this.state === "pounce" && this.leapTo
          ? [r(this.leapTo.x), r(this.leapTo.z)]
          : null,
      dazed: ["dazzled", "stunned"].includes(this.state),
      wounds: this.wounds,
      fromCover: this.fromCover,
    };
  }
}
