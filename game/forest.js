import * as THREE from "three";
import { poseBirdFlight } from "./bird-flight.js";
import { DeerGait } from "./deer-gait.js";
import { plantGrass, clumps } from "./grass.js";
import { surface } from "./surfaces.js";
import { forestRoute, forestBorders } from "./forest-route.js";
import { forestBankGeometry } from "./forest-bank.js";
import {
  BOG,
  BOG_STONES,
  bogDepression,
  bogEdge,
  buildBog,
} from "./forest-bog.js";
import { finishMaterial } from "./asset-finish.js";
import { mineralSurface, mineralColor } from "./mineral-surface.js";
import { forestFloor, forestFloorNoise } from "./forest-floor.js";
import { forestLitter } from "./forest-litter.js";
import { buildMountainRanges } from "./mountain-landscape.js";
import { installCastleGrowth } from "./castle-growth.js";
import { weatherStone } from "./stone-weather.js";
import { projectStone } from "./stone-projection.js";
import { prepareVisuals } from "./shader-preparation.js";
import { buildForestLight } from "./forest-light.js";
import {
  wildlifeTarget,
  fallenWildlife,
  resetWildlife,
} from "./forest-wildlife.js";
import { runSteps } from "./work-steps.js";

// WorldFive shares this scene with the frozen gate's view, so crossing preserves the forest.
// The original flight still uses the same giant tree, hill castle and door onto the sea.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Trees either side of the avenue, near to far: [x, z, yaw, scale]. The avenue stays open
// towards the giant tree (a little right of the door's axis) and the castle (further left).
const TREES = [
  [-13, -15, 0.4, 0.95],
  [13.5, -13, 2.1, 1.05],
  [-22, -18, 1.1, 0.9],
  [22, -20, 0.6, 1],
  [-17.5, -29, 1.3, 1.15],
  [13.5, -27, 0.2, 0.9],
  [-29, -38, 2.2, 1.05],
  [27, -35, 0.9, 1.1],
  [-22, -47, 2.7, 1.1],
  [19, -48, 2.4, 1.1],
  [-35, -62, 1.5, 1.2],
  [30, -60, 2.9, 1.15],
  [-27, -80, 0.3, 1.1],
  [33, -84, 1.1, 1.05],
  [-44, -96, 1.9, 1.25],
  [44, -104, 0.5, 1.2],
  [-30, -118, 2.6, 1.15],
  [-12, -126, 1.2, 1.05],
  [38, -132, 2.0, 1.2],
  [-52, -140, 0.8, 1.3],
  [-24, -150, 2.3, 1.2],
  [52, -150, 1.4, 1.25],
];
// The forest going on into the far country, bigger so it reads through the haze.
const FAR_TREES = [
  [-62, -178, 0.3, 1.5],
  [-44, -190, 1.9, 1.4],
  [-8, -186, 2.6, 1.35],
  [34, -182, 0.8, 1.45],
  [58, -196, 1.4, 1.5],
  [80, -170, 2.2, 1.4],
  [-90, -205, 0.6, 1.55],
  [-52, -226, 2.4, 1.5],
  [6, -222, 1.1, 1.45],
  [44, -236, 0.2, 1.5],
  [-108, -250, 1.7, 1.6],
  [96, -248, 2.9, 1.55],
  [-70, -262, 0.9, 1.5],
  [28, -270, 1.6, 1.55],
];
// Mossy boulder clusters beside the avenue: [x, z, yaw, scale].
const BOULDERS = [
  [-5, -19, 0.8, 1.1],
  [6.5, -23, 2.3, 0.9],
  [-7.5, -40, 1.6, 1.3],
  [9, -70, 0.4, 1.4],
  [-10, -92, 2.8, 1.5],
];
// The giant tree to the right of the avenue, and the castle on its hill to the left.
// The giant's hollow faces the door; both are set a little into the ground, so no root tip or
// wall stands clear of it.
const GIANT = { x: 26, z: -150, yaw: -0.17, scale: 1.1, sink: 1.2 };
// Trees collide as drawn below their vines and where the giant's roots lift off the ground,
// so its hollow stays open; higher up, their trunks stand as cylinders that keep the camera
// out. In each tree's own units.
const TREE_SOLID = {
  kind: "prop",
  stand: () => false,
  step: 0.1,
  ceiling: 4,
  trunk: [1.15, 10],
};
// Measured up to 6.5: the fitted bands above it, as wide as the roots there, stay out of reach
// of a jump from the highest ground round the tree.
const GIANT_SOLID = {
  ...TREE_SOLID,
  ceiling: 6.5,
  trunk: [4.6, 29],
  fit: [6.5, 8, 10, 12, 14, 18, 22, 26, 29],
  cell: 0.06,
};
const CASTLE = { x: -40, z: -285, yaw: 0.28, scale: 1.45, sink: 1.5 };
// Hills of the far country: [x, z, height, radius, flat]. A flat hill has a plateau on top.
const HILLS = [
  [CASTLE.x, CASTLE.z, 10, 100, true],
  [60, -300, 30, 80],
  [-150, -320, 36, 90],
  [150, -250, 24, 70],
];
// The last door, on the hill nine metres before the castle's front, facing the forest.
const LAST = { x: -34.5, z: -263, glyphs: ["waves", "spiral", "crescent"] };
// The closing shot's way from the door, [x, z, height over the ground]: down the avenue, left
// of the giant, between the far trees and up the castle's hill, to where it waits before the
// last door while it lights.
const FLIGHT = [
  [-1.2, -16, 3.4],
  [-2, -44, 3.8],
  [5.5, -80, 5],
  [4.5, -112, 7],
  [-4, -148, 9],
  [-15, -170, 11],
  [-25, -192, 13],
  [-30, -216, 18],
  [-33, -234, 18],
  [-34, -243, 15],
];
const FERNS = 70,
  MEADOW = 80,
  MUSHROOMS = 22,
  SPORES = 280,
  FAIRIES = 90;

