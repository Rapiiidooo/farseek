import { mineralColor, mineralBaseColor } from "../../mineral-surface.js";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { World } from "../../world.js";
import { terrainMaterial } from "../../terrain.js";
import { buildRidge } from "../../cliffs.js";
import { Checkpoint, LAYOUT } from "../../checkpoint.js";
import { SunDisc, fallbackDisc } from "../../disc.js";
import { Stamps } from "../../fx.js";
import { prepareVisuals } from "../../shader-preparation.js";
import { dressGate } from "../../gate-bases.js";
import { radioScene } from "../../mira-scenes.js";
import { damageAmount, recoverHealth } from "../../composure.js";
import { t } from "../../i18n.js";

// The second world: a black-sand valley under a violet sky, walled by basalt ridges, a ringed
// giant low on the horizon. The first door's twin stands at the head of the valley; the
// checkpoint closes it halfway; beyond the barrier a second far door waits on a terrace at the
// cliff edge above a plain of spires. Lit by a cold star with warm planetshine as the second
// colour temperature, and lanterns of the builders along the path.

const STAR = new THREE.Vector3(0.78, 0.36, 0.55).normalize();
const PLANET = new THREE.Vector3(-0.18, 0.2, -1).normalize();
const EXIT = { x: 0, z: -44 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class WorldTwo {
  constructor(renderer, assets, services = {}) {
    this.services = services;
    this.renderer = renderer;
    this.assets = assets;
    this.scene = new THREE.Scene();
    this.world = new World();
    this.time = 0;
    this.active = false;
    this.gateCenter = new THREE.Vector3();
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.health = 4;
  }

  get exit() {
    return this.exitGate;
  }

  combatTargets() {
    return this.checkpoint.guards;
  }

  async build() {
    const s = this.scene;
    s.fog = new THREE.FogExp2(0x4a3452, 0.0024);
    s.background = new THREE.Color(0x1a1028);
    this.sky = this.buildSky();
    s.add(this.sky);

    const star = new THREE.DirectionalLight(0xd4e2ff, 4.2);
    star.position.copy(STAR).multiplyScalar(60);
    star.castShadow = true;
    star.shadow.mapSize.set(2048, 2048);
    const sc = star.shadow.camera;
    sc.left = sc.bottom = -40;
    sc.right = sc.top = 40;
    sc.near = 1;
    sc.far = 160;
    star.shadow.bias = -0.0004;
    star.shadow.normalBias = 0.03;
    s.add(star, star.target);
    this.star = star;
    const shine = new THREE.DirectionalLight(0xff9f7a, 1.0);
    shine.position.copy(PLANET).multiplyScalar(50);
    s.add(shine, shine.target);
    s.add(new THREE.HemisphereLight(0x8c78c8, 0x3a2c40, 2.1));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(this.buildSky());
    s.environment = pmrem.fromScene(envScene, 0.04).texture;
    s.environmentIntensity = 0.55;
    pmrem.dispose();

    this.buildGround();
    this.buildRidges();
    await this.buildGates();
    await this.buildSpires();
    await this.buildBoulders();
    this.pools = new LightPools(s);
    await this.buildLanterns();
    await this.buildFlora();
    this.checkpoint = new Checkpoint(s, this.world, this.assets, this.services);
    await this.checkpoint.build();
    this.checkpoint.exitMarker = V(EXIT.x, 2.4, EXIT.z + 3);
    this.checkpoint.exitGate = this.exitGate;
    this.mira = await radioScene(this);
    this.pools.build();
    this.makeComposer();
  }

  buildSky(forEnv = false) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uStar: { value: STAR }, uPlanet: { value: PLANET } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec3 vDir; uniform vec3 uStar; uniform vec3 uPlanet;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 horizon = vec3(0.42, 0.2, 0.3), mid = vec3(0.12, 0.06, 0.21), zenith = vec3(0.022, 0.012, 0.06);
            vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
            col = mix(col, zenith, smoothstep(0.22, 0.85, h));
            float p = max(dot(d, uPlanet), 0.0);
            col += vec3(0.5, 0.26, 0.2) * pow(p, 6.0) * 0.5 * (1.0 - smoothstep(0.0, 0.5, h));
            float s = max(dot(d, uStar), 0.0);
            col += vec3(0.55, 0.6, 0.85) * pow(s, 24.0) * 0.5 + vec3(1.0, 1.0, 1.2) * pow(s, 1800.0) * 30.0;
            vec3 cell = floor(d * 380.0);
            float twinkle = step(0.9982, hash(cell)) * smoothstep(0.08, 0.35, h);
            col += vec3(0.9, 0.9, 1.0) * twinkle * (0.6 + hash(cell + 3.0) * 1.6);
            col = mix(col, vec3(0.1, 0.06, 0.12), smoothstep(0.0, -0.08, h));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    g.add(dome);
    // The ringed giant, low on the horizon, lit from the star's side.
    const planetMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uStar: { value: STAR } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; void main() { vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN; varying vec3 vP; uniform vec3 uStar;
        void main() {
          float lat = vP.y / 185.0;
          float bands = sin(lat * 26.0 + sin(lat * 7.0 + vP.x * 0.01) * 1.6) * 0.5 + 0.5;
          vec3 a = vec3(0.78, 0.45, 0.32), b = vec3(0.95, 0.78, 0.55), c = vec3(0.55, 0.28, 0.3);
          vec3 base = mix(mix(a, b, bands), c, smoothstep(0.55, 0.9, sin(lat * 9.0 + 1.0) * 0.5 + 0.5) * 0.5);
          float light = smoothstep(-0.25, 0.6, dot(normalize(vN), uStar));
          vec3 col = base * (0.035 + 0.62 * light);
          float rim = pow(max(0.0, 1.0 - abs(normalize(vN).z)), 3.0);
          col += vec3(0.9, 0.55, 0.45) * rim * 0.25 * light;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(185, 64, 48),
      planetMat,
    );
    planet.position.copy(PLANET).multiplyScalar(780);
    planet.rotation.z = 0.35;
    g.add(planet);
    // Blended, but not flagged transparent: transparent surfaces draw after the whole valley,
    // and a sky that ignores depth would then lie over the walls and ridges.
    const ringMat = new THREE.ShaderMaterial({
      fog: false,
      blending: THREE.CustomBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vP;
        void main() {
          float r = length(vP.xy);
          float t = (r - 245.0) / 170.0;
          float bands = sin(t * 60.0) * 0.25 + sin(t * 17.0) * 0.35 + 0.55;
          float edge = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.9, 1.0, t)) * (1.0 - smoothstep(0.42, 0.46, t) * (1.0 - smoothstep(0.5, 0.54, t)));
          vec3 col = vec3(0.95, 0.8, 0.66) * (0.5 + bands * 0.6);
          gl_FragColor = vec4(col * 0.55, edge * bands * 0.6);
        }`,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(245, 415, 160, 1),
      ringMat,
    );
    ring.position.copy(planet.position);
    ring.rotation.set(-1.25, 0.2, 0.35);
    g.add(ring);
    for (const [dir, r, color] of [
      [V(0.55, 0.42, -0.72), 16, 0xc9c3d6],
      [V(-0.62, 0.3, -0.72), 9, 0xe3b9a0],
    ]) {
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 16),
        new THREE.MeshBasicMaterial({ color, fog: false }),
      );
      moon.position.copy(dir.normalize()).multiplyScalar(820);
      g.add(moon);
    }
    // The sky draws first and never occludes: the plain's far edge must hide the giant's foot.
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.material.depthTest = false;
      o.material.depthWrite = false;
      o.renderOrder = -10;
    });
    // Over the planet it frames, still ahead of everything on the ground.
    ring.renderOrder = -9;
    void forEnv;
    return g;
  }

  buildGround() {
    const sand = terrainMaterial("sand", 0x5e5470, 0.9, { ao: false }),
      rock = terrainMaterial("rock", 0x2a2830, 0.92, { ao: false }),
      paving = terrainMaterial("floor", 0x6e6680, 0.86, { ao: false });
    this.rock = rock;
    // The valley floor: flat between the ridges, rising behind them.
    const geo = new THREE.PlaneGeometry(120, 90, 180, 135);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i) - 20;
      p.setZ(i, z);
      const side = Math.max(0, Math.abs(x) - 14.5);
      const dune =
        Math.sin(x * 0.21 + z * 0.08) * 0.6 +
        Math.sin(x * 0.05 - z * 0.13) * 1.2;
      let y =
        Math.min(side * 0.9, 16) +
        (side > 0 ? dune * Math.min(1, side / 6) : 0);
      y += Math.sin(x * 1.3 + z * 0.9) * 0.03;
      if (z < -56) y = -140;
      p.setY(i, y);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, sand);
    ground.receiveShadow = true;
    this.scene.add(ground);
    // The paved path: from the first door through the checkpoint to the far door.
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 50).rotateX(-Math.PI / 2),
      paving,
    );
    path.position.set(0, 0.012, -21);
    path.receiveShadow = true;
    this.scene.add(path);
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2),
      paving,
    );
    plaza.position.set(0, 0.01, -21.5);
    plaza.scale.set(1.35, 1, 0.95);
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    // The cliff below the edge and the plain far beneath it.
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(120, 140, 6), rock);
    cliff.position.set(0, -70.2, -59);
    cliff.receiveShadow = true;
    this.scene.add(cliff);
    const plainGeo = new THREE.PlaneGeometry(2400, 2400, 160, 160).rotateX(
      -Math.PI / 2,
    );
    const q = plainGeo.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i),
        z = q.getZ(i);
      const far = Math.min(1, Math.max(0, (Math.hypot(x, z + 60) - 260) / 500));
      const ridge = Math.max(
        0,
        Math.sin(x * 0.006 + Math.sin(z * 0.004) * 2) * 0.6 +
          Math.sin(x * 0.017 - z * 0.011) * 0.4,
      );
      const mesa = Math.min(1, ridge * 2.2) ** 3;
      q.setY(i, far * mesa * 90 + Math.sin(x * 0.05 + z * 0.03) * 1.5);
    }
    plainGeo.computeVertexNormals();
    const plain = new THREE.Mesh(plainGeo, rock);
    plain.position.y = -140;
    plain.receiveShadow = true;
    this.scene.add(plain);
    // Beacons of the network, burning far out on the plain.
    const beaconMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.6, 3.2, 2.9),
      toneMapped: false,
    });
    let seed = 5;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) {
      const a = (rand() - 0.5) * 1.6,
        d = 180 + rand() * 480;
      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.4 + rand() * 1.6, 0),
        beaconMat,
      );
      beacon.position.set(
        Math.sin(a) * d,
        -136 + rand() * 6,
        -60 - Math.cos(a) * d,
      );
      beacon.scale.y = 2.4;
      this.scene.add(beacon);
    }
    // The valley floor ends at the cliff edge; the ridges' colliders stand where their faces are.
    this.world.add(-16, -10, -56, 16, 0, 14, "rock");
  }

  // Basalt ridges wall the valley on three sides; their faces stand on the colliders, and they
  // fall away towards the cliff edge so the far door stands against the open sky.
  buildRidges() {
    const w = this.world;
    const noise = (x, z) =>
      Math.sin(x * 0.31 + z * 0.17) * 1.2 +
      Math.sin(x * 0.07 - z * 0.23 + 1.3) * 1.8 +
      Math.sin((x + z) * 0.53) * 0.5;
    const top = (x, z) => {
      const fall = Math.min(1, Math.max(0, (-z - 36) / 16));
      return 11 + noise(x, z) - fall * 9.5;
    };
    const opts = { top, base: -2, step: 0.7 };
    this.scene.add(
      buildRidge(this.rock, {
        ...opts,
        points: [
          [-14, 13],
          [-14, -56],
        ],
      }),
    );
    this.scene.add(
      buildRidge(this.rock, {
        ...opts,
        points: [
          [14, -56],
          [14, 13],
        ],
      }),
    );
    this.scene.add(
      buildRidge(this.rock, {
        ...opts,
        points: [
          [14, 13],
          [-14, 13],
        ],
      }),
    );
    w.add(-40, -10, -60, -14, 30, 14, "rock", null, { grab: false });
    w.add(14, -10, -60, 40, 30, 14, "rock", null, { grab: false });
    w.add(-40, -10, 13, 40, 30, 30, "rock", null, { grab: false });
  }

  // The first door's twin, which the explorer steps out of (and can step back through), and
  // the far door at the end of the valley, which opens onto the sky beyond.
  async buildGates() {
    const { Gate } = this.services;
    const recolour = (g, tint = 1) => {
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        // Ash and basalt instead of sandstone: the same builders, another world.
        const c = mineralBaseColor(o.material);
        const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
        if (c.r > c.b * 1.3)
          o.material.color.copy(
            mineralColor(
              o.material,
              new THREE.Color(
                lum * 0.55 * tint,
                lum * 0.5 * tint,
                lum * 0.66 * tint,
              ),
            ),
          );
      });
      return g;
    };
    const arrivalModel = recolour(
      (await this.assets.make("far_gate")) || new THREE.Group(),
    );
    this.arrival = new Gate({
      scene: this.scene,
      world: this.world,
      renderer: this.renderer,
      sound: this.services.sound,
      assets: this.assets,
    });
    await this.arrival.build({
      x: 0,
      z: 0,
      glyphs: ["twin", "spiral", "peak"],
      model: arrivalModel,
      base: "checkpoint",
    });
    // The way home is a membrane of light, lit from the moment the explorer arrives. It is
    // seen only from the valley side: from behind, where the camera trails an explorer who
    // has just stepped through, the ring stays open.
    this.arrival.uniforms.uHasView.value = 0;
    this.arrival.disc.material.side = THREE.BackSide;
    this.arrival.lightScale = 0.25;
    this.arrival.forceOpen();
    this.gateCenter.copy(this.arrival.center);
    this.daisTop = this.arrival.daisTop;
    this.clipPlane.set(new THREE.Vector3(0, 0, -1), this.gateCenter.z - 0.05);

    const exitModel = recolour(
      (await this.assets.make("far_gate")) || new THREE.Group(),
      1.15,
    );
    this.exitGate = new Gate({
      scene: this.scene,
      world: this.world,
      renderer: this.renderer,
      sound: this.services.sound,
      assets: this.assets,
    });
    await this.exitGate.build({
      ...EXIT,
      glyphs: ["crescent", "waves", "disc"],
      model: exitModel,
      base: "checkpoint",
    });
  }

  async buildSpires() {
    const place = async (x, y, z, scale, yaw, solid) => {
      const spire = (await this.assets.make("basalt_spire")) || fallbackSpire();
      spire.position.set(x, y, z);
      spire.scale.multiplyScalar(scale);
      spire.rotation.y = yaw;
      this.scene.add(spire);
      if (solid)
        this.world.addRound(x, z, 1.55 * scale, -10, 9 * scale, "rock");
    };
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // Against the ridges, where they break up the long walls without closing the valley.
    for (const [x, z, s] of [
      [-12.2, -9, 0.95],
      [12.3, -14, 1.1],
      [-12.4, -38, 0.9],
      [12.2, -40, 1.0],
      [-11.8, 6, 0.85],
      [11.9, 4, 0.9],
    ])
      await place(x, 0, z, s, rand() * 6, true);
    for (let i = 0; i < 26; i++) {
      const a = (rand() - 0.5) * 1.9,
        d = 120 + rand() * 520;
      await place(
        Math.sin(a) * d,
        -140,
        -60 - Math.cos(a) * d,
        2.5 + rand() * 5,
        rand() * 6,
        false,
      );
    }
    // Another door, far out on the plain.
    const far = await this.assets.make("far_gate");
    if (far) {
      await dressGate(far, "checkpoint", this.assets);
      far.position.set(-70, -140, -330);
      far.rotation.y = 0.5;
      far.scale.setScalar(2.2);
      far.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.color.multiplyScalar(0.45);
        }
      });
      this.scene.add(far);
    }
  }

  // Fallen basalt at the foot of the valley's walls, between the spires and the lumen plants.
  async buildBoulders() {
    for (const [x, z, yaw, k] of [
      [-11.2, -19.6, 0.5, 1.1],
      [11.1, -25.8, 2.2, 1],
      [-11.4, -28.6, 1.4, 0.9],
      [11.3, -35.2, 0.3, 1.15],
      [-10.9, -42.6, 2.8, 1.05],
      [10.9, -11.6, 1.8, 0.85],
      [-11.3, -1.2, 0.9, 0.95],
    ]) {
      const o = await this.assets.make("boulder_cluster");
      if (!o) return;
      o.position.set(x, 0, z);
      o.rotation.y = yaw;
      o.scale.setScalar(k);
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.color.lerp(mineralColor(m.material, 0x3b3346), 0.72);
        m.castShadow = m.receiveShadow = true;
      });
      this.scene.add(o);
      this.world.addRound(x, z, 1.2 * k, -10, 2.2 * k, "rock");
    }
  }

  // The builders' lanterns light the path from door to door.
  async buildLanterns() {
    const spots = [
      [-3.2, -6],
      [3.2, -6],
      [-3.2, -12.5],
      [3.2, -12.5],
      [-12.6, -17],
      [12.6, -20.5],
      [-3.2, -35],
      [3.2, -35],
      [-6.8, -40.6],
      [6.8, -40.6],
    ];
    this.lanternMats = [];
    for (const [x, z] of spots) {
      const o = await this.assets.make("path_lantern", { keepHierarchy: true });
      const at = o?.userData.light ? o.userData.light[1] : 2.1;
      if (o) {
        o.position.set(x, 0, z);
        o.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        o.userData.parts?.crystal?.traverse((m) => {
          if (!m.isMesh) return;
          m.material = m.material.clone();
          m.material.emissive = new THREE.Color(0x39e3d0);
          m.material.emissiveIntensity = 2.4;
          this.lanternMats.push(m.material);
        });
        this.scene.add(o);
      }
      this.world.addRound(x, z, 0.32, -10, 2.4, "prop", null, {
        cam: false,
        thin: true,
      });
      this.pools.add(x, z, 3.4, 0x39e3d0, 0.5);
      this.pools.addFlare(x, at, z);
    }
  }

  // Specks of light in the black sand that twinkle as the explorer walks by.
  buildSparkles() {
    const count = 700;
    const pos = new Float32Array(count * 3),
      seed = new Float32Array(count);
    let s = 3;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 27;
      pos[i * 3 + 1] = 0.03;
      pos[i * 3 + 2] = 10 - rand() * 64;
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    this.sparkleUniforms = {
      uTime: { value: 0 },
      uScale: { value: innerHeight * 0.5 },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.sparkleUniforms,
      vertexShader: /* glsl */ `
        attribute float seed; uniform float uTime; uniform float uScale; varying float vA; varying float vS;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vA = pow(max(0.0, sin(uTime * (0.8 + seed * 2.0) + seed * 60.0)), 6.0);
          vS = seed;
          gl_PointSize = (0.05 + seed * 0.05) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vS;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          vec3 c = mix(vec3(1.6, 0.9, 2.2), vec3(0.6, 2.2, 2.0), step(0.7, vS));
          gl_FragColor = vec4(c * smoothstep(0.5, 0.0, d) * vA, 1.0);
        }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
  }

  // Glowing plants at the valley's edges: the only soft, warm light in this world.
  async buildFlora() {
    this.buildSparkles();
    let seed = 23;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [x, z] of [
      [-11.6, -4],
      [11.4, -8],
      [-11.8, -24],
      [11.6, -30],
      [-11, -46],
      [10.8, -48],
      [10.6, 8],
      [-10.4, 9],
      // Smaller ones between, so the valley's edges glow all the way along.
      [-11.2, -13],
      [11.3, -21],
      [-11.4, -33],
      [11.2, -40.5],
      [-10.9, 1.5],
      [10.8, 0.5],
    ]) {
      const plant = await this.assets.make("lumen_plant", {
        keepHierarchy: true,
      });
      if (!plant) return;
      plant.position.set(x, 0, z);
      plant.rotation.y = rand() * 6;
      plant.scale.multiplyScalar(0.8 + rand() * 0.6);
      plant.userData.parts?.pods?.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xd98cff);
        o.material.emissiveIntensity = 1.8;
      });
      this.scene.add(plant);
      this.pools.add(x, z, 3, 0xd98cff, 0.45);
      this.world.addRound(x, z, 0.4, -10, 1.2, "prop", null, {
        cam: false,
        thin: true,
      });
    }
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
    this.composer.addPass(new UnrealBloomPass(size, 0.55, 0.4, 1.1));
    this.composer.addPass(new OutputPass());
  }

  // --- the explorer's side: the orb, the fight, knockouts -----------------------------------------
  async wire({ hero, heroModel, follow, dust, state, onKnockout, palm }) {
    this.palm = palm || null;
    this.hero = hero;
    this.heroModel = heroModel;
    this.follow = follow;
    this.dust = dust;
    this.state = state;
    const cp = this.checkpoint;
    const mesh =
      (await this.assets.make("sun_disc", { keepHierarchy: true })) ||
      fallbackDisc();
    this.disc = new SunDisc(mesh, this.world, this.services.sound);
    this.disc.display(this.scene, V(LAYOUT.bin.x, 1.15, LAYOUT.bin.z));
    this.disc.beams.push(cp.beam);
    this.disc.targets.push(...cp.guards, cp.lampTarget());
    cp.disc = this.disc;
    const hud = this.services.hud;
    // The fight's cards follow one another instead of replacing a card still being read.
    cp.onTakeDisc = () => {
      this.disc.attach(this.hand(), this.palm);
      this.services.sound?.setMusic("fight");
      hud.hint(
        t("Relay orb"),
        t(
          "{press} to pulse what you aim at: a pulse offends a Warden, a charged one stuns it. {press2} to roll away.",
          { press: hud.press("throw", true), press2: hud.press("roll", true) },
        ),
        10,
        { queue: true },
      );
    };
    for (const warden of cp.guards)
      warden.onStunned = () => {
        if (this.saidStun) return;
        this.saidStun = true;
        hud.subtitle(t("Stunned, not hurt. That buys me a few seconds."), 3.5);
      };
    cp.onNearBin = () =>
      hud.subtitle(
        t("Their gear, confiscated. And that is Mira's relay orb."),
        4,
      );
    cp.onBriefed = () => {
      hud.health(cp.health, 4);
      hud.hint(
        t("Stamps"),
        t(
          "A Warden stamps an offender where they stand, and a ring marks the spot. Stand on a plate, then step out of the ring before the stamp lands.",
        ),
        11,
        { queue: true },
      );
    };
    cp.onVoid = () =>
      hud.hint(
        t("Matching"),
        t(
          "Each Warden's stamp carries the glyph shown over its head. Lead the matching Warden onto each plate.",
        ),
        10,
        { queue: true },
      );
    cp.onApproved = () => {
      if (cp.plates.every((p) => p.stamped))
        this.services.sound?.setMusic("world2");
    };
    cp.onLampMiss = () =>
      hud.hint(
        t("Light"),
        t(
          "Aim at the crystal and {press} to charge the orb, then pulse the lamp.",
          { press: hud.press("throw") },
        ),
        9,
        { queue: true },
      );
    cp.onOpen = () => this.services.sound?.setMusic("world2");
    cp.onStrike = (warden, sx, sz, hit) => {
      this.dust.burst(sx, warden.feet, sz, 1.2, 12);
      this.follow.shake = Math.max(this.follow.shake, hit ? 0.9 : 0.35);
      this.services.sound?.play("stamp");
      if (hit && hero.takeHit(warden.pos.x, warden.pos.z, 6)) {
        cp.health -= damageAmount();
        hud.health(Math.max(0, cp.health), 4);
        if (cp.health <= 0) this.knockout(onKnockout);
      }
    };
  }

  // The orb rides in the right hand; with hand joints it sits in the palm.
  hand() {
    const j = this.heroModel.userData.joints;
    return j.rightHand || j.rightLowerArm;
  }

  knockout(onKnockout) {
    const cp = this.checkpoint;
    cp.calmAll();
    onKnockout(() => {
      const r = LAYOUT.respawn;
      this.hero.spawn(r.x, r.z, 0, r.yaw);
      cp.health = 4;
      this.services.hud.health(cp.health, 4);
      cp.say(t("Back of the queue."), "clerk", 2.4, true);
      this.services.sound?.setMusic("world2");
    });
  }

  // --- entering and leaving ------------------------------------------------------------------------
  enter({ through = null, arrive = false, back = null } = {}) {
    this.active = true;
    const hero = this.hero;
    if (back !== null) {
      // Back out of the far door from the isles, still heading away from it.
      const E = this.exitGate;
      hero.spawn(E.center.x + back, E.center.z + 0.9, E.daisTop + 0.02, 0);
    } else if (through) {
      // Stepping through the first door: the same offset from its twin, still walking on.
      hero.pos.x = this.gateCenter.x + through.x;
      hero.pos.z = this.gateCenter.z + through.z;
      hero.feet = this.daisTop + through.feet;
    } else if (arrive) hero.spawn(0, -3.6, 0.52, Math.PI);
    hero.world = this.world;
    const cp = this.checkpoint;
    hero.level = {
      interactables: () => cp.interactables(),
      use: (ref) => ref.use(),
      moveBlock: () => false,
    };
    this.follow.world = this.world;
    this.follow.snap(hero);
    this.heroModel.removeFromParent();
    this.scene.add(this.heroModel);
    if (this.disc?.state === "stowed") this.disc.attach(this.hand(), this.palm);
    this.hud?.setAddress?.(["crescent", "waves", "disc"]);
    this.services.hud.setAddress(["crescent", "waves", "disc"]);
    for (const p of cp.plates) if (p.stamped) this.services.hud.light(p.glyph);
    if (cp.phase !== "arrive" && cp.phase !== "briefing")
      this.services.hud.health(cp.health, 4);
  }

  leave() {
    this.active = false;
    this.checkpoint.review?.cancel();
    this.disc?.stow();
    this.services.hud.hideHealth();
  }

  // The checkpoint as the explorer left it for the isles: the address stamped, the lamp lit,
  // the barrier up and the far door open, with the orb carried away. Set quietly, without
  // the clerk's lines or the stamps' sounds.
  solve() {
    const cp = this.checkpoint;
    for (const p of cp.plates) {
      p.stamped = true;
      for (const m of p.inlayMats) m.emissiveIntensity = 2.6;
      p.glyphMat.emissiveIntensity = 3.2;
    }
    for (const g of cp.guards) g.calm(null);
    cp.lampLit = true;
    cp.phase = "open";
    cp.lines = [];
    cp.barrierOpen = 1;
    this.exitGate.forceOpen();
    if (this.disc.state === "display") this.disc.attach(this.hand(), this.palm);
    this.disc.stow();
  }

  // Development shortcut: the address stamped, the orb in hand and the barrier up.
  devOpenBarrier() {
    const cp = this.checkpoint;
    for (const p of cp.plates) cp.approve(p);
    this.disc.attach(this.hand(), this.palm);
    cp.lampLit = true;
    cp.phase = "open";
    cp.lines = [];
  }

  startStory() {
    this.checkpoint.guideKey = null;
    clearTimeout(this.arrivalLine);
    this.arrivalLine = setTimeout(() => {
      if (this.active && this.checkpoint.phase === "arrive")
        this.services.hud.subtitle(t("So this is where they went."), 3.5);
    }, 1800);
  }

  // Walking back through the door the explorer came in by: its membrane leads home.
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

  update(dt, hero, state, { throw: throwPressed, camera }) {
    const cp = this.checkpoint;
    cp.update(dt, hero, camera);
    if (
      recoverHealth(cp, dt, {
        sound: this.services.sound,
        // While the Wardens are on duty the whole plaza is their fight.
        active: ["lamp", "open"].includes(cp.phase),
      })
    )
      this.services.hud.health(cp.health, 4);
    cp.guide(this.services.hud, hero, this.disc);
    this.sparkleUniforms.uTime.value += dt;
    this.time += dt;
    this.arrival.update(dt);
    this.exitGate.update(dt);
    this.pools.update(this.time);
    if (
      throwPressed &&
      this.disc.ready &&
      !state.cinematic &&
      !state.processing &&
      ["ground", "air", "roll"].includes(hero.state) &&
      this.disc.throw(this.scene, camera, hero.yaw)
    )
      hero.throwT = 0;
    this.disc.update(dt, hero, () => (hero.catchT = 0));
    hero.throwT = (hero.throwT ?? 9) + dt;
    hero.catchT = (hero.catchT ?? 9) + dt;
    hero.holding = this.disc.ready;
    if (
      this.disc.charged &&
      this.disc.ready &&
      !this.saidCharged &&
      cp.phase === "lamp"
    ) {
      this.saidCharged = true;
      this.services.hud.hint(
        t("Charged"),
        t("The orb is charged: aim at the lamp and {press}.", {
          press: this.services.hud.press("throw"),
        }),
        6,
        { queue: true },
      );
    }
    // The explorer and the Wardens push each other apart instead of overlapping.
    for (const g of cp.guards) {
      if (g.state === "enter" || g.state === "hidden") continue;
      const dx = hero.pos.x - g.pos.x,
        dz = hero.pos.z - g.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.85 && Math.abs(hero.feet - g.feet) < 1) {
        const push = (0.85 - d) / d;
        hero.pos.x += dx * push * 0.6;
        hero.pos.z += dz * push * 0.6;
        g.pos.x -= dx * push * 0.4;
        g.pos.z -= dz * push * 0.4;
      }
    }
    // The far door: once the barrier is up, stepping onto its dais opens it.
    const E = this.exitGate;
    if (cp.phase === "open" && E.phase === "closed") {
      const onDais =
        Math.abs(hero.pos.x - E.center.x) < 5.5 &&
        hero.pos.z < E.center.z + 6 &&
        hero.feet > E.daisTop - 0.6;
      if (onDais) {
        E.onOpen = () => this.services.sound?.setMusic("finale");
        // The terrace between the checkpoint wall and the dais is 9 m deep: the shots stay on it.
        E.open(
          state,
          [
            { at: 0, eye: [-6, -2.5, 10.4], look: [0, -0.6, 0] },
            { at: 2.2, eye: [-4.6, -2.6, 10], look: [0, -0.4, 0] },
            { at: 5.6, eye: [-3, -2.5, 8.8], look: [0, -0.4, 0] },
            { at: 8.9, eye: [-1.2, -2.3, 6.8], look: [0, -0.8, -2] },
            { at: 9.6, eye: [-1, -2.3, 6.6], look: [0, -0.8, -2] },
          ],
          { sequence: true },
        );
      }
    }
    if (E.isOpen && cp.phase === "open" && !this.exitHinted) {
      this.exitHinted = true;
    }
    this.mira.update(dt, hero, state);
  }

  // Seen through the first gate: drawn into the portal's render target by the caller.
  renderInto(renderer, camera) {
    this.sky.position.copy(camera.position);
    this.followShadow(camera.position);
    renderer.render(this.scene, camera);
  }

  followShadow(p) {
    const t = V(Math.round(p.x), 0, Math.round(p.z));
    this.star.target.position.copy(t);
    this.star.position.copy(t).addScaledVector(STAR, 60);
    this.star.target.updateMatrixWorld();
  }

  render(camera) {
    this.sky.position.copy(camera.position);
    this.followShadow(
      this.hero ? V(this.hero.pos.x, 0, this.hero.pos.z) : camera.position,
    );
    this.exitGate.renderPortal(camera);
    this.pass.camera = camera;
    this.composer.render();
  }

  prepareForCompile(on) {
    prepareVisuals(this, on, [
      [this.exitGate.disc, "visible", true],
      [this.exitGate.uniforms.uClear, "value", 1],
      [this.exitGate.ground, "visible", true],
      [this.exitGate.ring, "visible", true],
      ...this.checkpoint.stamps.items.flatMap(({ m }) => [
        [m, "visible", true],
        [m.material, "opacity", 1],
      ]),
      ...this.checkpoint.telegraphs.items.flatMap(({ m, uniforms }) => [
        [m, "visible", true],
        [uniforms.uFill, "value", 1],
      ]),
    ]);
  }

  reset() {
    this.checkpoint.reset();
    this.exitGate.reset();
    this.disc?.reset();
    this.saidCharged = this.saidStun = false;
    this.exitHinted = false;
    this.lastZ = undefined;
    this.arrival.forceOpen();
    this.mira?.reset();
  }

  resize(w, h) {
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.exitGate?.resize();
  }
}

