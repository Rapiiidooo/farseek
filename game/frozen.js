import {
  mineralColor,
  mineralSurface,
  mineralSurfaceReady,
} from "./mineral-surface.js";
import { snowSurface } from "./snow-surface.js";
import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { glyphMaterial, makeGlyph } from "./glyphs.js";
import { surface } from "./surfaces.js";
import { prepareVisuals } from "./shader-preparation.js";
import { IceTrail } from "./ice-trail.js";
import { FallingIce, ICE_FALLS } from "./falling-ice.js";
import { FrostClimbs, POCKET, SHELF } from "./frost-climbs.js";
import { coldWaterMaterial, setColdWaterTime } from "./cold-water.js";
import {
  iceFractureTexture,
  iceFractureMaterial,
  iceFractureUV,
  setIceFractureLoad,
} from "./ice-fractures.js";
import { runSteps } from "./work-steps.js";

// The fourth level, the frozen reach. Mira's ring, given two glyphs of three, opened halfway,
// onto ice: the third glyph is carved here, in a stela the ice has swallowed. The explorer
// slides down a frozen stream and jumps its crevasse, pushes blocks of ice across a frozen
// pond to climb out of it, crosses a lake on thin ice and on drifting floes, and frees the
// stela with orb pulses, charged by linking to a prism. With the address whole, the great ring
// on the island opens onto the next world.
//
// Everything runs along -z from the arrival ring at the origin. Heights: the stream, the
// pond and the shelves at 0, the plateau at 3.8, the lake's ice at 0.15 over water at -0.3,
// the island at 0.6.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TURQUOISE = new THREE.Color(0x39e3d0);
const THIN_ICE = new THREE.Color(0x7fb4cf),
  FROST = new THREE.Color(0xe9f2f6);

export const WATER = -0.3;
export const CELL = 2;

// The sections in the order they are reached, each from the line on z where it starts.
export const SECTIONS = [
  { id: "stream", z: 7 },
  { id: "pond", z: -50 },
  { id: "lake", z: -92 },
  { id: "floes", z: -121 },
  { id: "island", z: -135 },
];

// Solid ground: [minX, minY, minZ, maxX, maxY, maxZ, surface, climbable]. `snow` and `rock`
// hold, `ice` is slick. Only the edges meant to be climbed can be hung from.
const GROUND = [
  // The arrival shelf, the frozen stream and its banks.
  [-10, -30, -14, 10, 0, 7, "snow"],
  [-4.5, -30, -44, 4.5, 0, -14, "ice"],
  [-10, -30, -44, -4.5, 3.5, -14, "rock", false],
  [4.5, -30, -44, 10, 3.5, -14, "rock", false],
  [-5.6, 3.4, -27.9, -4.5, 5.5, -25.5, "rock", false],
  [-5, 4.3, -27.9, 1.8, 5.5, -25.5, "rock", false],
  [4.5, 3.4, -38.4, 5.6, 5.5, -36, "rock", false],
  [-1.8, 4.3, -38.4, 5, 5.5, -36, "rock", false],
  // Across the crevasse: a narrow landing between two walls, closed by a short frozen fall
  // (frost-climbs.js) over rock that steps down to a shelf. Only its back can be hung from.
  [-2.5, -30, -50, 2.5, 0, -46.8, "snow"],
  [-10, -30, -50, -2.5, 3, -46.8, "rock", false],
  [2.5, -30, -50, 10, 3, -46.8, "rock", false],
  [-2.5, -30, -51, 2.5, 4, -50.15, "rock", false],
  [-2.5, -30, -51.6, 2.5, 4, -51, "rock"],
  [-2.5, -30, -53.2, 2.5, 2, -51.6, "rock"],
  [-8, -30, -56, 8, 0, -50, "snow"],
  // The frozen pond, its walls and the plateau above its north face.
  [-6, -30, -74, 6, 0, -56, "ice"],
  [-10, -30, -76, -6, 5.7, -56, "rock", false],
  [6, -30, -76, 10, 5.7, -56, "rock", false],
  [-10, -30, -92, 10, 3.8, -74, "snow"],
  // A parapet along the plateau's edge, open only at the notch over column x 2..4.
  [-6, 3.8, -75.2, 2, 5.7, -74, "rock", false],
  [4, 3.8, -75.2, 6, 5.7, -74, "rock", false],
  // Down to the lake shore.
  [-6, -30, -96, 6, 2.5, -92, "snow"],
  [-6, -30, -99, 6, 1.2, -96, "snow"],
  [-10, -30, -103, 10, 0.3, -99, "snow"],
  // The anchored floe between the thin ice and the channel.
  [-3, -2, -125, 3, 0.2, -121.2, "snow"],
  // The island: a notch towards the channel, then its body, and the prism's shelf against its
  // west cliff behind a scarred fall.
  [-2.2, -30, -137.6, 2.2, 0.6, -134.4, "snow"],
  [-12, -30, -163, 12, 0.6, -137.6, "snow"],
  [-12, -30, -147.2, -9.05, 5.6, -140.8, "rock", false],
];

// Cliffs that frame the way and stop the camera: [minX, minZ, maxX, maxZ, top].
const CLIFFS = [
  [-18, -14, -10, 12, 6],
  [10, -14, 18, 12, 6],
  [-14, 7, 14, 14, 8],
  [-18, -56, -10, -14, 7],
  [10, -56, 18, -14, 7],
  [-18, -103, -10, -56, 9],
  [10, -103, 18, -56, 9],
  [-20, -175, -12, -137.6, 7],
  [12, -175, 20, -137.6, 7],
  [-14, -178, 14, -163, 10],
];

// Thin ice on the lake: it cracks under the feet and breaks, then freezes again.
const THIN = [
  [-2.5, -107.4, 2.5, -103.6],
  [-3.5, -111.8, 1.5, -108],
  [-1.5, -116.2, 3.5, -112.4],
  [-2.5, -120.6, 2.5, -116.8],
];
const THIN_TOP = 0.15,
  CRACK = 1.0,
  SINK = 1.4,
  REFREEZE = 5;

// Floes drifting across the channel along x, in step with each other, half a round apart.
// The gaps between them are a standing jump: the difficulty is when, not how far.
const FLOES = [
  { minZ: -129, maxZ: -125.8, phase: 0 },
  { minZ: -133.2, maxZ: -130, phase: 0.5 },
];
const FLOE = { width: 5, reach: 7, dwell: 1.5, travel: 6, top: 0.2 };

// The pond's grid: 2 m cells on columns x = -5 .. 5 and rows z = -57 .. -73.
export const POND = {
  minX: -6,
  maxX: 6,
  minZ: -74,
  maxZ: -56,
  block: { x: -3, z: -61 },
  // Ice spires stand in the pond as pillars a block stops against.
  pillars: [
    [5, -73],
    [5, -61],
    [-1, -67],
  ],
  // The one place the plateau's edge is low enough to climb from a block.
  notch: { x: 3, z: -73 },
};

// The island: the prism that charges the linked orb, the stela under its ice and the ring.
export const ISLAND = {
  prism: { x: -10.5, z: -144.7, y: SHELF.top },
  stela: { x: 0, z: -147.5 },
  ring: { x: 0, z: -155 },
  top: 0.6,
};

