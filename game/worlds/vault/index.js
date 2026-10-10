import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { World } from "../../world.js";
import { SunDisc, fallbackDisc } from "../../disc.js";
import { prepareVisuals } from "../../shader-preparation.js";
import { underwaterPass } from "../../underwater-view.js";
import {
  ADDRESS,
  ARRIVAL,
  BAYS,
  DOOR,
  Masonry,
  NAVE,
  OCULUS,
  RING,
  VaultHall,
  bayAt,
  vaultMaterials,
} from "../../vault.js";
import { LightTrial } from "../../vault-light.js";
import { KeeperTrial } from "../../vault-keeper.js";
import { BridgeTrial } from "../../vault-bridge.js";
import { IceTrial } from "../../vault-ice.js";
import { BogTrial, POOL } from "../../vault-bog.js";
import { WellTrial } from "../../vault-well.js";
import { MiraLight } from "../../vault-mira.js";
import { CrossingShot, RevealShot, VaultMemory } from "../../vault-memory.js";
import { VAULT_BEATS, beatClip, beatLine } from "../../vault-lines.js";
import { miraVoice } from "../../voice.js";
import { VaultClimbs } from "../../vault-climbs.js";
import { syncAxes } from "../../ice-axes.js";
import { equipmentFor } from "../../equipment.js";

// The seventh world: the builders' vault, reached after the last door. See vault.js for the
// layout. Six trials each wake a seal; the six medallions open the sealed door onto the
// builders' memory, and the next door in it closes the adventure.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MAX_HEALTH = 4;
// Light from the oculus: high, a little south and west, so faces towards the arrival are lit.
const KEY = V(-0.32, 1, 0.42).normalize();

export class VaultWorld {
  constructor(renderer, assets, services = {}) {
    Object.assign(this, { renderer, assets, services });
    this.scene = new THREE.Scene();
    this.world = new World();
    this.time = 0;
    this.active = false;
    this.health = MAX_HEALTH;
    this.said = new Set();
    this.entered = new Set();
    this.beatLog = [];
    this.gateCenter = V(RING.x, RING.dais + 3.5, RING.z);
    this.clipPlane = new THREE.Plane(V(0, 0, -1), RING.z - 0.05);
    this.waterEye = V();
    this.revealed = false;
    this.completed = false;
    this.beyond = false;
    this.doorOpen = 0;
  }

  get exit() {
    return this.memory.gate;
  }

  get gate() {
    return this.memory.gate;
  }

  get epilogue() {
    return this.memory.epilogue;
  }

  get breath() {
    return this.well?.breath;
  }

  async medallionProto() {
    this.proto ??= await this.assets.make("vault_medallion", {
      keepHierarchy: true,
    });
    return this.proto;
  }

  async build() {
    const s = this.scene;
    s.background = new THREE.Color(0x05060c);
    s.fog = new THREE.FogExp2(0x2a2026, 0.0065);
    this.fogColor = s.fog.color.clone();
    this.mat = vaultMaterials();
    this.masonry = new Masonry(this.world, this.mat);
    this.buildLights();
    this.hall = new VaultHall(this);
    await this.hall.build();
    this.climbs = new VaultClimbs(this);
    this.light = new LightTrial(this);
    this.keeper = new KeeperTrial(this);
    this.bridge = new BridgeTrial(this);
    this.ice = new IceTrial(this);
    this.bog = new BogTrial(this);
    this.well = new WellTrial(this);
    this.trials = [
      this.light,
      this.keeper,
      this.bridge,
      this.ice,
      this.bog,
      this.well,
    ];
    for (const trial of this.trials) {
      await trial.build();
      await this.assets.yieldWork?.();
    }
    this.memory = new VaultMemory(this);
    await this.memory.build();
    this.mira = new MiraLight(s);
    this.masonry.build(s);
    await this.assets.yieldWork?.();
    this.buildChannels();
    this.makeComposer();
  }

