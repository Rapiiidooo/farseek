import * as THREE from "three";
import { Spring } from "./spring.js";
import { smooth, mix, wrap, GAIT, set, add } from "./math.js";
import { POSES } from "./poses.js";
import { overlays } from "./overlays.js";
import { feet } from "./feet.js";
import { hands } from "./hands.js";
import { fingers } from "./fingers.js";
import { face } from "./face.js";
import { secondary } from "./secondary.js";
import { reloadArms, reloadBody } from "./reload.js";
import { wall, wallPose } from "./wall.js";
import { arrival } from "./arrival.js";

const JOINTS = [
  "hips",
  "spine",
  "head",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "rightUpperLeg",
  "rightLowerLeg",
  "leftFoot",
  "rightFoot",
];

// Spring frequency (Hz) and damping per joint; limbs are brisk, the head lags a little.
const TUNING = {
  hips: [6, 0.9],
  spine: [5, 0.8],
  head: [4, 0.7],
  leftUpperArm: [7, 0.75],
  rightUpperArm: [7, 0.75],
  leftLowerArm: [8, 0.8],
  rightLowerArm: [8, 0.8],
  leftHand: [9, 0.8],
  rightHand: [9, 0.8],
  leftUpperLeg: [9, 0.85],
  rightUpperLeg: [9, 0.85],
  leftLowerLeg: [10, 0.85],
  rightLowerLeg: [10, 0.85],
  leftFoot: [9, 0.9],
  rightFoot: [9, 0.9],
};

const tmp = new THREE.Vector3();

function approach(value, target, dt) {
  return (
    value + (target - value) * (1 - Math.exp(-dt * (target > value ? 9 : 12)))
  );
}

export class HeroAnimator {
  constructor(model) {
    this.model = model;
    this.joints = model.userData.joints || {};
    this.rest = {};
    this.springs = {};
    for (const name of JOINTS) {
      const j = this.joints[name];
      if (!j) continue;
      this.rest[name] = { rot: j.rotation.clone(), pos: j.position.clone() };
      this.springs[name] = [new Spring(), new Spring(), new Spring()];
    }
    this.root = {
      yaw: new Spring(),
      pitch: new Spring(),
      roll: new Spring(),
      bob: new Spring(),
      sway: new Spring(),
      surge: new Spring(),
    };
    this.phase = 0;
    this.runStride = GAIT.stride;
    this.runContact = GAIT.contact;
    this.runForward = 1;
    this.time = 0;
    this.lastYaw = null;
    this.lastState = "ground";
    this.scarf = { x: 0, z: 0, vx: 0, vz: 0 };
    // Where each palm sits in its hand (or forearm) joint, from the asset's rest data, and the
    // palm's height with the arm straight overhead: the height the explorer hangs from.
    this.ik = { left: this.arm("left", 1), right: this.arm("right", -1) };
    this.palmReach = this.measureReach();
    this.legs = [this.leg("left"), this.leg("right")].filter(Boolean);
    this.lastPosition = null;
    this.travelDirection = new THREE.Vector3(0, 0, 1);
    this.travelTurn = 0;
    this.gaitSpeed = 0;
    this.bodySpeed = 0;
    this.glideSpeed = 0;
    this.glideDecel = 0;
    this.glideDirection = new THREE.Vector3(0, 0, 1);
    this.slide = 0;
    this.slideLead = 0;
    this.gliding = false;
    this.cycles = 0;
    this.supportVelocity = new THREE.Vector3();
    this.supportAccel = new THREE.Vector3();
    this.motionTurn = 0;
    this.motionAccel = 0;
    this.swimPhase = 0;
    this.swimBlend = 0;
    this.swimArmWeight = new Spring();
    this.weaponWeight = new Spring();
    this.weaponYaw = new Spring();
    this.weaponPitch = new Spring();
    this.weaponAimDirection = new THREE.Vector3(0, 0, 1);
    this.handCurl = { left: 0, right: 0 };
    this.armSwing = { left: 0, right: 0 };
    this.articulatedFeet =
      this.legs.length === 2 && this.legs.every((leg) => leg.foot);
    this.pelvisDrop = new Spring();
    this.breathPhase = 0;
    this.effort = 0;
    this.gaze = { x: new Spring(), y: new Spring() };
    this.blink = { next: 2.6, start: -10, count: 0, value: 0 };
    this.face = this.controls(model.userData.face);
    this.secondary = this.controls(model.userData.secondary);
    this.rollSupports = this.prepareRollSupports();
    this.rollPoint = new THREE.Vector3();
    this.rollContact = new THREE.Vector3();
    this.rollPivot = new THREE.Vector3();
    this.prepareWall();
    this.prepareFingers();
  }

