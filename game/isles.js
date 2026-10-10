import * as THREE from "three";
import { isleAt } from "./world.js";
import { PROP_SHAPES } from "./court.js";
import { plantGrass, clumps } from "./grass.js";
import { prepareVisuals } from "./shader-preparation.js";
import { FerrySurvey } from "./ferry-survey.js";
import { mineralBaseColor } from "./mineral-surface.js";
import { PistolCase } from "./pistol-case.js";
import { DrapedRope } from "./isle-ropes.js";
import { IsleSwings } from "./isle-swings.js";
import { finishSteps, runSteps } from "./work-steps.js";

// The third level, the dawn isles. Mira's expedition crossed them on ropes while dawn drifted
// the isles together, and the ropes hang snapped from the rims. The held Relay orb links to
// a crystal for charge, then pulses a builders' pylon to project
// a stepped bridge of light to the next isle for a few seconds. Further on, one isle still
// drifts between two others, a line of small stones gives way under the feet, and a last pair
// of pylons must be woken on one charge with a bridge between them. Her last camp, her journal
// and a ring whose address is missing a glyph wait on the far isle.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TURQUOISE = new THREE.Color(0x39e3d0);
// The isles' grass, desert sage greyed in the shade at its roots and lit pale at its tips.
const SAGE = [0x6b7852, 0xb8bb88];

// The playable isles, in the order they are crossed: where the asset stands, the height of its
// top at the centre, its scale and turn. The small ones are too short-lived to wait on, so a
// fall from one returns the explorer to the last isle that holds. The ferry drifts along its
// line between the isles either side, pausing a stride off each rim; the stones crumble a
// moment after they are stood on and rise again a few seconds later. A yaw of -0.44 turns
// the cap's two boulders to the sides, clear of a path along z.
export const ISLES = [
  { id: "arrival", x: 0, z: 3, top: 0, s: 1.3, yaw: 0.4 },
  { id: "step1", x: 1.4, z: -9.6, top: 0.4, s: 0.35, yaw: 1.1 },
  { id: "step2", x: 3.6, z: -16.6, top: 1.0, s: 0.45, yaw: -0.44 },
  { id: "well", x: 4, z: -31, top: 1.6, s: 0.9, yaw: 0.9 },
  { id: "gap", x: 6, z: -52, top: 2.6, s: 1.0, yaw: 2.0 },
  { id: "pair", x: 10, z: -71, top: 3.8, s: 0.8, yaw: 3.1 },
  { id: "rock", x: 12, z: -86.5, top: 5.0, s: 0.4, yaw: 0.3, unsafe: true },
  { id: "ledge", x: 12, z: -103.6, top: 6.2, s: 1.0, yaw: -0.44 },
  {
    id: "ferry",
    x: 12,
    z: -114.5,
    top: 6.4,
    s: 0.5,
    yaw: -0.44,
    unsafe: true,
    drift: { between: ["ledge", "far"], gap: 1.4, dwell: 2.6, travel: 5 },
  },
  { id: "far", x: 12, z: -133.1, top: 6.8, s: 0.8, yaw: -0.44 },
  {
    id: "stone1",
    x: 10.4,
    z: -142.05,
    top: 7.1,
    s: 0.3,
    yaw: 0.7,
    crumble: true,
  },
  {
    id: "stone2",
    x: 13.6,
    z: -147.13,
    top: 7.4,
    s: 0.3,
    yaw: 2.9,
    crumble: true,
  },
  {
    id: "stone3",
    x: 10.4,
    z: -152.21,
    top: 7.7,
    s: 0.3,
    yaw: 1.8,
    crumble: true,
  },
  { id: "landing", x: 12, z: -161.8, top: 8.0, s: 0.9, yaw: -0.44 },
  { id: "midway", x: 12, z: -180, top: 8.6, s: 0.4, yaw: 2.6, unsafe: true },
  { id: "camp", x: 12, z: -202.6, top: 9.2, s: 1.6, yaw: -0.44 },
];

// Each pylon wakes a bridge along z on the line `x`, from its isle to the next. Its threshold
// sits 0.8 m inside the rim on that line and the bridge runs 1.2 m onto the far isle, both
// measured from the isles. `lasts` is how long the bridge holds once the pylon wakes.
export const PYLONS = [
  { id: "first", on: "well", to: "gap", x: 5, lasts: 15 },
  { id: "across", on: "pair", to: "gap", x: 8.6, lasts: 12 },
  { id: "twinA", on: "pair", to: "rock", x: 12, lasts: 10 },
  { id: "twinB", on: "rock", to: "ledge", x: 12, lasts: 10 },
  // The relay: one charge, a short bridge to a small isle, then the far pylon from there.
  { id: "relay1", on: "landing", to: "midway", x: 12, lasts: 7 },
  // It ends short of the small isle: the last stretch is a swing from the expedition's rope.
  { id: "relay2", on: "camp", to: "midway", x: 12, lasts: 12, gap: 6.2 },
];

// The crystals that charge the linked orb, one on each isle that has a pylon to wake, placed
// from the isle's centre.
export const WELLS = [
  { on: "well", dx: -2.4, dz: -1.2 },
  { on: "gap", dx: -2.6, dz: -2.2 },
  { on: "pair", dx: -2.8, dz: -0.8 },
  { on: "landing", dx: -2.6, dz: 1.2 },
];

// Where the expedition roped across, a rope hangs snapped from the rim facing the next isle,
// [isle, toward, sideways offset in metres] clear of the pylons and bridges on that rim.
export const ROPES = [
  ["arrival", "step1"],
  ["well", "gap", -1.9],
  ["gap", "pair", -1.8],
  ["pair", "rock", -1.8],
  ["ledge", "ferry"],
  ["far", "stone1"],
  ["landing", "midway", 2],
];

