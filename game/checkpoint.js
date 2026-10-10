import * as THREE from "three";
import { Warden, fallbackWarden } from "./wardens.js";
import { glyphMaterial, makeGlyph } from "./glyphs.js";
import { FaceBuilder, terrainMaterial } from "./terrain.js";
import { Stamps, Telegraphs } from "./fx.js";
import { draw } from "./glyph-icons.js";
import { StampReview } from "./stamp-review.js";

// The checkpoint beyond the first door. A wall closes the plateau; the only way on is a
// barrier beside a customs booth, and the clerk inside will not lift it without the
// destination address stamped on three plates set in the plaza. Stamps are applied by the
// Wardens, three of them, each stamp carved with one glyph of that address, and a Warden only
// stamps offenders, on the spot they stood. So the explorer offends (the confiscated Relay orb
// is right there), stands on a plate, and steps out from under the stamp; the matching Warden
// on the matching plate approves it. With the address complete, the barrier's lamp still has
// to be lit, and only an orb charged by linking to the crystal can do that.

export const LAYOUT = {
  booth: { x: -4, z: -31.4 },
  wall: { z: -31.4, half: 0.7, top: 3.2, from: -14, to: 14 },
  barrierFrom: -2.75,
  barrierTo: 1.6,
  bin: { x: -7.9, z: -29.0, yaw: 0.35 },
  emitter: { x: 12.6, z: -27.2 },
  beamEnd: -13.8,
  // The address, left to right: the exit door's medallions show it in the same order.
  plates: [
    { glyph: "crescent", x: -8, z: -19.5 },
    { glyph: "waves", x: 0, z: -22.8 },
    { glyph: "disc", x: 8, z: -19.5 },
  ],
  // Each Warden patrols away from its own plate, so it has to be led across the plaza.
  guards: [
    {
      glyph: "crescent",
      route: [
        [8.6, -24.6],
        [5.6, -17.2],
        [10.6, -15.6],
      ],
    },
    {
      glyph: "waves",
      route: [
        [-9.6, -24.4],
        [-5.8, -16.6],
        [-10.6, -15.4],
      ],
    },
    {
      glyph: "disc",
      route: [
        [-0.6, -27.6],
        [4.6, -26.8],
        [2.4, -25],
      ],
    },
  ],
  // The queue's posts run along z towards the window, three a side.
  queue: [-2.65, -5.35].flatMap((x) =>
    [-25.4, -26.8, -28.2].map((z) => [x, z]),
  ),
  respawn: { x: 0, z: -12, yaw: Math.PI },
  review: { x: -9.4, z: -12.8, scale: 0.82 },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MAX_HEALTH = 4;
const PROPERTY = "And don't touch the confiscated property. That's an offence.";

export class Checkpoint {
  constructor(
    scene,
    world,
    assets,
    { bubbles, sound, hud, discoverRelic, relicFound },
  ) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.bubbles = bubbles;
    this.sound = sound;
    this.hud = hud;
    this.reviewServices = { sound, hud, discoverRelic, relicFound };
    this.guards = [];
    this.plates = [];
    this.time = 0;
    this.lines = [];
    this.health = MAX_HEALTH;
    this.reset(false);
  }

  async build() {
    const L = LAYOUT;
    const put = async (name, x, z, yaw = 0, opts = {}) => {
      const o = await this.assets.make(name, opts);
      if (!o) return null;
      o.position.set(x, 0, z);
      o.rotation.y = yaw;
      this.scene.add(o);
      return o;
    };
    // The booth's origin is the middle of booth and arm together; its body sits 2.15 m
    // towards -X of it, so the placement shifts to put the body at LAYOUT.booth.
    this.booth =
      (await put("customs_booth", L.booth.x + 2.15, L.booth.z, 0, {
        keepHierarchy: true,
      })) || fallbackBooth(this.scene, L.booth);
    this.booth.updateMatrixWorld(true);
    const local = (p, fallback) =>
      p ? V(...p).applyMatrix4(this.booth.matrixWorld) : V(...fallback);
    this.windowPos = local(this.booth.userData.window?.center, [
      L.booth.x,
      1.4,
      L.booth.z + 0.6,
    ]);
    this.insidePos = local(this.booth.userData.inside, [
      L.booth.x,
      0.55,
      L.booth.z - 0.1,
    ]);
    this.barrier = this.booth.userData.joints?.barrier || null;
    this.lamp = this.booth.userData.parts?.lamp || null;
    this.lampMaterials = [];
    this.lamp?.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0x39e3d0);
      o.material.emissiveIntensity = 0.05;
      this.lampMaterials.push(o.material);
    });
    this.lampPos = V(0, 0, 0);
    if (this.lamp)
      new THREE.Box3().setFromObject(this.lamp).getCenter(this.lampPos);
    else this.lampPos.set(L.booth.x, 3.05, L.booth.z);
    this.lampLight = new THREE.PointLight(0x39e3d0, 0, 14, 1.6);
    this.lampLight.position.copy(this.lampPos).add(V(0, 0.3, 0.4));
    this.scene.add(this.lampLight);

    const w = this.world;
    // The booth, and the barrier's invisible wall until the arm lifts.
    w.add(
      L.booth.x - 1.2,
      -10,
      L.booth.z - 1.06,
      L.booth.x + 1.2,
      2.3,
      L.booth.z + 1.06,
      "rock",
      null,
      {
        grab: false,
      },
    );
    this.gateWall = w.add(
      L.barrierFrom,
      -10,
      L.wall.z - 0.25,
      L.barrierTo,
      3,
      L.wall.z + 0.25,
      "prop",
      null,
      { cam: false },
    );
    this.buildWall();

    this.bin =
      (await put("confiscation_bin", L.bin.x, L.bin.z, L.bin.yaw, {
        keepHierarchy: true,
      })) || fallbackBin(this.scene, L.bin);
    this.binBox = w.addRound(L.bin.x, L.bin.z, 0.62, -10, 0.85, "prop", null, {
      cam: false,
    });

    // The queue: posts along z with their ropes hooked to the next post towards the window.
    for (const [x, z] of L.queue) {
      // The post's own base sits 0.587 m towards -X of the asset's origin; turned so the rope
      // runs towards -Z, that is +Z of the origin.
      await put("queue_post", x, z - 0.587, Math.PI / 2);
      w.addRound(x, z, 0.18, -10, 1.0, "prop", null, {
        cam: false,
        thin: true,
      });
      if (z > -28)
        w.add(x - 0.05, -10, z - 1.4, x + 0.05, 0.95, z, "prop", null, {
          cam: false,
          thin: true,
        });
    }

    // The crystal's beam crosses the back of the plaza at head height and dies on the rock.
    const E = L.emitter;
    const emitter = await put("crystal_emitter", E.x, E.z, -Math.PI / 2, {
      keepHierarchy: true,
    });
    w.addRound(E.x, E.z, 0.62, -10, 2.1, "prop");
    const beamY = emitter?.userData.beam ? emitter.userData.beam[1] : 1.6;
    this.beam = {
      from: V(E.x - 0.4, beamY, E.z),
      to: V(L.beamEnd, beamY, E.z),
      active: () => true,
    };
    this.emitterPos = V(E.x, beamY, E.z);
    emitter?.userData.parts?.crystal?.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0x39e3d0);
      o.material.emissiveIntensity = 2.2;
    });
    const glow = new THREE.PointLight(0x39e3d0, 10, 9, 1.6);
    glow.position.set(E.x, beamY, E.z);
    this.scene.add(glow);
    this.buildBeam();

    await this.buildPlates();

    // Three Wardens on patrol, and the clerk on a step behind the counter.
    for (const [i, g] of L.guards.entries()) {
      const model =
        (await this.assets.make("warden", { keepHierarchy: true })) ||
        fallbackWarden();
      const [x, z] = g.route[0];
      const warden = new Warden(this.scene, this.world, model, {
        x,
        z,
        yaw: Math.PI,
        bubbles: this.bubbles,
        sound: this.sound,
        glyph: g.glyph,
        route: g.route,
      });
      warden.index = i;
      warden.onTelegraph = (wd, at) => this.telegraph(wd, at);
      warden.onProvoked = () => this.sound?.play("provoke");
      this.guards.push(warden);
    }
    const clerkModel =
      (await this.assets.make("warden", { keepHierarchy: true })) ||
      fallbackWarden();
    this.clerk = new Warden(this.scene, this.world, clerkModel, {
      x: this.insidePos.x,
      z: this.insidePos.z,
      yaw: 0,
      bubbles: this.bubbles,
      sound: this.sound,
      role: "clerk",
    });
    this.clerk.feet = this.insidePos.y;
    this.clerk.place();

    this.stamps = new Stamps(this.scene, ["crescent", "waves", "disc"], draw);
    this.telegraphs = new Telegraphs(this.scene, 3);
    this.review = new StampReview(this, this.reviewServices, LAYOUT.review);
    await this.review.build();
  }

  // The checkpoint wall: basalt coursed like the court's masonry, a chalk coping and a stamp
  // ochre band, drawn from the same boxes the explorer collides with.
  buildWall() {
    const L = LAYOUT;
    const basalt = terrainMaterial("masonry", 0x4a4552, 0.9);
    const chalk = new THREE.MeshStandardMaterial({
      color: 0xc9c2d8,
      roughness: 0.85,
    });
    chalk.name = "plaster";
    const ochre = new THREE.MeshStandardMaterial({
      color: 0xd9a441,
      roughness: 0.75,
    });
    ochre.name = "plaster";
    const faces = new FaceBuilder({ minX: -30, maxX: 30, minZ: -80, maxZ: 30 });
    const z0 = L.wall.z - L.wall.half,
      z1 = L.wall.z + L.wall.half;
    const spans = [
      [L.wall.from - 2, L.booth.x - 1.25],
      [L.barrierTo, L.wall.to + 2],
    ];
    for (const [x0, x1] of spans) {
      this.world.add(x0, -10, z0, x1, L.wall.top, z1, "rock", null, {
        grab: false,
      });
      faces.box(x0, -0.2, z0, x1, L.wall.top, z1, basalt, basalt);
      const cope = new THREE.Mesh(
        new THREE.BoxGeometry(x1 - x0, 0.18, z1 - z0 + 0.16),
        chalk,
      );
      cope.position.set((x0 + x1) / 2, L.wall.top + 0.09, L.wall.z);
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(x1 - x0, 0.22, 0.04),
        ochre,
      );
      band.position.set((x0 + x1) / 2, 2.35, z1 + 0.02);
      for (const m of [cope, band]) {
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
      }
    }
    faces.build(this.scene);
  }

  async buildPlates() {
    for (const p of LAYOUT.plates) {
      const mesh =
        (await this.assets.make("stamp_plate", { keepHierarchy: true })) ||
        fallbackPlate();
      mesh.position.set(p.x, 0, p.z);
      this.scene.add(mesh);
      mesh.updateMatrixWorld(true);
      const field = mesh.userData.field || { center: [0, 0.12, 0], size: 1.3 };
      const inlayMats = [];
      mesh.userData.parts?.inlay?.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0x39e3d0);
        o.material.emissiveIntensity = 0.15;
        inlayMats.push(o.material);
      });
      const glyphMat = glyphMaterial();
      glyphMat.emissiveIntensity = 0.25;
      const mark = makeGlyph(p.glyph, field.size * 0.62, glyphMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(
        field.center[0],
        field.center[1] + 0.005,
        field.center[2],
      );
      mesh.add(mark);
      // A low step the explorer and the Wardens walk onto, never a wall.
      this.world.addRound(p.x, p.z, 0.9, -10, 0.1, "prop", null, {
        stand: true,
        cam: false,
        thin: true,
      });
      this.plates.push({
        ...p,
        mesh,
        inlayMats,
        glyphMat,
        radius: 0.9,
        top: field.center[1],
        stamped: false,
      });
    }
  }

  // The beam crosses the plaza at chest height, right in front of the bin: where it passes
  // between the lens and the explorer it dims, or its glow and the bloom wash her out.
  buildBeam() {
    const { from, to } = this.beam;
    const len = from.distanceTo(to);
    const dir = to.clone().sub(from).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
    this.sight = V(0, -100, 0);
    const mk = (radius, color, opacity) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uSight = { value: this.sight };
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vBeamWorld;",
          )
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\nvBeamWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform vec3 uSight;\nvarying vec3 vBeamWorld;",
          )
          .replace(
            "#include <opaque_fragment>",
            `vec3 sightRay = uSight - cameraPosition;
            float sightT = dot(vBeamWorld - cameraPosition, sightRay) / max(dot(sightRay, sightRay), 1e-4);
            float sightGap = length(vBeamWorld - cameraPosition - sightRay * clamp(sightT, 0.0, 1.0));
            diffuseColor.a *= mix(0.12, 1.0, max(smoothstep(0.3, 0.9, sightGap), step(1.0, sightT)));
            #include <opaque_fragment>`,
          );
      };
      material.customProgramCacheKey = () => "fd-beam-sight";
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, len, 10, 1, true).translate(
          0,
          len / 2,
          0,
        ),
        material,
      );
      m.position.copy(from);
      m.quaternion.copy(q);
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    mk(0.02, new THREE.Color(0.8, 2.6, 2.4), 1);
    this.beamGlow = mk(0.09, new THREE.Color(0.15, 0.7, 0.65), 0.28);
  }

  // --- what the explorer can use here -------------------------------------------------------
  interactables() {
    const list = [...(this.review?.interactables() ?? [])];
    if (this.disc?.state === "display")
      list.push({
        kind: "use",
        box: this.binBox,
        ref: { use: () => this.takeDisc() },
        prompt: "take",
      });
    if (this.phase !== "arrive")
      list.push({
        kind: "use",
        box: this.windowBox || (this.windowBox = this.makeWindowBox()),
        ref: { use: () => this.talk() },
        prompt: this.review?.ready ? "relic:Take Mira's transit file" : "talk",
      });
    return list;
  }

  makeWindowBox() {
    const p = this.windowPos;
    return {
      shape: "box",
      minX: p.x - 0.8,
      maxX: p.x + 0.8,
      minZ: p.z - 0.2,
      maxZ: p.z + 0.3,
      minY: 0,
      maxY: 2.4,
    };
  }

  // Taken before the clerk is done, the briefing goes on after the shout, and the fight starts
  // at once: the objective, the health beads and the card about the stamps.
  takeDisc() {
    if (this.disc?.state !== "display") return false;
    this.lidKick = 1;
    this.tookDisc = true;
    this.lines = this.lines.filter((l) => l.text !== PROPERTY);
    const early = this.phase === "arrive" || this.phase === "briefing";
    if (this.phase === "arrive") this.brief();
    this.onTakeDisc?.();
    this.clerk.talking = 1.5;
    this.interject("HEY! That's confiscated property!", "shout", 2.4);
    this.sound?.play("alarm");
    // An offence in full view of every Warden on duty.
    if (early || this.phase === "stamps")
      setTimeout(() => {
        for (const g of this.guards) if (g.state === "patrol") g.provoke();
      }, 700);
    if (early) {
      this.phase = "stamps";
      this.phaseT = 0;
      this.onBriefed?.();
    }
    return true;
  }

  talk() {
    if (this.review?.ready) return this.review.claim();
    const lines = {
      briefing: ["One moment, please."],
      stamps: [
        "Three plates, three Wardens. Each stamp has its own glyph.",
        "Offend a Warden and it stamps you. Where you stand.",
        "The glyph over a Warden's head is the glyph on its stamp.",
      ],
      lamp: [
        "The barrier opens when its lamp is lit.",
        "Light. Lamp. Not my department.",
      ],
      open: ["Have a nice eternity.", "Next!"],
    }[this.phase] || ["Next!"];
    this.talkIndex = ((this.talkIndex ?? -1) + 1) % lines.length;
    this.interject(lines[this.talkIndex], "clerk", 3);
    return true;
  }

  // --- the clerk's lines: queued, one at a time --------------------------------------------------
  say(text, kind = "clerk", duration = 2.8, now = false) {
    if (now) this.lines = [];
    this.lines.push({ text, kind, duration, phase: this.phase });
    if (now) this.lineT = 0;
  }

  // A line that cannot wait cuts in; the queue goes on after it, the line it cut off first.
  interject(text, kind = "clerk", duration = 2.8) {
    if (this.lineT > 0.5 && this.current && !this.current.cut)
      this.lines.unshift(this.current);
    this.lines.unshift({ text, kind, duration, phase: this.phase, cut: true });
    this.lineT = 0;
  }

  brief() {
    if (!this.tookDisc) {
      this.say("Next!", "clerk", 1.6);
      this.say("Destination? …No address stamp? Denied.", "clerk", 3);
    }
    this.say("The address goes on those three plates. Stamped.", "clerk", 3.2);
    this.say("Stamps are applied by Wardens. To offenders.", "clerk", 3.2);
    if (!this.tookDisc) this.say(PROPERTY, "clerk", 3.4);
  }

  speak(dt) {
    this.lineT -= dt;
    if (this.lineT > 0 || !this.lines.length) return;
    const l = this.lines.shift();
    this.current = l;
    this.clerk.talking = Math.min(2, l.duration * 0.6);
    this.clerk.say(l.text, l.kind, l.duration);
    this.sound?.play("clerk");
    this.lineT = l.duration + 0.25;
  }

  // --- the stamps -------------------------------------------------------------------------------
  plateAt(x, z) {
    return (
      this.plates.find((p) => Math.hypot(p.x - x, p.z - z) < p.radius) || null
    );
  }

  telegraph(warden, at) {
    if (!at) return this.telegraphs.hide(warden);
    const plate = this.plateAt(at.x, at.z);
    const tone =
      this.review?.tone(warden, at) ??
      (!plate || plate.stamped
        ? "ground"
        : plate.glyph === warden.glyph
          ? "plate"
          : "void");
    const top = this.review?.contains(at.x, at.z)
      ? this.review.top
      : (plate?.top ?? 0);
    this.telegraphs.show(warden, at.x, top, at.z, tone, warden.windupDuration);
  }

  // A stamp has come down: on the explorer, on a plate, or on the ground.
  slam(warden, x, z, hit) {
    const plate = this.plateAt(x, z);
    this.onStrike?.(warden, x, z, hit);
    const reviewed = this.review?.slam(warden, x, z, hit);
    if (reviewed) return reviewed;
    if (plate && !plate.stamped) {
      if (plate.glyph === warden.glyph) {
        this.approve(plate);
        this.stamps.mark(x, plate.top, z, warden.glyph, "plate");
        return "plate";
      }
      this.stamps.mark(x, plate.top, z, warden.glyph, "void");
      this.sound?.play("void");
      this.voids = (this.voids || 0) + 1;
      if (this.voids === 1) {
        this.interject("Wrong stamp for that plate. Void.", "clerk", 2.6);
        this.onVoid?.();
      } else if (Math.random() < 0.4) this.interject("Void.", "clerk", 1.4);
      return "void";
    }
    this.stamps.mark(x, plate ? plate.top : 0, z, warden.glyph, "ground");
    return hit ? "hit" : "ground";
  }

  approve(plate) {
    plate.stamped = true;
    for (const m of plate.inlayMats) m.emissiveIntensity = 2.6;
    plate.glyphMat.emissiveIntensity = 3.2;
    this.sound?.play("plate");
    this.hud?.light(plate.glyph);
    this.onApproved?.(plate);
    const n = this.plates.filter((p) => p.stamped).length;
    const said = [
      "One stamp. Two to go.",
      "Two stamps. One more.",
      "Three stamps. …Approved.",
    ][n - 1];
    this.interject(said, "clerk", 2.6);
    if (n === 3) this.toLamp();
  }

  toLamp() {
    this.phase = "lamp";
    this.phaseT = 0;
    // Paperwork complete: everyone goes back to their rounds.
    for (const g of this.guards) g.calm(null);
    this.say("The barrier opens when its lamp is lit.", "clerk", 3);
    this.say("…The lamp's out. Not my department.", "clerk", 3.2);
    this.sound?.setMusic?.("world2");
  }

  // An orb pulse on the lamp: charged, the barrier lifts; otherwise a complaint.
  lampTarget() {
    return {
      radius: 0.5,
      center: () => this.lampPos,
      alive: () => this.phase === "lamp" && !this.lampLit,
      onHit: (disc) => {
        if (disc.charged) {
          this.lampLit = true;
          this.sound?.play("lamp");
          this.clerk.talking = 2;
          this.say("…Approved. Have a nice eternity.", "clerk", 3.4, true);
          setTimeout(() => this.sound?.play("barrier"), 1500);
          this.phase = "open";
          this.onOpen?.();
        } else {
          this.sound?.play("clink");
          this.interject(
            "That signal has no charge. The lamp needs light.",
            "clerk",
            3,
          );
          this.onLampMiss?.();
        }
      },
    };
  }

  // --- the frame ---------------------------------------------------------------------------------
  update(dt, hero, camera) {
    this.time += dt;
    this.phaseT += dt;
    const win = this.windowPos;
    const toWindow = Math.hypot(hero.pos.x - win.x, hero.pos.z - win.z);
    if (this.phase === "arrive" && (toWindow < 7.5 || this.phaseT > 45)) {
      this.phase = "briefing";
      this.phaseT = 0;
      this.brief();
    }
    this.sight.set(hero.pos.x, hero.feet + 1.3, hero.pos.z);
    if (this.phase === "briefing" && !this.lines.length && this.lineT <= 0) {
      this.phase = "stamps";
      this.phaseT = 0;
      this.onBriefed?.();
    }
    this.speak(dt);
    // The first expedition's belongings, recognised in the bin.
    if (
      !this.sawBin &&
      this.disc?.state === "display" &&
      Math.hypot(hero.pos.x - LAYOUT.bin.x, hero.pos.z - LAYOUT.bin.z) < 3.6
    ) {
      this.sawBin = true;
      this.onNearBin?.();
    }

    // The lamp lights, then the arm swings up and the way is clear.
    const lit = this.lampLit ? 1 : 0;
    for (const m of this.lampMaterials)
      m.emissiveIntensity +=
        (lit * 3.2 + 0.05 - m.emissiveIntensity) * Math.min(1, dt * 3);
    this.lampLight.intensity +=
      (lit * 14 - this.lampLight.intensity) * Math.min(1, dt * 3);
    if (this.phase === "open") {
      this.barrierOpen = Math.min(1, this.barrierOpen + dt / 1.6);
      if (this.barrierOpen > 0.5) this.gateWall.solid = false;
    }
    const k = this.barrierOpen * this.barrierOpen * (3 - 2 * this.barrierOpen);
    if (this.barrier) this.barrier.rotation.z = k * 1.35;
    // The bin's lid jumps when the orb is snatched out of it, then settles.
    const lid = this.bin?.userData.joints?.lid;
    if (lid) {
      if (this.lidRest === undefined) this.lidRest = lid.rotation.x;
      this.lidKick = Math.max(0, (this.lidKick || 0) - dt * 2.2);
      lid.rotation.x =
        this.lidRest - 0.55 * Math.sin(this.lidKick * Math.PI) * this.lidKick;
    }
    this.beamGlow.scale.x = this.beamGlow.scale.z =
      0.85 + Math.sin(this.time * 9) * 0.15;
    // Unstamped plates breathe; the one under a winding-up stamp brightens.
    for (const p of this.plates)
      if (!p.stamped) {
        const b = 0.15 + 0.1 * Math.sin(this.time * 2 + p.x);
        for (const m of p.inlayMats) m.emissiveIntensity = b;
        p.glyphMat.emissiveIntensity = 0.25 + b;
      }
    this.clerk.update(dt, hero, [], {});
    this.review?.update(dt, hero);
    const onSlam = (w, x, z, hit) => this.slam(w, x, z, hit);
    for (const g of this.guards) {
      if (this.phase === "lamp" || this.phase === "open")
        if (g.hostile && g !== this.review?.guard) g.calm(null);
      g.update(dt, hero, this.guards, { onSlam, camera });
    }
    this.telegraphs.update(dt);
    this.stamps.update(dt);
  }

  // The HUD's part: the objective, its markers and the one-time cards, from the phase.
  guide(hud, hero, disc) {
    if (this.review?.guide(hud)) return;
    const plateMarks = this.plates
      .filter((p) => !p.stamped)
      .map((p) => ({ at: V(p.x, 1.2, p.z), glyph: p.glyph }));
    const n = this.plates.filter((p) => p.stamped).length;
    let key = this.phase;
    if (this.phase === "stamps") {
      hud.objective(
        "Get the destination address stamped",
        disc.state === "display"
          ? `Plates stamped: ${n} of 3 · Wardens only stamp offenders`
          : `Plates stamped: ${n} of 3 · lure the matching Warden onto each plate`,
      );
      key += disc.state === "display" ? ":bin" : ":lure";
      if (this.guideKey !== key)
        hud.setMarkers(
          disc.state === "display"
            ? [V(LAYOUT.bin.x, 1.8, LAYOUT.bin.z), ...plateMarks]
            : plateMarks,
        );
    } else if (this.phase === "arrive" || this.phase === "briefing") {
      hud.objective("Get through the checkpoint", "Report to the booth");
      if (this.guideKey !== key)
        hud.setMarkers(
          this.phase === "arrive"
            ? [V(this.windowPos.x, 2, this.windowPos.z + 0.6)]
            : [],
        );
    } else if (this.phase === "lamp") {
      const charged = disc.charged;
      hud.objective(
        "Light the barrier lamp",
        disc.state === "display"
          ? "Take the relay orb from the confiscation bin"
          : charged
            ? "The orb is charged: aim at the lamp and pulse"
            : "Aim at the crystal and link to charge the orb",
      );
      key += disc.state === "display" ? ":bin" : charged ? ":lamp" : ":beam";
      if (this.guideKey !== key)
        hud.setMarkers([
          disc.state === "display"
            ? V(LAYOUT.bin.x, 1.8, LAYOUT.bin.z)
            : charged
              ? this.lampPos.clone().add(V(0, 0.6, 0))
              : this.emitterPos.clone().add(V(0, 0.8, 0)),
        ]);
    } else if (this.phase === "open") {
      const gate = this.exitGate;
      const open = !!gate?.isOpen;
      hud.objective(
        "Go through the far door",
        open ? "The door is open: step through it" : "The barrier is up",
      );
      key += open ? ":through" : ":exit";
      if (this.guideKey !== key)
        hud.setMarkers([
          open ? gate.center.clone().setY(gate.daisTop + 1.2) : this.exitMarker,
        ]);
    }
    this.guideKey = key;
    void hero;
  }

  // After a knockout: the case is closed, every Warden goes back to its rounds.
  calmAll() {
    this.review?.cancel();
    for (const g of this.guards) g.calm(null);
    this.telegraphs.clear();
  }

  reset(built = true) {
    this.phase = "arrive";
    this.phaseT = 0;
    this.lines = [];
    this.lineT = 0;
    this.current = null;
    this.lampLit = false;
    this.barrierOpen = 0;
    this.voids = 0;
    this.sawBin = false;
    this.tookDisc = false;
    this.talkIndex = -1;
    this.guideKey = null;
    this.health = MAX_HEALTH;
    this.review?.reset();
    if (!built) return;
    this.gateWall.solid = true;
    if (this.barrier) this.barrier.rotation.z = 0;
    for (const g of this.guards) g.reset();
    for (const p of this.plates) {
      p.stamped = false;
      for (const m of p.inlayMats) m.emissiveIntensity = 0.15;
      p.glyphMat.emissiveIntensity = 0.25;
    }
    this.stamps.clear();
    this.telegraphs.clear();
    for (const m of this.lampMaterials) m.emissiveIntensity = 0.05;
    this.lampLight.intensity = 0;
  }
}

