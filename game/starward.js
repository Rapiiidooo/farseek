import * as THREE from "three";
import { spaceGate } from "./space-gate.js";
import { prepareVisuals } from "./shader-preparation.js";
import { miraVoice, paceFor, LINE_GAP } from "./voice.js";
import { miraLine } from "./mira-scenes.js";
import { t } from "./i18n.js";
import {
  SPACE,
  asteroidField,
  brightStars,
  planet,
  spaceDust,
  spaceSky,
  starGlare,
} from "./space-vista.js";

const smooth = (t, a, b) => THREE.MathUtils.smoothstep(t, a, b);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The finale's timetable in seconds: Mira's light meets Nyra's and they circle while she
// speaks, then they move on together as the camera turns back to the gate behind the card.
const T = { enter: 4, meet: 7, circle: 10.5, part: 23.5, gone: 31.5, card: 28 };
const END = 33;
const SAID = [
  [9, "reunion-1"],
  [11.2, "reunion-2"],
  [16.2, "reunion-3"],
  [21.4, "reunion-4"],
];
const MEET = V(-2.6, 1.3, -19);
const MIRA_FROM = V(-3.4, 1.5, -27);
const ONWARD = V(0.4, 1.6, 3);
const Z_AXIS = V(0, 0, 1);

function glowTexture() {
  const data = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      const i = (y * 64 + x) * 4;
      data.set(
        [
          255,
          255,
          255,
          Math.round(Math.max(0, Math.exp(-r * r * 5) - Math.exp(-5)) * 255),
        ],
        i,
      );
    }
  const texture = new THREE.DataTexture(data, 64, 64);
  // Data textures sample their nearest texel by default: the close aura showed blocks.
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class Starward {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040712);
    this.active = false;
    this.stage = "off";
    this.time = 0;
    this.planets = [];
    this.gateCenter = new THREE.Vector3();
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.05);
    this.portal = spaceGate();
    this.scene.add(this.portal);
    this.scene.add(new THREE.HemisphereLight(0x8fa6d6, 0x120f1f, 0.7));
    const sun = new THREE.DirectionalLight(0xfff0dc, 4.2);
    sun.position.copy(SPACE.sun).multiplyScalar(60);
    this.scene.add(sun);
    const rim = new THREE.PointLight(0x49dbdd, 42, 16, 1.5);
    rim.position.set(0, 1, -2);
    this.scene.add(rim);
    this.card =
      typeof document === "undefined"
        ? null
        : document.getElementById("starward-card");
    let seed = 71831;
    const random = () =>
      ((seed = (Math.imul(1664525, seed) + 1013904223) | 0) >>> 0) / 4294967296;
    this.sky = spaceSky();
    this.stars = brightStars();
    this.glare = starGlare(SPACE.beacon);
    this.scene.add(this.sky, this.stars, this.glare);
    for (const options of [
      {
        name: "Ocean world",
        kind: 0,
        radius: 20,
        at: V(-40, 16, -115),
        tilt: 0.22,
        seed: 0.3,
      },
      {
        name: "Ringed world",
        kind: 1,
        radius: 36,
        at: V(-8, -77, 199),
        tilt: -0.3,
        seed: 2.1,
        ring: { span: [44, 64], turn: new THREE.Euler(1.25, 0.22, -0.38) },
      },
      {
        name: "Ember world",
        kind: 2,
        radius: 8,
        at: V(16, 28, 170),
        tilt: 0.1,
        seed: 5.7,
      },
      {
        name: "Pale moon",
        kind: 3,
        radius: 3.4,
        at: V(-14, 27, -92),
        seed: 8.2,
      },
      {
        name: "Far moon",
        kind: 3,
        radius: 3,
        at: V(-52, -40, 176),
        seed: 11.4,
      },
    ]) {
      const world = planet(options);
      this.scene.add(world);
      this.planets.push(world);
    }
    this.rocks = asteroidField();
    this.dust = spaceDust();
    this.scene.add(this.rocks, this.dust);
    const texture = glowTexture();
    this.wisp = new THREE.Group();
    this.wisp.name = "Nyra light form";
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 16, 12),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.6, 1.85, 0.6),
        fog: false,
        toneMapped: false,
      }),
    );
    this.aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: 0xffd995,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.aura.scale.setScalar(1.7);
    this.wisp.add(this.core, this.aura);
    this.particleSeeds = [];
    const cloudPositions = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++)
      this.particleSeeds.push([random(), random(), random()]);
    const cloudGeometry = new THREE.BufferGeometry();
    cloudGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(cloudPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.cloud = new THREE.Points(
      cloudGeometry,
      new THREE.PointsMaterial({
        map: texture,
        color: 0xffd9a0,
        size: 0.1,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.cloud.frustumCulled = false;
    this.wisp.add(this.cloud);
    this.scene.add(this.wisp);
    this.wisp.visible = false;
    // Mira's light: the warm white of a carried lantern, beside Nyra's gold.
    this.reply = new THREE.Group();
    this.reply.name = "Mira's answering light";
    this.replyCore = this.core.clone();
    this.replyCore.material = this.core.material.clone();
    this.replyCore.material.color.setRGB(2.3, 2, 1.6);
    this.replyAura = this.aura.clone();
    this.replyAura.material = this.aura.material.clone();
    this.replyAura.material.color.setHex(0xfff1e2);
    this.reply.add(this.replyCore, this.replyAura);
    this.reply.position.copy(MIRA_FROM);
    this.reply.visible = false;
    this.scene.add(this.reply);
    this.cameraProbe = new THREE.PerspectiveCamera();
    this.point = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.origin = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.pair = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.said = new Set();
  }

  prepareForCompile(on) {
    prepareVisuals(this, on, [
      [this.wisp, "visible", true],
      [this.reply, "visible", true],
    ]);
  }

  reset() {
    if (this.bloom) this.bloom.strength = this.originalBloom;
    if (this.heroModel && this.originalScale) {
      this.heroModel.scale.copy(this.originalScale);
      this.heroModel.position.copy(this.originalPosition);
      this.heroModel.visible = this.originalVisible;
    }
    this.heroModel = null;
    this.active = false;
    this.stage = "off";
    this.time = 0;
    this.scene.add(this.wisp);
    this.wisp.visible = false;
    this.reply.visible = false;
    this.replySeen = false;
    this.said.clear();
    this.mapCarried = false;
    if (this.card) this.card.hidden = true;
  }

  particles(time, collapse, space) {
    const p = this.cloud.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [a, b, c] = this.particleSeeds[i];
      const angle = a * Math.PI * 2 + time * (space ? 1.1 : 3);
      const radius = space
        ? 0.035 + b * b * 0.2
        : (0.1 + b * 0.25) * (1 - collapse) + 0.03;
      p.setXYZ(
        i,
        Math.cos(angle) * radius,
        space ? Math.sin(angle) * radius : (c - 0.5) * 1.8 * (1 - collapse),
        space ? c * c * 3.8 : Math.sin(angle) * radius,
      );
    }
    p.needsUpdate = true;
    this.core.scale.setScalar(0.94 + Math.sin(time * 3.3) * 0.06);
    this.aura.material.opacity = 0.75 + Math.sin(time * 2) * 0.12;
  }

  // Everything beyond the door moves on the shot's clock, so a skipped shot stays consistent.
  animate(time) {
    this.portal.userData.animate(time);
    this.rocks.userData.animate(time);
    this.stars.material.uniforms.uTime.value = time;
    this.dust.material.uniforms.uTime.value = time;
    for (let i = 0; i < this.planets.length; i++) {
      const world = this.planets[i];
      world.userData.uniforms.uTime.value = time;
      world.userData.body.rotation.y = time * (0.009 + i * 0.004);
    }
  }

  pixels(renderer) {
    const ratio = renderer?.getPixelRatio?.() ?? 1;
    this.stars.material.uniforms.uPixel.value = ratio;
    this.dust.material.uniforms.uPixel.value = ratio;
  }

  renderInto(renderer, camera) {
    this.pixels(renderer);
    const visible = this.portal.visible;
    this.portal.visible = false;
    renderer.render(this.scene, camera);
    this.portal.visible = visible;
  }

  // `onward`: the campaign goes on beyond this shot, so its closing card stays down.
  start(world, hero, onDone, { onward = false } = {}) {
    this.reset();
    this.closing = !onward;
    this.world = world;
    this.pixels(world.renderer);
    this.bloom = world.bloom;
    this.originalBloom = this.bloom?.strength;
    this.heroModel = world.heroModel;
    this.originalScale = this.heroModel.scale.clone();
    this.originalPosition = this.heroModel.position.clone();
    this.originalVisible = this.heroModel.visible;
    const gate = world.gate.center;
    this.origin.copy(gate);
    const reduced =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hud = world.services.hud;
    this.mapCarried = !!world.services.relicFound?.("tide-proof");
    hud?.clearHint();
    hud?.clearChapter();
    hud?.clearSubtitle();
    hud?.hideBoss();
    hud?.objective("", "");
    hud?.setMarkers([]);
    let source = null;
    let entered = false;
    let delivered = false;
    const entering = () => {
      if (entered) return;
      entered = true;
      this.active = true;
      this.heroModel.visible = false;
      this.scene.add(this.wisp);
      this.wisp.visible = true;
      world.services.sound?.setPlace("space");
      world.services.sound?.play("cross");
    };
    const sound = world.services.sound;
    const voice = sound ? miraVoice(sound) : null;
    voice?.prepare(SAID.map(([, id]) => this.lineId(id)));
    // A line longer than its place (another language's take) slows the finale until it ends.
    let pace = 1;
    let paceUntil = 0;
    const say = (id) => {
      const line = miraLine(this.lineId(id));
      if (voice) voice.say(line, hud);
      else hud?.subtitle(line.text, line.seconds + 0.4, t("Mira"));
      const index = SAID.findIndex(([, said]) => said === id);
      paceUntil = SAID[index + 1]?.[0] ?? T.part;
      pace = paceFor(
        paceUntil - SAID[index][0],
        (voice ? voice.length(line) : line.seconds) + LINE_GAP,
      );
    };
    const shot = {
      letterbox: true,
      skip: () => {
        voice?.stop();
        hud?.clearSubtitle();
        this.replySeen = true;
        for (const [, id] of SAID) this.said.add(id);
        this.time = Math.max(this.time, END);
      },
      update: (dt, camera) => {
        if (this.time >= paceUntil) pace = 1;
        this.time += dt * pace;
        const t = this.time;
        source ||= { p: camera.position.clone(), q: camera.quaternion.clone() };
        hero.vel.x = hero.vel.y = hero.vel.z = 0;
        this.animate(t);
        voice?.alive();
        if (t < 4) {
          this.stage = t < 1.5 ? "approach" : "crossing";
          this.heroModel.visible = t < 0.5;
          this.cameraProbe.position.copy(gate).add(this.point.set(0, -0.2, 7));
          this.cameraProbe.lookAt(
            this.target.copy(gate).add(this.point.set(0, 0, -12)),
          );
          const setup = smooth(t, 0, 1.5);
          camera.position.lerpVectors(
            source.p,
            this.cameraProbe.position,
            setup,
          );
          camera.quaternion.slerpQuaternions(
            source.q,
            this.cameraProbe.quaternion,
            setup,
          );
          if (t >= 1.5) {
            camera.position
              .copy(gate)
              .add(
                this.point.set(
                  0,
                  -0.2 * (1 - smooth(t, 1.5, 4)),
                  THREE.MathUtils.lerp(7, camera.near * 1.2, smooth(t, 1.5, 4)),
                ),
              );
            camera.lookAt(
              this.target.copy(gate).add(this.point.set(0, 0, -18)),
            );
          }
        } else {
          entering();
          this.stage =
            t < T.meet
              ? "arrival"
              : t < T.part
                ? "reunion"
                : t < END
                  ? "reveal"
                  : "credits";
          this.place(t, dt);
          if (t < T.meet) {
            const k = smooth(t, T.enter, T.meet);
            camera.position.set(0, k * 1.5, -12 * k - 0.01);
            camera.lookAt(this.target.set(0, 1.5, -80));
          } else this.frame(t, camera, reduced);
          this.particles(t, 1, true);
          this.wisp.visible = t < T.gone;
          this.reply.visible = t >= T.meet && t < T.gone;
          const answer = smooth(t, T.meet, 9);
          this.replyCore.scale.setScalar(
            answer * (0.94 + Math.sin(t * 2.6) * 0.06),
          );
          this.replyAura.scale.setScalar(1.55 * answer);
          this.replyAura.material.opacity = 0.72 + Math.sin(t * 2.1) * 0.1;
          if (t >= 8.2 && !this.replySeen) {
            this.replySeen = true;
            sound?.play("relic");
          }
          for (const [at, id] of SAID)
            if (t >= at && !this.said.has(id)) {
              this.said.add(id);
              say(id);
            }
          if (this.card)
            this.card.hidden = !this.closing || t < T.card || t >= END;
        }
        if (t >= END && !delivered) {
          delivered = true;
          if (this.card) this.card.hidden = true;
          voice?.release();
          hud?.clearSubtitle();
          onDone?.();
        }
      },
    };
    return shot;
  }

  lineId(id) {
    if (id !== "reunion-3") return id;
    return this.mapCarried ? "reunion-3a" : "reunion-3b";
  }

  // Nyra's light drifts out of the door; Mira's comes to meet it and they circle each
  // other, then go on together. Nyra's trail of motes streams behind her.
  place(t, dt) {
    const last = this.point.copy(this.wisp.position);
    const drift = (u, out) =>
      out.set(
        -1.2 - Math.max(0, u - T.enter) * 0.35,
        0.5 + Math.sin(u * 0.6) * 0.1,
        -2 - Math.max(0, u - T.enter) * 2.5,
      );
    if (t < T.meet) drift(t, this.wisp.position);
    else {
      const near = smooth(t, T.meet, T.circle);
      const onward = smooth(t, T.part, T.gone);
      this.pair.copy(MEET).lerp(ONWARD, onward);
      const a = (t - T.circle) * 1.35;
      const r = 0.95 * (1 - 0.4 * onward);
      const slot = (side, out) =>
        out
          .copy(this.pair)
          .add(
            this.target.set(
              side * Math.cos(a) * r,
              side * Math.sin(a * 2) * 0.1,
              side * Math.sin(a) * r,
            ),
          );
      drift(T.meet, this.eye);
      this.wisp.position.lerpVectors(this.eye, slot(1, this.aim), near);
      this.reply.position.lerpVectors(MIRA_FROM, slot(-1, this.aim), near);
      this.reply.position.y += Math.sin(t * 1.6) * 0.04;
    }
    const moved = last.sub(this.wisp.position).negate();
    if (dt > 0 && moved.lengthSq() > 1e-8) {
      this.heading ||= new THREE.Vector3(0, 0, 1);
      this.heading
        .lerp(moved.normalize().negate(), Math.min(1, dt * 3))
        .normalize();
      this.wisp.quaternion.setFromUnitVectors(Z_AXIS, this.heading);
    }
  }

  // Over Nyra's light towards Mira's as it comes, round the pair while they circle, then
  // back out to the slow orbit about the gate behind the card.
  frame(t, camera, reduced) {
    const eye = this.eye.copy(this.wisp.position).add(V(0.85, 0.5, 2.6));
    const look = this.aim.copy(this.reply.position);
    const theta = 1.05 + Math.max(0, t - T.circle) * (reduced ? 0 : 0.07);
    const distance = 3.8 - 0.6 * smooth(t, T.circle, T.part);
    const round = smooth(t, 9.4, 13.2);
    eye.lerp(
      V(
        this.pair.x + Math.sin(theta) * distance,
        this.pair.y + 0.75,
        this.pair.z + Math.cos(theta) * distance,
      ),
      round,
    );
    look.lerp(V(this.pair.x, this.pair.y + 0.05, this.pair.z), round);
    const from = smooth(t, T.meet, 8.6);
    eye.lerpVectors(V(0, 1.5, -12.01), eye, from);
    look.lerpVectors(V(0, 1.5, -80), look, from);
    const age = Math.max(0, t - T.part);
    const radius = Math.hypot(16, 22) + 40 * (1 - Math.exp(-age / 28));
    const angle = Math.atan2(-16, -22) + (reduced ? 0 : age * 0.009);
    const back = smooth(t, T.part, T.part + 4.5);
    eye.lerp(
      V(
        Math.sin(angle) * radius,
        6 + 3 * (1 - Math.exp(-age / 20)),
        Math.cos(angle) * radius,
      ),
      back,
    );
    look.lerp(this.gateCenter, back);
    camera.position.copy(eye);
    camera.lookAt(look);
  }

  telemetry() {
    return {
      active: this.active,
      stage: this.stage,
      time: this.time,
      replySeen: this.replySeen,
      said: [...this.said],
      mapCarried: this.mapCarried,
      worlds: this.planets.map((p) => p.name),
    };
  }
}
