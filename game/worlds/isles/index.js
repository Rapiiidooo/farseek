import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { World } from "../../world.js";
import { Isles, CAMP } from "../../isles.js";
import { SunDisc, fallbackDisc } from "../../disc.js";
import { progress, setPistols } from "../../store.js";
import { CampPractice } from "../../camp-practice.js";
import { equipmentFor } from "../../equipment.js";
import { equipmentSound } from "../../equipment-sound.js";
import { dressGate } from "../../gate-bases.js";
import { campScene } from "../../mira-scenes.js";
import { t } from "../../i18n.js";

// The third world and the third level: a sky at dawn over a sea of golden cloud, pale isles
// floating in it, and more rings of the network hanging in the distance. The checkpoint's far
// door opens onto the first isle, whose ring leads back; the explorer crosses the others on
// bridges of light (isles.js) to Mira's last camp and her ring. Given two glyphs of three,
// the ring opens halfway, onto the frozen reach (world-four.js).

// Low and off to the side, so the vista through the door is lit across rather than glaring.
const SUN = new THREE.Vector3(0.62, 0.2, -0.76).normalize();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class WorldThree {
  constructor(renderer, assets, services = {}) {
    this.renderer = renderer;
    this.assets = assets;
    this.services = services;
    this.scene = new THREE.Scene();
    this.world = new World();
    this.time = 0;
    this.active = false;
    this.gateCenter = new THREE.Vector3();
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.said = new Set();
  }

  get exit() {
    return this.isles.ring;
  }

  async build() {
    const s = this.scene;
    s.fog = new THREE.FogExp2(0xdcb690, 0.0016);
    s.background = new THREE.Color(0xdcb690);
    this.sky = this.buildSky();
    s.add(this.sky);
    const sun = new THREE.DirectionalLight(0xffd6a0, 3.6);
    sun.position.copy(SUN).multiplyScalar(80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -24;
    sc.right = sc.top = 24;
    sc.near = 1;
    sc.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);
    this.sun = sun;
    s.add(new THREE.HemisphereLight(0x9fb6e6, 0xe8b884, 1.25));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(this.buildSky());
    s.environment = pmrem.fromScene(envScene, 0.04).texture;
    s.environmentIntensity = 0.7;
    pmrem.dispose();

    this.buildClouds();
    await this.buildDistance();
    await this.buildDebris();
    this.isles = new Isles(s, this.world, this.assets, {
      ...this.services,
      renderer: this.renderer,
    });
    await this.isles.build();
    this.practice = new CampPractice(this.isles);
    await this.practice.build();
    this.mira = campScene(this);
    await this.buildArrival();
    this.makeComposer();
  }

  buildSky() {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: { uSun: { value: SUN } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec3 vDir; uniform vec3 uSun;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 horizon = vec3(1.0, 0.78, 0.55), mid = vec3(0.62, 0.66, 0.86), zenith = vec3(0.28, 0.36, 0.66);
            vec3 col = mix(horizon, mid, smoothstep(0.0, 0.3, h));
            col = mix(col, zenith, smoothstep(0.3, 0.95, h));
            float s = max(dot(d, uSun), 0.0);
            col += vec3(1.0, 0.66, 0.36) * pow(s, 8.0) * 0.45 + vec3(1.0, 0.9, 0.7) * pow(s, 90.0) * 0.9 + vec3(4.0, 3.5, 2.8) * pow(s, 2000.0);
            // Thin high streaks of cloud.
            float streak = sin(d.x * 40.0 + d.z * 13.0) * 0.5 + 0.5;
            col = mix(col, vec3(1.0, 0.86, 0.72), smoothstep(0.85, 1.0, streak) * smoothstep(0.05, 0.25, h) * (1.0 - smoothstep(0.35, 0.6, h)) * 0.35);
            col = mix(col, vec3(0.95, 0.76, 0.58), smoothstep(0.0, -0.1, h));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    dome.renderOrder = -10;
    g.add(dome);
    return g;
  }

  // A sea of cloud far below the isles, drifting.
  buildClouds() {
    this.cloudU = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uSun: { value: SUN } },
    ]);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.cloudU,
      fog: true,
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime; uniform vec3 uSun; varying vec3 vW;
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
        void main() {
          vec2 p = vW.xz * 0.012 + vec2(uTime * 0.004, uTime * 0.002);
          float c = fbm(p) * 0.7 + fbm(p * 3.1 - uTime * 0.01) * 0.3;
          float lit = smoothstep(0.35, 0.8, c);
          vec3 shade = vec3(0.86, 0.66, 0.52), top = vec3(1.0, 0.9, 0.74);
          vec3 col = mix(shade, top, lit);
          col += vec3(1.0, 0.7, 0.4) * pow(max(0.0, dot(normalize(vec3(uSun.x, 0.0, uSun.z)), normalize(vec3(vW.x, 0.0, vW.z)))), 12.0) * 0.25;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2),
      mat,
    );
    sea.position.y = -34;
    this.scene.add(sea);
  }

  // More isles and doors of the network, out towards the sun and below the path.
  async buildDistance() {
    const rings = [
      [-38, 14, -70, 1.1, 1.2, true],
      [46, -6, -95, 1.4, -0.6, true],
      [-12, 26, -160, 1.8, 0.2, true],
      [80, 30, -230, 2.4, -0.9, true],
      [-95, 8, -210, 2.0, 0.8, false],
      [20, -12, -40, 0.7, 2.1, false],
      [-24, -16, -30, 0.55, 1.2, false],
      [140, -4, -150, 1.6, 0.4, false],
      [-30, -10, -118, 1.2, 2.6, false],
      [42, 4, -128, 0.9, 1.4, false],
    ];
    for (const [x, y, z, s, yaw, withGate] of rings) {
      const o = (await this.assets.make("floating_isle")) || fallbackIsle();
      const top = o.userData.top ?? 10;
      o.scale.multiplyScalar(s);
      o.position.set(x, y - top * s, z);
      o.rotation.y = yaw;
      this.scene.add(o);
      if (!withGate) continue;
      const g = await this.assets.make("far_gate");
      if (!g) continue;
      await dressGate(g, "isles", this.assets);
      g.position.set(x, y, z);
      g.scale.setScalar(s * 0.8);
      g.rotation.y = yaw * 0.3;
      this.scene.add(g);
    }
  }

  // Small rocks adrift either side of the way, near enough to give the gulf its depth, each
  // bobbing on its own slow swell. One draw per material for all of them.
  async buildDebris() {
    const o = await this.assets.make("floating_isle");
    if (!o) return;
    o.updateMatrixWorld(true);
    let seed = 29;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.debris = [];
    for (let i = 0; i < 22; i++) {
      const z = -8 - rand() * 205,
        side = i % 2 ? 1 : -1;
      const along = (12 * -z) / 203;
      this.debris.push({
        x: along + side * (10 + rand() * 24),
        y: (9.2 * -z) / 203 + (rand() - 0.55) * 20,
        z,
        s: 0.05 + rand() * 0.11,
        yaw: rand() * 6.3,
        phase: rand() * 6.3,
      });
    }
    this.debrisMeshes = [];
    o.traverse((m) => {
      if (!m.isMesh) return;
      const inst = new THREE.InstancedMesh(
        m.geometry,
        m.material,
        this.debris.length,
      );
      inst.userData.local = m.matrixWorld.clone();
      inst.frustumCulled = false;
      this.scene.add(inst);
      this.debrisMeshes.push(inst);
    });
    this.placeDebris(0);
  }

  placeDebris(t) {
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      p = new THREE.Vector3(),
      k = new THREE.Vector3();
    (this.debris || []).forEach((d, i) => {
      p.set(d.x, d.y + Math.sin(t * 0.35 + d.phase) * 0.5, d.z);
      q.setFromAxisAngle(up, d.yaw + t * 0.02);
      m.compose(p, q, k.setScalar(d.s));
      for (const inst of this.debrisMeshes)
        inst.setMatrixAt(i, m.clone().multiply(inst.userData.local));
    });
    for (const inst of this.debrisMeshes || [])
      inst.instanceMatrix.needsUpdate = true;
  }

  // The far door's twin on the first isle. Its membrane is lit from the moment the explorer
  // arrives and seen only from the isle's side: walking back through it leads to the checkpoint.
  async buildArrival() {
    const { Gate } = this.services;
    this.arrival = new Gate({
      scene: this.scene,
      world: this.world,
      renderer: this.renderer,
      sound: this.services.sound,
      assets: this.assets,
      view: false,
    });
    // Set 12 cm into the isle: its dome falls away in front of the dais, and the first step
    // up must stay within a stride.
    const model = await this.assets.make("far_gate");
    if (model) model.position.y = -0.12;
    await this.arrival.build({
      x: 0,
      z: 5,
      glyphs: ["crescent", "waves", "disc"],
      model,
      base: "isles",
    });
    this.arrival.uniforms.uHasView.value = 0;
    this.arrival.disc.material.side = THREE.BackSide;
    this.arrival.lightScale = 0.25;
    this.arrival.forceOpen();
    this.gateCenter.copy(this.arrival.center);
    this.daisTop = this.arrival.daisTop;
    this.clipPlane.set(new THREE.Vector3(0, 0, -1), this.gateCenter.z - 0.05);
  }

  makeComposer() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    this.pass = new RenderPass(this.scene, new THREE.PerspectiveCamera());
    this.composer.addPass(this.pass);
    this.composer.addPass(new UnrealBloomPass(size, 0.4, 0.5, 1.2));
    this.composer.addPass(new OutputPass());
  }

  // --- the explorer's side: Mira's orb, hints and lines -------------------------------------
  async wire({ hero, heroModel, follow, dust, state, palm }) {
    this.hero = hero;
    this.heroModel = heroModel;
    this.follow = follow;
    this.dust = dust;
    this.state = state;
    this.palm = palm || null;
    this.equipment = equipmentFor(heroModel);
    this.isles.onRead = () => this.services.openNotes("mira");
    this.isles.onTakePistols = () => this.takePistols();
    const mesh =
      (await this.assets.make("sun_disc", { keepHierarchy: true })) ||
      fallbackDisc();
    this.disc = new SunDisc(mesh, this.world, this.services.sound);
    this.disc.scene = this.scene;
    for (const w of this.isles.wells) {
      this.disc.beams.push(w.beam);
      this.disc.targets.push(w.target);
    }
    for (const p of this.isles.pylons) this.disc.targets.push(p.target);
    this.disc.beams.push(this.isles.survey.beam);
    for (const station of this.isles.survey.stations)
      this.disc.targets.push(station.target);
    const hud = this.services.hud;
    this.isles.onWake = (pylon, fresh) => {
      if (!fresh) return;
      this.once("bridge", () => {
        hud.subtitle(t("The builders' bridges still answer to light."), 3.5);
        hud.hint(
          t("Bridges of light"),
          t(
            "A bridge holds for a few seconds, then fades from the pylon's end. Cross before it does.",
          ),
          8,
        );
      });
    };
    this.isles.onDark = () => {
      if (this.time - (this.darkAt ?? -99) < 12) return;
      this.darkAt = this.time;
      hud.hint(
        t("Light"),
        t(
          "Aim at a crystal and press {throw} to charge the orb, then pulse the pylon's lens.",
          { throw: hud.k("throw") },
        ),
        8,
      );
    };
  }

  // The orb rides in the right hand; with hand joints it sits in the palm.
  hand() {
    const j = this.heroModel.userData.joints;
    return j.rightHand || j.rightLowerArm;
  }

  once(key, fn) {
    if (this.said.has(key)) return;
    this.said.add(key);
    fn();
  }

  // --- entering and leaving ------------------------------------------------------------------
  enter({ through = null, arrive = false, back = null } = {}) {
    this.active = true;
    const hero = this.hero;
    if (back !== null) {
      // Back out of the frozen reach: in front of Mira's ring, facing the camp.
      const R = this.isles.ring;
      hero.spawn(R.center.x + back, R.center.z + 1.4, R.daisTop + 0.02, 0);
    } else if (through) {
      // Stepping through the far door: the same offset from its twin, still walking on.
      hero.pos.x = this.gateCenter.x + through.x;
      hero.pos.z = this.gateCenter.z + through.z;
      hero.feet = this.daisTop + through.feet;
      hero.safe = {
        x: this.gateCenter.x,
        z: this.gateCenter.z - 1.2,
        feet: this.daisTop + 0.02,
        yaw: Math.PI,
      };
    } else if (arrive) {
      const z = this.gateCenter.z - 4.4;
      hero.spawn(this.gateCenter.x, z, this.isles.groundAt(0, z), Math.PI);
    }
    if (back !== null || through || arrive)
      this.isles.on = back !== null ? "camp" : "arrival";
    hero.world = this.world;
    hero.ropes = this.isles.swings.ropes;
    hero.level = {
      interactables: () => [
        ...this.isles.interactables(),
        ...this.practice.interactables(),
      ],
      use: (ref) => ref.use(),
      moveBlock: () => false,
    };
    this.follow.world = this.world;
    this.follow.snap(hero);
    this.heroModel.removeFromParent();
    this.scene.add(this.heroModel);
    if (this.disc && this.disc.state !== "held")
      this.disc.attach(this.hand(), this.palm);
    this.syncPistols();
    const hud = this.services.hud;
    hud.setAddress(CAMP.glyphs);
    if (this.isles.read) for (const g of CAMP.glyphs) if (g) hud.light(g);
  }

  leave() {
    this.active = false;
    if (this.hero) this.hero.ropes = null;
    clearTimeout(this.ringTimer);
    this.ringTimer = null;
    if (this.practice.active) this.practice.stop();
    this.disc?.stow();
  }

  // The case shows whatever the explorer has not taken, whichever way she came to the camp.
  syncPistols() {
    const owned = !!this.equipment?.pistolsUnlocked;
    if (this.isles.pistolCase && this.isles.pistolCase.taken !== owned)
      this.isles.pistolCase.setTaken(owned);
  }

  // Mira's journal read: two glyphs light, and her ring opens once her pistols are in hand.
  readJournal() {
    const I = this.isles;
    if (I.read) return;
    I.read = true;
    I.guideKey = null;
    I.ring.ignite(0);
    setTimeout(() => I.ring.ignite(1), 450);
    const hud = this.services.hud;
    for (const g of CAMP.glyphs) if (g) hud.light(g);
    hud.objective("");
    hud.setMarkers([]);
    if (I.pistolsTaken) {
      hud.subtitle(t("Two glyphs of three. Then I'll find the third."), 4.2);
      this.openRingSoon(2200);
    } else
      hud.subtitle(
        t("Two glyphs of three. And her pistols, still in their case."),
        4.2,
      );
  }

  takePistols() {
    if (this.isles.pistolsTaken || !this.equipment?.acquirePistols())
      return false;
    setPistols(true);
    this.isles.pistolCase.setTaken(true);
    this.isles.guideKey = null;
    const sound = this.services.sound;
    equipmentSound(sound, "reload-belt", { level: 0.9 });
    equipmentSound(sound, "reload-rack", { delay: 0.32, pan: 0.2 });
    equipmentSound(sound, "reload-rack", { delay: 0.58, pan: -0.2 });
    this.services.hud.subtitle(
      this.isles.read
        ? t("Her pistols. Now, her ring.")
        : t("Mira's pistols, as she left them. I'll keep them close."),
      3.4,
    );
    if (this.isles.read) this.openRingSoon(1700);
    return true;
  }

  openRingSoon(delay) {
    clearTimeout(this.ringTimer);
    this.ringTimer = setTimeout(() => {
      this.ringTimer = null;
      if (this.state.mode === "play" && this.state.where === "three")
        this.openRing(this.state);
    }, delay);
  }

  startStory() {
    this.storyT = 0;
  }

  // Walking back through the ring the explorer came in by: its membrane leads to the checkpoint.
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

  // --- the frame -------------------------------------------------------------------------------
  update(dt, hero, state, { throw: throwPressed, camera }) {
    this.ambient(dt);
    this.debrisT = (this.debrisT || 0) + dt;
    this.placeDebris(this.debrisT);
    this.arrival.update(dt);
    this.isles.update(dt, hero);
    this.syncPistols();
    if (
      this.isles.read &&
      this.isles.pistolsTaken &&
      this.isles.ring.phase === "closed" &&
      this.ringTimer == null &&
      !state.cinematic
    )
      this.openRingSoon(1200);
    // The ring's cinematic hides the HUD: a pending control card waits until the shot ends.
    if (this.ringTimer != null && this.equipment?.briefing) {
      this.equipment.briefing = false;
      this.briefAfterRing = true;
    } else if (
      this.briefAfterRing &&
      this.ringTimer == null &&
      this.isles.ring.phase !== "closed" &&
      !state.cinematic
    ) {
      this.briefAfterRing = false;
      this.equipment.briefing = true;
    }
    this.practice.update(dt, hero);
    if (hero.state === "swing") this.frameSwing(dt, hero);
    if (!this.practice.guide(this.services.hud))
      this.isles.guide(this.services.hud, hero, this.disc);
    if (
      throwPressed &&
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
    this.story(dt, hero);
    this.mira.update(dt, hero, state);
  }

  story(dt, hero) {
    const hud = this.services.hud;
    const I = this.isles;
    const at = (...ids) => ids.includes(I.on);
    const arriving = at("arrival", "step1", "step2");
    this.storyT = (this.storyT ?? 0) + dt;
    if (arriving && this.storyT > 2)
      this.once("arrive", () =>
        hud.subtitle(t("Their trail goes on, across the isles."), 3.5),
      );
    if (arriving && this.storyT > 6.5)
      this.once("jump", () =>
        hud.hint(
          t("The isles"),
          t(
            "Take a run at each gap and jump. A fall returns you to the last isle you stood on.",
          ),
          8,
        ),
      );
    if (
      I.firstRope &&
      Math.hypot(hero.pos.x - I.firstRope.x, hero.pos.z - I.firstRope.z) < 4.5
    )
      this.once("rope", () =>
        hud.subtitle(
          t("A rope, snapped. They crossed these isles before me."),
          4,
        ),
      );
    if (at("step2"))
      this.once("swing", () => {
        hud.subtitle(
          t("Their swing rope still holds. That gap is too wide to jump."),
          4,
        );
        hud.hint(
          t("Rope swing"),
          t(
            "Run and jump to catch the rope. Push {forward} as you swing forward and {back} as you swing back to go higher, then {press} to let go over the far isle.",
            {
              forward: hud.keys("KeyW"),
              back: hud.keys("KeyS"),
              press: hud.press("jump"),
            },
          ),
          11,
          { queue: true },
        );
      });
    if (at("midway") && I.pylons.find((p) => p.id === "relay2")?.bridge.on)
      this.once("relay-swing", () =>
        hud.hint(
          t("Swing onto the light"),
          t(
            "The far bridge stops short of this isle. Swing from the rope and {press} to let go over the light.",
            { press: hud.press("jump") },
          ),
          9,
        ),
      );
    if (at("well", "gap"))
      this.once("pylons", () =>
        hud.hint(
          t("Pylons"),
          t(
            "Link to the crystal with {throw} to charge the orb, then aim at the pylon's lens and pulse.",
            { throw: hud.k("throw") },
          ),
          10,
        ),
      );
    if (at("pair", "rock"))
      this.once("pair", () =>
        hud.hint(
          t("One charge"),
          t(
            "The orb holds its charge for ten seconds: pulse both pylons, then cross both bridges.",
          ),
          9,
        ),
      );
    if (at("ledge", "ferry"))
      this.once("drift", () => {
        hud.subtitle(
          progress.relics.has("page")
            ? t(
                "Mira's loose page was right. This isle carries the way across.",
              )
            : t("A wandering isle. Their broken rope ends here."),
          4,
        );
        hud.hint(
          t("Drifting isles"),
          t(
            "Wait for the isle to drift close, then jump aboard. Jump off when it reaches the far isle.",
          ),
          9,
        );
      });
    if (at("far", "stone1", "stone2", "stone3"))
      this.once("stones", () =>
        hud.hint(
          t("Crumbling stones"),
          t(
            "Each stone gives way a moment after you land. Keep running and jump from one to the next.",
          ),
          9,
        ),
      );
    if (at("landing", "midway"))
      this.once("relay", () => {
        hud.subtitle(t("One glow, two pylons, and a bridge between them."), 4);
        hud.hint(
          t("Carry the light"),
          t(
            "Charge the orb, pulse the pylon and cross at once; pulse the far lens before the glow fades.",
          ),
          10,
        );
      });
    if (at("camp") && !I.read)
      this.once("camp", () => hud.subtitle(t("A camp. Mira's."), 3));
  }

  // On a rope the lens settles behind her and a little to the side, so the arc reads; a camera
  // the player turns is left alone.
  frameSwing(dt, hero) {
    const follow = this.follow;
    if (!follow || follow.idle < 0.4) return;
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

  // Clouds and light keep moving behind the closing shot and the credits.
  ambient(dt) {
    this.time += dt;
    this.cloudU.uTime.value = this.time;
  }

  renderInto(renderer, camera) {
    this.sky.position.copy(camera.position);
    renderer.render(this.scene, camera);
  }

  // The sun's shadow box follows the explorer from isle to isle.
  followShadow(p) {
    const t = V(Math.round(p.x), Math.round(p.y), Math.round(p.z));
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).addScaledVector(SUN, 80);
    this.sun.target.updateMatrixWorld();
  }

  render(camera) {
    // Mira's ring, once open, shows the frozen reach.
    this.isles.ring.renderPortal(camera);
    this.sky.position.copy(camera.position);
    this.followShadow(
      this.hero
        ? V(this.hero.pos.x, this.hero.feet, this.hero.pos.z)
        : camera.position,
    );
    this.pass.camera = camera;
    this.composer.render();
  }

  // Mira's journal read, two glyphs lit: the ring charges, ignites and opens halfway, its
  // membrane plain light, onto the frozen reach.
  openRing(state) {
    const R = this.isles.ring;
    if (R.phase !== "closed") return;
    R.onOpen = () =>
      this.services.hud.subtitle(
        t("Two glyphs of three, and still it opens. Onto ice."),
        4,
      );
    R.ignite(2);
    R.open(state, [
      { at: 0, eye: [7, -2, 13.5], look: [0, -0.6, 0] },
      { at: 2, eye: [5.5, -2.3, 11.5], look: [0, -0.2, 0] },
      { at: 5.4, eye: [3.2, -2.4, 9.6], look: [0, -0.4, -2] },
      { at: 8.6, eye: [2.6, -1.8, 8.4], look: [0, -0.6, -4] },
      { at: 9.2, eye: [2.5, -1.8, 8.2], look: [0, -0.6, -4] },
    ]);
  }

  // The isles as the explorer left them: Mira's journal read and her ring open onto the ice.
  solve() {
    const R = this.isles.ring;
    this.isles.read = true;
    R.forceOpen();
  }

  combatTargets() {
    return this.practice.stations.map((station) => station.target);
  }

  prepareForCompile(on) {
    this.isles.prepareForCompile(on);
    this.practice.prepareForCompile(on);
  }

  reset() {
    this.active = false;
    clearTimeout(this.ringTimer);
    this.ringTimer = null;
    this.briefAfterRing = false;
    this.isles.reset();
    this.syncPistols();
    this.practice.reset();
    this.arrival.forceOpen();
    this.said.clear();
    this.mira?.reset();
    this.storyT = 0;
    this.lastZ = undefined;
    if (this.disc) {
      this.disc.charge = 0;
      if (this.disc.state !== "held" && this.disc.state !== "hidden")
        this.disc.stow();
    }
  }

  resize(w, h) {
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.isles?.ring?.resize();
  }
}

// Until the generated isle arrives: a flat-topped stone with a hanging cone of rock.
function fallbackIsle() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 6.4, 1.2, 10),
    new THREE.MeshStandardMaterial({
      color: 0xeadcc0,
      roughness: 0.9,
      flatShading: true,
    }),
  );
  top.position.y = 9.4;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(6.4, 9, 10),
    new THREE.MeshStandardMaterial({
      color: 0x9b7658,
      roughness: 0.95,
      flatShading: true,
    }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = 4.4;
  for (const o of [top, cone]) {
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  g.userData.top = 10;
  return g;
}

export default WorldThree;
