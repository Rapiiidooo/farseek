import * as THREE from "three";
import { World } from "./world.js";
import {
  RockField,
  RockShape,
  rockPose,
  shapeTriangles,
} from "./forest-rocks.js";
import { ForestBoar } from "./forest-boar.js";
import { BoarWarning } from "./boar-warning.js";
import { Blood } from "./fx.js";
import { makeGlyph, glyphMaterial } from "./glyphs.js";
import { FOREST_TRAIL as TRAIL } from "./forest-route.js";
import {
  BOG,
  BOG_ISLANDS,
  BOG_STONES,
  bogEdge,
  overBog,
} from "./forest-bog.js";
import { TrailRefuges, FOREST_REFUGES } from "./trail-refuges.js";
import { BoarPaths } from "./forest-paths.js";
import { ForestClimbs, BASTION } from "./forest-climbs.js";
import { damageAmount, recoverHealth, threatened } from "./composure.js";
import { t } from "./i18n.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const FOREST_ADDRESS = ["waves", "spiral", "crescent"];
const SPORE_CYCLE = 5.6;
const SPORE_WARNING = 1.5;
const SPORE_BURST = 2.4;
const TERRAIN = { kind: "terrain", cam: true };

export class WildwoodWorld extends World {
  constructor(forest) {
    super();
    this.forest = forest;
    this.hazards = [];
    this.rocks = new RockField();
  }

  // Collision measured from groups of drawn meshes: instanced meshes that share placements,
  // or the meshes of one `object`. Groups of the same geometries share one shape, measured in
  // cells of `cell` metres on the smallest of them and cut off at `ceiling`, in their own
  // units; `stand(i)` tells which instances offer footing. Above the ceiling a `trunk`
  // [radius, top] stands as a cylinder, or with `fit` (heights in its own units) one cylinder
  // per band fitted round the drawn bark. `pause` spreads the work over the world's budget.
  async measureSolids(groups, pause = async () => {}) {
    const matrix = new THREE.Matrix4();
    const shared = new Map();
    for (const group of groups) {
      const {
        meshes,
        object,
        kind,
        step,
        ceiling,
        trunk,
        fit,
        cell = 0.03,
      } = group;
      const stand = group.stand ?? (() => true);
      if (!meshes.length) continue;
      const poses = [];
      let parts;
      if (object) {
        object.updateMatrixWorld(true);
        poses.push(rockPose(THREE, object.matrixWorld));
        const inverse = object.matrixWorld.clone().invert();
        parts = meshes.map((mesh) =>
          shapeTriangles(
            mesh.geometry,
            matrix.multiplyMatrices(inverse, mesh.matrixWorld),
          ),
        );
      } else {
        for (let i = 0; i < meshes[0].count; i++) {
          meshes[0].getMatrixAt(i, matrix);
          poses.push(rockPose(THREE, matrix));
        }
      }
      const key =
        object ??
        [cell, ceiling, ...meshes.map((mesh) => mesh.geometry.uuid)].join();
      if (!shared.has(key))
        shared.set(key, {
          parts,
          meshes,
          cell,
          ceiling,
          smallest: Infinity,
          uses: [],
        });
      const entry = shared.get(key);
      for (const [i, pose] of poses.entries()) {
        entry.smallest = Math.min(entry.smallest, pose.scale);
        entry.uses.push([pose, { kind, stand: stand(i), step }]);
        if (fit && object) this.fitTrunk(object, meshes, fit, pose, kind);
        else if (trunk)
          this.addRound(
            pose.x,
            pose.z,
            trunk[0] * pose.scale,
            pose.y + ceiling * pose.lift,
            pose.y + trunk[1] * pose.lift,
            kind,
          );
      }
    }
    for (const entry of shared.values()) {
      await pause();
      const parts =
        entry.parts ??
        entry.meshes.map((mesh) => shapeTriangles(mesh.geometry));
      const positions = new Float32Array(
        parts.reduce((sum, part) => sum + part.length, 0),
      );
      parts.reduce((offset, part) => {
        positions.set(part, offset);
        return offset + part.length;
      }, 0);
      const shape = new RockShape(
        positions,
        entry.cell / entry.smallest,
        entry.ceiling,
      );
      for (const [pose, options] of entry.uses)
        this.rocks.add(shape, pose, options);
    }
  }