  buildLights() {
    const s = this.scene;
    const key = new THREE.DirectionalLight(0xffe7c8, 2.3);
    key.position.copy(KEY).multiplyScalar(60);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -22;
    sc.right = sc.top = 22;
    sc.near = 1;
    sc.far = 140;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    s.add(key, key.target);
    this.key = key;
    s.add(new THREE.HemisphereLight(0xe9cfa8, 0x3a2a22, 1.05));
    // A warm interior for metal and ice to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new THREE.Scene();
    room.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(10, 24, 12),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: /* glsl */ `varying vec3 vP; void main(){
            vec3 low = vec3(0.16, 0.1, 0.07), mid = vec3(0.62, 0.44, 0.3), high = vec3(0.95, 0.86, 0.72);
            vec3 c = mix(low, mid, smoothstep(-0.4, 0.2, vP.y));
            c = mix(c, high, smoothstep(0.55, 1.0, vP.y));
            gl_FragColor = vec4(c, 1.0); }`,
        }),
      ),
    );
    s.environment = pmrem.fromScene(room, 0.04).texture;
    s.environmentIntensity = 0.55;
    pmrem.dispose();
    // The oculus: a shaft of the light outside falling into the nave.
    this.shaftU = { uTime: { value: 0 } };
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(
        OCULUS.half * 0.9,
        OCULUS.half * 1.5,
        NAVE.top,
        4,
        1,
        true,
      ).translate(0, NAVE.top / 2, 0),
      new THREE.ShaderMaterial({
        uniforms: this.shaftU,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vView;
          void main(){ vUv = uv; vec4 p = modelViewMatrix * vec4(position, 1.0); vView = p.xyz; gl_Position = projectionMatrix * p; }`,
        fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; varying vec3 vView;
          void main(){
            float drift = 0.85 + 0.15 * sin(vUv.y * 18.0 - uTime * 0.5 + vUv.x * 9.0);
            float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
            float a = fade * drift * 0.05 * smoothstep(1.0, 6.0, length(vView));
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a, 1.0);
          }`,
      }),
    );
    shaft.position.set(0, 0, OCULUS.z);
    shaft.rotation.y = Math.PI / 4;
    shaft.renderOrder = 6;
    s.add(shaft);
  }

  // Channels of light let into the floor from each seal to the door; each lights along its
  // length when its seal wakes, and its medallion lights when the light arrives.
  buildChannels() {
    this.channels = [];
    const dormant = new THREE.MeshStandardMaterial({
      color: 0x1d5f63,
      roughness: 0.35,
      metalness: 0.2,
    });
    const shader = (uniforms) =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: /* glsl */ `attribute float along; varying float vAlong; varying vec2 vUv;
          void main(){ vAlong = along; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform float uProgress; uniform float uTime; varying float vAlong; varying vec2 vUv;
          void main(){
            float lit = step(vAlong, uProgress);
            float ahead = (vAlong - uProgress) * 60.0;
            float head = exp(-ahead * ahead) * step(uProgress, 0.999) * step(0.001, uProgress);
            float core = exp(-pow((vUv.x - 0.5) * 7.0, 2.0));
            float pulse = 0.75 + 0.25 * sin(vAlong * 160.0 - uTime * 6.0);
            vec3 c = vec3(0.22, 0.89, 0.82) * core * (lit * pulse * 1.5 + head * 6.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
    BAYS.forEach((bay, i) => {
      const trial = this.trials[i];
      const seal = trial.seal;
      const side = bay.side;
      const ez = (bay.entry[0] + bay.entry[1]) / 2;
      const lane = side * (5.2 - i * 0.35);
      const medal = this.hall.medallions[i];
      const points = [
        V(seal.x + seal.facing.x * 1.3, 0, seal.z + seal.facing.z * 1.3),
        V(side * 10.5, 0, ez),
        V(lane, 0, ez),
        V(lane, 0, DOOR.z + 2.2),
        V(medal.center.x * 0.55, 0, DOOR.z + 2.2),
      ];
      // The sea's seal lies at the bottom of its well: its channel starts at the well's mouth.
      if (bay.id === "sea") points[0] = V(15.5, 0, -52);
      if (bay.id === "isles")
        points.splice(1, 0, V(-21, 0, -27.6), V(-15, 0, -27.6));
      if (bay.id === "isles") points[0] = V(-21, 0, -27.6);
      const { geometry, length } = ribbon(points, 0.22);
      const inlay = new THREE.Mesh(ribbon(points, 0.14).geometry, dormant);
      inlay.position.y = 0.006;
      inlay.receiveShadow = true;
      this.scene.add(inlay);
      const uniforms = { uProgress: { value: 0 }, uTime: { value: 0 } };
      const glow = new THREE.Mesh(geometry, shader(uniforms));
      glow.position.y = 0.014;
      glow.renderOrder = 3;
      this.scene.add(glow);
      this.channels.push({
        uniforms,
        length,
        progress: 0,
        running: false,
        done: false,
      });
    });
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
    this.bloom = new UnrealBloomPass(size, 0.4, 0.5, 1.2);
    this.composer.addPass(this.bloom);
    this.waterPass = underwaterPass();
    this.composer.addPass(this.waterPass);
    this.composer.addPass(new OutputPass());
  }

  async wire({ hero, heroModel, follow, dust, state, palm }) {
    Object.assign(this, { hero, heroModel, follow, dust, state, palm });
    this.headJoint = heroModel.userData.joints?.head || null;
    const mesh =
      (await this.assets.make("sun_disc", { keepHierarchy: true })) ||
      fallbackDisc();
    this.disc = new SunDisc(mesh, this.world, this.services.sound);
    this.disc.scene = this.scene;
    for (const trial of this.trials) {
      this.disc.beams.push(...(trial.orbBeams?.() ?? []));
      this.disc.targets.push(...(trial.orbTargets?.() ?? []));
      trial.onDone = (t) => this.trialDone(t);
    }
    this.disc.targets.push(this.keeper.keeper);
    const hud = this.services.hud;
    this.bridge.onDark = (locked) =>
      this.once(locked ? "lens-locked" : "lens-dark", () =>
        hud?.hint(
          locked ? "Locked lens" : "Light",
          locked
            ? "A lock of light holds the lens. Break the crystal on the high shelf with the pistols."
            : `Only a charged pulse wakes the pylon. Link to the crystal with ${hud.k("throw")} first.`,
          7,
        ),
      );
    this.bridge.onUnlock = () =>
      hud?.subtitle("The lock breaks. The lens is free.", 3);
    this.ice.onPower = () => this.onBeat("power:frost");
    this.keeper.onStun = () =>
      this.once("keeper-quiet", () =>
        hud?.subtitle("Its eye is dark. The seal, now.", 3),
      );
    this.bog.onBurn = (bank) => {
      if (this.burning) return;
      this.burning = true;
      this.dust?.burst(this.hero.pos.x, -0.6, this.hero.pos.z, 1.5, 18);
      this.hero.spawn(bank.x, bank.z, 0, bank.yaw);
      this.follow.snap(this.hero);
      this.services.sound?.play("respawn");
      hud?.blackout("The spore water burns. Back to the bank.");
      this.damage();
      setTimeout(() => (this.burning = false), 300);
    };
    this.well.onDrown = () => this.hurt(this.hero.pos.x, this.hero.pos.z, 0);
    this.onComplete = this.services.onComplete;
  }

  hand() {
    const j = this.heroModel.userData.joints;
    return j.rightHand || j.rightLowerArm;
  }

  once(key, fn) {
    if (this.said.has(key)) return;
    this.said.add(key);
    fn();
  }

  // A line of the vault's script: Mira's spoken live from her light, Nyra's thoughts as text.
  onBeat(id) {
    this.beatLog.push(id);
    const beat = beatLine(id);
    if (!beat) return;
    const hud = this.services.hud;
    if (!beat.clip) return void hud?.subtitle(beat.text, beat.seconds);
    const line = {
      id: beat.clip,
      text: beat.text,
      mode: "live",
      seconds: beat.seconds,
    };
    // A new line takes over from one still being spoken.
    if (this.voice) {
      this.voice.stop();
      this.voice.say(line, hud);
    } else hud?.subtitle(line.text, line.seconds + 0.4, beat.speaker);
  }

  get voice() {
    const sound = this.services.sound;
    return sound ? miraVoice(sound) : null;
  }

  // The HUD's address shows six glyphs here, the door's whole address.
  addressSlots(count) {
    const row =
      typeof document !== "undefined" &&
      document.querySelector("#address .glyphs");
    if (!row) return;
    const slots = row.querySelectorAll(".glyph");
    for (let i = slots.length; i < count; i++) {
      const slot = document.createElement("span");
      slot.className = "glyph";
      slot.dataset.slot = String(i);
      slot.dataset.vault = "1";
      row.appendChild(slot);
    }
    if (count <= 3)
      row
        .querySelectorAll('.glyph[data-vault="1"]')
        .forEach((el) => el.remove());
    row.parentElement.dataset.slots = String(Math.max(3, count));
  }

  showAddress() {
    const hud = this.services.hud;
    this.addressSlots(6);
    hud?.setAddress(ADDRESS);
    this.trials.forEach((trial, i) => trial.done && hud?.light(ADDRESS[i]));
  }

  enter({ arrive = false, through = null } = {}) {
    this.active = true;
    const hero = this.hero;
    if (arrive || !through)
      hero.spawn(ARRIVAL.x, ARRIVAL.z, ARRIVAL.feet, ARRIVAL.yaw);
    hero.world = this.world;
    hero.swimVolume = this.well.volume;
    hero.ropes = this.bridge.ropes;
    // Nobody reaches the vault without Mira's axes, the relay's tether or its shield.
    hero.axes = true;
    const kit = equipmentFor(this.heroModel);
    kit?.grant("pull");
    kit?.grant("shield");
    hero.level = {
      interactables: () => this.interactables(),
      use: (ref) => ref.use?.(),
      moveBlock: (ref, dir, duration) =>
        ref.slides
          ? this.ice.moveBlock(ref, dir, hero)
          : this.light.moveBlock(ref, dir, duration),
      isMoving: (ref) =>
        ref.slides ? this.ice.isMoving(ref) : this.light.isMoving(ref),
      blockBox: (ref) => ref.box,
      turnMirror: (ref, delta) => this.light.turnMirror(ref, delta),
    };
    this.follow.world = this.world;
    this.follow.snap(hero);
    this.heroModel.removeFromParent();
    this.heroModel.visible = true;
    this.scene.add(this.heroModel);
    if (this.disc.state !== "held") this.disc.attach(this.hand(), this.palm);
    this.showAddress();
    this.services.hud?.health(this.health, MAX_HEALTH);
    this.mira.place(V(ARRIVAL.x - 1.2, ARRIVAL.feet + 2, ARRIVAL.z - 1.4));
    this.lastBay = null;
  }

  leave() {
    this.active = false;
    this.voice?.stop();
    this.hero.swimVolume = null;
    this.hero.ropes = null;
    syncAxes(this.hero);
    this.hero.swimming = false;
    if (this.hero.state === "swim") this.hero.state = "air";
    this.heroModel.visible = true;
    this.disc?.stow();
    this.addressSlots(3);
    this.services.hud?.hideHealth?.();
  }

  startStory() {
    this.storyT = 0;
    // Her lines are fetched while she speaks the first one.
    this.voice?.prepare(Object.keys(VAULT_BEATS).map(beatClip).filter(Boolean));
  }

  interactables() {
    return this.trials.flatMap((trial) => trial.interactables());
  }

  combatTargets() {
    return this.trials.flatMap((trial) => trial.combatTargets?.() ?? []);
  }

  headWater(hero) {
    return this.well.headWater(hero);
  }

  damage() {
    this.health = Math.max(0, this.health - 1);
    this.services.hud?.health(this.health, MAX_HEALTH);
    if (this.health <= 0) this.knockout();
  }

  hurt(x, z, force = 4) {
    const hero = this.hero;
    if (force && !hero.takeHit(x, z, force)) return;
    this.follow.shake = Math.max(this.follow.shake || 0, 0.45);
    this.services.sound?.play("hurt");
    this.damage();
  }

  // Out on the stone: back to the bay's door with full composure; the bay's trial waits.
  knockout() {
    const bay = this.lastBay ? BAYS.find((b) => b.id === this.lastBay) : null;
    const p = bay
      ? bay.refuge
      : { x: ARRIVAL.x, z: ARRIVAL.z - 3, yaw: ARRIVAL.yaw };
    const hero = this.hero;
    hero.spawn(p.x, p.z, 0, p.yaw);
    hero.invulnerable = 2;
    this.health = MAX_HEALTH;
    this.well.breath.reset();
    if (this.keeper.keeper.hostile) this.keeper.keeper.calm(null);
    this.services.hud?.health(this.health, MAX_HEALTH);
    this.services.sound?.play("respawn");
    this.services.hud?.blackout(
      bay?.id === "sea"
        ? "Out of air. Back at the well's steps."
        : "Knocked down. Back at the bay's door.",
    );
    this.follow.snap(hero);
    this.disc.charge = 0;
  }

  trialDone(trial) {
    const i = this.trials.indexOf(trial);
    this.hall.setMedallion(this.hall.signs[i], 1);
    this.services.hud?.light(ADDRESS[i]);
    this.services.hud?.clearHint();
    this.health = MAX_HEALTH;
    this.services.hud?.health(this.health, MAX_HEALTH);
    this.channels[i].running = true;
    this.onBeat(`done:${trial.id}`);
    this.services.sound?.play("chime", i);
    this.guideMira();
  }

  // Mira's light goes ahead to the first trial still asleep, or to the door when all are awake.
  guideMira() {
    const next = this.trials.find((t) => !t.done);
    const from = this.mira.group.position.clone();
    const points = [];
    const here = bayAt(from.x, from.z);
    const doorway = (bay) =>
      V(bay.side * 8.4, 3.0, (bay.entry[0] + bay.entry[1]) / 2);
    if (here) points.push(doorway(here));
    if (this.revealed) {
      points.push(V(0, 3, -60), V(0, 2.6, -73), V(-1.6, 3, -88));
    } else if (!next) points.push(V(0, 4.2, DOOR.z + 6));
    else {
      if (here !== next.bay) points.push(doorway(next.bay));
      points.push(next.bay.hover.clone());
    }
    this.mira.go(points);
    this.miraFor = next?.id ?? (this.revealed ? "next" : "door");
  }

  update(dt, hero, state, { throw: pressed, interact, camera }) {
    this.ambient(dt);
    const playable =
      !state.cinematic && !state.processing && state.mode === "play";
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
    const context = { interact: interact && playable, playable, camera };
    for (const trial of this.trials) trial.update(dt, hero, context);
    this.climbs.update(dt, hero);
    if (hero.state === "swing") this.frameSwing(dt, hero);
    this.updateChannels(dt);
    this.mira.update(dt, hero, { camera });
    this.voice?.alive();
    if (state.cinematic) return;
    this.story(dt, hero, state);
    this.guide(hero);
    if (
      this.revealed &&
      !this.completed &&
      this.memory.gate.isOpen &&
      this.memory.gate.crossed(hero)
    ) {
      this.completed = true;
      this.onBeat("crossing");
      this.onComplete?.();
    }
  }

  updateChannels(dt) {
    this.channels.forEach((ch, i) => {
      ch.uniforms.uTime.value = this.time;
      if (!ch.running || ch.done) return;
      ch.progress = Math.min(1, ch.progress + (dt * 9) / ch.length);
      ch.uniforms.uProgress.value = ch.progress;
      if (ch.progress >= 1) {
        ch.done = true;
        this.hall.setMedallion(this.hall.medallions[i], 1);
        this.services.sound?.play("medallion", i);
      }
    });
  }

  story(dt, hero, state) {
    this.storyT = (this.storyT ?? 0) + dt;
    const hud = this.services.hud;
    if (this.storyT > 1.6)
      this.once("arrival", () => {
        this.onBeat("arrival");
        this.guideMira();
      });
    if (this.storyT > 8 && hero.pos.z < 1)
      this.once("door", () => this.onBeat("door"));
    const bay = bayAt(hero.pos.x, hero.pos.z);
    if (bay && Math.abs(hero.pos.x) > 9.6) {
      this.lastBay = bay.id;
      const trial = this.trials[BAYS.indexOf(bay)];
      if (!this.entered.has(bay.id) && !trial.done) {
        this.entered.add(bay.id);
        this.onBeat(`bay:${bay.id}`);
        const [title, text] = trial.hint(hud);
        this.hintDue = { at: this.storyT + 4.8, title, text };
        if (this.miraFor === bay.id && !this.mira.moving)
          this.mira.go([bay.hover.clone()]);
      }
    }
    if (
      bay?.id === "forest" &&
      !this.bog.done &&
      hero.pos.x < POOL.minX &&
      hero.state === "ground"
    )
      this.once("bank:forest", () => this.onBeat("bank:forest"));
    if (this.hintDue && this.storyT >= this.hintDue.at) {
      hud?.hint(this.hintDue.title, this.hintDue.text, 9);
      this.hintDue = null;
    }
    // With the address whole, coming back to the door opens it; the trigger lies north of the
    // last bays' doorways, so leaving a bay never starts it.
    if (
      !this.revealed &&
      this.trials.every((t) => t.done) &&
      this.channels.every((c) => c.done) &&
      Math.abs(hero.pos.x) < 8 &&
      hero.pos.z < DOOR.z + 10 &&
      hero.state === "ground"
    )
      this.reveal(state);
  }

  reveal(state) {
    this.revealed = true;
    const hud = this.services.hud;
    hud?.clearHint();
    hud?.objective("", "");
    hud?.setMarkers([]);
    this.services.sound?.play("rumble");
    this.mira.go([
      V(0.8, 3.2, DOOR.z + 3),
      V(0, 3.4, DOOR.z - 4),
      V(-1.4, 4, -82),
    ]);
    state.cinematic = new RevealShot(this);
    this.onRevealed = () => {
      this.memory.phase = "open";
      this.guideMira();
    };
  }

  // The leaves part as `k` goes from 0 to 1; the slit and the grooves burn as they go.
  openDoor(k) {
    this.doorOpen = k;
    const { leaves, leafRest } = this.hall;
    for (const [name, leaf] of Object.entries(leaves)) {
      const side = name === "leafLeft" ? -1 : 1;
      leaf.position.copy(leafRest[name]);
      leaf.position.x += side * k * 3.95;
    }
    for (const m of this.hall.slitMats)
      m.emissiveIntensity = k > 0 ? 3 : this.allAwake ? 1.6 : 0.2;
    for (const m of this.hall.grooveMats)
      m.emissiveIntensity = Math.max(k, this.allAwake ? 0.6 : 0) * 2.4;
    this.hall.leafBox.solid = k < 0.8;
    this.hall.doorLight.intensity = k * 26;
  }

  get allAwake() {
    return this.channels?.every((c) => c.done);
  }

  guide(hero) {
    const hud = this.services.hud;
    let title,
      sub,
      point = null;
    const bay = bayAt(hero.pos.x, hero.pos.z);
    const trial = bay && this.trials[BAYS.indexOf(bay)];
    if (this.revealed) {
      title = "The next crossing";
      sub = "Walk through the new door with Mira";
      point = this.memory.gate.center.clone();
    } else if (trial && !trial.done && Math.abs(hero.pos.x) > 9.4) {
      ({ title, sub, point } = trial.guide(hero, this.disc));
    } else if (trial?.done && trial.after?.(hero)) {
      ({ title, sub, point } = trial.after(hero));
    } else if (this.trials.every((t) => t.done)) {
      title = "The sealed door";
      sub = this.allAwake
        ? "The address is whole: go back to the door"
        : "The last channel is carrying its light to the door";
      point = this.hall.doorCenter.clone();
    } else {
      const next = this.trials.find((t) => !t.done);
      const n = this.trials.filter((t) => t.done).length;
      title = "Wake the six seals";
      sub = `Seals awake: ${n} of 6 · follow Mira's light to ${next.bay.title.toLowerCase()}`;
      point = V(
        next.bay.side * 9.2,
        1.6,
        (next.bay.entry[0] + next.bay.entry[1]) / 2,
      );
    }
    hud?.objective(title, sub);
    const key = `${title}:${point ? `${point.x.toFixed(1)},${point.y.toFixed(1)},${point.z.toFixed(1)}` : ""}`;
    if (key !== this.guideKey) hud?.setMarkers(point ? [point] : []);
    this.guideKey = key;
  }

  // On the cable the camera turns to watch the arc from the side, as on the isles.
  frameSwing(dt, hero) {
    const follow = this.follow;
    if (!follow || follow.idle < 0.4 || !hero.pendulum) return;
    const d = hero.pendulum.dir;
    const heading = Math.atan2(d.x, d.y);
    const side = Math.sign(Math.sin(follow.yaw - heading)) || 1;
    const want = heading + side * 0.3;
    const turn = Math.atan2(
      Math.sin(want - follow.yaw),
      Math.cos(want - follow.yaw),
    );
    follow.yaw += turn * Math.min(1, dt * 1.6);
  }

  ambient(dt) {
    this.time += dt;
    this.shaftU.uTime.value = this.time;
    this.hall.update(dt, this.time);
    this.memory.update(dt);
    if (this.beyond) this.mira.group.visible = false;
  }

  followShadow(p) {
    const t = V(Math.round(p.x), Math.round(p.y), Math.round(p.z));
    this.key.target.position.copy(t);
    this.key.position.copy(t).addScaledVector(KEY, 60);
    this.key.target.updateMatrixWorld();
  }

  renderInto(renderer, camera) {
    renderer.render(this.scene, camera);
  }

  render(camera, dt) {
    if (!this.beyond) {
      this.memory.gate.renderPortal(camera);
      this.followShadow(
        this.hero
          ? V(this.hero.pos.x, this.hero.feet, this.hero.pos.z)
          : camera.position,
      );
    }
    this.pass.scene = this.beyond ? this.epilogue.scene : this.scene;
    this.pass.camera = camera;
    const water = this.beyond ? 0 : this.well.waterAt(camera.position);
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
      0.0065,
      0.07,
      this.cameraWater,
    );
    this.scene.fog.color.copy(this.fogColor).lerp(UNDERWATER, this.cameraWater);
    this.composer.render();
  }

  prepareForCompile(on) {
    this.climbs.prepareForCompile(on);
    prepareVisuals(this, on, [
      ...this.well.current.visuals(),
      ...this.bridge.prepareVisuals(),
      ...this.memory.prepareVisuals(),
    ]);
  }

  reset() {
    this.active = false;
    this.time = 0;
    this.storyT = 0;
    this.health = MAX_HEALTH;
    this.said.clear();
    this.entered.clear();
    this.beatLog = [];
    this.hintDue = null;
    this.revealed = false;
    this.completed = false;
    this.beyond = false;
    this.lastBay = null;
    this.miraFor = null;
    this.guideKey = null;
    for (const trial of this.trials) trial.reset();
    this.climbs.reset();
    this.channels?.forEach((ch) => {
      Object.assign(ch, { progress: 0, running: false, done: false });
      ch.uniforms.uProgress.value = 0;
    });
    for (const medal of [...this.hall.medallions, ...this.hall.signs]) {
      this.hall.setMedallion(medal, 0);
      medal.lit = 0;
    }
    this.memory.reset();
    this.openDoor(0);
    this.mira.group.visible = true;
    this.mira.place(V(ARRIVAL.x - 1.2, ARRIVAL.feet + 2, ARRIVAL.z - 1.4));
    if (this.heroModel) this.heroModel.visible = true;
    if (this.disc) {
      this.disc.charge = 0;
      if (this.disc.state !== "held" && this.disc.state !== "hidden")
        this.disc.stow();
    }
  }

  // Earlier chapters solved: nothing here carries over, the vault keeps its own puzzles.
  solve() {}

  resize(w, h) {
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.memory?.gate.resize();
  }

  finaleShot(hero, onDone) {
    return new CrossingShot(this, hero, onDone);
  }

  // What the last orb pulse struck, by name.
  pulseHits() {
    const names = new Map([
      [this.keeper.keeper, "keeper"],
      [this.keeper.well.target, "crystal:checkpoint"],
      [this.bridge.well.target, "crystal:isles"],
      [this.bridge.lensTarget, "lens"],
      [this.ice.block.target, "ice"],
    ]);
    return [...(this.disc?.hitThisThrow ?? [])].map(
      (t) => names.get(t) || "other",
    );
  }

  telemetry() {
    return {
      hits: this.pulseHits(),
      health: this.health,
      swimming: !!this.hero?.swimming,
      pendulum:
        this.hero?.state === "swing" && this.hero.pendulum
          ? {
              angle: this.hero.pendulum.angle,
              spin: this.hero.pendulum.spin,
            }
          : null,
      breath: this.well.telemetry().breath,
      revealed: this.revealed,
      completed: this.completed,
      beyond: this.beyond,
      doorOpen: +this.doorOpen.toFixed(2),
      beats: [...this.beatLog],
      mira: {
        at: this.mira.group.position.toArray().map((v) => +v.toFixed(2)),
        for: this.miraFor,
        moving: this.mira.moving,
      },
      channels: this.channels.map((c) => +c.progress.toFixed(2)),
      trials: Object.fromEntries(this.trials.map((t) => [t.id, t.telemetry()])),
      hall: this.hall.telemetry(),
      memory: this.memory.telemetry(),
      arrival: ARRIVAL,
    };
  }
}

const UNDERWATER = new THREE.Color(0x0b3a44);

// A flat strip along a path on the floor, with each vertex's fraction of the length.
function ribbon(points, width) {
  const pos = [],
    along = [],
    uv = [],
    idx = [];
  let total = 0;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    total += points[i].distanceTo(points[i - 1]);
    lengths.push(total);
  }
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 1)];
    const dir = next.clone().sub(prev).setY(0).normalize();
    const side = V(-dir.z, 0, dir.x).multiplyScalar(width / 2);
    for (const s of [-1, 1]) {
      const p = points[i].clone().addScaledVector(side, s);
      pos.push(p.x, p.y, p.z);
      along.push(lengths[i] / total);
      uv.push(s < 0 ? 0 : 1, lengths[i] / total);
    }
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return { geometry, length: total };
}

export default VaultWorld;