// What the expedition left on the way, and the builders' fallen masonry by their pylons:
// [asset, isle, dx, dz, yaw, scale], placed from the isle's centre, clear of every bridge
// line and landing.
const DRESSING = [
  ["glyph_banner", "ledge", -3.5, 1.5, 0.3, 1],
  ["supply_crates", "far", 2.8, 1.2, -0.6, 1],
  ["glyph_banner", "landing", 3.2, 2.4, -0.2, 1],
  ["rubble_pile", "gap", 4.2, 1.5, 0.8, 0.9],
  ["rubble_pile", "pair", 3.6, 1.8, 2.1, 0.8],
  ["rubble_pile", "landing", 3.4, -2.4, 1.3, 0.85],
  ["rubble_pile", "camp", -4.8, -1.2, 0.4, 1],
];

// Mira's last camp, placed from the camp isle's centre, and the ring whose address she could
// not finish. The path arrives from +z.
export const CAMP = {
  tent: { dx: -3.6, dz: 1.5, yaw: 0.5 },
  crates: { dx: 3.2, dz: 2.6, yaw: -0.4 },
  pistols: { dx: 1.96, dz: 3.1, yaw: -0.25 },
  banner: { dx: -1.6, dz: 5.2, yaw: 0.3 },
  ring: { dx: 0, dz: -3.8 },
  glyphs: ["peak", "waves", null],
};

const GROW = 0.7,
  FADE = 1.3,
  WARN = 3,
  THRESHOLD = 0.8,
  LANDING = 1.2,
  // A stone trembles this long under the feet, falls, stays gone, then rises back.
  TREMBLE = 1.1,
  FALL = 2.2,
  GONE = 1.8,
  RISE = 1.4;