// Snow pines, cairns and ice spires dressing the way: [x, z, yaw, scale].
const PINES = [
  [-7.5, 3, 0.4, 1],
  [7.8, -2, 1.9, 0.9],
  [-7, -53, 2.6, 0.85],
  [6.8, -52.5, 0.7, 1.05],
  [-8, -80, 1.2, 1.1],
  [8.2, -84, 2.2, 0.95],
  [-7.6, -88.5, 0.3, 0.9],
  [7.4, -100.5, 2.9, 1],
  [-8.8, -101, 1.4, 1.1],
  [-9, -141, 0.8, 1.1],
  [9.5, -144, 2.1, 1],
  [-9.5, -152, 1.6, 0.95],
  [9, -158, 0.2, 1.05],
];
const CAIRNS = [
  [-2.6, -9.5, 0.3],
  [-1.2, -53, 1.1],
  [1.6, -86, 2.4],
  [4.2, -100.2, 0.9],
  [2.8, -139.8, 1.7],
];
const SPIRES = [
  [-1.8, -24, 0.3, 0.85],
  [2.2, -31, 1.4, 0.9],
  [-2.4, -37.5, 2.2, 0.8],
  [-6.8, -48.4, 0.7, 1.2],
  [6.9, -48.2, 2.5, 1.15],
  [-4.4, -138.4, 1.1, 0.9],
  [4.6, -138.6, 2.8, 0.95],
  [-8.4, -138.8, 0.5, 1.1],
  [8.6, -138.6, 1.9, 1.05],
];

// Icicles hung from the lips of the walls along the way: [x, z of the lip, top, the face's
// outward direction as a yaw, scale]. The face at x = -4.5 looks along +x: a yaw of pi/2.
const E = Math.PI / 2,
  W = -Math.PI / 2,
  N = Math.PI;
const ICICLES = [
  // The stream's banks.
  [-4.5, -18, 3.5, E, 1],
  [-4.5, -25.5, 3.5, E, 0.9],
  [-4.5, -33, 3.5, E, 1.05],
  [-4.5, -40, 3.5, E, 0.85],
  [4.5, -21, 3.5, W, 0.95],
  [4.5, -29, 3.5, W, 1.1],
  [4.5, -37, 3.5, W, 0.9],
  // The pond's walls and the parapet over its north face, clear of the notch.
  [-6, -59.5, 5.7, E, 1.1],
  [-6, -64.5, 5.7, E, 0.95],
  [-6, -70, 5.7, E, 1.05],
  [6, -58.5, 5.7, W, 1],
  [6, -66, 5.7, W, 1.1],
  [-4.2, -74, 5.7, 0, 1.05],
  [-1, -74, 5.7, 0, 0.9],
  [5, -74, 5.7, 0, 0.75],
  // The arrival's walls and the plateau's.
  [-10, -8.5, 6, E, 1.15],
  [-10, 3, 6, E, 1],
  [10, -3, 6, W, 1.1],
  [10, 3.5, 6, W, 0.95],
  [-10, -80, 9, E, 1.2],
  [-10, -88, 9, E, 1.05],
  [10, -84, 9, W, 1.15],
  [10, -95, 9, W, 1],
  // The island's walls, and its back wall behind the ring.
  [-12, -142, 7, E, 1.1],
  [-12, -150, 7, E, 1],
  [-12, -157, 7, E, 1.15],
  [12, -146, 7, W, 1.05],
  [12, -154, 7, W, 1.2],
  [12, -160, 7, W, 0.95],
  [-2.8, -163, 10, 0, 1.2],
  [3, -163, 10, 0, 1.1],
];
// Frozen falls against the walls: [x, z of the face, ground, yaw, scale].
const FALLS = [
  [-10, -3, 0, E, 0.72],
  [10, -10, 0, W, 0.68],
  [-7.5, -163, 0.6, 0, 1],
  [8, -163, 0.6, 0, 0.95],
];
// Boulders dusted with snow, at the edges of the shelves: [x, z, yaw, scale].
const BOULDERS = [
  [-8.4, 5.4, 0.4, 1.1],
  [8.1, 4.6, 2.1, 0.95],
  [-8.6, -90, 1.2, 1.2],
  [8.7, -77.5, 2.8, 1],
  [-8.9, -101.2, 0.7, 0.9],
  [8.4, -100.6, 1.9, 1.05],
  [10.4, -140.2, 0.2, 1.1],
  [-10.7, -155.6, 2.4, 1.2],
  [10.6, -162, 1.3, 1],
];
// World-space texture scale on the rock: one tile of the stone surface every 2.4 m.
const ROCK_TILE = 2.4;
const ROCK_CREASE = THREE.MathUtils.degToRad(55);
const SNOW_CREASE = THREE.MathUtils.degToRad(40);
const SNOW_TILE = 0.65;
const SNOW_STRENGTH = 0.4;
const ROCK_STRENGTH = 0.78;

const GROW = 0.6;