  // The drawn bole's strands wind round an axis off the object's origin: each band's cylinder
  // is centred on the bark at that height, so the camera stays out of what is drawn.
  fitTrunk(object, meshes, heights, pose, kind) {
    const inverse = object.matrixWorld.clone().invert(),
      matrix = new THREE.Matrix4(),
      point = new THREE.Vector3();
    const bands = heights.slice(1).map(() => []);
    for (const mesh of meshes) {
      if (mesh.material?.name !== "timber") continue;
      matrix.multiplyMatrices(inverse, mesh.matrixWorld);
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(matrix);
        const band = heights.findIndex(
          (h, k) => k && point.y >= heights[k - 1] && point.y < h,
        );
        if (band > 0) bands[band - 1].push(point.x, point.z);
      }
    }
    const cos = Math.cos(pose.yaw),
      sin = Math.sin(pose.yaw);
    bands.forEach((xz, k) => {
      if (!xz.length) return;
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (let i = 0; i < xz.length; i += 2) {
        minX = Math.min(minX, xz[i]);
        maxX = Math.max(maxX, xz[i]);
        minZ = Math.min(minZ, xz[i + 1]);
        maxZ = Math.max(maxZ, xz[i + 1]);
      }
      const cx = (minX + maxX) / 2,
        cz = (minZ + maxZ) / 2;
      let r = 0;
      for (let i = 0; i < xz.length; i += 2)
        r = Math.max(r, Math.hypot(xz[i] - cx, xz[i + 1] - cz));
      this.addRound(
        pose.x + (cx * cos + cz * sin) * pose.scale,
        pose.z + (-cx * sin + cz * cos) * pose.scale,
        (r + 0.1) * pose.scale,
        pose.y + heights[k] * pose.lift,
        pose.y + heights[k + 1] * pose.lift,
        kind,
      );
    });
  }

  terrainAt(x, z) {
    if (x < -120 || x > 120 || z < -294 || z > 10) return -Infinity;
    return this.forest.surfaceAt(x, z);
  }

  // The bog's water is no footing: over it only the stones hold, and the bank under the rim
  // of a footprint, as a box's lip does.
  ground(x, z, radius, feet, stepUp) {
    const top = Math.max(
      super.ground(x, z, radius, feet, stepUp),
      this.rocks.ground(x, z, radius, feet, stepUp),
    );
    let terrain = this.terrainAt(x, z);
    if (overBog(x, z, terrain)) {
      terrain = -Infinity;
      for (let i = 0; radius >= 0.05 && i < 8; i++) {
        const px = x + Math.cos((i * Math.PI) / 4) * radius,
          pz = z + Math.sin((i * Math.PI) / 4) * radius;
        const bank = this.terrainAt(px, pz);
        if (bank > terrain && !overBog(px, pz, bank)) terrain = bank;
      }
    }
    return terrain <= feet + stepUp ? Math.max(top, terrain) : top;
  }

  // Chase paths for wardens (see WardenPath), around the measured rocks and trees too.
  planPath(pos, feet, target, reach) {
    this.paths ??= new BoarPaths(this);
    return this.paths.plan(pos, feet, target, reach);
  }

  async warmPaths(x, z, half, pause) {
    this.paths ??= new BoarPaths(this);
    await this.paths.warm(x, z, half, pause);
  }

  // Whether stone or bank lies right under a point at about the height of the feet.
  footing(x, z, feet) {
    if (this.rocks.ground(x, z, 0, feet + 0.3, 0) >= feet - 0.3) return true;
    const terrain = this.terrainAt(x, z);
    return (
      !overBog(x, z, terrain) && terrain > feet - 0.6 && terrain < feet + 0.6
    );
  }

  // The forest floor, or the bog's surface where water covers it.
  floorAt(x, z) {
    const terrain = this.terrainAt(x, z);
    return overBog(x, z, terrain) ? BOG.level : terrain;
  }

  resolve(pos, radius, feet, height, stepUp) {
    let normal = super.resolve(pos, radius, feet, height, stepUp);
    const rock = this.rocks.resolve(pos, radius, feet, height, stepUp);
    if (!rock) return normal;
    normal = super.resolve(pos, radius, feet, height, stepUp) || rock;
    return this.rocks.resolve(pos, radius, feet, height, stepUp) || normal;
  }

  occupied(x, z, radius, low, high) {
    return (
      super.occupied(x, z, radius, low, high) ||
      this.rocks.blocked(x, z, radius, low, high)
    );
  }

  free(x, z, radius, y0, y1, ignore = null) {
    return (
      super.free(x, z, radius, y0, y1, ignore) &&
      !this.rocks.blocked(x, z, radius, y0 + 1e-3, y1 - 1e-3)
    );
  }

  unsafeAt(x, z, feet) {
    return (
      super.unsafeAt(x, z, feet) ||
      this.hazards.some(
        (h) =>
          Math.hypot(x - h.x, z - h.z) < h.radius + 1.2 &&
          feet < this.terrainAt(x, z) + 0.7,
      )
    );
  }

  ray(ox, oy, oz, dx, dy, dz, maxDist, filter = null) {
    let hit = super.ray(ox, oy, oz, dx, dy, dz, maxDist, filter);
    const rock = this.rocks.ray(ox, oy, oz, dx, dy, dz, hit?.t ?? maxDist);
    if (rock && (!filter || filter(rock.box))) hit = rock;
    if (filter && !filter(TERRAIN)) return hit;
    const limit = hit?.t ?? maxDist;
    for (let t = 0.3; t < limit; t += 0.45) {
      if (oy + dy * t > this.floorAt(ox + dx * t, oz + dz * t) + 0.04) continue;
      return { t: Math.max(0, t - 0.35), box: TERRAIN };
    }
    return hit;
  }
}