export class Isles {
  constructor(scene, world, assets, services) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.services = services;
    this.isles = [];
    this.pylons = [];
    this.wells = [];
    this.ropes = [];
    this.time = 0;
  }

  async build() {
    const proto = await this.assets.make("floating_isle");
    this.shape = proto
      ? await runSteps(measureIsleSteps(proto), () => this.assets.yieldWork?.())
      : null;
    for (const def of ISLES) await this.addIsle(def);
    for (const def of WELLS) await this.addWell(def);
    for (const def of PYLONS) await this.addPylon(def);
    for (const [on, toward, side] of ROPES)
      await this.addRope(on, toward, side);
    this.swings = new IsleSwings(this);
    await this.swings.build(this.ropes[0]?.material);
    await this.buildCamp();
    for (const spot of DRESSING) await this.dress(...spot);
    this.survey = new FerrySurvey(this);
    await this.survey.build();
    await this.plantGrass();
    for (const i of this.isles) if (i.drift) this.measureDrift(i);
    this.reset();
  }

  isle(id) {
    return this.isles.find((i) => i.id === id);
  }

  // Height of the highest ground under a point, or -Infinity over the void.
  groundAt(x, z) {
    return this.world.ground(x, z, 0.05, 1e4, 0);
  }

  async addIsle(def) {
    const o = (await this.assets.make("floating_isle")) || fallbackIsle();
    // Its flat tufts give way to the grass planted once everything stands.
    o.traverse((m) => {
      if (m.isMesh && m.material.name === "foliage") m.visible = false;
    });
    const top = o.userData.top ?? 10;
    o.scale.multiplyScalar(def.s);
    o.position.set(def.x, def.top - top * def.s, def.z);
    o.rotation.y = def.yaw;
    this.scene.add(o);
    o.updateMatrixWorld(true);
    const c = isleCollider(this.shape || flatShape(), o);
    const collider = this.world.addIsle(
      c,
      def.unsafe || def.crumble ? { unsafe: true } : {},
    );
    const bumps = c.bumps.map((b) =>
      this.world.addRound(b.x, b.z, b.r, c.minY, b.top, "prop", null, {
        cam: false,
      }),
    );
    this.isles.push({
      ...def,
      object: o,
      collider,
      bumps,
      home: o.position.clone(),
      rest: o.rotation.clone(),
    });
  }

  // Grass in clumps round each cap, clear of the middle, the boulders and anything built on
  // it. The ferry carries its own in its frame, so they drift with it; the stones stay bare.
  async plantGrass() {
    let seed = 41;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const fixed = [];
    for (const isle of this.isles) {
      if (isle.crumble) continue;
      const c = isle.collider;
      const centres = [];
      const n = Math.max(2, Math.round(8.5 * isle.s));
      for (let i = 0; i < n; i++) {
        const a = ((i + rand() * 0.7) / n) * Math.PI * 2;
        const rim = isleAt(c, c.x + Math.cos(a), c.z + Math.sin(a)).rim;
        const r = rim * (0.55 + rand() * 0.25);
        centres.push([
          c.x + Math.cos(a) * r,
          c.z + Math.sin(a) * r,
          0.6 + 0.5 * isle.s,
          4 + Math.floor(rand() * 4),
        ]);
      }
      const spots = clumps(centres, (x, z) => this.capAt(isle, x, z), rand);
      if (!isle.drift) {
        fixed.push(...spots);
        continue;
      }
      const o = isle.object;
      o.updateMatrixWorld(true);
      const inv = o.matrixWorld.clone().invert(),
        p = V(0, 0, 0);
      const local = spots.map(([x, y, z, yaw, k]) => {
        p.set(x, y, z).applyMatrix4(inv);
        return [p.x, p.y, p.z, yaw, k / isle.s];
      });
      await plantGrass(this.assets, o, local, { colors: SAGE, cell: 1e3 });
    }
    await plantGrass(this.assets, this.scene, fixed, { colors: SAGE });
  }

  // The height of a cap where grass can grow: short of the rim, off the boulders and where
  // nothing is built. Anywhere else, null.
  capAt(isle, x, z) {
    const p = isleAt(isle.collider, x, z);
    if (p.rho > p.rim * 0.88) return null;
    for (const b of isle.bumps)
      if (Math.hypot(x - b.x, z - b.z) < b.r + 0.25) return null;
    if (this.groundAt(x, z) > p.top + 0.12) return null;
    return p.top;
  }

  // The ferry's run along its line: from a stride off the rim of the isle before to a stride
  // off the rim of the isle after, measured on the isles' caps.
  measureDrift(isle) {
    const { between, gap } = isle.drift;
    const c = isle.collider;
    const back = this.rimAlong(isle, c.x, 1) - c.z,
      front = c.z - this.rimAlong(isle, c.x, -1);
    isle.run = {
      a: this.rimAlong(this.isle(between[0]), c.x, -1) - gap - back,
      b: this.rimAlong(this.isle(between[1]), c.x, 1) + gap + front,
    };
    this.placeFerry(isle, 0);
  }

  // Moves an isle, its cap, its boulders and its mesh together.
  shift(isle, dx, dz) {
    for (const b of [isle.collider, ...isle.bumps]) {
      b.x += dx;
      b.z += dz;
      b.minX += dx;
      b.maxX += dx;
      b.minZ += dz;
      b.maxZ += dz;
    }
    isle.object.position.x += dx;
    isle.object.position.z += dz;
  }

  // Where the ferry is `t` seconds into its round: resting off the first isle, drifting over,
  // resting off the second, drifting back.
  placeFerry(isle, t) {
    const { dwell, travel } = isle.drift;
    const period = 2 * (dwell + travel);
    let u = ((t % period) + period) % period,
      f;
    if (u < dwell) f = 0;
    else if ((u -= dwell) < travel) f = ease(u / travel);
    else if ((u -= travel) < dwell) f = 1;
    else f = 1 - ease((u - dwell) / travel);
    const z = isle.run.a + (isle.run.b - isle.run.a) * f;
    const dz = z - isle.collider.z;
    this.shift(isle, 0, dz);
    return dz;
  }

  // Where an isle's ground ends along the line x, going from its centre in direction dir.
  rimAlong(isle, x, dir) {
    const c = isle.collider;
    let z = c.z;
    while (Math.abs(z - c.z) < 30) {
      const p = isleAt(c, x, z + dir * 0.05);
      if (p.rho > p.rim) break;
      z += dir * 0.05;
    }
    return z;
  }

  async addWell(spot) {
    const c = this.isle(spot.on).collider;
    const def = { ...spot, x: c.x + spot.dx, z: c.z + spot.dz };
    const y = this.groundAt(def.x, def.z);
    const o = await this.assets.make("crystal_emitter", {
      keepHierarchy: true,
    });
    const at = o?.userData.beam ?? [0, 1.55, 0];
    if (o) {
      o.position.set(def.x, y, def.z);
      o.userData.parts?.crystal?.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.emissive = TURQUOISE.clone();
        m.material.emissiveIntensity = 2.2;
      });
      this.scene.add(o);
    } else this.scene.add(fallbackWell(def.x, y, def.z));
    this.world.addRound(def.x, def.z, 0.62, y - 1, y + 2.1, "prop");
    const center = V(def.x + at[0], y + at[1], def.z + at[2]);
    // The crystal's light climbs straight up into the sky.
    const beam = {
      from: center.clone(),
      to: center.clone().add(V(0, 70, 0)),
      active: () => true,
    };
    const glow = new THREE.PointLight(0x39e3d0, 8, 8, 1.6);
    glow.position.copy(center);
    this.scene.add(glow);
    this.buildBeam(beam);
    this.wells.push({
      ...def,
      center,
      beam,
      target: {
        radius: 0.4,
        center: () => center,
        alive: () => true,
        onHit: () => {},
      },
    });
  }

  buildBeam({ from, to }) {
    const len = from.distanceTo(to);
    const mk = (radius, color, opacity) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, len, 10, 1, true).translate(
          0,
          len / 2,
          0,
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          fog: false,
        }),
      );
      m.position.copy(from);
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    mk(0.03, new THREE.Color(0.8, 2.6, 2.4), 1);
    mk(0.12, new THREE.Color(0.15, 0.7, 0.65), 0.3);
  }

  async addPylon(spec) {
    const from = this.isle(spec.on),
      far = this.isle(spec.to);
    const dir = Math.sign(far.collider.z - from.collider.z);
    const o =
      (await this.assets.make("light_pylon", { keepHierarchy: true })) ||
      fallbackPylon();
    // The threshold 0.8 m inside the rim, the bridge's end 1.2 m onto the far isle.
    const emitZ = this.rimAlong(from, spec.x, dir) - dir * THRESHOLD;
    const reach = o.userData.emit?.[2] ?? 0.8;
    const def = {
      ...spec,
      dir,
      z: emitZ - dir * reach,
      to:
        this.rimAlong(far, spec.x, -dir) +
        (spec.gap ? -dir * spec.gap : dir * LANDING),
    };
    const y = this.groundAt(def.x, emitZ);
    const yaw = def.dir < 0 ? Math.PI : 0;
    o.position.set(def.x, y, def.z);
    o.rotation.y = yaw;
    this.scene.add(o);
    o.updateMatrixWorld(true);
    const mats = [];
    for (const part of ["lens", "slot"])
      o.userData.parts?.[part]?.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.emissive = TURQUOISE.clone();
        m.material.emissiveIntensity = 0;
        mats.push(m.material);
      });
    const local = (p) => V(p[0], p[1], p[2]).applyMatrix4(o.matrixWorld);
    const lensData = o.userData.lens ?? {
      center: [0, 2.3, -0.25],
      radius: 0.31,
    };
    const lens = local(lensData.center);
    const emit = local(o.userData.emit ?? [0, 0.04, 0.8]);
    // The plinth and shaft stand under the lens, behind the threshold, which is walked over.
    const back = local([0, 0, lensData.center[2]]);
    this.world.addRound(back.x, back.z, 0.72, y - 1, y + 2.4, "prop");
    const end = this.groundAt(def.x, def.to);
    const bridge = new Bridge(this.scene, this.world, {
      x: def.x,
      z0: emit.z,
      z1: def.to,
      y0: y + 0.05,
      y1: (end > -1e3 ? end : y) + 0.05,
    });
    const pylon = { ...def, object: o, mats, lens, emit, bridge, woke: 0 };
    pylon.target = {
      radius: Math.max(0.35, lensData.radius + 0.12),
      center: () => lens,
      // A burning pylon does not draw the aim, so the one behind it can be reached; once its
      // bridge starts to go, it can be struck again to renew it.
      alive: () => !bridge.on || bridge.left < WARN,
      onHit: (disc) => this.strike(pylon, disc),
    };
    this.pylons.push(pylon);
  }

  // An orb pulse on a lens: charged, the pylon wakes and its bridge runs out; otherwise it rings.
  strike(pylon, disc) {
    const sound = this.services.sound;
    if (!disc.charged) {
      sound?.play("clink");
      this.onDark?.(pylon);
      return;
    }
    const fresh = !pylon.bridge.on;
    pylon.bridge.wake(pylon.lasts);
    pylon.woke = 1;
    sound?.play("pylon");
    if (fresh) setTimeout(() => sound?.play("bridge"), 250);
    this.onWake?.(pylon, fresh);
  }

  async addRope(on, toward, side = 0) {
    const isle = this.isle(on),
      next = this.isle(toward);
    if (!isle || !next) return;
    const o = await this.assets.make("expedition_rope", {
      keepHierarchy: true,
    });
    if (!o) return;
    const rope = new DrapedRope(isle, next, {
      side,
      seed: this.ropes.length + 1,
    }).build(this.scene, o);
    this.ropes.push(rope);
    if (!this.firstRope) this.firstRope = rope.anchor.clone();
  }

  async dress(name, on, dx, dz, yaw, s) {
    const c = this.isle(on).collider;
    const x = c.x + dx,
      z = c.z + dz;
    const y = this.groundAt(x, z);
    const o = await this.assets.make(name);
    if (!o) return;
    o.position.set(x, y, z);
    o.rotation.y = yaw;
    o.scale.multiplyScalar(s);
    this.scene.add(o);
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw);
    for (const [cx, cz, r, top] of PROP_SHAPES[name] || [])
      this.world.addRound(
        x + (cx * cs + cz * sn) * s,
        z + (-cx * sn + cz * cs) * s,
        r * s,
        y - 1,
        y + top * s,
        "prop",
        null,
        { cam: false },
      );
  }

  async buildCamp() {
    const home = this.isle("camp").collider;
    const at = ({ dx, dz, yaw = 0 }) => ({
      x: home.x + dx,
      z: home.z + dz,
      yaw,
    });
    const put = async (name, spot) => {
      const { x, z, yaw } = at(spot);
      const y = this.groundAt(x, z);
      const o = await this.assets.make(name);
      if (o) {
        o.position.set(x, y, z);
        o.rotation.y = yaw;
        this.scene.add(o);
      }
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      for (const [cx, cz, r, top] of PROP_SHAPES[name] || [])
        this.world.addRound(
          x + cx * c + cz * s,
          z - cx * s + cz * c,
          r,
          y - 1,
          y + top,
          "prop",
          null,
          { cam: false },
        );
      return y;
    };
    await put("expedition_tent", CAMP.tent);
    const y = await put("supply_crates", CAMP.crates);
    await put("glyph_banner", CAMP.banner);
    // Mira's journal lies in the open crate, where the first expedition kept its map.
    const k = at(CAMP.crates);
    const c = Math.cos(k.yaw),
      s = Math.sin(k.yaw);
    this.notePos = V(
      k.x + 0.59 * c - 0.21 * s,
      y + 0.9,
      k.z - 0.59 * s - 0.21 * c,
    );
    this.note = {
      box: {
        shape: "box",
        minX: this.notePos.x - 0.5,
        maxX: this.notePos.x + 0.5,
        minZ: this.notePos.z - 0.5,
        maxZ: this.notePos.z + 0.5,
        minY: y,
        maxY: y + 1.4,
      },
      use: () => this.onRead?.() ?? false,
    };
    // Her field case, open on a crate beside the others, with both pistols inside.
    const P = at(CAMP.pistols);
    this.pistolCase = new PistolCase(this.scene, this.world);
    this.pistolCase.build({ ...P, y: this.groundAt(P.x, P.z) });
    const R = at(CAMP.ring);
    const ringY = this.groundAt(R.x, R.z);
    const { Gate } = this.services;
    const model = await this.assets.make("far_gate");
    if (model) model.position.y = ringY;
    // Opened halfway, the ring shows the frozen reach beyond, as every door shows its world.
    this.ring = new Gate({
      scene: this.scene,
      world: this.world,
      renderer: this.services.renderer,
      sound: this.services.sound,
      assets: this.assets,
    });
    await this.ring.build({
      x: R.x,
      z: R.z,
      glyphs: CAMP.glyphs,
      model,
      base: "isles",
    });
  }

  // --- the frame ------------------------------------------------------------------------------
  update(dt, hero) {
    this.time += dt;
    this.drift(dt, hero);
    this.crumble(dt, hero);
    for (const rope of this.ropes) rope.update(dt);
    this.swings?.update(dt);
    for (const p of this.pylons) {
      p.bridge.update(dt);
      // A woken lens burns while its bridge holds and flickers as it starts to go.
      const b = p.bridge;
      const on = b.on
        ? b.left < WARN
          ? 0.55 + 0.45 * Math.sign(Math.sin(this.time * 18))
          : 1
        : 0;
      p.woke = Math.max(on, p.woke - dt * 2);
      for (const m of p.mats) m.emissiveIntensity = p.woke * 3.2;
    }
    this.ring.update(dt);
    // Which isle is underfoot, and the furthest one reached.
    const standing = this.standing(hero);
    if (standing) {
      this.on = standing.id;
      this.reached = Math.max(
        this.reached,
        ISLES.findIndex((d) => d.id === standing.id),
      );
    }
    this.survey?.update(dt, hero);
  }

  standing(hero) {
    for (const i of this.isles) {
      if (!i.collider.solid) continue;
      const p = isleAt(i.collider, hero.pos.x, hero.pos.z);
      if (p.rho <= p.rim + 0.25 && Math.abs(hero.feet - p.top) < 0.35) return i;
    }
    return null;
  }

  // Feet on this isle's cap, not in the air above it.
  grounded(isle, hero) {
    if (!["ground", "roll", "turn", "use"].includes(hero.state)) return false;
    const p = isleAt(isle.collider, hero.pos.x, hero.pos.z);
    return p.rho <= p.rim + 0.25 && Math.abs(hero.feet - p.top) < 0.12;
  }

  // The ferry carries whoever stands on it.
  drift(dt, hero) {
    this.driftT += dt;
    for (const i of this.isles) {
      if (!i.drift) continue;
      const riding = this.grounded(i, hero);
      const dz = this.placeFerry(i, this.driftT);
      if (riding) hero.carry(0, dz);
    }
  }

  // Stones tremble under the feet, fall away into the cloud and rise again.
  crumble(dt, hero) {
    const sound = this.services.sound;
    for (const i of this.isles) {
      if (!i.crumble) continue;
      const o = i.object;
      i.t += dt;
      if (i.phase === "still" && this.grounded(i, hero)) {
        i.phase = "tremble";
        i.t = 0;
        sound?.play("tremble");
      } else if (i.phase === "tremble") {
        const k = 0.03 * Math.min(1, i.t / TREMBLE);
        o.position.set(
          i.home.x + (Math.random() - 0.5) * k * 2,
          i.home.y + (Math.random() - 0.5) * k,
          i.home.z + (Math.random() - 0.5) * k * 2,
        );
        if (i.t >= TREMBLE) {
          i.phase = "fall";
          i.t = 0;
          this.solid(i, false);
          sound?.play("crumble");
        }
      } else if (i.phase === "fall") {
        o.position.set(i.home.x, i.home.y - 9 * i.t * i.t, i.home.z);
        o.rotation.set(i.rest.x + i.t * 0.25, i.rest.y, i.rest.z + i.t * 0.35);
        if (i.t >= FALL) {
          i.phase = "gone";
          i.t = 0;
          o.visible = false;
        }
      } else if (i.phase === "gone" && i.t >= GONE) {
        i.phase = "rise";
        i.t = 0;
        o.visible = true;
        o.rotation.copy(i.rest);
      } else if (i.phase === "rise") {
        o.position.set(
          i.home.x,
          i.home.y - 6 * (1 - ease(Math.min(1, i.t / RISE))),
          i.home.z,
        );
        if (i.t >= RISE) this.settle(i);
      }
    }
  }

  solid(isle, on) {
    for (const b of [isle.collider, ...isle.bumps]) b.solid = on;
  }

  // A stone back in its place, whole.
  settle(isle) {
    isle.phase = "still";
    isle.t = 0;
    isle.object.visible = true;
    isle.object.position.copy(isle.home);
    isle.object.rotation.copy(isle.rest);
    this.solid(isle, true);
  }

  get pistolsTaken() {
    return !this.pistolCase || this.pistolCase.taken;
  }

  pistolMark() {
    return (this.pistolMarker ??= this.pistolCase.center
      .clone()
      .add(V(0, 0.55, 0)));
  }

  interactables() {
    const items = this.note
      ? [
          {
            kind: "use",
            box: this.note.box,
            ref: this.note,
            prompt: "read-mira",
          },
        ]
      : [];
    const pistols = this.pistolCase?.interactable(
      () => this.onTakePistols?.() ?? false,
    );
    if (pistols) items.push(pistols);
    return [...items, ...(this.survey?.interactables() ?? [])];
  }

  // The HUD's part: the objective and its markers, from how far the explorer has come.
  guide(hud, hero, disc) {
    if (this.survey?.guide(hud, hero, disc)) return;
    const P = Object.fromEntries(this.pylons.map((p) => [p.id, p]));
    const W = Object.fromEntries(this.wells.map((w) => [w.on, w]));
    const landing = (id) => {
      const i = this.isle(id);
      return i ? V(i.collider.x, i.collider.maxY + 1.2, i.collider.z) : null;
    };
    const lens = (p) => p.lens.clone().add(V(0, 0.5, 0));
    const well = (w) => w.center.clone().add(V(0, 0.9, 0));
    const charged = disc?.charged;
    // From the catch to the landing, so the flight after letting go keeps the swing's guidance.
    if (hero?.state === "swing") this.onRope = true;
    else if (hero?.state !== "air") this.onRope = false;
    const swinging = this.onRope;
    const at = this.reached;
    const past = (id) => at >= ISLES.findIndex((d) => d.id === id);
    let objective = "",
      sub = "",
      marks = [],
      key;
    if (this.read && !this.pistolsTaken) {
      key = "pistols";
      objective = "Take Mira's pistols";
      sub = "Her case lies open on the crate beside her journal";
      marks = [this.pistolMark()];
    } else if (this.read && !this.ring.isOpen) key = "opening";
    else if (this.read) {
      key = "through";
      objective = "Follow Mira through her ring";
      sub = "Given two glyphs of three, it opened halfway: onto ice";
      marks = [this.ring.center.clone().add(V(0, -1.8, 0))];
    } else if (!past("well") && (this.on === "step2" || swinging)) {
      key = `swing:${swinging}`;
      objective = "Swing across the gap";
      sub = swinging
        ? "Let go at the front of the swing, over the far isle"
        : "Run and jump to catch the rope";
      marks = [swinging ? landing("well") : this.swings.mark("first")];
    } else if (!past("well")) {
      key = `trail:${at}`;
      objective = "Follow Mira's trail";
      sub = "Take a run at each gap and jump";
      marks = [landing(ISLES[at + 1].id)];
    } else if (!past("gap")) {
      const b = P.first.bridge;
      key = `first:${b.on ? "cross" : charged ? "lens" : "well"}`;
      objective = "Wake the pylon";
      sub = b.on
        ? "Cross before the light fades"
        : charged
          ? "The orb is charged: pulse the pylon's lens"
          : "Aim at the crystal and link to charge the orb";
      marks = [b.on ? landing("gap") : charged ? lens(P.first) : well(W.well)];
    } else if (!past("pair")) {
      const b = P.across.bridge;
      key = `across:${b.on ? "cross" : charged ? "lens" : "well"}`;
      objective = "Wake the pylon across the gap";
      sub = b.on
        ? "Cross before the light fades"
        : charged
          ? "Pulse the far pylon's lens with the charged orb"
          : "Aim at the crystal and link to charge the orb";
      marks = [b.on ? landing("pair") : charged ? lens(P.across) : well(W.gap)];
    } else if (!past("ledge")) {
      const a = P.twinA.bridge,
        b = P.twinB.bridge;
      const dark = [P.twinA, P.twinB].filter((p) => !p.bridge.on);
      const stranded = this.on === "rock" && !charged && !b.on;
      key = `pair:${a.on}:${b.on}:${charged}:${stranded}`;
      objective = "Two pylons, one charge";
      sub = stranded
        ? "No light here: step off the rock to try again"
        : !dark.length
          ? "Cross both bridges before they fade"
          : charged
            ? "Pulse both pylons before the orb's charge fades"
            : "Aim at the crystal and link to charge the orb";
      marks = !dark.length
        ? [landing("ledge")]
        : charged
          ? dark.map(lens)
          : stranded
            ? []
            : [well(W.pair)];
    } else if (!past("far")) {
      // The ferry's marker rides with it: the HUD reads the vector every frame.
      const ferry = this.isle("ferry");
      const aboard = this.on === "ferry";
      key = `ferry:${aboard}`;
      objective = "Ride the drifting isle";
      sub = aboard
        ? "Jump off when it reaches the far isle"
        : "Wait for it to drift close, then jump aboard";
      this.ferryMark ??= V();
      this.ferryMark.set(
        ferry.collider.x,
        ferry.collider.maxY + 1.2,
        ferry.collider.z,
      );
      marks = [aboard ? landing("far") : this.ferryMark];
    } else if (!past("landing")) {
      key = "stones";
      objective = "Cross the crumbling stones";
      sub = "They give way under your feet: keep running";
      marks = [landing("landing")];
    } else if (!past("camp")) {
      const a = P.relay1.bridge,
        b = P.relay2.bridge;
      const stranded = this.on === "midway" && !charged && !b.on && disc?.ready;
      const mid = this.isle("midway").collider;
      const aboard =
        this.on === "midway" &&
        isleAt(mid, hero.pos.x, hero.pos.z).rho < mid.r + 1;
      key = `relay:${a.on}:${b.on}:${charged}:${stranded}:${swinging}:${aboard}`;
      objective = "Carry the light";
      if (swinging) {
        sub = "Let go over the bridge of light";
        marks = [V(P.relay2.x, P.relay2.emit.y + 0.8, P.relay2.to)];
      } else if (b.on && aboard) {
        sub = "Swing from the rope onto the bridge before it fades";
        marks = [this.swings.mark("relay")];
      } else if (b.on) {
        sub = "Cross before the light fades";
        marks = [landing("camp")];
      } else if (stranded) {
        sub = "Aim back at the crystal and link to recharge, or step off";
        marks = [well(W.landing)];
      } else if (this.on === "midway") {
        sub = "Pulse the far pylon, then swing onto its bridge";
        marks = [lens(P.relay2)];
      } else if (a.on) {
        sub = charged
          ? "Cross while the orb is still charged"
          : "Link to the crystal to recharge the orb, then cross";
        marks = [charged ? landing("midway") : well(W.landing)];
      } else {
        sub = charged
          ? "Pulse the pylon, then cross while the orb is charged"
          : "Aim at the crystal and link to charge the orb";
        marks = [charged ? lens(P.relay1) : well(W.landing)];
      }
    } else {
      key = `camp:${this.pistolsTaken}`;
      objective = "Search Mira's camp";
      sub = this.pistolsTaken
        ? "Her journal must be here"
        : "Her journal and her open pistol case are by the crates";
      marks = [
        this.notePos.clone().add(V(0, 0.8, 0)),
        this.pistolsTaken ? null : this.pistolMark(),
      ];
    }
    hud.objective(objective, sub);
    if (this.guideKey !== key) hud.setMarkers(marks.filter(Boolean));
    this.guideKey = key;
  }

  prepareForCompile(on) {
    prepareVisuals(this, on, [
      [this.ring.disc, "visible", true],
      [this.ring.uniforms.uClear, "value", 1],
      ...this.pylons.flatMap(({ bridge, mats }) => [
        [bridge.mesh, "visible", true],
        [bridge.uniforms.uGrow, "value", 1],
        [bridge.uniforms.uFade, "value", 0],
        [bridge.uniforms.uWarn, "value", 0],
        ...mats.map((material) => [material, "emissiveIntensity", 3]),
      ]),
      ...(this.pistolCase?.pistols ?? []).map((pistol) => [
        pistol,
        "visible",
        true,
      ]),
    ]);
  }

  reset() {
    this.time = 0;
    this.driftT = 0;
    this.reached = 0;
    this.on = "arrival";
    this.read = false;
    this.guideKey = null;
    this.pistolCase?.setTaken(false);
    for (const i of this.isles) {
      if (i.crumble) this.settle(i);
      if (i.drift && i.run) this.placeFerry(i, 0);
    }
    for (const p of this.pylons) {
      p.bridge.off();
      p.woke = 0;
      for (const m of p.mats) m.emissiveIntensity = 0;
    }
    this.ring?.reset();
    this.survey?.reset();
    this.swings?.reset();
  }
}

