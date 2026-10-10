import * as THREE from "three";

// Procedural animation for the articulated explorer. Each state builds a pose, a target
// angle per joint, and every joint axis chases its target through a damped spring, so
// states blend and land with weight instead of snapping. Gait curves follow real walking
// and running: the knee folds during the swing, the body bobs twice a cycle (lowest at
// mid-stance when running, highest when walking), shoulders counter-rotate the hips.
// Conventions follow the asset contract: with the front at +Z, a positive rotation.x
// swings a hanging limb backwards and tips the spine forwards.

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

export class Spring {
  constructor(v = 0) {
    this.v = v;
    this.dv = 0;
  }

  step(target, dt, freq, damping) {
    const w = freq * Math.PI * 2;
    // Semi-implicit Euler turns unstable once w·h nears 1 with this much damping, so
    // substep until each step is a small fraction of the spring's period.
    const n = Math.max(1, Math.ceil(dt * w * 4));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = w * w * (target - this.v) - 2 * damping * w * this.dv;
      this.dv += a * h;
      this.v += this.dv * h;
    }
    return this.v;
  }
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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
    this.gaitSpeed = 0;
    this.motionTurn = 0;
    this.motionAccel = 0;
    this.swimPhase = 0;
    this.swimBlend = 0;
    this.articulatedFeet =
      this.legs.length === 2 && this.legs.every((leg) => leg.foot);
    this.pelvisDrop = new Spring();
    this.breathPhase = 0;
    this.effort = 0;
    this.gaze = { x: new Spring(), y: new Spring() };
    this.blink = { next: 2.6, start: -10, count: 0, value: 0 };
    this.face = this.controls(model.userData.face);
    this.secondary = this.controls(model.userData.secondary);
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

  arm(side, s) {
    const J = this.joints;
    const upper = J[side + "UpperArm"],
      lower = J[side + "LowerArm"],
      hand = J[side + "Hand"] || null;
    if (!upper || !lower) return null;
    this.model.updateMatrixWorld(true);
    const rest = this.model.userData.palms?.[side];
    const palmModel = rest
      ? new THREE.Vector3(...rest)
      : new THREE.Vector3(0.24 * s, 0.86, 0.06);
    const palmWorld = this.model.localToWorld(palmModel.clone());
    const holder = hand || lower;
    return {
      side: s,
      upper,
      lower,
      hand,
      palm: holder.worldToLocal(palmWorld.clone()),
      // The palm faces the thigh at rest: inwards, towards the body's centre line.
      normal: new THREE.Vector3(-s, 0, 0),
      // From the wrist through the palm towards the fingers, in the hand's frame.
      fingers: holder.worldToLocal(palmWorld.clone()).normalize(),
      weight: 0,
    };
  }

  leg(side) {
    const upper = this.joints[side + "UpperLeg"],
      lower = this.joints[side + "LowerLeg"];
    const foot = this.joints[side + "Foot"] || null;
    const holder = foot || lower;
    if (!upper || !lower) return null;
    this.model.updateMatrixWorld(true);
    const vertices = [];
    holder.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++)
        vertices.push(
          new THREE.Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(mesh.matrixWorld),
        );
    });
    if (!vertices.length) return null;
    const floor = Math.min(...vertices.map((v) => v.y));
    const soles = vertices.filter((v) => v.y < floor + 0.014);
    const bounds = new THREE.Box3().setFromPoints(soles),
      center = bounds.getCenter(new THREE.Vector3());
    center.y = floor;
    const boot = vertices.filter((v) => v.y < floor + 0.16);
    const support = new Map();
    for (let i = 0; i < 128; i++) {
      const a = ((i % 16) * Math.PI) / 8,
        elevation = (Math.floor(i / 16) * Math.PI) / 7;
      const direction = new THREE.Vector3(
        Math.sin(elevation) * Math.cos(a),
        Math.cos(elevation),
        Math.sin(elevation) * Math.sin(a),
      );
      const point = boot.reduce((best, v) =>
        v.dot(direction) > best.dot(direction) ? v : best,
      );
      support.set(point.toArray().join(), point);
    }
    const samples = [...support.values()].map((v) =>
      holder.worldToLocal(v.clone()),
    );
    return {
      side,
      upper,
      lower,
      foot,
      hand: foot,
      normal: new THREE.Vector3(0, 1, 0),
      fingers: new THREE.Vector3(0, 0, 1),
      palm: holder.worldToLocal(center.clone()),
      offset: this.model.worldToLocal(center.clone()),
      heel: holder.worldToLocal(
        new THREE.Vector3(center.x, floor, bounds.min.z),
      ),
      toe: holder.worldToLocal(
        new THREE.Vector3(center.x, floor, bounds.max.z),
      ),
      samples,
      goal: null,
      plant: null,
      swingStart: null,
      swingEnd: null,
      stance: false,
      plantYaw: 0,
      footPitch: new Spring(),
    };
  }

  groundFeet(hero) {
    if (hero.state !== "ground" || hero.swimming) {
      if (this.articulatedFeet) this.pelvisDrop.step(0, this.frameDt, 7, 0.95);
      for (const leg of this.legs)
        leg.goal =
          leg.plant =
          leg.swingStart =
          leg.swingEnd =
          leg.solePosition =
            null;
      return;
    }
    if (this.articulatedFeet) return this.groundArticulatedFeet(hero);
    const speed = this.gaitSpeed,
      moving = smooth(0.06, 0.65, speed),
      run = smooth(2.2, 5, speed);
    const duty = mix(0.55, 0.29, run),
      stride = mix(1.4, 2.9, run);
    const forward = new THREE.Vector3(
      Math.sin(this.root.yaw.v),
      0,
      Math.cos(this.root.yaw.v),
    );
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    this.model.updateMatrixWorld(true);
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i],
        phase = (((this.phase / (Math.PI * 2) + i * 0.5) % 1) + 1) % 1;
      const resting = this.model.position
        .clone()
        .addScaledVector(right, leg.offset.x)
        .addScaledVector(forward, leg.offset.z);
      const floor = resting.y + leg.offset.y;
      const reach = Math.min(0.37, stride * duty * 0.5) * moving;
      const stance = phase < duty;
      if (!leg.goal) leg.goal = resting.clone();
      if (moving < 0.06) {
        leg.goal.lerp(resting, 1 - Math.exp(-this.frameDt * 14));
        leg.plant = leg.goal.clone();
        leg.swingStart = null;
      } else if (stance) {
        if (!leg.stance || !leg.plant)
          leg.plant =
            leg.swingEnd?.clone() ||
            resting.clone().addScaledVector(forward, reach);
        leg.goal.copy(leg.plant);
        leg.goal.y = floor;
        leg.swingStart = null;
      } else {
        if (!leg.swingStart) {
          leg.swingStart = leg.goal.clone();
          leg.swingEnd = resting
            .clone()
            .addScaledVector(forward, reach + stride * (1 - phase));
        }
        const t = (phase - duty) / (1 - duty);
        const replan =
          1 - Math.exp(-this.frameDt * Math.abs(this.motionTurn) * 4);
        leg.swingEnd.lerp(
          resting
            .clone()
            .addScaledVector(forward, reach + stride * (1 - phase)),
          replan,
        );
        leg.goal.lerpVectors(leg.swingStart, leg.swingEnd, smooth(0, 1, t));
        leg.goal.y =
          floor + Math.sin(t * Math.PI) ** 1.35 * mix(0.13, 0.3, run) * moving;
      }
      const lateral = leg.goal.clone().sub(this.model.position).dot(right);
      const side = i ? -1 : 1;
      const width = 0.1 + 0.035 * smooth(1, 5, Math.abs(this.motionTurn));
      if (side * lateral < width) {
        leg.goal.addScaledVector(right, side * width - lateral);
        if (stance) leg.plant.copy(leg.goal);
      }
      leg.stance = stance;
      const goal = {
        at: leg.goal.clone(),
        pole: forward.clone().addScaledVector(right, i ? -0.12 : 0.12),
      };
      leg.upper.rotation.copy(this.rest[leg.side + "UpperLeg"].rot);
      leg.lower.rotation.copy(this.rest[leg.side + "LowerLeg"].rot);
      leg.upper.updateMatrixWorld(true);
      solveArm(leg, goal, 1);
      for (const [name, joint] of [
        [leg.side + "UpperLeg", leg.upper],
        [leg.side + "LowerLeg", leg.lower],
      ]) {
        const rest = this.rest[name].rot;
        ["x", "y", "z"].forEach((axis, j) => {
          const spring = this.springs[name][j];
          const target =
            spring.v + wrap(joint.rotation[axis] - rest[axis] - spring.v);
          joint.rotation[axis] =
            rest[axis] + spring.step(target, this.frameDt, 6, 0.9);
        });
        joint.updateMatrixWorld(true);
      }
    }
    const low = Math.min(
      ...this.legs.flatMap((leg) =>
        leg.samples.map((v) => leg.lower.localToWorld(v.clone()).y),
      ),
    );
    const floor = this.model.position.y;
    this.model.position.y += Math.max(0, floor - low);
    this.model.updateMatrixWorld(true);
  }

  sampleGround(x, z, fallback) {
    const sample = this.groundAt?.(x, z, fallback);
    const normal = new THREE.Vector3().copy(
      sample?.normal || { x: 0, y: 1, z: 0 },
    );
    if (!normal.toArray().every(Number.isFinite) || normal.y < 0.5)
      normal.set(0, 1, 0);
    return {
      height: Number.isFinite(sample?.height) ? sample.height : fallback,
      normal: normal.normalize(),
    };
  }

  groundArticulatedFeet(hero) {
    const speed = this.gaitSpeed,
      run = smooth(2.2, 5, speed),
      moving = smooth(0.06, 0.65, speed);
    const duty = mix(0.58, 0.3, run),
      stride = mix(1.4, 2.65, run);
    const yaw = this.root.yaw.v,
      forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const floor = hero.feet + hero.stepLift + this.lift;
    this.lastGroundHeight = floor;
    const turn = smooth(1, 5, Math.abs(this.motionTurn));
    this.model.updateMatrixWorld(true);
    const targets = [];
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i],
        phase = (this.phase / (Math.PI * 2) + i * 0.5) % 1;
      let stance = moving < 0.06 || phase < duty;
      const reach =
        mix(Math.min(0.39, stride * duty * 0.5), 0.25, run) * moving;
      const resting = new THREE.Vector3(
        hero.pos.x + hero.snap.x,
        floor,
        hero.pos.z + hero.snap.z,
      )
        .addScaledVector(right, leg.offset.x)
        .addScaledVector(forward, leg.offset.z);
      if (!leg.goal) {
        leg.goal = resting.clone();
        leg.plant = resting.clone();
        leg.stance = true;
        leg.settle = null;
        leg.plantYaw = yaw;
      }
      let pitch = 0;
      if (moving < 0.06) {
        if (!leg.stance && !leg.settle)
          leg.settle = { from: leg.goal.clone(), to: resting.clone(), t: 0 };
        if (leg.settle) {
          leg.settle.t = Math.min(1, leg.settle.t + this.frameDt / 0.24);
          const t = leg.settle.t;
          leg.goal.lerpVectors(leg.settle.from, leg.settle.to, smooth(0, 1, t));
          leg.goal.y += Math.sin(Math.PI * t) * 0.035;
          stance = t >= 1;
          if (stance) {
            leg.plant = leg.goal.clone();
            leg.settle = null;
          }
        } else leg.goal.copy(leg.plant);
        leg.plantYaw +=
          wrap(yaw - leg.plantYaw) * (1 - Math.exp(-this.frameDt * 8 * turn));
        leg.swingStart = null;
      } else if (stance) {
        leg.settle = null;
        if (!leg.stance || !leg.plant) {
          leg.plant =
            leg.swingEnd?.clone() ||
            resting.clone().addScaledVector(forward, reach);
          leg.plantYaw = yaw;
        }
        leg.goal.copy(leg.plant);
        leg.swingStart = null;
        const t = phase / duty;
        pitch =
          (-0.18 * (1 - smooth(0, 0.22, t)) +
            mix(0.38, 0.7, run) * smooth(0.38, 1, t)) *
          moving;
      } else {
        if (!leg.swingStart) {
          leg.swingStart = leg.solePosition?.clone() || leg.goal.clone();
          leg.swingBend = leg.bend || 0.45;
          leg.swingPhase = phase;
          leg.swingEnd = resting
            .clone()
            .addScaledVector(forward, reach + stride * (1 - phase));
        }
        const t = (phase - leg.swingPhase) / (1 - leg.swingPhase);
        leg.swingEnd.lerp(
          resting
            .clone()
            .addScaledVector(forward, reach + stride * (1 - phase)),
          1 -
            Math.exp(
              -this.frameDt *
                (Math.abs(this.motionTurn) * 4 +
                  Math.abs(this.motionAccel) * 2),
            ),
        );
        const edge = 0.1;
        const travel =
          t < edge
            ? (t * t) / (2 * edge * (1 - edge))
            : t > 1 - edge
              ? 1 - (1 - t) ** 2 / (2 * edge * (1 - edge))
              : (t - edge * 0.5) / (1 - edge);
        leg.goal.lerpVectors(
          leg.swingStart,
          leg.swingEnd,
          mix(smooth(0, 1, t), travel, run),
        );
        const heelReturn = smooth(0, 0.42, t) * (1 - smooth(0.42, 1, t));
        leg.goal.y =
          floor +
          mix(Math.sin(Math.PI * t) ** 1.3 * 0.09, heelReturn * 0.3, run);
        pitch = mix(
          mix(0.4, -0.18, smooth(0, 1, t)),
          mix(0.65, -0.1, smooth(0.08, 0.68, t)),
          run,
        );
        leg.plantYaw +=
          wrap(yaw - leg.plantYaw) * (1 - Math.exp(-this.frameDt * 12));
      }
      if (turn > 0.01 && moving > 0.05) {
        const travel = stance
          ? reach - stride * phase
          : mix(-reach, reach, smooth(0, 1, (phase - duty) / (1 - duty)));
        const pivot = resting
          .clone()
          .addScaledVector(forward, THREE.MathUtils.clamp(travel, -0.34, 0.34));
        pivot.y = leg.goal.y;
        leg.goal.lerp(pivot, turn);
        if (stance) leg.plant.copy(leg.goal);
      }
      const side = i ? -1 : 1;
      const across = leg.goal.clone().sub(this.model.position).dot(right),
        width = 0.095 + 0.045 * turn;
      if (side * across < width) {
        leg.goal.addScaledVector(right, side * width - across);
        if (stance) leg.plant.copy(leg.goal);
      }
      if (turn > 0.05)
        leg.plantYaw +=
          wrap(yaw - leg.plantYaw) * (1 - Math.exp(-this.frameDt * 8 * turn));
      const sample = this.sampleGround(leg.goal.x, leg.goal.z, floor);
      const heading = new THREE.Vector3(
        Math.sin(leg.plantYaw),
        0,
        Math.cos(leg.plantYaw),
      );
      heading
        .addScaledVector(sample.normal, -heading.dot(sample.normal))
        .normalize();
      const acrossSurface = new THREE.Vector3()
        .crossVectors(sample.normal, heading)
        .normalize();
      const base = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(acrossSurface, sample.normal, heading),
      );
      const footPitch = leg.footPitch.step(pitch, this.frameDt, 10, 0.95);
      const rotation = base
        .clone()
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            footPitch,
          ),
        );
      let at = leg.goal.clone(),
        contact = null;
      if (stance) {
        leg.goal.y = sample.height;
        leg.plant.y = sample.height;
        at.y = sample.height;
        const pivot = leg.samples.reduce((lowest, point) =>
          point.clone().applyQuaternion(rotation).dot(sample.normal) <
          lowest.clone().applyQuaternion(rotation).dot(sample.normal)
            ? point
            : lowest,
        );
        const offset = pivot.clone().sub(leg.palm);
        const tangent = new THREE.Vector3(
          offset.x,
          0,
          offset.z,
        ).applyQuaternion(base);
        const point = at.clone().add(tangent);
        at.copy(point).sub(offset.applyQuaternion(rotation));
        contact = {
          at: point,
          local: pivot.clone(),
          normal: sample.normal.clone(),
          pitch: footPitch,
          mode: turn > 0.25 ? "pivot" : "plant",
        };
      } else {
        at.y += sample.height - floor;
        if (run > 0) {
          const hip = leg.upper.getWorldPosition(new THREE.Vector3()),
            knee = leg.lower.getWorldPosition(new THREE.Vector3()),
            ankle = leg.foot.getWorldPosition(new THREE.Vector3());
          const a = hip.distanceTo(knee),
            b = knee.distanceTo(ankle);
          const t = (phase - leg.swingPhase) / (1 - leg.swingPhase);
          const bend = mix(
            mix(
              leg.swingBend || 0.45,
              1.7,
              Math.sin(Math.min(1, t / 0.4) * Math.PI * 0.5),
            ),
            0.48,
            smooth(0.4, 1, t),
          );
          const sole = leg.palm.clone().applyQuaternion(rotation);
          const planar =
            (at.x - sole.x - hip.x) ** 2 + (at.z - sole.z - hip.z) ** 2;
          const distance = a * a + b * b + 2 * a * b * Math.cos(bend);
          const height =
            hip.y - Math.sqrt(Math.max(0.04, distance - planar)) + sole.y;
          at.y = mix(at.y, height, run);
        }
        const soleY = leg.palm.clone().applyQuaternion(rotation).y;
        const low = Math.min(
          ...leg.samples.map(
            (point) => point.clone().applyQuaternion(rotation).y - soleY,
          ),
        );
        at.y = Math.max(at.y, sample.height - low + 0.004);
      }
      leg.stance = stance;
      leg.contact = contact;
      targets.push({
        leg,
        at,
        rotation,
        pole: forward.clone().addScaledVector(right, side * 0.08),
      });
    }
    let drop = 0;
    for (const target of targets) {
      const { leg, at, rotation } = target;
      const hip = leg.upper.getWorldPosition(new THREE.Vector3()),
        knee = leg.lower.getWorldPosition(new THREE.Vector3()),
        ankle = leg.foot.getWorldPosition(new THREE.Vector3());
      const length = hip.distanceTo(knee) + knee.distanceTo(ankle) - 0.018;
      const destination = at
        .clone()
        .sub(leg.palm.clone().applyQuaternion(rotation));
      const planar =
        (hip.x - destination.x) ** 2 + (hip.z - destination.z) ** 2;
      const allowed =
        destination.y + Math.sqrt(Math.max(0.04, length * length - planar));
      const phase =
        (this.phase / (Math.PI * 2) + (leg.side === "right" ? 0.5 : 0)) % 1;
      const swingTime =
        (phase - (leg.swingPhase || duty)) / (1 - (leg.swingPhase || duty));
      const supportWeight = leg.stance
        ? 1
        : mix(1, smooth(0.65, 0.92, swingTime), run);
      drop = Math.max(drop, (hip.y - allowed) * supportWeight);
    }
    const correction = Math.min(0.18, Math.max(0, drop));
    const eased = this.pelvisDrop.step(correction, this.frameDt, 7, 0.95);
    this.joints.hips.position.y -= Math.max(correction, eased);
    this.model.updateMatrixWorld(true);
    for (const { leg, at, rotation, pole } of targets) {
      leg.upper.rotation.copy(this.rest[leg.side + "UpperLeg"].rot);
      leg.lower.rotation.copy(this.rest[leg.side + "LowerLeg"].rot);
      leg.foot.rotation.copy(this.rest[leg.side + "Foot"].rot);
      leg.upper.updateMatrixWorld(true);
      solveArm(
        leg,
        {
          at,
          pole,
          normal: new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
          fingers: new THREE.Vector3(0, 0, 1).applyQuaternion(rotation),
          minimumBend: leg.stance ? 0 : 0.48 * run,
        },
        1,
      );
      leg.solePosition = leg.foot.localToWorld(leg.palm.clone());
      const hipPosition = leg.upper.getWorldPosition(new THREE.Vector3()),
        kneePosition = leg.lower.getWorldPosition(new THREE.Vector3()),
        anklePosition = leg.foot.getWorldPosition(new THREE.Vector3());
      leg.bend =
        Math.PI -
        hipPosition.sub(kneePosition).angleTo(anklePosition.sub(kneePosition));
      for (const name of [
        leg.side + "UpperLeg",
        leg.side + "LowerLeg",
        leg.side + "Foot",
      ]) {
        const joint = this.joints[name],
          rest = this.rest[name].rot;
        ["x", "y", "z"].forEach((axis, j) => {
          const spring = this.springs[name][j];
          spring.dv = THREE.MathUtils.clamp(
            wrap(joint.rotation[axis] - rest[axis] - spring.v) / this.frameDt,
            -18,
            18,
          );
          spring.v = joint.rotation[axis] - rest[axis];
        });
      }
    }
  }

  // Soles to palm when hanging with the palms `ahead` metres in front of the shoulders: the
  // arm nearly straight, leaning forward to the lip. The explorer hangs at that depth.
  hangReach(ahead) {
    const L = this.ik.left;
    if (!L) return null;
    const m = this.model;
    const saved = [m.position.clone(), m.rotation.clone()];
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.updateMatrixWorld(true);
    const S = L.upper.getWorldPosition(new THREE.Vector3());
    const E = L.lower.getWorldPosition(new THREE.Vector3());
    const P = (L.hand || L.lower).localToWorld(L.palm.clone());
    m.position.copy(saved[0]);
    m.rotation.copy(saved[1]);
    m.updateMatrixWorld(true);
    const len = S.distanceTo(E) + E.distanceTo(P) - 0.01;
    return S.y + Math.sqrt(Math.max(0, len * len - ahead * ahead));
  }

  measureReach() {
    const L = this.ik.left;
    if (!L) return null;
    const m = this.model;
    const saved = [m.position.clone(), m.rotation.clone()];
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    L.upper.rotation.x = -2.9;
    m.updateMatrixWorld(true);
    const p = (L.hand || L.lower).localToWorld(L.palm.clone());
    L.upper.rotation.x = 0;
    m.position.copy(saved[0]);
    m.rotation.copy(saved[1]);
    m.updateMatrixWorld(true);
    return p.y;
  }

  // `lift` raises the feet onto ground the colliders do not model, such as a sand drift.
  update(dt, hero, reduced = false, lift = 0) {
    if (dt <= 0) return;
    this.lift =
      (this.lift || 0) + (lift - (this.lift || 0)) * Math.min(1, dt * 10);
    this.time += dt;
    this.frameDt = dt;
    const rawTurn =
      this.lastYaw === null ? 0 : wrap(hero.yaw - this.lastYaw) / dt;
    this.lastYaw = hero.yaw;
    const dx = this.lastPosition ? hero.pos.x - this.lastPosition.x : 0;
    const dz = this.lastPosition ? hero.pos.z - this.lastPosition.z : 0;
    const distance = Math.hypot(dx, dz);
    const discontinuity = distance > Math.max(0.65, (hero.speed || 0) * dt * 3);
    this.distance =
      !discontinuity &&
      hero.state === "ground" &&
      this.lastState === "ground" &&
      hero.speed > 0.02
        ? distance
        : 0;
    this.lastPosition = { x: hero.pos.x, z: hero.pos.z };
    const actual = this.distance / dt;
    const beforeSpeed = this.gaitSpeed;
    this.gaitSpeed +=
      (actual - this.gaitSpeed) *
      (1 - Math.exp(-dt * (actual > this.gaitSpeed ? 9 : 12)));
    this.motionAccel +=
      ((this.gaitSpeed - beforeSpeed) / dt - this.motionAccel) *
      (1 - Math.exp(-dt * 7));
    this.motionTurn +=
      (THREE.MathUtils.clamp(rawTurn, -8, 8) - this.motionTurn) *
      (1 - Math.exp(-dt * 8));
    if (discontinuity)
      for (const leg of this.legs)
        leg.goal =
          leg.plant =
          leg.swingStart =
          leg.swingEnd =
          leg.solePosition =
            null;
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
    overlays(pose, root, hero);

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
          7,
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
    const pitch = this.root.pitch.step(root.pitch, dt, 4, 0.55);
    const roll = this.root.roll.step(root.roll, dt, 4, 0.8);
    const m = this.model;
    m.position.set(
      hero.pos.x + hero.snap.x,
      hero.feet + hero.stepLift + this.lift,
      hero.pos.z + hero.snap.z,
    );
    // A roll turns the whole body once about its tucked middle, not about the feet.
    let tumble = 0;
    if (hero.state === "roll") {
      tumble = Math.min(1, hero.t / 0.52) * Math.PI * 2;
      const c = 0.55;
      const ly = c - c * Math.cos(tumble),
        lz = -c * Math.sin(tumble);
      m.position.x += Math.sin(yaw.v) * lz;
      m.position.z += Math.cos(yaw.v) * lz;
      m.position.y += ly;
    }
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
    this.groundFeet(hero);
    this.updateScarf(dt, hero, turnRate);
    this.reach(dt, hero, reduced);
    this.showHands(hero);
    this.updateFace(dt, hero, reduced);
    this.updateSecondary(dt, hero, reduced);
  }

  detailPose(pose, root, hero, dt) {
    const working = ["hang", "climb", "shove"].includes(hero.state) ? 0.7 : 0;
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

  updateFace(dt, hero, reduced) {
    const handles = this.face;
    if (!Object.keys(handles).length) return;
    const turn = THREE.MathUtils.clamp(this.motionTurn * 0.045, -0.16, 0.16);
    const target =
      hero.lookTarget ||
      (hero.ledge && ["hang", "climb"].includes(hero.state)
        ? {
            x: hero.ledge.hand.x,
            y: hero.ledge.top + 0.18,
            z: hero.ledge.hand.z,
          }
        : null);
    let x = 0,
      y = turn;
    if (target && this.joints.head) {
      const local = this.joints.head.worldToLocal(
        new THREE.Vector3(target.x, target.y, target.z),
      );
      y = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.28, 0.28);
      x = THREE.MathUtils.clamp(
        -Math.atan2(local.y, Math.hypot(local.x, local.z)),
        -0.2,
        0.2,
      );
    } else if (this.gaitSpeed < 0.1 && !hero.swimming) {
      const dwell = Math.floor(this.time / 2.7);
      y += Math.sin(dwell * 2.399) * 0.065;
      x = Math.sin(dwell * 1.73) * 0.027;
    }
    const gx = this.gaze.x.step(x, dt, 9, 1),
      gy = this.gaze.y.step(y, dt, 11, 1);
    const blink = this.blink;
    if (this.time >= blink.next) {
      blink.start = this.time;
      blink.count++;
      blink.next = this.time + 2.7 + (Math.sin(blink.count * 2.17) + 1) * 1.1;
    }
    const t = this.time - blink.start;
    blink.value = t < 0.06 ? smooth(0, 0.06, t) : 1 - smooth(0.08, 0.21, t);
    if (t > 0.21) blink.value = 0;
    for (const side of ["left", "right"]) {
      const eye = handles[side + "Eye"];
      if (eye) {
        eye.node.rotation.x = eye.rot.x + gx;
        eye.node.rotation.y = eye.rot.y + gy;
      }
      for (const suffix of ["UpperLid", "LowerLid"]) {
        const lid = handles[side + suffix];
        if (!lid) continue;
        const influence = lid.node.morphTargetDictionary?.blink;
        if (influence !== undefined && lid.node.morphTargetInfluences)
          lid.node.morphTargetInfluences[influence] = blink.value;
        else
          lid.node.rotation.x =
            lid.rot.x + blink.value * (suffix === "UpperLid" ? 0.62 : -0.18);
      }
    }
    if (handles.jaw)
      handles.jaw.node.rotation.x =
        handles.jaw.rot.x +
        Math.max(0, Math.sin(this.breathPhase)) * 0.012 * this.effort;
    const skin = handles.skin?.node;
    if (skin?.morphTargetInfluences) {
      const effort = skin.morphTargetDictionary?.effort,
        breathe = skin.morphTargetDictionary?.breathe;
      if (effort !== undefined)
        skin.morphTargetInfluences[effort] = this.effort * 0.4;
      if (breathe !== undefined)
        skin.morphTargetInfluences[breathe] =
          Math.max(0, Math.sin(this.breathPhase)) * mix(0.06, 0.3, this.effort);
    }
  }

  updateSecondary(dt, hero, reduced) {
    const running = smooth(1.5, 5, this.gaitSpeed),
      water = hero.swimming ? 1 : 0;
    for (const [name, handle] of Object.entries(this.secondary)) {
      const hair = name.toLowerCase().includes("hair"),
        bag = name === "satchel";
      const scale = reduced ? 0.3 : 1;
      const x =
        THREE.MathUtils.clamp(
          this.motionAccel * (hair ? -0.012 : -0.004) +
            Math.sin(this.phase * 2 - 0.55) * running * (hair ? 0.055 : 0.018) +
            water * Math.sin(this.swimPhase - 0.4) * 0.045,
          -0.17,
          0.17,
        ) * scale;
      const z =
        THREE.MathUtils.clamp(
          -this.motionTurn * (hair ? 0.035 : bag ? 0.023 : 0.009) +
            Math.sin(this.phase - 0.3) * running * (bag ? 0.05 : 0.013),
          -0.2,
          0.2,
        ) * scale;
      const frequency = hair ? 2.4 : bag ? 3 : 4.5;
      const swayMorph = handle.node.morphTargetDictionary?.sway,
        liftMorph = handle.node.morphTargetDictionary?.lift;
      if (
        handle.node.morphTargetInfluences &&
        (swayMorph !== undefined || liftMorph !== undefined)
      ) {
        const sway = handle.springs[2].step(z, dt, frequency, 0.7);
        const lift = handle.springs[1].step(
          THREE.MathUtils.clamp(
            (this.gaitSpeed / 5) * 0.65 +
              water * 0.2 +
              this.motionAccel * 0.025,
            0,
            1,
          ),
          dt,
          frequency,
          0.85,
        );
        if (swayMorph !== undefined)
          handle.node.morphTargetInfluences[swayMorph] = THREE.MathUtils.clamp(
            sway / 0.2,
            -1,
            1,
          );
        if (liftMorph !== undefined)
          handle.node.morphTargetInfluences[liftMorph] = lift * scale;
        continue;
      }
      handle.node.rotation.x =
        handle.rot.x + handle.springs[0].step(x, dt, frequency, 0.7);
      handle.node.rotation.z =
        handle.rot.z + handle.springs[2].step(z, dt, frequency, 0.7);
      handle.node.position.y =
        handle.pos.y +
        Math.max(0, -Math.sin(this.phase * 2)) *
          running *
          (bag ? 0.008 : 0.003) *
          scale;
    }
  }

  // Open, relaxed hands at rest; closed ones while a hand grips a lip, a block or a mirror, or
  // holds or throws the disc (the asset's userData.hands).
  showHands(hero) {
    const H = this.model.userData.hands;
    if (!H) return;
    const throwing = hero.throwT !== undefined && hero.throwT < 0.5;
    const closed = {
      left: (this.ik.left?.weight ?? 0) > 0.35,
      right: (this.ik.right?.weight ?? 0) > 0.35 || !!hero.holding || throwing,
    };
    for (const side of ["left", "right"]) {
      const open = H[side + "Open"],
        grip = H[side + "Grip"];
      if (!open || !grip) continue;
      open.visible = !closed[side];
      grip.visible = closed[side];
    }
  }

  // --- hands on things: two-bone IK after the pose ----------------------------------------------
  // Hanging, the palms rest on the lip; climbing, they stay there while the body rises;
  // against a block they press its face; at a mirror they hold the drum's rim. Each arm
  // blends towards its solution by a weight that eases in and out with the state.
  reach(dt, hero, reduced) {
    const L = this.ik.left,
      R = this.ik.right;
    if (!L || !R) return;
    const goal = this.reachGoals(hero);
    const k = Math.min(1, dt * (reduced ? 30 : 9));
    this.model.updateMatrixWorld(true);
    for (const arm of [L, R]) {
      const g = goal?.[arm.side > 0 ? "left" : "right"];
      arm.weight += ((g ? goal.weight : 0) - arm.weight) * k;
      if (g) arm.goal = g;
      if (arm.weight < 0.01 || !arm.goal) continue;
      solveArm(arm, arm.goal, arm.weight);
    }
  }

  reachGoals(hero) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const f = { x: Math.sin(hero.yaw), z: Math.cos(hero.yaw) };
    // The explorer's left is +X when facing +Z.
    const left = { x: f.z, z: -f.x };
    const pair = (cx, cy, cz, spread, pole, normal) => ({
      left: {
        at: V(cx + left.x * spread, cy, cz + left.z * spread),
        pole: V(
          left.x * pole.side + pole.x,
          pole.y,
          left.z * pole.side + pole.z,
        ),
        normal,
      },
      right: {
        at: V(cx - left.x * spread, cy, cz - left.z * spread),
        pole: V(
          -left.x * pole.side + pole.x,
          pole.y,
          -left.z * pole.side + pole.z,
        ),
        normal,
      },
    });
    const st = hero.state;
    if ((st === "hang" || st === "climb") && hero.ledge) {
      const { n, top, hand } = hero.ledge;
      // Planted where the climb began, so the hands stay put while the body rises.
      if (st === "hang" || !this.climbHold)
        this.climbHold = { x: hand.x, z: hand.z };
      const h = st === "climb" ? this.climbHold : hand;
      // Each palm flat on the top just behind the lip, its fingers reaching over the stone.
      const g = pair(
        h.x - n.x * 0.03,
        top + LIP,
        h.z - n.z * 0.03,
        0.2,
        { side: 0.7, x: n.x * 0.6, y: -0.3, z: n.z * 0.6 },
        V(0, -1, 0),
      );
      g.left.fingers = g.right.fingers = V(-n.x, 0, -n.z);
      // Shimmying, the leading hand reaches ahead and the other follows.
      if (st === "hang" && hero.shimmy) {
        const lead = hero.shimmy > 0 ? g.left : g.right;
        const along = { x: -n.z * hero.shimmy, z: n.x * hero.shimmy };
        const swing = Math.max(0, Math.sin(this.time * 8.5));
        lead.at.x += along.x * 0.08 * swing;
        lead.at.z += along.z * 0.08 * swing;
        lead.at.y += 0.05 * swing;
      }
      g.weight =
        st === "climb" ? 1 - smooth(0.55, 0.85, Math.min(1, hero.t)) : 1;
      return g;
    }
    this.climbHold = null;
    if ((st === "grab" || st === "shove") && hero.grip?.n) {
      const n = hero.grip.n;
      // The face the explorer braces against (hero.js BRACE), at chest height.
      const fx = hero.pos.x - n.x * 0.52,
        fz = hero.pos.z - n.z * 0.52;
      const g = pair(
        fx + n.x * 0.02,
        hero.feet + 1.12,
        fz + n.z * 0.02,
        0.24,
        { side: 0.6, x: 0, y: -0.8, z: 0 },
        V(-n.x, 0, -n.z),
      );
      g.weight = 1;
      return g;
    }
    if (st === "turn" && hero.grip?.ref) {
      const m = hero.grip.ref;
      const dx = hero.pos.x - m.x,
        dz = hero.pos.z - m.z;
      const d = Math.hypot(dx, dz) || 1;
      const g = pair(
        m.x + (dx / d) * 0.5,
        0.6,
        m.z + (dz / d) * 0.5,
        0.3,
        { side: 0.7, x: dx / d, y: -0.5, z: dz / d },
        V(0, -1, 0),
      );
      g.weight = 1;
      return g;
    }
    return null;
  }

  // One-off impulses when a state begins: the swing of a catch, the squash of a landing.
  enter(state, hero) {
    const S = this.springs;
    if (state === "hang") {
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

  updateScarf(dt, hero, turnRate) {
    const j = this.joints.scarfTail;
    if (!j) return;
    if (!this.scarfRest) this.scarfRest = j.rotation.clone();
    const gust =
      Math.sin(this.time * 2.3) * 0.5 + Math.sin(this.time * 5.1 + 1) * 0.3;
    const lift =
      hero.state === "hang"
        ? -0.1
        : 0.2 + hero.speed * 0.16 + Math.max(0, -hero.vel.y) * 0.07;
    const tx = Math.min(1.35, lift + gust * 0.12),
      tz = THREE.MathUtils.clamp(-turnRate * 0.08, -0.6, 0.6) + gust * 0.08;
    const s = this.scarf;
    s.vx += ((tx - s.x) * 60 - s.vx * 7) * dt;
    s.vz += ((tz - s.z) * 60 - s.vz * 7) * dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    j.rotation.x = this.scarfRest.x + s.x;
    j.rotation.z = this.scarfRest.z + s.z;
  }
}

// Two-bone IK for one arm: swing the upper arm so the elbow lies in the plane of shoulder,
// target and pole, at the angle the arm's lengths allow, then swing the forearm onto the
// target, then turn the hand so its palm faces `normal`. `weight` blends from the pose.
const _v = [0, 1, 2, 3, 4, 5, 6].map(() => new THREE.Vector3());
// Hanging, the palm's face rests this far over the lip's top.
export const LIP = 0.004;
const _q = [0, 1, 2].map(() => new THREE.Quaternion());
function swing(joint, from, to, weight) {
  const q = _q[0].setFromUnitVectors(from, to);
  _q[1].identity().slerp(q, weight);
  const parent = joint.parent.getWorldQuaternion(_q[2]);
  const world = parent.clone().multiply(joint.quaternion);
  joint.quaternion.copy(parent.invert().multiply(_q[1].multiply(world)));
  joint.updateMatrixWorld(true);
}

function solveArm(arm, goal, weight) {
  // Given the fingers' way as well as the palm's, the hand's whole turn is known before the
  // arm moves: the wrist is then brought to where the palm lands on the goal once the hand
  // takes that turn. Otherwise the palm itself is brought there and turned after.
  const turned = arm.hand && goal.fingers ? handTurn(arm, goal) : null;
  const holder = arm.hand || arm.lower;
  const end = () =>
    turned
      ? arm.hand.getWorldPosition(_v[2])
      : holder.localToWorld(_v[2].copy(arm.palm));
  const at = turned
    ? _v[6].copy(goal.at).sub(arm.palm.clone().applyQuaternion(turned))
    : _v[6].copy(goal.at);
  const S = arm.upper.getWorldPosition(_v[0]);
  const E = arm.lower.getWorldPosition(_v[1]);
  const P = end();
  const a = S.distanceTo(E),
    b = E.distanceTo(P);
  const toT = _v[3].copy(at).sub(S);
  const d = THREE.MathUtils.clamp(
    toT.length(),
    Math.abs(a - b) + 1e-3,
    goal.minimumBend
      ? Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(goal.minimumBend))
      : a + b - 1e-3,
  );
  const dir = toT.normalize();
  const pole = _v[4].copy(goal.pole).addScaledVector(dir, -goal.pole.dot(dir));
  if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0).addScaledVector(dir, -dir.y);
  pole.normalize();
  const cosA = THREE.MathUtils.clamp(
    (a * a + d * d - b * b) / (2 * a * d),
    -1,
    1,
  );
  const sinA = Math.sqrt(1 - cosA * cosA);
  const elbow = _v[5]
    .copy(S)
    .addScaledVector(dir, cosA * a)
    .addScaledVector(pole, sinA * a);
  swing(
    arm.upper,
    E.clone().sub(S).normalize(),
    elbow.clone().sub(S).normalize(),
    weight,
  );
  const E2 = arm.lower.getWorldPosition(_v[1]).clone();
  const P2 = end().clone();
  const target = S.clone().addScaledVector(dir, d);
  swing(arm.lower, P2.sub(E2).normalize(), target.sub(E2).normalize(), weight);
  if (turned) {
    const parent = arm.hand.parent.getWorldQuaternion(_q[2]);
    const now = arm.hand.getWorldQuaternion(new THREE.Quaternion());
    arm.hand.quaternion.copy(
      parent.invert().multiply(now.slerp(turned, weight)),
    );
    arm.hand.updateMatrixWorld(true);
  } else if (arm.hand && goal.normal) {
    const q = arm.hand.getWorldQuaternion(_q[0]);
    const now = arm.normal.clone().applyQuaternion(q);
    swing(arm.hand, now, goal.normal.clone().normalize(), weight);
  }
}