// --- stand-ins until the generated assets load ----------------------------------------------
function fallbackBooth(scene, { x, z }) {
  const g = new THREE.Group();
  const basalt = new THREE.MeshStandardMaterial({
    color: 0x3a3531,
    roughness: 0.8,
  });
  const chalk = new THREE.MeshStandardMaterial({
    color: 0xc9c2d8,
    roughness: 0.85,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2), basalt);
  body.position.y = 1.2;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.05), chalk);
  panel.position.set(0, 0.6, 1.01);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0x1d5f63, roughness: 0.3 }),
  );
  lamp.position.y = 2.65;
  const pivot = new THREE.Group();
  pivot.position.set(1.4, 1.2, 0.2);
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xd9a441 }),
  );
  arm.position.x = 2;
  pivot.add(arm);
  g.add(body, panel, lamp, pivot);
  g.position.set(x, 0, z);
  g.userData.joints = { barrier: pivot };
  g.userData.parts = { lamp };
  scene.add(g);
  return g;
}

function fallbackBin(scene, { x, z, yaw }) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x3a3531 }),
  );
  m.position.y = 0.4;
  g.add(m);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  return g;
}

function fallbackPlate() {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.12, 40),
    new THREE.MeshStandardMaterial({ color: 0x2a2830, roughness: 0.85 }),
  );
  slab.position.y = 0.06;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.05, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0xc9c2d8, roughness: 0.8 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  const inlay = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.02, 4, 40),
    new THREE.MeshStandardMaterial({ color: 0x1d5f63, roughness: 0.3 }),
  );
  inlay.rotation.x = Math.PI / 2;
  inlay.position.y = 0.121;
  for (const o of [slab, rim, inlay]) {
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  g.userData.parts = { inlay };
  g.userData.field = { center: [0, 0.12, 0], size: 1.3 };
  return g;
}
