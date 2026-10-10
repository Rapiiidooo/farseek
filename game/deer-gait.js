import * as THREE from "three";

const names = ["frontLeft", "frontRight", "backLeft", "backRight"],
  offsets = [0.25, 0.75, 0, 0.5],
  lateral = new THREE.Vector3(1, 0, 0),
  smooth = THREE.MathUtils.smoothstep,
  clamp = THREE.MathUtils.clamp;

export class DeerGait {
  constructor(deer, ground, settings = {}) {
    this.deer = deer;
    this.ground = ground;
    this.settings = {
      stride: 1.04,
      lift: 0.09,
      dip: 0.085,
      duty: 0.7,
      ...settings,
    };
    this.weight = this.phase = 0;
    this.active = false;
    this.scratch = Object.fromEntries(
      [
        "point",
        "hip",
        "direction",
        "pole",
        "knee",
        "local",
        "target",
        "forward",
        "normal",
        "right",
        "tangent",
        "scale",
      ].map((k) => [k, new THREE.Vector3()]),
    );
    this.orientation = new THREE.Quaternion();
    this.toeRotation = new THREE.Quaternion();
    this.footOrientation = new THREE.Quaternion();
    this.parentRotation = new THREE.Quaternion();
    this.basis = new THREE.Matrix4();
    this.inverse = new THREE.Matrix4();
    deer.o.updateMatrixWorld(true);
    this.legs = names.map((name, index) => {
      const group = deer.parts[name],
        meshes = group.children.filter((m) => m.isMesh),
        hoof = meshes.reduce((lowest, mesh) => {
          mesh.geometry.computeBoundingBox();
          return !lowest ||
            mesh.geometry.boundingBox.min.y < lowest.geometry.boundingBox.min.y
            ? mesh
            : lowest;
        }, null);
      const box = hoof.geometry.boundingBox,
        sole = new THREE.Vector3(0, box.min.y, (box.min.z + box.max.z) / 2),
        front = name.startsWith("front"),
        kneePosition = new THREE.Vector3(
          0,
          front ? -0.54 : -0.56,
          front ? -0.008 : -0.08,
        ),
        anklePosition = new THREE.Vector3(0, sole.y + 0.065, sole.z),
        upper = new THREE.Group(),
        lower = new THREE.Group(),
        ankle = new THREE.Group();
      upper.name = name + "-upper-pose";
      lower.name = name + "-knee-pose";
      ankle.name = name + "-ankle-pose";
      group.add(upper);
      upper.add(lower);
      lower.position.copy(kneePosition);
      lower.add(ankle);
      ankle.position.copy(anklePosition).sub(kneePosition);
      const rest = deer.o.worldToLocal(group.localToWorld(sole.clone())),
        nodes = [upper, lower, ankle],
        bind = [
          new THREE.Matrix4(),
          new THREE.Matrix4()
            .makeTranslation(...kneePosition.toArray())
            .invert(),
          new THREE.Matrix4()
            .makeTranslation(...anklePosition.toArray())
            .invert(),
        ],
        buffers = meshes.map((mesh) => {
          const geometry = mesh.geometry.clone(),
            positions = geometry.attributes.position,
            normals = geometry.attributes.normal,
            originalPosition = positions.array.slice(),
            originalNormal = normals.array.slice(),
            weights = new Float32Array(positions.count * 3);
          for (let i = 0; i < positions.count; i++) {
            const y = positions.getY(i),
              high = smooth(y, kneePosition.y - 0.045, kneePosition.y + 0.045),
              low =
                1 - smooth(y, anklePosition.y - 0.02, anklePosition.y + 0.055);
            weights[i * 3] = high;
            weights[i * 3 + 1] = 1 - high - low;
            weights[i * 3 + 2] = low;
          }
          positions.setUsage(THREE.DynamicDrawUsage);
          normals.setUsage(THREE.DynamicDrawUsage);
          mesh.geometry = geometry;
          return {
            mesh,
            positions,
            normals,
            originalPosition,
            originalNormal,
            weights,
          };
        });
      return {
        name,
        index,
        group,
        upper,
        lower,
        ankle,
        nodes,
        bind,
        buffers,
        sole: sole.clone().sub(anklePosition),
        rest,
        first: kneePosition.clone().normalize(),
        second: anklePosition.clone().sub(kneePosition).normalize(),
        length1: kneePosition.length(),
        length2: anklePosition.clone().sub(kneePosition).length(),
        matrices: nodes.map(() => new THREE.Matrix4()),
        initialized: false,
        planted: false,
        early: false,
        earlyAt: 0,
        lastPhase: 0,
        anchor: new THREE.Vector3(),
        release: new THREE.Vector3(),
        desired: new THREE.Vector3(),
        soleWorld: new THREE.Vector3(),
        lift: 0,
      };
    });
  }