export class Wildwood {
  constructor(scene, world, assets, forest, services = {}) {
    Object.assign(this, { scene, world, assets, forest, services });
    this.pylons = [];
    this.wells = [];
    this.spores = [];
    this.guards = [];
    this.relays = [];
    this.stones = [];
    this.stone = -1;
    this.bogFalls = 0;
    this.surge = 0;
    this.sequence = 0;
    this.health = 4;
    this.checkpoint = -1;
    this.time = 0;
    this.guideKey = "";
    this.reached = 0;
    this.locked = [false, false, false];
    this.explained = new Set();
    this.refuges = new TrailRefuges(this);
  }

  async build() {
    this.blood = new Blood(this.scene, (x, z) => this.world.floorAt(x, z));
    for (const target of this.forest.wildlifeTargets?.() ?? [])
      target.blood = this.blood;
    await this.world.measureSolids(this.forest.solidMeshes || [], async () =>
      this.assets?.yieldWork?.(),
    );
    this.climbs = new ForestClimbs(this);
    await this.climbs.build();
    await this.addWell(-6, -43);
    await this.addWell(1, -126);
    await this.addWell(-29, -231);
    await this.addPylon(8, -58, 0);
    await this.addPylon(10, -146, 1);
    for (const [x, z, r, phase] of [
      [-1, -29, 2.5, 0],
      [4, -38, 2.5, 1.6],
      [6, -53, 2.6, 0.8],
      [...BOG_ISLANDS[0].slice(0, 2), 2.3, 0],
      [...BOG_ISLANDS[1].slice(0, 2), 2.3, 1.3],
      [-8.6, -77.4, 2.4, 2.6],
      [7.4, -97.8, 2.4, 3.9],
      [-9, -174, 3.2, 0],
      [-16, -185, 3.1, 1.5],
      [-22, -196, 3.2, 3],
      // At the foot of the bastion's ivy.
      [-26.3, -246.4, 2.2, 1.1],
    ])
      await this.addSpore(x, z, r, phase);
    this.stones = BOG_STONES.map(([x, z, radius], index) => ({
      index,
      x,
      z,
      radius,
      top: this.world.rocks.heightAt(x, z),
    }));
    await this.addGuard(7, -134, 0, "runner");
    await this.addGuard(14, -140, 0, "keeper");
    await this.addGuard(-28, -221, 1, "runner");
    await this.addGuard(-38, -229, 1, "keeper");
    for (const [i, x, z] of [
      [0, -39, -243],
      [1, -31, -248],
      [2, ...BASTION.seal],
    ])
      await this.addRelay(x, z, i);
    const castle = this.groundAt(-40, -278);
    this.world.add(
      -66,
      castle - 10,
      -294,
      -16,
      castle + 24,
      -273,
      "prop",
      null,
      { grab: false, stand: false },
    );
    await this.refuges.build();
    // Measured now rather than when the first chase starts.
    for (const guard of this.guards)
      await this.world.warmPaths(guard.home.x, guard.home.z, 12, async () =>
        this.assets?.yieldWork?.(),
      );
    this.reset();
  }

  groundAt(x, z) {
    return this.world.ground(x, z, 0.18, 1000, 0);
  }