// Soft pools of light on the ground under the lanterns and plants, drawn as additive decals
// instead of point lights so the light count, and so every shader, stays fixed.
class LightPools {
  constructor(scene) {
    this.scene = scene;
    this.pools = [];
    this.flares = [];
  }

  add(x, z, radius, color, strength) {
    this.pools.push({ x, z, radius, color: new THREE.Color(color), strength });
  }

  addFlare(x, y, z) {
    this.flares.push(V(x, y, z));
  }

  build() {
    const geo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    for (const p of this.pools) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: p.color.clone().multiplyScalar(p.strength) },
          uFlicker: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uFlicker; varying vec2 vP;
          void main() {
            float r = length(vP);
            float a = pow(max(0.0, 1.0 - r), 2.2);
            gl_FragColor = vec4(uColor * a * uFlicker, 1.0);
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      // Clear of the sand's ripples, which reach 3 cm: a decal on their crests flickers.
      m.position.set(p.x, 0.05, p.z);
      m.scale.setScalar(p.radius);
      m.renderOrder = 1;
      this.scene.add(m);
      p.mat = mat;
    }
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(160,255,240,0.45)");
    g.addColorStop(1, "rgba(60,220,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const flareMat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(0.5, 1.4, 1.3),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
    });
    for (const f of this.flares) {
      const s = new THREE.Sprite(flareMat);
      s.position.copy(f);
      s.scale.setScalar(0.7);
      this.scene.add(s);
    }
  }

  update(time) {
    for (const [i, p] of this.pools.entries())
      if (p.mat)
        p.mat.uniforms.uFlicker.value =
          0.9 + Math.sin(time * 2.1 + i * 1.7) * 0.1;
  }
}

function fallbackSpire() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({
    color: 0x2a2830,
    roughness: 0.85,
    flatShading: true,
  });
  for (const [x, z, h, tilt] of [
    [0, 0, 9, 0.08],
    [1.2, 0.6, 6, -0.12],
    [-1.0, -0.4, 4.5, 0.15],
  ]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, h, 6), m);
    c.position.set(x, h / 2, z);
    c.rotation.z = tilt;
    c.castShadow = c.receiveShadow = true;
    g.add(c);
  }
  return g;
}

void Stamps;

export default WorldTwo;