export class ForestView {
  // `services` (Gate, renderer, sound) build the last door; without them there is none.
  constructor(assets, services = {}) {
    this.assets = assets;
    this.services = services;
    this.scene = new THREE.Scene();
    // The ring's centre stands 4.5 m over the ground, as the great ring's does over the island.
    this.gateCenter = V(0, 4.5, 0);
    this.clipPlane = new THREE.Plane(V(0, 0, -1), this.gateCenter.z - 0.05);
    this.time = 0;
    this.glow = [];
    // Drawn meshes the explorer collides with as drawn, measured by the wildwood's world.
    this.solidMeshes = [];
  }

  async build() {
    const s = this.scene;
    s.background = new THREE.Color(0xadb5a6);
    // Light enough to see the far country: the giant tree clear, the castle in the haze.
    s.fog = new THREE.FogExp2(0xadb5a6, 0.0032);
    this.sky = this.buildSky();
    s.add(this.sky);
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.4);
    sun.position.set(-18, 40, -30);
    s.add(sun, sun.target);
    s.add(new THREE.HemisphereLight(0xccd8d3, 0x999c85, 1.6));
    await runSteps(this.buildGroundSteps(), () => this.assets.yieldWork?.());
    this.bog = buildBog(THREE, s);
    await this.assets.yieldWork?.();
    this.buildRanges();
    const rand = seeded(11);
    this.addTrees(
      await this.instance("wild_tree", [...TREES, ...FAR_TREES], {
        root: 2.2,
        sink: 0.35,
      }),
    );
    await this.buildBorders();
    const ferns = [];
    for (let i = 0; i < FERNS; i++) {
      const a = rand() * Math.PI * 2,
        r = 3 + rand() * 40;
      const x = Math.cos(a) * r * 1.3,
        z = -5 - Math.abs(Math.sin(a) * r) * 1.6;
      // Clear of the avenue's middle, where the stag walks.
      if (Math.abs(x) < 2.5 && z < -18) continue;
      ferns.push([x, z, rand() * 6.3, 0.8 + rand() * 0.8]);
    }
    // More along the closing shot's way through the far country, from their own seed.
    const way = seeded(37);
    for (let i = 0; i < 44; i++) {
      const z = -84 - way() * 136;
      const x = flightX(z) + (i % 2 ? 1 : -1) * (3 + way() * 18);
      ferns.push([x, z, way() * 6.3, 0.9 + way() * 0.9]);
    }
    await this.instance(
      "fern_cluster",
      ferns.filter(([x, z]) => !this.flooded(x, z)),
      { root: 0.6 },
    );
    await this.buildMeadow();
    const shrooms = [];
    for (let i = 0; i < MUSHROOMS; i++) {
      const t = TREES[i % TREES.length];
      const a = rand() * Math.PI * 2;
      shrooms.push([
        t[0] + Math.cos(a) * 2.8,
        t[1] + Math.sin(a) * 2.8,
        rand() * 6.3,
        0.8 + rand() * 0.6,
      ]);
    }
    await this.instance("glow_mushroom", shrooms, {
      glow: 0xc3f25a,
      intensity: 1.8,
      root: 0.4,
    });
    this.solidMeshes.push({
      meshes: await this.instance("boulder_cluster", BOULDERS, {
        moss: 0x4f7a3a,
        root: 1.2,
      }),
      stand: () => true,
    });
    await this.buildGiant();
    await this.buildCastle();
    await this.buildLastDoor();
    await this.buildDeer();
    await this.buildBirds();
    this.buildShafts();
    this.buildSpores(rand);
    this.buildFairies(rand);
  }

  async instance(name, spots, opts = {}) {
    const o = await this.assets.make(name, { keepHierarchy: !!opts.glow });
    const made = [];
    if (!o || !spots.length) return made;
    o.updateMatrixWorld(true);
    const glowing = new Set();
    o.userData.parts?.glow?.traverse((m) => m.isMesh && glowing.add(m));
    const place = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = V(0, 1, 0);
    const batches = new Map();
    for (const spot of spots) {
      const key = name === "wild_tree" ? Math.floor(spot[1] / 64) : 0;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(spot);
    }
    o.traverse((m) => {
      if (!m.isMesh) return;
      let material = m.material;
      if (glowing.has(m)) {
        material = copyMaterial(material);
        material.emissive = new THREE.Color(opts.glow);
        material.emissiveIntensity = opts.intensity;
        this.glow.push(material);
      } else if (opts.moss) {
        material = copyMaterial(material);
        material.color.lerp(mineralColor(material, opts.moss), 0.55);
      }
      for (const batch of batches.values()) {
        const inst = new THREE.InstancedMesh(
          m.geometry,
          material,
          batch.length,
        );
        inst.name = `forest-${name}-instances`;
        inst.receiveShadow = true;
        if (name === "wild_tree" || name === "boulder_cluster") {
          inst.castShadow = true;
          inst.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: material.map,
            alphaTest: material.alphaTest,
            side: material.shadowSide ?? material.side,
          });
        }
        batch.forEach(([x, z, yaw, k], i) => {
          place.compose(
            V(
              x,
              this.groundUnder(x, z, (opts.root ?? 0) * k) -
                (opts.sink ?? 0) * k,
              z,
            ),
            q.setFromAxisAngle(up, yaw),
            V(k, k, k),
          );
          inst.setMatrixAt(i, place.clone().multiply(m.matrixWorld));
        });
        inst.computeBoundingSphere();
        inst.userData.spots = batch;
        this.scene.add(inst);
        made.push(inst);
      }
    });
    return made;
  }

  // Each batch of tree instances collides as one group of meshes.
  addTrees(meshes) {
    const batches = new Map();
    for (const mesh of meshes) {
      if (!batches.has(mesh.userData.spots))
        batches.set(mesh.userData.spots, []);
      batches.get(mesh.userData.spots).push(mesh);
    }
    for (const group of batches.values())
      this.solidMeshes.push({ meshes: group, ...TREE_SOLID });
  }

  // Grass over the whole floor in clumps, thickest by the door and widening with the avenue,
  // off the path and clear of the trunks. Its own seed, so nothing else moves.
  async buildMeadow() {
    const rand = seeded(23);
    const centres = [];
    for (let i = 0; i < MEADOW; i++) {
      const z = -1 - 88 * Math.pow(rand(), 1.5);
      const x = (rand() * 2 - 1) * (9 + 0.25 * -z);
      centres.push([x, z, 1.2 + rand() * 1.6, 4 + Math.floor(rand() * 5)]);
    }
    const ground = (x, z) => {
      if (z > -0.4 || Math.abs(x - forestRoute(z).x) < 2.1) return null;
      if (this.flooded(x, z)) return null;
      for (const [tx, tz, , k] of [...TREES, ...FAR_TREES])
        if ((x - tx) ** 2 + (z - tz) ** 2 < (2.4 * k) ** 2) return null;
      return this.surfaceAt(x, z);
    };
    // And either side of the closing shot's way, as far as the castle's hill.
    const way = seeded(31);
    const beyond = [];
    for (let i = 0; i < 36; i++) {
      const z = -90 - way() * 125;
      const x = flightX(z) + (i % 2 ? 1 : -1) * (5 + way() * 16);
      beyond.push([x, z, 1.4 + way() * 1.6, 4 + Math.floor(way() * 4)]);
    }
    await plantGrass(
      this.assets,
      this.scene,
      [...clumps(centres, ground, rand), ...clumps(beyond, ground, way)],
      { cell: 20 },
    );
  }

  async put(name, x, z, yaw, k, opts = {}, sink = 0, root = 0) {
    const o = await this.assets.make(name, opts);
    if (!o) return null;
    o.position.set(x, this.groundUnder(x, z, root * k) - sink, z);
    o.rotation.y = yaw;
    o.scale.multiplyScalar(k);
    this.scene.add(o);
    return o;
  }

  // Gentle rolls in the forest floor, rising slowly into the far country and its hills. A flat
  // hill sets its plateau level over whatever rolls beneath it.
  heightAt(x, z) {
    const h = this.naturalHeight(x, z);
    return h - bogDepression(x, z, h);
  }

  // The floor before the spore bog's hollow sinks it.
  naturalHeight(x, z) {
    let h = this.rolling(x, z);
    for (const [hx, hz, height, r, flat] of HILLS) {
      const d2 = ((x - hx) ** 2 + (z - hz) ** 2) / r ** 2;
      if (!flat) h += height * Math.exp(-d2 / (2 * 0.55 ** 2));
      else {
        const m = Math.exp(-d2 * d2 * 1.6);
        h = h * (1 - m) + (this.rolling(hx, hz) + height) * m;
      }
    }
    return h;
  }

  naturalUnder(x, z, r) {
    let h = this.naturalHeight(x, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      h = Math.min(
        h,
        this.naturalHeight(x + Math.cos(a) * r, z + Math.sin(a) * r),
      );
    }
    return h;
  }

  // Under the spore bog's water, or on its wet rim, where nothing grows.
  flooded(x, z) {
    return bogEdge(x, z) < 2.2 && this.heightAt(x, z) < BOG.level + 0.15;
  }

  // The lowest ground as drawn under a footprint of radius r, for trunks and rocks: set there,
  // one on a slope is buried on its uphill side instead of standing clear of the downhill one.
  groundUnder(x, z, r) {
    let h = this.drawnAt(x, z);
    for (let i = 0; r > 0 && i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      h = Math.min(h, this.drawnAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return h;
  }

  drawnAt(x, z) {
    return this.surfaceAt(x, z);
  }

  surfaceAt(x, z) {
    let top = -Infinity;
    for (const mesh of this.groundMeshes || []) {
      const {
        width,
        height,
        widthSegments: nx,
        heightSegments: nz,
      } = mesh.geometry.parameters;
      const gx = (x + width / 2) / (width / nx);
      const gz = (z - mesh.position.z + height / 2) / (height / nz);
      if (gx < 0 || gx >= nx || gz < 0 || gz >= nz) continue;
      const ix = Math.floor(gx),
        iz = Math.floor(gz),
        u = gx - ix,
        v = gz - iz;
      const p = mesh.geometry.attributes.position;
      const a = p.getY(ix + iz * (nx + 1));
      const b = p.getY(ix + 1 + iz * (nx + 1));
      const c = p.getY(ix + (iz + 1) * (nx + 1));
      const d = p.getY(ix + 1 + (iz + 1) * (nx + 1));
      top = Math.max(
        top,
        u + v <= 1
          ? a + (b - a) * u + (c - a) * v
          : d + (c - d) * (1 - u) + (b - d) * (1 - v),
      );
    }
    return Number.isFinite(top) ? top : this.heightAt(x, z);
  }

  rolling(x, z) {
    return (
      Math.sin(x * 0.21) * 0.35 +
      Math.cos(z * 0.17 + x * 0.05) * 0.3 +
      Math.min(14, Math.max(0, -z - 30) * 0.06) +
      Math.max(0, -z - 90) * 0.02 * Math.sin(x * 0.02 + 1.3) * 4
    );
  }

  buildSky() {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            float h = normalize(vDir).y;
            vec3 low = vec3(0.5, 0.58, 0.47), high = vec3(0.63, 0.71, 0.77);
            vec3 col = mix(low, high, smoothstep(0.0, 0.6, h));
            col += vec3(1.0, 0.86, 0.5) * pow(max(0.0, dot(normalize(vDir), normalize(vec3(-0.4, 0.7, -0.6)))), 12.0) * 0.5;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    dome.renderOrder = -10;
    g.add(dome);
    return g;
  }

  *buildGroundSteps() {
    const detail = forestFloor(THREE);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      vertexColors: true,
      map: detail.map,
      normalMap: detail.normalMap,
      roughnessMap: detail.roughnessMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
    });
    forestLitter(THREE, mat);
    const moss = new THREE.Color(0x4a6b33),
      soil = new THREE.Color(0x827354),
      mud = new THREE.Color(0x2b2b19),
      shade = new THREE.Color();
    this.groundMeshes = [];
    for (const [w, d, nx, nz, cz, fine] of [
      [240, 304, 240, 304, -142, true],
      [760, 620, 110, 90, -250, false],
    ]) {
      const geo = new THREE.PlaneGeometry(w, d, nx, nz).rotateX(-Math.PI / 2);
      const p = geo.attributes.position,
        uv = geo.attributes.uv,
        colors = [];
      for (let i = 0; i < p.count; i++) {
        if (i % 8192 === 8191) yield;
        const x = p.getX(i),
          z = p.getZ(i) + cz;
        p.setY(
          i,
          this.heightAt(x, z) -
            (!fine && Math.abs(x) < 127 && z > -302 && z < 18 ? 2 : 0),
        );
        const route = forestRoute(z);
        const variation =
          Math.sin(z * 0.73) * 0.18 + Math.sin(z * 2.1 + x) * 0.12;
        const wear =
          1 - smooth(1.2 + variation, 2.7 + variation, Math.abs(x - route.x));
        const trail = z < -1 && z > -275 ? wear : 0;
        shade.copy(moss).lerp(soil, trail * 0.9);
        shade.multiplyScalar(0.95 + 0.05 * Math.sin(x * 1.7 + z * 0.8));
        const offPath = Math.abs(x - route.x) > 2.1 ? 1 : 0;
        shade.lerp(
          soil,
          Math.max(0, forestFloorNoise(x / 6, z / 6) - 0.28) * 0.56 * offPath,
        );
        shade.multiplyScalar(0.86 + forestFloorNoise(x / 2.1, z / 2.1) * 0.32);
        if (bogEdge(x, z) < 2.6)
          shade.lerp(
            mud,
            0.85 * (1 - smooth(BOG.level - 0.1, BOG.level + 0.75, p.getY(i))),
          );
        colors.push(shade.r, shade.g, shade.b);
        uv.setXY(i, x / detail.tile, -z / detail.tile);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const ground = new THREE.Mesh(geo, mat);
      ground.name = fine ? "forest-playable-ground" : "forest-distant-ground";
      ground.position.z = cz;
      ground.receiveShadow = true;
      this.groundMeshes.push(ground);
      this.scene.add(ground);
    }
  }

  async buildBorders() {
    this.borders = forestBorders();
    // The giant's trunk swallows the bank where they meet, and its hollow can be entered.
    const outside = (x, z, reach) =>
      Math.hypot(x - GIANT.x, z - GIANT.z) > reach;
    this.borders.rocks = this.borders.rocks.filter((r) =>
      outside(r.x, r.z, 5.2),
    );
    this.borders.trees = this.borders.trees.filter(([x, z]) =>
      outside(x, z, 6),
    );
    const geometry = forestBankGeometry(THREE).translate(0, -0.5, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
    });
    if (typeof document !== "undefined") {
      const detail = surface(THREE, "stone");
      material.map = detail.map;
      material.roughnessMap = detail.roughnessMap;
      material.normalMap = detail.normalMap;
      material.normalScale.set(0.75, 0.75);
    }
    const finished = mineralSurface(
      THREE,
      finishMaterial(THREE, material, "stone"),
      {
        source: new URL("./textures/rock-strata-albedo.webp", import.meta.url)
          .href,
        tile: 3.1 / 2.4,
        strength: 0.9,
      },
    );
    weatherStone(finished, { strength: 0.7, moss: 0.35 });
    projectStone(finished, 3.1);
    const rocks = new THREE.InstancedMesh(
      geometry,
      finished,
      this.borders.rocks.length + BOG_STONES.length,
    );
    const matrix = new THREE.Matrix4(),
      rotation = new THREE.Quaternion();
    for (const [i, rock] of this.borders.rocks.entries()) {
      rock.base = this.groundUnder(rock.x, rock.z, rock.radius) - 0.4;
      // Where the bog's hollow digs under a bank rock, its foot follows the hollow down and
      // its top stays where the forest floor set it, so the bank keeps its height.
      if (bogEdge(rock.x, rock.z) < rock.radius + 2.2)
        rock.height +=
          Math.max(
            0,
            this.naturalUnder(rock.x, rock.z, rock.radius) - 0.4 - rock.base,
          ) / 0.94;
      matrix.compose(
        V(rock.x, rock.base + rock.height / 2, rock.z),
        rotation.setFromAxisAngle(V(0, 1, 0), rock.yaw),
        V(rock.radius, rock.height, rock.radius),
      );
      rocks.setMatrixAt(i, matrix);
      rocks.setColorAt(
        i,
        new THREE.Color(0x8d9275).multiplyScalar(0.85 + (i % 5) * 0.04),
      );
    }
    // The bog's stepping stones share the bank shape, whose top facet stands at 0.88 of its
    // height; their feet stay hidden in the water.
    BOG_STONES.forEach(([x, z, radius, above, yaw], j) => {
      const i = this.borders.rocks.length + j,
        base = BOG.level - 0.45,
        height = (above + 0.45) / 0.88;
      matrix.compose(
        V(x, base + height / 2, z),
        rotation.setFromAxisAngle(V(0, 1, 0), yaw),
        V(radius, height, radius),
      );
      rocks.setMatrixAt(i, matrix);
      rocks.setColorAt(i, new THREE.Color(0x737c5c).multiplyScalar(0.9));
    });
    rocks.name = "forest-rocky-banks";
    rocks.castShadow = rocks.receiveShadow = true;
    rocks.customDepthMaterial = new THREE.MeshDepthMaterial();
    rocks.computeBoundingSphere();
    this.scene.add(rocks);
    // The banks are walls; only the bog's stones are footing.
    this.solidMeshes.push({
      meshes: [rocks],
      stand: (i) => i >= this.borders.rocks.length,
    });
    this.addTrees(
      await this.instance("wild_tree", this.borders.trees, {
        root: 2.2,
        sink: 0.35,
      }),
    );
    await this.instance(
      "fern_cluster",
      this.borders.ferns.filter(([x, z]) => !this.flooded(x, z)),
      { root: 0.6 },
    );
  }

  // Two ranges of mountains on the horizon, in the haze's own colours, so the far country ends
  // in peaks rather than in fog.
  buildRanges() {
    this.ranges = buildMountainRanges(this.scene, "five");
  }

  // The giant: taller than anything in the forest, its pods glowing, fairies about its crown.
  async buildGiant() {
    const o = await this.put(
      "giant_tree",
      GIANT.x,
      GIANT.z,
      GIANT.yaw,
      GIANT.scale,
      { keepHierarchy: true },
      GIANT.sink,
      6,
    );
    if (!o) return;
    const meshes = [];
    o.traverse((m) => m.isMesh && meshes.push(m));
    this.solidMeshes.push({ object: o, meshes, ...GIANT_SOLID });
    o.userData.parts?.glow?.traverse((m) => {
      if (!m.isMesh) return;
      m.material = copyMaterial(m.material);
      m.material.emissive = new THREE.Color(0xc3f25a);
      m.material.emissiveIntensity = 2.2;
      this.glow.push(m.material);
    });
  }

  async buildCastle() {
    const o = await this.put(
      "hill_castle",
      CASTLE.x,
      CASTLE.z,
      CASTLE.yaw,
      CASTLE.scale,
      { keepHierarchy: true },
      CASTLE.sink,
    );
    this.castle = o;
    this.castleGrowth = await installCastleGrowth(this.assets, o);
    this.windows = [];
    this.castleMats = [];
    const lit = new Set();
    o?.userData.parts?.windows?.traverse((m) => {
      if (!m.isMesh) return;
      lit.add(m);
      m.material = copyMaterial(m.material);
      m.material.emissive = new THREE.Color(0xffb24a);
      m.material.emissiveIntensity = 1.4;
      m.material.fog = false;
      this.windows.push(m.material);
    });
    // Hazed by hand instead of by the fog, which at this distance would swallow it whole:
    // a pale castle on its hill, its windows lit.
    o?.traverse((m) => {
      if (!m.isMesh || lit.has(m)) return;
      m.material = copyMaterial(m.material);
      m.material.fog = false;
      this.castleMats.push({
        material: m.material,
        base: m.material.color.clone(),
      });
    });
    this.hazeCastle(V(0, 0, 0));
  }

  // The castle's haze by hand, as thick as the fog would lay at the viewer's distance but never
  // past what keeps it in sight, so it clears as the closing shot flies up to it.
  hazeCastle(eye) {
    const d = Math.hypot(eye.x - CASTLE.x, eye.z - CASTLE.z);
    const haze = Math.min(
      0.62,
      1 - Math.exp(-((this.scene.fog.density * d) ** 2)),
    );
    if (Math.abs(haze - (this.haze ?? -1)) < 0.004) return;
    this.haze = haze;
    for (const { material, base } of this.castleMats)
      material.color
        .copy(base)
        .lerp(mineralColor(material, this.scene.fog.color), haze);
  }

  // The last door and the sea beyond it. Its view needs a screen-sized target only once the
  // closing shot is on its way (see wake), so it starts at a single pixel.
  async buildLastDoor() {
    const { Gate, renderer, sound } = this.services;
    if (!Gate || !renderer) return;
    const gate = new Gate({
      scene: this.scene,
      world: null,
      renderer,
      sound,
      assets: this.assets,
    });
    const model = await this.assets.make("far_gate");
    if (model) model.position.y = this.heightAt(LAST.x, LAST.z) - 0.5;
    await gate.build({
      x: LAST.x,
      z: LAST.z,
      glyphs: LAST.glyphs,
      model,
      colliders: false,
      base: "forest",
    });
    gate.lightScale = 0.6;
    gate.target.setSize(1, 1);
    this.lastGate = gate;
    this.buildFlight();
  }

  // The closing shot's way as a smooth curve from the great ring's view to the waiting point,
  // and the eye's target along it: at first straight through the ring, then ahead along the
  // way, and at last the door with the castle over it.
  buildFlight() {
    const pts = [V(0.1, this.gateCenter.y - 0.6, 1.2)];
    for (const [x, z, over] of FLIGHT)
      pts.push(V(x, this.heightAt(x, z) + over, z));
    this.flight = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    this.flightFrom = V(0, this.gateCenter.y - 0.4, -20);
    this.flightTo = this.lastGate.center.clone().add(V(0, 3, 0));
    this.castleTop = V(
      CASTLE.x,
      this.heightAt(CASTLE.x, CASTLE.z) + 22,
      CASTLE.z,
    );
  }

  flightLook(k, out) {
    out.copy(this.flight.getPointAt(Math.min(1, k + 0.06)));
    out.y -= 1.5;
    out.lerp(this.flightFrom, 1 - smooth(0, 0.08, k));
    // Up at the castle on its hill as the way climbs towards it.
    out.lerp(this.castleTop, 0.6 * smooth(0.45, 0.8, k));
    return out.lerp(this.flightTo, smooth(0.8, 1, k));
  }

  // The closing shot begins: the last door's view gets its full size.
  wake() {
    if (!this.lastGate || this.awake) return;
    this.awake = true;
    this.lastGate.resize();
  }

  resize() {
    if (this.awake) this.lastGate.resize();
  }

  reset() {
    if (!this.lastGate) return;
    this.lastGate.reset();
    this.lastGate.target.setSize(1, 1);
    this.awake = false;
  }

  prepareForCompile(on) {
    const G = this.lastGate;
    if (!G) return;
    const changes = [
      [G.disc, "visible", true],
      [G.uniforms.uClear, "value", 1],
      [G.ground, "visible", true],
      [G.ring, "visible", true],
      [this, "haze", undefined],
      ...(this.castleMats || []).map(({ material }) => [
        material,
        "color",
        material.color.clone(),
      ]),
    ];
    this.scene.traverse((mesh) => {
      if (mesh.isMesh && mesh.material?.userData.canopyLeaf)
        changes.push([mesh, "frustumCulled", false]);
    });
    prepareVisuals(this, on, changes);
  }

  // A stag in the clearing: it walks from one grazing spot to the next along the avenue,
  // lowers its head to graze, looks up, and walks on.
  async buildDeer() {
    const o = await this.assets.make("forest_deer", { keepHierarchy: true });
    if (!o) return;
    this.scene.add(o);
    this.deer = {
      o,
      parts: o.userData.parts || {},
      spots: [
        [-7, -24],
        [-2.5, -26],
        [4, -30],
        [7, -35],
        [2.5, -40],
        [-6, -35],
      ],
      // Grazing in the avenue when the door opens, in plain view.
      at: 1,
      next: 2,
      pos: V(-2.5, 0, -26),
      phase: "graze",
      t: 0,
      wait: 3,
      yaw: 0,
      stride: 0,
    };
    wildlifeTarget(this.deer, "deer", 1.05, 0.68, 2);
    this.deer.locomotion = new DeerGait(this.deer, (x, z) =>
      this.surfaceAt(x, z),
    );
    this.placeDeer(0);
  }

  placeDeer(dt) {
    const d = this.deer;
    if (!d) return;
    if (d.hp <= 0 && d.locomotion.active) d.locomotion.reset();
    if (fallenWildlife(d, dt, (x, z) => this.surfaceAt(x, z))) return;
    d.t += dt;
    const P = d.parts,
      previousX = d.pos.x,
      previousZ = d.pos.z;
    let walking = false;
    if (d.phase === "graze") {
      // Head down to the grass, then up to look around before the next spot.
      const k = d.t / d.wait;
      const down = k < 0.75 ? Math.min(1, k * 4) : Math.max(0, (1 - k) * 4);
      if (P.head) P.head.rotation.x = down * 0.85;
      if (d.t >= d.wait) {
        d.phase = "walk";
        d.t = 0;
      }
    } else {
      const [tx, tz] = d.spots[d.next];
      const dx = tx - d.pos.x,
        dz = tz - d.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      d.yaw +=
        Math.atan2(Math.sin(want - d.yaw), Math.cos(want - d.yaw)) *
        Math.min(1, dt * 2.5);
      const step = Math.min(dist, 1.25 * dt);
      d.pos.x += Math.sin(d.yaw) * step;
      d.pos.z += Math.cos(d.yaw) * step;
      walking = true;
      if (dist < 0.3) {
        d.at = d.next;
        d.next = (d.next + 1) % d.spots.length;
        d.phase = "graze";
        d.t = 0;
        d.wait = 3 + ((d.at * 1.7) % 3);
      }
      if (P.head) P.head.rotation.x *= 1 - Math.min(1, dt * 3);
    }
    d.stride += walking ? dt * 5.2 : 0;
    d.o.position.set(d.pos.x, this.surfaceAt(d.pos.x, d.pos.z), d.pos.z);
    d.o.rotation.y = d.yaw;
    d.o.rotation.z = Math.sin((d.struck / 0.32) * Math.PI) * 0.14;
    d.locomotion.update(
      dt,
      Math.hypot(d.pos.x - previousX, d.pos.z - previousZ),
      walking,
    );
  }

  // Birds: a flight about the giant's crown, and a pair that crosses the avenue.
  async buildBirds() {
    this.birds = [];
    const flights = [
      { cx: GIANT.x, cz: GIANT.z, cy: 62, r: 32, speed: 0.2, n: 4, k: 3.6 },
      { cx: -2, cz: -38, cy: 13, r: 24, speed: 0.17, n: 2, k: 2.4 },
    ];
    for (const f of flights)
      for (let i = 0; i < f.n; i++) {
        const o = await this.assets.make("forest_bird", {
          keepHierarchy: true,
        });
        if (!o) return;
        o.scale.setScalar(f.k);
        this.scene.add(o);
        this.birds.push({
          o,
          parts: o.userData.parts || {},
          f,
          a: (i / f.n) * Math.PI * 2 + i * 0.4,
          dy: (i % 2) * 3 - 1.5,
          dr: i * 3,
          seed: i * 1.9 + f.r,
        });
        wildlifeTarget(this.birds.at(-1), "bird", 0.13, 0.5, 1);
      }
    this.placeBirds(0);
  }

  placeBirds(dt) {
    for (const b of this.birds || []) {
      if (fallenWildlife(b, dt, (x, z) => this.surfaceAt(x, z))) continue;
      const { f } = b;
      b.a += dt * f.speed;
      poseBirdFlight(b, this.time);
    }
  }

  wildlifeTargets() {
    return [this.deer, ...(this.birds || [])]
      .filter(Boolean)
      .map((animal) => animal.target);
  }

  resetWildlife() {
    this.deer?.locomotion.reset();
    for (const animal of [this.deer, ...(this.birds || [])].filter(Boolean))
      resetWildlife(animal);
    if (this.deer) {
      Object.assign(this.deer, {
        at: 1,
        next: 2,
        phase: "graze",
        t: 0,
        wait: 3,
        yaw: 0,
        stride: 0,
      });
      this.deer.pos.set(-2.5, 0, -26);
      this.placeDeer(0);
    }
    this.placeBirds(0);
  }

  wildlifeTelemetry() {
    return [this.deer, ...(this.birds || [])].filter(Boolean).map((animal) => ({
      species: animal.species,
      hp: animal.hp,
      alive: animal.hp > 0,
      resting: !!animal.resting,
      at: animal.target.center().toArray(),
    }));
  }

  // Warm shafts of light slanting down through gaps in the canopy, with motes in them.
  buildShafts() {
    this.light = buildForestLight(this, this.services);
  }

  // Motes of spore drifting in the light.
  buildSpores(rand) {
    const pos = new Float32Array(SPORES * 3);
    for (let i = 0; i < SPORES; i++) {
      pos[i * 3] = (rand() - 0.5) * 40;
      pos[i * 3 + 1] = 0.4 + rand() * 8;
      pos[i * 3 + 2] = -4 - rand() * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.sporeU = { uTime: { value: 0 } };
    const spores = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.sporeU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime;
          void main() {
            vec3 p = position;
            float k = p.x * 1.7 + p.z * 0.9;
            p.x += sin(uTime * 0.4 + k) * 0.6;
            p.y += sin(uTime * 0.3 + k * 1.3) * 0.5;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = 42.0 / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vec3(0.82, 1.0, 0.45) * 1.6, smoothstep(0.5, 0.0, d) * 0.8);
          }`,
      }),
    );
    spores.frustumCulled = false;
    this.scene.add(spores);
  }

  // Fairies: bright motes that dart and hover, a swarm about the giant's crown and a few along
  // the avenue, each with a warm core and a halo of spore lime.
  buildFairies(rand) {
    const pos = new Float32Array(FAIRIES * 3),
      seed = new Float32Array(FAIRIES);
    for (let i = 0; i < FAIRIES; i++) {
      let x, y, z;
      if (i < 60) {
        const a = rand() * Math.PI * 2,
          r = 8 + rand() * 20;
        x = GIANT.x + Math.cos(a) * r;
        z = GIANT.z + Math.sin(a) * r;
        y = this.heightAt(GIANT.x, GIANT.z) + 18 + rand() * 32;
      } else {
        x = (rand() - 0.5) * 16;
        z = -8 - rand() * 40;
        y = this.heightAt(x, z) + 1 + rand() * 4;
      }
      pos.set([x, y, z], i * 3);
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    this.fairyU = { uTime: { value: 0 } };
    const fairies = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.fairyU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime;
          attribute float seed;
          varying float vBlink;
          void main() {
            vec3 p = position;
            float t = uTime * (0.6 + seed) + seed * 40.0;
            // A dart now and then between slow loops.
            float dart = smoothstep(0.85, 1.0, sin(t * 0.7));
            p += vec3(sin(t * 1.3), sin(t * 2.1) * 0.6, cos(t * 1.1)) * (0.8 + dart * 2.5);
            vBlink = 0.55 + 0.45 * sin(uTime * (3.0 + seed * 4.0) + seed * 12.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (105.0 + seed * 60.0) / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vBlink;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float core = smoothstep(0.16, 0.0, d);
            float halo = smoothstep(0.5, 0.0, d) * 0.5;
            vec3 c = vec3(1.0, 0.93, 0.68) * core * 2.2 + vec3(0.76, 0.95, 0.35) * halo;
            gl_FragColor = vec4(c * vBlink, (core + halo) * vBlink);
          }`,
      }),
    );
    fairies.frustumCulled = false;
    this.scene.add(fairies);
  }

  update(dt) {
    this.time += dt;
    if (this.sporeU) this.sporeU.uTime.value = this.time;
    if (this.fairyU) this.fairyU.uTime.value = this.time;
    this.bog?.update(this.time, this.bogSurge ?? 0);
    for (const m of this.glow)
      m.emissiveIntensity = 1.6 + Math.sin(this.time * 1.4) * 0.3;
    (this.windows || []).forEach(
      (m, i) =>
        (m.emissiveIntensity =
          1.4 +
          Math.sin(this.time * 5.1 + i) * 0.12 +
          Math.sin(this.time * 1.3) * 0.1),
    );
    this.placeDeer(dt);
    this.placeBirds(dt);
    this.lastGate?.update(dt);
    this.atlantis?.update(dt);
  }

  // Drawn by the great ring's portal, from the point matching the viewer's.
  // The last door's view of the sea is drawn first, into its own target.
  renderInto(renderer, camera) {
    this.hazeCastle(camera.position);
    this.lastGate?.renderPortal(camera);
    this.sky.position.copy(camera.position);
    renderer.render(this.scene, camera);
  }
}

// Where the closing shot's way crosses depth z, between its points.
function flightX(z) {
  let prev = [0, 0];
  for (const [x, fz] of FLIGHT) {
    if (z >= fz) {
      const k = (z - prev[1]) / (fz - prev[1]);
      return prev[0] + (x - prev[0]) * k;
    }
    prev = [x, fz];
  }
  return prev[0];
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function copyMaterial(material) {
  const copy = material.clone();
  copy.onBeforeCompile = material.onBeforeCompile;
  copy.customProgramCacheKey = material.customProgramCacheKey;
  return copy;
}