// The hand's turn in the world that sets its palm facing `goal.normal` and its fingers along
// `goal.fingers`: the rest frame of palm and fingers carried onto the wanted one.
function handTurn(arm, goal) {
  const frame = (n, f) => {
    const fn = f.clone().addScaledVector(n, -f.dot(n)).normalize();
    return new THREE.Matrix4().makeBasis(
      n,
      fn,
      new THREE.Vector3().crossVectors(n, fn),
    );
  };
  const rest = frame(arm.normal.clone().normalize(), arm.fingers);
  const want = frame(goal.normal.clone().normalize(), goal.fingers);
  return new THREE.Quaternion().setFromRotationMatrix(
    want.multiply(rest.transpose()),
  );
}

function set(pose, name, x = 0, y = 0, z = 0) {
  pose[name] = [x, y, z];
}

function add(pose, name, x = 0, y = 0, z = 0) {
  const p = pose[name] || (pose[name] = [0, 0, 0]);
  p[0] += x;
  p[1] += y;
  p[2] += z;
}

// Locomotion blends an idle stance, a walk and a run by speed.
function locomotion(pose, root, hero, dt, { turnRate, accel }) {
  const speed = this.gaitSpeed,
    r = smooth(2.2, 5, speed),
    moving = smooth(0.06, 0.65, speed);
  if (this.articulatedFeet) {
    if (this.distance > 1e-6 && !this.gaitStarted)
      this.phase = Math.PI * mix(0.58, 0.3, r);
    this.gaitStarted = moving > 0.02;
  }
  const before = this.phase;
  this.phase =
    (this.phase +
      (Math.PI * 2 * this.distance) /
        mix(1.4, this.articulatedFeet ? 2.65 : 2.9, r)) %
    (Math.PI * 2);
  if (
    speed > 2.5 &&
    Math.floor(before / Math.PI) !== Math.floor(this.phase / Math.PI)
  )
    this.footfall = (this.footfall || 0) + 1;
  const phi = this.phase,
    s = Math.cos(phi),
    duty = mix(0.55, 0.29, r);
  const leg = (phase) => {
    const p = (phase / (Math.PI * 2) + 1) % 1;
    const stance = p < duty;
    const t = stance ? p / duty : (p - duty) / (1 - duty);
    const thigh = stance
      ? mix(-0.4, 0.42, t)
      : mix(0.42, -0.4, smooth(0, 1, t));
    const knee = stance
      ? 0.08 + 0.2 * Math.sin(t * Math.PI)
      : 0.12 + mix(0.8, 1.45, r) * Math.sin(t * Math.PI) ** 1.3;
    return [thigh * moving, knee * moving];
  };
  const [lt, lk] = leg(phi),
    [rt, rk] = leg(phi + Math.PI);
  set(pose, "leftUpperLeg", lt, 0, 0.02);
  set(pose, "leftLowerLeg", lk);
  set(pose, "rightUpperLeg", rt, 0, -0.02);
  set(pose, "rightLowerLeg", rk);
  const swing = mix(0.26, 0.52, r) * moving;
  for (const [side, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    const armPhase = (phi / (Math.PI * 2) + (sign < 0 ? 0.5 : 0)) % 1;
    const contact = mix(0.58, 0.3, r);
    const cycle = mix(
      sign * Math.cos(phi - 0.12),
      armPhase < contact
        ? mix(1, -1, smooth(0, contact, armPhase))
        : mix(-1, 1, smooth(contact, 1, armPhase)),
      r,
    );
    const forward = Math.max(0, -cycle);
    set(
      pose,
      side + "UpperArm",
      swing * cycle,
      -sign * moving * (0.035 + 0.09 * forward),
      sign * (-0.075 + moving * (0.045 + 0.025 * r)),
    );
    set(
      pose,
      side + "LowerArm",
      -0.14 - moving * mix(0.17, 0.84, r) - moving * 0.16 * forward,
    );
    set(pose, side + "Hand", -0.02 * moving, 0, sign * 0.015 * cycle * moving);
  }
  const lean =
    0.025 +
    0.16 * r * moving +
    THREE.MathUtils.clamp(accel * 0.018, -0.11, 0.13);
  const twist = mix(0.08, 0.17, r) * moving;
  set(pose, "hips", 0, -twist * s, 0.025 * moving * Math.cos(phi));
  set(
    pose,
    "spine",
    lean,
    1.65 * twist * Math.cos(phi - 0.15),
    -0.02 * moving * Math.cos(phi),
  );
  set(
    pose,
    "head",
    -0.6 * lean - 0.035,
    -0.85 * twist * s + THREE.MathUtils.clamp(turnRate * 0.035, -0.12, 0.12),
    0,
  );
  const stepPhase = (phi / (Math.PI * 2)) % 0.5;
  const runHeight = -0.042 - 0.012 * Math.cos(Math.PI * 4 * (stepPhase - 0.14));
  root.bob =
    moving *
    mix(-0.035 - 0.012 * Math.cos(phi * 2 - duty * Math.PI * 2), runHeight, r);
  root.pitch = 0.055 * r * moving;
  root.sway = 0.016 * moving * Math.cos(phi);
  root.roll = THREE.MathUtils.clamp(-turnRate * speed * 0.022, -0.2, 0.2);
  const idle = 1 - moving,
    t = this.time;
  const shift = Math.sin(t * 0.65) * 0.5 + Math.sin(t * 0.31 + 0.7) * 0.5;
  const breathe = Math.sin(t * 1.65) * 0.012;
  root.sway += idle * shift * 0.018;
  add(pose, "hips", 0, 0, -idle * shift * 0.025);
  add(pose, "spine", idle * breathe, 0, idle * shift * 0.018);
  add(pose, "head", -idle * breathe, idle * Math.sin(t * 0.37) * 0.1, 0);
  add(pose, "leftUpperArm", idle * Math.sin(t * 1.1) * 0.016);
  add(pose, "rightUpperArm", idle * Math.sin(t * 1.1 + 0.5) * 0.016, 0, 0);
  const landing = hero.landing || 0;
  if (landing > 0) {
    add(pose, "leftUpperLeg", -0.7 * landing);
    add(pose, "rightUpperLeg", -0.6 * landing);
    add(pose, "leftLowerLeg", 1.25 * landing);
    add(pose, "rightLowerLeg", 1.15 * landing);
    add(pose, "spine", 0.32 * landing);
    add(pose, "head", -0.12 * landing);
    add(pose, "leftUpperArm", -0.35 * landing, 0, 0.25 * landing);
    add(pose, "rightUpperArm", -0.35 * landing, 0, -0.25 * landing);
    root.bob -= 0.2 * landing;
  }
}

// Upper-body layers on top of any state: the disc thrown, caught or carried, and a flinch.
function overlays(pose, root, hero) {
  const t = hero.throwT;
  if (t !== undefined && t < 0.5) {
    // Wind back, whip across, follow through.
    const wind = smooth(0, 0.08, t),
      whip = smooth(0.08, 0.2, t),
      back = smooth(0.25, 0.5, t);
    const armX = mix(mix(0, 0.9, wind), -1.55, whip) * (1 - back);
    const armZ = mix(mix(0, -0.9, wind), -0.2, whip) * (1 - back);
    add(pose, "rightUpperArm", armX, 0, armZ);
    add(pose, "rightLowerArm", mix(-1.2 * wind, -0.15, whip) * (1 - back));
    add(
      pose,
      "spine",
      0.1 * whip * (1 - back),
      mix(0.5 * wind, -0.45, whip) * (1 - back),
    );
  } else if (hero.holding) {
    if (hero.state === "ground" && !hero.swimming) {
      const upper = pose.rightUpperArm,
        lower = pose.rightLowerArm;
      upper[0] = -0.2 + upper[0] * 0.32;
      upper[1] = 0.06;
      upper[2] = -0.025;
      lower[0] = -0.72 + lower[0] * 0.22;
    } else {
      add(pose, "rightUpperArm", -0.35, 0, -0.08);
      add(pose, "rightLowerArm", -0.55);
    }
  }
  const c = hero.catchT;
  if (c !== undefined && c < 0.3) {
    const k = Math.sin((c / 0.3) * Math.PI);
    add(pose, "rightUpperArm", -1.3 * k, 0, -0.2 * k);
  }
  if (hero.stun > 0) {
    const k = Math.min(1, hero.stun / 0.3);
    add(pose, "spine", -0.45 * k);
    add(pose, "head", 0.3 * k);
    add(pose, "leftUpperArm", -0.9 * k, 0, 0.6 * k);
    add(pose, "rightUpperArm", -0.9 * k, 0, -0.6 * k);
    root.pitch -= 0.25 * k;
  }
}

const POSES = {
  ground: locomotion,

  swim(pose, root, hero, dt, { turnRate }) {
    const speed = Math.hypot(hero.swimSpeed || 0, hero.swimVertical || 0),
      moving = smooth(0.1, 2.7, speed);
    this.swimPhase += dt * mix(1.15, 4.2, moving);
    const p = this.swimPhase,
      cycle = (p / (Math.PI * 2)) % 1,
      open = smooth(0, 0.18, cycle),
      pull = smooth(0.18, 0.36, cycle),
      recover = smooth(0.36, 0.56, cycle),
      tuck = smooth(0.24, 0.5, cycle),
      kick = smooth(0.57, 0.78, cycle),
      close = smooth(0.64, 0.82, cycle);
    const reach = mix(mix(-2.88, -1.62, pull), -2.88, recover),
      spread = mix(mix(-0.45, 0.74, open), -0.45, recover),
      elbow = mix(mix(0.15, -1.6, pull), 0.15, recover),
      knee = mix(mix(0.08, 1.75, tuck), 0.08, kick),
      thigh = mix(mix(-0.025, -0.38, tuck), -0.025, kick),
      legSpread = (0.025 + 0.24 * tuck) * (1 - close) + 0.025 * close;
    for (const [side, sign] of [
      ["left", 1],
      ["right", -1],
    ]) {
      const scull = Math.sin(p * 1.6 + sign * 0.35);
      set(
        pose,
        side + "UpperArm",
        mix(-0.42 + scull * 0.08, reach, moving),
        0,
        sign * mix(0.62 + 0.13 * scull, spread, moving),
      );
      set(pose, side + "LowerArm", mix(-0.6, elbow, moving));
      set(
        pose,
        side + "UpperLeg",
        mix(-0.08, thigh, moving),
        sign * moving * 0.14 * tuck * (1 - kick),
        sign * mix(0.055, legSpread, moving),
      );
      set(
        pose,
        side + "LowerLeg",
        mix(0.3 + 0.08 * Math.sin(p + sign), knee, moving),
      );
      set(
        pose,
        side + "Foot",
        mix(0.12, mix(mix(0.3, -0.4, tuck), 0.3, kick), moving),
        sign * moving * 0.32 * tuck * (1 - close),
      );
      set(
        pose,
        side + "Hand",
        moving * (-0.08 + 0.2 * pull * (1 - recover)),
        0,
        sign * moving * 0.07 * open * (1 - recover),
      );
    }
    const effort = pull * (1 - recover);
    set(pose, "spine", 0.025 + 0.035 * effort * moving, 0, 0);
    set(pose, "head", mix(-0.23, -0.6 - 0.15 * effort, moving), 0, 0);
    root.pitch =
      mix(0.25, 1.4 - 0.13 * effort, moving) -
      THREE.MathUtils.clamp((hero.swimVertical || 0) * 0.075, -0.18, 0.18);
    root.roll = THREE.MathUtils.clamp(-turnRate * 0.06, -0.18, 0.18);
    root.bob = mix(0.014 * Math.sin(p * 2), 0.016 * effort, moving);
  },

  // Tucked tight for the tumble; the body's rotation is applied at the root.
  roll(pose) {
    set(pose, "leftUpperLeg", -1.9);
    set(pose, "rightUpperLeg", -1.8);
    set(pose, "leftLowerLeg", 2.2);
    set(pose, "rightLowerLeg", 2.1);
    set(pose, "leftUpperArm", -1.4, 0, 0.3);
    set(pose, "rightUpperArm", -1.4, 0, -0.3);
    set(pose, "leftLowerArm", -1.6);
    set(pose, "rightLowerArm", -1.6);
    set(pose, "spine", 0.9);
    set(pose, "head", 0.5);
  },

  // Rising, tucked at the top, reaching for the ground on the way down.
  air(pose, root, hero) {
    const u = THREE.MathUtils.clamp(hero.vel.y / 7.4, -1.6, 1);
    const up = smooth(0.15, 0.6, u),
      down = smooth(-0.15, -0.7, u),
      top = Math.max(0, 1 - up - down);
    const k = (a, b, c) => a * up + b * top + c * down;
    set(pose, "leftUpperLeg", k(-1.15, -0.85, -0.4), 0, 0.04);
    set(pose, "leftLowerLeg", k(1.45, 1.35, 0.4));
    set(pose, "rightUpperLeg", k(0.35, -0.55, -0.12), 0, -0.04);
    set(pose, "rightLowerLeg", k(0.55, 1.1, 0.3));
    const flail = Math.max(0, -hero.vel.y - 9) * 0.08;
    const w = Math.sin(this.time * 9) * Math.min(0.7, flail);
    set(pose, "leftUpperArm", k(-1.7, -0.9, -1.25) + w, 0, k(0.2, 0.75, 1.05));
    set(
      pose,
      "rightUpperArm",
      k(-0.95, -0.9, -1.25) - w,
      0,
      k(-0.2, -0.75, -1.05),
    );
    set(pose, "leftLowerArm", k(-0.55, -0.4, -0.25));
    set(pose, "rightLowerArm", k(-0.65, -0.4, -0.25));
    set(pose, "spine", k(0.18, 0.28, 0.02));
    set(pose, "head", k(-0.15, -0.2, 0.05));
    root.pitch = k(0.08, 0.12, -0.04);
  },

  // Hanging: arms reach up and forward to the lip, legs dangle, shimmying goes hand over hand.
  hang(pose, root, hero) {
    const sh = hero.shimmy || 0;
    const t = this.time;
    const reach = sh ? Math.sin(t * 8.5) : 0;
    set(
      pose,
      "leftUpperArm",
      -2.72 + 0.14 * reach * sh,
      0,
      -0.14 + 0.1 * Math.max(0, reach) * sh,
    );
    set(
      pose,
      "rightUpperArm",
      -2.72 - 0.14 * reach * sh,
      0,
      0.14 + 0.1 * Math.max(0, -reach) * sh,
    );
    set(pose, "leftLowerArm", -0.12 - 0.3 * Math.max(0, -reach));
    set(pose, "rightLowerArm", -0.12 - 0.3 * Math.max(0, reach));
    set(pose, "spine", -0.08);
    set(pose, "head", -0.32, 0.25 * sh);
    // The legs hang a little back with the knees bent, so the boots keep off the wall as
    // they sway.
    const sway = sh ? Math.sin(t * 8.5) * 0.12 : Math.sin(t * 1.3) * 0.04;
    set(pose, "leftUpperLeg", 0.16 + sway, 0, 0.05);
    set(pose, "rightUpperLeg", 0.1 - sway, 0, -0.05);
    set(pose, "leftLowerLeg", 0.5 + Math.max(0, sway));
    set(pose, "rightLowerLeg", 0.4 + Math.max(0, -sway));
    root.roll = sh * 0.05 * reach;
  },

  // The mantle: pull with bent arms, press down with a knee on the lip, then stand.
  climb(pose, root, hero) {
    const t = Math.min(1, hero.t);
    const a = smooth(0, 0.4, t),
      b = smooth(0.38, 0.7, t),
      c = smooth(0.68, 1, t);
    const armX = mix(mix(-2.72, -1.25, a), 0.3, b) * (1 - c);
    const elbow = mix(mix(-0.12, -1.9, a), -0.2, b) * (1 - c);
    set(pose, "leftUpperArm", armX, 0, 0.12);
    set(pose, "rightUpperArm", armX, 0, -0.12);
    set(pose, "leftLowerArm", elbow);
    set(pose, "rightLowerArm", elbow);
    set(pose, "spine", mix(mix(-0.05, 0.35, a), 0.75, b) * (1 - c) + 0.06 * c);
    set(pose, "head", mix(-0.35, 0.1, a) * (1 - c));
    set(pose, "leftUpperLeg", mix(mix(0, -0.45, a), -1.6, b) * (1 - c));
    set(
      pose,
      "leftLowerLeg",
      mix(mix(0.3, 0.7, a), 2.1, b) * (1 - c) + 0.08 * c,
    );
    set(pose, "rightUpperLeg", mix(mix(0, 0.1, a), 0.35, b) * (1 - c));
    set(
      pose,
      "rightLowerLeg",
      mix(mix(0.25, 0.4, a), 0.9, b) * (1 - c) + 0.08 * c,
    );
    root.bob = -0.08 * b * (1 - c);
  },

  // A quick hop onto a low ledge: hands plant, knees tuck through.
  vault(pose, root, hero) {
    const t = Math.min(1, hero.t);
    const plant = smooth(0, 0.35, t),
      tuck = Math.sin(Math.PI * smooth(0.1, 0.9, t)),
      rise = smooth(0.7, 1, t);
    const arm = mix(-1.2, 0.25, plant) * (1 - rise);
    set(pose, "leftUpperArm", arm, 0, 0.15);
    set(pose, "rightUpperArm", arm, 0, -0.15);
    set(pose, "leftLowerArm", -0.3 * (1 - rise));
    set(pose, "rightLowerArm", -0.3 * (1 - rise));
    set(pose, "leftUpperLeg", -1.35 * tuck);
    set(pose, "rightUpperLeg", -1.1 * tuck);
    set(pose, "leftLowerLeg", 1.7 * tuck);
    set(pose, "rightLowerLeg", 1.5 * tuck);
    set(pose, "spine", 0.55 * tuck);
    set(pose, "head", -0.2 * tuck);
  },

  // Braced against a block, ready to push or pull; straining when it will not move.
  grab(pose, root, hero) {
    brace(pose, root, hero, 0, this.time);
    const strain = hero.t - (hero.strainAt ?? -9);
    if (strain < 0.6) {
      const k = Math.sin((strain / 0.6) * Math.PI);
      add(pose, "spine", 0.12 * k + Math.sin(this.time * 38) * 0.03 * k);
      add(pose, "leftUpperLeg", -0.25 * k);
      add(pose, "rightUpperLeg", 0.2 * k);
      root.bob -= 0.05 * k;
    }
  },

  // Driving the block: legs step in time with its slide, the body leans into the work.
  shove(pose, root, hero) {
    brace(pose, root, hero, Math.min(1, hero.t), this.time);
  },

  // Hands on the mirror's handles, the body twisting with the turn.
  turn(pose, root, hero) {
    const spin = hero.turning || 0;
    const t = this.time;
    set(pose, "leftUpperArm", -1.05, 0, 0.18);
    set(pose, "rightUpperArm", -1.05, 0, -0.18);
    set(pose, "leftLowerArm", -1.0 + 0.25 * spin);
    set(pose, "rightLowerArm", -1.0 - 0.25 * spin);
    set(pose, "spine", 0.28, -0.3 * spin, 0);
    set(pose, "head", -0.1, 0.35 * spin, 0);
    const step = Math.abs(spin) > 0.2 ? Math.sin(t * 6) * 0.25 : 0;
    set(pose, "leftUpperLeg", -0.35 + step, 0, 0.08);
    set(pose, "rightUpperLeg", 0.3 - step, 0, -0.08);
    set(pose, "leftLowerLeg", 0.45 + Math.max(0, step));
    set(pose, "rightLowerLeg", 0.2 + Math.max(0, -step));
    root.bob = -0.06;
  },
};

function brace(pose, root, hero, progress, time) {
  const pulling = hero.state === "shove" && hero.pulling;
  const moving = hero.state === "shove";
  const p = moving ? progress * Math.PI * 4 : 0;
  const s = Math.sin(p);
  set(pose, "leftUpperArm", pulling ? -1.25 : -1.45, 0, 0.05);
  set(pose, "rightUpperArm", pulling ? -1.25 : -1.45, 0, -0.05);
  set(pose, "leftLowerArm", pulling ? -0.1 : -0.5);
  set(pose, "rightLowerArm", pulling ? -0.1 : -0.5);
  set(pose, "spine", pulling ? -0.25 : 0.3 + 0.05 * Math.sin(time * 3));
  set(pose, "head", pulling ? 0.1 : -0.3);
  const base = pulling ? [0.35, -0.3] : [-0.6, 0.45];
  set(pose, "leftUpperLeg", base[0] + 0.45 * s, 0, 0.05);
  set(pose, "rightUpperLeg", base[1] - 0.45 * s, 0, -0.05);
  set(pose, "leftLowerLeg", 0.45 + 0.5 * Math.max(0, s));
  set(pose, "rightLowerLeg", 0.3 + 0.5 * Math.max(0, -s));
  root.bob = -0.12 + (moving ? 0.03 * Math.abs(s) : 0);
  root.pitch = pulling ? -0.06 : 0.08;
}

// A stand-in with the same joints, used until the generated explorer is available.
export function placeholderHero() {
  const g = new THREE.Group();
  const mat = (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const indigo = mat(0x2d3656),
    canvas = mat(0xcdbf9f),
    leather = mat(0x4b2e1e),
    scarf = mat(0xc2412d),
    skin = mat(0x9c6b4e);
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
  const hips = joint(g, 0, 0.95, 0);
  part(hips, new THREE.BoxGeometry(0.36, 0.2, 0.22), canvas, 0, -0.02, 0);
  const spine = joint(hips, 0, 0.1, 0);
  part(spine, new THREE.BoxGeometry(0.42, 0.44, 0.26), indigo, 0, 0.22, 0);
  const head = joint(spine, 0, 0.47, 0);
  part(head, new THREE.SphereGeometry(0.13, 12, 10), skin, 0, 0.12, 0);
  part(
    head,
    new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12),
    scarf,
    0,
    0.05,
    0,
  );
  const scarfTail = joint(spine, -0.08, 0.44, -0.12);
  part(scarfTail, new THREE.BoxGeometry(0.1, 0.4, 0.03), scarf, 0, -0.2, 0);
  const limb = (side, isArm) => {
    const x = side * (isArm ? 0.25 : 0.1);
    const upper = joint(isArm ? spine : hips, x, isArm ? 0.4 : -0.03, 0);
    const len = isArm ? 0.3 : 0.44;
    part(
      upper,
      new THREE.BoxGeometry(0.11, len, 0.12),
      isArm ? indigo : canvas,
      0,
      -len / 2,
      0,
    );
    const lower = joint(upper, 0, -len, 0);
    part(
      lower,
      new THREE.BoxGeometry(0.1, len, 0.11),
      isArm ? leather : canvas,
      0,
      -len / 2,
      0,
    );
    if (!isArm)
      part(
        lower,
        new THREE.BoxGeometry(0.12, 0.08, 0.24),
        leather,
        0,
        -len - 0.02,
        0.05,
      );
    return [upper, lower];
  };
  const [leftUpperArm, leftLowerArm] = limb(1, true);
  const [rightUpperArm, rightLowerArm] = limb(-1, true);
  const [leftUpperLeg, leftLowerLeg] = limb(1, false);
  const [rightUpperLeg, rightLowerLeg] = limb(-1, false);
  g.userData.joints = {
    hips,
    spine,
    head,
    leftUpperArm,
    leftLowerArm,
    rightUpperArm,
    rightLowerArm,
    leftUpperLeg,
    leftLowerLeg,
    rightUpperLeg,
    rightLowerLeg,
    scarfTail,
  };
  g.userData.grip = { hands: 2.05 };
  return g;
}
