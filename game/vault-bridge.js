import * as THREE from "three";
import { Bridge } from "./isles.js";
import { BAYS, buildSeal } from "./vault.js";
import { crystalWell } from "./vault-crystal.js";
import { SwingRope } from "./swing-rope.js";
import { t } from "./i18n.js";

// The isles' bay: a chasm over a memory of golden cloud, a builders' pylon on the near ledge
// and the seal across it. A crystal on a high shelf beyond the chasm holds the pylon's lens shut
// with a lock of light; the pistols break it. Then the charged orb wakes the pylon, whose bridge
// of light (the isles' own) holds long enough to cross. The seal takes the bridge's light, and
// the way back is a swing on a bronze cable hung from a beam over the chasm.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BAY = BAYS[2];
const TURQUOISE = new THREE.Color(0x39e3d0);
export const BRIDGE = {
  x: -21,
  near: -29,
  far: -36,
  lasts: 11,
  crystal: { x: -27.4, z: -26.4 },
  lock: { x: -21, y: 4.6, z: -38.7 },
  seal: { x: -21, z: -38.5, yaw: 0 },
  hits: 2,
  // The cable's pivot over the chasm, swinging back towards the near ledge.
  rope: { x: -25, y: 6.55, z: -33.4, length: 5.5 },
};

function cloudMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
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
      uniform float uTime; varying vec3 vW;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec2 p = vW.xz * 0.09 + vec2(uTime * 0.03, uTime * 0.012);
        float c = fbm(p) * 0.7 + fbm(p * 2.7 - uTime * 0.05) * 0.3;
        float lit = smoothstep(0.3, 0.8, c);
        vec3 col = mix(vec3(0.5, 0.33, 0.22), vec3(0.95, 0.83, 0.6), lit) * 0.85;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

export class BridgeTrial {
  constructor(vault) {
    this.vault = vault;
    this.bay = BAY;
    this.id = BAY.id;
    this.done = false;
    this.hits = 0;
    this.locked = true;
    this.time = 0;
  }