// A stepped causeway of light along z, grown from the pylon's threshold. It holds, flickers,
// then drains from the pylon's end, and each slab is ground only while it shows.
export class Bridge {
  constructor(scene, world, { x, z0, z1, y0, y1, width = 1.9 }) {
    const len = Math.abs(z1 - z0),
      dir = Math.sign(z1 - z0);
    const n = Math.max(3, Math.round(len / 1.4));
    this.slabs = [];
    const geos = [];
    for (let i = 0; i < n; i++) {
      const a = z0 + (dir * len * i) / n,
        b = z0 + (dir * len * (i + 1)) / n;
      const h = y0 + ((y1 - y0) * (i + 0.5)) / n;
      const box = world.add(
        x - width / 2,
        h - 0.4,
        Math.min(a, b),
        x + width / 2,
        h,
        Math.max(a, b),
        "bridge",
        this,
        { grab: false, cam: false, unsafe: true, solid: false },
      );
      this.slabs.push({ box, mid: (i + 0.5) / n });
      const g = new THREE.BoxGeometry(width, 0.1, len / n - 0.07);
      g.translate(x, h - 0.05, (a + b) / 2);
      geos.push(g);
    }
    const geo = mergeBoxes(geos);
    // How far along the bridge each vertex lies, 0 at the pylon.
    const p = geo.attributes.position;
    const along = new Float32Array(p.count),
      across = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      along[i] = ((p.getZ(i) - z0) * dir) / len;
      across[i] = (p.getX(i) - x) / width + 0.5;
    }
    geo.setAttribute("along", new THREE.BufferAttribute(along, 1));
    geo.setAttribute("across", new THREE.BufferAttribute(across, 1));
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uGrow: { value: 0 },
        uFade: { value: 0 },
        uWarn: { value: 0 },
      },
    ]);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        fog: true,
        vertexShader: /* glsl */ `
          #include <common>
          #include <fog_pars_vertex>
          attribute float along; attribute float across;
          varying float vAlong; varying float vAcross;
          void main() {
            vAlong = along; vAcross = across;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <fog_pars_fragment>
          uniform float uTime; uniform float uGrow; uniform float uFade; uniform float uWarn;
          varying float vAlong; varying float vAcross;
          void main() {
            if (vAlong > uGrow || vAlong < uFade) discard;
            float edge = smoothstep(0.36, 0.5, abs(vAcross - 0.5));
            float flow = 0.5 + 0.5 * sin(vAlong * 46.0 - uTime * 5.0);
            float head = exp(-pow((uGrow - vAlong) * 24.0, 2.0)) * step(uGrow, 0.999);
            float tail = exp(-pow((vAlong - uFade) * 24.0, 2.0)) * step(0.001, uFade);
            float flicker = 1.0 - uWarn * 0.55 * step(0.0, sin(uTime * 19.0 + vAlong * 7.0));
            vec3 c = vec3(0.22, 0.89, 0.82) * (0.55 + 0.35 * flow + edge * 2.2 + (head + tail) * 3.0) * flicker;
            gl_FragColor = vec4(c, (0.5 + 0.4 * edge + head) * flicker);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }`,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.off();
  }

  get on() {
    return this.phase !== "off";
  }

  wake(lasts) {
    if (this.phase === "off") this.grow = 0;
    this.phase = "hold";
    this.left = lasts;
    this.fade = 0;
    this.mesh.visible = true;
  }

  off() {
    this.phase = "off";
    this.grow = this.fade = 0;
    this.left = 0;
    this.mesh.visible = false;
    for (const s of this.slabs) s.box.solid = false;
  }

  update(dt) {
    this.uniforms.uTime.value += dt;
    if (this.phase === "off") return;
    this.grow = Math.min(1, this.grow + dt / GROW);
    this.left -= dt;
    if (this.left <= 0) {
      this.phase = "fading";
      this.fade = Math.min(1, this.fade + dt / FADE);
      if (this.fade >= 1) return this.off();
    }
    this.uniforms.uGrow.value = this.grow;
    this.uniforms.uFade.value = this.fade;
    this.uniforms.uWarn.value = this.left < WARN ? 1 : 0;
    for (const s of this.slabs)
      s.box.solid = s.mid <= this.grow && s.mid >= this.fade;
  }
}

