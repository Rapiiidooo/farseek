import { mineralColor } from "./mineral-surface.js";
import * as THREE from "three";
import { warningTriangles } from "./hazard-marks.js";
import { tuning } from "./combat-tuning.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GOLD = 0xffb24a;
const LIGHT = 0x39e3d0;
const CRACKED = 0xbafff4;
const CRACK_TIME = 5.5;
const SEQUENCES = {
  "pressure-strike": {
    name: "Pressure strike",
    advice:
      "Shoot the cyan vent twice or leave the amber mark before it bursts",
  },
  "cross-pressure": {
    name: "Cross pressure",
    advice: "Vent the cyan columns or leave both marks; keep a clear way out",
  },
  undertow: {
    name: "Undertow",
    advice: "Vent the cyan column or leave its mark, then jump the low wave",
  },
  "converging-tide": {
    name: "Converging tide",
    advice: "Vent the cyan columns or leave both marks, then jump the low wave",
  },
  "pressure-chain": {
    name: "Pressure chain",
    advice:
      "Vent the cyan columns or leave all three marks; strikes arrive in order",
  },
};

export class TideGuardian {
  constructor(scene, world, assets, services = {}) {
    Object.assign(this, { scene, world, assets, services });
    this.position = V(0, 24, -87);
    this.maxHealth = 6;
    this.health = 6;
    this.state = "dormant";
    this.time = 0;
    this.timer = 0;
    this.pattern = 0;
    this.attackPhase = 0;
    this.phasePattern = 0;
    this.sequence = "pressure-strike";
    this.warnings = [];
    this.pressureTargets = [];
    this.rings = [];
    this.jets = [];
    this.lances = [];
    // Wide enough that a bullet meets the core before the colossus's own collider.
    this.target = {
      kind: "guardian",
      radius: 1.15,
      center: () => this.coreCenter,
      alive: () => this.active && this.state !== "defeated",
      onHit: (shot) => this.hit(shot),
    };
  }

