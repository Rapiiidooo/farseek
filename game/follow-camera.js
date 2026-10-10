import * as THREE from "three";

// Third-person orbit camera. It trails a smoothed point above the explorer that leads a
// little in the direction of travel, reframes itself for what the explorer is doing
// (higher and wider over a mirror so the beams read, closer on a ledge), pulls in when
// rock comes between them and drifts behind the heading when the player runs without
// steering. yaw follows the hero convention: the lens looks along (sin yaw, cos yaw).
// In a tight spot the boom lifts over low rock or turns towards the side with room, and a
// boom that stays short rises over her shoulder; she is hidden only when nothing keeps the
// lens out of her body.
const FRAMES = {
  ground: { dist: 5.6, lift: 1.55, pitch: 0 },
  swim: { dist: 5.8, lift: 1, pitch: 0 },
  air: { dist: 5.9, lift: 1.5, pitch: 0 },
  hang: { dist: 5.0, lift: 1.95, pitch: 0.05 },
  climb: { dist: 5.0, lift: 1.9, pitch: 0.05 },
  wall: { dist: 5.2, lift: 1.55, pitch: -0.12 },
  vault: { dist: 5.6, lift: 1.6, pitch: 0 },
  grab: { dist: 6.2, lift: 1.6, pitch: 0.12 },
  shove: { dist: 6.4, lift: 1.6, pitch: 0.12 },
  turn: { dist: 8.8, lift: 1.3, pitch: 0.42 },
  swing: { dist: 6.6, lift: 2.4, pitch: 0.04 },
};

const PROBES = [
  [0, 0],
  [0, 0.24],
  [0.3, 0.15],
  [-0.3, 0.15],
  [0, -0.22],
];
// Wider than the lens: they meet rock first, so the boom eases in before the lens's own
// probes would have to snap it.
const AHEAD = [
  [0.5, 0.4],
  [-0.5, 0.4],
  [0.5, -0.35],
  [-0.5, -0.35],
  [0, 0.5],
  [0, -0.45],
];
const TILTS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const LIFT_TOP = 1.25;
const cost = ([turn, lift]) => Math.abs(turn) + lift + Math.max(0, lift - 0.6);
const order = (turns) =>
  turns
    .flatMap((turn) => TILTS.map((lift) => [turn, lift]))
    .sort((a, b) => cost(a) - cost(b) || Math.abs(a[0]) - Math.abs(b[0]));
// Framings tried for a short boom, cheapest first, as [turn, lift]. A moving explorer's
// camera only lifts; on a ledge or a block the controls follow the lens, so it only nudges.
const LIFTS = order([0]);
const NUDGES = order([0, 0.2, -0.2, 0.4, -0.4]);
const SWINGS = order([0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8]);
const SHARES = [1, 0.5, 0];
const FITS = [1, 0.75, 0.5, 0.25, 0];
const STEPS = [0.25, 0.5, 0.75, 1];
// Spheres along her hips-to-head axis, then on her legs, wide enough for hair, pack and gear.
const BODY = [
  [1.25, 0.24],
  [1, 0.2],
  [0.55, 0.3],
  [0, 0.24],
];
const LIMBS = [
  ["leftLowerLeg", 0.14],
  ["rightLowerLeg", 0.14],
  ["leftFoot", 0.13],
  ["rightFoot", 0.13],
];
// Near planes tried close to her, as shares of the usual one, deepest first.
const NEARS = [1, 0.7, 0.5, 0.35, 0.2];
const blocksLens = (box) => box.cam;
const blocksSight = (box) => box.cam && !box.thin;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (from, to, dt, rise = to > from) =>
  from + (to - from) * (1 - Math.exp(-dt * (rise ? 10 : 4)));

