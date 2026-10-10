import * as THREE from "three";
import { prepareVisuals } from "./shader-preparation.js";
import { warningTriangles } from "./hazard-marks.js";
import { tuning } from "./combat-tuning.js";

export const ICE_FALLS = [
  { x: 0.4, z: -26, top: 4.4, floor: 0, scale: 0.95 },
  { x: -0.4, z: -36.5, top: 4.4, floor: 0, scale: 1 },
  // Under the lip of the prism's shelf: it warns a climber below and falls down the face.
  { x: -8.6, z: -143.55, top: 5.5, floor: 0.6, scale: 0.55, wall: true },
];
const GRAVITY = 18;
const WARNING = 1.4;
const SHATTER = 0.9;
const REFORM = 0.75;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class FallingIce {
  constructor(scene, sound, { onWarning, onContact } = {}) {
    Object.assign(this, { scene, sound, onWarning, onContact });
    this.spots = [];
    this.matrix = new THREE.Matrix4();
    this.rotation = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.size = new THREE.Vector3();
    this.shardGeometry = new THREE.DodecahedronGeometry(0.11, 0);
    this.shardMaterial = new THREE.MeshStandardMaterial({
      color: 0xcce9f5,
      roughness: 0.25,
      metalness: 0.1,
    });
    this.depthMaterial = new THREE.MeshDepthMaterial();
  }

  add(model, definition) {
    const anchor = new THREE.Vector3(
      ...(model.userData.anchor || [0, 1.55, -0.15]),
    );
    const home = new THREE.Vector3(
      definition.x,
      definition.top,
      definition.z,
    ).addScaledVector(anchor, -definition.scale);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.38, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffb24a,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.position.set(home.x, definition.floor + 0.035, home.z);
    warningTriangles(ring, 0.78, 1.18);
    const fragments = new THREE.InstancedMesh(
      this.shardGeometry,
      this.shardMaterial,
      18,
    );
    fragments.customDepthMaterial = this.depthMaterial;
    fragments.frustumCulled = false;
    fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const spot = {
      ...definition,
      model,
      anchor,
      home,
      ring,
      fragments,
      radius: 1.3 * definition.scale,
    };
    ring.scale.setScalar(definition.scale);
    this.scene.add(model, ring, fragments);
    this.spots.push(spot);
    this.resetSpot(spot);
    return spot;
  }

  hang(spot, growth = 1) {
    const scale = spot.scale * growth;
    spot.model.scale.setScalar(scale);
    spot.model.position
      .set(spot.x, spot.top, spot.z)
      .addScaledVector(spot.anchor, -scale);
    spot.model.rotation.set(0, 0, 0);
  }

  resetSpot(spot) {
    spot.state = "idle";
    spot.t = spot.falls = spot.contacts = 0;
    spot.struck = false;
    spot.ring.visible = spot.fragments.visible = false;
    spot.model.visible = true;
    this.hang(spot);
  }

  warn(spot) {
    spot.state = "warning";
    spot.t = 0;
    spot.struck = false;
    spot.ring.visible = spot.fragments.visible = true;
    this.sound?.play("crack");
    this.onWarning?.(spot);
  }

  impact(spot) {
    spot.state = "shatter";
    spot.t = 0;
    spot.model.visible = false;
    spot.fragments.visible = true;
    this.sound?.play("ice-impact");
  }

  update(dt, hero) {
    if (dt <= 0) return;
    for (const spot of this.spots) {
      spot.t += dt;
      const near = distance(hero.pos, spot.home);
      if (spot.state === "idle") {
        if (
          spot.wall
            ? this.climbing(spot, hero, near)
            : this.walking(spot, hero, near)
        )
          this.warn(spot);
      } else if (spot.state === "warning") {
        spot.model.rotation.z = Math.sin(spot.t * 34) * 0.018;
        spot.ring.material.opacity = 0.42 + Math.sin(spot.t * 16) * 0.16;
        this.fragments(spot, true);
        if (spot.t >= WARNING * tuning().windup) {
          spot.state = "fall";
          spot.t = 0;
          spot.falls++;
          spot.model.rotation.set(0, 0, 0);
          spot.fragments.visible = false;
          this.sound?.play("ice-fall", 0.8);
        }
      } else if (spot.state === "fall") {
        const previous = spot.model.position.y;
        const next = Math.max(
          spot.floor,
          spot.home.y - 0.5 * GRAVITY * spot.t * spot.t,
        );
        spot.model.position.y = next;
        const intersects =
          near < (spot.wall ? 0.72 : spot.radius + 0.28) &&
          previous + 1.55 * spot.scale >= hero.feet &&
          next <= hero.feet + 1.5;
        if (!spot.struck && intersects) {
          spot.struck = true;
          if (this.onContact?.(spot, hero)) spot.contacts++;
        }
        if (next <= spot.floor) this.impact(spot);
      } else if (spot.state === "shatter") {
        this.fragments(spot, false);
        spot.ring.material.opacity = 0.3 * Math.max(0, 1 - spot.t / SHATTER);
        if (spot.t >= SHATTER) {
          spot.state = "spent";
          spot.t = 0;
          spot.fragments.visible = spot.ring.visible = false;
        }
      } else if (spot.state === "spent" && spot.t >= 5 && near > 7) {
        spot.state = "reform";
        spot.t = 0;
        spot.model.visible = true;
        this.hang(spot, 0.01);
      } else if (spot.state === "reform") {
        const fraction = Math.min(1, spot.t / REFORM);
        this.hang(
          spot,
          Math.max(0.01, fraction * fraction * (3 - 2 * fraction)),
        );
        if (fraction >= 1) {
          spot.state = "idle";
          spot.t = 0;
        }
      }
    }
  }

  walking(spot, hero, near) {
    return (
      near < 4.3 &&
      Math.abs(hero.feet - spot.floor) < 1.2 &&
      !["hang", "climb", "wall"].includes(hero.state)
    );
  }

  // A climber on the face below a wall spot, close enough to its line to be struck.
  climbing(spot, hero, near) {
    return (
      hero.state === "wall" &&
      near < 2.2 &&
      hero.feet > spot.floor + 1.2 &&
      hero.feet < spot.top - 1.4
    );
  }

  fragments(spot, warning) {
    const count = spot.fragments.count;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.3999632297;
      if (warning) {
        const t = (spot.t + i * 0.079) % 0.65;
        this.position.set(
          spot.home.x + Math.cos(angle) * 0.75,
          Math.max(spot.floor + 0.04, spot.top - 0.25 - 3 * t - 4 * t * t),
          spot.home.z + Math.sin(angle) * 0.28,
        );
        this.size.setScalar(0.3);
      } else {
        const t = spot.t;
        const radius = (1.3 + (i % 4) * 0.35) * t;
        this.position.set(
          spot.home.x + Math.cos(angle) * radius,
          Math.max(
            spot.floor + 0.05,
            spot.floor + 0.12 + (2 + (i % 3) * 0.5) * t - 5 * t * t,
          ),
          spot.home.z + Math.sin(angle) * radius,
        );
        this.size.setScalar(Math.max(0.01, 1 - t / SHATTER));
      }
      this.rotation.setFromEuler(
        new THREE.Euler(spot.t * 6 + i, spot.t * 9, angle),
      );
      this.matrix.compose(this.position, this.rotation, this.size);
      spot.fragments.setMatrixAt(i, this.matrix);
    }
    spot.fragments.instanceMatrix.needsUpdate = true;
  }

  prepareForCompile(on) {
    prepareVisuals(
      this,
      on,
      this.spots.flatMap((spot) => [
        [spot.model, "visible", true],
        [spot.ring, "visible", true],
        [spot.fragments, "visible", true],
      ]),
    );
  }

  reset() {
    for (const spot of this.spots) this.resetSpot(spot);
  }

  telemetry() {
    return this.spots.map((spot) => ({
      at: [spot.home.x, spot.floor, spot.home.z],
      source: [spot.x, spot.top, spot.z],
      state: spot.state,
      t: spot.t,
      bottom: spot.model.position.y,
      radius: spot.radius,
      falls: spot.falls,
      contacts: spot.contacts,
      warning: spot.ring.visible,
      wall: !!spot.wall,
    }));
  }
}