function ease(t) {
  return t * t * (3 - 2 * t);
}

function mergeBoxes(geos) {
  const pos = [],
    idx = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    base += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

// --- the isles' walkable caps --------------------------------------------------------------------
const N = 48,
  K = 7;

// Reads an isle's cap off its mesh, once, in the asset's own frame: the dome's pole (its highest
// point, on the lathe's axis), the rim on each bearing where the gentle dome gives way to the
// steep chamfer, the fall of the dome towards the rim, and the boulders that stand on it.
export function measureIsle(proto) {
  return finishSteps(measureIsleSteps(proto));
}

function* measureIsleSteps(proto) {
  proto.updateMatrixWorld(true);
  const caps = [],
    rocks = [];
  proto.traverse((o) => {
    if (!o.isMesh) return;
    const hex = mineralBaseColor(o.material).getHex();
    if (hex === 0xeadcc0) caps.push(o);
    else if (hex === 0x9b7658) rocks.push(o);
  });
  if (!caps.length) return flatShape();
  const v = new THREE.Vector3();
  let pole = null;
  for (const m of caps) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (!pole || v.y > pole.y) pole = v.clone();
    }
  }
  const ray = new THREE.Raycaster();
  const down = V(0, -1, 0);
  const cast = (list, x, z) => {
    ray.set(v.set(x, pole.y + 2, z), down);
    ray.far = 4;
    return ray.intersectObjects(list, false)[0] || null;
  };
  const capAt = (x, z) => {
    const h = cast(caps, x, z);
    return h && Math.abs(h.face.normal.y) > 0.9 && h.point.y > pole.y - 1.2
      ? h.point.y
      : null;
  };
  const rim = new Float32Array(N),
    drop = new Float32Array(N * K);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2,
      cx = Math.cos(a),
      cz = Math.sin(a);
    let last = 0;
    for (let r = 0.05; r < 12; r += 0.08) {
      if (capAt(pole.x + cx * r, pole.z + cz * r) === null) break;
      last = r;
    }
    rim[i] = last;
    for (let j = 0; j < K; j++) {
      const r = Math.min(last - 0.02, (last * j) / (K - 1));
      const y = capAt(pole.x + cx * r, pole.z + cz * r);
      drop[i * K + j] = y === null ? (j ? drop[i * K + j - 1] : 0) : pole.y - y;
    }
    yield;
  }
  // Boulders on the cap: rock standing above the dome, gathered into round colliders. Only
  // the triangles of rock that reach above the cap's underside can be one.
  const high = [];
  for (const m of rocks) {
    const p = m.geometry.attributes.position,
      idx = m.geometry.index;
    const count = idx ? idx.count : p.count;
    for (let t = 0; t < count; t += 3) {
      const pts = [0, 1, 2].map((k) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, idx ? idx.getX(t + k) : t + k)
          .applyMatrix4(m.matrixWorld),
      );
      if (pts.some((w) => w.y > pole.y - 0.9))
        for (const w of pts) high.push(w.x, w.y, w.z);
    }
  }
  const tops = new THREE.BufferGeometry();
  tops.setAttribute("position", new THREE.Float32BufferAttribute(high, 3));
  const boulders = [
    new THREE.Mesh(
      tops,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ),
  ];
  const bumps = [];
  for (let x = -8; x <= 8; x += 0.25) {
    for (let z = -8; z <= 8; z += 0.25) {
      const px = pole.x + x,
        pz = pole.z + z;
      const cap = capAt(px, pz);
      if (cap === null) continue;
      const rock = cast(boulders, px, pz);
      if (rock && rock.point.y > cap + 0.06) bumps.push([px, pz, rock.point.y]);
    }
    yield;
  }
  const groups = [];
  for (const [x, z, y] of bumps) {
    const g = groups.find((g) => Math.hypot(g.x - x, g.z - z) < 0.8);
    if (g) {
      g.pts.push([x, z]);
      g.x += (x - g.x) / g.pts.length;
      g.z += (z - g.z) / g.pts.length;
      g.top = Math.max(g.top, y);
    } else groups.push({ x, z, top: y, pts: [[x, z]] });
  }
  return {
    pole: { x: pole.x, y: pole.y, z: pole.z },
    rim,
    drop,
    bumps: groups.map((g) => ({
      x: g.x,
      z: g.z,
      top: g.top,
      r:
        Math.max(...g.pts.map(([x, z]) => Math.hypot(x - g.x, z - g.z))) + 0.14,
    })),
  };
}

