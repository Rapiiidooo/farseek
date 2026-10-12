import * as THREE from "three";
import { Spring } from "./spring.js";
import { solveArm } from "./ik.js";
import { smooth, mix, wrap, GAIT } from "./math.js";

// Half the distance between the feet when she stands at ease.
const STANCE = 0.16;

function nudge(point, dx, dz) {
  if (!point) return;
  point.x += dx;
  point.z += dz;
}

export const feet = {
  // Planted and travelling soles keep their place on a support that moves or glides.
  carryFeet(dx, dz) {
    if (!dx && !dz) return;
    for (const leg of this.legs) {
      nudge(leg.goal, dx, dz);
      nudge(leg.plant, dx, dz);
      nudge(leg.swingStart, dx, dz);
      nudge(leg.swingEnd, dx, dz);
      nudge(leg.solePosition, dx, dz);
      nudge(leg.settle?.from, dx, dz);
      nudge(leg.settle?.to, dx, dz);
    }
  },

  prepareRollSupports() {
    const supports = [];
    const point = new THREE.Vector3();
    const directions = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++)
          if (x || y || z) directions.push(new THREE.Vector3(x, y, z));
    this.model.updateMatrixWorld(true);
    this.model.traverse((mesh) => {
      if (!mesh.isMesh || mesh.userData.noShadow || /hair/i.test(mesh.name))
        return;
      const positions = mesh.geometry.attributes.position;
      if (!positions) return;
      const weights = mesh.geometry.attributes.skinWeight;
      const indices = mesh.geometry.attributes.skinIndex;
      const groups = new Map();
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        let bone = 0;
        if (weights && indices) {
          let component = 0;
          for (let k = 1; k < 4; k++)
            if (weights.getComponent(i, k) > weights.getComponent(i, component))
              component = k;
          bone = indices.getComponent(i, component);
        }
        if (!groups.has(bone))
          groups.set(
            bone,
            directions.map(() => ({ value: -Infinity, index: 0 })),
          );
        const extrema = groups.get(bone);
        for (let d = 0; d < directions.length; d++) {
          const value = point.dot(directions[d]);
          if (value > extrema[d].value) extrema[d] = { value, index: i };
        }
      }
      supports.push({
        mesh,
        indices: [
          ...new Set(
            [...groups.values()].flatMap((points) =>
              points.map((p) => p.index),
            ),
          ),
        ],
      });
    });
    return supports;
  },

  groundRoll(hero) {
    if (hero.state !== "roll") return;
    this.model.updateMatrixWorld(true);
    let low = Infinity;
    for (const { mesh, indices } of this.rollSupports) {
      let visible = true;
      for (let node = mesh; node && node !== this.model; node = node.parent)
        if (!node.visible) {
          visible = false;
          break;
        }
      if (!visible) continue;
      for (const index of indices) {
        mesh
          .getVertexPosition(index, this.rollPoint)
          .applyMatrix4(mesh.matrixWorld);
        if (this.rollPoint.y < low) {
          low = this.rollPoint.y;
          this.rollContact.copy(this.rollPoint);
        }
      }
    }
    if (Number.isFinite(low)) {
      const floor = this.sampleGround(
        this.rollContact.x,
        this.rollContact.z,
        hero.feet + hero.stepLift + this.lift,
      ).height;
      this.model.position.y += floor + 0.006 - low;
    }
    this.model.updateMatrixWorld(true);
  },

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
  },

  groundFeet(hero) {
    if (hero.state !== "ground" || hero.swimming) {
      this.stepBodyY = null;
      this.highStepT = 0;
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
  },

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
  },

  groundArticulatedFeet(hero) {
    const speed = this.gaitSpeed,
      run = smooth(2.2, 5, speed),
      moving = smooth(0.06, 0.65, speed);
    const duty = mix(0.58, this.runContact, run),
      stride = mix(1.4, this.runStride, run);
    this.stillFor =
      moving < 0.06 && !this.gliding ? (this.stillFor || 0) + this.frameDt : 0;
    const yaw = this.root.yaw.v,
      forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const armed = hero.equipment === "pistols" && hero.weaponActive;
    const travelHeading = armed ? this.travelDirection : forward;
    const alignment = travelHeading.dot(forward);
    const sideStep = armed ? Math.abs(travelHeading.dot(right)) : 0;
    const slide = this.slide || 0;
    const first = this.legs[0],
      second = this.legs[1];
    if (slide < 0.02 && first.goal && second.goal)
      this.slideLead =
        (first.goal.x - second.goal.x) * forward.x +
          (first.goal.z - second.goal.z) * forward.z >=
        0
          ? 0
          : 1;
    const floor = hero.feet + hero.stepLift + this.lift;
    this.stepClearanceT =
      hero.stepLift < -0.06
        ? 0.3
        : Math.max(0, (this.stepClearanceT || 0) - this.frameDt);
    this.highStepT =
      hero.stepLift < -0.25
        ? 0.3
        : Math.max(0, (this.highStepT || 0) - this.frameDt);
    this.lastGroundHeight = floor;
    if (this.legs.every((leg) => !leg.goal)) this.stepBodyY = null;
    if (
      this.highStepT > 0 &&
      this.stepBodyY !== null &&
      this.stepBodyY !== undefined
    )
      this.model.position.y = Math.max(
        this.model.position.y,
        this.stepBodyY - this.frameDt * 0.5,
      );
    if (moving > 0.06) {
      const span = 0.45 + Math.min(0.25, speed * 0.05);
      for (let ahead = 1; ahead <= 4; ahead++) {
        const distance = (span * ahead) / 4;
        const terrain = this.groundAt?.(
          hero.pos.x + travelHeading.x * distance,
          hero.pos.z + travelHeading.z * distance,
          hero.feet + this.lift,
          0.192,
        );
        if (!Number.isFinite(terrain?.height)) continue;
        if (
          terrain.height > hero.feet + this.lift + 0.2 &&
          (terrain.normal?.y ?? 1) > 0.96
        ) {
          let near = (span * (ahead - 1)) / 4,
            far = distance;
          for (let probe = 0; probe < 5; probe++) {
            const middle = (near + far) * 0.5;
            const step = this.groundAt?.(
              hero.pos.x + travelHeading.x * middle,
              hero.pos.z + travelHeading.z * middle,
              hero.feet + this.lift,
              0.192,
            );
            if (step?.height > hero.feet + this.lift + 0.2) far = middle;
            else near = middle;
          }
          this.model.position.y = Math.max(
            this.model.position.y,
            mix(
              hero.feet + this.lift,
              terrain.height,
              1 - smooth(0, span, far),
            ),
          );
          this.stepClearanceT = 0.3;
          this.highStepT = 0.3;
          break;
        }
      }
    }
    if (this.highStepT > 0)
      this.model.position.y = Math.max(
        this.model.position.y,
        hero.feet + this.lift,
      );
    const turn = smooth(1, 5, Math.abs(this.motionTurn));
    this.model.updateMatrixWorld(true);
    const targets = [];
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i],
        phase = (this.phase / (Math.PI * 2) + i * 0.5) % 1;
      const settling = moving < 0.06 || this.gliding;
      if (phase >= duty || settling) leg.recovering = false;
      let stance = settling || (phase < duty && !leg.recovering);
      const reach =
        mix(Math.min(0.39, stride * duty * 0.5), 0.25, run) * moving;
      const side = i ? -1 : 1;
      // At rest she stands on an easy base, the feet about shoulder width apart and the left a
      // little ahead; a glide on ice stands wider and staggered, the leading foot where it was.
      const stand = (1 - moving) * (1 - slide);
      const resting = new THREE.Vector3(
        hero.pos.x + hero.snap.x,
        floor,
        hero.pos.z + hero.snap.z,
      )
        .addScaledVector(
          right,
          mix(
            mix(side * STANCE, side * GAIT.track, moving),
            side * 0.23,
            slide,
          ),
        )
        .addScaledVector(
          forward,
          leg.offset.z +
            0.025 * side * stand +
            slide * (i === this.slideLead ? 0.12 : -0.08),
        );
      if (!leg.goal) {
        leg.goal = resting.clone();
        leg.plant = resting.clone();
        leg.stance = true;
        leg.recovering = false;
        leg.settle = null;
        leg.plantYaw = yaw;
      }
      let pitch = 0;
      leg.skating = this.gliding && leg.stance && !leg.settle;
      if (leg.skating) {
        // A sole on ice slides into the glide stance instead of stepping there.
        const follow = 1 - Math.exp(-this.frameDt * 6);
        leg.plant.x += (resting.x - leg.plant.x) * follow;
        leg.plant.z += (resting.z - leg.plant.z) * follow;
        leg.goal.copy(leg.plant);
        leg.plantYaw +=
          wrap(yaw - leg.plantYaw) * (1 - Math.exp(-this.frameDt * 4));
        leg.swingStart = null;
      } else if (settling) {
        // Once she has stood still a moment, a foot short of the easy base steps out to it.
        const displaced =
          Math.hypot(leg.goal.x - resting.x, leg.goal.z - resting.z) >
          (this.stillFor > 0.6 ? 0.05 : 0.13);
        if (
          !leg.settle &&
          (!leg.stance ||
            (displaced &&
              !this.legs.some((other) => other !== leg && other.settle)))
        )
          leg.settle = {
            from: leg.solePosition?.clone() || leg.goal.clone(),
            to: resting.clone(),
            t: 0,
          };
        if (leg.settle) {
          if (slide > 0.01) leg.settle.to.copy(resting);
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
            resting.clone().addScaledVector(travelHeading, reach);
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
        leg.settle = null;
        if (!leg.swingStart) {
          leg.swingStart = leg.solePosition?.clone() || leg.goal.clone();
          leg.swingBend = leg.bend || 0.45;
          leg.swingPhase = phase;
          leg.swingEnd = resting
            .clone()
            .addScaledVector(travelHeading, reach + stride * (1 - phase));
        }
        const t = (phase - leg.swingPhase) / (1 - leg.swingPhase);
        leg.swingEnd.lerp(
          resting
            .clone()
            .addScaledVector(travelHeading, reach + stride * (1 - phase)),
          1 -
            Math.exp(
              -this.frameDt *
                (Math.abs(this.motionTurn) * 4 +
                  (armed ? this.travelTurn * 4 : 0) +
                  Math.abs(this.motionAccel) * 2),
            ),
        );
        const recovery = smooth(0, 1, t);
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
          mix(recovery, mix(travel, recovery ** 0.8, this.runForward), run),
        );
        const heelReturn = smooth(0, 0.42, t) * (1 - smooth(0.42, 1, t));
        leg.goal.y =
          floor +
          mix(
            Math.sin(Math.PI * t) ** 1.3 * 0.09,
            heelReturn * mix(0.18, 0.3, this.runForward),
            run,
          ) +
          (leg.swingStart.y - floor) * (1 - smooth(0, 0.3, t));
        pitch = mix(
          mix(0.4, -0.18, smooth(0, 1, t)),
          mix(0.65, -0.1, smooth(0.08, 0.68, t)),
          run,
        );
        leg.plantYaw +=
          wrap(yaw - leg.plantYaw) * (1 - Math.exp(-this.frameDt * 12));
      }
      if (turn > 0.01 && moving > 0.05) {
        const progress = stance
          ? reach - stride * phase
          : mix(-reach, reach, smooth(0, 1, (phase - duty) / (1 - duty)));
        const pivot = resting
          .clone()
          .addScaledVector(
            travelHeading,
            THREE.MathUtils.clamp(progress, -0.34, 0.34),
          );
        pivot.y = leg.goal.y;
        leg.goal.lerp(pivot, turn);
        if (stance) leg.plant.copy(leg.goal);
      }
      const across = leg.goal.clone().sub(this.model.position).dot(right),
        width = mix(0.095, GAIT.track - 0.006, moving) + 0.045 * turn;
      if (side * across < width && sideStep < 0.2) {
        leg.goal.addScaledVector(right, side * width - across);
        if (stance) leg.plant.copy(leg.goal);
      }
      if (turn > 0.05)
        leg.plantYaw +=
          wrap(yaw - leg.plantYaw) * (1 - Math.exp(-this.frameDt * 8 * turn));
      const sample = this.sampleGround(leg.goal.x, leg.goal.z, floor);
      const toeOut = leg.plantYaw + side * (0.1 * slide + 0.1 * stand);
      const heading = new THREE.Vector3(Math.sin(toeOut), 0, Math.cos(toeOut));
      heading
        .addScaledVector(sample.normal, -heading.dot(sample.normal))
        .normalize();
      const acrossSurface = new THREE.Vector3()
        .crossVectors(sample.normal, heading)
        .normalize();
      const base = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(acrossSurface, sample.normal, heading),
      );
      const footPitch = leg.footPitch.step(
        armed ? pitch * alignment : pitch,
        this.frameDt,
        10,
        0.95,
      );
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
          mode: leg.skating ? "slide" : turn > 0.25 ? "pivot" : "plant",
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
              mix(1.7, 1.95, this.runForward),
              Math.sin(
                Math.min(1, t / mix(0.4, 0.34, this.runForward)) *
                  Math.PI *
                  0.5,
              ),
            ),
            mix(0.48, 0.4, this.runForward),
            smooth(mix(0.4, 0.34, this.runForward), 1, t),
          );
          const sole = leg.palm.clone().applyQuaternion(rotation);
          const planar =
            (at.x - sole.x - hip.x) ** 2 + (at.z - sole.z - hip.z) ** 2;
          const distance = a * a + b * b + 2 * a * b * Math.cos(bend);
          const height =
            hip.y - Math.sqrt(Math.max(0.04, distance - planar)) + sole.y;
          const recovery = this.runForward;
          at.y = mix(at.y, height, run * recovery);
        }
        const soleY = leg.palm.clone().applyQuaternion(rotation).y;
        const low = Math.min(
          ...leg.samples.map(
            (point) => point.clone().applyQuaternion(rotation).y - soleY,
          ),
        );
        at.y = Math.max(at.y, sample.height - low + 0.004);
        if (leg.swingEnd && leg.swingStart) {
          const direction = leg.swingEnd.clone().sub(leg.swingStart);
          direction.y = 0;
          direction.normalize();
          const remaining = Math.max(
            0,
            leg.swingEnd.clone().sub(at).dot(direction),
          );
          const anticipation = smooth(
            0,
            0.12,
            (phase - leg.swingPhase) / (1 - leg.swingPhase),
          );
          let lead = 0;
          for (const local of leg.samples) {
            const offset = local
              .clone()
              .sub(leg.palm)
              .applyQuaternion(rotation);
            lead = Math.max(lead, offset.dot(direction));
          }
          for (let ahead = 1; ahead <= 4; ahead++) {
            const distance = Math.min(ahead * 0.14, remaining);
            const terrain = this.groundAt?.(
              at.x + direction.x * (lead + distance),
              at.z + direction.z * (lead + distance),
              sample.height,
            );
            if (
              terrain?.height > sample.height + 0.12 &&
              (terrain.normal?.y ?? 1) > 0.96
            ) {
              let near = Math.min((ahead - 1) * 0.14, remaining),
                far = distance;
              for (let probe = 0; probe < 5; probe++) {
                const middle = (near + far) * 0.5;
                const step = this.groundAt?.(
                  at.x + direction.x * (lead + middle),
                  at.z + direction.z * (lead + middle),
                  sample.height,
                );
                if (step?.height > sample.height + 0.12) far = middle;
                else near = middle;
              }
              at.y = Math.max(
                at.y,
                mix(
                  sample.height,
                  terrain.height,
                  anticipation * (1 - smooth(0, 0.56, far)),
                ) -
                  low +
                  0.004,
              );
              break;
            }
          }
        }
      }
      let clearance = 0,
        support = null;
      for (const local of leg.samples) {
        const position = local
          .clone()
          .sub(leg.palm)
          .applyQuaternion(rotation)
          .add(at);
        const terrain = this.groundAt?.(position.x, position.z, floor);
        if (!Number.isFinite(terrain?.height)) continue;
        const overlap = terrain.height - position.y;
        if (overlap > clearance) {
          clearance = overlap;
          support = { local, position, normal: terrain.normal };
        }
      }
      if (clearance > 0.001) {
        at.y += clearance + 0.001;
        if (contact) {
          contact.local.copy(support.local);
          contact.at.copy(support.position);
          contact.at.y += clearance + 0.001;
          contact.normal.copy(support.normal || sample.normal);
        }
      }
      leg.stance = stance;
      leg.contact = contact;
      targets.push({
        leg,
        at,
        rotation,
        pole: forward
          .clone()
          .addScaledVector(right, side * (0.025 + 0.08 * turn + 0.12 * slide)),
      });
    }
    let drop = 0;
    for (const target of targets) {
      const { leg, at, rotation } = target;
      const hip = leg.upper.getWorldPosition(new THREE.Vector3()),
        knee = leg.lower.getWorldPosition(new THREE.Vector3()),
        ankle = leg.foot.getWorldPosition(new THREE.Vector3());
      const length =
        hip.distanceTo(knee) + knee.distanceTo(ankle) - mix(0.012, 0.009, run);
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
    const correction = Math.min(
      this.highStepT > 0 ? 0.04 : 0.18,
      Math.max(0, drop),
    );
    const eased = this.pelvisDrop.step(correction, this.frameDt, 7, 0.95);
    if (armed && alignment < 0.95 && correction > eased) {
      this.pelvisDrop.v = correction;
      this.pelvisDrop.dv = 0;
    }
    this.joints.hips.position.y -= Math.max(correction, eased);
    this.model.updateMatrixWorld(true);
    const solve = () => {
      for (const { leg, at, rotation, pole } of targets) {
        const phase =
          (this.phase / (Math.PI * 2) + (leg.side === "right" ? 0.5 : 0)) % 1;
        const swingPhase = leg.swingPhase ?? duty;
        leg.upper.rotation.copy(this.rest[leg.side + "UpperLeg"].rot);
        leg.lower.rotation.copy(this.rest[leg.side + "LowerLeg"].rot);
        leg.foot.rotation.copy(this.rest[leg.side + "Foot"].rot);
        leg.upper.updateMatrixWorld(true);
        if (leg.stance || this.stepClearanceT > 0) {
          const hip = leg.upper.getWorldPosition(new THREE.Vector3()),
            knee = leg.lower.getWorldPosition(new THREE.Vector3()),
            ankle = leg.foot.getWorldPosition(new THREE.Vector3());
          const length = hip.distanceTo(knee) + knee.distanceTo(ankle) - 0.003;
          const sole = leg.palm.clone().applyQuaternion(rotation);
          const destination = at.clone().sub(sole);
          if (destination.distanceTo(hip) > length) {
            const dx = destination.x - hip.x,
              dz = destination.z - hip.z;
            const planar = Math.hypot(dx, dz);
            if (planar > length * 0.9) {
              destination.x = hip.x + (dx * length * 0.9) / planar;
              destination.z = hip.z + (dz * length * 0.9) / planar;
            }
            destination.y = Math.max(
              destination.y,
              hip.y -
                Math.sqrt(
                  Math.max(
                    0,
                    length * length -
                      (destination.x - hip.x) ** 2 -
                      (destination.z - hip.z) ** 2,
                  ),
                ),
            );
            at.copy(destination).add(sole);
            if (leg.stance) {
              leg.swingStart = null;
              leg.swingEnd = null;
              leg.goal.copy(at);
              leg.recovering = true;
            }
            leg.stance = false;
            leg.contact = null;
          }
        }
        solveArm(
          leg,
          {
            at,
            pole,
            normal: new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
            fingers: new THREE.Vector3(0, 0, 1).applyQuaternion(rotation),
            minimumBend: leg.stance
              ? 0
              : Math.max(
                  this.highStepT > 0 ? 0.4 : 0,
                  mix(
                    leg.swingBend || 0,
                    0.48 * run,
                    smooth(0, 0.35, (phase - swingPhase) / (1 - swingPhase)),
                  ),
                ),
          },
          1,
        );
        leg.solePosition = leg.foot.localToWorld(leg.palm.clone());
        const hipPosition = leg.upper.getWorldPosition(new THREE.Vector3()),
          kneePosition = leg.lower.getWorldPosition(new THREE.Vector3()),
          anklePosition = leg.foot.getWorldPosition(new THREE.Vector3());
        leg.bend =
          Math.PI -
          hipPosition
            .sub(kneePosition)
            .angleTo(anklePosition.sub(kneePosition));
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
    };
    solve();
    if (this.stepClearanceT > 0)
      for (let pass = 0; pass < 3; pass++) {
        const clearance = this.lowerBodyClearance(hero);
        if (clearance <= 0.005) break;
        this.model.position.y += clearance + 0.003;
        this.model.updateMatrixWorld(true);
        solve();
      }
    this.stepBodyY = this.model.position.y;
  },

  lowerBodyClearance(hero) {
    let clearance = 0;
    const point = this.rollPoint;
    for (const { mesh, indices } of this.rollSupports) {
      let visible = true;
      for (let node = mesh; node && node !== this.model; node = node.parent)
        if (!node.visible) {
          visible = false;
          break;
        }
      if (!visible) continue;
      for (const index of indices) {
        mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
        if (point.y > hero.feet + this.lift + 0.65) continue;
        const terrain = this.groundAt?.(
          point.x,
          point.z,
          hero.feet + this.lift,
        );
        if (Number.isFinite(terrain?.height))
          clearance = Math.max(clearance, terrain.height - point.y);
      }
    }
    return clearance;
  },
};
