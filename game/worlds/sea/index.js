import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { AtlantisView } from "../../atlantis.js";
import { World } from "../../world.js";
import { SunDisc, fallbackDisc } from "../../disc.js";
import { DrownedArchive, SEA_ADDRESS } from "../../drowned.js";
import { Starward } from "../../starward.js";
import { underwaterPass } from "../../underwater-view.js";
import { equipmentFor } from "../../equipment.js";
import { t } from "../../i18n.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class WorldSix {
  constructor(renderer, assets, services = {}) {
    Object.assign(this, { renderer, assets, services });
    this.atlantis = services.atlantis || new AtlantisView(assets);
    this.scene = this.atlantis.scene;
    this.world = new World();
    this.active = false;
    this.time = 0;
    this.said = new Set();
    this.gateCenter = V(0, 33.5, 0);
    this.clipPlane = new THREE.Plane(V(0, 0, -1), -0.05);
    this.waterEye = V(0, 0, 0);
  }

  get exit() {
    return this.gate;
  }

  combatTargets() {
    return [...this.boss.pressureTargets, this.boss.target];
  }

  async build() {
    if (!this.services.atlantis) await this.atlantis.build();
    this.sky = this.atlantis.sky;
    this.drowned = new DrownedArchive(this.scene, this.world, this.assets, {
      ...this.services,
      renderer: this.renderer,
      atlantis: this.atlantis,
    });
    this.level = this.drowned;
    await this.drowned.build();
    this.gate = this.ring = this.drowned.gate;
    this.boss = this.drowned.boss;
    const { Gate } = this.services;
    this.arrival = new Gate({
      scene: this.scene,
      world: this.world,
      renderer: this.renderer,
      sound: this.services.sound,
      assets: this.assets,
      view: false,
    });
    const model = await this.assets.make("far_gate");
    model.position.y = 29;
    await this.arrival.build({
      x: 0,
      z: 0,
      glyphs: SEA_ADDRESS,
      model,
      base: "sea",
      depth: 1.2,
    });
    this.arrival.uniforms.uHasView.value = 0;
    this.arrival.disc.material.side = THREE.BackSide;
    this.arrival.lightScale = 0.3;
    this.arrival.forceOpen();
    this.gateCenter.copy(this.arrival.center);
    this.daisTop = this.arrival.daisTop;
    this.atlantis.gateCenter.copy(this.gateCenter);
    this.makeShadows();
    this.makeComposer();
    this.epilogue = new Starward();
    this.gate.hasView = true;
    this.gate.destination = this.epilogue;
    this.gate.uniforms.uHasView.value = 1;
    this.gate.resize();
  }

  makeShadows() {
    this.sun = this.scene.children.find((node) => node.isDirectionalLight);
    if (!this.sun) return;
    const shadow = this.sun.shadow;
    this.sunOffset = this.sun.position.clone().sub(this.sun.target.position);
    this.shadowCenter = new THREE.Vector3();
    this.scene.add(this.sun.target);
    this.sun.castShadow = true;
    shadow.mapSize.set(2048, 2048);
    Object.assign(shadow.camera, {
      left: -14,
      right: 14,
      top: 14,
      bottom: -14,
      near: 0.5,
      far: 160,
    });
    shadow.camera.updateProjectionMatrix();
    shadow.bias = -0.00015;
    shadow.normalBias = 0.03;
    shadow.autoUpdate = false;
    this.shadowAt = -Infinity;
  }

  updateShadows(camera) {
    if (!this.sun) return;
    const shadow = this.sun.shadow;
    const interval =
      shadow.mapSize.x >= 2048 ? 0 : shadow.mapSize.x >= 1024 ? 1 / 30 : 1 / 20;
    camera.getWorldDirection(this.shadowCenter).multiplyScalar(6);
    this.shadowCenter.add(camera.position);
    const now = performance.now() / 1000;
    if (
      shadow.map &&
      now - this.shadowAt < interval &&
      this.shadowCenter.distanceToSquared(this.sun.target.position) < 4
    )
      return;
    this.shadowAt = now;
    const step = 28 / shadow.mapSize.x;
    for (const axis of ["x", "y", "z"])
      this.shadowCenter[axis] =
        Math.round(this.shadowCenter[axis] / step) * step;
    this.sun.target.position.copy(this.shadowCenter);
    this.sun.position.copy(this.shadowCenter).add(this.sunOffset);
    shadow.needsUpdate = true;
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
    this.bloom = new UnrealBloomPass(size, 0.32, 0.45, 1.15);
    // Bloom spreads one NaN texel or runaway glint over most of the screen; clamp drops NaN to 0.
    const highPass = this.bloom.materialHighPassFilter;
    highPass.fragmentShader = highPass.fragmentShader.replace(
      "vec4 texel = texture2D( tDiffuse, vUv );",
      "vec4 texel = clamp( texture2D( tDiffuse, vUv ), 0.0, 16.0 );",
    );
    this.composer.addPass(this.bloom);
    this.waterPass = underwaterPass();
    this.composer.addPass(this.waterPass);
    this.composer.addPass(new OutputPass());
  }

  async wire({ hero, heroModel, follow, dust, state, palm }) {
    Object.assign(this, { hero, heroModel, follow, dust, state, palm });
    this.drowned.headJoint = heroModel.userData.joints.head;
    const mesh =
      (await this.assets.make("sun_disc", { keepHierarchy: true })) ||
      fallbackDisc();
    this.disc = new SunDisc(mesh, this.world, this.services.sound);
    this.disc.scene = this.scene;
    for (const well of this.drowned.wells) {
      this.disc.beams.push(well.beam);
      this.disc.targets.push(well.target);
    }
    for (const seal of this.drowned.seals) this.disc.targets.push(seal.target);
    this.disc.targets.push(this.boss.target);
    this.drowned.onDamage = () => {
      this.follow.shake = Math.max(this.follow.shake || 0, 0.45);
    };
    this.drowned.onRespawn = () => {
      this.services.sound?.setMusic("sea");
      this.disc.charge = 0;
      this.disc.stow();
      this.disc.attach(this.hand(), this.palm);
      this.follow.snap(this.hero);
    };
    this.onComplete = this.services.onComplete;
    this.drowned.onComplete = () => this.onComplete?.();
    this.drowned.onReady = () => this.services.hud?.hideBoss?.();
  }

  hand() {
    const j = this.heroModel.userData.joints;
    return j.rightHand || j.rightLowerArm;
  }

  enter({ through = null, arrive = false, back = null } = {}) {
    this.active = true;
    const hero = this.hero;
    this.drowned.hero = hero;
    if (back !== null) {
      hero.spawn(back, -98, this.gate.daisTop + 0.02, 0);
    } else if (through) {
      hero.pos.x = this.gateCenter.x + through.x;
      hero.pos.z = this.gateCenter.z + through.z;
      hero.feet = this.daisTop + through.feet;
      hero.safe = { x: 0, z: -4.4, feet: 30, yaw: Math.PI };
    } else if (arrive) hero.spawn(0, -4.4, 30, Math.PI);
    hero.swimVolume = this.drowned.sanctuary.volume;
    if (hero.swimVolume.active()) {
      hero.feet = Math.max(hero.feet, 31.5);
      hero.state = "swim";
      hero.swimming = true;
      hero.safe = { x: 0, z: -4.4, feet: 31.5, yaw: Math.PI };
    }
    hero.world = this.world;
    hero.level = {
      interactables: () => this.drowned.interactables(),
      use: (ref) => ref.use?.(),
      moveBlock: () => false,
    };
    this.follow.world = this.world;
    this.follow.snap(hero);
    this.heroModel.removeFromParent();
    this.scene.add(this.heroModel);
    if (this.disc.state !== "held") this.disc.attach(this.hand(), this.palm);
    const hud = this.services.hud;
    hud.setAddress(SEA_ADDRESS);
    this.drowned.seals.forEach((seal, i) => {
      if (seal.lit) hud.light(SEA_ADDRESS[i]);
    });
    if (this.drowned.ready) hud.light(SEA_ADDRESS[2]);
    hud.health(this.drowned.health, 4);
    this.lastZ = undefined;
    this.arrival.update(0);
    const kit = equipmentFor(this.heroModel);
    kit?.grant("pull");
    kit?.grant("shield");
  }

  leave() {
    this.epilogue.reset();
    this.active = false;
    this.hero.swimVolume = null;
    this.hero.swimming = false;
    if (this.hero.state === "swim") this.hero.state = "air";
    this.disc?.stow();
    this.services.hud?.hideBoss?.();
  }

  startStory() {
    this.storyT = 0;
  }

  update(dt, hero, state, { throw: pressed, interact, camera }) {
    this.ambient(dt);
    this.arrival.update(dt);
    if (
      pressed &&
      this.disc.ready &&
      !state.cinematic &&
      ["ground", "air", "roll"].includes(hero.state) &&
      this.disc.throw(this.scene, camera, hero.yaw)
    )
      hero.throwT = 0;
    if (hero.swimming && this.disc.state !== "stowed") this.disc.stow();
    else if (!hero.swimming && this.disc.state === "stowed")
      this.disc.attach(this.hand(), this.palm);
    this.disc.update(dt, hero, () => (hero.catchT = 0));
    hero.throwT = (hero.throwT ?? 9) + dt;
    hero.catchT = (hero.catchT ?? 9) + dt;
    hero.holding = this.disc.ready;
    if (interact && !state.cinematic) this.drowned.sanctuary.activate(hero);
    this.drowned.update(dt, hero, !state.cinematic);
    if (state.cinematic) return;
    this.drowned.guide(this.services.hud, hero, this.disc);
    if (this.boss.active)
      this.services.hud?.boss?.(
        t("Tide Guardian"),
        this.boss.health,
        this.boss.maxHealth,
        this.boss.state === "exposed"
          ? t("Phase {n} · Open core", { n: this.boss.phase })
          : t("Phase {n} · {attack}", {
              n: this.boss.phase,
              attack: this.boss.attackName,
            }),
      );
    else this.services.hud?.hideBoss?.();
    this.storyT = (this.storyT ?? 0) + dt;
    this.once("trail", this.storyT > 2, () =>
      this.services.hud.subtitle(
        t("Mira's trail ends below the water. There must be a way down."),
        3.5,
      ),
    );
    this.once(
      "arrival",
      this.storyT > 5.5 && !this.drowned.sanctuary.active,
      () => {
        this.services.hud.hint(
          t("The drowned archive"),
          t(
            "Look up or down and swim toward the reticle. Reach the control desk on the right and press {interact} for air.",
            { interact: this.services.hud.k("interact") },
          ),
          9,
        );
      },
    );
    this.once(
      "vents",
      this.drowned.sanctuary.progress === 1 &&
        hero.pos.z < -19 &&
        Math.abs(hero.pos.x) < 5,
      () =>
        this.services.hud.hint(
          t("Pressure vents"),
          t(
            "Amber warns of a surge. Wait for the water to fall, then run across the dark strip.",
          ),
          9,
        ),
    );
    this.once(
      "current",
      hero.swimming &&
        this.drowned.arrivalCurrent.current.share(
          hero.pos.x,
          hero.feet + 0.9,
          hero.pos.z,
        ) > 0.3,
      () =>
        this.services.hud.hint(
          t("Currents"),
          t(
            "In open water the current carries you back. Rest in the still water behind each pier, then swim on to the next.",
          ),
          9,
        ),
    );
    this.once("gap", hero.pos.z < -46, () =>
      this.services.hud.hint(
        t("The flooded stair"),
        t(
          "A vent below surges through the flooded stair. Shelter behind a fallen block while it surges, swim on when it calms, then rise to the far landing.",
        ),
        10,
      ),
    );
  }

  once(key, condition, action) {
    if (!condition || this.said.has(key)) return;
    this.said.add(key);
    action();
  }

  ambient(dt) {
    this.time += dt;
    this.atlantis.update(dt);
  }

  returnCrossed(hero) {
    const was = this.lastZ ?? hero.pos.z;
    this.lastZ = hero.pos.z;
    const dx = hero.pos.x - this.gateCenter.x;
    // A swimmer can pass anywhere in the opening, not only at walking height.
    const inside = hero.swimming
      ? dx * dx + (hero.feet + 0.9 - this.gateCenter.y) ** 2 <
        (this.arrival.radius - 0.6) ** 2
      : Math.abs(dx) < this.arrival.radius - 0.9 &&
        hero.feet > this.daisTop - 0.3 &&
        hero.feet < this.daisTop + 2;
    return inside && was < this.gateCenter.z && hero.pos.z >= this.gateCenter.z;
  }

  renderInto(renderer, camera) {
    this.updateShadows(camera);
    this.atlantis.renderInto(renderer, camera);
  }
  render(camera, dt) {
    if (!this.epilogue.active) this.gate.renderPortal(camera);
    this.pass.scene = this.epilogue.active ? this.epilogue.scene : this.scene;
    if (!this.epilogue.active) this.updateShadows(camera);
    if (!this.epilogue.active) this.sky.position.copy(camera.position);
    this.pass.camera = camera;
    const water = this.epilogue.active
      ? 0
      : this.drowned.sanctuary.waterAt(camera.position);
    // The expanding shield crosses the lens within two frames: ease the filter, but follow camera cuts at once.
    const cut =
      !(dt > 0) ||
      this.cameraWater === undefined ||
      this.waterEye.distanceToSquared(camera.position) > 4;
    this.waterEye.copy(camera.position);
    this.cameraWater = cut
      ? water
      : water + (this.cameraWater - water) * Math.exp(-dt / 0.16);
    this.waterPass.uniforms.uWater.value = this.cameraWater;
    this.waterPass.uniforms.uTime.value = this.time;
    this.scene.fog.density = THREE.MathUtils.lerp(
      0.0052,
      0.012,
      this.cameraWater,
    );
    this.composer.render();
  }

  prepareForCompile(on) {
    this.drowned.prepareForCompile(on);
  }

  reset() {
    this.epilogue.reset();
    this.active = false;
    this.drowned.reset();
    this.arrival.forceOpen();
    this.said.clear();
    this.storyT = 0;
    this.lastZ = undefined;
    this.services.hud?.hideBoss?.();
    if (this.disc) {
      this.disc.charge = 0;
      this.disc.stow();
    }
  }

  solve() {
    this.drowned.solve();
  }
  telemetry() {
    return {
      ...this.drowned.telemetry(),
      epilogue: this.epilogue.telemetry(),
      cameraWater: this.cameraWater ?? 1,
      disc: this.disc
        ? {
            state: this.disc.state,
            charged: this.disc.charged,
            hits: [
              ...this.drowned.wells.flatMap((well, i) =>
                this.disc.hitThisThrow.has(well.target) ? [`well:${i}`] : [],
              ),
              ...this.drowned.seals.flatMap((seal, i) =>
                this.disc.hitThisThrow.has(seal.target) ? [`seal:${i}`] : [],
              ),
              ...(this.disc.hitThisThrow.has(this.boss.target)
                ? ["guardian"]
                : []),
            ],
          }
        : null,
    };
  }
  resize(w, h) {
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.arrival?.resize();
    this.gate?.resize();
  }

  finaleShot(hero, onDone, options) {
    const shot = this.epilogue.start(this, hero, onDone, options);
    // Framed behind her as she walks into the door, before she turns to light.
    shot.closeUp ??= () => this.epilogue.stage === "approach";
    return shot;
  }
}

export default WorldSix;
