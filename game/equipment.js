import * as THREE from "three";
import createPistol from "./assets/twin_pistol.js";
import { finishAsset } from "./asset-finish.js";
import { detailBatch } from "./prop-detail.js";
import { traceShot } from "./targeting.js";
import {
  DroppedMagazines,
  PISTOL_CAPACITY,
  RELOAD_DURATION,
  RELOAD_TIMING,
  reloadPose,
} from "./weapon-reload.js";
import { equipmentSound, prepareEquipmentAudio } from "./equipment-sound.js";
import { RelayShield, SHIELD_RECHARGE } from "./relay-shield.js";
import { RelayPull } from "./relay-pull.js";
import { pistolCraft } from "./pistol-craft.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// The spare magazines' pouches hang from the belt against the trousers' front, which stands at
// z 0.08 in the hips' frame beside the buckle; this is their middle.
const POUCH_Z = 0.1125;
const AVAILABLE_STATES = new Set(["ground", "air"]);
const ABILITIES = ["pull", "shield"];
const fitted = new WeakMap();

// The equipment fitted to a character model, for worlds that hand items to the explorer.
export function equipmentFor(model) {
  return fitted.get(model) ?? null;
}

export class Equipment {
  constructor(model, sound) {
    this.model = model;
    this.sound = sound;
    fitted.set(model, this);
    this.selected = "pistols";
    this.pistolsUnlocked = true;
    // Pistols reaching the holsters, however they came, get one control card per session.
    this.briefing = false;
    this.briefed = false;
    this.orbAvailable = this.orbUnlocked = false;
    this.orbResume = false;
    this.ammo = PISTOL_CAPACITY;
    this.reloadLeft = 0;
    this.cooldown = 0;
    this.nextSide = 0;
    this.shots = 0;
    this.hits = 0;
    this.aimTime = 0;
    this.shotBuffer = 0;
    this.lastHit = null;
    this.hitTime = 0;
    this.protectedTime = 0;
    // Orb abilities earned on the way; each gets one control card per session.
    this.abilities = new Set();
    this.introduced = new Set();
    this.pendingCards = [];
    this.shield = new RelayShield(model, sound);
    this.pull = new RelayPull(sound);
    this.pullAim = null;
    this.craft = pistolCraft();
    this.dropped = new DroppedMagazines(12, ({ side, strength }) =>
      equipmentSound(this.sound, "reload-land", {
        pan: -side * 0.35,
        level: strength,
      }),
    );
    this.sight = {};
    this.offset = V();
    this.guns = [];
    this.joints = model.userData.joints;
    const leather = new THREE.MeshStandardMaterial({
      color: 0x252d2c,
      roughness: 0.88,
    });
    const sleeveGeometry = (gun, side) => {
      const positions = [],
        indices = [];
      const sections = [
        [-0.066, 0.092, 0.184, 0.032],
        [-0.038, 0.071, 0.184, 0.032],
        [0.03, 0.071, 0.184, 0.031],
        [0.065, 0.101, 0.184, 0.03],
        [0.166, 0.108, 0.183, 0.03],
        [0.19, 0.123, 0.167, 0.027],
      ];
      const ring = (z, low, high, half, radius) => {
        const points = [];
        for (let corner = 0; corner < 4; corner++) {
          const cx =
            corner === 0 || corner === 3 ? half - radius : -half + radius;
          const cy = corner < 2 ? high - radius : low + radius;
          for (let j = 0; j <= 4; j++) {
            const angle = ((corner + j / 4) * Math.PI) / 2;
            points.push([
              cx + Math.cos(angle) * radius,
              cy + Math.sin(angle) * radius,
              z,
            ]);
          }
        }
        return points;
      };
      const count = 20,
        rows = sections.length;
      for (const inner of [false, true]) {
        for (let row = 0; row < rows; row++) {
          const [z, low, high, half] = sections[row];
          const inset = inner ? 0.003 : 0;
          for (const p of ring(
            z - (inner && row === rows - 1 ? 0.003 : 0),
            low + inset,
            high - inset,
            half - inset,
            inner ? 0.004 : 0.007,
          ))
            positions.push(...p);
        }
      }
      const quad = (a, b, c, d, flip = false) => {
        if (flip) indices.push(a, c, b, a, d, c);
        else indices.push(a, b, c, a, c, d);
      };
      for (let row = 0; row < rows - 1; row++)
        for (let j = 0; j < count; j++) {
          const k = (j + 1) % count,
            a = row * count + j,
            b = row * count + k,
            c = (row + 1) * count + k,
            d = (row + 1) * count + j;
          quad(a, b, c, d);
          const offset = rows * count;
          quad(a + offset, b + offset, c + offset, d + offset, true);
        }
      for (let j = 0; j < count; j++) {
        const k = (j + 1) % count;
        quad(j, rows * count + j, rows * count + k, k);
      }
      for (const inner of [false, true]) {
        const offset = (inner ? rows * count : 0) + (rows - 1) * count;
        const [z, low, high] = sections.at(-1),
          center = positions.length / 3;
        positions.push(0, (low + high) / 2, z - (inner ? 0.003 : 0));
        for (let j = 0; j < count; j++) {
          const k = (j + 1) % count;
          if (inner) indices.push(center, offset + k, offset + j);
          else indices.push(center, offset + j, offset + k);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mergedPositions = [...geometry.attributes.position.array],
        mergedNormals = [...geometry.attributes.normal.array],
        mergedIndices = [...geometry.index.array];
      for (const y of [0.107, 0.17]) {
        const strap = new THREE.BoxGeometry(0.006, 0.019, 0.091, 1, 1, 1);
        strap.translate(-side * 0.032, y, -0.089);
        const offset = mergedPositions.length / 3;
        mergedPositions.push(...strap.attributes.position.array);
        mergedNormals.push(...strap.attributes.normal.array);
        mergedIndices.push(...Array.from(strap.index.array, (i) => i + offset));
        strap.dispose();
      }
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(mergedPositions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(mergedNormals, 3),
      );
      geometry.setIndex(mergedIndices);
      geometry.applyMatrix4(
        new THREE.Matrix4().makeScale(
          ...(gun.userData.holsterScale || [1, 1, 1]),
        ),
      );
      gun.updateMatrix();
      geometry.applyMatrix4(gun.matrix);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    };
    for (const [index, side] of [-1, 1].entries()) {
      const holster = new THREE.Group();
      holster.name = `${index ? "Right" : "Left"} pistol holster`;
      holster.position.set(side * 0.185, -0.08, -0.01);
      this.joints.hips.add(holster);
      const gun = finishAsset(THREE, createPistol(THREE), "twin_pistol");
      gun.name = `${index ? "Right" : "Left"} expedition pistol`;
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffd8a0,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      flash.position.fromArray(gun.userData.muzzle);
      flash.scale.set(0.6, 0.6, 1.8);
      flash.userData.noShadow = true;
      gun.add(flash);
      const tracer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.002, 0.002, 1, 4),
        new THREE.MeshBasicMaterial({
          color: 0xffdba7,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      tracer.frustumCulled = false;
      tracer.userData.noShadow = true;
      gun.add(tracer);
      const entry = {
        gun,
        holster,
        flash,
        tracer,
        recoil: 0,
        side,
        hand: this.joints[index ? "rightHand" : "leftHand"],
        key: index ? "right" : "left",
        start: V(),
        end: V(),
        space: null,
      };
      this.guns.push(entry);
      entry.magazine = gun.userData.parts.magazine;
      entry.fresh = entry.magazine.clone();
      entry.fresh.name = `${entry.key} replacement magazine`;
      entry.belt = new THREE.Group();
      entry.belt.name = `${entry.key} belt magazine attachment`;
      entry.belt.position.set(-side * 0.125, -0.009, POUCH_Z + 0.004);
      this.joints.hips.add(entry.belt);
      entry.fresh.position.set(0, 0, 0);
      entry.fresh.scale.setScalar(1 / entry.belt.getWorldScale(V()).x);
      entry.belt.add(entry.fresh);
      this.mount(entry, false);
      const shell = new THREE.Mesh(sleeveGeometry(gun, side), leather);
      shell.name = `${entry.key} fitted pistol holster`;
      shell.castShadow = shell.receiveShadow = true;
      holster.add(shell);
    }
    const pouches = new THREE.Group();
    pouches.name = "Spare magazine belt pouches";
    const canvas = new THREE.MeshStandardMaterial({
      color: 0x303c34,
      roughness: 0.91,
    });
    canvas.name = "fabric";
    const thread = new THREE.MeshStandardMaterial({
      color: 0x66745d,
      roughness: 0.93,
    });
    const detail = detailBatch(THREE, pouches);
    for (const side of [-1, 1]) {
      const x = side * 0.125,
        z = POUCH_Z;
      detail.box(canvas, [0.038, 0.083, 0.055], [x, -0.025, z]);
      detail.box(canvas, [0.039, 0.026, 0.006], [x, 0.005, z + 0.026]);
      detail.bolt(leather, 0.003, [x, 0.003, z + 0.03], [0, 0, 1]);
      for (let row = 0; row < 9; row++)
        for (const edge of [-1, 1])
          detail.line(
            thread,
            [
              [x + edge * 0.015, -0.06 + row * 0.008, z + 0.025],
              [x + edge * 0.015, -0.057 + row * 0.008, z + 0.025],
            ],
            0.0004,
          );
    }
    detail.finish();
    finishAsset(THREE, pouches, "magazine_pouches");
    pouches.traverse((node) => {
      if (node.isMesh) node.castShadow = node.receiveShadow = true;
    });
    this.joints.hips.add(pouches);
    this.pouches = pouches;
  }

  showPistols() {
    this.pouches.visible = this.pistolsUnlocked;
    for (const entry of this.guns)
      entry.gun.visible =
        entry.holster.visible =
        entry.belt.visible =
          this.pistolsUnlocked;
  }

  acquirePistols() {
    if (this.pistolsUnlocked) return false;
    this.pistolsUnlocked = true;
    this.ammo = PISTOL_CAPACITY;
    this.showPistols();
    if (this.selected === "none") this.select("pistols");
    this.briefing = true;
    return true;
  }

  bind(animator) {
    this.animator = animator;
  }

  grant(name) {
    if (!ABILITIES.includes(name) || this.abilities.has(name)) return false;
    this.abilities.add(name);
    if (!this.introduced.has(name)) {
      this.introduced.add(name);
      this.pendingCards.push(name);
    }
    return true;
  }

  has(name) {
    return this.abilities.has(name);
  }

  shieldStatus() {
    return {
      unlocked: this.abilities.has("shield"),
      active: this.shield.active,
      ready: this.shield.ready,
      charge: this.shield.active
        ? 1
        : 1 - this.shield.recharge / SHIELD_RECHARGE,
      left: this.shield.recharge,
    };
  }

  mount(entry, drawn) {
    if (entry.drawn === drawn) return;
    entry.drawn = drawn;
    const { gun, holster, hand, side, key } = entry;
    const parent = drawn ? hand : holster;
    parent.add(gun);
    gun.rotation.set(drawn ? 0 : Math.PI / 2, 0, drawn ? 0 : -side * 0.12);
    const arm = this.animator?.ik[key];
    if (drawn && arm?.normal && arm?.fingers) {
      const forward = arm.fingers.clone().normalize();
      const up = arm.normal
        .clone()
        .cross(forward)
        .multiplyScalar(-side)
        .normalize();
      const right = up.clone().cross(forward).normalize();
      gun.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, forward),
      );
    }
    const scale = drawn ? 1 / (hand.getWorldScale(V()).x || 1) : 1;
    gun.scale.setScalar(scale);
    const contact = drawn ? gun.userData.gripSurface?.[key] : null;
    const grip = V(...(contact || gun.userData.grip))
      .applyQuaternion(gun.quaternion)
      .multiplyScalar(scale);
    const anchor = drawn
      ? this.animator?.ik[key]?.palm || V(0, -0.06, 0.015)
      : V(0, 0.035, 0);
    gun.position.copy(anchor).sub(grip);
  }

  select(value) {
    if (
      !["none", "orb", "pistols"].includes(value) ||
      (value === "pistols" && !this.pistolsUnlocked) ||
      (value === "orb" && !this.orbAvailable)
    )
      return false;
    if (this.selected !== value) this.cancelReload();
    this.selected = value;
    this.orbResume = false;
    this.aimTime = 0;
    this.shotBuffer = 0;
    this.sound?.play("use");
    return true;
  }

  syncOrb(orb) {
    this.orbAvailable = !!orb?.ready;
    if (this.orbAvailable && (!this.orbUnlocked || this.orbResume)) {
      this.orbUnlocked = true;
      this.select("orb");
    } else if (!this.orbAvailable && this.selected === "orb") {
      this.select(this.pistolsUnlocked ? "pistols" : "none");
      this.orbResume = true;
    }
  }

  reset({ pistols = true } = {}) {
    this.cancelReload();
    this.dropped.clear();
    this.pistolsUnlocked = pistols;
    this.briefing = pistols && !this.briefed;
    this.selected = pistols ? "pistols" : "none";
    this.orbAvailable = this.orbUnlocked = false;
    this.orbResume = false;
    this.ammo = pistols ? PISTOL_CAPACITY : 0;
    this.reloadLeft = this.cooldown = this.aimTime = this.shotBuffer = 0;
    this.protectedTime = 0;
    this.abilities.clear();
    this.shield.reset();
    this.pull.reset();
    this.pullAim = null;
    for (const entry of this.guns) {
      entry.recoil = 0;
      entry.flash.material.opacity = entry.tracer.material.opacity = 0;
      this.mount(entry, false);
    }
    this.showPistols();
  }

  reload() {
    if (
      this.selected !== "pistols" ||
      !this.pistolsUnlocked ||
      (this.hero &&
        (!this.hero.weaponActive ||
          this.hero.swimming ||
          !AVAILABLE_STATES.has(this.hero.state))) ||
      this.ammo === PISTOL_CAPACITY ||
      this.reloadLeft > 0
    )
      return false;
    this.reloadLeft = RELOAD_DURATION;
    this.reloadState = reloadPose(0);
    for (const entry of this.guns)
      entry.released = entry.retrieved = entry.inserted = entry.racked = false;
    this.shotBuffer = 0;
    return true;
  }

  cancelReload() {
    this.reloadLeft = 0;
    this.reloadState = null;
    for (const entry of this.guns) {
      entry.magazine.visible = true;
      entry.magazine.position.fromArray(entry.gun.userData.magazineSeat);
      entry.fresh.visible = true;
    }
  }

  prepare(dt, hero, camera, orb, blocked = false, targets = []) {
    this.hero = hero;
    this.targets = targets;
    this.craft = pistolCraft();
    this.syncOrb(orb);
    prepareEquipmentAudio(this.sound);
    this.dropped.update(dt);
    this.hitTime = Math.max(0, this.hitTime - dt);
    this.protectedTime = Math.max(0, this.protectedTime - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.aimTime = Math.max(0, this.aimTime - dt);
    this.shotBuffer = Math.max(0, this.shotBuffer - dt);
    if (
      this.reloadLeft > 0 &&
      (blocked || hero.swimming || !AVAILABLE_STATES.has(hero.state))
    )
      this.cancelReload();
    if (this.reloadLeft > 0) {
      this.reloadLeft = Math.max(
        0,
        this.reloadLeft - dt * this.craft.reloadRate,
      );
      this.reloadState = reloadPose(RELOAD_DURATION - this.reloadLeft);
      if (this.reloadLeft === 0) {
        this.ammo = PISTOL_CAPACITY;
        this.cancelReload();
      }
    }
    hero.equipment = this.selected;
    hero.weaponActive =
      this.selected !== "none" &&
      !blocked &&
      !hero.swimming &&
      AVAILABLE_STATES.has(hero.state);
    if (!hero.weaponActive) this.shotBuffer = 0;
    hero.weaponAim = this.reloadLeft > 0 ? 0 : Math.min(1, this.aimTime * 4);
    hero.weaponReload = this.reloadState;
    hero.weaponMagazineBelts = Object.fromEntries(
      this.guns.map((entry) => [entry.key, entry.belt]),
    );
    hero.weaponGuns = Object.fromEntries(
      this.guns.map((entry) => [entry.key, entry.gun]),
    );
    hero.aimDirection ||= V();
    camera.getWorldDirection(hero.aimDirection);
    hero.aimDirection.normalize();
    this.camera = camera;
    const eye = camera.position || V(hero.pos.x, hero.feet + 1.4, hero.pos.z);
    this.cameraAim = traceShot(hero.world, eye, hero.aimDirection, targets);
    this.aimPoint = this.cameraAim.point;
    hero.weaponTarget = camera.position ? this.aimPoint : null;
    const drawn = hero.weaponActive && this.selected === "pistols";
    hero.holding = hero.weaponActive && this.selected === "orb" && !!orb?.ready;
    if (orb?.ready) orb.mesh.visible = hero.holding;
    for (const entry of this.guns) {
      entry.recoil = Math.max(
        0,
        entry.recoil - dt * 9 * this.craft.recoilRecovery,
      );
      hero[entry.key === "left" ? "fireRecoilLeft" : "fireRecoilRight"] =
        entry.recoil;
      this.mount(entry, drawn);
      entry.gun.userData.parts.slide.position.z =
        -Math.max(entry.recoil, this.reloadState?.rack || 0) *
        (entry.gun.userData.recoilTravel ?? 0.021);
      entry.flash.material.opacity = drawn
        ? Math.max(0, entry.recoil - 0.5) * 2
        : 0;
      entry.tracer.material.opacity = drawn
        ? Math.max(0, entry.recoil - 0.45)
        : 0;
    }
    this.prepareRelay(dt, hero, camera, orb, blocked);
  }

  prepareRelay(dt, hero, camera, orb, blocked) {
    hero.shield = this.shield;
    const yaw = Math.atan2(hero.aimDirection.x, hero.aimDirection.z);
    const free =
      !blocked &&
      !hero.swimming &&
      ["ground", "air", "roll"].includes(hero.state);
    if (free && this.abilities.has("shield") && this.input?.pressed("shield"))
      this.shield.raise(yaw);
    this.shield.update(dt, hero, yaw);
    const linking =
      free &&
      hero.state !== "roll" &&
      this.abilities.has("pull") &&
      this.selected === "orb" &&
      hero.weaponActive &&
      !!orb?.ready &&
      !!camera.position;
    this.pull.update(dt, {
      held: !!this.input?.held("throw"),
      allowed: linking,
      orb,
      hero,
      camera,
    });
    this.pullAim =
      linking && !this.pull.active && !this.pull.cooldown
        ? this.pull.find(orb, hero, camera)
        : null;
  }

  requestFire(buffered = false) {
    if (
      this.selected !== "pistols" ||
      !this.pistolsUnlocked ||
      this.reloadLeft > 0 ||
      (this.cooldown > 0 && !buffered)
    )
      return false;
    if (!this.ammo) return this.reload();
    this.shotBuffer = 0.55;
    this.aimTime = 0.75;
    return true;
  }

  cancelFire() {
    this.shotBuffer = 0;
  }

  // On target within two degrees, or when the bore passes within 15 cm of the aimed point:
  // the arms do not settle to two degrees on a target a few metres away.
  onTarget(forward, origin, point) {
    const offset = this.offset.copy(point).sub(origin);
    const along = offset.dot(forward);
    if (along <= 0) return false;
    const distance = offset.length();
    return (
      along > distance * 0.9994 || distance * distance - along * along < 0.0225
    );
  }

  fire(hero, world, camera, targets) {
    if (
      this.selected !== "pistols" ||
      !this.pistolsUnlocked ||
      !hero.weaponActive ||
      this.cooldown > 0 ||
      this.reloadLeft > 0
    )
      return false;
    if (!this.ammo) return this.reload();
    const entry = this.guns[this.nextSide];
    entry.gun.updateWorldMatrix(true, false);
    const forward = entry.gun
      .localToWorld(V(0, 0, 1))
      .sub(entry.gun.localToWorld(V()))
      .normalize();
    const origin = entry.gun.localToWorld(V(...entry.gun.userData.muzzle));
    if (
      hero.weaponTarget
        ? !this.onTarget(forward, origin, hero.weaponTarget)
        : !hero.aimDirection || forward.dot(hero.aimDirection) < 0.9994
    )
      return false;
    this.nextSide = 1 - this.nextSide;
    this.shotBuffer = 0;
    const aim = traceShot(
      world,
      origin,
      forward,
      targets,
      45,
      this.craft.slack,
    );
    entry.start.copy(origin);
    entry.end.copy(aim.point);
    entry.space = this.model.parent;
    if (entry.space) {
      entry.space.worldToLocal(entry.start);
      entry.space.worldToLocal(entry.end);
    }
    this.lastHit = aim.target
      ? aim.target.kind || "guard"
      : aim.obstruction?.box?.pistolProtected
        ? "protected"
        : aim.obstruction
          ? "wall"
          : "miss";
    this.protectedTime = 0;
    if (aim.target) {
      const accepted = aim.target.onHit({
        kind: "pistol",
        charged: false,
        pos: origin,
        point: aim.point,
        direction: forward,
        stagger: this.craft.stagger,
      });
      if (accepted !== false) {
        this.hits++;
        this.hitTime = 0.18;
      } else this.lastHit = "protected";
    }
    if (this.lastHit === "protected") {
      this.hitTime = 0;
      this.protectedTime = 0.7;
    }
    this.ammo--;
    this.shots++;
    this.cooldown = this.craft.shotInterval;
    this.aimTime = 0.75;
    entry.recoil = 1;
    entry.flash.material.opacity = 1;
    entry.tracer.material.opacity = 0.55;
    equipmentSound(this.sound, "shot");
    if (aim.obstruction || this.lastHit === "protected") {
      const screen = this.camera?.isCamera
        ? aim.point.clone().project(this.camera)
        : V();
      equipmentSound(
        this.sound,
        this.lastHit === "protected" ? "impact-protected" : "impact-surface",
        {
          pan: THREE.MathUtils.clamp(screen.x * 0.65, -0.8, 0.8),
          level: Math.max(0.15, 1 / (1 + aim.distance * 0.12)),
          delay: Math.min(0.12, aim.distance / 343),
        },
      );
    }
    if (!this.ammo) this.reload();
    return true;
  }

  updateVisuals() {
    this.updateReload();
    this.updateSight();
    for (const entry of this.guns) {
      entry.fresh.children.forEach((mesh, index) => {
        mesh.material = entry.magazine.children[index].material;
      });
      if (entry.tracer.material.opacity <= 0) continue;
      entry.gun.updateWorldMatrix(true, false);
      const from = entry.start.clone();
      const end = entry.end.clone();
      if (entry.space) {
        entry.space.localToWorld(from);
        entry.space.localToWorld(end);
      }
      entry.gun.worldToLocal(from);
      entry.gun.worldToLocal(end);
      const delta = end.sub(from);
      entry.tracer.position.copy(from).addScaledVector(delta, 0.5);
      entry.tracer.scale.y = delta.length();
      entry.tracer.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize());
    }
  }

  updateReload() {
    const pose = this.reloadState;
    if (!pose) return;
    const hero = this.hero;
    for (const entry of this.guns) {
      const side = this.animator.ik[entry.key].side;
      const cue = (kind) =>
        equipmentSound(this.sound, kind, { pan: -side * 0.3, level: 0.65 });
      entry.magazine.position.fromArray(entry.gun.userData.magazineSeat);
      if (!entry.released)
        entry.magazine.position.addScaledVector(
          V(...entry.gun.userData.magazineAxis),
          pose.extract * 0.018,
        );
      if (!entry.released && pose.elapsed >= RELOAD_TIMING.release) {
        this.dropped.drop(
          entry.magazine,
          this.model.parent,
          hero.world,
          hero,
          side,
        );
        entry.released = true;
        entry.magazine.visible = false;
        cue("reload-release");
      }
      if (!entry.retrieved && pose.elapsed >= RELOAD_TIMING.belt) {
        entry.retrieved = true;
        cue("reload-belt");
      }
      if (!entry.inserted && pose.elapsed >= RELOAD_TIMING.seat) {
        entry.inserted = true;
        entry.magazine.visible = true;
        cue("reload-seat");
      }
      if (!entry.racked && pose.elapsed >= RELOAD_TIMING.rack) {
        entry.racked = true;
        cue("reload-rack");
      }
      entry.fresh.visible = !entry.inserted;
    }
  }

  updateSight() {
    if (!this.camera?.position || !this.aimPoint) return;
    const entry = this.guns[this.nextSide];
    entry.gun.updateWorldMatrix(true, false);
    const origin = entry.gun.localToWorld(V(...entry.gun.userData.muzzle));
    const forward = entry.gun
      .localToWorld(V(0, 0, 1))
      .sub(entry.gun.localToWorld(V()))
      .normalize();
    const bore = traceShot(
      this.hero.world,
      origin,
      forward,
      this.targets,
      45,
      this.craft.slack,
    );
    const desired = this.aimPoint.clone().sub(origin).normalize();
    const aligned = this.onTarget(forward, origin, this.aimPoint);
    const blocked =
      desired.dot(this.hero.aimDirection) < 0 ||
      (aligned &&
        !!bore.obstruction &&
        bore.distance + 0.2 < origin.distanceTo(this.aimPoint));
    const point = bore.point.clone().project(this.camera);
    this.sight = {
      ready: aligned && !blocked && !this.reloadLeft,
      blocked,
      target: aligned && !!bore.target,
      bore: point.toArray(),
      aiming: this.hero.weaponAim > 0.1,
      spread:
        3 +
        this.craft.sightGap +
        (1 - this.hero.weaponAim) * 5 +
        Math.max(...this.guns.map((gun) => gun.recoil)) * 8,
      reload: this.reloadLeft ? 1 - this.reloadLeft / RELOAD_DURATION : 0,
    };
  }

  telemetry() {
    return {
      selected: this.selected,
      pistolsUnlocked: this.pistolsUnlocked,
      orbUnlocked: this.orbUnlocked,
      orbAvailable: this.orbAvailable,
      ammo: this.ammo,
      capacity: PISTOL_CAPACITY,
      reloading: this.reloadLeft > 0,
      shots: this.shots,
      hits: this.hits,
      lastHit: this.lastHit,
      reloadProgress: this.reloadLeft
        ? 1 - this.reloadLeft / RELOAD_DURATION
        : 0,
      droppedMagazines: this.dropped.dropped,
      landedMagazines: this.dropped.landed,
      sight: this.sight,
      briefing: this.briefing,
      briefed: this.briefed,
      abilities: [...this.abilities],
      shield: this.shield.telemetry(),
      pull: {
        ...this.pull.telemetry(),
        aim: this.pullAim ? this.pullAim.kind || "guard" : null,
      },
      craft: { ...this.craft.ranks, learned: this.craft.learned },
      reloadRate: this.craft.reloadRate,
      shotInterval: this.craft.shotInterval,
      aim: this.cameraAim
        ? {
            kind: this.cameraAim.target
              ? this.cameraAim.target.kind || "guard"
              : this.cameraAim.obstruction
                ? "wall"
                : "miss",
            distance: this.cameraAim.distance,
            origin: this.camera?.position?.toArray() ?? null,
            direction: this.hero?.aimDirection?.toArray() ?? null,
          }
        : null,
    };
  }
}