export class FollowCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = Math.PI;
    this.pitch = 0.2;
    this.current = 5.6;
    this.frame = { dist: 5.6, lift: 1.55, pitch: 0, shoulder: 0 };
    this.target = new THREE.Vector3();
    this.lead = new THREE.Vector3();
    this.idle = 10;
    this.shake = 0;
    this.ready = false;
    this.aim = 0;
    this.combat = 0;
    this.baseFov = camera.fov;
    this.baseNear = camera.near;
    this.raise = 0;
    this.shift = 0;
    this.side = 1;
    this.swing = 0;
    this.model = null;
    // The player's camera options (store.js), when the application provides them.
    this.settings = null;
    this.hidden = false;
    this.goal = new THREE.Vector3();
    this.pivot = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.lens = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.flat = new THREE.Vector3();
    this.trial = new THREE.Vector3();
    this.turnDir = new THREE.Vector3();
    this.turnRight = new THREE.Vector3();
    this.turnUp = new THREE.Vector3();
    this.swingClock = 0;
    this.swingAim = 0;
    this.swingTurn = 0;
    this.mode = null;
    this.anchor = 0;
    this.tilt = 0;
    this.tiltGoal = 0;
    this.lastYaw = null;
    this.lastPitch = null;
    this.turnRate = 0;
    this.tiltRate = 0;
    this.motion = new THREE.Vector3();
    this.lastTarget = null;
    this.previous = new THREE.Vector3();
    this.coming = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.across = new THREE.Vector3();
    this.above = new THREE.Vector3();
    this.hips = new THREE.Vector3();
    this.spine = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.placed = new THREE.Vector3();
    this.parts = [...BODY, ...LIMBS].map(() => ({
      at: new THREE.Vector3(),
      r: 0,
    }));
  }

  snap(hero, turn = true) {
    this.rest();
    this.target.set(hero.pos.x, hero.feet + 1.55, hero.pos.z);
    this.lead.set(0, 0, 0);
    this.current = this.frame.dist;
    this.raise = this.shift = 0;
    this.tilt = this.tiltGoal = 0;
    this.mode = null;
    this.lastYaw = this.lastPitch = this.lastTarget = null;
    this.turnRate = this.tiltRate = 0;
    this.motion.set(0, 0, 0);
    if (turn) this.yaw = hero.yaw;
    this.ready = true;
    this.combat = 0;
    this.reveal();
  }

  reveal() {
    if (this.hidden && this.model) this.model.visible = true;
    this.hidden = false;
  }

  rest() {
    if (this.camera.near === this.baseNear) return;
    this.camera.near = this.baseNear;
    this.camera.updateProjectionMatrix();
  }

  // A cinematic or pause stops these updates; she must not stay hidden through it, nor the
  // view keep a near plane drawn in for her.
  watch() {
    if (this.watching || typeof requestAnimationFrame !== "function") return;
    this.watching = true;
    let seen = this.ticks;
    const check = () => {
      const close = this.camera.near !== this.baseNear;
      if ((!this.hidden && !close) || this.ticks === seen) {
        this.reveal();
        if (this.ticks === seen) this.rest();
        this.watching = false;
        return;
      }
      seen = this.ticks;
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  update(dt, hero, look, move = { x: 0, y: 0 }, targets = []) {
    this.ticks = (this.ticks || 0) + 1;
    if (!this.ready) this.snap(hero);
    let proximity = 0;
    if (
      !hero.swimming &&
      (hero.state === "ground" || hero.state === "air" || hero.state === "roll")
    ) {
      for (const target of targets) {
        if (!target.hostile || !target.alive()) continue;
        const point = target.head?.() || target.center();
        const dx = point.x - hero.pos.x,
          dz = point.z - hero.pos.z,
          distance = Math.hypot(dx, dz);
        if (
          distance < 0.1 ||
          distance > 7 ||
          Math.abs(point.y - hero.feet - 1.35) > 3 ||
          (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / distance < 0.45
        )
          continue;
        const delta = this.offset.set(
          point.x - hero.pos.x,
          point.y - hero.feet - 1.35,
          point.z - hero.pos.z,
        );
        const reach = delta.length();
        delta.divideScalar(reach);
        const hit = this.world.ray(
          hero.pos.x,
          hero.feet + 1.35,
          hero.pos.z,
          delta.x,
          delta.y,
          delta.z,
          reach,
          blocksSight,
        );
        if (hit && hit.t < reach - (target.radius || 0.35) - 0.08) continue;
        proximity = Math.max(
          proximity,
          THREE.MathUtils.clamp((7 - distance) / 4, 0, 1),
        );
      }
    }
    this.combat += (proximity - this.combat) * (1 - Math.exp(-dt * 6));
    const aiming =
      hero.aiming &&
      hero.equipment === "pistols" &&
      (hero.state === "ground" || hero.state === "air") &&
      !hero.swimming;
    this.aim += ((aiming ? 1 : 0) - this.aim) * (1 - Math.exp(-dt * 9));
    const touched = Math.abs(look.x) + Math.abs(look.y) > 1e-4;
    this.idle = touched ? 0 : this.idle + dt;
    this.yaw -= look.x;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + look.y,
      hero.swimming ? -1.35 : -0.45,
      hero.swimming ? 1.35 : 1.2,
    );

    // Lazy follow: only while running straight ahead without touching the camera. Following
    // sideways input would chase its own tail, since input is relative to the camera.
    if (
      this.settings?.recenter !== false &&
      this.idle > 1.1 &&
      !aiming &&
      hero.state === "ground" &&
      hero.speed > 1.5 &&
      move.y > 0.7 &&
      Math.abs(move.x) < 0.35
    ) {
      const d = wrap(hero.yaw - this.yaw);
      if (Math.abs(d) < 1.9)
        this.yaw += d * Math.min(1, dt * 0.9 * (hero.speed / 5.6));
    }

    // Framing eases between states.
    const base = FRAMES[hero.state] || FRAMES.ground;
    const combat = this.combat * (1 - this.aim);
    const frame = this.frame;
    const kf = 1 - Math.exp(-dt * 3);
    frame.dist +=
      (THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(base.dist, 5, combat),
        3.55,
        this.aim,
      ) -
        frame.dist) *
      kf;
    frame.lift +=
      (THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(base.lift, 1.95, combat),
        1.48,
        this.aim,
      ) -
        frame.lift) *
      kf;
    frame.pitch += (base.pitch * (1 - this.aim) - frame.pitch) * kf;
    frame.shoulder +=
      ((hero.swimming ? Math.sin(this.pitch) ** 2 * 0.75 : 0) -
        frame.shoulder) *
      kf;

    // Lead the target a little in the direction of travel.
    const kl = 1 - Math.exp(-dt * 3);
    this.lead.x +=
      (THREE.MathUtils.clamp(hero.vel.x * 0.16, -0.9, 0.9) - this.lead.x) * kl;
    this.lead.z +=
      (THREE.MathUtils.clamp(hero.vel.z * 0.16, -0.9, 0.9) - this.lead.z) * kl;
    this.lead.y +=
      ((hero.swimming
        ? THREE.MathUtils.clamp(hero.swimVertical * 0.2, -0.65, 0.65)
        : 0) -
        this.lead.y) *
      kl;
    const goal = this.goal.set(
      hero.pos.x +
        this.lead.x * (1 - this.aim) -
        Math.cos(this.yaw) *
          (this.aim * 0.62 + this.frame.shoulder + combat * 1.2),
      hero.feet + this.frame.lift + this.lead.y,
      hero.pos.z +
        this.lead.z * (1 - this.aim) +
        Math.sin(this.yaw) *
          (this.aim * 0.62 + this.frame.shoulder + combat * 1.2),
    );
    const pivot = this.pivot.set(
      hero.pos.x,
      hero.feet + this.frame.lift,
      hero.pos.z,
    );
    const ledge =
      hero.ledge && (hero.state === "hang" || hero.state === "climb");
    if (ledge) {
      const n = hero.ledge.n;
      goal.x += (n?.x ?? 0) * 0.45;
      goal.z += (n?.z ?? 0) * 0.45;
      pivot.x += (n?.x ?? 0) * 0.45;
      pivot.z += (n?.z ?? 0) * 0.45;
      pivot.y = Math.max(pivot.y, hero.ledge.top + 0.35);
      goal.y = Math.max(goal.y, pivot.y);
    }
    // On a climbing wall the lens stands off the surface, a little to one side of her.
    const cling = hero.state === "wall" && hero.cling?.s;
    if (cling) {
      const { n, t, side } = cling;
      goal.x += n.x * 0.5 + t.x * side * 0.3;
      goal.z += n.z * 0.5 + t.z * side * 0.3;
      pivot.x += n.x * 0.5;
      pivot.z += n.z * 0.5;
    }
    const kxz = 1 - Math.exp(-dt * 12),
      ky = 1 - Math.exp(-dt * (hero.state === "air" ? 4.5 : 8));
    this.target.x += (goal.x - this.target.x) * kxz;
    this.target.z += (goal.z - this.target.z) * kxz;
    this.target.y += (goal.y - this.target.y) * ky;
    if (ledge) this.target.y = Math.max(this.target.y, pivot.y);
    const offset = this.offset.copy(this.target).sub(pivot);
    const reach = offset.length();
    if (reach > 1e-4) {
      offset.multiplyScalar(1 / reach);
      const hit = this.world.ray(
        pivot.x,
        pivot.y,
        pivot.z,
        offset.x,
        offset.y,
        offset.z,
        reach + 0.28,
        blocksLens,
      );
      if (hit)
        this.target
          .copy(pivot)
          .addScaledVector(offset, Math.max(0, hit.t - 0.28));
    }

    const high = hero.swimming ? 1.35 : 1.3;
    const level = THREE.MathUtils.clamp(
      this.pitch + this.frame.pitch,
      hero.swimming ? -1.35 : -0.45,
      high,
    );

    // On a ledge or against a block the lens swings round behind the explorer, so a hang
    // entered facing the other way does not leave the camera on the wrong side of the wall.
    // Where rock stands close behind her, the boom lifts over it or, once she stands still
    // with the camera left alone, turns towards the nearest side with room.
    const driven =
      (hero.state === "hang" ||
        hero.state === "climb" ||
        hero.state === "grab" ||
        hero.state === "shove" ||
        hero.state === "wall") &&
      this.idle > 0.25;
    const still =
      !driven &&
      hero.state === "ground" &&
      hero.speed < 0.3 &&
      Math.abs(move.x) + Math.abs(move.y) < 0.1 &&
      this.idle > 0.3;
    const mode = driven ? NUDGES : still ? SWINGS : LIFTS;
    if (mode !== this.mode) {
      this.mode = mode;
      this.anchor = this.yaw;
      this.swingClock = 0;
    }
    const home = driven
      ? hero.yaw + (cling ? cling.side * 0.2 : 0)
      : mode === SWINGS
        ? this.anchor
        : this.yaw;
    this.swingClock -= dt;
    if (this.swingClock <= 0) {
      this.swingClock = 0.12;
      if (this.aim > 0.5) {
        this.swingAim = home;
        this.swingTurn = 0;
        this.tiltGoal = 0;
      } else this.reframe(home, level, high, mode);
    }
    if (driven || (mode === SWINGS && this.swingTurn)) {
      const d = wrap(this.swingAim - this.yaw);
      this.yaw +=
        d * Math.min(1, dt * (driven ? (Math.abs(d) > 1.2 ? 5 : 2) : 3));
    }
    this.tilt +=
      (this.tiltGoal - this.tilt) *
      (1 - Math.exp(-dt * (this.tiltGoal > this.tilt ? 4 : 1.5)));
    const pitch = Math.min(high, level + this.tilt);
    const cp = Math.cos(pitch),
      sp = Math.sin(pitch);

    // How fast the boom turns and its base moves, so the probes can look where it is going.
    const kr = 1 - Math.exp(-dt * 12);
    if (this.lastYaw !== null && dt > 0) {
      this.turnRate +=
        (wrap(this.yaw - this.lastYaw) / dt - this.turnRate) * kr;
      this.tiltRate += ((pitch - this.lastPitch) / dt - this.tiltRate) * kr;
    }
    if (this.lastTarget && dt > 0) {
      this.motion.x +=
        ((this.target.x - this.lastTarget.x) / dt - this.motion.x) * kr;
      this.motion.z +=
        ((this.target.z - this.lastTarget.z) / dt - this.motion.z) * kr;
    }
    this.lastYaw = this.yaw;
    this.lastPitch = pitch;
    this.lastTarget = this.previous.copy(this.target);

    const dir = this.dir.set(
      -Math.sin(this.yaw) * cp,
      sp,
      -Math.cos(this.yaw) * cp,
    );
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.up.crossVectors(dir, this.right).normalize();

    // Rock between the explorer and the lens. The lens's own probes bound the boom at once, so
    // it never shows through walls; the wider ones ease it in before that bound is reached.
    let hard = this.frame.dist;
    for (const [side, up] of PROBES)
      hard = Math.min(hard, this.probe(side, up));
    let soft = hard;
    for (const [side, up] of AHEAD) soft = Math.min(soft, this.probe(side, up));
    soft = Math.max(soft, hard - 1.5);
    if (Math.abs(this.turnRate) + Math.abs(this.tiltRate) > 0.05) {
      const ahead = THREE.MathUtils.clamp(
        pitch + this.tiltRate * 0.2,
        hero.swimming ? -1.35 : -0.45,
        high,
      );
      soft = Math.min(
        soft,
        this.span(
          this.yaw + this.turnRate * 0.2,
          Math.cos(ahead),
          Math.sin(ahead),
        ),
      );
    }
    const pace = Math.hypot(this.motion.x, this.motion.z);
    if (pace > 0.3) {
      const coming = this.coming
        .copy(this.target)
        .addScaledVector(this.motion, Math.min(0.25, 1.5 / pace));
      if (!this.blocked(coming, 0.05))
        soft = Math.min(soft, this.span(this.yaw, cp, sp, Infinity, coming));
    }
    // A short boom comes back out faster, so a tight spot does not linger once there is room.
    const cramped = 1 - THREE.MathUtils.smoothstep(this.current, 0.7, 2.0);
    const kin = 1 - Math.exp(-dt * 10),
      kout = 1 - Math.exp(-dt * (2.2 + 2 * cramped));
    this.current += (soft - this.current) * (soft < this.current ? kin : kout);
    this.current = Math.min(this.current, hard);

    // A thin post can stand between the probes: the lens comes in until it is clear of it. An
    // edge grazed while the boom eases out is passed instead, or the lens would stall at it.
    const lens = this.lens.copy(this.target).addScaledVector(dir, this.current);
    if (this.blocked(lens)) {
      const limit = Math.min(soft, hard, this.current + 0.9);
      let out = this.current;
      while (out < limit - 1e-3) {
        out = Math.min(out + 0.15, limit);
        lens.copy(this.target).addScaledVector(dir, out);
        if (!this.blocked(lens)) break;
      }
      if (out > this.current && !this.blocked(lens)) this.current = out;
      else lens.copy(this.target).addScaledVector(dir, this.current);
    }
    for (let i = 0; i < 20 && this.current > 0 && this.blocked(lens); i++) {
      this.current = Math.max(0, this.current - 0.3);
      lens.copy(this.target).addScaledVector(dir, this.current);
    }

    // A boom that stays short moves the lens over her shoulder, to the side with room, and up,
    // and a level one looks past her, so she stays readable instead of filling the frame.
    const short = 1 - THREE.MathUtils.smoothstep(this.current, 0.7, 2.0);
    let shiftGoal = 0,
      raiseGoal = 0;
    if (short > 1e-3) {
      const right = this.room(1),
        left = this.room(-1);
      if (Math.abs(right - left) > 0.25) this.side = right > left ? 1 : -1;
      shiftGoal =
        this.side *
        Math.min(
          short * 0.55 * (1 - this.aim),
          Math.max(0, (this.side > 0 ? right : left) - 0.3),
        );
      raiseGoal = short * 0.6;
    }
    let fit = 0;
    for (const share of FITS)
      if (
        share === 0 ||
        this.reachable(lens, shiftGoal * share, raiseGoal * share)
      ) {
        fit = share;
        break;
      }
    // Signed, so a change of shoulder passes behind her instead of jumping across.
    this.shift = ease(
      this.shift,
      shiftGoal * fit,
      dt,
      Math.abs(shiftGoal * fit) > Math.abs(this.shift) &&
        shiftGoal * this.shift >= 0,
    );
    this.raise = ease(this.raise, raiseGoal * fit, dt);
    if (!this.reachable(lens, this.shift, this.raise)) {
      const shiftFrom = this.shift,
        raiseFrom = this.raise;
      for (const k of STEPS) {
        this.shift = shiftFrom + (shiftGoal * fit - shiftFrom) * k;
        this.raise = raiseFrom + (raiseGoal * fit - raiseFrom) * k;
        if (k === 1 || this.reachable(lens, this.shift, this.raise)) break;
      }
    }
    const shift = this.shift,
      raise = this.raise;
    lens.addScaledVector(this.right, shift);
    lens.y += raise;
    this.flat.set(dir.x, 0, dir.z).normalize();
    const origin = this.look
      .copy(this.target)
      .addScaledVector(this.right, shift)
      .addScaledVector(
        this.flat,
        -short * 1.1 * (1 - THREE.MathUtils.smoothstep(pitch, 0.45, 0.9)),
      );

    const cam = this.camera;
    // The field of view setting widens or narrows the screen's own fit (58 degrees landscape).
    const fov = Math.min(
      100,
      this.baseFov + (this.settings?.fov ?? 58) - 58 - this.aim * 8,
    );
    if (Math.abs(cam.fov - fov) > 0.001) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.position.copy(lens);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s =
        this.shake *
        this.shake *
        0.12 *
        (this.shakeScale ?? 1) *
        Math.min(1, this.current / 2);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    // A boom shorter than a metre looks at a point a metre ahead, so the heading stays defined.
    cam.lookAt(
      this.point
        .copy(origin)
        .addScaledVector(dir, Math.min(0, this.current - 1)),
    );
    this.conceal(hero);
  }

  // The cheapest turn from `home` and lift above `level` whose boom has room. Coming back
  // down needs more room than going up, so the lift does not hunt.
  reframe(home, level, high, options) {
    const enough = Math.min(this.frame.dist, 2);
    const top = Math.min(high, Math.max(level, LIFT_TOP));
    const moving = options === LIFTS;
    let there = 0,
      best = null,
      score = -Infinity,
      length = 0;
    for (const option of options) {
      const [turn, lift] = option;
      if (lift > 0 && level + lift - 0.2 >= top) continue;
      const pitch = Math.min(level + lift, top);
      const lower = pitch - level < this.tiltGoal - 1e-3;
      // A camera the player turns, or that follows her, lifts only over rock it clears: a lift
      // that merely lengthens the boom along a tall wall would bob as it sweeps past.
      const need = Math.max(
        enough + (lower ? 0.4 : 0),
        moving && lift ? this.frame.dist * 0.85 : 0,
      );
      const room = this.span(
        home + turn,
        Math.cos(pitch),
        Math.sin(pitch),
        need,
      );
      if (!turn && !lift) there = room;
      if (room >= need) {
        best = option;
        length = Infinity;
        break;
      }
      const value =
        Math.min(room, this.frame.dist) -
        0.6 * cost(option) +
        (turn && Math.sign(turn) === this.swing ? 0.25 : 0);
      if (value > score) {
        best = option;
        score = value;
        length = room;
      }
    }
    const [turn, lift] =
      best && (length === Infinity || (!moving && length >= there + 0.75))
        ? best
        : options[0];
    this.swingAim = home + turn;
    this.swingTurn = turn;
    this.tiltGoal = Math.min(level + lift, top) - level;
    if (turn) this.swing = Math.sign(turn);
  }

  // The boom the lens's probes allow along a yaw. Once that reaches `need`, it is the boom the
  // wider probes then settle at.
  span(yaw, cp, sp, need = Infinity, from = this.target) {
    const d = this.turnDir.set(-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp);
    const r = this.turnRight.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const u = this.turnUp.crossVectors(d, r).normalize();
    let hard = this.frame.dist;
    for (const [side, up] of PROBES)
      hard = Math.min(hard, this.cast(side, up, d, r, u, from));
    if (hard < need) return hard;
    let soft = hard;
    for (const [side, up] of AHEAD)
      soft = Math.min(soft, this.cast(side, up, d, r, u, from));
    return Math.max(soft, hard - 1.5);
  }

  // Free distance beside the target, towards the lens's right or left.
  room(side) {
    const t = this.target,
      r = this.right;
    const hit = this.world.ray(
      t.x,
      t.y,
      t.z,
      r.x * side,
      0,
      r.z * side,
      1.2,
      blocksLens,
    );
    return hit ? hit.t : 1.2;
  }

  // Whether the lens moved aside and up keeps a clear line to her and stays out of rock.
  reachable(lens, shift, raise) {
    const p = this.trial.copy(lens).addScaledVector(this.right, shift);
    p.y += raise;
    if (this.blocked(p)) return false;
    const t = this.target;
    const d = this.offset.subVectors(p, t);
    const length = d.length();
    if (length < 1e-4) return true;
    d.divideScalar(length);
    return !this.world.ray(
      t.x,
      t.y,
      t.z,
      d.x,
      d.y,
      d.z,
      length + 0.3,
      blocksLens,
    );
  }

  blocked(p, r = 0.12) {
    for (const b of this.world.boxes) {
      if (!b.solid || !b.cam || p.y < b.minY - r || p.y > b.maxY + r) continue;
      if (b.shape === "round") {
        if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 < (b.r + r) ** 2) return true;
      } else if (
        b.shape === "box" &&
        p.x > b.minX - r &&
        p.x < b.maxX + r &&
        p.z > b.minZ - r &&
        p.z < b.maxZ + r
      )
        return true;
    }
    return false;
  }

  probe(across, rise) {
    return this.cast(across, rise, this.dir, this.right, this.up);
  }

  // A probe that would start inside rock beside the target, or meets rock right beside her,
  // comes in towards the centre: only the lens itself needs the probes' width.
  cast(across, rise, d, r, u, t = this.target) {
    const p = this.trial;
    let hit = null;
    for (const share of SHARES) {
      p.set(
        t.x + (r.x * across + u.x * rise) * share,
        t.y + u.y * rise * share,
        t.z + (r.z * across + u.z * rise) * share,
      );
      if (share > 0 && this.blocked(p, 0.02)) continue;
      hit = this.world.ray(
        p.x,
        p.y,
        p.z,
        d.x,
        d.y,
        d.z,
        this.frame.dist + 0.5,
        blocksLens,
      );
      if (share === 0 || (!across && !rise) || !hit || hit.t > 1.2) break;
    }
    return hit ? Math.max(0, hit.t - 0.45) : this.frame.dist;
  }

  // Close to her, the near plane draws in until it clears her body; she is hidden only when even
  // the closest plane would cut her, so she shows again as soon as the lens is out of her.
  conceal(hero) {
    const joints = this.model?.userData.joints;
    const cam = this.camera,
      lens = cam.position;
    let inside = false,
      near = this.baseNear;
    if (
      joints?.hips &&
      joints.head &&
      (lens.x - hero.pos.x) ** 2 + (lens.z - hero.pos.z) ** 2 < 6.25 &&
      Math.abs(lens.y - hero.feet - 0.9) < 2.6
    ) {
      cam.getWorldDirection(this.forward);
      this.across.crossVectors(this.forward, cam.up).normalize();
      this.above.crossVectors(this.across, this.forward);
      const margin = this.hidden ? 0.005 : 0;
      // Her pose is placed after the camera moves; after a teleport it is still where she was.
      const moved = this.model.getWorldPosition(this.placed);
      moved.set(
        hero.pos.x - moved.x,
        hero.feet - moved.y,
        hero.pos.z - moved.z,
      );
      if (moved.lengthSq() < 1) moved.set(0, 0, 0);
      joints.hips.getWorldPosition(this.hips).add(moved);
      joints.head.getWorldPosition(this.spine).add(moved).sub(this.hips);
      let count = 0;
      for (const [along, r] of BODY) {
        const part = this.parts[count++];
        part.at.copy(this.hips).addScaledVector(this.spine, along);
        part.r = r + margin;
      }
      for (const [name, r] of LIMBS)
        if (joints[name]) {
          const part = this.parts[count++];
          joints[name].getWorldPosition(part.at).add(moved);
          part.r = r + margin;
        }
      inside = true;
      for (const share of NEARS)
        if (!this.clips(this.baseNear * share, count)) {
          near = this.baseNear * share;
          inside = false;
          break;
        }
      if (inside) near = this.baseNear;
    }
    if (cam.near !== near) {
      cam.near = near;
      cam.updateProjectionMatrix();
      if (near !== this.baseNear) this.watch();
    }
    if (inside === this.hidden) return;
    if (inside && this.model) {
      this.model.visible = false;
      this.hidden = true;
      this.watch();
    } else this.reveal();
  }

  // Whether a part of her reaches into the box that holds the view between the lens and a near
  // plane at `near`. Testing the frustum's side planes one by one also caught parts beside it.
  clips(near, count) {
    const cam = this.camera;
    const tall = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * near,
      wide = tall * cam.aspect;
    for (let i = 0; i < count; i++) {
      const { at, r } = this.parts[i];
      const v = this.offset.subVectors(at, cam.position);
      const depth = v.dot(this.forward);
      if (depth - r > near || depth + r < 0) continue;
      const along = depth - THREE.MathUtils.clamp(depth, 0, near),
        up = Math.max(0, Math.abs(v.dot(this.above)) - tall),
        side = Math.max(0, Math.abs(v.dot(this.across)) - wide);
      if (along * along + up * up + side * side < r * r) return true;
    }
    return false;
  }
}
