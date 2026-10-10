import * as THREE from "three";
import { Spring } from "./hero-anim.js";
import { glyphMaterial, makeGlyph } from "./glyphs.js";
import { WardenPath, stampVisible } from "./warden-path.js";
import { tuning } from "./combat-tuning.js";

// The Wardens: squat stone clerks of the gate network with an enormous customs stamp, each
// stamp carved with one glyph. They patrol until someone offends them (stealing confiscated
// property, or a disc to the mask), then waddle after the offender, plant their feet, and
// bring the stamp down on the exact spot the offender stood when they wound up: a ring on
// the ground shows it, so a nimble explorer can leave something else under the stamp. After
// a stamp lands on anything but the ground, the paperwork is done and they calm down. The orb
// never wounds: a pulse offends or staggers, a charged pulse stuns for a few seconds. Three
// pistol hits send one on its break; nobody is ever defeated for good.

export const LINES = {
  alert: [
    "HALT!",
    "Papers!",
    "Unauthorised traveller!",
    "Stop right there!",
    "Offence noted!",
  ],
  slam: ["DENIED!", "REJECTED!", "VOID!", "RETURN TO SENDER!"],
  hurt: [
    "Ow!",
    "Hey!",
    "Rude!",
    "I'm filing a complaint!",
    "That's assault on an official!",
  ],
  calm: ["Paperwork complete.", "Case closed.", "Filed.", "…Carry on."],
  dazed: ["Seeing stars…", "Form 27… B…", "Who stamped me?", "Wobbly…"],
  tired: ["…I'll file it later.", "Not worth the form.", "Hmph."],
  break: ["Break time!", "I'm on my break!", "Union rules!"],
  back: ["Break's over.", "Right. Where was I?", "Back to work."],
  patrol: ["Move along.", "Keep the queue tidy.", "Nothing to see."],
};

const JOINTS = [
  "body",
  "head",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
  "stamp",
];
const R = 0.45,
  SPEED = 2.6,
  PATROL = 1.1,
  REACH = 1.6,
  WINDUP = 0.85,
  BREAK = 9,
  STUN = 5;
export const STAMP_RADIUS = 0.9;