  async build() {
    this.model = await this.assets.make("guardian_colossus");
    this.model.scale.setScalar(0.68);
    this.model.position.copy(this.position);
    const wash = new THREE.Color(0x799b94);
    this.model.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.color.lerp(mineralColor(m.material, wash), 0.5);
      m.castShadow = false;
    });
    this.scene.add(this.model);
    // The round body holds the explorer off; the lens stops at boxes fitted to the throne, lap and
    // head instead, so it never enters the stone and is not pulled in early beside it.
    this.world.addRound(0, -87, 3, 24, 33.5, "prop", null, {
      pistolProtected: true,
      cam: false,
    });
    for (const [x0, y0, z0, x1, y1, z1] of [
      [-2.3, 24, -89.95, 2.3, 30.35, -86.2],
      [-1.25, 24, -86.2, 1.25, 28.2, -84.55],
      [-1.2, 30.35, -88.9, 1.2, 33.65, -86.25],
    ])
      this.world.add(x0, y0, z0, x1, y1, z1, "prop", null, {
        stand: false,
        pistolProtected: true,
      });
    this.core = await this.assets.make("crystal_emitter");
    this.core.scale.setScalar(0.55);
    this.core.position.set(0, 27.8, -84.9);
    this.coreCenter = V(0, 28.65, -84.9);
    this.coreMaterials = [];
    this.core.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      if (m.material.emissiveIntensity > 0) this.coreMaterials.push(m.material);
    });
    this.scene.add(this.core);
    this.light = new THREE.PointLight(LIGHT, 0, 20, 1.6);
    this.light.position.copy(this.coreCenter);
    this.scene.add(this.light);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 1, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: GOLD,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          forceSinglePass: true,
          toneMapped: false,
        }),
      );
      ring.position.y = 24.08;
      warningTriangles(ring, 0.48, 0.86, 5, 0.13);
      this.scene.add(ring);
      this.rings.push(ring);
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.9, 1, 16, 1, true),
        new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          forceSinglePass: true,
          vertexShader: `varying vec2 vUv; varying vec3 vView; void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.0);vView=p.xyz;gl_Position=projectionMatrix*p;}`,
          // The follow camera can stand inside a jet: it fades at the lens instead of filling the view.
          fragmentShader: `uniform float uTime; uniform float uOpacity; varying vec2 vUv; varying vec3 vView;
            void main(){
              float ribbons=pow(max(0.0,0.5+0.5*sin(vUv.x*75.4+sin(vUv.y*13.0-uTime*12.0)*1.7)),3.0);
              float fade=smoothstep(0.0,0.08,vUv.y)*(1.0-smoothstep(0.65,1.0,vUv.y));
              fade*=smoothstep(0.4,2.4,length(vView));
              gl_FragColor=vec4(mix(vec3(0.07,0.55,0.65),vec3(0.6,1.0,0.97),ribbons),(0.1+ribbons*0.6)*fade*uOpacity);
            }`,
        }),
      );
      jet.name = `guardianPressureJet${i}`;
      this.scene.add(jet);
      this.jets.push(jet);
      const lance = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 1, 6),
        new THREE.MeshBasicMaterial({
          color: GOLD,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      lance.name = `guardianPressureTrace${i}`;
      this.scene.add(lance);
      this.lances.push(lance);
    }
    this.wave = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.045, 8, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: LIGHT,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.wave.name = "guardianLowPressureWave";
    this.scene.add(this.wave);
  }

  get phase() {
    return Math.min(3, 1 + Math.floor((this.maxHealth - this.health) / 2));
  }

  get active() {
    return !["dormant", "defeated"].includes(this.state);
  }

  get attackName() {
    return this.state === "cracked"
      ? "Cracked core"
      : SEQUENCES[this.sequence].name;
  }

  get advice() {
    if (
      this.warnings.some((warning) => warning.vented) &&
      this.warnings.every((warning) => warning.wave || warning.vented)
    )
      return this.warnings.some((warning) => warning.wave)
        ? "Pressure vented. Jump the expanding low wave"
        : "Pressure vented. Charge the orb for the open core";
    return SEQUENCES[this.sequence].advice;
  }

  start() {
    if (this.state !== "dormant") return;
    this.state = "waking";
    this.timer = 2.8;
    if (!this.explained) {
      this.explained = true;
      this.services.hud?.hint(
        "Tide Guardian",
        "Leave amber marks or shoot each cyan vent twice, and jump low waves. When the core opens, a charged orb pulse cracks it; only bullets wound it.",
        11,
      );
    }
    this.services.sound?.play("rumble");
    this.services.sound?.setMusic("guardian");
  }

  warn(hero) {
    const lead = tuning().windup;
    this.lead = lead;
    this.state = "warning";
    this.timer = (this.phase === 3 ? 1.55 : 1.95) * lead;
    this.warningDuration = this.timer;
    this.clearAttacks();
    this.pattern++;
    if (this.attackPhase !== this.phase) {
      this.attackPhase = this.phase;
      this.phasePattern = 0;
    }
    const alternate = this.phasePattern++ % 2;
    this.sequence =
      this.phase === 1
        ? "pressure-strike"
        : this.phase === 2
          ? alternate
            ? "undertow"
            : "cross-pressure"
          : alternate
            ? "pressure-chain"
            : "converging-tide";
    const x = THREE.MathUtils.clamp(hero.pos.x, -9, 9);
    const z = THREE.MathUtils.clamp(hero.pos.z, -92, -68);
    const pressure = (px, pz, delay) => ({
      x: THREE.MathUtils.clamp(px, -9, 9),
      z: THREE.MathUtils.clamp(pz, -92, -68),
      radius: 2.35,
      wave: false,
      delay: delay * lead,
      started: false,
      hit: false,
      hp: 2,
      vented: false,
    });
    this.warnings = [pressure(x, z, 0.48)];
    if (["cross-pressure", "converging-tide"].includes(this.sequence))
      this.warnings.push(pressure(x + (x > 0 ? -4.8 : 4.8), z - 1, 0.61));
    if (this.sequence === "pressure-chain") {
      const side = x > 3 ? -1 : 1;
      const depth = z > -80 ? -1 : 1;
      this.warnings.push(pressure(x + side * 4.8, z + depth * 1.2, 1.05));
      this.warnings.push(
        pressure(
          Math.abs(x) > 3 ? x + side * 9.6 : x - side * 4.8,
          z + depth * 2.4,
          1.62,
        ),
      );
    }
    if (["undertow", "converging-tide"].includes(this.sequence))
      this.warnings.push({
        x: 0,
        z: -84,
        radius: 1.2,
        wave: true,
        delay: 0.8 * lead,
        started: false,
        hit: false,
      });
    this.pressureTargets = this.warnings
      .filter((warning) => !warning.wave)
      .map((warning) => ({
        kind: "pressure",
        radius: 0.6,
        center: () => V(warning.x, 25.1, warning.z),
        alive: () => this.pressureOpen(warning),
        onHit: (shot) => this.ventPressure(warning, shot),
      }));
    this.services.sound?.play("charge");
  }

  pressureOpen(warning) {
    return (
      this.warnings.includes(warning) &&
      !warning.wave &&
      !warning.vented &&
      !warning.started &&
      (this.state === "warning" ||
        (this.state === "surge" &&
          this.surgeDuration - this.timer < warning.delay))
    );
  }

  ventPressure(warning, shot) {
    if (shot?.kind !== "pistol" || !this.pressureOpen(warning)) return false;
    warning.hp--;
    if (warning.hp === 0) {
      warning.vented = true;
      warning.fade = 0.28;
      this.onVent?.(this.phase);
      this.services.sound?.play("pylon");
    } else this.services.sound?.play("clink");
    return true;
  }

  showPressureVent(index, warning) {
    const jet = this.jets[index];
    jet.scale.set(0.6, 2.4, 0.6);
    jet.position.set(warning.x, 25.25, warning.z);
    jet.material.uniforms.uOpacity.value = warning.hp === 1 ? 0.9 : 0.6;
  }

  fadeVented(index, warning, dt) {
    if (!warning.vented) return false;
    warning.fade = Math.max(0, warning.fade - dt);
    const fade = warning.fade / 0.28;
    this.rings[index].material.color.set(LIGHT);
    this.rings[index].material.opacity = fade * 0.65;
    this.jets[index].material.uniforms.uOpacity.value = fade * 0.6;
    this.lances[index].material.opacity = 0;
    return true;
  }

  // The relay only opens the core: a charged pulse on the exposed crystal cracks it for a few
  // seconds, and bullets do the damage while it stays cracked.
  hit(shot) {
    if (shot?.kind === "orb") return this.crack(shot);
    if (shot?.kind !== "pistol" || this.state !== "cracked") return false;
    if (this.hitCooldown > 0) return false;
    this.health--;
    this.hitCooldown = 0.1;
    this.services.sound?.play("shatter");
    this.onHit?.();
    if (this.health <= 0) {
      this.state = "defeated";
      this.timer = 0;
      this.warnings = [];
      this.pressureTargets = [];
      this.clearAttacks();
      this.services.hud?.subtitle(
        "It was keeping the way home alive. The address is ours.",
        5,
      );
      this.services.sound?.setMusic("sea");
      this.onDefeat?.();
    } else if (this.health % 2 === 0) {
      this.state = "recovering";
      this.timer = 2.5;
      this.services.hud?.clearHint?.();
      this.services.hud?.subtitle(
        this.phase === 2
          ? "Pressure and tide. Leave the marks, then jump the low wave."
          : "Three marks, or a wave. Watch the ground before you counter.",
        4,
      );
    }
    return true;
  }

  crack(orb) {
    if (this.state !== "exposed" || !orb.charged) {
      this.services.sound?.play("clink");
      return false;
    }
    orb.spend?.();
    this.state = "cracked";
    this.timer = CRACK_TIME * tuning().coreWindow;
    this.services.sound?.play("shatter");
    if (!this.crackExplained) {
      this.crackExplained = true;
      this.services.hud?.hint(
        "Cracked core",
        "The light split the crystal open. Draw the pistols and shoot the core before it seals.",
        8,
      );
    }
    this.onCrack?.();
    return true;
  }

  update(dt, hero) {
    this.time += dt;
    this.hitCooldown = Math.max(0, (this.hitCooldown || 0) - dt);
    this.timer -= dt;
    const exposed = this.state === "exposed" || this.state === "defeated";
    const cracked = this.state === "cracked";
    for (const m of this.coreMaterials) {
      m.emissive.set(cracked ? CRACKED : exposed ? LIGHT : GOLD);
      m.emissiveIntensity = cracked
        ? 4.2 + Math.sin(this.time * 17) * 1.3
        : exposed
          ? 2.4 + Math.sin(this.time * 5) * 0.4
          : 0.45;
    }
    this.light.intensity = cracked ? 12 : exposed ? 8 : this.active ? 2 : 0;
    const lean =
      this.state === "defeated"
        ? 0.09
        : this.state === "warning"
          ? -0.024
          : this.state === "surge"
            ? 0.027
            : this.state === "exposed"
              ? 0.018
              : cracked
                ? 0.05
                : 0;
    this.model.rotation.x = THREE.MathUtils.damp(
      this.model.rotation.x,
      lean,
      5,
      dt,
    );
    for (const jet of this.jets) jet.material.uniforms.uTime.value = this.time;
    if (!this.active) return;
    if (["waking", "recovering"].includes(this.state) && this.timer <= 0)
      this.warn(hero);
    else if (this.state === "warning") {
      const progress = 1 - Math.max(0, this.timer / this.warningDuration);
      this.warnings.forEach((w, i) => {
        if (this.fadeVented(i, w, dt)) return;
        const r = this.rings[i];
        r.position.set(w.x, 24.065 + i * 0.012, w.z);
        r.scale.setScalar(w.wave ? 1.2 : w.radius);
        r.material.color.set(GOLD);
        r.material.opacity = w.wave
          ? 0.22
          : 0.1 + progress * 0.3 + Math.sin(this.time * 14) * 0.035;
        if (!w.wave) {
          this.showPressureVent(i, w);
          this.trace(
            i,
            this.coreCenter,
            V(w.x, 24.1, w.z),
            0.08 + progress * 0.18,
          );
        }
      });
      if (this.timer <= 0) {
        this.state = "surge";
        this.surgeDuration =
          (this.warnings.some((w) => w.wave)
            ? 3.9
            : this.sequence === "pressure-chain"
              ? 2.6
              : 1.5) * (this.lead ?? 1);
        this.timer = this.surgeDuration;
      }
    } else if (this.state === "surge") {
      const elapsed = this.surgeDuration - this.timer;
      for (const [i, w] of this.warnings.entries()) {
        if (this.fadeVented(i, w, dt)) continue;
        const r = this.rings[i];
        if (w.wave) {
          const age = elapsed - w.delay;
          r.material.opacity = Math.max(0, 0.35 * (1 - elapsed / w.delay));
          if (age < 0) continue;
          if (!w.started) {
            w.started = true;
            this.services.sound?.play("rumble");
          }
          w.radius = 1.2 + age * 7;
          this.wave.position.set(w.x, 24.22, w.z);
          this.wave.scale.set(w.radius, 1, w.radius);
          this.wave.material.opacity = Math.min(0.9, this.timer * 1.4);
          const dist = Math.hypot(hero.pos.x - w.x, hero.pos.z - w.z);
          if (!w.hit && Math.abs(dist - w.radius) < 0.7 && hero.feet < 24.65) {
            w.hit = true;
            this.onStrike?.(w.x, w.z);
            if (this.state !== "surge") return;
          }
        } else {
          const arrival = w.delay;
          const travel = THREE.MathUtils.clamp(elapsed / arrival, 0, 1);
          const target = V(w.x, 24.1, w.z);
          const head = this.coreCenter.clone().lerp(target, travel);
          const tail = this.coreCenter
            .clone()
            .lerp(target, Math.max(0, travel - 0.24));
          this.trace(i, tail, head, travel < 1 ? 0.95 : 0);
          const impact = elapsed - arrival;
          if (impact >= 0 && !w.started) {
            w.started = true;
            this.services.sound?.play("stamp");
          }
          if (impact < 0) this.showPressureVent(i, w);
          else {
            const force = Math.sin(Math.min(1, impact / 0.85) * Math.PI);
            const jet = this.jets[i];
            jet.scale.set(w.radius, 0.12 + force * 4.8, w.radius);
            jet.position.set(w.x, 24.05 + jet.scale.y / 2, w.z);
            jet.material.uniforms.uOpacity.value = Math.max(0, force);
          }
          r.material.color.set(impact < 0 ? GOLD : LIGHT);
          r.material.opacity =
            impact < 0 ? 0.52 : Math.max(0, 0.55 * (1 - impact / 0.85));
          if (impact >= 0 && impact < 0.7 && !w.hit && this.inside(hero, w)) {
            w.hit = true;
            this.onStrike?.(w.x, w.z);
            if (this.state !== "surge") return;
          }
        }
      }
      if (this.timer <= 0) {
        this.clearAttacks();
        this.state = "exposed";
        this.timer = 6.5 * tuning().coreWindow;
        this.services.sound?.play("pylon");
        this.onExpose?.();
      }
    } else if (
      (this.state === "exposed" || this.state === "cracked") &&
      this.timer <= 0
    ) {
      this.state = "recovering";
      this.timer = 1.3;
    }
  }

  trace(index, from, to, opacity) {
    const mesh = this.lances[index];
    const direction = to.clone().sub(from);
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.scale.y = Math.max(0.001, direction.length());
    if (direction.lengthSq() > 0.000001)
      mesh.quaternion.setFromUnitVectors(V(0, 1, 0), direction.normalize());
    mesh.material.opacity = opacity;
  }

  clearAttacks() {
    this.rings.forEach((r) => (r.material.opacity = 0));
    this.jets.forEach((j) => (j.material.uniforms.uOpacity.value = 0));
    this.lances.forEach((l) => (l.material.opacity = 0));
    if (this.wave) this.wave.material.opacity = 0;
  }

  inside(hero, w) {
    return (
      Math.hypot(hero.pos.x - w.x, hero.pos.z - w.z) < w.radius + 0.2 &&
      hero.feet < 28.5
    );
  }

  reset() {
    this.health = this.maxHealth;
    this.state = "dormant";
    this.timer = 0;
    this.hitCooldown = 0;
    this.pattern = 0;
    this.attackPhase = 0;
    this.phasePattern = 0;
    this.sequence = "pressure-strike";
    this.warnings = [];
    this.pressureTargets = [];
    this.model.rotation.x = 0;
    this.clearAttacks();
    this.light.intensity = 0;
    this.onReset?.();
  }

  telemetry() {
    return {
      name: "Tide Guardian",
      health: this.health,
      maxHealth: this.maxHealth,
      state: this.state,
      phase: this.phase,
      timer: this.timer,
      core: this.coreCenter.toArray(),
      warnings: this.warnings.map((w) => ({ ...w })),
      sequence: this.sequence,
      attackName: this.attackName,
      pattern: this.pattern,
      attack: this.state === "surge" ? this.sequence : this.state,
      counterWindow: this.state === "exposed",
      cracked: this.state === "cracked",
    };
  }
}
