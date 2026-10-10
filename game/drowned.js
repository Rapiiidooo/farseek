import * as THREE from "three";
import { TideGuardian } from "./tide-guardian.js";
import { TideSketch } from "./tide-sketch.js";
import { terrainMaterial } from "./terrain.js";
import { AirSanctuary } from "./air-sanctuary.js";
import { Breath } from "./breath.js";
import { prepareVisuals } from "./shader-preparation.js";
import { warningStripes } from "./hazard-marks.js";
import { ArrivalCurrent } from "./arrival-current.js";
import { FloodedStair, FLOODED } from "./flooded-stair.js";
import { damageAmount, recoverHealth } from "./composure.js";
import { t } from "./i18n.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const SEA_ADDRESS = ["waves", "crescent", "disc"];
const LIGHT = 0x39e3d0;

export class DrownedArchive {
  constructor(scene, world, assets, services = {}) {
    Object.assign(this, { scene, world, assets, services });
    this.time = 0;
    this.health = 4;
    this.breath = new Breath();
    this.seals = [];
    this.wells = [];
    this.vents = [];
    this.ready = false;
    this.completed = false;
    this.bridgeLeft = 0;
    this.bridgeSecured = false;
    this.checkpoint = { x: 0, z: -18, feet: 28, yaw: Math.PI };
  }

  async build() {
    this.stone = terrainMaterial("masonry", 0xbcb6a1, 0.9, { ao: false });
    this.trim = new THREE.MeshStandardMaterial({
      color: 0xd2d7ba,
      roughness: 0.8,
    });
    this.pathLight = new THREE.MeshBasicMaterial({
      color: LIGHT,
      transparent: true,
      opacity: 0.3,
      toneMapped: false,
    });
    this.slab(0, -2.5, 12, 15, 30);
    this.stairs(-10, -16, 30, 28);
    this.slab(0, -22.5, 10, 13, 28);
    this.slab(0, -42, 12, 10, 28);
    this.stairs(-47, -53, 28, 26);
    this.stairs(-61, -67, 26, 24);
    this.slab(0, -80, 24, 26, 24);
    this.slab(0, -99, 12, 12, 24);
    this.sanctuary = new AirSanctuary(this, this.services.atlantis);
    await this.sanctuary.build();
    this.arrivalCurrent = new ArrivalCurrent(this);
    this.arrivalCurrent.build();
    this.flooded = new FloodedStair(this);
    this.flooded.build();
    this.sanctuary.pockets.push(this.flooded);
    this.sanctuary.currents.push(
      this.arrivalCurrent.current,
      this.flooded.current,
    );
    this.bridge = this.slab(0, -33, 3.4, 8, 28, true);
    this.bridge.mesh.material = new THREE.MeshBasicMaterial({
      color: LIGHT,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      toneMapped: false,
    });
    this.setBridge(false);
    for (const z of [-21, -25]) this.addVent(z);
    await this.addWell(-3.5, 28, -18);
    await this.addWell(4, 28, -40);
    await this.addWell(-8, 24, -73);
    await this.addWell(8, 24, -82);
    await this.addSeal(3.5, 28, -26.5, 0);
    await this.addSeal(-3.5, 28, -43.5, 1);
    this.buildWard();
    for (const [x, y, z, yaw] of [
      [-5, 28, -18, 0.3],
      [5, 28, -28, -0.4],
      [-5, 28, -39, 0.7],
      [10, 24, -69, 0.2],
      [-10, 24, -90, -0.2],
    ]) {
      const o = await this.assets.make("ruin_column");
      if (!o) continue;
      o.position.set(x, y, z);
      o.rotation.y = yaw;
      o.scale.setScalar(0.58);
      this.scene.add(o);
      this.world.addRound(x, z, 0.5, y, y + 4.2, "prop");
    }
    const arch = await this.assets.make("ruin_arch");
    if (arch) {
      arch.position.set(0, 24, -67);
      arch.scale.setScalar(0.45);
      this.scene.add(arch);
    }
    for (const [x, y, z, scale, turn] of [
      [-4.8, 30, -6, 0.55, 0.7],
      [4.8, 30, 1.5, 0.6, -0.2],
      [-4.4, 28, -28, 0.45, 1.2],
      [4.7, 28, -45, 0.6, 0.8],
      [-10, 24, -71, 0.85, 0.2],
      [10.2, 24, -89, 0.7, -0.6],
    ]) {
      const rubble = await this.assets.make("rubble_pile");
      rubble.scale.setScalar(scale);
      rubble.position.set(x, y, z);
      rubble.rotation.y = turn;
      this.scene.add(rubble);
      this.world.addRound(x, z, scale * 0.8, y, y + scale, "prop");
    }
    this.boss = new TideGuardian(
      this.scene,
      this.world,
      this.assets,
      this.services,
    );
    await this.boss.build();
    this.boss.onStrike = (x, z) => this.hurt(x, z);
    this.boss.onVent = (phase) => this.tideSketch.vent(phase);
    this.boss.onReset = () => this.tideSketch.resetAttempt();
    this.boss.onDefeat = () => {
      this.ready = true;
      this.tideSketch.finish();
      this.health = 4;
      this.services.hud?.health(4, 4);
      this.services.hud?.light(SEA_ADDRESS[2]);
      this.gate.ignite(2);
      this.gate.open(null, null, { sequence: true });
      this.onReady?.();
    };
    const { Gate } = this.services;
    this.gate = new Gate({
      ...this.services,
      scene: this.scene,
      world: this.world,
      assets: this.assets,
      view: false,
    });
    const model = await this.assets.make("far_gate");
    model.position.y = 23;
    await this.gate.build({
      x: 0,
      z: -100,
      glyphs: SEA_ADDRESS,
      model,
      base: "sea",
      depth: 1.2,
    });
    this.gate.uniforms.uHasView.value = 0;
    this.gate.lightScale = 0.5;
    this.exitBarrier = this.world.add(
      -2.25,
      24,
      -100.15,
      2.25,
      31,
      -99.85,
      "prop",
      null,
      { stand: false, grab: false, cam: false },
    );
    this.tideSketch = new TideSketch(this);
    await this.tideSketch.build();
  }