const COMBAT = {
  guard: {
    speed: SPEED,
    reach: REACH,
    radius: STAMP_RADIUS,
    windup: WINDUP,
    followup: WINDUP,
    recovery: 0.85,
    stamps: 1,
  },
  runner: {
    speed: 3.1,
    reach: 1.6,
    radius: 0.82,
    windup: 0.8,
    followup: 0.75,
    recovery: 1.1,
    stamps: 2,
  },
  keeper: {
    speed: 1.8,
    reach: 2.05,
    radius: 1.45,
    windup: 1.25,
    followup: 1.25,
    recovery: 1.4,
    stamps: 1,
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Warden {
  constructor(
    scene,
    world,
    model,
    {
      x,
      z,
      yaw = 0,
      bubbles,
      sound,
      role = "guard",
      combatStyle = "guard",
      glyph,
      route,
    },
  ) {
    this.scene = scene;
    this.world = world;
    this.navigation = new WardenPath(world);
    this.model = model;
    this.bubbles = bubbles;
    this.sound = sound;
    this.role = role;
    this.combatStyle = Object.hasOwn(COMBAT, combatStyle)
      ? combatStyle
      : "guard";
    this.combat = COMBAT[this.combatStyle];
    this.attacksRemaining = 0;
    this.attackIndex = 0;
    this.windupDuration = this.combat.windup;
    this.glyph = glyph;
    this.route = route || [[x, z]];
    this.leg = 0;
    this.pos = { x, z };
    this.home = { x, z, yaw };
    this.feet = 0;
    this.yaw = yaw;
    this.vel = { x: 0, z: 0 };
    this.hp = 3;
    this.state = role === "clerk" ? "clerk" : "patrol";
    this.t = 0;
    this.phase = Math.random() * 6;
    this.time = Math.random() * 10;
    this.idle = 0;
    this.misses = 0;
    this.joints = model.userData.joints || {};
    this.rest = {};
    this.springs = {};
    for (const name of JOINTS) {
      const j = this.joints[name];
      if (!j) continue;
      this.rest[name] = j.rotation.clone();
      this.springs[name] = [new Spring(), new Spring(), new Spring()];
    }
    this.root = { pitch: new Spring(), roll: new Spring(), bob: new Spring() };
    this.eye = [];
    model.userData.parts?.eye?.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0x39e3d0);
      o.material.emissiveIntensity = 1.4;
      this.eye.push(o.material);
    });
    if (glyph) this.addGlyphs(glyph);
    scene.add(model);
    this.place();
  }

  // The Warden's glyph: carved on the face of its stamp, and floating over its head so it can
  // be told apart across the plaza.
  addGlyphs(kind) {
    this.glyphMat = glyphMaterial();
    this.glyphMat.emissiveIntensity = 1.2;
    const stamp = this.joints.stamp;
    if (stamp) {
      const face = makeGlyph(kind, 0.24, this.glyphMat);
      face.rotation.x = Math.PI / 2;
      face.position.set(0, -0.276, 0);
      stamp.add(face);
    }
    this.tagMat = glyphMaterial();
    this.tagMat.emissiveIntensity = 1.6;
    this.tagMat.color.setHex(0x0d3a3c);
    this.tag = makeGlyph(kind, 0.36, this.tagMat);
    this.tag.renderOrder = 2;
    this.scene.add(this.tag);
  }

  get radius() {
    return 0.62;
  }

  get stampRadius() {
    return this.combat.radius;
  }

  center() {
    return new THREE.Vector3(this.pos.x, this.feet + 0.62, this.pos.z);
  }

  head() {
    return new THREE.Vector3(this.pos.x, this.feet + 1.55, this.pos.z);
  }

  // Can the disc strike it? Not while it is on its break or tumbling out of a window.
  alive() {
    return (
      this.role === "guard" &&
      !["break", "enter", "hidden"].includes(this.state)
    );
  }

  get hostile() {
    return [
      "alert",
      "chase",
      "windup",
      "slam",
      "recover",
      "stagger",
      "pulled",
    ].includes(this.state);
  }

  say(text, kind = "warden", duration = 2.2) {
    this.bubbles.say(() => this.head(), text, { kind, duration, key: this });
  }

  // Offended: it announces itself, then gives chase.
  provoke(line = pick(LINES.alert)) {
    if (
      this.role !== "guard" ||
      this.hostile ||
      ["break", "stun"].includes(this.state)
    )
      return false;
    this.state = "alert";
    this.t = 0;
    this.misses = 0;
    this.say(line, "shout", 1.6);
    this.sound?.play("warden-alert");
    return true;
  }

  // The paperwork is done: back to the patrol route.
  calm(line = pick(LINES.calm)) {
    if (!this.hostile && this.state !== "stun") return;
    this.state = "patrol";
    this.t = 0;
    this.target = null;
    this.attacksRemaining = 0;
    this.onTelegraph?.(this, null);
    this.navigation.reset();
    if (line) this.say(line, "warden", 1.8);
  }

  onHit(hit) {
    if (!this.alive()) return false;
    if (hit?.kind === "orb") return this.pulse(hit);
    if (hit?.kind !== "pistol") return false;
    this.attacksRemaining = 0;
    this.knockBack(hit.pos, 3);
    this.sound?.play("warden-hit");
    this.hp -= 1;
    this.wound();
    return true;
  }

  knockBack(from, speed) {
    const dx = this.pos.x - from.x,
      dz = this.pos.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * speed;
    this.vel.z = (dz / d) * speed;
  }

  // The relay offends and jolts; charged, it stuns. It never takes a Warden off duty.
  pulse(orb) {
    if (this.state === "stun") return false;
    this.attacksRemaining = 0;
    if (orb.charged) {
      orb.spend?.();
      this.knockBack(orb.prev, 2.2);
      this.state = "stun";
      this.stunTime = STUN * tuning().stun;
      this.t = 0;
      this.target = null;
      this.onTelegraph?.(this, null);
      this.say(pick(LINES.dazed), "warden", 2);
      this.sound?.play("warden-hit");
      this.onStunned?.(this);
      return true;
    }
    if (!this.hostile) {
      this.knockBack(orb.prev, 3.5);
      this.sound?.play("warden-hit");
      this.provoke(pick(LINES.hurt));
      this.onProvoked?.(this);
      return true;
    }
    if (this.staggerGuard > 0) return false;
    this.knockBack(orb.prev, 4.5);
    this.sound?.play("warden-hit");
    this.staggerGuard = 1.6;
    this.state = "stagger";
    this.t = 0;
    this.target = null;
    this.onTelegraph?.(this, null);
    if (Math.random() < 0.7) this.say(pick(LINES.hurt), "warden", 1.4);
    return true;
  }

  pull({ phase, from }) {
    if (phase === "release") {
      if (this.state === "pulled") {
        this.state = "stagger";
        this.t = 0;
      }
      return true;
    }
    if (!this.alive() || ["stun", "clerk"].includes(this.state)) return false;
    if (phase === "start") {
      if (!this.hostile) {
        this.say(pick(LINES.hurt), "shout", 1.4);
        this.sound?.play("warden-alert");
        this.onProvoked?.(this);
      }
      this.attacksRemaining = 0;
      this.target = null;
      this.onTelegraph?.(this, null);
      this.misses = 0;
      this.state = "pulled";
      this.t = 0;
      this.sound?.play("warden-hit");
      return true;
    }
    const dx = from.x - this.pos.x,
      dz = from.z - this.pos.z,
      d = Math.hypot(dx, dz);
    if (d < 1.7) return false;
    this.vel.x = (dx / d) * 3.4;
    this.vel.z = (dz / d) * 3.4;
    return true;
  }

  wound() {
    if (this.hp <= 0) {
      this.state = "break";
      this.t = 0;
      this.target = null;
      this.onTelegraph?.(this, null);
      this.say(pick(LINES.break), "warden", 2.2);
      this.sound?.play("warden-down");
      this.onBreak?.(this);
      return;
    }
    if (this.state === "stun") return;
    if (!this.hostile) {
      this.provoke(pick(LINES.hurt));
      this.onProvoked?.(this);
      return;
    }
    this.state = "stagger";
    this.t = 0;
    this.target = null;
    this.onTelegraph?.(this, null);
    if (Math.random() < 0.7) this.say(pick(LINES.hurt), "warden", 1.4);
  }

  windUp(hero, followup = false) {
    if (!followup) this.attacksRemaining = this.combat.stamps;
    this.attacksRemaining--;
    this.attackIndex = this.combat.stamps - this.attacksRemaining;
    this.windupDuration =
      (followup ? this.combat.followup : this.combat.windup) * tuning().windup;
    this.state = "windup";
    this.t = 0;
    this.target = { x: hero.pos.x, z: hero.pos.z };
    this.onTelegraph?.(this, this.target);
    this.sound?.play("warden-windup");
  }

  update(dt, hero, others, { onSlam, camera } = {}) {
    if (dt <= 0) return;
    const previous = { ...this.pos };
    this.t += dt;
    this.time += dt;
    this.staggerGuard = Math.max(0, (this.staggerGuard || 0) - dt);
    const toX = hero.pos.x - this.pos.x,
      toZ = hero.pos.z - this.pos.z;
    const dist = Math.hypot(toX, toZ);
    const face = (x, z, rate) => {
      const want = Math.atan2(x - this.pos.x, z - this.pos.z);
      const d = Math.atan2(
        Math.sin(want - this.yaw),
        Math.cos(want - this.yaw),
      );
      this.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    };
    const steer = (x, z, speed, reach = 0) => {
      const goalDistance = Math.hypot(x - this.pos.x, z - this.pos.z);
      const next = this.navigation.next(
        dt,
        this.pos,
        this.feet,
        { x, z },
        reach,
      );
      const dx = next.x - this.pos.x,
        dz = next.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && ["patrol", "chase"].includes(this.state))
        face(next.x, next.z, this.state === "patrol" ? 4 : 5);
      speed = Math.min(speed, d / dt);
      let vx = d > 1e-3 ? (dx / d) * speed : 0,
        vz = d > 1e-3 ? (dz / d) * speed : 0;
      // Keep a little space between colleagues so they do not stack.
      for (const o of others) {
        if (o === this || o.state === "hidden") continue;
        const ox = this.pos.x - o.pos.x,
          oz = this.pos.z - o.pos.z;
        const od = Math.hypot(ox, oz);
        if (od > 0.01 && od < 1.4) {
          vx += (ox / od) * (1.4 - od) * 3;
          vz += (oz / od) * (1.4 - od) * 3;
        }
      }
      this.vel.x += (vx - this.vel.x) * Math.min(1, dt * 6);
      this.vel.z += (vz - this.vel.z) * Math.min(1, dt * 6);
      return goalDistance;
    };
    let moving = 0;
    switch (this.state) {
      case "enter": {
        const k = Math.min(1, this.t / 0.7);
        this.pos.x = this.hopFrom.x + (this.hopTo.x - this.hopFrom.x) * k;
        this.pos.z = this.hopFrom.z + (this.hopTo.z - this.hopFrom.z) * k;
        this.feet = this.hopFrom.y * (1 - k) + Math.sin(k * Math.PI) * 1.2;
        if (k >= 1) {
          this.feet = 0;
          this.state = "patrol";
        }
        break;
      }
      case "patrol": {
        const [px, pz] = this.route[this.leg % this.route.length];
        if (this.idle > 0) {
          this.idle -= dt;
          face(hero.pos.x, hero.pos.z, dist < 6 ? 2 : 0.6);
        } else {
          if (steer(px, pz, PATROL) < 0.4) {
            this.leg++;
            this.idle = 1.2 + Math.random() * 1.6;
          }
          moving = 1;
        }
        // A word for an explorer who wanders close.
        if (dist < 2.2 && !this.spoke) {
          this.spoke = true;
          this.say(pick(LINES.patrol), "warden", 1.6);
        } else if (dist > 5) this.spoke = false;
        break;
      }
      case "alert":
        face(hero.pos.x, hero.pos.z, 8);
        if (this.t > 0.7) this.state = "chase";
        break;
      case "chase": {
        // Out of reach for long enough, it gives up.
        this.lost = dist > 15 ? (this.lost || 0) + dt : 0;
        if (this.lost > 3) {
          this.calm(pick(LINES.tired));
          break;
        }
        if (
          dist < this.combat.reach &&
          hero.state !== "hang" &&
          hero.state !== "climb" &&
          stampVisible(this.world, this.pos, this.feet, hero)
        ) {
          // It marks the spot the offender stands on, and that spot is where the stamp lands.
          face(hero.pos.x, hero.pos.z, 5);
          this.windUp(hero);
          break;
        }
        steer(
          hero.pos.x,
          hero.pos.z,
          this.combat.speed * (dist > 6 ? 1.15 : 1) * tuning().speed,
          this.combat.reach,
        );
        moving = 1;
        break;
      }
      case "windup": {
        const T = this.target;
        face(T.x, T.z, 6);
        // A shuffle towards the mark if it is at the edge of reach.
        const d = Math.hypot(T.x - this.pos.x, T.z - this.pos.z);
        if (d > 1.05) (steer(T.x, T.z, 1.6), (moving = 1));
        else {
          this.vel.x *= Math.exp(-dt * 10);
          this.vel.z *= Math.exp(-dt * 10);
        }
        if (this.t > this.windupDuration) {
          this.state = "slam";
          this.t = 0;
          this.struck = false;
        }
        break;
      }
      case "slam":
        if (!this.struck && this.t > 0.08) {
          this.struck = true;
          const T = this.target;
          // The same radius as the ring painted on the ground.
          const hit =
            Math.hypot(hero.pos.x - T.x, hero.pos.z - T.z) < this.stampRadius &&
            Math.abs(hero.feet - this.feet) < 1.2 &&
            stampVisible(this.world, this.pos, this.feet, hero);
          const outcome =
            onSlam?.(this, T.x, T.z, hit) || (hit ? "hit" : "ground");
          this.onTelegraph?.(this, null);
          if (outcome === "plate" || outcome === "void")
            this.stampedSomething = true;
          else if (outcome === "ground") this.misses++;
          if (Math.random() < 0.45 && outcome !== "plate")
            this.say(pick(LINES.slam), "shout", 1.2);
        }
        if (this.t > 0.25) {
          if (
            this.attacksRemaining > 0 &&
            !this.stampedSomething &&
            dist < this.combat.reach + 1.5 &&
            !["hang", "climb"].includes(hero.state) &&
            stampVisible(this.world, this.pos, this.feet, hero)
          ) {
            this.windUp(hero, true);
            break;
          }
          this.attacksRemaining = 0;
          this.state = "recover";
          this.recoveryTime = this.combat.recovery * tuning().opening;
          this.t = 0;
        }
        break;
      case "recover":
        if (this.t > (this.recoveryTime ?? this.combat.recovery)) {
          if (this.stampedSomething) {
            this.stampedSomething = false;
            this.calm();
          } else if (this.misses >= 4) this.calm(pick(LINES.tired));
          else this.state = "chase";
        }
        break;
      case "stagger":
        if (this.t > 0.5) this.state = "chase";
        break;
      case "pulled":
        if (this.t > 1.6) {
          this.state = "stagger";
          this.t = 0;
        }
        break;
      case "stun":
        if (this.t > (this.stunTime ?? STUN)) {
          this.state = "chase";
          this.t = 0;
          this.lost = 0;
          this.say(pick(LINES.alert), "shout", 1.4);
          this.sound?.play("warden-alert");
        }
        break;
      case "break":
        if (this.t > BREAK) {
          this.hp = 3;
          this.state = "patrol";
          this.say(pick(LINES.back), "warden", 1.8);
        }
        break;
      case "clerk":
      case "hidden":
        break;
    }
    if (
      this.state !== "enter" &&
      this.state !== "clerk" &&
      this.state !== "hidden"
    ) {
      if (!moving) {
        const drag = Math.exp(-dt * 6);
        this.vel.x *= drag;
        this.vel.z *= drag;
      }
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.world.resolve(this.pos, R, this.feet, 1.1, 0.3);
      const g = this.world.ground(this.pos.x, this.pos.z, 0.2, this.feet, 0.5);
      if (Number.isFinite(g) && g >= this.feet - 0.5) this.feet = g;
      else {
        Object.assign(this.pos, previous);
        this.vel.x = this.vel.z = 0;
      }
    }
    this.animate(
      dt,
      Math.hypot(this.pos.x - previous.x, this.pos.z - previous.z) / dt,
    );
    this.place();
    // The floating glyph faces the camera, bright while the Warden is on the hunt.
    if (this.tag) {
      this.tag.visible = this.state !== "hidden";
      this.tag.position.set(
        this.pos.x,
        this.feet + 1.62 + Math.sin(this.time * 2) * 0.04,
        this.pos.z,
      );
      if (camera) this.tag.quaternion.copy(camera.quaternion);
      const glow = this.hostile
        ? 3.2
        : ["break", "stun"].includes(this.state)
          ? 0.25
          : 1.1;
      this.tagMat.emissiveIntensity +=
        (glow - this.tagMat.emissiveIntensity) * Math.min(1, dt * 6);
      this.glyphMat.emissiveIntensity = this.state === "windup" ? 3.5 : 1.2;
    }
  }

  place() {
    this.model.position.set(
      this.pos.x,
      this.feet + (this.root.bob.v || 0),
      this.pos.z,
    );
    this.model.rotation.set(
      this.root.pitch.v,
      this.yaw,
      this.root.roll.v,
      "YXZ",
    );
  }

  animate(dt, speed) {
    const pose = {};
    const set = (n, x = 0, y = 0, z = 0) => (pose[n] = [x, y, z]);
    const root = { pitch: 0, roll: 0, bob: 0 };
    const t = this.time;
    const st = this.state;
    if (
      st === "chase" ||
      st === "patrol" ||
      (st === "stagger" && speed > 0.5)
    ) {
      const brisk = st === "chase" ? 1 : 0.55;
      this.phase += dt * (4 + speed * 2.4);
      const s = Math.sin(this.phase) * Math.min(1, speed / 1.2);
      set("leftLeg", -0.6 * s);
      set("rightLeg", 0.6 * s);
      set("leftArm", 0.5 * s * brisk, 0, 0.2);
      set(
        "rightArm",
        st === "chase" ? -2.2 : 0.3 * s,
        0,
        st === "chase" ? -0.35 : -0.1,
      );
      set("stamp", st === "chase" ? 0.4 : 0);
      set("body", 0.15 * brisk, 0.1 * s, 0);
      set(
        "head",
        -0.1,
        st === "patrol" ? Math.sin(t * 0.7) * 0.35 : 0,
        -0.12 * s,
      );
      root.roll = 0.16 * s;
      // A swung flat sole tips its edge down; lift the body so it stays above the ground.
      root.bob =
        Math.abs(Math.cos(this.phase)) * 0.07 * Math.min(1, speed) +
        Math.abs(s) * 0.035;
    } else if (st === "windup") {
      const k = smooth(0, 0.35, this.t);
      const quiver = Math.sin(t * 60) * 0.05 * k;
      set("rightArm", -2.85 * k + quiver, 0, -0.25);
      set("leftArm", -0.9 * k, 0, 0.45);
      set("stamp", -0.3 * k);
      set("body", -0.32 * k + quiver);
      set("head", 0.12 * k);
      set("leftLeg", -0.25, 0, 0.18);
      set("rightLeg", 0.2, 0, -0.18);
      root.bob = 0.04 * k;
    } else if (st === "slam" || st === "recover") {
      const recovery = this.recoveryTime ?? this.combat.recovery;
      const up =
        st === "recover" ? smooth(recovery - 0.45, recovery, this.t) : 0;
      set("rightArm", -0.35 - 1.2 * up, 0, -0.1);
      set("leftArm", -0.5, 0, 0.5);
      set("stamp", 0.6);
      set("body", 0.55 * (1 - up));
      set("head", 0.25 * (1 - up));
      set("leftLeg", -0.35, 0, 0.2);
      set("rightLeg", 0.3, 0, -0.2);
      root.bob = -0.08 * (1 - up);
    } else if (st === "stagger" || st === "pulled") {
      const k = st === "pulled" ? 1 : 1 - smooth(0.1, 0.5, this.t);
      set("body", -0.55 * k);
      set("head", 0.3 * k, 0, 0.2 * k);
      set("leftArm", -1.2 * k, 0, 0.9 * k);
      set("rightArm", -1.6 * k, 0, -0.7 * k);
      set("leftLeg", -0.4 * k);
      root.pitch = -0.2 * k;
    } else if (st === "stun") {
      // Dazed on its feet: the mask lolls, the stamp hangs, the whole body sways.
      const stun = this.stunTime ?? STUN;
      const k = smooth(0, 0.3, this.t) * (1 - smooth(stun - 0.4, stun, this.t));
      const sway = Math.sin(t * 3.1);
      set("body", (-0.22 + 0.1 * sway) * k, 0, 0.16 * Math.sin(t * 2.3) * k);
      set("head", 0.32 * k, 0.45 * Math.sin(t * 1.9) * k, 0.26 * sway * k);
      set("leftArm", -0.15 * k, 0, 0.55 * k);
      set("rightArm", 0.2 * k, 0, -0.5 * k);
      set("stamp", 0.7 * k);
      set("leftLeg", -0.3 * k, 0, 0.12 * k);
      set("rightLeg", -0.2 * k, 0, -0.14 * k);
      root.roll = 0.12 * Math.sin(t * 2.3) * k;
      root.bob = -0.06 * k;
    } else if (st === "break") {
      // Sat down on the spot, arms folded, the stamp laid in the lap.
      const k = smooth(0, 0.5, this.t);
      set("leftLeg", -1.4 * k, 0, 0.2 * k);
      set("rightLeg", -1.4 * k, 0, -0.2 * k);
      set("leftArm", -0.9 * k, 0, -0.5 * k);
      set("rightArm", -1.0 * k, 0, 0.4 * k);
      set("stamp", 0.8 * k);
      set("head", 0.25 * k + Math.sin(t * 0.8) * 0.05, 0, 0);
      set("body", -0.1 * k);
      root.bob = -0.24 * k;
    } else if (st === "enter") {
      set("leftLeg", -0.8);
      set("rightLeg", -0.5);
      set("leftArm", -2.4, 0, 0.6);
      set("rightArm", -2.4, 0, -0.6);
    } else if (st === "clerk") {
      // At the counter: shuffling papers, glancing up to talk.
      const talk = this.talking > 0 ? Math.sin(t * 14) * 0.06 : 0;
      set("head", -0.12 + talk, Math.sin(t * 0.7) * 0.3, 0);
      set("body", 0.18);
      set("leftArm", -1.1 + Math.sin(t * 3.1) * 0.12, 0, 0.2);
      set("rightArm", -1.0 + Math.sin(t * 2.3 + 1) * 0.15, 0, -0.2);
      root.bob = Math.sin(t * 1.6) * 0.01;
    } else {
      set("body", Math.sin(t * 1.5) * 0.03);
      set("head", 0, Math.sin(t * 0.6) * 0.4, 0);
      set("rightArm", 0.1);
      root.bob = Math.sin(t * 1.5) * 0.012;
    }
    for (const name of JOINTS) {
      const j = this.joints[name],
        r = this.rest[name];
      if (!j || !r) continue;
      const tg = pose[name] || [0, 0, 0];
      const s = this.springs[name];
      j.rotation.set(
        r.x + s[0].step(tg[0], dt, 8, 0.75),
        r.y + s[1].step(tg[1], dt, 8, 0.75),
        r.z + s[2].step(tg[2], dt, 8, 0.75),
      );
    }
    this.root.pitch.step(root.pitch, dt, 4, 0.7);
    this.root.roll.step(root.roll, dt, 6, 0.6);
    this.root.bob.step(root.bob, dt, 8, 0.7);
    const glow =
      st === "windup"
        ? 3.2
        : st === "break"
          ? 0.2
          : st === "stun"
            ? 0.25 + 0.5 * Math.max(0, Math.sin(t * 9))
            : this.hostile
              ? 2
              : 1.2;
    for (const m of this.eye)
      m.emissiveIntensity += (glow - m.emissiveIntensity) * Math.min(1, dt * 8);
    if (this.talking > 0) this.talking -= dt;
  }

  reset() {
    this.hp = 3;
    this.pos.x = this.home.x;
    this.pos.z = this.home.z;
    this.yaw = this.home.yaw;
    this.feet = 0;
    this.vel.x = this.vel.z = 0;
    this.leg = 0;
    this.idle = 0;
    this.misses = 0;
    this.t = 0;
    this.lost = 0;
    this.staggerGuard = 0;
    this.struck = false;
    this.stampedSomething = false;
    this.attacksRemaining = 0;
    this.attackIndex = 0;
    this.windupDuration = this.combat.windup;
    this.target = null;
    this.navigation.reset();
    this.onTelegraph?.(this, null);
    this.state = this.role === "clerk" ? "clerk" : "patrol";
    this.model.visible = true;
    this.place();
  }
}