  async build() {
    const { vault } = this;
    const { scene, world, assets } = vault;
    const m = vault.mat,
      S = vault.masonry;
    const area = `bay ${BAY.id}`;
    S.block(area, -33, -14, BRIDGE.near, -9, 0, BAY.z1, m.dawn, m.dawn, {
      grab: true,
    });
    S.block(area, -33, -14, BAY.z0, -9, 0, BRIDGE.far, m.dawn, m.dawn, {
      grab: true,
    });
    this.cloudU = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 } },
    ]);
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 7.2).rotateX(-Math.PI / 2),
      cloudMaterial(this.cloudU),
    );
    cloud.position.set(-21, -9, (BRIDGE.near + BRIDGE.far) / 2);
    scene.add(cloud);
    const isle = await assets.make("floating_isle");
    if (isle) {
      isle.scale.setScalar(0.22);
      isle.position.set(-28.6, -4.8, -32.4);
      isle.rotation.y = 0.8;
      scene.add(isle);
    }
    this.glow = new THREE.PointLight(0xffc98a, 9, 18, 1.4);
    this.glow.position.set(-21, -4.5, -32.5);
    scene.add(this.glow);

    // The pylon on the near ledge, facing the chasm, as the isles place theirs.
    const o = await assets.make("light_pylon", { keepHierarchy: true });
    const reach = o?.userData.emit?.[2] ?? 0.8;
    const emitZ = BRIDGE.near + 0.8;
    const z = emitZ + reach;
    if (o) {
      o.position.set(BRIDGE.x, 0, z);
      o.rotation.y = Math.PI;
      scene.add(o);
      o.updateMatrixWorld(true);
    }
    this.mats = [];
    for (const part of ["lens", "slot"])
      o?.userData.parts?.[part]?.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.material = mesh.material.clone();
        mesh.material.emissive = TURQUOISE.clone();
        mesh.material.emissiveIntensity = 0;
        this.mats.push(mesh.material);
      });
    const local = (p) =>
      o
        ? V(p[0], p[1], p[2]).applyMatrix4(o.matrixWorld)
        : V(BRIDGE.x, p[1], z - p[2]);
    const lensData = o?.userData.lens ?? {
      center: [0, 2.3, -0.25],
      radius: 0.31,
    };
    this.lens = local(lensData.center);
    this.emit = local(o?.userData.emit ?? [0, 0.04, 0.8]);
    const back = local([0, 0, lensData.center[2]]);
    world.addRound(back.x, back.z, 0.72, -1, 2.4, "prop");
    this.bridge = new Bridge(scene, world, {
      x: BRIDGE.x,
      z0: this.emit.z,
      z1: BRIDGE.far - 1.2,
      y0: 0.05,
      y1: 0.05,
    });
    this.lensTarget = {
      radius: Math.max(0.35, lensData.radius + 0.12),
      center: () => this.lens,
      alive: () => !this.bridge.on || this.bridge.left < 3,
      onHit: (disc) => this.strike(disc),
    };

    this.well = await crystalWell(vault, BRIDGE.crystal.x, 0, BRIDGE.crystal.z);

    // The lock: a crystal on a shelf high over the far ledge, its light held on the lens.
    const L = BRIDGE.lock;
    S.block(
      area,
      L.x - 1.2,
      L.y - 0.45,
      -39.5,
      L.x + 1.2,
      L.y,
      L.z + 0.8,
      m.bone,
      m.bone,
      {
        solid: false,
      },
    );
    S.block(
      area,
      L.x - 0.5,
      L.y - 1.6,
      -39.5,
      L.x + 0.5,
      L.y - 0.45,
      L.z + 0.3,
      m.wall,
      m.wall,
      {
        solid: false,
      },
    );
    const lock = await assets.make("crystal_emitter", { keepHierarchy: true });
    const lockAt = lock?.userData.beam || [0, 1.55, 0];
    this.lockMats = [];
    if (lock) {
      lock.position.set(L.x, L.y, L.z);
      lock.rotation.y = Math.PI;
      lock.userData.parts?.crystal?.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.material = mesh.material.clone();
        mesh.material.emissive = TURQUOISE.clone();
        mesh.material.emissiveIntensity = 2.4;
        this.lockMats.push(mesh.material);
      });
      this.lockCrystal = lock.userData.parts?.crystal || null;
      scene.add(lock);
    }
    this.lockCenter = V(L.x - lockAt[0], L.y + lockAt[1], L.z - lockAt[2]);
    const span = this.lens.clone().sub(this.lockCenter);
    const length = span.length();
    this.lockBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.05, length, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.4, 1.9, 1.75),
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.lockBeam.position.copy(this.lockCenter).addScaledVector(span, 0.5);
    this.lockBeam.quaternion.setFromUnitVectors(V(0, 1, 0), span.normalize());
    this.lockBeam.renderOrder = 4;
    scene.add(this.lockBeam);
    this.lockTarget = {
      kind: "crystal",
      radius: 0.5,
      center: () => this.lockCenter,
      alive: () => this.locked,
      onHit: (hit) => {
        if (hit?.kind !== "pistol" || !this.locked) return false;
        this.hits++;
        vault.services.sound?.play("clink");
        if (this.hits >= BRIDGE.hits) this.unlock();
        return true;
      },
    };
    this.seal = await buildSeal(vault, BAY, BRIDGE.seal);
    this.buildRope();
  }

  // A beam of the builders across the chasm, and the cable that hangs from it.
  buildRope() {
    const { vault } = this;
    const R = BRIDGE.rope;
    vault.masonry.block(
      `bay ${BAY.id}`,
      -33,
      R.y + 0.05,
      R.z - 0.35,
      -9,
      R.y + 0.65,
      R.z + 0.35,
      vault.mat.bone,
      vault.mat.bone,
      { solid: false },
    );
    const cable = new THREE.MeshStandardMaterial({
      color: 0x7a5534,
      roughness: 0.55,
      metalness: 0.45,
    });
    cable.name = "cable";
    this.rope = new SwingRope({
      pivot: V(R.x, R.y, R.z),
      heading: new THREE.Vector2(0, 1),
      length: R.length,
      grip: [Math.max(2.4, R.length - 2.5), R.length - 0.32],
      material: cable,
    }).build(vault.scene);
    this.rope.id = "vault-cable";
    this.ropes = [this.rope];
  }

  unlock() {
    this.locked = false;
    this.vault.services.sound?.play("shatter");
    this.vault.services.dust?.burst(
      this.lockCenter.x,
      this.lockCenter.y - 0.6,
      this.lockCenter.z,
      1.2,
      14,
    );
    this.onUnlock?.();
  }

  strike(disc) {
    const sound = this.vault.services.sound;
    if (this.done) return void sound?.play("clink");
    if (this.locked || !disc.charged) {
      sound?.play("clink");
      this.onDark?.(this.locked);
      return;
    }
    const fresh = !this.bridge.on;
    this.bridge.wake(BRIDGE.lasts);
    sound?.play("pylon");
    if (fresh) setTimeout(() => sound?.play("bridge"), 250);
  }

  orbTargets() {
    return [this.well.target, this.lensTarget];
  }

  orbBeams() {
    return [this.well.beam];
  }

  combatTargets() {
    return this.locked ? [this.lockTarget] : [];
  }

  interactables() {
    if (this.done) return [];
    return [
      {
        kind: "use",
        box: this.seal.box,
        ref: this,
        prompt: `relic:${t("Wake the seal")}`,
      },
    ];
  }

  use() {
    if (this.done) return false;
    this.done = true;
    this.seal.light();
    // The seal drinks the bridge's light: the way back is the cable.
    if (this.bridge.on) this.bridge.left = Math.min(this.bridge.left, 0.5);
    this.vault.services.sound?.play("pylon");
    this.onDone?.(this);
    return true;
  }

  update(dt, hero) {
    this.time += dt;
    this.cloudU.uTime.value = this.time;
    this.well.update(dt);
    this.bridge.update(dt);
    this.rope.update(dt);
    const b = this.bridge;
    const on = b.on
      ? b.left < 3
        ? 0.55 + 0.45 * Math.sign(Math.sin(this.time * 18))
        : 1
      : 0;
    this.woke = Math.max(on, (this.woke ?? 0) - dt * 2);
    for (const mat of this.mats) mat.emissiveIntensity = this.woke * 3.2;
    this.unlockT = this.locked ? 0 : (this.unlockT ?? 0) + dt;
    const shown = this.locked ? 1 : Math.max(0, 1 - this.unlockT * 2);
    this.lockBeam.visible = shown > 0.01;
    this.lockBeam.material.opacity =
      (0.6 + Math.sin(this.time * 9) * 0.12) * shown;
    if (this.lockCrystal) this.lockCrystal.visible = this.locked;
    void hero;
  }

  // Once the seal is awake, the way back from the far ledge is the cable.
  after(hero) {
    if (hero.pos.z > BRIDGE.far + 0.2) return null;
    const [lo, hi] = this.rope.grip;
    return {
      title: t("Swing back"),
      sub: t("The seal took the bridge's light: run, jump and catch the cable"),
      point: this.rope.at((lo + hi) / 2),
    };
  }

  guide(hero, disc) {
    if (hero.pos.z < BRIDGE.far + 0.2)
      return {
        title: t("Cross on the bridge of light"),
        sub: t("Press the seal on the far ledge"),
        point: this.seal.center,
      };
    if (this.locked)
      return {
        title: t("Wake the pylon"),
        sub: t(
          "A lock of light holds its lens: shoot the crystal on the high shelf",
        ),
        point: this.lockCenter,
      };
    if (this.bridge.on)
      return {
        title: t("Cross on the bridge of light"),
        sub: t("{n} seconds of light remain", {
          n: Math.max(0, Math.ceil(this.bridge.left)),
        }),
        point: V(BRIDGE.x, 1, BRIDGE.far - 1),
      };
    return disc?.charged
      ? {
          title: t("Wake the pylon"),
          sub: t("Pulse the pylon's lens with the charged orb"),
          point: this.lens,
        }
      : {
          title: t("Wake the pylon"),
          sub: t("Link to the crystal to charge the orb"),
          point: this.well.center,
        };
  }

  hint(hud) {
    return [
      BAY.title,
      t(
        "Draw the pistols with <kbd>2</kbd> or {inventory}, hold {aim} and shoot the crystal that locks the lens. Then link to the crystal and pulse the pylon with the charged orb.",
        { inventory: hud.k("inventory"), aim: hud.k("aim") },
      ),
    ];
  }

  reset() {
    this.done = false;
    this.locked = true;
    this.hits = 0;
    this.bridge.off();
    this.rope.reset();
    this.rope.draw();
    this.woke = 0;
    for (const mat of this.mats) mat.emissiveIntensity = 0;
    this.seal.light(false);
  }

  solve() {
    this.done = true;
    this.locked = false;
    this.hits = BRIDGE.hits;
    this.bridge.off();
    this.seal.light();
  }

  prepareVisuals() {
    const b = this.bridge;
    return [
      [b.mesh, "visible", true],
      [b.uniforms.uGrow, "value", 1],
      [b.uniforms.uFade, "value", 0],
      [b.uniforms.uWarn, "value", 0],
      [this.lockBeam, "visible", true],
      ...this.mats.map((material) => [material, "emissiveIntensity", 3]),
    ];
  }

  telemetry() {
    const a = (v) => v.toArray().map((n) => +n.toFixed(2));
    return {
      done: this.done,
      locked: this.locked,
      hits: this.hits,
      bridge: { on: this.bridge.on, left: +this.bridge.left.toFixed(2) },
      lens: a(this.lens),
      lock: a(this.lockCenter),
      rope: {
        pivot: a(this.rope.pivot),
        heading: [this.rope.heading.x, this.rope.heading.y],
        grip: this.rope.grip,
      },
      crystal: a(this.well.center),
      seal: a(this.seal.center),
      x: BRIDGE.x,
      near: BRIDGE.near,
      far: BRIDGE.far,
    };
  }
}