  reset() {
    this.weight = this.phase = 0;
    for (const leg of this.legs) {
      leg.initialized = leg.planted = false;
      leg.early = false;
      leg.nodes.forEach((n) => n.quaternion.identity());
      for (const b of leg.buffers) {
        b.positions.array.set(b.originalPosition);
        b.normals.array.set(b.originalNormal);
        b.positions.needsUpdate = b.normals.needsUpdate = true;
        b.mesh.geometry.computeBoundingBox();
        b.mesh.geometry.computeBoundingSphere();
      }
    }
    this.active = false;
  }

  point(leg, distance, target) {
    const { o, yaw } = this.deer,
      rest = leg.rest,
      x = rest.x,
      z = rest.z + distance;
    target.set(
      o.position.x + x * Math.cos(yaw) + z * Math.sin(yaw),
      0,
      o.position.z - x * Math.sin(yaw) + z * Math.cos(yaw),
    );
    const height = this.ground(target.x, target.z);
    target.y = Number.isFinite(height) ? height : o.position.y;
    return target;
  }

  update(dt, distance, walking) {
    const wanted = walking ? 1 : 0,
      { stride, lift, dip, duty } = this.settings;
    this.weight += (wanted - this.weight) * (1 - Math.exp(-dt * 14));
    this.phase += distance / stride;
    const deer = this.deer;
    deer.o.position.y =
      this.ground(deer.pos.x, deer.pos.z) -
      dip * this.weight +
      Math.cos(this.phase * Math.PI * 4) * 0.006 * this.weight;
    if (this.weight < 0.001) {
      if (this.active) this.reset();
      return;
    }
    this.active = true;
    for (const leg of this.legs) {
      const phase = (((this.phase + offsets[leg.index]) % 1) + 1) % 1,
        stroke = stride * duty,
        ahead = this.point(leg, stroke / 2, this.scratch.point);
      if (phase < leg.lastPhase || !leg.initialized) leg.early = false;
      if (leg.initialized && leg.planted && phase < duty) {
        leg.group.getWorldPosition(this.scratch.hip);
        this.scratch.target.copy(leg.anchor);
        this.scratch.target.y -= leg.sole.y;
        if (
          this.scratch.target.distanceTo(this.scratch.hip) >
          leg.length1 + leg.length2 - 0.003
        ) {
          leg.early = true;
          leg.earlyAt = phase;
        }
      }
      const planted = phase < duty && !leg.early;
      if (!leg.initialized) {
        this.point(leg, stroke * (0.5 - Math.min(phase / duty, 1)), leg.anchor);
        leg.release.copy(leg.anchor);
        leg.initialized = true;
      } else if (planted && !leg.planted) leg.anchor.copy(ahead);
      else if (!planted && leg.planted) leg.release.copy(leg.anchor);
      if (planted) {
        leg.desired.copy(leg.anchor);
        leg.lift = 0;
      } else {
        const start = leg.early ? leg.earlyAt : duty,
          t = clamp((phase - start) / (1 - start), 0, 1);
        leg.desired.lerpVectors(leg.release, ahead, t * t * (3 - 2 * t));
        leg.lift = Math.sin(t * Math.PI);
        leg.desired.y += leg.lift * lift;
      }
      this.point(leg, 0, this.scratch.point);
      leg.desired.lerp(this.scratch.point, 1 - this.weight);
      leg.planted = planted;
      leg.lastPhase = phase;
      if (!walking) leg.initialized = false;
    }
    let supportedHeight = deer.o.position.y;
    deer.o.updateMatrixWorld(true);
    for (const leg of this.legs) {
      leg.group.getWorldPosition(this.scratch.hip);
      this.scratch.target.copy(leg.desired);
      this.scratch.target.y -= leg.sole.y;
      const horizontal = Math.hypot(
          this.scratch.target.x - this.scratch.hip.x,
          this.scratch.target.z - this.scratch.hip.z,
        ),
        reach = leg.length1 + leg.length2 - 0.003,
        vertical = Math.sqrt(
          Math.max(0, reach * reach - horizontal * horizontal),
        );
      supportedHeight = Math.min(
        supportedHeight,
        this.scratch.target.y +
          vertical -
          (this.scratch.hip.y - deer.o.position.y),
      );
    }
    deer.o.position.y = Math.max(deer.o.position.y - 0.12, supportedHeight);
    this.solve();
  }