// The measured cap carried to a placed isle: scaled, turned and moved.
function isleCollider(m, o) {
  const s = o.scale.x,
    yaw = o.rotation.y;
  const c = Math.cos(yaw),
    sn = Math.sin(yaw);
  const toWorld = (x, z) => [
    o.position.x + s * (x * c + z * sn),
    o.position.z + s * (-x * sn + z * c),
  ];
  const [ax, az] = toWorld(m.pole.x, m.pole.z);
  const rim = new Float32Array(N),
    drop = new Float32Array(N * K);
  for (let i = 0; i < N; i++) {
    // A world bearing looks along the asset's bearing turned by the isle's yaw.
    const f =
      ((((((i / N) * Math.PI * 2 + yaw) / (Math.PI * 2)) * N) % N) + N) % N;
    const i0 = Math.floor(f) % N,
      t = f - Math.floor(f),
      i1 = (i0 + 1) % N;
    rim[i] = s * (m.rim[i0] + (m.rim[i1] - m.rim[i0]) * t);
    for (let j = 0; j < K; j++)
      drop[i * K + j] =
        s *
        (m.drop[i0 * K + j] + (m.drop[i1 * K + j] - m.drop[i0 * K + j]) * t);
  }
  const maxY = o.position.y + s * m.pole.y;
  return {
    x: ax,
    z: az,
    maxY,
    minY: maxY - 1.9 * s,
    rim,
    drop,
    k: K,
    bumps: m.bumps.map((b) => {
      const [x, z] = toWorld(b.x, b.z);
      return { x, z, r: b.r * s, top: o.position.y + s * b.top };
    }),
  };
}