export class Frozen {
  constructor(scene, world, assets, services) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.services = services;
    this.blocks = [];
    this.thin = [];
    this.floes = [];
    this.cairns = [];
    this.time = 0;
  }

  async build() {
    this.materials();
    await runSteps(this.buildGroundSteps(), () => this.assets.yieldWork?.());
    await mineralSurfaceReady(this.scene);
    await this.buildDressing();
    await this.buildRelief();
    this.climbs = new FrostClimbs(this);
    await this.climbs.build();
    this.fallingIce = new FallingIce(this.scene, this.services.sound, {
      onWarning: (spot) => this.onIceWarning?.(spot),
      onContact: (spot, hero) => this.onIceContact?.(spot, hero),
    });
    for (const definition of ICE_FALLS) {
      const model = await this.assets.make("icicle_cluster", {
        keepHierarchy: true,
        surfaces: false,
      });
      if (!model)
        throw new Error("Falling ice requires its local cluster asset");
      this.iceLook(model);
      this.fallingIce.add(model, definition);
    }
    await this.buildPond();
    this.buildLake();
    await this.buildIsland();
    this.trail = new IceTrail(this);
    this.trail.build();
    this.reset();
  }

  materials() {
    const cracks = crackTexture(),
      grain = grainTexture(),
      stone = surface(THREE, "stone");
    this.mat = {
      rock: new THREE.MeshStandardMaterial({
        color: 0x4a5566,
        roughness: 1,
        flatShading: false,
        map: stone.map,
        roughnessMap: stone.roughnessMap,
        normalMap: stone.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
      }),
      snow: new THREE.MeshStandardMaterial({
        color: 0xe9f2f6,
        roughness: 0.85,
        flatShading: false,
        map: grain,
      }),
      ice: new THREE.MeshStandardMaterial({
        color: 0x8fc3da,
        roughness: 0.08,
        metalness: 0.15,
        envMapIntensity: 1.3,
        map: cracks,
      }),
      thin: new THREE.MeshStandardMaterial({
        color: 0x7fb4cf,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.86,
        envMapIntensity: 1.2,
      }),
      floe: new THREE.MeshStandardMaterial({
        color: 0xdfeef5,
        roughness: 0.6,
        flatShading: true,
      }),
    };
    mineralSurface(THREE, this.mat.rock, { strength: ROCK_STRENGTH });
    snowSurface(THREE, this.mat.snow, {
      tile: SNOW_TILE,
      strength: SNOW_STRENGTH,
    });
  }

  // --- the ground ------------------------------------------------------------------------------
  *buildGroundSteps() {
    const rock = [],
      snow = [],
      ice = [];
    const rand = seeded(7);
    for (const [minX, minY, minZ, maxX, maxY, maxZ, surface, grab] of GROUND) {
      const slick = surface === "ice";
      this.world.add(minX, minY, minZ, maxX, maxY, maxZ, "rock", null, {
        slick,
        grab: grab !== false,
      });
      if (slick) {
        // A slab of clear ice over a body of rock.
        ice.push(slab(minX, maxY - 0.5, minZ, maxX, maxY, maxZ, rand, 0.03));
        rock.push(
          mass(minX, Math.max(minY, -8), minZ, maxX, maxY - 0.5, maxZ, rand),
        );
      } else {
        // Walls that are never climbed are layered and worn; a climbable lip stays clean.
        const worn =
          grab === false && maxX - minX >= 3 && maxZ - minZ >= 3 ? 0.5 : 0;
        const overhang = minY > 4 && maxX - minX > 6 && maxZ - minZ < 3;
        rock.push(
          overhang
            ? cantilever(minX, minY, minZ, maxX, maxY - 0.12, maxZ)
            : mass(
                minX,
                Math.max(minY, -8),
                minZ,
                maxX,
                maxY - 0.12,
                maxZ,
                rand,
                0.5,
                worn,
              ),
        );
        if (!overhang && maxY - minY > 0.3)
          snow.push(
            slab(minX, maxY - 0.14, minZ, maxX, maxY, maxZ, rand, 0.08),
          );
      }
      yield;
    }
    for (const [minX, minZ, maxX, maxZ, top] of CLIFFS) {
      this.world.add(minX, -30, minZ, maxX, top, maxZ, "rock", null, {
        grab: false,
      });
      rock.push(mass(minX, -8, minZ, maxX, top, maxZ, rand, 0.9, 1));
      snow.push(
        slab(minX, top - 0.1, minZ, maxX, top + 0.35, maxZ, rand, 0.25),
      );
      yield;
    }
    // Snow settles on every ledge the layers leave.
    const [walls, ledges] = splitLedges(rock);
    yield;
    this.merged(walls, this.mat.rock, true, 1 / ROCK_TILE);
    yield;
    this.merged([...snow, ...ledges], this.mat.snow, true);
    yield;
    this.merged(ice, this.mat.ice, false);
  }

  merged(geos, material, cast, uvScale = 1) {
    const geometry = mergeAll(geos, uvScale);
    const crease =
      material === this.mat.rock
        ? ROCK_CREASE
        : material === this.mat.snow
          ? SNOW_CREASE
          : 0;
    if (crease) toCreasedNormals(geometry, crease);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = cast;
    this.scene.add(mesh);
    return mesh;
  }

  async place(name, x, z, { yaw = 0, s = 1, y, opts } = {}) {
    const o = await this.assets.make(name, opts);
    if (!o) return null;
    o.position.set(x, y ?? this.groundAt(x, z), z);
    o.rotation.y = yaw;
    o.scale.multiplyScalar(s);
    this.scene.add(o);
    return o;
  }

  groundAt(x, z) {
    const g = this.world.ground(x, z, 0.05, 1e4, 0);
    return g > -1e3 ? g : 0;
  }

  async buildDressing() {
    for (const [x, z, yaw, s] of PINES) {
      const o =
        (await this.place("snow_pine", x, z, { yaw, s })) ||
        this.stand(fallbackPine(), x, z, yaw, s);
      o.traverse((m) => m.isMesh && (m.castShadow = true));
      this.world.addRound(x, z, 0.5 * s, -10, o.position.y + 7 * s, "prop");
    }
    for (const [x, z, yaw] of CAIRNS) {
      const model =
        (await this.place("frost_cairn", x, z, { yaw })) ||
        this.stand(fallbackCairn(), x, z, yaw, 1);
      this.cairns.push({ x, z, model });
      this.world.addRound(
        x,
        z,
        0.35,
        -10,
        model.position.y + 1.1,
        "prop",
        null,
        { cam: false },
      );
    }
    for (const [x, z, yaw, s] of SPIRES) await this.spire(x, z, yaw, s);
  }

  stand(o, x, z, yaw, s) {
    o.position.set(x, this.groundAt(x, z), z);
    o.rotation.y = yaw;
    o.scale.multiplyScalar(s);
    this.scene.add(o);
    return o;
  }

  // --- relief: icicles on the lips, frozen falls, boulders under snow --------------------------
  async buildRelief() {
    await this.instanced(
      "icicle_cluster",
      ICICLES,
      (o, [x, z, top, yaw, k]) => {
        // The crust's back edge sits on the lip; the icicles hang down the face.
        const a = new THREE.Vector3(...(o.userData.anchor || [0, 1.5, -0.15]));
        a.multiplyScalar(k).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        return [x - a.x, top - a.y, z - a.z, yaw, k];
      },
    );
    await this.instanced("frozen_falls", FALLS, (o, [x, z, ground, yaw, k]) => {
      // Flat back against the face (the asset is centred on its 2 m depth); the apron is a
      // low mound the explorer walks round.
      const cx = x + Math.sin(yaw) * k,
        cz = z + Math.cos(yaw) * k;
      const ax = x + Math.sin(yaw) * 0.75 * k,
        az = z + Math.cos(yaw) * 0.75 * k;
      const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (const t of [-0.9, 0, 0.9])
        this.world.addRound(
          ax + side.x * t * k,
          az + side.z * t * k,
          0.75 * k,
          -10,
          ground + 0.8 * k,
          "prop",
          null,
          { cam: false },
        );
      return [cx, ground, cz, yaw, k];
    });
    await this.instanced(
      "boulder_cluster",
      BOULDERS,
      (o, [x, z, yaw, k]) => {
        const ground = this.groundAt(x, z);
        this.world.addRound(x, z, 1.25 * k, -10, ground + 2.2 * k, "prop");
        return [x, ground, z, yaw, k];
      },
      { snowcap: true },
    );
  }

  // Many copies of one asset, one draw call per material. `where` turns a spot into
  // [x, y, z, yaw, scale]; ice gains its gloss, and a boulder its frost-slate and a cap of snow.
  async instanced(name, spots, where, { snowcap = false } = {}) {
    const o = await this.assets.make(name, {
      keepHierarchy: true,
      surfaces: !snowcap ? false : true,
    });
    if (!o) return;
    o.updateMatrixWorld(true);
    const place = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0);
    const mats = spots.map((spot) => {
      const [x, y, z, yaw, k] = where(o, spot);
      return place
        .compose(
          new THREE.Vector3(x, y, z),
          q.setFromAxisAngle(up, yaw),
          new THREE.Vector3(k, k, k),
        )
        .clone();
    });
    o.traverse((m) => {
      if (!m.isMesh) return;
      let geometry = m.geometry,
        material = m.material.clone();
      if (snowcap) {
        // Frost-slate stone, white wherever a face looks up.
        material.color.copy(mineralColor(material, 0xffffff));
        geometry = geometry.clone();
        const n = geometry.attributes.normal,
          col = new Float32Array(n.count * 3);
        const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
        const v = new THREE.Vector3(),
          c = new THREE.Color();
        const slate = new THREE.Color(0x5a6578),
          snow = new THREE.Color(0xe9f2f6);
        for (let i = 0; i < n.count; i++) {
          v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
          const w = THREE.MathUtils.smoothstep(v.y, 0.45, 0.75);
          c.copy(slate).lerp(snow, w);
          col.set([c.r, c.g, c.b], i * 3);
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
        material.vertexColors = true;
      } else {
        const hsl = material.color.getHSL({});
        // Glacier white is cyan enough to pass the hue test; its authored roughness keeps frost matte.
        if (
          hsl.h > 0.45 &&
          hsl.h < 0.65 &&
          hsl.s > 0.2 &&
          material.roughness < 0.6
        ) {
          material.roughness = 0.1;
          material.metalness = 0.15;
          material.envMapIntensity = 1.3;
        }
      }
      const inst = new THREE.InstancedMesh(geometry, material, mats.length);
      mats.forEach((pm, i) =>
        inst.setMatrixAt(i, pm.clone().multiply(m.matrixWorld)),
      );
      inst.computeBoundingSphere();
      inst.castShadow = true;
      inst.receiveShadow = true;
      // A shadow material of their own: three.js recompiles its shared one each time it goes
      // from an instanced caster to a plain one, into whichever variant the next caster needs.
      inst.customDepthMaterial = this.instancedDepth ??=
        new THREE.MeshDepthMaterial();
      this.scene.add(inst);
    });
  }

  // A cluster of ice spires: a round the explorer cannot stand on, so a jump slides off it.
  async spire(x, z, yaw, s) {
    const o =
      (await this.place("ice_spire", x, z, {
        yaw,
        s,
        opts: { surfaces: false },
      })) || this.stand(fallbackSpire(), x, z, yaw, s);
    this.iceLook(o);
    return this.world.addRound(
      x,
      z,
      1.05 * s,
      -10,
      o.position.y + 4 * s,
      "prop",
    );
  }

  // Ice assets are flat colour: here they gain gloss.
  iceLook(o) {
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = true;
      const c = m.material.color;
      if (!c) return;
      const hsl = c.getHSL({});
      if (
        hsl.h > 0.45 &&
        hsl.h < 0.65 &&
        hsl.s > 0.2 &&
        m.material.roughness < 0.6
      ) {
        m.material = m.material.clone();
        m.material.roughness = 0.1;
        m.material.metalness = 0.15;
        m.material.envMapIntensity = 1.3;
      }
    });
  }

  // --- the frozen pond: blocks of ice that slide until something stops them -------------------
  async buildPond() {
    for (const [x, z] of POND.pillars) {
      const r = await this.spire(x, z, x * 0.7 + z, 0.95);
      r.r = 0.95;
    }
    const mesh =
      (await this.assets.make("ice_block", { surfaces: false })) ||
      fallbackBlock();
    this.iceLook(mesh);
    this.scene.add(mesh);
    const block = {
      home: { ...POND.block },
      x: POND.block.x,
      z: POND.block.z,
      mesh,
      slides: true,
      state: "rest",
      t: 0,
    };
    block.ref = block;
    block.box = this.world.add(0, -0.5, 0, 0, 1.9, 0, "block", block, {
      unsafe: true,
    });
    this.blocks.push(block);
    this.settleBlock(block, block.x, block.z);
    // Pulsed by the orb, a block shatters and forms again where it began.
    block.target = {
      radius: 1.1,
      center: () => V(block.x, 0.95, block.z),
      alive: () => block.state === "rest",
      onHit: () => this.shatter(block),
    };
  }

  settleBlock(block, x, z) {
    block.x = x;
    block.z = z;
    block.mesh.position.set(x, 0, z);
    Object.assign(block.box, {
      minX: x - 0.95,
      maxX: x + 0.95,
      minZ: z - 0.95,
      maxZ: z + 0.95,
    });
  }

  // Is the cell centred on (x, z) open ice in the pond, clear of walls, pillars, the other
  // blocks and the explorer?
  cellFree(block, x, z, hero) {
    if (x < POND.minX || x > POND.maxX || z < POND.minZ || z > POND.maxZ)
      return false;
    if (!this.world.slickAt(x, z, 0)) return false;
    if (
      !this.world.freeBox(
        x - 0.93,
        z - 0.93,
        x + 0.93,
        z + 0.93,
        0.05,
        1.85,
        block.box,
      )
    )
      return false;
    return !(
      hero &&
      Math.abs(hero.pos.x - x) < 1.3 &&
      Math.abs(hero.pos.z - z) < 1.3 &&
      hero.feet < 1.8
    );
  }

  // One push: the block runs cell by cell until the next one is taken.
  moveBlock(block, dir, hero) {
    if (block.state !== "rest") return false;
    let x = block.x,
      z = block.z,
      n = 0;
    while (
      n < 12 &&
      this.cellFree(block, x + dir.x * CELL, z + dir.z * CELL, hero)
    ) {
      x += dir.x * CELL;
      z += dir.z * CELL;
      n++;
    }
    if (!n) return false;
    block.state = "sliding";
    block.t = 0;
    block.from = { x: block.x, z: block.z };
    block.to = { x, z };
    block.duration = 0.25 + 0.22 * n;
    this.services.sound?.play("slide");
    this.onSlide?.(block);
    return true;
  }

  isMoving(block) {
    return block.state === "sliding";
  }

  // A block with nowhere to go: every push is blocked, or its pusher would have to stand in
  // a wall. Under the notch it is where it should be, not stuck.
  stuck(block) {
    if (
      Math.abs(block.x - POND.notch.x) < 0.1 &&
      Math.abs(block.z - POND.notch.z) < 0.1
    )
      return false;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ahead = this.cellFree(
        block,
        block.x + dx * CELL,
        block.z + dz * CELL,
      );
      const bx = block.x - dx * CELL,
        bz = block.z - dz * CELL;
      const behind =
        this.world.free(bx, bz, 0.35, 0.05, 1.8) &&
        this.world.ground(bx, bz, 0.2, 0.1, 0.1) > -1;
      if (ahead && behind) return false;
    }
    return true;
  }

  shatter(block) {
    if (block.state !== "rest") return;
    block.state = "gone";
    block.t = 0;
    block.mesh.visible = false;
    block.box.solid = false;
    this.services.sound?.play("shatter");
    this.onShatter?.(block);
  }

  updateBlocks(dt, hero) {
    for (const b of this.blocks) {
      b.t += dt;
      if (b.state === "sliding") {
        const k = Math.min(1, b.t / b.duration);
        const e = 1 - (1 - k) * (1 - k);
        this.settleBlock(
          b,
          b.from.x + (b.to.x - b.from.x) * e,
          b.from.z + (b.to.z - b.from.z) * e,
        );
        if (k >= 1) {
          b.state = "rest";
          this.settleBlock(b, b.to.x, b.to.z);
          this.services.sound?.play("thud");
          this.onRest?.(b);
        }
      } else if (b.state === "gone" && b.t > 1.2) {
        // Forms again at home once the explorer is clear of the spot.
        const h = b.home;
        if (
          Math.abs(hero.pos.x - h.x) < 1.4 &&
          Math.abs(hero.pos.z - h.z) < 1.4
        )
          continue;
        b.state = "forming";
        b.t = 0;
        this.settleBlock(b, h.x, h.z);
        b.mesh.visible = true;
        b.mesh.scale.setScalar(0.01);
        b.box.solid = true;
      } else if (b.state === "forming") {
        const k = Math.min(1, b.t / GROW);
        b.mesh.scale.setScalar(Math.max(0.01, k * k * (3 - 2 * k)));
        if (k >= 1) b.state = "rest";
      }
    }
  }

  // --- the lake: thin ice and drifting floes ----------------------------------------------------
  buildLake() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 60).rotateX(-Math.PI / 2),
      coldWaterMaterial(THREE),
    );
    water.position.set(0, WATER, -120);
    water.receiveShadow = true;
    this.scene.add(water);
    this.water = water;
    const fractures = iceFractureTexture(THREE);
    const rand = seeded(19);
    for (const [minX, minZ, maxX, maxZ] of THIN) {
      const box = this.world.add(
        minX,
        THIN_TOP - 0.4,
        minZ,
        maxX,
        THIN_TOP,
        maxZ,
        "rock",
        null,
        { slick: true, unsafe: true, grab: false },
      );
      const mesh = new THREE.Mesh(
        slab(minX, THIN_TOP - 0.18, minZ, maxX, THIN_TOP, maxZ, rand, 0.02),
        iceFractureMaterial(this.mat.thin, fractures),
      );
      iceFractureUV(THREE, mesh.geometry, box, this.thin.length);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.thin.push({ box, mesh, phase: "still", t: 0 });
    }
    for (const def of FLOES) {
      const geo = slab(
        -FLOE.width / 2,
        FLOE.top - 0.45,
        def.minZ,
        FLOE.width / 2,
        FLOE.top,
        def.maxZ,
        rand,
        0.06,
      );
      const mesh = new THREE.Mesh(geo, this.mat.floe);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      const box = this.world.add(
        -FLOE.width / 2,
        FLOE.top - 0.45,
        def.minZ,
        FLOE.width / 2,
        FLOE.top,
        def.maxZ,
        "rock",
        null,
        { unsafe: true, grab: false },
      );
      this.floes.push({ ...def, mesh, box, x: 0, y: 0 });
    }
  }

  // Where a floe is `t` seconds into its round: resting at one side of the channel, drifting
  // across, resting at the other, drifting back.
  floeX(floe, t) {
    const { dwell, travel, reach } = FLOE;
    const period = 2 * (dwell + travel);
    let u = ((((t / period + floe.phase) % 1) + 1) % 1) * period,
      f;
    if (u < dwell) f = 0;
    else if ((u -= dwell) < travel) f = ease(u / travel);
    else if ((u -= travel) < dwell) f = 1;
    else f = 1 - ease((u - dwell) / travel);
    return -reach + 2 * reach * f;
  }

  onFloe(floe, hero) {
    if (!["ground", "roll"].includes(hero.state)) return false;
    const b = floe.box;
    return (
      Math.abs(hero.feet - b.maxY) < 0.08 &&
      hero.pos.x > b.minX - 0.2 &&
      hero.pos.x < b.maxX + 0.2 &&
      hero.pos.z > b.minZ - 0.2 &&
      hero.pos.z < b.maxZ + 0.2
    );
  }

  updateLake(dt, hero) {
    const sound = this.services.sound;
    for (const f of this.floes) {
      const riding = this.onFloe(f, hero);
      const x = this.floeX(f, this.time);
      // The swell moves the standing surface too, or boots sink into the drawn floe.
      const y = Math.sin(this.time * 1.3 + f.phase * 6) * 0.03;
      const dx = x - f.x,
        dy = y - f.y;
      f.x = x;
      f.y = y;
      f.box.minX += dx;
      f.box.maxX += dx;
      f.box.minY += dy;
      f.box.maxY += dy;
      f.mesh.position.x = x;
      f.mesh.position.y = y;
      if (riding) {
        hero.carry(dx, 0);
        hero.feet += dy;
      }
    }
    for (const t of this.thin) {
      t.t += dt;
      const b = t.box;
      const standing =
        ["ground", "roll"].includes(hero.state) &&
        Math.abs(hero.feet - b.maxY) < 0.08 &&
        hero.pos.x > b.minX - 0.15 &&
        hero.pos.x < b.maxX + 0.15 &&
        hero.pos.z > b.minZ - 0.15 &&
        hero.pos.z < b.maxZ + 0.15;
      if (t.phase === "still" && standing) {
        t.phase = "crack";
        t.t = 0;
        sound?.play("crack");
      } else if (t.phase === "crack") {
        setIceFractureLoad(t.mesh.material, t.t / CRACK);
        t.mesh.material.color
          .copy(THIN_ICE)
          .lerp(FROST, Math.min(1, t.t / CRACK) * 0.6);
        t.mesh.position.y = (Math.random() - 0.5) * 0.02 * (t.t / CRACK);
        if (t.t >= CRACK) {
          t.phase = "sink";
          t.t = 0;
          b.solid = false;
          sound?.play("break");
        }
      } else if (t.phase === "sink") {
        t.mesh.position.y = -0.6 * Math.min(1, t.t / SINK);
        t.mesh.material.opacity = 0.86 * (1 - Math.min(1, t.t / SINK));
        if (t.t >= SINK) {
          t.phase = "gone";
          t.t = 0;
          t.mesh.visible = false;
        }
      } else if (t.phase === "gone" && t.t >= REFREEZE) {
        t.phase = "freeze";
        t.t = 0;
        t.mesh.visible = true;
        t.mesh.position.y = 0;
        t.mesh.material.color.copy(THIN_ICE);
        setIceFractureLoad(t.mesh.material, 0);
      } else if (t.phase === "freeze") {
        t.mesh.material.opacity = 0.86 * Math.min(1, t.t / 1.2);
        if (t.t >= 1.2) {
          t.phase = "still";
          b.solid = true;
        }
      }
    }
  }

  // --- the island: the prism, the frozen stela and the great ring -------------------------------
  async buildIsland() {
    const I = ISLAND;
    // The prism emits a vertical light column.
    const p = I.prism;
    const y = p.y ?? I.top;
    const crystal = await this.assets.make("crystal_emitter", {
      keepHierarchy: true,
    });
    const at = crystal?.userData.beam ?? [0, 1.55, 0];
    if (crystal) {
      crystal.position.set(p.x, y, p.z);
      crystal.userData.parts?.crystal?.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.emissive = TURQUOISE.clone();
        m.material.emissiveIntensity = 2.2;
      });
      this.scene.add(crystal);
    }
    this.world.addRound(p.x, p.z, 0.62, y - 1, y + 2.1, "prop");
    const center = V(p.x + at[0], y + at[1], p.z + at[2]);
    // Its light answers only on the shelf, so the climb is the way to the charge.
    const reached = () => this.climbs.onShelf(this.climbs.hero);
    this.prism = {
      center,
      beam: {
        from: center.clone(),
        to: center.clone().add(V(0, 70, 0)),
        active: reached,
      },
      target: {
        radius: 0.4,
        center: () => center,
        alive: reached,
        onHit: () => {},
      },
    };
    this.beamMesh(this.prism.beam);
    const glow = new THREE.PointLight(0x39e3d0, 8, 8, 1.6);
    glow.position.copy(center);
    this.scene.add(glow);

    // The stela, its glyph dark, inside a casing of three layers of ice.
    const s = I.stela;
    const stela = await this.assets.make("glyph_stela", {
      keepHierarchy: true,
    });
    if (stela) {
      stela.position.set(s.x, y, s.z);
      this.scene.add(stela);
      const panel = stela.userData.panel || {
        center: [0, 0.77, 0.3],
        size: 0.48,
      };
      this.glyphMat = glyphMaterial();
      const mark = makeGlyph("star", panel.size * 0.85, this.glyphMat);
      mark.position.set(
        panel.center[0],
        panel.center[1],
        panel.center[2] + 0.004,
      );
      stela.add(mark);
      this.stelaLens = [];
      stela.userData.parts?.lens?.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = TURQUOISE.clone();
        o.material.emissiveIntensity = 0;
        this.stelaLens.push(o.material);
      });
    }
    this.world.add(
      s.x - 0.62,
      -10,
      s.z - 0.34,
      s.x + 0.62,
      y + 2.4,
      s.z + 0.34,
      "stela",
    );
    const casing =
      (await this.assets.make("ice_casing", {
        keepHierarchy: true,
        surfaces: false,
      })) || fallbackCasing();
    casing.position.set(s.x, y, s.z);
    this.iceLook(casing);
    // Translucent enough to show the stone standing inside.
    casing.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.transparent = true;
      m.material.opacity = 0.8;
      m.material.depthWrite = false;
    });
    this.scene.add(casing);
    const parts = casing.userData.parts || {};
    this.layers = ["outer", "middle", "inner"]
      .map((k) => parts[k])
      .filter(Boolean)
      .map((node) => ({ node, home: node.position.clone(), fall: -1 }));
    if (!this.layers.length)
      this.layers = [{ node: casing, home: casing.position.clone(), fall: -1 }];
    this.casingBox = this.world.add(
      s.x - 0.9,
      -10,
      s.z - 0.65,
      s.x + 0.9,
      y + 3,
      s.z + 0.65,
      "prop",
      null,
      {
        grab: false,
        stand: false,
      },
    );
    this.casing = {
      target: {
        radius: 1.0,
        center: () => V(s.x, y + 1.5, s.z),
        alive: () => this.broken < this.layers.length,
        onHit: (disc) => this.strike(disc),
      },
    };
  }

  beamMesh({ from, to }) {
    const len = from.distanceTo(to);
    for (const [radius, color, opacity] of [
      [0.03, new THREE.Color(0.8, 2.6, 2.4), 1],
      [0.12, new THREE.Color(0.15, 0.7, 0.65), 0.3],
    ]) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, len, 10, 1, true).translate(
          0,
          len / 2,
          0,
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          fog: false,
        }),
      );
      m.position.copy(from);
      m.frustumCulled = false;
      this.scene.add(m);
    }
  }

  // A charged orb pulse knocks away one layer of the ice; a dark one only rings on it. Left alone
  // for too long, the ice heals a layer.
  strike(disc) {
    const sound = this.services.sound;
    if (!disc.charged) {
      sound?.play("clink");
      this.onDark?.();
      return;
    }
    const layer = this.layers[this.broken];
    if (!layer) return;
    layer.fall = 0;
    this.broken++;
    this.lastStrike = this.time;
    sound?.play("shatter");
    this.onCrack?.(this.broken, this.layers.length);
    if (this.broken >= this.layers.length) this.free();
  }

  free() {
    this.freed = true;
    this.casingBox.solid = false;
    if (this.glyphMat) this.glyphMat.emissiveIntensity = 2.6;
    for (const m of this.stelaLens || []) m.emissiveIntensity = 3;
    this.services.sound?.play("chime", 2);
    this.onFree?.();
  }

  updateCasing(dt) {
    for (const l of this.layers) {
      if (l.fall < 0) continue;
      l.fall += dt;
      // Shards slump and slide away, then vanish.
      l.node.position.set(
        l.home.x,
        l.home.y - 1.2 * l.fall * l.fall,
        l.home.z + 0.6 * l.fall,
      );
      l.node.rotation.x = l.fall * 0.5;
      if (l.fall > 1.4) l.node.visible = false;
    }
    // The ice heals if the next strike is too slow in coming.
    if (!this.freed && this.broken > 0 && this.time - this.lastStrike > HEAL) {
      const l = this.layers[--this.broken];
      l.fall = -1;
      l.node.visible = true;
      l.node.position.copy(l.home);
      l.node.rotation.set(0, 0, 0);
      this.lastStrike = this.time;
      this.services.sound?.play("freeze");
      this.onHeal?.(this.broken);
    }
  }

  // --- the frame ---------------------------------------------------------------------------------
  update(dt, hero) {
    this.time += dt;
    setColdWaterTime(this.water.material, this.time);
    this.updateBlocks(dt, hero);
    this.updateLake(dt, hero);
    this.updateCasing(dt);
    this.fallingIce?.update(dt, hero);
    this.climbs?.update(dt, hero);
    const grounded = ["ground", "roll", "grab"].includes(hero.state);
    if (grounded && !this.world.unsafeAt(hero.pos.x, hero.pos.z, hero.feet)) {
      const k = SECTIONS.findLastIndex((s) => hero.pos.z <= s.z);
      this.reached = Math.max(this.reached, k);
    }
    this.trail?.update(dt, hero);
  }

  interactables() {
    return [
      ...(this.climbs?.interactables() ?? []),
      ...(this.trail?.interactables() ?? []),
      ...this.blocks
        .filter((b) => b.state === "rest")
        .map((b) => ({ kind: "block", box: b.box, ref: b })),
    ];
  }

  // The HUD's part: the objective and its markers.
  guide(hud, hero, disc) {
    if (this.trail?.guide(hud, hero)) return;
    const section = SECTIONS[this.reached]?.id;
    const charged = disc?.charged;
    let key, objective, sub, marks;
    if (this.freed) {
      key = "freed";
      objective = "";
      sub = "";
      marks = [];
    } else if (section === "stream" && hero.pos.z < -46.5) {
      key = `fall:${!!hero.axes}`;
      objective = "Climb the frozen fall";
      sub = hero.axes
        ? "Jump at the scarred ice and climb with Mira's axes"
        : "Take Mira's ice axes from its foot";
      marks = [
        hero.axes
          ? V(POCKET.x, POCKET.top + 0.6, POCKET.face - 0.8)
          : V(POCKET.axes.x, 1, POCKET.axes.z),
      ];
    } else if (section === "stream") {
      key = "stream";
      objective = "Follow Mira's tracks";
      sub = "Run down the frozen stream, slide, and jump the crevasse";
      marks = [V(0, 1.2, -48)];
    } else if (section === "pond") {
      const block = this.blocks[0];
      const stuck = block.state === "rest" && this.stuck(block);
      key = `pond:${stuck}`;
      objective = "Climb out of the frozen pond";
      sub = stuck
        ? "The block is stuck: pulse it to return it to its starting point"
        : "Push the ice block under the low notch in the wall";
      marks = [V(POND.notch.x, 4.8, POND.notch.z - 1)];
    } else if (section === "lake") {
      key = "lake";
      objective = "Cross the frozen lake";
      sub = "Thin ice cracks under your feet: keep moving";
      marks = [V(0, 1.4, -123)];
    } else if (section === "floes") {
      key = "floes";
      objective = "Cross the channel on the floes";
      sub = "Hop onto each floe as it drifts past";
      marks = [V(0, 1.8, -136.5)];
    } else {
      key = `island:${charged}:${this.broken}`;
      objective = "Free the third glyph";
      sub = charged
        ? `Pulse the ice with the charged orb (${this.broken} of ${this.layers.length})`
        : this.climbs.onShelf(hero)
          ? "Aim at the prism and link to charge the orb"
          : "Climb the scarred fall to the prism's shelf";
      marks = [
        charged
          ? V(ISLAND.stela.x, ISLAND.top + 3.4, ISLAND.stela.z)
          : this.prism.center.clone().add(V(0, 0.9, 0)),
      ];
    }
    hud.objective(objective, sub);
    if (this.guideKey !== key) hud.setMarkers(marks);
    this.guideKey = key;
  }

  prepareForCompile(on) {
    this.fallingIce?.prepareForCompile(on);
    this.climbs?.prepareForCompile(on);
    prepareVisuals(this, on, [
      ...this.thin.map(({ mesh }) => [mesh, "visible", true]),
      ...this.blocks.map(({ mesh }) => [mesh, "visible", true]),
      ...this.layers.map(({ node }) => [node, "visible", true]),
    ]);
  }

  reset() {
    this.time = 0;
    setColdWaterTime(this.water.material, 0);
    this.reached = 0;
    this.broken = 0;
    this.lastStrike = 0;
    this.freed = false;
    this.guideKey = null;
    for (const b of this.blocks) {
      b.state = "rest";
      b.t = 0;
      b.mesh.visible = true;
      b.mesh.scale.setScalar(1);
      b.box.solid = true;
      this.settleBlock(b, b.home.x, b.home.z);
    }
    for (const t of this.thin) {
      t.phase = "still";
      t.t = 0;
      t.box.solid = true;
      t.mesh.visible = true;
      t.mesh.position.y = 0;
      t.mesh.material.opacity = 0.86;
      t.mesh.material.color.copy(THIN_ICE);
      setIceFractureLoad(t.mesh.material, 0);
    }
    for (const f of this.floes) {
      const x = this.floeX(f, 0);
      f.box.minX += x - f.x;
      f.box.maxX += x - f.x;
      f.x = x;
      f.mesh.position.x = x;
    }
    for (const l of this.layers || []) {
      l.fall = -1;
      l.node.visible = true;
      l.node.position.copy(l.home);
      l.node.rotation.set(0, 0, 0);
    }
    if (this.casingBox) this.casingBox.solid = true;
    if (this.glyphMat) this.glyphMat.emissiveIntensity = 0;
    for (const m of this.stelaLens || []) m.emissiveIntensity = 0;
    this.trail?.reset();
    this.fallingIce?.reset();
    this.climbs?.reset();
  }
}