  controls(handles) {
    return Object.fromEntries(
      Object.entries(handles || {})
        .filter(([, node]) => node?.isObject3D)
        .map(([name, node]) => [
          name,
          {
            node,
            rot: node.rotation.clone(),
            pos: node.position.clone(),
            scale: node.scale.clone(),
            springs: [new Spring(), new Spring(), new Spring()],
          },
        ]),
    );
  }

  update(dt, hero, reduced = false, lift = 0) {
    if (dt <= 0) return;
    this.lift =
      (this.lift || 0) + (lift - (this.lift || 0)) * Math.min(1, dt * 10);
    this.time += dt;
    this.frameDt = dt;
    const rawTurn =
      this.lastYaw === null ? 0 : wrap(hero.yaw - this.lastYaw) / dt;
    this.lastYaw = hero.yaw;
    // Motion is measured against the ground underfoot: a drifting floe's carry is not a step.
    const carried = hero.carried;
    const carryX = carried?.x || 0,
      carryZ = carried?.z || 0;
    if (carried) carried.x = carried.z = 0;
    const support = this.supportVelocity,
      supportX = support.x,
      supportZ = support.z,
      follow = 1 - Math.exp(-dt * 8);
    support.x += (carryX / dt - supportX) * follow;
    support.z += (carryZ / dt - supportZ) * follow;
    this.supportAccel.lerp(
      tmp.set((support.x - supportX) / dt, 0, (support.z - supportZ) / dt),
      1 - Math.exp(-dt * 6),
    );
    const dx = this.lastPosition
      ? hero.pos.x - this.lastPosition.x - carryX
      : 0;
    const dz = this.lastPosition
      ? hero.pos.z - this.lastPosition.z - carryZ
      : 0;
    const distance = Math.hypot(dx, dz);
    const discontinuity = distance > Math.max(0.65, (hero.speed || 0) * dt * 3);
    const grounded =
      !discontinuity && hero.state === "ground" && this.lastState === "ground";
    // On ice only the motion along the stick is stepped; the rest is a glide on planted soles.
    let sx = dx,
      sz = dz;
    if (grounded && hero.onIce) {
      const wish = hero.wish,
        len = wish?.len || 0;
      const along =
        len > 1e-4
          ? (Math.max(0, dx * wish.x + dz * wish.z) / len) *
            smooth(0.05, 0.35, len)
          : 0;
      sx = len > 1e-4 ? (wish.x / len) * along : 0;
      sz = len > 1e-4 ? (wish.z / len) * along : 0;
    }
    const gx = grounded ? dx - sx : 0,
      gz = grounded ? dz - sz : 0;
    const stepped = Math.hypot(sx, sz);
    if (stepped > 1e-6 && !discontinuity) {
      const old = Math.atan2(this.travelDirection.x, this.travelDirection.z);
      this.travelDirection.set(sx / stepped, 0, sz / stepped);
      this.travelTurn = Math.abs(wrap(Math.atan2(sx, sz) - old)) / dt;
    } else this.travelTurn = 0;
    const moved = grounded && hero.speed > 0.02;
    this.distance = moved ? stepped : 0;
    this.stepSpeed =
      grounded && hero.onIce
        ? distance > 1e-6
          ? (hero.speed * stepped) / distance
          : 0
        : hero.speed || 0;
    if (!this.lastPosition) this.lastPosition = { x: 0, z: 0 };
    this.lastPosition.x = hero.pos.x;
    this.lastPosition.z = hero.pos.z;
    if (!discontinuity) this.carryFeet(carryX + gx, carryZ + gz);
    this.gaitSpeed = approach(this.gaitSpeed, this.distance / dt, dt);
    const beforeSpeed = this.bodySpeed;
    this.bodySpeed = approach(this.bodySpeed, moved ? distance / dt : 0, dt);
    this.motionAccel +=
      ((this.bodySpeed - beforeSpeed) / dt - this.motionAccel) *
      (1 - Math.exp(-dt * 7));
    const glide = Math.hypot(gx, gz) / dt;
    if (glide > 0.05)
      this.glideDirection.set(gx, 0, gz).divideScalar(glide * dt);
    const beforeGlide = this.glideSpeed;
    this.glideSpeed += (glide - this.glideSpeed) * (1 - Math.exp(-dt * 6));
    this.glideDecel +=
      ((beforeGlide - this.glideSpeed) / dt - this.glideDecel) *
      (1 - Math.exp(-dt * 4));
    const stepRate = this.distance / dt;
    if (!grounded || !hero.onIce) this.gliding = false;
    else if (this.gliding)
      this.gliding = stepRate < 0.6 && this.glideSpeed > 0.15;
    else this.gliding = stepRate < 0.3 && this.glideSpeed > 0.4;
    const sliding = this.gliding ? smooth(0.3, 1.2, this.glideSpeed) : 0;
    this.slide +=
      (sliding - this.slide) *
      (1 - Math.exp(-dt * (sliding > this.slide ? 5 : 6)));
    this.motionTurn +=
      (THREE.MathUtils.clamp(rawTurn, -8, 8) - this.motionTurn) *
      (1 - Math.exp(-dt * 8));
    if (discontinuity && !["hang", "wall"].includes(hero.state))
      this.arrival = null;
    if (discontinuity)
      for (const leg of this.legs)
        leg.goal =
          leg.plant =
          leg.swingStart =
          leg.swingEnd =
          leg.solePosition =
            null;
    const strideDirection =
      hero.equipment === "pistols" && hero.weaponActive
        ? smooth(
            0.5,
            0.95,
            this.travelDirection.x * Math.sin(hero.yaw) +
              this.travelDirection.z * Math.cos(hero.yaw),
          )
        : 1;
    this.runStride = mix(2.85, GAIT.stride, strideDirection);
    this.runContact = mix(0.265, GAIT.contact, strideDirection);
    this.runForward = strideDirection;
    const turnRate = this.motionTurn,
      accel = this.motionAccel;
    if (hero.state !== this.lastState) this.enter(hero.state, hero);
    this.lastState = hero.state;

    const pose = {};
    const root = { bob: 0, pitch: 0, roll: 0, sway: 0 };
    const builder = hero.swimming
      ? POSES.swim
      : POSES[hero.state] || POSES.ground;
    builder.call(this, pose, root, hero, dt, { turnRate, accel });
    this.detailPose(pose, root, hero, dt);
    reloadBody(pose, root, hero);
    overlays(pose, root, hero, this.stepSpeed);
    this.arrivalPose(pose, root, dt);

    for (const name of JOINTS) {
      const j = this.joints[name],
        r = this.rest[name];
      if (!j || !r) continue;
      if (
        hero.state === "ground" &&
        !hero.swimming &&
        name.endsWith("Leg") &&
        this.legs.length
      )
        continue;
      const t = pose[name] || [0, 0, 0];
      const [freq, damp] = TUNING[name];
      const s = this.springs[name];
      const f = reduced ? 30 : freq;
      j.rotation.set(
        r.rot.x + s[0].step(t[0], dt, f, damp),
        r.rot.y + s[1].step(t[1] || 0, dt, f, damp),
        r.rot.z + s[2].step(t[2] || 0, dt, f, damp),
      );
    }
    const hips = this.joints.hips;
    if (hips && this.rest.hips) {
      hips.position.y =
        this.rest.hips.pos.y +
        this.root.bob.step(
          root.bob,
          dt,
          hero.state === "ground"
            ? mix(7, 9, smooth(2.2, 5, this.gaitSpeed) * this.runForward)
            : 7,
          hero.state === "ground" ? 0.8 : 0.7,
        );
      hips.position.x =
        this.rest.hips.pos.x + this.root.sway.step(root.sway, dt, 4, 0.9);
      hips.position.z =
        this.rest.hips.pos.z +
        this.root.surge.step(root.surge || 0, dt, 4.5, 0.9);
    }

    // The body turns with a little weight rather than snapping to the controller's heading.
    const yaw = this.root.yaw;
    if (this.lastState && yaw.v === 0 && yaw.dv === 0 && !this.started) {
      yaw.v = hero.yaw;
      this.started = true;
    }
    const targetYaw = yaw.v + wrap(hero.yaw - yaw.v);
    yaw.step(targetYaw, dt, reduced ? 30 : 5.5, 1);
    const pitch = this.root.pitch.step(
      root.pitch,
      dt,
      4,
      hero.swimming || this.swimBlend > 0.1 ? 0.95 : 0.55,
    );
    const roll = this.root.roll.step(root.roll, dt, 4, 0.8);
    const m = this.model;
    m.position.set(
      hero.pos.x + hero.snap.x,
      hero.feet + hero.stepLift + this.lift,
      hero.pos.z + hero.snap.z,
    );
    if (this.arrival) m.position.add(this.arrival.offset);
    const rollTime = Math.min(1, hero.t / 0.72);
    const tumble =
      hero.state === "roll" ? smooth(0.12, 0.79, rollTime) * Math.PI * 2 : 0;
    this.swimBlend +=
      ((hero.swimming || hero.state === "swim" ? 1 : 0) - this.swimBlend) *
      (1 - Math.exp(-dt * 7));
    if (this.swimBlend > 0.001) {
      m.position.y += (0.95 - Math.cos(pitch) * 0.95) * this.swimBlend;
      const advance = -Math.sin(pitch) * 0.95 * this.swimBlend;
      m.position.x += Math.sin(yaw.v) * advance;
      m.position.z += Math.cos(yaw.v) * advance;
    }
    m.rotation.set(pitch + tumble, yaw.v, roll, "YXZ");
    if (hero.state === "roll" && hips) {
      this.rollPivot.copy(hips.position);
      this.rollPoint.copy(this.rollPivot).applyEuler(m.rotation);
      m.position.add(this.rollPivot).sub(this.rollPoint);
    }
    this.groundFeet(hero);
    this.updateScarf(dt, hero, turnRate);
    this.reach(dt, hero, reduced);
    this.wallLegs(dt, hero);
    this.mountAxes(hero);
    this.swimArms(dt, hero);
    this.weaponArms(dt, hero);
    reloadArms.call(this, hero);
    this.showHands(hero, dt, reduced);
    this.updateFace(dt, hero, reduced);
    this.updateSecondary(dt, hero, reduced);
    this.groundRoll(hero);
  }