  async addWell(x, z) {
    const object = await this.assets.make("crystal_emitter", {
      keepHierarchy: true,
    });
    const y = this.groundAt(x, z);
    object.position.set(x, y, z);
    this.scene.add(object);
    const center = V(...(object.userData.beam || [0, 1.55, 0])).add(
      object.position,
    );
    object.userData.parts?.crystal?.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone();
        m.material.emissive.setHex(0x39e3d0);
        m.material.emissiveIntensity = 2.2;
      }
    });
    this.world.addRound(x, z, 0.6, y - 1, y + 2.1, "prop");
    const beam = {
      from: center.clone(),
      to: center.clone().add(V(0, 18, 0)),
      active: () => true,
    };
    const glow = new THREE.MeshBasicMaterial({
      color: 0x39e3d0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // The follow camera can pass through the beam, which would then cover the view.
    glow.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLens;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvLens = mvPosition.xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLens;")
        .replace(
          "#include <opaque_fragment>",
          "diffuseColor.a *= smoothstep(0.25, 1.2, length(vLens));\n#include <opaque_fragment>",
        );
    };
    glow.customProgramCacheKey = () => "fd-beam-lens";
    const light = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 18, 8, 1, true),
      glow,
    );
    light.position.copy(center).add(V(0, 9, 0));
    this.scene.add(light);
    const target = {
      radius: 0.45,
      center: () => center,
      alive: () => true,
      onHit: () => {},
    };
    this.wells.push({ x, z, center, beam, target });
  }

  async addPylon(x, z, index) {
    const object = await this.assets.make("light_pylon", {
      keepHierarchy: true,
    });
    const y = this.groundAt(x, z);
    object.position.set(x, y, z);
    this.scene.add(object);
    const lens = V(...(object.userData.lens?.center || [0, 2.3, -0.25])).add(
      object.position,
    );
    const mats = [];
    for (const part of ["lens", "slot"])
      object.userData.parts?.[part]?.traverse((m) => {
        if (m.isMesh) {
          m.material = m.material.clone();
          mats.push(m.material);
        }
      });
    this.world.addRound(x, z, 0.65, y - 1, y + 2.4, "prop");
    const glyph = makeGlyph(FOREST_ADDRESS[index], 0.7, glyphMaterial());
    glyph.position.set(x, y + 3.3, z);
    this.scene.add(glyph);
    const p = { x, z, index, object, lens, mats, lit: false, glyph };
    p.target = {
      radius: 0.5,
      center: () => lens,
      alive: () => !p.lit,
      onHit: (disc) => this.strike(p, disc),
    };
    this.pylons.push(p);
  }

  strike(p, disc) {
    if (!disc.charged)
      return this.onHint?.(
        t("Aim at a crystal and link to charge the orb first."),
      );
    if (p.index === 1 && !this.locked[0])
      return this.onHint?.(
        t("Wake the waves pylon at the forest entrance first."),
      );
    if (p.index === 1 && this.guards.some((g) => g.group === 0 && !g.defeated))
      return this.onHint?.(
        t("The grove boars hold this seal. Defeat both to wake it."),
      );
    p.lit = true;
    this.locked[p.index] = true;
    this.services.sound?.play("pylon");
    this.onGlyph?.(p.index);
  }

  async addSpore(x, z, radius, phase) {
    const object = await this.assets.make("glow_mushroom", {
      keepHierarchy: true,
    });
    const y = this.groundAt(x, z);
    object.position.set(x, y, z);
    this.scene.add(object);
    const mats = [];
    object.userData.parts?.glow?.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone();
        m.material.emissive.setHex(0xc3f25a);
        mats.push(m.material);
      }
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.1, radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xc3f25a,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const rim = ring.geometry.attributes.position;
    for (let i = 0; i < rim.count; i++)
      rim.setY(
        i,
        this.world.floorAt(x + rim.getX(i), z + rim.getZ(i)) - y + 0.07,
      );
    ring.geometry.computeBoundingSphere();
    ring.position.set(x, y, z);
    this.scene.add(ring);
    const points = [];
    for (let i = 0; i < 44; i++) {
      const a = i * 2.4,
        r = radius * Math.sqrt((i + 0.5) / 44);
      points.push(Math.sin(a) * r, 0.2 + (i % 8) * 0.16, Math.cos(a) * r);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const cloud = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: (this.sporeMap ??= sporeTexture()),
        color: 0xc3f25a,
        size: 0.32,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    cloud.position.set(x, y, z);
    this.scene.add(cloud);
    const s = {
      x,
      z,
      y,
      radius,
      phase,
      cycle: phase,
      object,
      mats,
      ring,
      cloud,
      quiet: 0,
      active: false,
      warning: false,
      bog: BOG_ISLANDS.some(([ix, iz]) => ix === x && iz === z),
    };
    const center = V(x, y + 0.8, z);
    s.target = {
      kind: "spore",
      radius: 0.7,
      center: () => center,
      alive: () => s.quiet <= 0,
      onHit: (disc) => {
        if (s.quiet > 0) return false;
        s.quiet = disc.kind === "pistol" ? 2.8 : disc.charged ? 16 : 6;
        s.cycle = 0;
        s.active = s.warning = false;
        s.cloud.visible = false;
        this.services.sound?.play("hiss");
        this.onSpore?.(disc.kind);
        return true;
      },
    };
    this.spores.push(s);
    this.world.hazards.push(s);
  }

  async addGuard(x, z, group, combatStyle) {
    const model = await this.assets.make("forest_boar", {
      keepHierarchy: true,
    });
    const guard = new ForestBoar(this.scene, this.world, model, {
      x,
      z,
      boss: group === 1 && combatStyle === "keeper",
      heavy: combatStyle === "keeper",
      sound: this.services.sound,
      route: [
        [x - 2, z + 1],
        [x + 2, z - 1],
      ],
    });
    guard.group = group;
    // The planner's boxes miss the rocks and trees measured from their meshes.
    guard.navigation.plan = (pos, feet, target, reach) =>
      this.world.planPath(pos, feet, target, reach);
    guard.feet = this.groundAt(x, z);
    guard.place();
    guard.blood = this.blood;
    guard.warning = new BoarWarning(this.scene, (x, z) => this.groundAt(x, z));
    guard.onTelegraph = (boar, target) => guard.warning.show(boar, target);
    guard.onBreak = () => {
      guard.defeated = true;
      this.onGuard?.(this.guards.filter((g) => g.defeated).length, guard);
    };
    guard.onShrug = () => this.explain("shrug");
    guard.onDazed = () => this.explain("dazed");
    if (guard.boss) {
      guard.onBlocked = () =>
        this.onHint?.(
          t(
            "Bullets glance off Oldtusk's hide until it tires. Dodge sideways, then shoot while it catches its breath.",
          ),
        );
      guard.onPhase = () => this.onKeeperPhase?.();
    }
    this.guards.push(guard);
  }

  explain(kind) {
    if (this.explained.has(kind)) return;
    this.explained.add(kind);
    this.onHint?.(
      kind === "shrug"
        ? t(
            "A plain pulse only angers it. A charged pulse stuns it; bullets do the rest.",
          )
        : t("Stunned for a moment. Shoot it before it shakes it off."),
    );
  }

  async addRelay(x, z, index) {
    const object = await this.assets.make("light_pylon", {
      keepHierarchy: true,
    });
    const y = this.groundAt(x, z);
    object.position.set(x, y, z);
    this.scene.add(object);
    const lens = V(...(object.userData.lens?.center || [0, 2.3, -0.25])).add(
      object.position,
    );
    const mat = glyphMaterial(),
      glyph = makeGlyph(FOREST_ADDRESS[index], 0.8, mat);
    glyph.position.set(x, y + 3.35, z);
    this.scene.add(glyph);
    this.world.addRound(x, z, 0.65, y - 1, y + 2.4, "prop");
    const p = { x, z, index, object, lens, mat, glyph, raised: index === 2 };
    p.target = {
      radius: 0.52,
      center: () => lens,
      alive: () => !this.ready && index >= this.sequence,
      onHit: (disc) => this.strikeRelay(p, disc),
    };
    this.relays.push(p);
  }

  strikeRelay(p, disc) {
    if (!this.locked[0] || !this.locked[1])
      return this.onHint?.(
        t("The two forest seals must be lit before the castle answers."),
      );
    if (this.guards.some((g) => g.group === 1 && !g.defeated))
      return this.onHint?.(
        t("Defeat Oldtusk and the other boar before restoring the address."),
      );
    if (p.raised && !this.climbs.onBastion(this.hero))
      return this.onHint?.(
        t(
          "The crescent seal answers only up close. Climb the ivy on the bastion.",
        ),
      );
    // Up close a plain pulse reaches the raised seal: the climb outlasts the stored light.
    if (!disc.charged && !p.raised)
      return this.onHint?.(
        t("Link to the crystal beside the steps to charge the orb."),
      );
    if (p.index !== this.sequence) {
      this.sequence = 0;
      this.services.sound?.play("clink");
      return this.onHint?.(
        t("The address runs from waves to spiral to crescent. Begin again."),
      );
    }
    this.sequence++;
    this.services.sound?.play("medallion", p.index);
    if (this.sequence === 3) {
      this.locked[2] = true;
      this.onGlyph?.(2);
      this.onReady?.();
    }
  }

  get ready() {
    return this.locked.every(Boolean);
  }
  get phase() {
    return this.ready
      ? "gate"
      : !this.locked[0]
        ? "entrance"
        : !this.locked[1]
          ? "grove"
          : "castle";
  }
  interactables() {
    return this.refuges.interactables();
  }

  update(dt, hero, camera) {
    this.time += dt;
    this.hero = hero;
    this.climbs.update(dt, hero);
    this.blood.update(dt);
    this.reached = Math.max(this.reached, -hero.pos.z);
    this.refuges.update(hero);
    FOREST_REFUGES.forEach(([x, z], i) => {
      if (
        i <= this.checkpoint ||
        hero.state !== "ground" ||
        Math.hypot(hero.pos.x - x, hero.pos.z - z) > 6
      )
        return;
      this.checkpoint = i;
      this.safe = { x, z, feet: this.groundAt(x, z), yaw: Math.PI };
      hero.safe = { ...this.safe };
      this.health = 4;
      this.refuges.reach(i);
    });
    let surge = 0;
    for (const s of this.spores) {
      const elapsed = Math.max(0, dt - s.quiet);
      s.quiet = Math.max(0, s.quiet - dt);
      s.cycle = s.quiet > 0 ? 0 : (s.cycle + elapsed) % SPORE_CYCLE;
      const wasActive = s.active,
        wasWarning = s.warning;
      s.active = s.quiet === 0 && s.cycle > SPORE_BURST;
      s.warning = s.quiet === 0 && !s.active && s.cycle > SPORE_WARNING;
      const distance = Math.hypot(hero.pos.x - s.x, hero.pos.z - s.z);
      if (distance < 12) {
        const level = Math.max(0.1, 1 - distance / 12);
        if (s.warning && !wasWarning)
          this.services.sound?.play("spore-warn", level);
        if (s.active && !wasActive)
          this.services.sound?.play("spore-burst", level);
      }
      s.cloud.visible = s.active;
      s.cloud.rotation.y = this.time * 0.24;
      s.cloud.position.y = s.y + 0.08 * Math.sin(this.time * 3);
      s.ring.material.opacity =
        s.quiet > 0
          ? 0.07
          : s.active
            ? 0.65
            : s.warning
              ? 0.25 + 0.18 * Math.sin(this.time * 12)
              : 0.13;
      for (const m of s.mats)
        m.emissiveIntensity =
          s.quiet > 0 ? 0.2 : s.active ? 2.3 : s.warning ? 1.3 : 0.6;
      if (s.bog) surge = Math.max(surge, s.active ? 1 : s.warning ? 0.35 : 0);
      // The cloud reaches a climber higher up a wall than someone standing.
      if (
        s.active &&
        distance < s.radius &&
        hero.feet <
          this.world.floorAt(hero.pos.x, hero.pos.z) +
            (hero.state === "wall" ? 1.6 : 1.05)
      )
        this.damage(hero, s.x + 0.05, s.z, 4);
    }
    recoverHealth(this, dt, {
      sound: this.services.sound,
      active: !threatened(hero, this.guards),
    });
    this.surge += (surge - this.surge) * Math.min(1, dt * 2.5);
    this.forest.bogSurge = this.surge;
    this.crossBog(hero, dt);
    for (const g of this.guards) {
      if (g.defeated) {
        g.state = "break";
        g.update(dt, hero, this.guards, { camera });
        continue;
      }
      const d = Math.hypot(hero.pos.x - g.pos.x, hero.pos.z - g.pos.z);
      if (d < 9) g.provoke("");
      g.update(dt, hero, this.guards, {
        camera,
        onSlam: (guard, x, z, hit) => {
          this.services.sound?.play("boar-step", 0.8);
          if (hit) this.damage(hero, x + 0.1, z, 5);
          return hit ? "hit" : "ground";
        },
      });
    }
    for (const p of this.pylons)
      for (const m of p.mats) m.emissiveIntensity = p.lit ? 2.4 : 0.15;
    for (const p of this.relays)
      p.mat.emissiveIntensity = p.index < this.sequence ? 3 : 0.55;
    if (
      hero.pos.z < -288 ||
      hero.pos.z > 9 ||
      Math.abs(hero.pos.x) > 115 ||
      hero.feet < this.world.terrainAt(hero.pos.x, hero.pos.z) - 4
    ) {
      if (this.safe) hero.safe = { ...this.safe };
      hero.respawn();
    }
  }

  // The stone underfoot is remembered until the explorer leaves the hollow; sinking into the
  // water returns her to it, or to the last firm ground before the first stone. A landing on
  // a stone sheds most of its speed so a running jump stays on it.
  crossBog(hero, dt) {
    const landed = hero.state === "ground" && this.heroState !== "ground";
    this.heroState = hero.state;
    if (hero.state === "ground" && bogEdge(hero.pos.x, hero.pos.z) < 1.5)
      this.holdLip(hero, dt);
    const x = hero.pos.x,
      z = hero.pos.z;
    const water = overBog(x, z, this.world.terrainAt(x, z));
    if (hero.state === "ground") {
      let on = -1;
      for (const s of this.stones)
        if (
          Math.hypot(x - s.x, z - s.z) < s.radius &&
          Math.abs(hero.feet - s.top) < 0.4
        )
          on = s.index;
      if (on >= 0 && landed) {
        hero.vel.x *= 0.35;
        hero.vel.z *= 0.35;
      }
      if (on >= 0 || bogEdge(x, z) > 1) this.stone = on;
    }
    if (!water || hero.swimming || hero.feet > BOG.level - 0.3) return;
    this.bogFalls++;
    const stone = this.stones[this.stone],
      next = this.stones[this.stone + 1];
    const spot = stone
      ? {
          x: stone.x,
          z: stone.z,
          feet: stone.top,
          yaw: Math.atan2(
            (next?.x ?? BOG.x) - stone.x,
            (next?.z ?? BOG.z - BOG.az - 3) - stone.z,
          ),
        }
      : { ...hero.safe };
    if (this.onBog) this.onBog(spot, { x, z }, !!stone);
    else {
      hero.safe = spot;
      hero.respawn();
    }
  }

  // At either pace the explorer stops where stone or bank ends over the water, as walking
  // stops on any lip: her centre goes back the way it came onto footing, or onto the nearest
  // footing after a landing short of a top, and she stands still.
  holdLip(hero, dt) {
    const w = this.world,
      x = hero.pos.x,
      z = hero.pos.z;
    this.lip ??= { x: 0, z: 0, held: false };
    if (w.footing(x, z, hero.feet)) {
      this.lip.held = false;
      return;
    }
    const speed = Math.hypot(hero.vel.x, hero.vel.z),
      reach = Math.max(0.19, speed * dt + 0.05);
    let best = Infinity,
      bx = x,
      bz = z;
    for (let i = speed > 0.1 ? -1 : 0; i < 12; i++) {
      const dx = i < 0 ? -hero.vel.x / speed : Math.cos((i * Math.PI) / 6),
        dz = i < 0 ? -hero.vel.z / speed : Math.sin((i * Math.PI) / 6);
      const px = x + dx * reach,
        pz = z + dz * reach;
      if (!w.footing(px, pz, hero.feet)) continue;
      let lo = 0,
        hi = 1;
      for (let k = 0; k < 8; k++) {
        const m = (lo + hi) / 2;
        if (w.footing(x + (px - x) * m, z + (pz - z) * m, hero.feet)) hi = m;
        else lo = m;
      }
      if (i < 0 || hi < best) {
        best = hi;
        bx = x + (px - x) * hi;
        bz = z + (pz - z) * hi;
      }
      if (i < 0) break;
    }
    if (best === Infinity) return;
    // Pressed on against the same lip, she stays exactly where she stopped.
    if (this.lip.held && Math.hypot(bx - this.lip.x, bz - this.lip.z) < 0.01) {
      bx = this.lip.x;
      bz = this.lip.z;
    }
    this.lip.x = bx;
    this.lip.z = bz;
    this.lip.held = true;
    hero.pos.x = bx;
    hero.pos.z = bz;
    hero.vel.x = hero.vel.z = 0;
    const floor = w.ground(bx, bz, 0.05, hero.feet, 0.55);
    if (Math.abs(floor - hero.feet) < 0.6) hero.feet = floor;
  }

  damage(hero, x, z, force) {
    if (!hero.takeHit(x, z, force)) return;
    this.health -= damageAmount();
    if (this.health > 0) return;
    if (this.safe) hero.safe = { ...this.safe };
    this.recoveries++;
    hero.respawn();
    this.health = 4;
    this.onHint?.(
      t("Catch your breath. The forest seals you lit are still awake."),
    );
  }

  guide(hud, hero, disc) {
    let title, sub, mark, key;
    const charged = !!disc?.charged;
    const keeper = this.guards.find(
      (g) =>
        g.boss &&
        !g.defeated &&
        g.hostile &&
        Math.hypot(hero.pos.x - g.pos.x, hero.pos.z - g.pos.z) < 14,
    );
    if (keeper) {
      title = t("Defeat Oldtusk");
      sub = `${keeper.hp}/${keeper.maxHp} · ${keeper.counterOpen ? (keeper.recoveryKind === "impact" ? t("Dazed by the impact: shoot its exposed flank") : keeper.recoveryKind === "dazed" ? t("Stunned by the orb: shoot its flank now") : t("Winded: shoot its flank with the pistols")) : keeper.state === "recover" ? t("Catching its breath, prepare to dodge again") : ["sweep-windup", "sweep"].includes(keeper.state) ? t("Step back from the twisting tusks") : ["windup", "charge"].includes(keeper.state) ? t("Dodge sideways out of the charge ({n}/{total})", { n: keeper.attackIndex, total: keeper.combat.charges }) : charged ? t("A charged orb pulse stuns it for a clean shot") : t("Keep space to sidestep its tusks")}`;
      mark = keeper.head();
      key = "elder-boar";
    } else if (this.ready) {
      title = t("Enter the drowned city");
      sub = t(
        "The castle door is open. Mira's trail continues beneath the sea.",
      );
      mark = this.forest.lastGate.center;
      key = "gate";
    } else if (!this.locked[0]) {
      title = t("Wake the waves seal");
      sub = charged
        ? t("Pulse the waves pylon with the charged orb")
        : t(
            "Link to the crystal to charge the orb; pulse a spore pod to silence it",
          );
      mark = charged ? this.pylons[0].lens : this.wells[0].center;
      key = `waves:${charged}`;
    } else if (!this.locked[1]) {
      const guard = this.guards.find((g) => g.group === 0 && !g.defeated);
      if (hero.pos.z > BOG.z - BOG.az - 1.5) {
        let ahead = null;
        for (const s of this.stones)
          if (!ahead && s.z < hero.pos.z - 0.6) ahead = s;
        title = t("Cross the spore bog");
        sub = t("Its water burns; jump from stone to stone");
        mark = this.bogMark ||= V();
        if (ahead) mark.set(ahead.x, ahead.top + 0.6, ahead.z);
        else
          mark.set(
            BOG.x,
            this.groundAt(BOG.x, BOG.z - BOG.az - 2.5) + 1,
            BOG.z - BOG.az - 2.5,
          );
        key = "bog";
      } else if (guard) {
        title = t("Free the ancient grove");
        sub = t(
          "Boars lower their heads before charging; sidestep and shoot their broad flank",
        );
        mark = guard.head();
        key = `grove:${this.guards.filter((g) => g.defeated).length}`;
      } else {
        title = t("Wake the spiral seal");
        sub = charged
          ? t("Pulse the spiral pylon beside the giant tree")
          : t("Link to the grove crystal to charge the orb");
        mark = charged ? this.pylons[1].lens : this.wells[1].center;
        key = `spiral:${charged}`;
      }
    } else {
      const guard = this.guards.find((g) => g.group === 1 && !g.defeated);
      if (hero.pos.z > -204.4 && hero.pos.z < -190) {
        title = t("Climb to the castle");
        sub = t("Climb the thick ivy over the castle's outer wall");
        mark = this.wallMark ||= V(
          this.climbs.outer.o.x,
          this.climbs.outer.y1 + 0.8,
          this.climbs.outer.o.z - 0.7,
        );
        key = "outer-wall";
      } else if (hero.pos.z > -212) {
        title = t("Climb to the castle");
        sub = t("Follow the pale trail and watch for the flashing spore pods");
        mark = V(-29, this.groundAt(-29, -219) + 1, -219);
        key = "climb";
      } else if (guard) {
        title = t("Clear the castle approach");
        sub = t(
          "Dodge the tusks; Oldtusk tires after its last charge: shoot its flank then",
        );
        mark = guard.head();
        key = `castle:${this.guards.filter((g) => g.defeated).length}`;
      } else {
        title = t("Restore the sea address");
        sub =
          this.sequence === 2
            ? this.climbs.onBastion(hero)
              ? t("Pulse the crescent seal up close (2/3)")
              : t("Climb the ivy on the bastion to the crescent seal")
            : charged
              ? t("Pulse waves, spiral, then crescent ({n}/3)", {
                  n: this.sequence,
                })
              : t("Recharge the orb; each correct glyph stays lit ({n}/3)", {
                  n: this.sequence,
                });
        mark =
          charged || this.sequence === 2
            ? this.relays[this.sequence].lens
            : this.wells[2].center;
        key = `address:${charged}:${this.sequence}`;
      }
    }
    hud.objective(title, sub);
    this.guideMarker ||= V();
    this.guideMarker.copy(mark);
    if (key !== this.guideKey) hud.setMarkers([this.guideMarker]);
    this.guideKey = key;
  }

  telemetry() {
    return {
      phase: this.phase,
      health: this.health,
      checkpoint: this.checkpoint,
      recoveries: this.recoveries,
      ready: this.ready,
      locked: [...this.locked],
      sequence: this.sequence,
      refuges: this.refuges.telemetry(),
      trail: TRAIL.map(([x, z]) => [x, z, this.groundAt(x, z)]),
      wells: this.wells.map((w) => w.center.toArray()),
      pylons: this.pylons.map((p) => ({ at: p.lens.toArray(), lit: p.lit })),
      relays: this.relays.map((p) => ({
        glyph: FOREST_ADDRESS[p.index],
        at: p.lens.toArray(),
      })),
      guards: this.guards.map((g) => ({
        at: [g.pos.x, g.feet, g.pos.z],
        hp: g.hp,
        defeated: g.defeated,
        state: g.state,
        style: g.combatStyle,
        kind: g.kind,
        attackRadius: g.chargeRadius,
        lane: g.lane
          ? { from: { ...g.lane.from }, to: { ...g.lane.to } }
          : null,
        attackIndex: g.attackIndex,
        attacksRemaining: g.attacksRemaining,
        recoveryKind: g.recoveryKind,
        counterWindow: g.boss ? g.counterOpen : g.state === "recover",
        ...(g.boss
          ? {
              boss: true,
              phase: g.phaseNumber,
              maxHp: g.maxHp,
              windowDamage: g.windowDamage,
              mark: g.target ? { ...g.target } : null,
            }
          : {}),
      })),
      spores: this.spores.map((s) => ({
        at: [s.x, s.y, s.z],
        active: s.active,
        warning: s.warning,
        cycle: s.cycle,
        quiet: s.quiet,
        radius: s.radius,
      })),
      steps: this.stones.map((s) => [s.x, s.top, s.z, s.radius]),
      outerWall: this.climbs.outer.y1 - 0.3,
      bastionTop: this.climbs.bastion.y1,
      stone: this.stone,
      bogFalls: this.bogFalls,
    };
  }

  solve() {
    this.locked.fill(true);
    this.sequence = 3;
    for (const p of this.pylons) p.lit = true;
    for (const g of this.guards) {
      g.defeated = true;
      g.hp = 0;
      g.state = "break";
    }
    this.guideKey = "";
  }
  reset() {
    this.blood?.clear();
    this.climbs?.reset();
    this.explained.clear();
    this.safe = null;
    this.recoveries = 0;
    this.health = 4;
    this.checkpoint = -1;
    this.locked.fill(false);
    this.sequence = 0;
    this.reached = 0;
    this.time = 0;
    this.guideKey = "";
    this.stone = -1;
    this.bogFalls = 0;
    this.heroState = "";
    this.surge = 0;
    this.forest.bogSurge = 0;
    this.refuges.reset();
    for (const p of this.pylons) p.lit = false;
    for (const s of this.spores) {
      s.quiet = 0;
      s.cycle = s.phase;
      s.active = s.warning = false;
    }
    for (const g of this.guards) {
      g.reset();
      g.defeated = false;
      g.feet = this.groundAt(g.pos.x, g.pos.z);
      g.place();
    }
  }
}

function sporeTexture() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / (size / 2) - 1;
      const dy = (y + 0.5) / (size / 2) - 1;
      const alpha = Math.max(0, 1 - dx * dx - dy * dy) ** 2;
      const offset = (y * size + x) * 4;
      pixels.fill(255, offset, offset + 3);
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