// Until the generated Warden arrives: the same joints on simple shapes.
export function fallbackWarden() {
  const g = new THREE.Group();
  const chalk = new THREE.MeshStandardMaterial({
    color: 0xc9c2d8,
    roughness: 0.9,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: 0x9a6a35,
    metalness: 0.7,
    roughness: 0.45,
  });
  const ochre = new THREE.MeshStandardMaterial({
    color: 0xd9a441,
    roughness: 0.8,
  });
  const basalt = new THREE.MeshStandardMaterial({
    color: 0x3a3531,
    roughness: 0.8,
  });
  const joint = (parent, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };
  const part = (parent, geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const body = joint(g, 0, 0.3, 0);
  part(body, new THREE.SphereGeometry(0.32, 12, 10), chalk, 0, 0.12, 0);
  part(
    body,
    new THREE.TorusGeometry(0.3, 0.05, 6, 16),
    ochre,
    0,
    0.12,
    0,
  ).rotation.x = Math.PI / 2;
  const head = joint(body, 0, 0.32, 0);
  part(
    head,
    new THREE.CylinderGeometry(0.3, 0.26, 0.55, 12),
    bronze,
    0,
    0.27,
    0,
  );
  const eye = part(
    head,
    new THREE.BoxGeometry(0.05, 0.28, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x1d5f63,
      emissive: 0x39e3d0,
      emissiveIntensity: 1.4,
    }),
    0,
    0.3,
    0.28,
  );
  const arm = (side) => {
    const a = joint(body, side * 0.32, 0.22, 0);
    part(a, new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), chalk, 0, -0.18, 0);
    return a;
  };
  const leftArm = arm(1),
    rightArm = arm(-1);
  const stamp = joint(rightArm, 0, -0.36, 0.05);
  part(
    stamp,
    new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6),
    bronze,
    0,
    0.12,
    0,
  );
  part(
    stamp,
    new THREE.CylinderGeometry(0.17, 0.17, 0.14, 14),
    basalt,
    0,
    -0.14,
    0,
  );
  const leg = (side) => {
    const l = joint(g, side * 0.13, 0.3, 0);
    part(
      l,
      new THREE.CylinderGeometry(0.08, 0.09, 0.26, 8),
      chalk,
      0,
      -0.14,
      0,
    );
    part(
      l,
      new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10),
      chalk,
      0,
      -0.27,
      0.03,
    );
    return l;
  };
  const leftLeg = leg(1),
    rightLeg = leg(-1);
  g.userData.joints = {
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    stamp,
  };
  g.userData.parts = { eye };
  return g;
}