// A round, flat cap for the stand-in isle.
function flatShape() {
  return {
    pole: { x: 0, y: 10, z: 0 },
    rim: new Float32Array(N).fill(6.4),
    drop: new Float32Array(N * K),
    bumps: [],
  };
}

// --- stand-ins until the generated assets load ------------------------------------------------
function fallbackIsle() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(6.4, 6.4, 1.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xeadcc0, roughness: 0.9 }),
  );
  top.position.y = 9.4;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(6.2, 9, 12),
    new THREE.MeshStandardMaterial({ color: 0x9b7658, roughness: 0.95 }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = 4.4;
  g.add(top, cone);
  g.userData.top = 10;
  return g;
}

function fallbackWell(x, y, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3531, roughness: 0.8 }),
  );
  base.position.y = 0.6;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3),
    new THREE.MeshStandardMaterial({
      color: 0x1d5f63,
      emissive: 0x39e3d0,
      emissiveIntensity: 2.2,
    }),
  );
  crystal.position.y = 1.55;
  g.add(base, crystal);
  g.position.set(x, y, z);
  return g;
}

function fallbackPylon() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({
    color: 0xb57f4f,
    roughness: 0.9,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: 0x9a6a35,
    metalness: 0.8,
    roughness: 0.4,
  });
  const crystal = () =>
    new THREE.MeshStandardMaterial({
      color: 0x1d5f63,
      emissive: 0x39e3d0,
      emissiveIntensity: 0,
    });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), stone);
  plinth.position.set(0, 0.25, -0.27);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.5, 0.45), stone);
  shaft.position.set(0, 1.25, -0.27);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.06, 8, 24),
    bronze,
  );
  ring.position.set(0, 2.3, -0.27);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.31, 24), crystal());
  lens.material.side = THREE.DoubleSide;
  lens.position.copy(ring.position);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.55), bronze);
  plate.position.set(0, 0.02, 0.55);
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.02, 0.06),
    crystal(),
  );
  slot.position.set(0, 0.045, 0.79);
  g.add(plinth, shaft, ring, lens, plate, slot);
  g.userData.parts = { lens, slot };
  g.userData.lens = { center: [0, 2.3, -0.27], radius: 0.31 };
  g.userData.emit = [0, 0.04, 0.82];
  return g;
}
