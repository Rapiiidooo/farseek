import * as THREE from "three";
import { glyphMaterial, makeGlyph } from "./glyphs.js";
import { dressGate } from "./gate-bases.js";

const TURQUOISE = new THREE.Color(0x39e3d0);
// From the far_gate asset: groove radii and the medallions' clock positions.
const GROOVES = [3.775, 3.985, 4.195];
const MEDALLIONS = [
  ["medallionLeft", 210],
  ["medallionTop", 90],
  ["medallionRight", -30],
];
const CHARGE = 3.4,
  REVEAL = 3.2;
const SKY = new THREE.Color(0.55, 0.62, 0.66);
// Portal views in progress, and the explorer the doors keep in sight.
let nested = 0;
let watched = null;

export class Gate {
  static watch(hero) {
    watched = hero;
  }

  // Rings without a destination keep their liquid surface and a single-pixel target.
  constructor({ scene, world, renderer, sound, assets, view = true, hero }) {
    if (hero) watched = hero;
    this.scene = scene;
    this.hasView = view;
    this.renderScale = 1;
    this.viewInterval = 0;
    this.lastViewAt = -Infinity;
    this.cropView = false;
    this.projected = new THREE.Vector3();
    this.viewPosition = new THREE.Vector3();
    this.viewQuaternion = new THREE.Quaternion();
    this.world = world;
    this.renderer = renderer;
    this.sound = sound;
    sound?.addGate?.(this);
    this.assets = assets;
    this.channels = new Map();
    this.time = 0;
    this.destination = null;
    this.phase = "closed";
    this.phaseT = 0;
    this.lit = [false, false, false];
    const size = view
      ? renderer.getDrawingBufferSize(new THREE.Vector2())
      : new THREE.Vector2(1, 1);
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 2,
    });
    this.portalCam = new THREE.PerspectiveCamera();
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.sphere = new THREE.Sphere();
  }

  // `glyphs` are the address in medallion order (left, top, right). `model` may be passed
  // already built (the second world recolours its own); otherwise the asset is loaded.
  // `base` names the world whose ground the door stands on (see gate-bases.js); `depth`, when
  // given, is how far below its floor the base stays solid, for a door on a raised platform.
  async build({
    x,
    z,
    yaw = 0,
    glyphs,
    model,
    colliders = true,
    base = "court",
    depth,
  }) {
    model = model || (await this.assets.make("far_gate")) || fallbackGate();
    await dressGate(model, base, this.assets);
    model.position.set(x, model.position.y, z);
    model.rotation.y = yaw;
    this.scene.add(model);
    this.model = model;
    const portal = model.userData.portal || {
      center: [0, 4.5, 0],
      radius: 3.5,
    };
    const s = model.scale.x;
    this.center = new THREE.Vector3(
      x + portal.center[0] * s,
      model.position.y + portal.center[1] * s,
      z + portal.center[2] * s,
    );
    this.radius = portal.radius * s;
    this.daisTop = this.center.y - this.radius;
    this.parts = model.userData.parts || {};
    this.glyphs = glyphs;
    // Every glowing part gets its own material so it can light independently.
    this.litMaterials = new Map();
    for (const [name, node] of Object.entries(this.parts))
      node.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = TURQUOISE.clone();
        o.material.emissiveIntensity = 0;
        this.litMaterials.set(o, { name, glow: 0 });
      });
    if (colliders)
      gateColliders(
        this.world,
        x,
        z,
        this.daisTop,
        depth === undefined ? undefined : this.daisTop - depth,
      );
    // Each medallion carries one glyph of the address.
    this.medallionGlyphs = [];
    model.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
    MEDALLIONS.forEach(([part], i) => {
      const node = this.parts[part];
      // An address can be missing a glyph: its medallion stays blank.
      if (!node || !glyphs[i]) return;
      const box = new THREE.Box3().setFromObject(node).applyMatrix4(inverse);
      const c = box.getCenter(new THREE.Vector3());
      const mat = glyphMaterial();
      const mark = makeGlyph(glyphs[i], (box.max.x - box.min.x) * 0.72, mat);
      mark.position.set(c.x, c.y, box.max.z + 0.01);
      model.add(mark);
      this.medallionGlyphs[i] = mat;
    });
    this.buildPortal();
    this.buildEnergy();
    this.buildBlast();
    this.buildSparks();
    this.buildDust();
  }

  // --- the opening -------------------------------------------------------------------------
  buildPortal() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.uniforms = {
      uView: { value: this.target.texture },
      uRes: { value: size },
      uViewBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
      uFill: { value: 0 },
      uClear: { value: 0 },
      uTime: { value: 0 },
      uHasView: { value: 1 },
      uFlip: { value: 0 },
      uBack: { value: 1 },
      uSky: { value: SKY.clone() },
    };
    const mat = liquidMaterial(this.uniforms);
    // A world that turns a door round assigns BackSide: the membrane stays two-sided and
    // the face it names becomes the entrance, so no other program is ever compiled.
    Object.defineProperty(mat, "side", {
      get: () => THREE.DoubleSide,
      set: (side) => {
        this.uniforms.uFlip.value = side === THREE.BackSide ? 1 : 0;
      },
    });
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(this.radius - 0.02, 96),
      mat,
    );
    disc.position.copy(this.center);
    disc.visible = false;
    disc.renderOrder = 4;
    this.scene.add(disc);
    this.disc = disc;
    this.back = 1;
    this.backAt = 0;
    disc.onBeforeRender = (renderer, scene, camera) => {
      const target = renderer.getRenderTarget();
      if (target) this.uniforms.uRes.value.set(target.width, target.height);
      else renderer.getDrawingBufferSize(this.uniforms.uRes.value);
      this.uniforms.uRes.value.floor();
      const sky = scene.fog?.color ?? scene.background;
      this.uniforms.uSky.value.copy(sky?.isColor ? sky : SKY);
      this.uniforms.uBack.value = nested ? 0 : this.backFade(camera);
    };
    this.light = new THREE.PointLight(TURQUOISE, 0, 30, 1.5);
    this.light.position.copy(this.center).add(new THREE.Vector3(0, 0, 1.5));
    this.scene.add(this.light);
  }

  // Energy running round the three grooves on both faces, spreading from the medallions.
  buildEnergy() {
    this.energyU = {
      uFill: { value: 0 },
      uPower: { value: 0 },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.energyU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uFill; uniform float uPower; uniform float uTime; varying vec2 vP;
        float band(float r, float c) { float x = (r - c) * 26.0; return exp(-x * x); }
        void main() {
          float r = length(vP);
          float a = degrees(atan(vP.y, vP.x));
          float d = 360.0;
          for (int i = 0; i < 3; i++) {
            float m = i == 0 ? 90.0 : (i == 1 ? -30.0 : 210.0);
            float x = abs(mod(a - m + 540.0, 360.0) - 180.0);
            d = min(d, x);
          }
          float reach = uFill * 62.0;
          float lit = smoothstep(reach + 4.0, reach - 4.0, d);
          float ahead = (d - reach) / 3.0;
          float head = exp(-ahead * ahead) * step(0.02, uFill) * (1.0 - step(0.999, uFill));
          float bands = band(r, ${GROOVES[0].toFixed(3)}) + band(r, ${GROOVES[1].toFixed(3)}) + band(r, ${GROOVES[2].toFixed(3)});
          float flow = 0.65 + 0.35 * sin(radians(a) * 24.0 - uTime * 7.0 + r * 3.0);
          vec3 col = vec3(0.35, 1.6, 1.45) * bands * (lit * flow * 1.4 + head * 5.0) * uPower;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const geo = new THREE.RingGeometry(3.68, 4.3, 160, 1);
    this.energy = [];
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(this.center);
      m.position.z += side * 0.47;
      if (side < 0) m.rotation.y = Math.PI;
      m.renderOrder = 5;
      m.frustumCulled = false;
      this.scene.add(m);
      this.energy.push(m);
    }
  }

  buildBlast() {
    const flare = document.createElement("canvas");
    flare.width = flare.height = 128;
    const ctx = flare.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(160,236,226,0.5)");
    g.addColorStop(0.2, "rgba(90,224,209,0.3)");
    g.addColorStop(0.5, "rgba(60,206,192,0.12)");
    g.addColorStop(1, "rgba(40,200,190,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(flare);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: new THREE.Color(0.5, 0.85, 0.78),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        fog: false,
      }),
    );
    this.flash.position.copy(this.center);
    this.flash.renderOrder = 7;
    this.scene.add(this.flash);

    const waveMat = (width) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uRadius: { value: 1 },
          uAge: { value: 1 },
          uWidth: { value: width },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform float uRadius; varying vec2 vP;
          void main() { vP = position.xy * uRadius; gl_Position = projectionMatrix * modelViewMatrix * vec4(position * uRadius, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uRadius; uniform float uAge; uniform float uWidth; varying vec2 vP;
          void main() {
            float r = length(vP);
            float a = atan(vP.y, vP.x + 1e-6);
            float drift = sin(a * 5.0 + uAge * 9.0) * 0.55
              + sin(a * 9.0 - uAge * 13.0) * 0.25;
            float crest = r - uRadius * 0.9 + drift * uWidth * 0.6;
            float lead = crest / uWidth;
            float trail = (crest + uWidth * 1.8) / (uWidth * 0.7);
            float band = exp(-lead * lead)
              * (0.58 + 0.42 * sin(a * 7.0 + uAge * 6.0))
              + 0.18 * exp(-trail * trail);
            float fade = smoothstep(0.0, 0.12, uAge)
              * (1.0 - smoothstep(0.2, 1.0, uAge));
            gl_FragColor = vec4(vec3(0.08, 0.62, 0.54) * band * fade, 1.0);
          }`,
      });
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(1, 128),
      waveMat(0.24),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(
      this.center.x,
      this.daisTop - 0.93,
      this.center.z + 0.5,
    );
    this.ground.visible = false;
    this.ground.renderOrder = 6;
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
    this.ring = new THREE.Mesh(new THREE.CircleGeometry(1, 128), waveMat(0.16));
    this.ring.position.copy(this.center);
    this.ring.visible = false;
    this.ring.renderOrder = 6;
    this.ring.frustumCulled = false;
    this.scene.add(this.ring);
  }

  // Motes of the far world's light spilling from the rim; they blow outwards at ignition.
  buildSparks() {
    const count = 260;
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    geo.setAttribute("seed", new THREE.BufferAttribute(seeds, 3));
    this.sparkU = {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uBurst: { value: 0 },
      uRadius: { value: this.radius },
      uScale: { value: innerHeight * 0.5 },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: this.sparkU,
      vertexShader: /* glsl */ `
        attribute vec3 seed; uniform float uTime; uniform float uOpen; uniform float uBurst; uniform float uRadius; uniform float uScale;
        varying float vA;
        void main() {
          float life = fract(seed.x + uTime * (0.08 + seed.y * 0.1));
          float ang = seed.z * 6.2832 + life * (0.6 + seed.y);
          float r = uRadius * (0.92 + 0.14 * seed.y) + life * 0.8 + uBurst * (0.1 + seed.x * 0.38);
          vec3 p = vec3(cos(ang) * r, sin(ang) * r, life * (1.5 + seed.x * 3.0) + uBurst * (0.25 + seed.y * 0.4));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float depth = max(-mv.z, 0.05);
          // Motes brushing the lens would be bright blotches: capped, and gone up close.
          vA = uOpen * sin(life * 3.1416) * (0.5 + 0.5 * seed.z) * (1.0 + uBurst * 0.2)
            * smoothstep(0.4, 2.0, depth);
          gl_PointSize = min(24.0, (0.06 + seed.x * 0.08) * uScale / depth);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.5, 2.2, 2.0) * smoothstep(0.5, 0.0, d) * vA, 1.0);
        }`,
    });
    this.sparks = new THREE.Points(geo, mat);
    this.sparks.position.copy(this.center);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 6;
    this.scene.add(this.sparks);
  }

  // Grit shaken loose from the ring's crown while it charges.
  buildDust() {
    const count = 220;
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    geo.setAttribute("seed", new THREE.BufferAttribute(seeds, 3));
    this.dustU = {
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uScale: { value: innerHeight * 0.5 },
      uFloor: { value: -this.radius },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.dustU,
      vertexShader: /* glsl */ `
        attribute vec3 seed; uniform float uTime; uniform float uAmount; uniform float uScale; uniform float uFloor;
        varying float vA;
        void main() {
          float t = fract(seed.x + uTime * (0.55 + seed.y * 0.5));
          float ang = radians(20.0 + seed.z * 140.0);
          float r = 4.5 + seed.y * 0.2;
          vec3 p = vec3(cos(ang) * r * (0.7 + seed.x * 0.3), sin(ang) * r, (seed.y - 0.5) * 1.2);
          p.y -= 9.0 * t * t;
          p.x += (seed.x - 0.5) * t * 1.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float depth = max(-mv.z, 0.05);
          vA = uAmount * (1.0 - t) * step(uFloor, p.y) * smoothstep(0.4, 2.0, depth);
          gl_PointSize = min(24.0, (0.05 + seed.x * 0.06) * uScale / depth);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.78, 0.62, 0.44), smoothstep(0.5, 0.1, d) * vA * 0.8);
        }`,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.position.copy(this.center);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  // --- the floor channels from the stelae (first court only) -----------------------------------
  buildChannels(stelae) {
    const dormant = new THREE.MeshStandardMaterial({
      color: 0x1d5f63,
      roughness: 0.35,
      metalness: 0.2,
    });
    for (const s of stelae) {
      const z0 = s.z - 0.4,
        z1 = this.center.z + 3.05;
      const len = z0 - z1;
      const inlay = new THREE.Mesh(new THREE.PlaneGeometry(0.22, len), dormant);
      inlay.rotation.x = -Math.PI / 2;
      inlay.position.set(s.x, 0.012, (z0 + z1) / 2);
      inlay.receiveShadow = true;
      this.scene.add(inlay);
      const uniforms = { uProgress: { value: 0 }, uTime: { value: 0 } };
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, len),
        new THREE.ShaderMaterial({
          uniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: /* glsl */ `
            uniform float uProgress; uniform float uTime; varying vec2 vUv;
            void main() {
              float along = 1.0 - vUv.y;
              float lit = step(along, uProgress);
              float ahead = (along - uProgress) * 18.0, across = (vUv.x - 0.5) * 7.0;
              float head = exp(-ahead * ahead) * step(uProgress, 0.999);
              float core = exp(-across * across);
              float pulse = 0.75 + 0.25 * sin(along * 40.0 - uTime * 6.0);
              vec3 c = vec3(0.22, 0.89, 0.82) * core * (lit * pulse * 1.6 + head * 6.0);
              gl_FragColor = vec4(c, 1.0);
            }`,
        }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(s.x, 0.02, (z0 + z1) / 2);
      glow.renderOrder = 3;
      this.scene.add(glow);
      this.channels.set(s.id, {
        uniforms,
        progress: 0,
        running: false,
        done: false,
        slot: this.glyphs.indexOf(s.glyph),
        head: new THREE.Vector3(s.x, 0.3, z0),
        from: z0,
        to: z1,
      });
    }
  }

  feed(id) {
    const ch = this.channels.get(id);
    if (ch && !ch.running) ch.running = true;
  }

  // Lights one medallion and its glyph with a bright pulse; `quiet` leaves out its bell.
  ignite(slot, quiet = false) {
    if (this.lit[slot]) return;
    this.lit[slot] = true;
    this.glow(MEDALLIONS[slot][0], 1.6);
    const mark = this.medallionGlyphs[slot];
    if (mark) mark.emissiveIntensity = 3;
    this.pulse = 1;
    if (!quiet) this.sound?.play("medallion", slot);
    this.onIgnite?.(slot);
  }

  get allLit() {
    return this.lit.every(Boolean);
  }

  glow(partName, amount) {
    for (const [, v] of this.litMaterials)
      if (v.name === partName) v.glow = amount;
  }

  // The set piece. `shots` frame it; the gate hands back when the membrane has cleared.
  // It arms first: medallions still unlit either finish lighting through their channels or,
  // with `sequence`, ignite one after another; the charge starts once all three burn.
  open(state, shots, { sequence = false } = {}) {
    if (this.phase !== "closed") return;
    this.phase = "arming";
    this.phaseT = 0;
    this.sequence = sequence;
    this.disc.visible = true;
    if (state && shots) state.cinematic = new OpeningShot(this, shots);
  }

  // Skips straight to an open gate (a replay, or a cinematic skipped), in silence: worlds also
  // open their doors this way while they are built or solved out of sight.
  forceOpen() {
    for (let i = 0; i < 3; i++) if (!this.lit[i]) this.ignite(i, true);
    if (this.phase !== "open") this.onOpen?.();
    this.phase = "open";
    this.phaseT = 99;
    this.blastT = undefined;
    this.rumble = 0;
    this.disc.visible = true;
    this.uniforms.uFill.value = 1;
    this.uniforms.uClear.value = 1.02;
    this.ground.visible = this.ring.visible = false;
    this.flash.material.opacity = 0;
    this.sparkU.uBurst.value = 0;
  }

  get isOpen() {
    return this.phase === "open";
  }

  update(dt) {
    this.time += dt;
    this.phaseT += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    this.energyU.uTime.value = this.time;
    this.sparkU.uTime.value = this.time;
    this.dustU.uTime.value = this.time;
    for (const ch of this.channels.values()) {
      ch.uniforms.uTime.value = this.time;
      if (!ch.running || ch.done) continue;
      ch.progress = Math.min(1, ch.progress + dt / 1.6);
      ch.uniforms.uProgress.value = ch.progress;
      ch.head.z = ch.from + (ch.to - ch.from) * ch.progress;
      if (ch.progress >= 1) {
        ch.done = true;
        this.ignite(ch.slot);
      }
    }
    this.pulse = Math.max(0, (this.pulse || 0) - dt * 1.6);

    const phase = this.phase,
      t = this.phaseT;
    let power = 0,
      fill = 0,
      light = 0,
      dust = 0;
    if (phase === "arming") {
      if (this.sequence) {
        const next = this.lit.indexOf(false);
        if (next >= 0 && t > 0.5 + 0.55 * this.lit.filter(Boolean).length)
          this.ignite(next);
      }
      power = 0.3;
      if (this.allLit && t > 0.4) {
        this.phase = "charge";
        this.phaseT = 0;
        this.sound?.play("rumble");
      }
    } else if (phase === "charge") {
      const k = Math.min(1, t / CHARGE);
      fill = k;
      power = 0.6 + 0.6 * k;
      dust = Math.min(1, t / 0.8);
      light = 6 + 22 * k * k + Math.sin(this.time * 31) * 4 * k;
      this.rumble = k;
      if (t >= CHARGE) this.ignition();
    } else if (phase === "reveal") {
      const k = Math.min(1, t / REVEAL);
      fill = 1;
      power = 1.4 - 0.6 * k;
      dust = Math.max(0, 1 - t / 1.2);
      u.uFill.value = 1;
      u.uClear.value = smooth(0.12, 1, k) * 1.02;
      light = 30 + 18 * Math.max(0, 1 - t / 0.6);
      if (t >= REVEAL) {
        this.phase = "open";
        this.phaseT = 0;
        this.onOpen?.();
      }
    } else if (phase === "open") {
      fill = 1;
      power = 0.8;
      u.uFill.value = 1;
      u.uClear.value = 1.02;
      light = 30 + Math.sin(this.time * 2.3) * 3;
    }
    this.energyU.uFill.value = fill;
    u.uFill.value = fill;
    this.energyU.uPower.value = power;
    this.dustU.uAmount.value = dust;
    this.light.intensity = (light + this.pulse * 25) * (this.lightScale ?? 1);
    this.sparkU.uOpen.value = phase === "open" || phase === "reveal" ? 1 : 0;

    this.sparkU.uBurst.value = 0;
    if (this.blastT !== undefined) {
      this.blastT += dt;
      const b = this.blastT;
      this.flash.material.opacity =
        smooth(0, 0.06, b) * (1 - smooth(0.08, 0.45, b)) * 0.06;
      this.flash.scale.setScalar(1.5 + 2.8 * smooth(0, 0.3, b));
      const g = Math.min(1, b / 0.85);
      this.ground.visible = g < 1;
      this.ground.material.uniforms.uRadius.value =
        this.radius * (1 + 0.9 * smooth(0, 1, g));
      this.ground.material.uniforms.uAge.value = g;
      const r = Math.min(1, b / 0.9);
      this.ring.visible = r < 1;
      this.ring.material.uniforms.uRadius.value =
        this.radius * (1.02 + 0.33 * smooth(0, 0.85, r));
      this.ring.material.uniforms.uAge.value = r;
      this.ring.position.z =
        this.center.z + 0.12 + Math.sin(r * Math.PI) * 0.55;
      this.sparkU.uBurst.value =
        smooth(0, 0.08, b) * (1 - smooth(0.14, 0.65, b));
      if (b >= 0.9) this.blastT = undefined;
    }

    for (const [mesh, v] of this.litMaterials) {
      const target =
        v.name === "grooves"
          ? phase === "closed"
            ? 0
            : 0.4 + fill * 1.2
          : v.glow * (1 + this.pulse * 0.8);
      const m = mesh.material;
      m.emissiveIntensity +=
        (target - m.emissiveIntensity) * Math.min(1, dt * 4);
    }
  }

  ignition() {
    this.phase = "reveal";
    this.phaseT = 0;
    this.blastT = 0;
    this.rumble = 0;
    this.uniforms.uFill.value = 1;
    this.uniforms.uClear.value = 0;
    this.sound?.play("ignite");
    this.onIgnition?.();
  }

  // The far face of the membrane clears only while it stands between the camera and the
  // explorer, as when the camera trails her through the ring; it hides at once, returns softly.
  backFade(camera) {
    const now = performance.now();
    const elapsed = Math.min(0.1, (now - this.backAt) / 1000);
    this.backAt = now;
    let shown = 1;
    if (watched) {
      const c = this.center,
        eye = camera.position;
      const near = eye.z - c.z,
        far = watched.pos.z - c.z;
      if (near * far < 0) {
        const k = near / (near - far);
        const x = eye.x + (watched.pos.x - eye.x) * k - c.x,
          y = eye.y + (watched.feet + 1.1 - eye.y) * k - c.y;
        if (x * x + y * y < (this.radius + 0.5) ** 2) shown = 0;
      }
    }
    this.back =
      shown < this.back ? shown : Math.min(shown, this.back + elapsed * 2.5);
    return this.back;
  }

  // Crossing the ring plane inside the opening, going through it towards -Z.
  crossed(hero) {
    watched = hero;
    if (!this.isOpen) return false;
    const inside =
      Math.abs(hero.pos.x - this.center.x) < this.radius - 0.9 &&
      hero.feet > this.daisTop - 0.3 &&
      hero.feet < this.daisTop + 2;
    const was = this.lastZ ?? hero.pos.z;
    this.lastZ = hero.pos.z;
    return inside && was >= this.center.z && hero.pos.z < this.center.z;
  }

  renderPortal(camera) {
    if (!this.hasView || !this.destination || !this.disc.visible) return;
    if (this.uniforms.uClear.value <= 0) return;
    // Only draw the far world when the window is on screen and seen from its front.
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(
      this.viewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    this.sphere.set(this.center, this.radius);
    if (
      !this.frustum.intersectsSphere(this.sphere) ||
      camera.position.z < this.center.z - 0.5
    )
      return;
    if (
      this.phase === "open" &&
      !this.viewPose &&
      this.lastDestination === this.destination &&
      camera.position.distanceToSquared(this.center) >
        (this.radius * 2.5) ** 2 &&
      camera.position.distanceToSquared(this.viewPosition) < 0.09 &&
      Math.abs(camera.quaternion.dot(this.viewQuaternion)) > 0.9998 &&
      performance.now() - this.lastViewAt < this.viewInterval
    )
      return;
    this.renderView(camera);
  }

  viewRegion(camera) {
    const { width, height } = this.target;
    if (width < 8 || height < 8) return null;
    camera.updateMatrixWorld();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          const point = this.projected.set(
            this.center.x + x * this.radius,
            this.center.y + y * this.radius,
            this.center.z + z * this.radius,
          );
          point.applyMatrix4(camera.matrixWorldInverse);
          if (point.z >= -camera.near) return null;
          point.applyMatrix4(camera.projectionMatrix);
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
    const padX = Math.ceil(width * 0.04 + 3),
      padY = Math.ceil(height * 0.04 + 3);
    const left = Math.max(0, Math.floor((minX + 1) * width * 0.5) - padX),
      bottom = Math.max(0, Math.floor((minY + 1) * height * 0.5) - padY),
      right = Math.min(width, Math.ceil((maxX + 1) * width * 0.5) + padX),
      top = Math.min(height, Math.ceil((maxY + 1) * height * 0.5) + padY);
    if (right <= left || top <= bottom) return null;
    return new THREE.Vector4(left, bottom, right - left, top - bottom);
  }

  // Draws the destination from the matching viewpoint into the portal's target. Also used at
  // load time so every shader the view needs is compiled before play. A `viewPose` (a pose in
  // the destination's own frame) takes over the viewpoint: with the membrane filling the
  // frame, the camera then travels on through the world beyond.
  renderView(camera) {
    const d = this.destination;
    if (!d || d.gpuResident === false) return;
    const cam = this.portalCam;
    cam.copy(camera);
    if (cam.view?.enabled) cam.clearViewOffset();
    const region =
      this.cropView && !this.viewPose ? this.viewRegion(cam) : null;
    if (this.viewPose) {
      cam.position.copy(this.viewPose.position);
      cam.quaternion.copy(this.viewPose.quaternion);
    } else cam.position.sub(this.center).add(d.gateCenter);
    if (region)
      cam.setViewOffset(
        this.target.width,
        this.target.height,
        region.x,
        this.target.height - region.y - region.w,
        region.z,
        region.w,
      );
    cam.updateMatrixWorld();
    d.beforeRender?.(cam);
    const r = this.renderer;
    const prevTarget = r.getRenderTarget(),
      prevPlanes = r.clippingPlanes;
    const viewport = this.target.viewport.clone();
    if (region)
      this.uniforms.uViewBounds.value.set(
        region.x / this.target.width,
        region.y / this.target.height,
        (region.x + region.z) / this.target.width,
        (region.y + region.w) / this.target.height,
      );
    else this.uniforms.uViewBounds.value.set(0, 0, 1, 1);
    if (region) this.target.viewport.copy(region);
    r.setRenderTarget(this.target);
    r.clippingPlanes = [d.clipPlane];
    nested++;
    try {
      d.renderInto(r, cam);
      this.lastDestination = d;
      this.lastViewAt = performance.now();
      this.viewPosition.copy(camera.position);
      this.viewQuaternion.copy(camera.quaternion);
    } finally {
      nested--;
      this.target.viewport.copy(viewport);
      r.clippingPlanes = prevPlanes;
      r.setRenderTarget(prevTarget);
    }
  }

  setQuality(scale, samples, interval = 0) {
    this.cropView = scale < 1;
    this.renderScale = scale;
    this.viewInterval = interval;
    if (this.target.samples !== samples) {
      this.target.samples = samples;
      this.target.dispose();
    }
    this.resize();
  }

  resize() {
    this.lastViewAt = -Infinity;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.hasView)
      this.target.setSize(
        Math.max(1, Math.round(size.x * this.renderScale)),
        Math.max(1, Math.round(size.y * this.renderScale)),
      );
    this.uniforms.uRes.value.copy(size);
  }

  reset() {
    this.lastViewAt = -Infinity;
    this.phase = "closed";
    this.phaseT = 0;
    this.viewPose = null;
    this.lit = [false, false, false];
    this.pulse = 0;
    this.blastT = undefined;
    this.rumble = 0;
    this.lastZ = undefined;
    for (const ch of this.channels.values()) {
      ch.progress = 0;
      ch.running = ch.done = false;
      ch.uniforms.uProgress.value = 0;
    }
    for (const [mesh, v] of this.litMaterials) {
      v.glow = 0;
      mesh.material.emissiveIntensity = 0;
    }
    for (const m of this.medallionGlyphs) if (m) m.emissiveIntensity = 0;
    this.uniforms.uFill.value = 0;
    this.uniforms.uClear.value = 0;
    this.uniforms.uViewBounds.value.set(0, 0, 1, 1);
    this.sequence = false;
    this.disc.visible = false;
    this.flash.material.opacity = 0;
    this.ground.visible = this.ring.visible = false;
    this.sparkU.uBurst.value = 0;
    this.light.intensity = 0;
  }
}

const PORTAL_FS = /* glsl */ `
  uniform sampler2D uView; uniform vec2 uRes; uniform vec4 uViewBounds;
  uniform float uFill; uniform float uClear; uniform float uTime; uniform float uHasView;
  uniform float uFlip; uniform float uBack; uniform vec3 uSky; uniform float uGlow;
  varying vec2 vUv; varying vec3 vEye;
  // Thin bright filaments where three drifting waves cancel, like light focused by ripples.
  float caustic(vec2 q, float t) {
    vec2 w = q + vec2(sin(q.y * 1.3 + t * 0.7), sin(q.x * 1.1 - t * 0.6)) * 0.55;
    float v = sin(w.x * 1.9 + t * 0.8) + sin(w.y * 2.3 - t * 0.65)
      + sin((w.x - w.y) * 1.4 + t * 0.45);
    return pow(max(0.0, 1.0 - abs(v) * 0.42), 7.0);
  }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    vec2 bend = vec2(p.y * 3.0 + uTime * 0.18, p.x * 2.7 - uTime * 0.15);
    vec2 q = p + sin(bend) * 0.13;
    vec4 waves = vec4(
      dot(q, vec2(0.94, 0.34)) * 9.0 - uTime * 1.7,
      dot(q, vec2(-0.48, 0.87)) * 13.5 + uTime * 1.35,
      dot(q, vec2(0.22, -0.97)) * 23.0 - uTime * 2.3,
      dot(q, vec2(0.76, 0.65)) * 35.0 + uTime * 2.65
    );
    vec4 slopes = cos(waves) * vec4(0.243, 0.2565, 0.207, 0.1575);
    float height = dot(sin(waves), vec4(0.027, 0.019, 0.009, 0.0045));
    vec2 slope = vec2(0.94, 0.34) * slopes.x
      + vec2(-0.48, 0.87) * slopes.y
      + vec2(0.22, -0.97) * slopes.z
      + vec2(0.76, 0.65) * slopes.w;
    slope = vec2(slope.x + slope.y * cos(bend.y) * 0.351,
      slope.y + slope.x * cos(bend.x) * 0.39);
    float radial = sqrt(dot(p, p) + 0.025);
    float ringWave = radial * 18.0 - uTime * 3.6;
    height += sin(ringWave) * 0.01;
    slope += p / radial * cos(ringWave) * 0.18;
    vec3 normal = normalize(vec3(-slope * 0.8, 1.0));
    if (!gl_FrontFacing) normal = -normal;
    vec3 eye = normalize(vEye);
    float membrane = smoothstep(1.0 - uFill - 0.045, 1.0 - uFill + 0.04, r + height * 0.7);
    // Water against the lens would fill the frame: it thins out within reach of the camera.
    float lens = smoothstep(0.3, 1.6, length(vEye));
    float facing = clamp(dot(normal, eye), 0.0, 1.0);
    if (gl_FrontFacing == (uFlip > 0.5)) {
      // The far face: the same water held in the ring, lit from within, never a window.
      vec3 light = normalize(vec3(-0.45, 0.7, 0.62 * sign(vEye.z)));
      float sheet = 0.15 + 0.6 * pow(1.0 - facing, 3.0);
      vec3 bounce = reflect(-eye, normal);
      vec3 sky = mix(uSky * 0.16 + vec3(0.0, 0.02, 0.025), uSky + 0.05,
        smoothstep(-0.3, 0.7, bounce.y + bounce.x * 0.2));
      vec2 drift = eye.xy / max(abs(eye.z), 0.3);
      float swirl = uTime * 0.06 + (1.0 - r) * 1.1;
      mat2 turn = mat2(cos(swirl), sin(swirl), -sin(swirl), cos(swirl));
      vec2 near = turn * (p - drift * 0.07 + normal.xy * 0.04);
      vec2 deeper = turn * turn * (p - drift * 0.2 + normal.xy * 0.06);
      float core = exp(-r * r * 2.2);
      vec3 depth = mix(vec3(0.003, 0.018, 0.026), vec3(0.012, 0.085, 0.095), core);
      vec3 inner = depth
        + vec3(0.04, 0.22, 0.21) * caustic(near * 3.2, uTime * 0.9) * (0.25 + 0.75 * core)
        + vec3(0.015, 0.08, 0.1) * caustic(deeper * 2.1 + 3.7, uTime * 0.6);
      inner *= 0.75 + 0.5 * max(dot(normal, light), 0.0);
      vec3 far = mix(inner * uGlow, sky, sheet);
      far += vec3(0.8, 0.95, 0.9) * pow(max(dot(normal, normalize(light + eye)), 0.0), 220.0) * 0.18;
      far *= mix(1.0, 0.5, smoothstep(0.86, 0.985, r));
      float lip = (r - 0.978) * 60.0;
      far += vec3(0.1, 0.55, 0.5) * exp(-lip * lip) * 0.6 * uFill;
      float shown = membrane * uBack * lens;
      if (shown < 0.003) discard;
      gl_FragColor = vec4(far, shown);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    vec3 sun = normalize(vec3(-0.45, 0.7, 0.85));
    float fresnel = 0.055 + 0.62 * pow(1.0 - facing, 4.0);
    float specular = pow(max(dot(normal, normalize(sun + eye)), 0.0), 45.0);
    float diffuse = 0.45 + 0.55 * max(dot(normal, sun), 0.0);
    float rim = smoothstep(0.78, 1.0, r);
    float tilt = (normal.y + 0.1) * 6.0;
    float sheen = exp(-tilt * tilt);
    vec3 water = vec3(0.014, 0.075, 0.08)
      + vec3(0.06, 0.23, 0.2) * diffuse
      + vec3(0.12, 0.42, 0.36) * fresnel;
    float front = uClear * 1.1;
    float cleared = (1.0 - smoothstep(front - 0.16, front + 0.015, r + height * 0.9)) * uHasView;
    cleared *= smoothstep(0.025, 0.16, uClear);
    float settled = smoothstep(0.0, 1.0, uClear);
    vec2 suv = gl_FragCoord.xy / uRes;
    suv += normal.xy * vec2(uRes.y / uRes.x, 1.0)
      * mix(0.019, 0.0065, settled) * (1.0 - rim * 0.7);
    suv = clamp(suv, uViewBounds.xy + 0.002, uViewBounds.zw - 0.002);
    vec3 view = texture2D(uView, suv).rgb;
    float wave = (r + height * 0.9 - front) * 21.0;
    float edge = exp(-wave * wave)
      * step(0.001, uClear) * (1.0 - step(1.0, uClear));
    // The window onto the far world stays whole at the lens; only its water thins, so the
    // camera passes through into a clear view.
    vec3 col = mix(water * membrane, view, cleared * mix(1.0, 0.92 - fresnel * 0.22, lens));
    col += vec3(0.42, 0.81, 0.76) * specular * mix(0.72, 0.13, cleared) * lens;
    col += vec3(0.13, 0.48, 0.43) * sheen * mix(0.22, 0.035, cleared) * lens;
    col += vec3(0.15, 0.75, 0.66) * (pow(rim, 4.0) * 0.45 + edge * 0.48) * max(uFill, cleared) * lens;
    float alpha = max(membrane * lens, cleared);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLANK.needsUpdate = true;

// Uniforms for a membrane that shows no destination, such as the drifting door in space.
export function liquidUniforms({ sky = SKY, glow = 1, flip = 0 } = {}) {
  return {
    uView: { value: BLANK },
    uRes: { value: new THREE.Vector2(1, 1) },
    uViewBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFill: { value: 1 },
    uClear: { value: 0 },
    uTime: { value: 0 },
    uHasView: { value: 0 },
    uFlip: { value: flip },
    uBack: { value: 1 },
    uSky: { value: new THREE.Color(sky) },
    uGlow: { value: glow },
  };
}

// One two-sided program for every door: the entrance shows the far world through the
// water, the other face shows the water alone.
export function liquidMaterial(uniforms) {
  uniforms.uGlow ??= { value: 1 };
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vEye;
      void main() {
        vUv = uv;
        vEye = cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: PORTAL_FS,
  });
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// The camera's part in the set piece: `shots` is a list of { at, eye, look } keyframes in
// seconds from the start, relative to the gate centre; the camera eases between them,
// shakes with the rumble and the blast, and is done once the membrane has cleared.
class OpeningShot {
  constructor(gate, shots) {
    this.gate = gate;
    this.shots = shots;
    this.t = 0;
    this.from = null;
    this.end = shots[shots.length - 1].at;
    this.letterbox = true;
    // A camera, not a plain Object3D: only cameras look down their -Z when told to lookAt.
    this.probe = new THREE.PerspectiveCamera();
  }

  pose(t, out) {
    const s = this.shots;
    let i = 0;
    while (i < s.length - 2 && t > s[i + 1].at) i++;
    const a = s[i],
      b = s[i + 1];
    const k = b.cut ? (t >= b.at ? 1 : 0) : smooth(a.at, b.at, t);
    const c = this.gate.center;
    const eye = new THREE.Vector3(...a.eye)
      .lerp(new THREE.Vector3(...b.eye), k)
      .add(c);
    const look = new THREE.Vector3(...a.look)
      .lerp(new THREE.Vector3(...b.look), k)
      .add(c);
    out.position.copy(eye);
    out.lookAt(look);
    return out;
  }

  update(dt, camera, shake = 1) {
    this.t += dt;
    if (!this.from)
      this.from = {
        pos: camera.position.clone(),
        quat: camera.quaternion.clone(),
      };
    this.pose(Math.min(this.t, this.end), this.probe);
    const blendIn = smooth(0, 1.1, this.t);
    camera.position.lerpVectors(this.from.pos, this.probe.position, blendIn);
    camera.quaternion.slerpQuaternions(
      this.from.quat,
      this.probe.quaternion,
      blendIn,
    );
    const g = this.gate;
    const quake =
      shake *
      ((g.rumble || 0) * 0.09 +
        (g.blastT !== undefined ? Math.max(0, 0.35 - g.blastT * 0.25) : 0));
    if (quake > 0) {
      camera.position.x += (Math.random() - 0.5) * quake;
      camera.position.y += (Math.random() - 0.5) * quake;
    }
    if (this.t >= this.end && g.isOpen) this.done = true;
  }

  skip() {
    this.gate.forceOpen();
    this.done = true;
  }
}

// Measured from the generated gate: a 12 x 6 m lower tier, an 11 x 4.4 m upper tier whose
// floor is 2 cm above the bottom of the opening, a buttress on each side, and the ring. The
// opening is a circle whose lowest point touches the upper tier, so the ring's lower arc
// rises from the floor on either side of the centre line: it is built as low steps the
// feet climb onto, then the ring is solid beside the opening at body height.
export function gateColliders(world, x, z, daisTop, bottom = -10) {
  const top = daisTop + 0.02;
  const R = 3.5;
  const arc = (d) => R - Math.sqrt(Math.max(0, R * R - d * d));
  world.add(x - 6, bottom, z - 3, x + 6, top - 0.5, z + 3, "gate");
  world.add(x - 5.5, bottom, z - 2.2, x + 5.5, top, z + 2.2, "gate");
  for (const side of [-1, 1]) {
    for (const [a, b] of [
      [0.7, 1.1],
      [1.1, 1.5],
      [1.5, 1.9],
      [1.9, 2.25],
    ])
      world.add(
        x + side * (side > 0 ? a : b),
        top - 0.5,
        z - 0.58,
        x + side * (side > 0 ? b : a),
        top + arc((a + b) / 2),
        z + 0.58,
        "gate",
        null,
        { grab: false },
      );
    const inner = x + side * 2.25,
      outer = x + side * 4.6,
      edge = x + side * 5.5;
    world.add(
      Math.min(inner, outer),
      top,
      z - 0.6,
      Math.max(inner, outer),
      top + 9,
      z + 0.6,
      "gate",
      null,
      { grab: false },
    );
    world.add(
      Math.min(outer, edge),
      top,
      z - 1.3,
      Math.max(outer, edge),
      top + 2.9,
      z + 1.3,
      "gate",
      null,
      { grab: false },
    );
  }
}

function fallbackGate() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({
    color: 0xb57f4f,
    roughness: 0.9,
  });
  const basalt = new THREE.MeshStandardMaterial({
    color: 0x3a3531,
    roughness: 0.8,
  });
  const crystal = new THREE.MeshStandardMaterial({
    color: 0x1d5f63,
    roughness: 0.3,
  });
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 6), stone);
  step1.position.y = 0.25;
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.5, 4.4), stone);
  step2.position.y = 0.75;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.0, 0.5, 16, 72),
    basalt,
  );
  ring.scale.z = 1.1;
  ring.position.y = 4.5;
  const grooves = new THREE.Mesh(
    new THREE.TorusGeometry(4.0, 0.08, 6, 72),
    crystal,
  );
  grooves.position.set(0, 4.5, 0.56);
  const medallion = (angle) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.1, 24),
      crystal,
    );
    m.rotation.x = Math.PI / 2;
    m.position.set(Math.sin(angle) * 4.0, 4.5 + Math.cos(angle) * 4.0, 0.6);
    return m;
  };
  const medallionTop = medallion(0),
    medallionRight = medallion((Math.PI * 2) / 3),
    medallionLeft = medallion((-Math.PI * 2) / 3);
  for (const o of [
    step1,
    step2,
    ring,
    grooves,
    medallionTop,
    medallionLeft,
    medallionRight,
  ]) {
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  g.userData.parts = { grooves, medallionTop, medallionLeft, medallionRight };
  g.userData.portal = { center: [0, 4.5, 0], radius: 3.5 };
  return g;
}
