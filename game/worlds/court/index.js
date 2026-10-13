import * as THREE from "three";
import { World } from "../../world.js";
import { Level } from "../../level.js";
import { Beams } from "../../beams.js";
import { Gate } from "../../gate.js";
import { CourtStory } from "../../story.js";
import { CourtMirrors } from "../../court-mirrors.js";
import * as COURT from "../../court.js";
import { reach } from "../../store.js";
import { t } from "../../i18n.js";

// What the court's build makes, one after another: the level, its scenery, grass, door and relic.
const ASSETS = [
  "push_block",
  "sun_mirror",
  "glyph_stela",
  "temple_facade",
  "guardian_colossus",
  "broken_column",
  ...COURT.PROPS.map(([name]) => name),
  "meadow_grass",
  "expedition_rope",
  "brazier",
  "court_gallery",
  "far_gate",
  "field_scroll",
];

export default class CourtWorld {
  constructor(renderer, assets, services = {}) {
    Object.assign(this, { renderer, assets, services });
    this.scene = new THREE.Scene();
    this.world = new World();
    this.level = new Level(this.scene, this.world, assets);
    this.active = false;
  }

  get exit() {
    return this.gate;
  }

  async build() {
    const { scene, world, level, renderer, assets } = this;
    const { sound, hud, dust, state } = this.services;
    let beams, gate;
    assets.preload?.(ASSETS);
    await level.build();
    beams = new Beams(
      scene,
      world,
      level,
      COURT.LIGHT.source,
      COURT.LIGHT.height,
    );
    level.turnMirror = (mirror, delta) => {
      if (beams.turn(mirror, delta)) sound.play("lock");
    };
    gate = new Gate({ scene, world, renderer, sound, assets });
    await gate.build({ ...COURT.GATE, glyphs: ["twin", "spiral", "peak"] });
    gate.buildChannels(level.stelae);
    this.mirrors = new CourtMirrors(scene, renderer, level);
    gate.onOpen = () => {
      if (state.where === "court") sound.setMusic("court-open");
    };
    gate.onIgnition = () => {
      hud.flash(0.1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        dust.burst(
          gate.center.x + Math.cos(a) * 6,
          0,
          gate.center.z + 3 + Math.sin(a) * 3.2,
          1.6,
          6,
        );
      }
    };
    beams.onLit = (stela) => {
      sound.play("chime", stela.id);
      level.lightStela(stela);
      if (stela.memory) {
        hud.hint(
          t("The stone remembers"),
          t(
            "Read the awakened star to learn why the builders kept these doors open.",
          ),
          7,
        );
        return;
      }
      gate.feed(stela.id);
      hud.light(stela.glyph);
      if (level.stelae.every((s) => s.lit)) this.openGate();
    };

    Object.assign(this, { beams, gate });
  }

  async wire({ hero, heroModel, follow }) {
    Object.assign(this, { hero, heroModel, follow });
    this.mirrors.hero = heroModel;
    this.story = new CourtStory({
      hero,
      level: this.level,
      beams: this.beams,
      gate: this.gate,
      hud: this.services.hud,
    });
    for (const memory of this.level.memories) {
      memory.found = () => this.services.relicFound(memory.relic);
      memory.use = () => this.services.discoverRelic(memory.relic);
    }
    const N = COURT.NOTES;
    this.level.notes = {
      box: {
        shape: "box",
        minX: N.x - 0.5,
        maxX: N.x + 0.5,
        minZ: N.z - 0.5,
        maxZ: N.z + 0.5,
        minY: 8,
        maxY: 9.4,
      },
      use: () => this.services.openNotes(),
    };
  }

  enter() {
    this.active = true;
    const { hero, heroModel, scene, world, level, follow } = this;
    heroModel.removeFromParent();
    scene.add(heroModel);
    hero.world = world;
    hero.level = level;
    follow.world = world;
    this.services.hud.setAddress(["twin", "spiral", "peak"]);
    for (const stela of level.stelae)
      if (stela.lit) this.services.hud.light(stela.glyph);
  }

  leave() {
    this.active = false;
    this.mirrors.release();
  }

  releaseTargets() {
    this.mirrors.release({ captures: true });
  }

  startStory(id) {
    this.story.start(id);
  }

  openGate() {
    const { gate } = this;
    const { state } = this.services;

    // The camera leaves the explorer, frames the ring through the charge and the ignition,
    // pushes in as the membrane clears onto the other world, then hands back.
    gate.open(state, [
      { at: 0, eye: [8, -2.4, 17], look: [0, -2.2, 3] },
      { at: 1.7, eye: [6, -2.6, 16.5], look: [0, -0.6, 0] },
      { at: 5.1, eye: [3.5, -2.5, 13.5], look: [0, -0.4, 0] },
      // High enough to see over the stelae into the opened ring.
      { at: 8.4, eye: [3.4, -1.3, 10.2], look: [0, -0.9, -2] },
      { at: 9.2, eye: [3.2, -1.3, 9.8], look: [0, -0.9, -2] },
    ]);
  }

  solve() {
    const { level, gate } = this;

    for (const s of level.stelae) {
      s.lit = true;
      level.lightStela(s);
    }
    for (const ch of gate.channels.values()) {
      ch.running = ch.done = true;
      ch.progress = 1;
      ch.uniforms.uProgress.value = 1;
    }
    gate.forceOpen();
  }

  update(dt) {
    this.level.update(dt);
    this.beams.update(dt);
    this.gate.update(dt);
    this.story.update(dt);
    // Reaching the floor saves it as a start, so Continue skips the descent next time.
    const { state } = this.services;
    if (
      state.mode === "play" &&
      state.chapter === "court" &&
      this.story.index >= this.story.floorIndex
    ) {
      state.chapter = "floor";
      reach("floor");
    }
  }

  render(camera, dt) {
    const { renderer } = this;
    const { rig } = this.services;
    const reflection = this.mirrors.render(
      camera,
      this.active &&
        !this.services.state.intro &&
        !this.services.state.cinematic,
    );
    if (reflection) renderer.info.reset();
    this.gate.renderPortal(camera);
    const portal = rig.post ? { ...renderer.info.render } : null;
    rig.render(camera, dt);
    if (portal)
      for (const key of ["calls", "triangles", "lines", "points"])
        renderer.info.render[key] += portal[key];
    if (reflection)
      for (const key of ["calls", "triangles", "lines", "points"])
        renderer.info.render[key] += reflection[key];
  }

  renderInto(renderer, camera) {
    this.mirrors.withoutLive(() => renderer.render(this.scene, camera));
  }

  reset() {
    this.mirrors.reset();
    this.level.reset();
    for (const memory of this.level.memories)
      if (memory.found?.()) {
        memory.lit = true;
        this.level.lightStela(memory);
      }
    this.gate.reset();
  }

  resize(width, height) {
    this.services.rig.resize(width, height);
    this.gate.resize();
  }
}