  solve() {
    const s = this.scratch,
      deer = this.deer;
    deer.o.updateMatrixWorld(true);
    s.forward.set(Math.sin(deer.yaw), 0, Math.cos(deer.yaw));
    for (const leg of this.legs) {
      const sample = (x, z) =>
          this.ground(leg.desired.x + x, leg.desired.z + z),
        dx = (sample(0.06, 0) - sample(-0.06, 0)) / 0.12,
        dz = (sample(0, 0.06) - sample(0, -0.06)) / 0.12;
      s.normal
        .set(
          Number.isFinite(dx) ? -clamp(dx, -0.35, 0.35) : 0,
          1,
          Number.isFinite(dz) ? -clamp(dz, -0.35, 0.35) : 0,
        )
        .normalize();
      s.tangent
        .copy(s.forward)
        .addScaledVector(s.normal, -s.forward.dot(s.normal))
        .normalize();
      s.right.crossVectors(s.normal, s.tangent).normalize();
      this.basis.makeBasis(s.right, s.normal, s.tangent);
      this.orientation.setFromRotationMatrix(this.basis);
      this.toeRotation.setFromAxisAngle(lateral, leg.lift * 0.18 * this.weight);
      this.footOrientation.copy(this.orientation).multiply(this.toeRotation);
      leg.upper.getWorldPosition(s.hip);
      s.target.copy(leg.sole).applyQuaternion(this.footOrientation);
      s.target.subVectors(leg.desired, s.target);
      s.direction.subVectors(s.target, s.hip);
      const length = clamp(
        s.direction.length(),
        Math.abs(leg.length1 - leg.length2) + 0.0001,
        leg.length1 + leg.length2 - 0.0001,
      );
      s.direction.normalize();
      s.target.copy(s.hip).addScaledVector(s.direction, length);
      const along =
        (leg.length1 * leg.length1 -
          leg.length2 * leg.length2 +
          length * length) /
        (2 * length);
      s.pole
        .copy(s.forward)
        .negate()
        .addScaledVector(s.direction, s.forward.dot(s.direction))
        .normalize();
      s.knee
        .copy(s.hip)
        .addScaledVector(s.direction, along)
        .addScaledVector(
          s.pole,
          Math.sqrt(Math.max(0, leg.length1 * leg.length1 - along * along)),
        );
      s.local.copy(s.knee);
      leg.group.worldToLocal(s.local).normalize();
      leg.upper.quaternion.setFromUnitVectors(leg.first, s.local);
      leg.upper.updateWorldMatrix(false, false);
      s.local.copy(s.target);
      leg.upper.worldToLocal(s.local).sub(leg.lower.position).normalize();
      leg.lower.quaternion.setFromUnitVectors(leg.second, s.local);
      leg.lower.updateWorldMatrix(false, false);
      leg.lower.getWorldQuaternion(this.parentRotation).invert();
      leg.ankle.quaternion
        .copy(this.parentRotation)
        .multiply(this.footOrientation);
      leg.ankle.updateWorldMatrix(false, false);
      leg.soleWorld.copy(leg.sole).applyMatrix4(leg.ankle.matrixWorld);
      this.inverse.copy(leg.group.matrixWorld).invert();
      leg.nodes.forEach((node, index) =>
        leg.matrices[index]
          .multiplyMatrices(this.inverse, node.matrixWorld)
          .multiply(leg.bind[index]),
      );
      this.deform(leg);
    }
  }

  deform(leg) {
    for (const b of leg.buffers) {
      const p = b.positions.array,
        n = b.normals.array,
        rp = b.originalPosition,
        rn = b.originalNormal,
        w = b.weights;
      for (let i = 0; i < p.length; i += 3) {
        let x = 0,
          y = 0,
          z = 0,
          nx = 0,
          ny = 0,
          nz = 0;
        for (let joint = 0; joint < 3; joint++) {
          const k = w[i + joint];
          if (k === 0) continue;
          const m = leg.matrices[joint].elements;
          x += (m[0] * rp[i] + m[4] * rp[i + 1] + m[8] * rp[i + 2] + m[12]) * k;
          y += (m[1] * rp[i] + m[5] * rp[i + 1] + m[9] * rp[i + 2] + m[13]) * k;
          z +=
            (m[2] * rp[i] + m[6] * rp[i + 1] + m[10] * rp[i + 2] + m[14]) * k;
          nx += (m[0] * rn[i] + m[4] * rn[i + 1] + m[8] * rn[i + 2]) * k;
          ny += (m[1] * rn[i] + m[5] * rn[i + 1] + m[9] * rn[i + 2]) * k;
          nz += (m[2] * rn[i] + m[6] * rn[i + 1] + m[10] * rn[i + 2]) * k;
        }
        const length = Math.hypot(nx, ny, nz) || 1;
        p[i] = x;
        p[i + 1] = y;
        p[i + 2] = z;
        n[i] = nx / length;
        n[i + 1] = ny / length;
        n[i + 2] = nz / length;
      }
      b.positions.needsUpdate = b.normals.needsUpdate = true;
      b.mesh.geometry.computeBoundingBox();
      b.mesh.geometry.computeBoundingSphere();
    }
  }
}