  detailPose(pose, root, hero, dt) {
    const working = ["hang", "climb", "shove", "wall"].includes(hero.state)
      ? 0.7
      : 0;
    const target = Math.max(
      working,
      Math.min(1, (hero.swimSpeed || this.gaitSpeed) / 5),
    );
    this.effort +=
      (target - this.effort) *
      (1 - Math.exp(-dt * (target > this.effort ? 2 : 0.45)));
    this.breathPhase += dt * Math.PI * 2 * mix(0.22, 0.48, this.effort);
    if (!this.articulatedFeet) return;
    const breath = Math.sin(this.breathPhase) * mix(0.008, 0.018, this.effort);
    if (hero.state === "ground") {
      if (hero.landing > 0 && this.landedAt !== undefined)
        root.bob +=
          0.2 * hero.landing * (1 - smooth(0, 0.09, this.time - this.landedAt));
      add(
        pose,
        "spine",
        breath + THREE.MathUtils.clamp(this.motionAccel * 0.007, -0.035, 0.045),
      );
      add(pose, "head", -breath * 0.6);
      root.surge = THREE.MathUtils.clamp(
        -this.motionAccel * 0.003,
        -0.025,
        0.025,
      );
      root.bob -= Math.min(0.04, Math.max(0, -this.motionAccel) * 0.004);
    }
    if (hero.state === "air" && hero.vel.y < 0) {
      const sampled = this.groundAt?.(hero.pos.x, hero.pos.z, hero.feet);
      const ground = Number.isFinite(sampled?.height)
        ? sampled.height
        : (this.lastGroundHeight ?? hero.feet);
      const prepare = 1 - smooth(0.06, 0.5, hero.feet - ground);
      for (const side of ["left", "right"]) {
        const thigh = pose[side + "UpperLeg"],
          knee = pose[side + "LowerLeg"];
        if (thigh) thigh[0] = mix(thigh[0], -0.08, prepare);
        if (knee) knee[0] = mix(knee[0], 0.16, prepare);
      }
    }
    if (hero.state !== "ground") {
      const pointed = hero.swimming
        ? 0.32
        : hero.state === "air"
          ? 0.15 + 0.2 * smooth(0, 4, hero.vel.y)
          : hero.state === "hang"
            ? 0.22
            : 0;
      if (!pose.leftFoot) set(pose, "leftFoot", pointed);
      if (!pose.rightFoot) set(pose, "rightFoot", pointed);
    }
    if (hero.state === "climb")
      add(pose, "head", -0.055 * Math.sin(Math.PI * Math.min(1, hero.t)));
  }

  enter(state, hero) {
    const S = this.springs;
    if ((state === "hang" || state === "wall") && hero.arrival)
      this.startArrival(hero, state);
    if (state === "hang" && !this.arrival?.fromTop) {
      this.root.pitch.dv += 3.2;
      if (S.leftUpperLeg) S.leftUpperLeg[0].dv -= 4;
      if (S.rightUpperLeg) S.rightUpperLeg[0].dv -= 3;
    }
    if (state === "ground" && this.lastState === "air") {
      const L = hero.landing;
      this.landedAt = this.time;
      this.root.bob.dv -= this.articulatedFeet ? 0.6 + 0.5 * L : 1.6 + 2.2 * L;
      if (S.spine) S.spine[0].dv += 3 + 5 * L;
      if (S.head) S.head[0].dv -= 2;
    }
  }
}

Object.assign(
  HeroAnimator.prototype,
  feet,
  hands,
  fingers,
  face,
  secondary,
  wall,
  arrival,
);
POSES.wall = wallPose;
