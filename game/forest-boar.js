import * as THREE from "three";
import { WardenPath, stampVisible } from "./warden-path.js";
import { BoarGait } from "./boar-gait.js";
import { tuning } from "./combat-tuning.js";

const clamp = THREE.MathUtils.clamp;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export class ForestBoar {
  constructor(
    scene,
    world,
    model,
    { x, z, yaw = 0, route, sound, boss = false, heavy = false },
  ) {
    Object.assign(this, { scene, world, model, sound, boss, heavy });
    this.scale = boss ? 1.35 : heavy ? 1.12 : 1;
    model.scale.multiplyScalar(this.scale);
    this.kind = "boar";
    this.combatStyle = boss
      ? "elder-boar"
      : heavy
        ? "bristle-boar"
        : "charging-boar";
    this.maxHp = boss ? 6 : 3;
    this.home = { x, z, yaw };
    this.route = route || [[x, z]];
    this.pos = { x, z };
    this.vel = { x: 0, z: 0 };
    this.navigation = new WardenPath(world);
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
    this.time = 0;
    this.gait = 0;
    this.tusks = [new THREE.Vector3(), new THREE.Vector3()];
    this.previousTusks = this.tusks.map(() => new THREE.Vector3());
    this.stepClock = 0;
    this.locomotion = new BoarGait(this);
    this.reset();
    scene.add(model);
  }

  get phaseNumber() {
    return this.boss && this.hp <= this.maxHp / 2 ? 2 : 1;
  }

  profile() {
    const second = this.phaseNumber === 2;
    return {
      speed: this.boss ? 3.1 : this.heavy ? 2.9 : 3.7,
      reach: this.boss ? 9.5 : 8,
      radius: this.boss ? 0.9 : this.heavy ? 0.72 : 0.63,
      windup: this.boss ? (second ? 1.05 : 1.3) : this.heavy ? 1.2 : 1,
      followup: second ? 0.95 : 1.1,
      chargeSpeed: this.boss ? (second ? 8.2 : 7.3) : 7.8,
      length: this.boss ? 10 : 8.5,
      recovery: this.boss ? 2.5 : this.heavy ? 1.8 : 1.5,
      charges: this.boss ? (second ? 3 : 2) : 1,
    };
  }

  get radius() {
    return 0.64 * this.scale;
  }

  get chargeRadius() {
    return this.combat.radius;
  }

  get hostile() {
    return [
      "alert",
      "chase",
      "windup",
      "charge",
      "sweep-windup",
      "sweep",
      "recover",
      "stagger",
      "pulled",
    ].includes(this.state);
  }

  get counterOpen() {
    return (
      this.alive() &&
      this.state === "recover" &&
      (this.recoveryKind !== "impact" || this.t >= 0.4) &&
      (!this.boss || this.windowDamage < 3)
    );
  }

  center() {
    return new THREE.Vector3(
      this.pos.x,
      this.feet + 0.64 * this.scale,
      this.pos.z,
    );
  }

  head() {
    return new THREE.Vector3(
      this.pos.x,
      this.feet + 1.5 * this.scale,
      this.pos.z,
    );
  }

  alive() {
    return !this.defeated && this.hp > 0 && this.state !== "break";
  }

  provoke() {
    if (!this.alive() || this.hostile) return false;
    this.state = "alert";
    this.t = 0;
    this.sound?.play("boar-alert");
    return true;
  }

  calm() {
    this.state = "patrol";
    this.t = 0;
    this.target = null;
    this.lane = null;
    this.attacksRemaining = 0;
    this.recoveryKind = "breath";
    this.vel.x = this.vel.z = 0;
    this.onTelegraph?.(this, null);
    this.navigation.reset();
  }

  windUp(hero, followup = false) {
    if (!followup) {
      this.combat = this.profile();
      this.attacksRemaining = this.combat.charges;
    }
    this.attacksRemaining--;
    this.attackIndex = this.combat.charges - this.attacksRemaining;
    this.windupDuration =
      (followup ? this.combat.followup : this.combat.windup) * tuning().windup;
    this.target = { x: hero.pos.x, z: hero.pos.z };
    const length = distance(this.pos, this.target);
    const direction =
      length > 0.001
        ? {
            x: (this.target.x - this.pos.x) / length,
            z: (this.target.z - this.pos.z) / length,
          }
        : { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const travel = Math.min(this.combat.length, Math.max(2.5, length + 2));
    this.lane = {
      from: { ...this.pos },
      to: {
        x: this.pos.x + direction.x * travel,
        z: this.pos.z + direction.z * travel,
      },
      direction,
      length: travel,
    };
    this.chargeTravel = 0;
    this.struck = false;
    this.state = "windup";
    this.t = 0;
    this.vel.x = this.vel.z = 0;
    this.onTelegraph?.(this, this.target);
    this.sound?.play("boar-alert");
  }

  windUpSweep(hero) {
    this.combat = this.profile();
    this.target = { ...hero.pos };
    this.lane = null;
    this.sweepYaw = Math.atan2(
      hero.pos.x - this.pos.x,
      hero.pos.z - this.pos.z,
    );
    this.sweepSign = this.sweepSerial++ % 2 ? -1 : 1;
    this.sweepCooldown = 6;
    this.sweepTime = 1.1 * tuning().windup;
    this.attacksRemaining = 0;
    this.struck = false;
    this.state = "sweep-windup";
    this.t = 0;
    this.vel.x = this.vel.z = 0;
    this.onTelegraph?.(this, this.target);
    this.sound?.play("boar-alert");
  }

  sweepContact(hero, onSlam) {
    const head = this.joints.head;
    if (!head) return;
    head.updateWorldMatrix(true, false);
    for (const [i, side] of [-1, 1].entries()) {
      const tip = this.tusks[i]
        .set(side * 0.27, -0.03, 0.644)
        .applyMatrix4(head.matrixWorld);
      const before = this.previousTusks[i];
      if (this.t >= 0.12 && this.t <= 0.5 && !this.struck) {
        const dx = tip.x - before.x,
          dz = tip.z - before.z,
          length = dx * dx + dz * dz;
        const along = length
          ? clamp(
              ((hero.pos.x - before.x) * dx + (hero.pos.z - before.z) * dz) /
                length,
              0,
              1,
            )
          : 0;
        if (
          Math.hypot(
            hero.pos.x - before.x - along * dx,
            hero.pos.z - before.z - along * dz,
          ) <
            0.28 + 0.16 * this.scale &&
          Math.abs(hero.feet - this.feet) < 1.1 &&
          stampVisible(this.world, this.pos, this.feet, hero)
        ) {
          this.struck = true;
          onSlam?.(this, tip.x, tip.z, true);
        }
      }
      before.copy(tip);
    }
  }

  recover(impact = false) {
    this.state = "recover";
    this.t = 0;
    this.recoveryKind = impact ? "impact" : "breath";
    this.recoveryDuration =
      (this.combat.recovery + (impact ? 0.8 : 0)) * tuning().opening;
    this.windowDamage = 0;
    this.vel.x = this.vel.z = 0;
    this.onTelegraph?.(this, null);
    if (impact) {
      this.sound?.play("boar-hurt", 0.65);
      this.sound?.play("boar-step", 1);
      this.warning?.impact(this);
    }
  }

  onHit(hit) {
    if (!this.alive()) return false;
    if (hit?.kind === "orb") return this.pulse(hit);
    if (hit?.kind !== "pistol") return false;
    if (this.boss && !this.counterOpen) {
      this.provoke();
      if (this.blockCooldown <= 0) {
        this.blockCooldown = 1;
        this.onBlocked?.();
        this.sound?.play("boar-alert");
      }
      return false;
    }
    if (this.hitCooldown > 0) return false;
    this.hp -= 1;
    this.windowDamage += 1;
    this.hitCooldown = 0.12;
    this.sound?.play("boar-hurt");
    this.blood?.spray(hit.point, hit.direction, this.scale);
    if (this.hp <= 0) {
      this.defeated = true;
      this.state = "break";
      this.t = 0;
      this.target = this.lane = null;
      this.attacksRemaining = 0;
      this.vel.x = this.vel.z = 0;
      this.onTelegraph?.(this, null);
      // Spreads from under the belly, the side the fallen body rolls away from.
      this.blood?.pool(
        () =>
          new THREE.Vector3(
            this.pos.x + Math.cos(this.yaw) * 0.22 * this.scale,
            this.feet,
            this.pos.z - Math.sin(this.yaw) * 0.22 * this.scale,
          ),
        0.68 * this.scale,
        () => this.state === "break" && this.t > 0.7,
      );
      this.onBreak?.(this);
    } else if (this.boss) {
      if (this.phaseNumber === 2 && !this.phaseAnnounced) {
        this.phaseAnnounced = true;
        this.onPhase?.();
      }
    } else if (this.recoveryKind !== "dazed" || this.state !== "recover") {
      this.state = "stagger";
      this.staggerTime = 0.35 * (hit.stagger ?? 1);
      this.t = 0;
      this.target = this.lane = null;
      this.attacksRemaining = 0;
      this.vel.x = this.vel.z = 0;
      this.onTelegraph?.(this, null);
    }
    return true;
  }

  // The relay never wounds: a charged pulse spends its light to daze, a plain one only jolts.
  pulse(orb) {
    this.provoke();
    if (orb.charged) {
      if (this.dazeGuard > 0) return this.shrug();
      orb.spend?.();
      this.state = "recover";
      this.t = 0;
      this.recoveryKind = "dazed";
      this.recoveryDuration = (this.boss ? 3.6 : 4) * tuning().stun;
      this.dazeGuard = this.recoveryDuration + 5;
      this.windowDamage = 0;
      this.target = this.lane = null;
      this.attacksRemaining = 0;
      this.vel.x = this.vel.z = 0;
      this.onTelegraph?.(this, null);
      this.sound?.play("boar-hurt", 0.55);
      this.onDazed?.(this);
      return true;
    }
    if (this.boss || this.state === "charge" || this.staggerGuard > 0)
      return this.shrug();
    const dx = this.pos.x - orb.prev.x,
      dz = this.pos.z - orb.prev.z,
      length = Math.hypot(dx, dz) || 1;
    this.move({
      x: this.pos.x + (dx / length) * 0.45,
      z: this.pos.z + (dz / length) * 0.45,
    });
    this.state = "stagger";
    this.staggerTime = 0.35;
    this.t = 0;
    this.staggerGuard = 2.5;
    this.target = this.lane = null;
    this.attacksRemaining = 0;
    this.onTelegraph?.(this, null);
    this.sound?.play("boar-alert", 0.6);
    return true;
  }

  // A held link breaks a charge and drags the animal off its line; Oldtusk only gives ground.
  pull({ phase, from, dt = 0 }) {
    if (phase === "release") {
      if (this.state === "pulled") {
        this.state = "stagger";
        this.staggerTime = this.boss ? 0.45 : 0.9;
        this.t = 0;
      }
      return true;
    }
    if (!this.alive()) return false;
    if (phase === "start") {
      this.provoke();
      this.state = "pulled";
      this.t = 0;
      this.target = this.lane = null;
      this.attacksRemaining = 0;
      this.vel.x = this.vel.z = 0;
      this.onTelegraph?.(this, null);
      this.sound?.play("boar-alert", 0.6);
      this.onPulled?.(this);
      return true;
    }
    const dx = from.x - this.pos.x,
      dz = from.z - this.pos.z,
      d = Math.hypot(dx, dz);
    const stop = 2.3 * this.scale;
    if (d <= stop) return false;
    const strength = this.boss ? 0.35 : this.heavy ? 0.7 : 1;
    const step = Math.min(d - stop, 5.5 * strength * dt);
    this.face(from.x, from.z, dt, 6);
    this.move({
      x: this.pos.x + (dx / d) * step,
      z: this.pos.z + (dz / d) * step,
    });
    return true;
  }

  repel(hero) {
    const dx = this.pos.x - hero.pos.x,
      dz = this.pos.z - hero.pos.z,
      d = Math.hypot(dx, dz) || 1;
    this.onTelegraph?.(this, null);
    this.state = "stagger";
    this.staggerTime = this.boss ? 0.6 : 1;
    this.t = 0;
    this.target = this.lane = null;
    this.attacksRemaining = 0;
    this.move({
      x: this.pos.x + (dx / d) * 0.9,
      z: this.pos.z + (dz / d) * 0.9,
    });
    this.sound?.play("boar-hurt", 0.5);
    this.onRepelled?.(this);
  }

  // The explanation waits a moment: a press that becomes a held link is not a shrugged pulse.
  shrug() {
    if (this.blockCooldown <= 0) {
      this.blockCooldown = 1;
      this.shrugAt = this.time;
      this.sound?.play("boar-alert");
    }
    return false;
  }

  face(x, z, dt, rate = 5) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    const difference = Math.atan2(
      Math.sin(want - this.yaw),
      Math.cos(want - this.yaw),
    );
    this.yaw += clamp(difference, -rate * dt, rate * dt);
  }

  walkToward(dt, target, speed, others) {
    const next = this.navigation.next(dt, this.pos, this.feet, target);
    const length = distance(this.pos, next);
    if (length < 0.001) return;
    this.face(next.x, next.z, dt);
    const move = Math.min(length, speed * dt);
    const point = {
      x: this.pos.x + ((next.x - this.pos.x) / length) * move,
      z: this.pos.z + ((next.z - this.pos.z) / length) * move,
    };
    for (const other of others) {
      if (other === this || other.defeated) continue;
      const separation = distance(point, other.pos);
      if (separation > 0.001 && separation < 1.3) {
        const push = Math.min((1.3 - separation) * 3 * dt, 0.15);
        point.x += ((point.x - other.pos.x) / separation) * push;
        point.z += ((point.z - other.pos.z) / separation) * push;
      }
    }
    this.move(point);
  }

  move(point) {
    this.lastMoveBlocked = false;
    const wanted = { ...point };
    const dx = Math.sin(this.yaw) * this.scale,
      dz = Math.cos(this.yaw) * this.scale;
    for (let pass = 0; pass < 2; pass++)
      for (const offset of [0, -0.35, 0.35, -0.7, 0.7]) {
        const probe = { x: point.x + dx * offset, z: point.z + dz * offset };
        this.world.resolve(
          probe,
          0.42 * this.scale,
          this.feet,
          1.15 * this.scale,
          0.3,
        );
        point.x = probe.x - dx * offset;
        point.z = probe.z - dz * offset;
      }
    const ground = this.world.ground(point.x, point.z, 0.2, this.feet, 0.5);
    if (!Number.isFinite(ground) || ground < this.feet - 0.5) return false;
    Object.assign(this.pos, point);
    this.feet = ground;
    this.lastMoveBlocked = distance(wanted, point) >= 0.05;
    return !this.lastMoveBlocked;
  }

  charge(dt, hero, onSlam) {
    const remaining = this.lane.length - this.chargeTravel;
    const travel = Math.min(
      remaining,
      this.combat.chargeSpeed * tuning().speed * dt,
    );
    const steps = Math.max(1, Math.ceil(travel / 0.18));
    let blocked = false;
    for (let i = 0; i < steps; i++) {
      const previous = { ...this.pos };
      const point = {
        x: this.pos.x + (this.lane.direction.x * travel) / steps,
        z: this.pos.z + (this.lane.direction.z * travel) / steps,
      };
      const clear = this.move(point);
      this.chargeTravel += distance(previous, this.pos);
      const dx = this.pos.x - previous.x,
        dz = this.pos.z - previous.z;
      const segment = dx * dx + dz * dz;
      const along =
        segment > 0
          ? clamp(
              ((hero.pos.x - previous.x) * dx +
                (hero.pos.z - previous.z) * dz) /
                segment,
              0,
              1,
            )
          : 0;
      const closest = {
        x: previous.x + along * dx,
        z: previous.z + along * dz,
      };
      if (
        !this.struck &&
        distance(hero.pos, closest) < this.chargeRadius + 0.28 &&
        Math.abs(hero.feet - this.feet) < 1.1 &&
        stampVisible(this.world, this.pos, this.feet, hero)
      ) {
        this.struck = true;
        if (hero.shield?.deflect(this.pos.x, this.pos.z, hero)) {
          this.repel(hero);
          return;
        }
        onSlam?.(this, this.pos.x, this.pos.z, true);
      }
      if (!clear) {
        blocked = true;
        break;
      }
    }
    if (
      blocked ||
      this.chargeTravel >= this.lane.length - 0.000001 ||
      travel < 0.001
    ) {
      this.onTelegraph?.(this, null);
      if (
        !blocked &&
        this.attacksRemaining > 0 &&
        distance(hero.pos, this.pos) < this.combat.reach &&
        !["hang", "climb"].includes(hero.state) &&
        stampVisible(this.world, this.pos, this.feet, hero)
      )
        this.windUp(hero, true);
      else if (
        !blocked &&
        this.boss &&
        this.phaseNumber === 2 &&
        this.sweepCooldown === 0 &&
        distance(hero.pos, this.pos) < 2.1 * this.scale &&
        !["hang", "climb"].includes(hero.state) &&
        Math.abs(hero.feet - this.feet) < 1.1 &&
        stampVisible(this.world, this.pos, this.feet, hero)
      )
        this.windUpSweep(hero);
      else this.recover(blocked && this.lastMoveBlocked);
    }
  }

  update(dt, hero, others = [], { onSlam } = {}) {
    if (dt <= 0) return;
    const previous = { ...this.pos };
    this.t += dt;
    this.time += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.blockCooldown = Math.max(0, this.blockCooldown - dt);
    this.sweepCooldown = Math.max(0, this.sweepCooldown - dt);
    this.dazeGuard = Math.max(0, this.dazeGuard - dt);
    this.staggerGuard = Math.max(0, this.staggerGuard - dt);
    if (this.shrugAt !== null && this.time - this.shrugAt > 0.4) {
      if (this.state !== "pulled") this.onShrug?.(this);
      this.shrugAt = null;
    }
    const near = distance(hero.pos, this.pos);
    if (this.state === "patrol") {
      const [x, z] = this.route[this.leg % this.route.length];
      if (this.idle > 0) this.idle -= dt;
      else if (distance(this.pos, { x, z }) < 0.35) {
        this.leg++;
        this.idle = 1.2;
      } else this.walkToward(dt, { x, z }, 1.2, others);
    } else if (this.state === "alert") {
      this.face(hero.pos.x, hero.pos.z, dt, 6);
      if (this.t >= 0.55) {
        this.state = "chase";
        this.t = 0;
      }
    } else if (this.state === "chase") {
      this.lost = near > 22 ? this.lost + dt : 0;
      if (this.lost >= 3) this.calm();
      else if (
        near <= this.combat.reach &&
        !["hang", "climb"].includes(hero.state) &&
        Math.abs(hero.feet - this.feet) < 1.2 &&
        stampVisible(this.world, this.pos, this.feet, hero)
      ) {
        if (
          this.boss &&
          this.phaseNumber === 2 &&
          this.sweepCooldown === 0 &&
          near < 2.1 * this.scale
        )
          this.windUpSweep(hero);
        else this.windUp(hero);
      } else
        this.walkToward(
          dt,
          hero.pos,
          this.combat.speed * tuning().speed,
          others,
        );
    } else if (this.state === "windup") {
      this.face(this.lane.to.x, this.lane.to.z, dt, 8);
      if (this.t >= this.windupDuration) {
        this.state = "charge";
        this.t = 0;
        this.yaw = Math.atan2(this.lane.direction.x, this.lane.direction.z);
        this.sound?.play("boar-charge");
      }
    } else if (this.state === "charge") this.charge(dt, hero, onSlam);
    else if (this.state === "sweep-windup") {
      this.face(this.target.x, this.target.z, dt, 8);
      if (this.t >= (this.sweepTime ?? 1.1)) {
        this.state = "sweep";
        this.t = 0;
        this.yaw = this.sweepYaw;
        this.sound?.play("boar-charge", 0.7);
      }
    } else if (this.state === "sweep" && this.t >= 0.65) this.recover();
    else if (this.state === "recover" && this.t >= this.recoveryDuration) {
      this.state = "chase";
      this.t = 0;
    } else if (this.state === "stagger" && this.t >= this.staggerTime) {
      this.state = "chase";
      this.t = 0;
    } else if (this.state === "pulled" && this.t > 1.6) {
      this.state = "stagger";
      this.staggerTime = 0.6;
      this.t = 0;
    }
    const speed = distance(previous, this.pos) / dt;
    this.vel.x = (this.pos.x - previous.x) / dt;
    this.vel.z = (this.pos.z - previous.z) / dt;
    this.animate(dt, speed);
    this.place();
    if (this.state === "sweep") this.sweepContact(hero, onSlam);
    this.stepClock = Math.max(0, this.stepClock - dt);
    if (
      speed > 0.5 &&
      near < 18 &&
      this.stepClock === 0 &&
      this.locomotion.contacts.length
    ) {
      this.stepClock = 0.09;
      this.sound?.play("boar-step", Math.max(0.12, 1 - near / 18));
    }
    this.warning?.update(dt, this);
  }

  animate(dt, speed) {
    if (this.fallLift !== null) return;

    const moving = clamp(speed / 1.2, 0, 1);
    const pose = {},
      set = (name, x = 0, y = 0, z = 0) => {
        pose[name] = [x, y, z];
      };
    for (const [name, phase] of [
      ["frontLeft", 0],
      ["frontRight", Math.PI],
      ["backLeft", Math.PI],
      ["backRight", 0],
    ]) {
      const swing = Math.sin(this.gait + phase) * moving;
      set(name, swing * 0.58);
      set(name + "Lower", Math.max(0, -swing) * 0.95);
    }
    let bob = -Math.abs(Math.sin(this.gait)) * 0.028 * moving;
    set(
      "head",
      0.02 + Math.sin(this.time * 1.7) * 0.035,
      Math.sin(this.time * 0.7) * 0.035,
    );
    set("tail", 0, Math.sin(this.time * 3.5) * 0.14);
    set("leftEar", 0, 0, Math.sin(this.time * 2.1) * 0.025);
    set("rightEar", 0, 0, -Math.sin(this.time * 2.1) * 0.025);
    if (this.state === "windup") {
      const paw = Math.sin(this.t * 15) * 0.3;
      set("head", 0.36, 0, 0);
      set("frontRight", paw - 0.16);
      set("frontRightLower", Math.max(0, -paw) * 0.8);
      set("leftEar", 0.2, 0, 0.12);
      set("rightEar", 0.2, 0, -0.12);
    } else if (this.state === "charge") {
      set("head", 0.3);
      set("tail", 0.18);
    } else if (this.state === "sweep-windup") {
      set("head", 0.12, -this.sweepSign * smooth(this.t / 0.7) * 0.85);
      set("leftEar", 0.22, 0, 0.08);
      set("rightEar", 0.22, 0, -0.08);
    } else if (this.state === "sweep") {
      const swing = smooth((this.t - 0.06) / 0.32);
      set(
        "head",
        0.12 - Math.sin(swing * Math.PI) * 0.16,
        this.sweepSign * (-0.85 + swing * 1.7),
      );
    } else if (this.state === "recover") {
      const shock = this.recoveryKind === "impact" ? Math.exp(-this.t * 7) : 0;
      const daze =
        this.recoveryKind === "dazed"
          ? smooth(this.t * 4) *
            (1 - smooth((this.t - this.recoveryDuration + 0.5) * 2))
          : 0;
      set(
        "head",
        0.25 +
          Math.sin(this.time * 7) * 0.055 * (1 - daze) -
          shock * 0.45 +
          daze * 0.2,
        Math.sin(this.t * 23) * shock * 0.22 +
          Math.sin(this.time * 2.6) * 0.34 * daze,
        Math.sin(this.time * 1.9) * 0.2 * daze,
      );
      set(
        "body",
        Math.sin(this.time * 7) * 0.01,
        0,
        Math.sin(this.time * 2.1) * 0.08 * daze,
      );
      set("leftEar", -0.3 * daze, 0, 0.2 * daze);
      set("rightEar", -0.3 * daze, 0, -0.2 * daze);
    } else if (this.state === "stagger") set("head", -0.22);
    else if (this.state === "pulled") {
      const scramble = Math.sin(this.time * 18);
      set("head", -0.3, Math.sin(this.time * 9) * 0.12);
      set("frontLeft", -0.55 + scramble * 0.12);
      set("frontRight", -0.55 - scramble * 0.12);
      set("backLeft", 0.35);
      set("backRight", 0.35);
      set("leftEar", -0.3, 0, 0.2);
      set("rightEar", -0.3, 0, -0.2);
    } else if (this.state === "break") {
      const fall = smooth(this.t / 0.6);
      set("body", 0, 0, 1.4 * fall);
      set("head", 0.3 * fall);
      for (const name of ["frontLeft", "frontRight", "backLeft", "backRight"]) {
        set(name, -0.55 * fall);
        set(name + "Lower", 1.25 * fall);
      }
      bob = 0;
    }
    const blend = 1 - Math.exp(-dt * (this.state === "break" ? 8 : 14));
    for (const [name, node] of Object.entries(this.joints)) {
      const rest = this.rest[name],
        target = pose[name] || [0, 0, 0];
      node.rotation.x +=
        (rest.rotation.x + target[0] - node.rotation.x) * blend;
      node.rotation.y +=
        (rest.rotation.y + target[1] - node.rotation.y) * blend;
      node.rotation.z +=
        (rest.rotation.z + target[2] - node.rotation.z) * blend;
    }
    const body = this.joints.body;
    if (body) body.position.y = this.rest.body.position.y + bob;
    this.locomotion.update(dt, speed);
  }

  place() {
    this.model.position.set(this.pos.x, this.feet, this.pos.z);
    this.model.rotation.set(0, this.yaw, 0, "YXZ");
    if (this.state === "break") {
      this.placeFallen();
    } else {
      const dx = Math.sin(this.yaw) * 0.55,
        dz = Math.cos(this.yaw) * 0.55;
      const front = this.world.ground(
        this.pos.x + dx,
        this.pos.z + dz,
        0.1,
        this.feet,
        0.5,
      );
      const back = this.world.ground(
        this.pos.x - dx,
        this.pos.z - dz,
        0.1,
        this.feet,
        0.5,
      );
      if (Number.isFinite(front) && Number.isFinite(back))
        this.model.rotation.x = clamp(
          -Math.atan2(front - back, 1.1),
          -0.25,
          0.25,
        );
    }
    this.locomotion?.solve();
  }

  placeFallen() {
    const frame = (this.fallFrame ||= {
      normal: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      right: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      rotation: new THREE.Quaternion(),
      bounds: new THREE.Box3(),
    });
    let lift = this.fallLift;
    if (lift === null) {
      const sample = (dx, dz) =>
        this.world.ground(
          this.pos.x + dx,
          this.pos.z + dz,
          0.05,
          this.feet,
          0.5,
        );
      const gx = (sample(0.55, 0) - sample(-0.55, 0)) / 1.1;
      const gz = (sample(0, 0.55) - sample(0, -0.55)) / 1.1;
      frame.normal
        .set(
          Number.isFinite(gx) ? -clamp(gx, -0.4, 0.4) : 0,
          1,
          Number.isFinite(gz) ? -clamp(gz, -0.4, 0.4) : 0,
        )
        .normalize();
      frame.tangent
        .set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
        .projectOnPlane(frame.normal)
        .normalize();
      frame.right.crossVectors(frame.normal, frame.tangent).normalize();
      frame.basis.makeBasis(frame.right, frame.normal, frame.tangent);
      frame.rotation.setFromRotationMatrix(frame.basis);
      this.model.quaternion.identity();
      this.model.updateMatrixWorld(true);
      frame.bounds.setFromObject(this.model, true);
      lift = this.feet - frame.bounds.min.y + 0.015;
      if (this.t >= 2) this.fallLift = lift;
    }
    this.model.quaternion.copy(frame.rotation);
    this.model.position.addScaledVector(frame.normal, lift);
  }

  reset() {
    this.locomotion?.reset();
    this.gait = this.stepClock = 0;
    this.fallLift = null;
    this.fallFrame = null;
    this.hp = this.maxHp;
    this.defeated = false;
    Object.assign(this.pos, { x: this.home.x, z: this.home.z });
    this.yaw = this.home.yaw;
    this.feet = 0;
    this.vel.x = this.vel.z = 0;
    this.state = "patrol";
    this.t = this.lost = this.idle = this.leg = 0;
    this.target = this.lane = null;
    this.attackIndex = this.attacksRemaining = this.chargeTravel = 0;
    this.hitCooldown = this.blockCooldown = this.windowDamage = 0;
    this.dazeGuard = this.staggerGuard = 0;
    this.staggerTime = 0.35;
    this.shrugAt = null;
    this.phaseAnnounced = false;
    this.sweepCooldown = this.sweepSerial = 0;
    this.sweepSign = 1;
    this.sweepYaw = this.yaw;
    for (const tip of [...this.tusks, ...this.previousTusks]) tip.set(0, 0, 0);
    this.lastMoveBlocked = false;
    this.recoveryKind = "breath";
    this.combat = this.profile();
    this.recoveryDuration = this.combat.recovery;
    this.windupDuration = this.combat.windup;
    this.navigation.reset();
    this.onTelegraph?.(this, null);
    for (const [name, node] of Object.entries(this.joints)) {
      node.rotation.copy(this.rest[name].rotation);
      node.position.copy(this.rest[name].position);
    }
    this.model.visible = true;
    this.place();
  }
}