  slab(x, z, width, depth, top, unsafe = false) {
    const geometry = new THREE.BoxGeometry(width, 1.2, depth);
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const tile = this.stone.userData.tileMeters;
    for (let i = 0; i < p.count; i++)
      uv.setXY(
        i,
        (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) + z : p.getX(i) + x) / tile,
        (Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) + z : p.getY(i) + top) / tile,
      );
    const mesh = new THREE.Mesh(geometry, this.stone);
    mesh.position.set(x, top - 0.6, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const box = this.world.add(
      x - width / 2,
      top - 1.2,
      z - depth / 2,
      x + width / 2,
      top,
      z + depth / 2,
      "rock",
      null,
      { unsafe },
    );
    if (!unsafe)
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(0.13, 0.045, depth - 0.08),
          this.pathLight,
        );
        edge.position.set(x + side * (width / 2 - 0.22), top + 0.026, z);
        this.scene.add(edge);
        const lip = new THREE.Mesh(
          new THREE.BoxGeometry(0.23, 0.22, depth - 0.04),
          this.trim,
        );
        lip.position.set(x + side * (width / 2 - 0.1), top - 0.17, z);
        this.scene.add(lip);
      }
    return { mesh, box };
  }

  stairs(from, to, high, low) {
    const n = Math.ceil((high - low) / 0.5);
    const length = (from - to) / n;
    for (let i = 0; i < n; i++)
      this.slab(
        0,
        from - (i + 0.5) * length,
        6,
        length + 0.015,
        high - (i + 1) * 0.5,
      );
  }

  addVent(z) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(9.4, 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffb24a,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.position.set(0, 28.045, z);
    warningStripes(mesh, 9.4, 1.6);
    this.scene.add(mesh);
    const spray = new THREE.Mesh(
      new THREE.PlaneGeometry(9.4, 3),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        vertexShader: `varying vec2 vUv; varying vec3 vView; void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.0);vView=p.xyz;gl_Position=projectionMatrix*p;}`,
        // The camera follows the hero through this sheet: it fades at the lens instead of covering the view.
        fragmentShader: `uniform float uTime; uniform float uOpacity; varying vec2 vUv; varying vec3 vView;
          void main(){
            float ribbons=pow(max(0.0,0.5+0.5*sin(vUv.x*62.8+sin(vUv.y*11.0-uTime*9.0))),7.0);
            float fade=smoothstep(0.0,0.04,vUv.y)*(1.0-smoothstep(0.4,1.0,vUv.y));
            fade*=smoothstep(0.0,0.06,vUv.x)*(1.0-smoothstep(0.94,1.0,vUv.x));
            fade*=smoothstep(0.4,2.4,length(vView));
            gl_FragColor=vec4(mix(vec3(0.08,0.55,0.64),vec3(0.65,0.98,0.97),ribbons),(0.035+ribbons*0.7)*fade*uOpacity);
          }`,
      }),
    );
    spray.position.set(0, 29.5, z);
    this.scene.add(spray);
    this.vents.push({ z, mesh, spray, active: false, warning: false });
  }

  async addWell(x, y, z) {
    const object = await this.assets.make("crystal_emitter", {
      keepHierarchy: true,
    });
    object.position.set(x, y, z);
    this.scene.add(object);
    const at = object.userData.beam || [0, 1.55, 0];
    const center = V(x + at[0], y + at[1], z + at[2]);
    const beam = {
      from: center,
      to: center.clone().add(V(0, 13, 0)),
      active: () => true,
    };
    const material = new THREE.MeshBasicMaterial({
      color: LIGHT,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      toneMapped: false,
    });
    // The orbiting camera can pass through a beam, which would then cover the view.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLens;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvLens = mvPosition.xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLens;")
        .replace(
          "#include <opaque_fragment>",
          "diffuseColor.a *= smoothstep(0.25, 1.2, length(vLens));\n#include <opaque_fragment>",
        );
    };
    material.customProgramCacheKey = () => "fd-beam-lens";
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 13, 8, 1, true),
      material,
    );
    mesh.position.copy(center).add(V(0, 6.5, 0));
    this.scene.add(mesh);
    this.world.addRound(x, z, 0.6, y, y + 2, "prop");
    this.wells.push({
      center,
      beam,
      target: {
        radius: 0.5,
        center: () => center,
        alive: () => true,
        onHit: (disc) => {
          disc.charge = 10;
          this.services.sound?.play("charge");
        },
      },
    });
  }

  async addSeal(x, y, z, index) {
    const model = await this.assets.make("light_pylon", {
      keepHierarchy: true,
    });
    model.position.set(x, y, z);
    this.scene.add(model);
    model.updateMatrixWorld(true);
    const at = model.userData.lens?.center || [0, 2.3, -0.25];
    const center = V(...at).applyMatrix4(model.matrixWorld);
    const materials = [];
    for (const part of ["lens", "slot"])
      model.userData.parts?.[part]?.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.emissive.set(LIGHT);
        m.material.emissiveIntensity = 0;
        materials.push(m.material);
      });
    this.world.addRound(x, z, 0.7, y, y + 2.4, "prop");
    const seal = { index, center, materials, lit: false };
    seal.target = {
      radius: 0.6,
      center: () => center,
      alive: () =>
        !seal.lit ||
        (index === 0 && !this.bridgeSecured && this.bridgeLeft < 3),
      onHit: (disc) => {
        if (!disc.charged) {
          this.services.sound?.play("clink");
          return;
        }
        seal.lit = true;
        materials.forEach((m) => (m.emissiveIntensity = 2.8));
        this.services.hud?.light(SEA_ADDRESS[index]);
        this.services.sound?.play("pylon");
        this.services.hud?.clearHint?.();
        this.gate.ignite(index);
        if (index === 0) {
          this.bridgeLeft = 12;
          this.setBridge(true);
          this.services.hud?.subtitle(
            t("The light holds the sea back. Cross while it lasts."),
            4,
          );
        } else {
          this.ward.visible = false;
          this.wardBox.solid = false;
          this.services.hud?.subtitle(
            t("Both pressure seals are awake. The archive is ahead."),
            4,
          );
        }
      },
    };
    this.seals.push(seal);
  }

  buildWard() {
    this.ward = new THREE.Mesh(
      new THREE.PlaneGeometry(6.5, 6),
      new THREE.MeshBasicMaterial({
        color: LIGHT,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.ward.position.set(0, 27.5, -65);
    this.scene.add(this.ward);
    this.wardBox = this.world.add(
      -3.4,
      24.5,
      -65.25,
      3.4,
      31,
      -64.75,
      "prop",
      null,
      { stand: false, grab: false },
    );
  }

  setBridge(on) {
    this.bridge.mesh.visible = on;
    this.bridge.box.solid = on;
  }

  hurt(x, z, force = 4) {
    const hero = this.hero;
    if (!hero || !hero.takeHit(x, z, force)) return;
    this.health -= damageAmount();
    this.services.hud?.health(Math.max(0, this.health), 4);
    this.services.sound?.play("hurt");
    this.onDamage?.();
    if (this.health <= 0) {
      if (!this.ready) this.boss.reset();
      const p =
        this.sanctuary.progress === 1
          ? this.checkpoint
          : { x: 0, z: -4.4, feet: 31.5, yaw: Math.PI };
      hero.spawn(p.x, p.z, p.feet, p.yaw);
      this.services.sound?.play("respawn");
      this.services.hud?.blackout(
        force ? t("The pressure knocks you out.") : t("Out of air."),
      );
      this.breath.reset();
      hero.invulnerable = 2;
      this.health = 4;
      this.services.hud?.health(4, 4);
      this.services.hud?.subtitle(
        this.sanctuary.progress === 1
          ? t("Back inside the light. The restored seals still hold.")
          : t(
              "The current carries you back. Reach the control desk to make air.",
            ),
        4,
      );
      this.onRespawn?.();
    }
  }

  update(dt, hero, playable = true) {
    this.hero = hero;
    this.time += dt;
    if (
      playable &&
      recoverHealth(this, dt, {
        sound: this.services.sound,
        active: !this.boss.active,
      })
    )
      this.services.hud?.health(this.health, 4);
    this.gate.update(dt);
    this.tideSketch.update(dt);
    this.exitBarrier.solid = !this.gate.isOpen;
    this.arrivalCurrent.update(dt, 1 - this.sanctuary.progress);
    this.flooded.update(dt);
    if (this.sanctuary) {
      this.sanctuary.update(dt, hero);
      if (playable)
        this.breath.update(dt, this.sanctuary.headWater(hero) > 0.5, () =>
          this.hurt(hero.pos.x, hero.pos.z, 0),
        );
      if (this.sanctuary.progress < 1) return;
    }
    if (this.seals[0].lit && hero.pos.z < -37 && hero.feet > 26) {
      this.bridgeSecured = true;
      this.bridgeLeft = 12;
    }
    if (!this.bridgeSecured)
      this.bridgeLeft = Math.max(0, this.bridgeLeft - dt);
    this.setBridge(this.bridgeSecured || this.bridgeLeft > 0);
    this.bridge.mesh.material.opacity =
      this.bridgeLeft < 3 && !this.bridgeSecured
        ? 0.35 + Math.sin(this.time * 14) * 0.2
        : 0.65;
    for (let i = 0; i < this.vents.length; i++) {
      const vent = this.vents[i];
      const phase = (this.time + i * 2.2) % 6;
      vent.warning = phase > 2.7 && phase < 4.1;
      vent.active = phase >= 4.1 && phase < 5.1;
      vent.mesh.material.opacity = vent.warning
        ? 0.4 + Math.sin(this.time * 12) * 0.3
        : vent.active
          ? 0.75
          : 0.09;
      vent.spray.material.uniforms.uTime.value = this.time;
      const spray = vent.spray.material.uniforms.uOpacity;
      spray.value +=
        ((vent.active ? 0.85 : 0) - spray.value) * Math.min(1, dt * 18);
      if (
        vent.active &&
        Math.abs(hero.pos.z - vent.z) < 0.9 &&
        Math.abs(hero.pos.x) < 4.7 &&
        hero.feet < 30
      )
        this.hurt(hero.pos.x - 1, vent.z - 1);
    }
    // Before the flooded stair, a drowning returns her to its upper landing.
    if (
      this.seals.every((s) => s.lit) &&
      !this.boss.active &&
      hero.state === "ground" &&
      hero.pos.z < -44.5 &&
      hero.pos.z > -51 &&
      hero.feet > 26.4
    )
      this.checkpoint = { x: 0, z: -45, feet: 28, yaw: Math.PI };
    if (
      this.seals.every((s) => s.lit) &&
      hero.pos.z < -67 &&
      hero.pos.z > -94
    ) {
      this.checkpoint = { x: 0, z: -68.5, feet: 24, yaw: Math.PI };
      this.boss.start();
    }
    if (this.boss.active) {
      hero.safe = { ...this.checkpoint };
      if (
        hero.pos.z > -66.5 ||
        hero.pos.z < -95 ||
        Math.abs(hero.pos.x) > 12.5 ||
        hero.feet < 20
      ) {
        hero.spawn(this.checkpoint.x, this.checkpoint.z, 24, Math.PI);
        this.services.sound?.play("respawn");
        this.services.hud?.blackout(t("No way out while the guardian stands."));
        this.boss.reset();
        this.health = 4;
        this.breath.reset();
        this.services.hud?.health(4, 4);
        this.onRespawn?.();
      }
    }
    this.boss.update(dt, hero);
    if (hero.state === "air" && hero.feet < 19) {
      hero.lastFall = "water";
      hero.respawn();
      this.onRespawn?.();
    }
    if (!this.completed && this.crossed(hero)) {
      this.completed = true;
      this.onComplete?.();
    }
  }

  guide(hud, hero, disc) {
    if (this.sanctuary && this.sanctuary.progress < 1) {
      const shelter = this.sanctuary.active
        ? null
        : this.arrivalCurrent.next(hero);
      hud.objective(
        this.sanctuary.active
          ? t("An island of air")
          : t("Wake the air shield"),
        this.sanctuary.active
          ? t("The sea is retreating. Settle onto the console's stone landing")
          : shelter
            ? t(
                "The current sweeps the plaza: swim from pier to pier, in their still water",
              )
            : t(
                "Dive to the control desk on the right and activate its air shield",
              ),
      );
      const key = `shield:${shelter ? shelter.x : "desk"}`;
      if (key !== this.guideKey)
        hud.setMarkers([shelter ?? this.sanctuary.beacon]);
      this.guideKey = key;
      return;
    }
    let title, sub, point;
    if (this.tideSketch.ready && this.tideSketch.near(1, 7)) {
      title = t("Collect Mira's tide proof");
      sub = t("Optional: take her note before crossing the restored door");
      point = this.tideSketch.stations[1].center;
    } else if (this.ready) {
      title = t("The way home");
      sub = this.gate.isOpen
        ? t("Walk through the restored door with the archive's address")
        : t("The door is gathering light. Wait beside its ring");
      point = this.gate.center;
    } else if (this.boss.active) {
      title =
        this.tideSketch.inspected && !this.tideSketch.claimed
          ? t("Free the last address · Tide marks {marks}/3", {
              marks: this.tideSketch.marks,
            })
          : t("Free the last address");
      sub =
        this.boss.state === "cracked"
          ? t("The core is cracked: shoot it with the pistols before it seals")
          : this.boss.state === "exposed"
            ? disc?.charged
              ? t("The core is open: pulse it with the charged orb to crack it")
              : t("Link to a crystal, then crack the open core with a pulse")
            : ["waking", "recovering"].includes(this.boss.state)
              ? t("Link to a crystal while the guardian gathers pressure")
              : this.boss.advice;
      point =
        this.boss.state === "cracked"
          ? this.boss.coreCenter
          : disc?.charged
            ? this.boss.state === "exposed"
              ? this.boss.coreCenter
              : null
            : this.wells[hero.pos.x > 0 ? 3 : 2].center;
    } else if (
      !this.seals[0].lit ||
      (!this.bridgeSecured && this.bridgeLeft <= 0)
    ) {
      title = t("Restore the pressure causeway");
      sub = disc?.charged
        ? t("Pulse the first lens, then cross its temporary bridge")
        : t(
            "Link to the crystal to charge the orb; cross the vents when they are dark",
          );
      point = disc?.charged ? this.seals[0].center : this.wells[0].center;
    } else if (hero.pos.z > -37) {
      title = t("Cross the light bridge");
      sub = t("{n} seconds of light remain. Run across", {
        n: Math.ceil(this.bridgeLeft),
      });
      point = V(0, 29, -40);
    } else if (!this.seals[1].lit) {
      title = t("Release the archive seal");
      sub = disc?.charged
        ? t("Pulse the second lens to lower the pressure barrier")
        : t("Link to the crystal beside the far landing to recharge");
      point = disc?.charged ? this.seals[1].center : this.wells[1].center;
    } else if (hero.pos.z > FLOODED.minZ - 0.6) {
      title = t("Swim the flooded stair");
      sub =
        this.flooded.phase === "calm"
          ? t("Swim on while the vent is calm, then rise to the far landing")
          : t("The vent surges: shelter behind a fallen block");
      point = this.flooded.next(hero);
    } else {
      title = t("Enter the drowned archive");
      sub = t("Descend into the guardian's court");
      point = V(0, 25, -69);
    }
    hud.objective(title, sub);
    const key = `${title}:${sub}:${point?.x ?? "none"}`;
    if (key !== this.guideKey)
      hud.setMarkers(point ? [point.clone().add(V(0, 0.7, 0))] : []);
    this.guideKey = key;
  }

  crossed(hero) {
    const was = this.lastZ ?? hero.pos.z;
    this.lastZ = hero.pos.z;
    return (
      this.ready &&
      this.gate.isOpen &&
      was > -100 &&
      hero.pos.z <= -100 &&
      Math.abs(hero.pos.x) < this.gate.radius - 0.9 &&
      Math.abs(hero.feet - this.gate.daisTop) < 2
    );
  }

  interactables() {
    return this.tideSketch.interactables();
  }
  groundAt(x, z) {
    return this.world.ground(x, z, 0.05, 80, 0);
  }

  solve() {
    this.sanctuary?.reset(true);
    for (const seal of this.seals) {
      seal.lit = true;
      seal.materials.forEach((m) => (m.emissiveIntensity = 2.8));
    }
    this.bridgeSecured = true;
    this.bridgeLeft = 12;
    this.setBridge(true);
    this.ward.visible = false;
    this.wardBox.solid = false;
    this.ready = true;
    this.boss.health = 0;
    this.boss.state = "defeated";
    this.gate.forceOpen();
    this.exitBarrier.solid = false;
  }

  reset() {
    this.sanctuary?.reset();
    this.time = 0;
    this.health = 4;
    this.breath.reset();
    this.ready = false;
    this.completed = false;
    this.bridgeSecured = false;
    this.bridgeLeft = 0;
    this.setBridge(false);
    for (const seal of this.seals) {
      seal.lit = false;
      seal.materials.forEach((m) => (m.emissiveIntensity = 0));
    }
    for (const vent of this.vents) {
      vent.active = vent.warning = false;
      vent.mesh.material.opacity = 0.09;
      vent.spray.material.uniforms.uOpacity.value = 0;
    }
    this.ward.visible = true;
    this.wardBox.solid = true;
    this.boss.reset();
    this.boss.explained = this.boss.crackExplained = false;
    this.tideSketch.reset();
    this.gate.reset();
    this.exitBarrier.solid = true;
    this.checkpoint = { x: 0, z: -18, feet: 28, yaw: Math.PI };
    this.lastZ = undefined;
    this.guideKey = null;
  }

  prepareForCompile(on) {
    this.tideSketch.prepareForCompile(on);
    prepareVisuals(this, on, [
      ...this.arrivalCurrent.visuals(),
      ...this.flooded.visuals(),
      [this.bridge.mesh, "visible", true],
      [this.gate.disc, "visible", true],
      [this.gate.uniforms.uClear, "value", 1.02],
    ]);
  }

  telemetry() {
    return {
      intro: this.sanctuary?.telemetry(this.hero) ?? null,
      swimming: !!this.hero?.swimming,
      health: this.health,
      breath: { ...this.breath },
      ready: this.ready,
      completed: this.completed,
      seals: this.seals.map((s) => ({
        lit: s.lit,
        center: s.center.toArray(),
      })),
      wells: this.wells.map((w) => w.center.toArray()),
      vents: this.vents.map((v) => ({
        z: v.z,
        active: v.active,
        warning: v.warning,
      })),
      bridge: {
        left: this.bridgeLeft,
        secured: this.bridgeSecured,
        solid: this.bridge.box.solid,
      },
      checkpoint: { ...this.checkpoint },
      boss: this.boss.telemetry(),
      currents: {
        arrival: this.arrivalCurrent.telemetry(),
        flooded: this.flooded.telemetry(),
      },
      tideSketch: this.tideSketch.telemetry(),
      gate: this.gate.phase,
    };
  }
}