const HEAL = 6;

function ease(t) {
  return t * t * (3 - 2 * t);
}

// White fractures and trapped bubbles in clear ice, drawn once at load; the slabs map it by
// their size in metres, so a tile covers about eight metres.
function crackTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 512, 512);
  const rand = seeded(31);
  g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    let x = rand() * 512,
      y = rand() * 512,
      a = rand() * Math.PI * 2;
    g.strokeStyle = `rgba(235, 248, 255, ${0.35 + rand() * 0.4})`;
    g.lineWidth = 0.8 + rand() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6 + rand() * 8; k++) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * (10 + rand() * 26);
      y += Math.sin(a) * (10 + rand() * 26);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(240, 250, 255, ${0.25 + rand() * 0.35})`;
    g.beginPath();
    g.arc(rand() * 512, rand() * 512, 1 + rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // The texture multiplies the ice's colour: darken between the marks so they stand out.
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "rgb(205, 222, 232)";
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 8, 1 / 8);
  t.anisotropy = 4;
  return t;
}

// A faint grain for snow, so wide shelves are not a flat white.
function grainTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const img = g.createImageData(256, 256);
  const rand = seeded(47);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 232 + Math.floor(rand() * 23);
    img.data.set([v, v + 1, 255, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 3, 1 / 3);
  return t;
}

// A small deterministic random source, so the rocks come out the same every load.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A chunky mass of rock filling a box: its sides bulge and its top edge is broken, so walls
// read as faceted stone rather than boxes.
// `strata` wears layers back into the sides, never out past the collider's face, as deep as
// strata times half a metre.
function mass(
  minX,
  minY,
  minZ,
  maxX,
  maxY,
  maxZ,
  rand,
  rough = 0.5,
  strata = 0,
) {
  const w = maxX - minX,
    h = maxY - minY,
    d = maxZ - minZ;
  const across = strata ? 1.3 : 2.2,
    up = strata ? 0.9 : 2.5;
  const g = new THREE.BoxGeometry(
    w,
    h,
    d,
    Math.max(1, Math.round(w / across)),
    Math.max(1, Math.round(h / up)),
    Math.max(1, Math.round(d / across)),
  );
  const p = g.attributes.position;
  const jitter = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!jitter.has(key)) {
      const top = y > h / 2 - 1e-3;
      // The walkable top stays flat; the sides and the lip move.
      jitter.set(key, [
        (rand() - 0.5) * rough * (top ? 0.3 : 1),
        top ? 0 : (rand() - 0.5) * rough * 0.8,
        (rand() - 0.5) * rough * (top ? 0.3 : 1),
      ]);
    }
    const [jx, jy, jz] = jitter.get(key);
    const edgeX = Math.abs(Math.abs(x) - w / 2) < 1e-3,
      edgeZ = Math.abs(Math.abs(z) - d / 2) < 1e-3;
    let ix = 0,
      iz = 0;
    if (strata && y < h / 2 - 1e-3 && y > -h / 2 + 1e-3) {
      const wx = x + minX + w / 2,
        wy = y + minY + h / 2,
        wz = z + minZ + d / 2;
      const band =
        strata *
        (0.22 * (1 + Math.sin(wy * 3.1 + (wx + wz) * 0.17)) +
          0.1 * (1 + Math.sin(wy * 7.3 + wx * 0.8 - wz * 0.6)));
      if (edgeX) ix = -Math.sign(x) * band;
      if (edgeZ) iz = -Math.sign(z) * band;
    }
    p.setXYZ(i, x + (edgeX ? jx + ix : 0), y + jy, z + (edgeZ ? jz + iz : 0));
  }
  g.translate(minX + w / 2, minY + h / 2, minZ + d / 2);
  return g.toNonIndexed();
}

function cantilever(minX, minY, minZ, maxX, maxY, maxZ) {
  const left = (minX + maxX) / 2 < 0;
  const root = left ? minX : maxX;
  const direction = left ? 1 : -1;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const sections = [0, 0.16, 0.34, 0.53, 0.7, 0.86, 1];
  const rings = sections.map((fraction, i) => {
    const x = root + direction * width * fraction;
    const taper = Math.max(0, (fraction - 0.72) / 0.28);
    const front = maxZ - depth * (taper * 0.24 + (i % 3) * 0.027);
    const back = minZ + depth * (taper * 0.31 + ((i + 1) % 3) * 0.024);
    const bottom = minY + taper * taper * 0.44 + (i % 2) * 0.035;
    const top = maxY - taper * 0.22 - (i % 3) * 0.045;
    return [
      [x, bottom + 0.055, front],
      [x, bottom, back],
      [x, top - 0.07, back],
      [x, top, front],
    ];
  });
  const vertices = [];
  const triangle = (a, b, c) => {
    if (left) vertices.push(...a, ...b, ...c);
    else vertices.push(...c, ...b, ...a);
  };
  for (let i = 0; i < rings.length - 1; i++)
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4;
      triangle(rings[i][edge], rings[i][next], rings[i + 1][next]);
      triangle(rings[i][edge], rings[i + 1][next], rings[i + 1][edge]);
    }
  const first = rings[0];
  const last = rings.at(-1);
  triangle(first[0], first[2], first[1]);
  triangle(first[0], first[3], first[2]);
  triangle(last[0], last[1], last[2]);
  triangle(last[0], last[2], last[3]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

// A thin slab with a slightly broken outline: snow on rock, a sheet of ice, a floe.
function slab(minX, minY, minZ, maxX, maxY, maxZ, rand, rough) {
  const w = maxX - minX,
    d = maxZ - minZ;
  const shape = new THREE.Shape();
  const pts = [];
  const nx = Math.max(2, Math.round(w / 1.5)),
    nz = Math.max(2, Math.round(d / 1.5));
  const edge = (a, b, n, fixed, along) => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const v = a + (b - a) * t;
      const j = (rand() - 0.5) * rough * 2;
      pts.push(along === "x" ? [v, fixed + j] : [fixed + j, v]);
    }
  };
  edge(minX, maxX, nx, minZ, "x");
  edge(minZ, maxZ, nz, maxX, "z");
  edge(maxX, minX, nx, maxZ, "x");
  edge(maxZ, minZ, nz, minX, "z");
  pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  // The bevel adds its thickness above and below: keep the top where the collider's is.
  const bevel = Math.min(0.06, (maxY - minY) / 4);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: maxY - minY - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: Math.min(0.08, rough + 0.02),
    bevelSegments: 1,
  });
  // The shape lies in x and -z; lay it flat with its top at maxY.
  g.rotateX(-Math.PI / 2);
  g.translate(0, minY + bevel, 0);
  return g.toNonIndexed();
}

// Splits rock into its walls and the faces that look up, where snow lies.
function splitLedges(geos) {
  const walls = [],
    ledges = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (const g of geos) {
    const p = g.attributes.position.array;
    const keep = [],
      up = [];
    for (let t = 0; t < p.length; t += 9) {
      a.fromArray(p, t);
      b.fromArray(p, t + 3).sub(a);
      c.fromArray(p, t + 6).sub(a);
      const n = b.cross(c).normalize();
      (n.y > 0.82 ? up : keep).push(...p.slice(t, t + 9));
    }
    for (const [list, out] of [
      [keep, walls],
      [up, ledges],
    ])
      if (list.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(list), 3),
        );
        out.push(geo);
      }
  }
  return [walls, ledges];
}

// One geometry from many, with texture coordinates in world space: each face takes the
// plane it faces most, so a texture keeps its size across walls, tops and ledges.
function mergeAll(geos, uvScale = 1) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3),
    nor = new Float32Array(count * 3),
    uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of geos) {
    const gi = g.index ? g.toNonIndexed() : g;
    gi.computeVertexNormals();
    pos.set(gi.attributes.position.array, o * 3);
    nor.set(gi.attributes.normal.array, o * 3);
    o += gi.attributes.position.count;
  }
  for (let t = 0; t < count; t += 3) {
    let nx = 0,
      ny = 0,
      nz = 0;
    for (let k = t; k < t + 3; k++) {
      nx += nor[k * 3];
      ny += nor[k * 3 + 1];
      nz += nor[k * 3 + 2];
    }
    const ax = Math.abs(nx),
      ay = Math.abs(ny),
      az = Math.abs(nz);
    for (let k = t; k < t + 3; k++) {
      const x = pos[k * 3],
        y = pos[k * 3 + 1],
        z = pos[k * 3 + 2];
      const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
      uv[k * 2] = u * uvScale;
      uv[k * 2 + 1] = v * uvScale;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

// --- stand-ins until the generated assets load --------------------------------------------------
function fallbackBlock() {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 1.9, 1.9),
    new THREE.MeshStandardMaterial({ color: 0xa9d2e3, roughness: 0.1 }),
  );
  m.position.y = 0.95;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function fallbackSpire() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xa9d2e3,
    roughness: 0.1,
  });
  for (const [x, z, h, lean] of [
    [0, 0, 4, 0],
    [0.6, 0.3, 2.8, 0.3],
    [-0.5, -0.4, 2.6, -0.35],
  ]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.35, h, 6), mat);
    c.position.set(x, h / 2, z);
    c.rotation.z = lean;
    g.add(c);
  }
  return g;
}

function fallbackPine() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.25, 1.4, 7),
    new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }),
  );
  trunk.position.y = 0.7;
  g.add(trunk);
  const needles = new THREE.MeshStandardMaterial({
    color: 0x2f4a3e,
    roughness: 0.9,
  });
  const snow = new THREE.MeshStandardMaterial({
    color: 0xe9f2f6,
    roughness: 0.8,
  });
  for (let i = 0; i < 4; i++) {
    const r = 1.8 - i * 0.38,
      y = 1.4 + i * 1.3;
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, 1.9, 8), needles);
    c.position.y = y + 0.95;
    const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, 0.7, 8), snow);
    s.position.y = y + 1.45;
    g.add(c, s);
  }
  return g;
}

function fallbackCairn() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3d4654,
    roughness: 0.9,
  });
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const r = 0.36 - i * 0.05,
      h = 0.18;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 7), mat);
    s.position.set(i % 2 ? 0.04 : -0.03, y + h / 2, 0);
    y += h;
    g.add(s);
  }
  return g;
}

function fallbackCasing() {
  const g = new THREE.Group();
  const parts = {};
  for (const [name, r, h] of [
    ["outer", 0.9, 3],
    ["middle", 0.75, 2.8],
    ["inner", 0.62, 2.6],
  ]) {
    const layer = new THREE.Group();
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.7, r, h, 7, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xa9d2e3,
        roughness: 0.1,
        side: THREE.DoubleSide,
      }),
    );
    m.position.y = h / 2;
    layer.add(m);
    g.add(layer);
    parts[name] = layer;
  }
  g.userData.parts = parts;
  return g;
}
