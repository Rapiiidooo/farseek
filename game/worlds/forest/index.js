import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ForestView } from "../../forest.js";
import { Wildwood, WildwoodWorld, FOREST_ADDRESS } from "../../wildwood.js";
import { SunDisc } from "../../disc.js";
import { gateColliders } from "../../gate.js";
import { stoneSteps } from "../../gate-bases.js";
import { plantGrass } from "../../grass.js";
import { castleMeadowSpots } from "../../forest-floor.js";
import { BOG, bogEdge } from "../../forest-bog.js";
import { progress } from "../../store.js";
import { castleScene } from "../../mira-scenes.js";
import { syncAxes } from "../../ice-axes.js";
import { equipmentFor } from "../../equipment.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class WorldFive {
  constructor(renderer, assets, services = {}) {
    Object.assign(this, { renderer, assets, services });
    this.forest =
      services.forest || new ForestView(assets, { ...services, renderer });
    this.scene = this.forest.scene;
    this.world = new WildwoodWorld(this.forest);
    this.gateCenter = V();
    this.clipPlane = new THREE.Plane(V(0, 0, -1), -0.05);
    this.time = 0;
    this.active = false;
    this.said = new Set();
  }

  get exit() {
    return this.gate;
  }

  combatTargets() {
    return [...this.level.guards, ...this.pistolTargets()];
  }

  connect({ next }) {
    this.forest.atlantis = next?.atlantis;
  }

  async build() {
    if (!this.forest.sky) await this.forest.build();
    this.wildwood = this.level = new Wildwood(
      this.scene,
      this.world,
      this.assets,
      this.forest,
      this.services,
    );
    await this.level.build();
    this.mira = castleScene(this);
    if (
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).has("colliders")
    )
      this.scene.add(this.world.rocks.debugLines(THREE));
    this.arrival = this.entry = new this.services.Gate({
      scene: this.scene,
      world: this.world,
      renderer: this.renderer,
      sound: this.services.sound,
      assets: this.assets,
      view: false,
    });
    const model = await this.assets.make("far_gate");
    model.position.y = this.world.terrainAt(0, 0) - 0.5;
    await this.arrival.build({
      x: 0,
      z: 0,
      glyphs: ["peak", "waves", "star"],
      model,
      base: "forest",
    });
    this.arrival.uniforms.uHasView.value = 0;
    this.arrival.disc.material.side = THREE.BackSide;
    this.arrival.lightScale = 0.3;
    this.arrival.forceOpen();
    this.gateCenter.copy(this.arrival.center);
    this.forest.gateCenter.copy(this.gateCenter);
    this.daisTop = this.arrival.daisTop;
    this.gate = this.ring = this.forest.lastGate;
    this.gate.world = this.world;
    await this.buildApproach();
    gateColliders(
      this.world,
      this.gate.center.x,
      this.gate.center.z,
      this.gate.daisTop,
    );
    this.castleMeadow = await plantGrass(
      this.assets,
      this.scene,
      castleMeadowSpots(this.forest, this.world, this.gate),
      { cell: 20 },
    );
    this.forest.wake();
    this.sun = this.scene.children.find((o) => o.isDirectionalLight);
    if (this.sun) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      Object.assign(this.sun.shadow.camera, {
        left: -22,
        right: 22,
        top: 22,
        bottom: -22,
        near: 1,
        far: 150,
      });
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
    }
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const sky = new THREE.Scene();
    sky.add(this.forest.buildSky());
    this.scene.environment = pmrem.fromScene(sky, 0.04).texture;
    this.scene.environmentIntensity = 0.8;
    pmrem.dispose();
    this.makeComposer();
  }

  async buildApproach() {
    const x = this.gate.center.x;
    const steps = [];
    for (let i = 0; i < 6; i++) {
      const z = this.gate.center.z + 7 - i * 0.8;
      const terrain = [-3.5, 3.5].flatMap((dx) =>
        [-0.43, 0.43].map((dz) => this.world.terrainAt(x + dx, z + dz)),
      );
      const top = Math.max(
        this.gate.daisTop - 0.64 - (5 - i) * 0.44,
        Math.max(...terrain) + 0.08,
      );
      const low = Math.min(...terrain) - 0.15;
      steps.push({ x, z, width: 7, depth: 0.86, low, top });
      this.world.add(x - 3.5, low, z - 0.43, x + 3.5, top, z + 0.43, "rock");
    }
    this.scene.add(await stoneSteps(steps, this.assets));
  }

  makeComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    this.pass = new RenderPass(this.scene, new THREE.PerspectiveCamera());
    this.composer.addPass(this.pass);
    this.composer.addPass(new UnrealBloomPass(size, 0.3, 0.5, 1.2));
    this.composer.addPass(new OutputPass());
  }

  async wire({ hero, heroModel, follow, dust, state, palm }) {
    Object.assign(this, { hero, heroModel, follow, dust, state, palm });
    const model = await this.assets.make("sun_disc", { keepHierarchy: true });
    this.disc = new SunDisc(model, this.world, this.services.sound);
    this.disc.scene = this.scene;
    const L = this.level;
    this.disc.beams.push(...L.wells.map((w) => w.beam));
    this.disc.targets.push(
      ...L.guards,
      ...L.pylons.map((p) => p.target),
      ...L.relays.map((p) => p.target),
      ...L.spores.map((s) => s.target),
      ...L.wells.map((w) => w.target),
    );
    L.onHint = (line) => {
      if (this.time - (this.hintAt ?? -99) < 3) return;
      this.hintAt = this.time;
      this.services.hud.subtitle(line, 3.5);
    };
    L.onGlyph = (i) => {
      this.services.hud.light(FOREST_ADDRESS[i]);
      this.gate.ignite(i);
      this.services.hud.subtitle(
        i === 0
          ? "The first seal. A path through the sleeping grove."
          : i === 1
            ? "The grove is free. The castle is listening."
            : progress.relics.has("grove-map")
              ? "The sea. Mira was searching for an archive beneath it."
              : "The whole address. The sea waits on the other side.",
        4,
      );
    };
    L.onSpore = (kind) =>
      this.once("spore-hit", () =>
        this.services.hud.hint(
          "Spore pods",
          kind === "pistol"
            ? "Bullets interrupt a pod briefly. Orb pulses keep it quiet longer."
            : "An ordinary orb pulse silences a pod for six seconds; a charged pulse gives you longer.",
          8,
        ),
      );
    L.onGuard = (_, guard) => {
      if (guard?.boss)
        this.services.hud.subtitle(
          "Oldtusk yields. Mira's sea address is within reach.",
          4,
        );
      else
        this.once("guard-down", () =>
          this.services.hud.subtitle(
            "The tusks are still. Keep an eye on the undergrowth.",
            3.5,
          ),
        );
    };
    L.onBog = (spot, from, stone) => {
      this.dust?.burst(from.x, BOG.level, from.z, 1.5, 18);
      this.hero.spawn(spot.x, spot.z, spot.feet, spot.yaw);
      this.follow.snap(this.hero);
      this.services.sound?.play("respawn");
      this.services.hud.blackout(
        stone
          ? "The spore water burns. Back to the last stone."
          : "The spore water burns. Back to the bank.",
      );
    };
    L.onKeeperPhase = () =>
      this.services.hud.subtitle(
        "Oldtusk twists its head before sweeping the tusks. Keep room to step back.",
        4,
      );
    L.onReady = () => {
      this.gate.open(this.state, [
        { at: 0, eye: [8, -1.2, 15], look: [0, -0.4, 0] },
        { at: 2.4, eye: [5, -1.4, 12], look: [0, 0, 0] },
        { at: 6, eye: [2.7, -1.8, 9.5], look: [0, -0.4, -3] },
        { at: 8.6, eye: [1.2, -1.6, 8], look: [0, -0.5, -6] },
      ]);
    };
  }

  pistolTargets() {
    return [
      ...this.forest.wildlifeTargets(),
      ...this.level.spores.map((s) => s.target),
    ];
  }

  hand() {
    return (
      this.heroModel.userData.joints.rightHand ||
      this.heroModel.userData.joints.rightLowerArm
    );
  }

  once(key, fn) {
    if (this.said.has(key)) return;
    this.said.add(key);
    fn();
  }

  enter({ through = null, arrive = false, back = null } = {}) {
    const hero = this.hero;
    this.active = true;
    this.forest.wake();
    syncAxes(hero);
    hero.world = this.world;
    hero.level = {
      interactables: () => this.level.interactables(),
      use: (ref) => ref.use?.(),
      moveBlock: () => false,
    };
    if (back !== null)
      hero.spawn(
        this.gate.center.x + back,
        this.gate.center.z + 1.6,
        this.gate.daisTop + 0.03,
        0,
      );
    else if (through) {
      hero.pos.x = this.gateCenter.x + through.x;
      hero.pos.z = this.gateCenter.z + through.z;
      hero.feet = this.daisTop + through.feet;
      hero.safe = {
        x: 0,
        z: -4.5,
        feet: this.level.groundAt(0, -4.5),
        yaw: Math.PI,
      };
    } else if (arrive)
      hero.spawn(0, -4.5, this.level.groundAt(0, -4.5), Math.PI);
    if (this.level.refuges?.active >= 0 && this.level.safe)
      hero.safe = { ...this.level.safe };
    else this.level.safe = { ...hero.safe };
    this.lastZ = hero.pos.z;
    this.gate.lastZ = hero.pos.z;
    this.follow.world = this.world;
    this.follow.snap(hero);
    this.scene.add(this.heroModel);
    if (!this.disc.ready) this.disc.attach(this.hand(), this.palm);
    this.services.hud.setAddress(FOREST_ADDRESS);
    for (let i = 0; i < 3; i++)
      if (this.level.locked[i]) this.services.hud.light(FOREST_ADDRESS[i]);
    this.level.guideKey = "";
    equipmentFor(this.heroModel)?.grant("pull");
  }

  leave() {
    this.active = false;
    this.disc?.stow();
  }
  startStory() {
    this.storyT = 0;
  }
  get ready() {
    return this.level.ready;
  }
  crossed(hero) {
    return this.gate.crossed(hero);
  }

  returnCrossed(hero) {
    const c = this.gateCenter;
    const inside =
      Math.abs(hero.pos.x - c.x) < this.arrival.radius - 0.9 &&
      hero.feet > this.daisTop - 0.3 &&
      hero.feet < this.daisTop + 2;
    const was = this.lastZ ?? hero.pos.z;
    this.lastZ = hero.pos.z;
    return inside && was < c.z && hero.pos.z >= c.z;
  }

  update(dt, hero, state, { throw: pressed, camera }) {
    syncAxes(hero);
    this.ambient(dt);
    this.arrival.update(dt);
    this.level.update(dt, hero, camera);
    if (this.level.locked[0]) equipmentFor(this.heroModel)?.grant("shield");
    this.level.guide(this.services.hud, hero, this.disc);
    this.services.hud.health(this.level.health, 4);
    if (
      pressed &&
      this.disc.ready &&
      !state.cinematic &&
      ["ground", "air", "roll"].includes(hero.state) &&
      this.disc.throw(this.scene, camera, hero.yaw)
    )
      hero.throwT = 0;
    this.disc.update(dt, hero, () => (hero.catchT = 0));
    hero.throwT = (hero.throwT ?? 9) + dt;
    hero.catchT = (hero.catchT ?? 9) + dt;
    hero.holding = this.disc.ready;
    this.mira.update(dt, hero, state);
    this.storyT = (this.storyT ?? 0) + dt;
    if (this.storyT > 2)
      this.once("arrive", () =>
        this.services.hud.subtitle(
          "Warm air. A living forest, and a castle above the roots.",
          4,
        ),
      );
    if (
      this.level.spores.some(
        (pod) => Math.hypot(hero.pos.x - pod.x, hero.pos.z - pod.z) < 10,
      )
    )
      this.once("spores", () =>
        this.services.hud.hint(
          "Watch the glow",
          "Flashing pods warn before bursting. Bullets quiet them briefly; orb pulses last longer.",
          9,
        ),
      );
    if (bogEdge(hero.pos.x, hero.pos.z) < 7)
      this.once("bog", () =>
        this.services.hud.subtitle(
          "Spore water floods the hollow. Only the stones cross it.",
          4.5,
        ),
      );
    const ivy = this.level.climbs.outer;
    if (Math.hypot(hero.pos.x - ivy.o.x, hero.pos.z - ivy.o.z) < 7)
      this.once("ivy", () =>
        this.services.hud.hint(
          "Thick ivy",
          `Old ivy holds a climber's weight. ${this.services.hud.press("jump", true)} at it to take hold, then ${this.services.hud.keys("KeyW", "KeyA", "KeyS", "KeyD")} climb; ${this.services.hud.press("drop")} lets go.`,
          10,
          { queue: true },
        ),
      );
    if (
      this.level.guards.some(
        (guard) =>
          !guard.defeated &&
          Math.hypot(hero.pos.x - guard.pos.x, hero.pos.z - guard.pos.z) < 18,
      )
    )
      this.once("guards", () =>
        this.services.hud.hint(
          "Wildwood boars",
          "A lowered head warns of a straight charge. Dodge sideways, then counter its exposed flank.",
          9,
        ),
      );
  }

  ambient(dt) {
    this.time += dt;
    this.forest.update(dt);
  }

  renderInto(renderer, camera) {
    this.forest.renderInto(renderer, camera);
  }

  render(camera) {
    this.forest.hazeCastle(camera.position);
    this.forest.sky.position.copy(camera.position);
    if (this.sun && this.hero) {
      const p = V(
        Math.round(this.hero.pos.x),
        Math.round(this.hero.feet),
        Math.round(this.hero.pos.z),
      );
      this.sun.target.position.copy(p);
      this.sun.position.copy(p).add(V(-24, 48, -30));
      this.sun.target.updateMatrixWorld();
    }
    this.gate.renderPortal(camera);
    this.pass.camera = camera;
    this.composer.render();
  }

  solve() {
    this.level.solve();
    this.gate.forceOpen();
  }

  prepareForCompile(on) {
    this.forest.prepareForCompile(on);
    this.level.climbs.prepareForCompile(on);
    if (on) {
      this.sporeVisibility ??= this.level.spores.map((s) => s.cloud.visible);
      this.level.spores.forEach((s) => (s.cloud.visible = true));
      this.warningVisibility ??= this.level.guards.map(
        (g) => g.warning.cloud.visible,
      );
      for (const g of this.level.guards) g.warning.cloud.visible = true;
    } else {
      this.level.spores.forEach((s, i) => {
        s.cloud.visible = this.sporeVisibility?.[i] ?? s.cloud.visible;
      });
      this.sporeVisibility = null;
      this.level.guards.forEach((g, i) => {
        g.warning.cloud.visible =
          this.warningVisibility?.[i] ?? g.warning.cloud.visible;
      });
      this.warningVisibility = null;
    }
  }

  reset() {
    this.active = false;
    syncAxes(this.hero);
    this.level.reset();
    this.forest.resetWildlife();
    this.gate.reset();
    this.arrival.forceOpen();
    this.said.clear();
    this.mira?.reset();
    this.time = 0;
    this.hintAt = undefined;
    this.storyT = 0;
    this.lastZ = undefined;
    if (this.disc) {
      this.disc.charge = 0;
      this.disc.stow();
    }
  }

  telemetry() {
    return {
      ...this.level.telemetry(),
      wildlife: this.forest.wildlifeTelemetry(),
      disc: this.disc
        ? {
            state: this.disc.state,
            charged: this.disc.charged,
            charge: this.disc.charge,
          }
        : null,
      gateOpen: this.gate.isOpen,
      gate: [this.gate.center.x, this.gate.center.z, this.gate.daisTop],
    };
  }

  resize(w, h) {
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.gate?.resize();
  }
}

export default WorldFive;
