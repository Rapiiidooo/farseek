import * as THREE from "three";
import { Shot } from "./story.js";
import { BAYS, LIGHT } from "./vault.js";

// Behind the sealed door: the builders' memory. A round chamber under a dome on which the
// network is drawn in points and threads of light, six masks with a single slit standing round
// a well of light, and at its far side one more door of the network, whose water shows a world
// nobody has reached. The reveal plays when the door opens; the closing crossing goes through
// that last door.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const MEMORY = {
  center: V(0, 0, -82),
  radius: 13,
  dome: 12.4,
  wall: 10.6,
  next: { x: 0, z: -92.2 },
  masks: [-55, 55, -100, 100, -145, 145].map((deg) =>
    THREE.MathUtils.degToRad(deg),
  ),
  maskRadius: 9.2,
};
const C = MEMORY.center;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function glowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      const a = Math.max(0, Math.exp(-r * r * 5) - Math.exp(-5));
      data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// A world beyond the last door, seen only through its water: dusk over stepped mesas, two moons,
// a low gold mist and, far off, another ring of the network.
export class UnknownWorld {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1430);
    this.scene.fog = new THREE.FogExp2(0x3a2a4a, 0.006);
    this.gateCenter = V(0, 4.5, 0);
    this.clipPlane = new THREE.Plane(V(0, 0, -1), this.gateCenter.z - 0.05);
    this.wisp = new THREE.Group();
    this.time = 0;
    this.u = { uTime: { value: 0 } };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.u,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            vec3 view = (viewMatrix * modelMatrix * vec4(position, 0.0)).xyz;
            gl_Position = projectionMatrix * vec4(view, 1.0);
            gl_Position.z = gl_Position.w * 0.99999;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec3 vDir;
          float h(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
          vec3 moon(vec3 d, vec3 at, float size, vec3 lit, vec3 shade) {
            float c = dot(d, normalize(at));
            float disc = smoothstep(cos(size), cos(size * 0.97), c);
            vec3 side = normalize(at - vec3(0.4, 0.0, 0.2));
            float light = clamp(0.5 + 0.5 * dot(normalize(d - normalize(at) * c), side) * 3.0, 0.0, 1.0);
            float glow = exp(-max(0.0, acos(clamp(c, -1.0, 1.0)) - size) * 18.0) * 0.25;
            return mix(shade, lit, light) * disc + lit * glow;
          }
          void main() {
            vec3 d = normalize(vDir);
            float y = d.y;
            vec3 col = mix(vec3(0.85, 0.42, 0.3), vec3(0.32, 0.16, 0.36), smoothstep(-0.02, 0.22, y));
            col = mix(col, vec3(0.05, 0.04, 0.12), smoothstep(0.2, 0.75, y));
            col = mix(col, vec3(0.14, 0.08, 0.12), smoothstep(0.0, -0.2, y));
            vec3 g = floor(d * 240.0);
            col += vec3(0.95, 0.9, 1.0) * step(0.9975, h(g)) * smoothstep(0.25, 0.6, y) * (0.6 + 0.4 * sin(uTime * 2.0 + h(g + 3.0) * 30.0));
            col += moon(d, vec3(-0.45, 0.32, -0.83), 0.11, vec3(1.0, 0.94, 0.84), vec3(0.18, 0.15, 0.2));
            col += moon(d, vec3(0.38, 0.19, -0.9), 0.045, vec3(1.0, 0.62, 0.38), vec3(0.2, 0.1, 0.1));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.scene.add(new THREE.HemisphereLight(0xe0bfd8, 0x6a4646, 1.5));
    const sun = new THREE.DirectionalLight(0xffc9a0, 1.8);
    sun.position.set(-30, 18, -60);
    this.scene.add(sun);
    // The sun sits behind the mesas; the dusk sky lights the faces turned to the viewer.
    const dusk = new THREE.DirectionalLight(0xa894d0, 0.9);
    dusk.position.set(20, 30, 60);
    this.scene.add(dusk);
    // Stepped mesas in rows to the horizon.
    const rock = new THREE.MeshStandardMaterial({
      color: 0x6e4a54,
      roughness: 0.95,
    });
    rock.name = "stone";
    const cap = new THREE.MeshStandardMaterial({
      color: 0xa0706a,
      roughness: 0.9,
    });
    cap.name = "stone";
    let seed = 41;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // Mesas flank a long open plain, so the view through the door runs out to the far ring.
    for (let i = 0; i < 30; i++) {
      const far = 70 + rand() * 280;
      const side = i % 2 ? 1 : -1;
      const x =
        side * (34 + rand() * far * 0.7) +
        (far > 280 ? (rand() - 0.5) * 120 : 0);
      const z = -far;
      const w = 14 + rand() * 34,
        h = 10 + rand() * 34;
      for (let k = 0; k < 3; k++) {
        const s = 1 - k * 0.24;
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(w * s, h / 3, w * 0.7 * s),
          k === 2 ? cap : rock,
        );
        step.position.set(x, -8 + (h / 3) * (k + 0.5), z);
        step.rotation.y = rand() * 0.6;
        this.scene.add(step);
      }
    }
    // The far ring on the nearest mesa, lit as the builders light theirs.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.7, 10, 48),
      new THREE.MeshStandardMaterial({
        color: 0x3a3531,
        roughness: 0.7,
        emissive: new THREE.Color(LIGHT),
        emissiveIntensity: 0.6,
      }),
    );
    ring.position.set(10, 11.9, -150);
    ring.rotation.y = -0.25;
    this.scene.add(ring);
    for (const [w, h, d, y] of [
      [34, 6, 26, -6],
      [26, 6, 20, 0],
      [18, 3.2, 14, 4.6],
    ]) {
      const mesa = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        y > 4 ? cap : rock,
      );
      mesa.position.set(10, y, -150);
      this.scene.add(mesa);
    }
    // A low mist the colour of the dusk.
    this.mistU = { uTime: { value: 0 } };
    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          this.mistU,
        ]),
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
          float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5);
            float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
            float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5);
            float e = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
            return mix(mix(a, b, f.x), mix(c, e, f.x), f.y); }
          void main() {
            vec2 p = vW.xz * 0.02 + vec2(uTime * 0.01, 0.0);
            float m = n(p) * 0.6 + n(p * 2.3 + 4.0) * 0.4;
            vec3 col = mix(vec3(0.42, 0.26, 0.36), vec3(0.95, 0.66, 0.46), smoothstep(0.3, 0.85, m));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }`,
      }),
    );
    mist.position.y = -6;
    this.scene.add(mist);
  }

  update(dt) {
    this.time += dt;
    this.u.uTime.value = this.time;
    this.mistU.uTime.value = this.time;
  }

  renderInto(renderer, camera) {
    renderer.render(this.scene, camera);
  }

  prepareForCompile() {}

  reset() {
    this.time = 0;
  }
}

export class VaultMemory {
  constructor(vault) {
    this.vault = vault;
    this.scene = vault.scene;
    this.world = vault.world;
    this.assets = vault.assets;
    this.masks = [];
    this.wisps = [];
    this.time = 0;
    this.phase = "sealed";
  }

  async build() {
    const { vault, scene, world } = this;
    const m = vault.mat,
      S = vault.masonry;
    const texture = glowTexture();
    // The round chamber: a floor, a wall turned about the centre and open to the south where the
    // sealed door stands, and a dome open to the sky.
    S.block("memory", -14.5, -2, -96.5, 14.5, 0, -68.3, m.bone, m.bone, {
      plain: true,
    });
    S.block("memory", -15, 0, -71.6, -6.6, 11.4, -68.3, m.wall, m.wallTop);
    S.block("memory", 6.6, 0, -71.6, 15, 11.4, -68.3, m.wall, m.wallTop);
    S.block("memory", -6.6, 11, -71.6, 6.6, 12.8, -68.3, m.wall, m.wallTop, {
      solid: false,
    });
    S.block("nave", -7.3, 0, -69, -6.4, 11, -67.85, m.wall, m.wallTop);
    S.block("nave", 6.4, 0, -69, 7.3, 11, -67.85, m.wall, m.wallTop);
    const R = MEMORY.radius;
    const wallProfile = [
      [R - 0.0, 0],
      [R - 0.0, 0.7],
      [R - 0.35, 0.7],
      [R - 0.35, 7.4],
      [R - 0.15, 7.4],
      [R - 0.15, 8.0],
      [R - 0.35, 8.0],
      [R - 0.35, MEMORY.wall - 0.6],
      [R - 0.75, MEMORY.wall - 0.6],
      [R - 0.75, MEMORY.wall],
      [MEMORY.dome, MEMORY.wall],
    ];
    const wall = new THREE.LatheGeometry(
      wallProfile.reverse().map(([r, y]) => new THREE.Vector2(r, y)),
      60,
      Math.PI / 6,
      (Math.PI * 5) / 3,
    );
    const wallMesh = new THREE.Mesh(wall, m.wall);
    wallMesh.position.copy(C);
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);
    const domeProfile = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.acos(2.4 / MEMORY.dome);
      domeProfile.push(
        new THREE.Vector2(
          Math.cos(a) * MEMORY.dome,
          MEMORY.wall + Math.sin(a) * MEMORY.dome * 0.82,
        ),
      );
    }
    this.domeMat = m.ceiling;
    const dome = new THREE.Mesh(
      new THREE.LatheGeometry(domeProfile.reverse(), 64),
      this.domeMat,
    );
    dome.position.copy(C);
    scene.add(dome);
    this.oculusY =
      MEMORY.wall + Math.sin(Math.acos(2.4 / MEMORY.dome)) * MEMORY.dome * 0.82;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.62) continue;
      const x = C.x + Math.sin(a) * 13.9,
        z = C.z + Math.cos(a) * 13.9;
      world.add(x - 1.25, 0, z - 1.25, x + 1.25, 11, z + 1.25, "rock", null, {
        grab: false,
      });
    }
    // The well of light at the centre, and its column.
    this.wellU = { uTime: { value: 0 }, uPower: { value: 0.2 } };
    const well = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 64).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: this.wellU,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xz / 2.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform float uTime; uniform float uPower; varying vec2 vP;
          void main(){
            float r = length(vP);
            float rings = pow(max(0.0, 0.5 + 0.5 * sin(r * 28.0 - uTime * 2.2)), 6.0) * (1.0 - r);
            float rim = smoothstep(0.86, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r));
            float heart = exp(-r * r * 9.0);
            vec3 col = vec3(0.25, 1.6, 1.45) * (rings * 0.8 + rim * 1.2 + heart * 1.4) * uPower;
            gl_FragColor = vec4(col, clamp(rings + rim + heart, 0.0, 1.0) * min(1.0, uPower * 2.0));
          }`,
      }),
    );
    well.position.set(C.x, 0.02, C.z);
    well.renderOrder = 2;
    scene.add(well);
    S.block(
      "memory",
      C.x - 3.1,
      0,
      C.z - 3.1,
      C.x + 3.1,
      0.01,
      C.z + 3.1,
      m.basalt,
      m.basalt,
      {
        solid: false,
        plain: true,
      },
    );
    this.columnU = { uTime: { value: 0 }, uPower: { value: 0 } };
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(
        1.2,
        2.2,
        this.oculusY + 4,
        32,
        1,
        true,
      ).translate(0, (this.oculusY + 4) / 2, 0),
      new THREE.ShaderMaterial({
        uniforms: this.columnU,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vView;
          void main(){ vUv = uv; vec4 p = modelViewMatrix * vec4(position, 1.0); vView = p.xyz; gl_Position = projectionMatrix * p; }`,
        fragmentShader: /* glsl */ `uniform float uTime; uniform float uPower; varying vec2 vUv; varying vec3 vView;
          void main(){
            float flow = 0.6 + 0.4 * sin(vUv.y * 30.0 - uTime * 3.0 + vUv.x * 18.0);
            float fade = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
            float a = fade * flow * 0.22 * uPower * smoothstep(0.5, 3.0, length(vView));
            gl_FragColor = vec4(vec3(1.0, 0.82, 0.45) * a, 1.0);
          }`,
      }),
    );
    column.position.copy(C);
    column.renderOrder = 6;
    column.frustumCulled = false;
    column.visible = false;
    scene.add(column);
    this.column = column;

    // The six masks, one for each world, round the well and facing it.
    const proto = await this.assets.make("builder_mask", {
      keepHierarchy: true,
    });
    MEMORY.masks.forEach((phi, i) => {
      const x = C.x + Math.sin(phi) * MEMORY.maskRadius,
        z = C.z + Math.cos(phi) * MEMORY.maskRadius;
      const object = proto ? proto.clone(true) : new THREE.Group();
      object.position.set(x, 0, z);
      object.rotation.y = phi + Math.PI;
      scene.add(object);
      const slit = [];
      object.traverse((o) => {
        if (!o.isMesh || o.name !== "slit") return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(LIGHT);
        o.material.emissiveIntensity = 0;
        slit.push(o.material);
      });
      object.updateMatrixWorld(true);
      const at = object.userData.slit
        ? V(...object.userData.slit).applyMatrix4(object.matrixWorld)
        : V(x, 2.5, z);
      world.addRound(x, z, 0.85, 0, 3.4, "prop");
      this.masks.push({ object, slit, at, bay: BAYS[i].id, lit: 0 });
    });

    // The network drawn on the dome: the six worlds crossed, the one beyond, and many more.
    this.buildNetwork(texture);
    // The lights that leave the masks.
    for (let i = 0; i < 6; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color: 0xffd58a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      sprite.scale.setScalar(1.1);
      sprite.visible = false;
      sprite.renderOrder = 7;
      scene.add(sprite);
      this.wisps.push(sprite);
    }

    // The next door: a ring of the network on its own base, its water showing the unknown world.
    const { Gate } = vault.services;
    this.epilogue = new UnknownWorld();
    this.gate = new Gate({
      scene,
      world,
      renderer: vault.renderer,
      sound: vault.services.sound,
      assets: this.assets,
    });
    await this.gate.build({
      x: MEMORY.next.x,
      z: MEMORY.next.z,
      glyphs: ["twin", "star", "disc"],
    });
    this.gate.destination = this.epilogue;
    this.gate.lightScale = 0.5;
  }

  buildNetwork(texture) {
    const dome = (lon, lat, r = MEMORY.dome - 0.25) =>
      V(
        C.x + Math.sin(lon) * Math.cos(lat) * r,
        MEMORY.wall + Math.sin(lat) * r * 0.82,
        C.z + Math.cos(lon) * Math.cos(lat) * r,
      );
    let seed = 2207;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const nodes = [];
    // The six crossed worlds in a chain over the chamber, then the unknown one at its end.
    for (let i = 0; i < 7; i++)
      nodes.push({
        p: dome(Math.PI * 0.85 - i * 0.3, 0.5 + Math.sin(i * 1.3) * 0.12),
        known: i < 6,
        next: i === 6,
      });
    for (let i = 0; i < 46; i++)
      nodes.push({
        p: dome(rand() * Math.PI * 2, 0.12 + rand() * 0.95),
        known: false,
      });
    const positions = new Float32Array(nodes.length * 3),
      kinds = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
      n.p.toArray(positions, i * 3);
      kinds[i] = n.next ? 2 : n.known ? 1 : 0;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("kind", new THREE.BufferAttribute(kinds, 1));
    this.mapU = {
      uTime: { value: 0 },
      uKnown: { value: 0 },
      uMany: { value: 0 },
      uNext: { value: 0 },
      uScale: { value: 600 },
    };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.mapU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: /* glsl */ `
          attribute float kind; uniform float uScale; uniform float uKnown; uniform float uMany; uniform float uNext; uniform float uTime;
          varying vec3 vColor; varying float vA;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float show = kind > 1.5 ? uNext : kind > 0.5 ? uKnown : uMany;
            vColor = kind > 1.5 ? vec3(0.4, 1.8, 1.6) : kind > 0.5 ? vec3(2.2, 1.5, 0.55) : vec3(1.2, 0.95, 0.6);
            vA = show * (kind > 0.5 ? 1.0 : 0.55 + 0.45 * sin(uTime * 1.7 + position.x * 3.1));
            gl_PointSize = (kind > 0.5 ? 0.55 : 0.32) * uScale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `varying vec3 vColor; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float a = exp(-d * d * 4.0) * vA;
            gl_FragColor = vec4(vColor * a, 1.0);
          }`,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = false;
    this.scene.add(this.points);
    // Threads of light between doors: the crossed chain and others among the many.
    const threads = [];
    for (let i = 0; i < 6; i++)
      threads.push([nodes[i].p, nodes[i + 1].p, i < 5 ? 1 : 2]);
    for (let i = 0; i < 26; i++) {
      const a = nodes[7 + Math.floor(rand() * 46)].p,
        b = nodes[7 + Math.floor(rand() * 46)].p;
      if (a.distanceTo(b) > 2 && a.distanceTo(b) < 11) threads.push([a, b, 0]);
    }
    this.threadU = {
      uKnown: { value: 0 },
      uMany: { value: 0 },
      uNext: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.threadU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexShader: /* glsl */ `attribute float kind; varying float vKind;
        void main(){ vKind = kind; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uKnown; uniform float uMany; uniform float uNext; varying float vKind;
        void main(){
          float show = vKind > 1.5 ? uNext : vKind > 0.5 ? uKnown : uMany * 0.5;
          vec3 c = vKind > 1.5 ? vec3(0.3, 1.3, 1.2) : vec3(1.4, 1.0, 0.45);
          gl_FragColor = vec4(c * show * 0.55, 1.0);
        }`,
    });
    const tubes = [];
    this.curves = [];
    for (const [a, b, kind] of threads) {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const lift = mid.clone().sub(C);
      lift.y = (lift.y - MEMORY.wall) / 0.82;
      const r = lift.length();
      const out = mid
        .clone()
        .sub(C)
        .setLength(Math.max(r, MEMORY.dome - 0.6) - 0.35);
      const curve = new THREE.QuadraticBezierCurve3(a, C.clone().add(out), b);
      const tube = new THREE.TubeGeometry(
        curve,
        20,
        kind ? 0.035 : 0.022,
        4,
        false,
      );
      const k = new Float32Array(tube.attributes.position.count).fill(kind);
      tube.setAttribute("kind", new THREE.BufferAttribute(k, 1));
      tubes.push(tube);
      this.curves.push({ curve, kind });
    }
    const merged = mergeTubes(tubes);
    this.threads = new THREE.Mesh(merged, material);
    this.threads.frustumCulled = false;
    this.threads.renderOrder = 6;
    this.threads.visible = false;
    this.scene.add(this.threads);
    // Travellers moving along the threads.
    const count = 60;
    this.travellers = Array.from({ length: count }, (_, i) => ({
      curve: this.curves[(i * 7) % this.curves.length],
      t: (i * 0.137) % 1,
      speed: 0.06 + ((i * 0.31) % 1) * 0.08,
    }));
    const tg = new THREE.BufferGeometry();
    tg.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.motes = new THREE.Points(
      tg,
      new THREE.PointsMaterial({
        map: texture,
        color: 0xffd38a,
        size: 0.35,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 7;
    this.motes.visible = false;
    this.scene.add(this.motes);
  }

  // Everything the reveal shows, at a moment of its timeline: masks waking, lights rising, the
  // network on the dome and the next door. `t` runs from the door's first movement.
  show(t) {
    this.at = t;
    const slit = (i) => smooth(5.2 + i * 0.45, 5.8 + i * 0.45, t);
    this.masks.forEach((mask, i) => {
      mask.lit = slit(i);
      for (const material of mask.slit)
        material.emissiveIntensity = mask.lit * 3;
    });
    this.wellU.uPower.value = 0.2 + smooth(5, 8, t) * 1.2;
    this.column.visible = t > 8.5 && t < 21;
    this.columnU.uPower.value = smooth(8.5, 10, t) * (1 - smooth(18, 21, t));
    const known = smooth(10.5, 12.5, t),
      many = smooth(13, 16, t),
      next = smooth(19.5, 21, t);
    this.mapU.uKnown.value = known;
    this.mapU.uMany.value = many;
    this.mapU.uNext.value = next;
    this.threadU.uKnown.value = known;
    this.threadU.uMany.value = many;
    this.threadU.uNext.value = next;
    this.points.visible = this.threads.visible = known > 0;
    this.motes.visible = many > 0;
    this.motes.material.opacity = many * 0.9;
    this.wisps.forEach((sprite, i) => {
      const start = 8.6 + i * 0.35;
      const k = (t - start) / 7;
      sprite.visible = k > 0 && k < 1;
      if (!sprite.visible) return;
      const from = this.masks[i].at;
      const spin = k * Math.PI * 3 + i;
      const r = THREE.MathUtils.lerp(
        Math.hypot(from.x - C.x, from.z - C.z),
        1.2,
        smooth(0, 0.45, k),
      );
      const y = THREE.MathUtils.lerp(
        from.y,
        this.oculusY + 6,
        smooth(0.25, 1, k),
      );
      sprite.position.set(
        C.x + Math.sin(spin) * r,
        y,
        C.z + Math.cos(spin) * r,
      );
      sprite.material.opacity = smooth(0, 0.08, k) * (1 - smooth(0.85, 1, k));
    });
  }

  update(dt) {
    this.time += dt;
    this.wellU.uTime.value = this.time;
    this.columnU.uTime.value = this.time;
    this.mapU.uTime.value = this.time;
    this.gate.update(dt);
    this.epilogue.update(dt);
    if (this.motes.visible) {
      const p = this.motes.geometry.attributes.position;
      const point = new THREE.Vector3();
      this.travellers.forEach((m, i) => {
        m.t = (m.t + dt * m.speed) % 1;
        m.curve.curve.getPoint(m.t, point);
        p.setXYZ(i, point.x, point.y, point.z);
      });
      p.needsUpdate = true;
    }
  }

  // Straight to the end of the reveal: masks lit, the map drawn and the next door open.
  settle() {
    this.show(30);
    this.mapU.uKnown.value = this.mapU.uMany.value = this.mapU.uNext.value = 1;
    this.threadU.uKnown.value =
      this.threadU.uMany.value =
      this.threadU.uNext.value =
        1;
    this.points.visible = this.threads.visible = this.motes.visible = true;
    this.motes.material.opacity = 0.9;
    this.wellU.uPower.value = 1.4;
    if (this.gate.phase !== "open") {
      const sound = this.gate.sound;
      this.gate.sound = null;
      this.gate.forceOpen();
      this.gate.sound = sound;
    }
    this.phase = "open";
  }

  prepareVisuals() {
    return [
      [this.column, "visible", true],
      [this.points, "visible", true],
      [this.threads, "visible", true],
      [this.motes, "visible", true],
      [this.mapU.uKnown, "value", 1],
      [this.mapU.uMany, "value", 1],
      [this.mapU.uNext, "value", 1],
      ...this.wisps.map((sprite) => [sprite, "visible", true]),
      [this.gate.disc, "visible", true],
      [this.gate.uniforms.uClear, "value", 1],
    ];
  }

  reset() {
    this.phase = "sealed";
    this.time = 0;
    this.show(0);
    this.mapU.uKnown.value = this.mapU.uMany.value = this.mapU.uNext.value = 0;
    this.points.visible = this.threads.visible = this.motes.visible = false;
    this.column.visible = false;
    for (const sprite of this.wisps) sprite.visible = false;
    this.gate.reset();
    this.epilogue.reset();
  }

  telemetry() {
    return {
      phase: this.phase,
      next: {
        phase: this.gate.phase,
        center: this.gate.center.toArray().map((v) => +v.toFixed(2)),
        radius: this.gate.radius,
      },
      masks: this.masks.map((m) => +m.lit.toFixed(2)),
    };
  }
}

function mergeTubes(geos) {
  const pos = [],
    nor = [],
    kind = [],
    idx = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position,
      n = g.attributes.normal,
      k = g.attributes.kind;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      kind.push(k.getX(i));
    }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    base += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("kind", new THREE.Float32BufferAttribute(kind, 1));
  geo.setIndex(idx);
  return geo;
}

// The door opening and the memory behind it, as one skippable shot.
export class RevealShot {
  constructor(vault) {
    this.vault = vault;
    this.memory = vault.memory;
    this.letterbox = true;
    this.t = 0;
    const d = vault.hall.doorCenter;
    const c = C;
    const n = MEMORY.next;
    this.shot = new Shot(
      [
        { at: 0, eye: [1.6, 3.2, d.z + 14], look: [0, 6, d.z] },
        { at: 4.5, eye: [0.6, 2.6, d.z + 7], look: [0, 4.2, d.z] },
        { at: 7.5, eye: [0, 2.2, d.z - 3.5], look: [c.x, 2.2, c.z] },
        { at: 10.5, eye: [-2.4, 1.8, c.z + 6], look: [c.x, 6, c.z] },
        { at: 15, eye: [-1.2, 1.6, c.z + 4.5], look: [c.x, 17, c.z - 1] },
        { at: 19, eye: [1.5, 2.4, c.z + 3], look: [n.x, 5, n.z] },
        { at: 27, eye: [0.8, 2.5, c.z - 1.5], look: [n.x, 4.6, n.z] },
        { at: 33, eye: [0.5, 2.5, c.z - 2.6], look: [n.x, 4.6, n.z] },
      ],
      [],
      vault.services.hud,
    );
    this.beats = [
      [0.4, "reveal:address"],
      [5, "reveal:masks"],
      [9.6, "reveal:fate"],
      [17, "reveal:doors"],
      [22.6, "reveal:us"],
      [27.4, "reveal:next"],
    ];
    this.done = false;
  }

  get skip() {
    return () => {
      this.vault.voice?.stop();
      this.vault.services.hud?.clearSubtitle();
      this.finish(true);
    };
  }

  finish(skipped = false) {
    if (this.done) return;
    this.done = true;
    this.vault.openDoor(1);
    this.memory.settle();
    this.vault.onRevealed?.(skipped);
  }

  update(dt, camera) {
    this.t += dt;
    const t = this.t;
    this.shot.update(dt, camera);
    while (this.beats.length && t >= this.beats[0][0])
      this.vault.onBeat(this.beats.shift()[1]);
    for (const medal of this.vault.hall.medallions)
      this.vault.hall.setMedallion(
        medal,
        1 + 0.6 * Math.max(0, Math.sin(t * 6)) * (1 - smooth(1.5, 3, t)),
      );
    this.vault.openDoor(smooth(1.6, 5, t));
    this.memory.show(t);
    if (t > 17.5 && this.memory.gate.phase === "closed")
      this.memory.gate.open(null, null, { sequence: true });
    if (t >= 33) this.finish();
  }
}

// The last crossing, after the reveal: Nyra and Mira's light go through the new door; the
// camera follows into the world beyond, the continuation card shows, then the credits roll over
// a slow flight through that world.
export class CrossingShot {
  constructor(vault, hero, onDone) {
    this.vault = vault;
    this.hero = hero;
    this.onDone = onDone;
    this.t = 0;
    this.letterbox = true;
    this.probe = new THREE.PerspectiveCamera();
    this.gate = vault.memory.gate;
    this.beyond = vault.memory.epilogue;
    this.from = null;
    this.carded = false;
  }

  get skip() {
    return this.onDone
      ? () => {
          this.t = Math.max(this.t, 11);
        }
      : null;
  }

  update(dt, camera) {
    this.t += dt;
    const t = this.t;
    const g = this.gate.center;
    const h = this.hero;
    h.vel.x = h.vel.y = h.vel.z = 0;
    this.from ||= { p: camera.position.clone(), q: camera.quaternion.clone() };
    if (t < 3.2) {
      this.vault.heroModel.visible = t < 1.2;
      this.probe.position.set(
        g.x + 0.4,
        g.y - 1.4,
        g.z + 7 - smooth(0, 3.2, t) * 6.6,
      );
      this.probe.lookAt(g.x, g.y - 0.8, g.z - 6);
      const k = smooth(0, 1.2, t);
      camera.position.lerpVectors(this.from.p, this.probe.position, k);
      camera.quaternion.slerpQuaternions(this.from.q, this.probe.quaternion, k);
      this.vault.mira.place(
        V(
          g.x - 0.6,
          g.y - 1 + smooth(0, 3, t) * 0.2,
          g.z + 2.4 - smooth(0.6, 2.6, t) * 3,
        ),
      );
    } else {
      if (!this.through) {
        this.through = true;
        this.vault.beyond = true;
        this.vault.services.hud?.warp();
        this.vault.services.sound?.play("cross");
      }
      // Beyond the door: a slow flight over the mist towards the far ring.
      const u = t - 3.2;
      const fly = 1 - Math.exp(-u / 9);
      camera.position.set(
        Math.sin(u * 0.05) * 3,
        3.2 + fly * 6,
        -4 - fly * 46 - u * 0.4,
      );
      camera.lookAt(10 + Math.sin(u * 0.03) * 4, 10, -150);
    }
    if (!this.carded && t > 6.5) {
      this.carded = true;
      const card = document.querySelector("#chapter-card");
      if (card) {
        card.querySelector(".kicker").textContent = "The next crossing";
        card.querySelector("h2").textContent = "Farseek";
        card.querySelector(".sub").textContent = "To be continued.";
        card.classList.add("on");
        setTimeout(() => card.classList.remove("on"), 5600);
      }
    }
    if (t > 12.5 && this.onDone) {
      const done = this.onDone;
      this.onDone = null;
      done();
    }
  }
}
