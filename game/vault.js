import * as THREE from "three";
import { FaceBuilder, terrainMaterial } from "./terrain.js";
import { glyphMaterial, makeGlyph } from "./glyphs.js";
import { brightStars, planet, spaceSky } from "./space-vista.js";
import { spaceGate } from "./space-gate.js";
import { gateColliders } from "./gate.js";

// The builders' vault: a sealed hall of the network inside a hollow rock beside the drifting
// last door. A nave runs north from the arrival ring to a round sealed door; six bays open off
// it, three a side, each keeping a piece of the world it remembers. Every bay wakes one seal,
// whose channel of light runs along the nave floor to its medallion on the door's arch.
//
// The nave floor is at 0; north is -z. West bays span x -33..-9, east bays 9..33.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const LIGHT = 0x39e3d0;

export const NAVE = { minX: -8, maxX: 8, minZ: -66, maxZ: 12, top: 14 };
export const RING = { x: 0, z: 10.5, dais: 1.0 };
export const ARRIVAL = { x: 0, z: 4.6, feet: 0, yaw: Math.PI };
export const OCULUS = { z: -32, half: 4 };
export const DOOR = { x: 0, z: -67 };

// The six bays in the order Mira leads through them, with the address glyph each seal wakes.
// `entry` is the opening in the nave wall; `refuge` is where a knocked out explorer returns;
// `hover` is where Mira's light waits over the trial.
export const BAYS = [
  {
    id: "court",
    palette: "wall",
    glyph: "twin",
    side: -1,
    z0: -19.5,
    z1: -4.5,
    entry: [-15, -9],
    refuge: { x: -11.5, z: -12, yaw: -Math.PI / 2 },
    hover: V(-23, 3.2, -12),
    title: "Relayed light",
    slot: { z0: -17.7, z1: -16.3, y0: 4.6, y1: 8.2 },
  },
  {
    id: "checkpoint",
    palette: "nightWall",
    glyph: "crescent",
    side: 1,
    z0: -19.5,
    z1: -4.5,
    entry: [-15, -9],
    refuge: { x: 11.5, z: -12, yaw: Math.PI / 2 },
    hover: V(14, 3.2, -9),
    title: "The keeper",
  },
  {
    id: "isles",
    palette: "dawn",
    glyph: "peak",
    side: -1,
    z0: -39.5,
    z1: -24.5,
    entry: [-30, -25],
    refuge: { x: -11.5, z: -27.5, yaw: -Math.PI / 2 },
    hover: V(-21, 4.2, -30),
    title: "A bridge of light",
  },
  {
    id: "frost",
    palette: "slate",
    glyph: "star",
    side: 1,
    z0: -39.5,
    z1: -24.5,
    entry: [-35, -29],
    refuge: { x: 11.2, z: -32, yaw: Math.PI / 2 },
    hover: V(20, 3.4, -33),
    title: "Sliding ice",
  },
  {
    id: "forest",
    palette: "mossWall",
    glyph: "spiral",
    side: -1,
    z0: -59.5,
    z1: -44.5,
    entry: [-55, -49],
    refuge: { x: -11, z: -52, yaw: -Math.PI / 2 },
    hover: V(-21, 2.6, -52),
    title: "Sinking stones",
  },
  {
    id: "sea",
    palette: "drowned",
    glyph: "waves",
    side: 1,
    z0: -59.5,
    z1: -44.5,
    entry: [-55, -49],
    refuge: { x: 12, z: -52, yaw: Math.PI / 2 },
    hover: V(21, 1.6, -52),
    title: "The flooded well",
  },
];
export const ADDRESS = BAYS.map((bay) => bay.glyph);

// The bay a point lies in, or null in the nave.
export function bayAt(x, z) {
  if (Math.abs(x) < 8.6) return null;
  const side = Math.sign(x);
  return (
    BAYS.find(
      (bay) => bay.side === side && z >= bay.z0 - 0.5 && z <= bay.z1 + 0.5,
    ) || null
  );
}

// Materials shared by the vault's own masonry, one set per world remembered by a bay.
export function vaultMaterials() {
  const masonry = (color, roughness = 0.9) =>
    terrainMaterial("masonry", color, roughness, { ao: false });
  const floor = (color, roughness = 0.92) =>
    terrainMaterial("floor", color, roughness, { ao: false });
  return {
    wall: masonry(0xb57f4f),
    wallTop: masonry(0xd4a373),
    base: masonry(0x8a5433, 0.94),
    bone: masonry(0xe6d3ae, 0.84),
    basalt: masonry(0x3a3531, 0.86),
    floor: floor(0xc4935f),
    sand: terrainMaterial("sand", 0xd4a373, 0.98, { ao: false }),
    night: floor(0x2a2830, 0.9),
    nightWall: masonry(0x34303a, 0.92),
    dawn: masonry(0xeadcc0, 0.86),
    slate: masonry(0x3d4654, 0.92),
    moss: masonry(0x4f6a3a, 0.96),
    mossWall: masonry(0x5c6650, 0.95),
    drowned: masonry(0xbcb6a1, 0.9),
    ceiling: masonry(0x6e4a32, 0.95),
  };
}

// Dressed masonry with matching colliders. Builders are kept per area so the merged meshes
// still cull with the camera.
export class Masonry {
  constructor(world, materials) {
    this.world = world;
    this.materials = materials;
    this.builders = new Map();
  }

  builder(area) {
    if (!this.builders.has(area)) this.builders.set(area, new FaceBuilder());
    return this.builders.get(area);
  }

  // A coursed block; `solid` adds its collider, `grab` lets its top edge be hung from. Walls
  // take their courses from the masonry shader; only small blocks are cut stone by stone.
  block(area, x0, y0, z0, x1, y1, z1, side, top = side, opts = {}) {
    const { solid = true, grab = false, cam = true } = opts;
    const small = (x1 - x0) * (z1 - z0) <= 6 && y1 - y0 <= 1.5;
    const plain = opts.plain ?? !small;
    const fb = this.builder(area);
    if (plain) fb.box(x0, y0, z0, x1, y1, z1, side, top);
    else
      fb.masonryBox(x0, y0, z0, x1, y1, z1, side, top, {
        roundedTop: false,
        bevel: 0.05,
      });
    if (solid)
      return this.world.add(x0, y0, z0, x1, y1, z1, opts.kind || "rock", null, {
        grab,
        cam,
        ...(opts.collider || {}),
      });
    return null;
  }

  build(scene) {
    for (const [area, fb] of this.builders) {
      const group = new THREE.Group();
      group.name = `vault ${area}`;
      fb.build(group);
      // Roofs cast no shadow: the vault's light stands for the glow of its air, not a sun.
      if (area === "roof" || area === "ceiling")
        group.traverse((o) => o.isMesh && (o.castShadow = false));
      scene.add(group);
    }
    this.builders.clear();
  }
}

// The nave, the bay shells, the arrival ring, the sealed door and its medallions, the channels
// and the sky seen through the openings.
export class VaultHall {
  constructor(vault) {
    this.vault = vault;
    this.scene = vault.scene;
    this.world = vault.world;
    this.assets = vault.assets;
    this.medallions = [];
    this.channels = [];
  }

  async build() {
    const m = (this.mat = this.vault.mat);
    const S = (this.stone = this.vault.masonry);
    const yieldWork = () => this.assets.yieldWork?.();
    // The nave floor, its walls (with the bay openings) and the stepped cornice.
    S.block(
      "nave",
      NAVE.minX,
      -2,
      NAVE.minZ,
      NAVE.maxX,
      0,
      NAVE.maxZ,
      m.wall,
      m.floor,
      {
        plain: true,
        grab: true,
      },
    );
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -9 : 8,
        x1 = side < 0 ? -8 : 9;
      const openings = BAYS.filter((bay) => bay.side === side)
        .map((bay) => bay.entry)
        .sort((a, b) => b[1] - a[1]);
      let z = NAVE.maxZ;
      for (const [e0, e1] of openings) {
        if (z > e1)
          S.block("nave", x0, -2, e1, x1, NAVE.top, z, m.wall, m.wallTop);
        S.block("nave", x0, 6, e0, x1, NAVE.top, e1, m.wall, m.wallTop, {
          collider: { cam: false },
        });
        S.block(
          "nave",
          side < 0 ? x0 : x0 - 0.12,
          5.4,
          e0 - 0.4,
          side < 0 ? x1 + 0.12 : x1,
          6,
          e1 + 0.4,
          m.bone,
          m.bone,
          {
            solid: false,
          },
        );
        z = e0;
      }
      S.block(
        "nave",
        x0,
        -2,
        NAVE.minZ - 2,
        x1,
        NAVE.top,
        z,
        m.wall,
        m.wallTop,
      );
      // A sienna plinth course and a basalt band along the nave.
      S.block(
        "nave",
        side < 0 ? -8 : 7.6,
        0,
        NAVE.minZ,
        side < 0 ? -7.6 : 8,
        0.6,
        NAVE.maxZ,
        m.base,
        m.base,
        {
          solid: false,
        },
      );
      S.block(
        "nave",
        side < 0 ? -8 : 7.7,
        8.2,
        NAVE.minZ,
        side < 0 ? -7.7 : 8,
        8.5,
        NAVE.maxZ,
        m.basalt,
        m.basalt,
        {
          solid: false,
        },
      );
    }
    // Pairs of incised channels let into the nave walls between the openings and pillars.
    for (const side of [-1, 1]) {
      const openings = BAYS.filter((bay) => bay.side === side).map(
        (bay) => bay.entry,
      );
      for (let z = 9; z > NAVE.minZ + 2; z -= 3.5) {
        if (openings.some(([e0, e1]) => z > e0 - 1.2 && z < e1 + 1.2)) continue;
        if ([5, -2, -22, -42, -62].some((p) => Math.abs(z - p) < 1.3)) continue;
        for (const dz of [-0.18, 0.18]) {
          const face = side * 8;
          S.block(
            "nave",
            Math.min(face, face - side * 0.035),
            0.8,
            z + dz - 0.05,
            Math.max(face, face - side * 0.035),
            7.6,
            z + dz + 0.05,
            m.basalt,
            m.basalt,
            {
              solid: false,
              plain: true,
            },
          );
        }
      }
    }
    // The south wall, stepped round the arrival ring's opening.
    let y = 0;
    for (const half of [2.6, 3.7, 4.2, 4.5, 4.6, 4.5, 4.2, 3.7, 2.6]) {
      const y1 = y + 1.0;
      S.block("nave", -9, y, 12, -half, y1, 13.5, m.wall, m.wallTop);
      S.block("nave", half, y, 12, 9, y1, 13.5, m.wall, m.wallTop);
      y = y1;
    }
    S.block("nave", -9, y, 12, 9, NAVE.top, 13.5, m.wall, m.wallTop);
    S.block("nave", -9, -2, 12, 9, 0, 13.5, m.wall, m.wall, { solid: false });
    // The north wall around the door.
    S.block("nave", -9, -2, -69, -7.3, NAVE.top, NAVE.minZ, m.wall, m.wallTop);
    S.block("nave", 7.3, -2, -69, 9, NAVE.top, NAVE.minZ, m.wall, m.wallTop);
    S.block("nave", -7.3, 11, -69, 7.3, NAVE.top, -68, m.wall, m.wallTop, {
      solid: false,
    });
    // The roof, with the oculus open to the sky.
    const O = OCULUS;
    const roof = (x0, z0, x1, z1) =>
      S.block(
        "roof",
        x0,
        NAVE.top,
        z0,
        x1,
        NAVE.top + 1.2,
        z1,
        m.ceiling,
        m.ceiling,
        {
          solid: false,
          plain: true,
        },
      );
    roof(-9, NAVE.minZ - 3, 9, O.z - O.half);
    roof(-9, O.z + O.half, 9, NAVE.maxZ + 1.5);
    roof(-9, O.z - O.half, -O.half, O.z + O.half);
    roof(O.half, O.z - O.half, 9, O.z + O.half);
    for (const k of [0, 1]) {
      const h = O.half + 0.5 + k * 0.6,
        y = NAVE.top - 0.35 - k * 0.35;
      for (const [x0, z0, x1, z1] of [
        [-h, O.z - h, h, O.z - h + 0.5],
        [-h, O.z + h - 0.5, h, O.z + h],
        [-h, O.z - h + 0.5, -h + 0.5, O.z + h - 0.5],
        [h - 0.5, O.z - h + 0.5, h, O.z + h - 0.5],
      ])
        S.block(
          "roof",
          x0,
          y,
          z0,
          x1,
          y + 0.35,
          z1,
          k ? m.wall : m.bone,
          m.bone,
          {
            solid: false,
          },
        );
    }
    await yieldWork();
    for (const bay of BAYS) {
      this.buildBayShell(bay);
      await yieldWork();
    }
    await this.buildPillars();
    await this.buildArrival();
    await this.buildDoor();
    this.buildOutside();
  }

  // The bay's outer walls, its ceiling and its two side walls; floors belong to its trial.
  buildBayShell(bay) {
    const m = this.mat,
      S = this.stone;
    const s = bay.side;
    const inner = s < 0 ? -9 : 9,
      outer = s < 0 ? -33 : 33;
    const xa = Math.min(inner, outer),
      xb = Math.max(inner, outer);
    const area = `bay ${bay.id}`;
    // Each bay is walled in the stone of the world it remembers.
    const wall = m[bay.palette] || m.wall;
    const top = bay.palette ? wall : m.wallTop;
    const x0 = s < 0 ? -34.5 : 9,
      x1 = s < 0 ? -9 : 34.5;
    const ox0 = s < 0 ? -34.5 : 33,
      ox1 = s < 0 ? -33 : 34.5;
    if (bay.slot) {
      // An opening in the outer wall where the light outside falls in.
      const { z0, z1, y0, y1 } = bay.slot;
      S.block(area, ox0, -14, bay.z0, ox1, 9, z0, wall, top);
      S.block(area, ox0, -14, z1, ox1, 9, bay.z1, wall, top);
      S.block(area, ox0, -14, z0, ox1, y0, z1, wall, top);
      S.block(area, ox0, y1, z0, ox1, 9, z1, wall, top);
    } else S.block(area, ox0, -14, bay.z0, ox1, 9, bay.z1, wall, top);
    // The threshold through the nave wall.
    const [e0, e1] = bay.entry;
    S.block(
      area,
      s < 0 ? -9 : 8,
      -2,
      e0,
      s < 0 ? -8 : 9,
      0,
      e1,
      m.floor,
      m.floor,
      {
        plain: true,
      },
    );
    // The walls between bays are two halves back to back, each in its own bay's stone.
    const north = bay.z0 < -55 ? 5 : 2.5,
      south = bay.z1 > -5 ? 4.5 : 2.5;
    S.block(area, x0, -14, bay.z0 - north, x1, 9, bay.z0, wall, top);
    S.block(area, x0, -14, bay.z1, x1, 9, bay.z1 + south, wall, top);
    S.block(
      "ceiling",
      x0,
      9,
      bay.z0 - north,
      x1,
      10.2,
      bay.z1 + south,
      m.ceiling,
      m.ceiling,
      {
        solid: false,
        plain: true,
      },
    );
    // A bone frieze and a basalt band round the bay, at the height of the nave's band.
    for (const [x0, z0, x1, z1] of [
      [xa, bay.z0, xb, bay.z0 + 0.25],
      [xa, bay.z1 - 0.25, xb, bay.z1],
    ]) {
      S.block(area, x0, 7.6, z0, x1, 8.0, z1, m.bone, m.bone, { solid: false });
      S.block(area, x0, 0, z0, x1, 0.55, z1, m.base, m.base, { solid: false });
    }
  }

  async buildPillars() {
    const proto = await this.assets.make("vault_pillar", {
      keepHierarchy: true,
    });
    if (!proto) return;
    this.pillarLights = [];
    for (const z of [5, -2, -22, -42, -62]) {
      for (const side of [-1, 1]) {
        const p = proto.clone(true);
        p.position.set(side * 6.6, 0, z);
        p.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(p);
        this.world.add(
          side * 6.6 - 0.75,
          0,
          z - 0.75,
          side * 6.6 + 0.75,
          7.2,
          z + 0.75,
          "prop",
          null,
          {
            grab: false,
            stand: false,
          },
        );
      }
    }
    proto.userData.parts.channels?.traverse((o) => {
      if (o.isMesh) this.pillarLights.push(o.material);
    });
    for (const material of new Set(this.pillarLights))
      material.emissiveIntensity = 0.9;
    // Two watchers by the arrival, facing across the nave.
    const mask = await this.assets.make("builder_mask", {
      keepHierarchy: true,
    });
    if (!mask) return;
    for (const side of [-1, 1]) {
      const m = mask.clone(true);
      m.position.set(side * 5.2, 0, 1.2);
      m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      m.traverse((o) => {
        if (o.isMesh && o.name === "slit") {
          o.material = o.material.clone();
          o.material.emissive = new THREE.Color(LIGHT);
          o.material.emissiveIntensity = 1.2;
        }
      });
      this.scene.add(m);
      this.world.addRound(side * 5.2, 1.2, 0.85, 0, 3.4, "prop");
    }
  }

  // The ring the lights arrive through: a door of the network set into the south wall, its
  // opening held by a skin of the builders' air.
  async buildArrival() {
    const ring = await this.assets.make("far_gate");
    if (ring) {
      ring.position.set(RING.x, 0, RING.z);
      ring.rotation.y = Math.PI;
      this.scene.add(ring);
      ring.updateMatrixWorld(true);
      const portal = ring.userData.portal || {
        center: [0, 4.5, 0],
        radius: 3.5,
      };
      this.ringCenter = V(...portal.center).applyMatrix4(ring.matrixWorld);
      this.ringRadius = portal.radius;
    } else {
      this.ringCenter = V(RING.x, RING.dais + 3.5, RING.z);
      this.ringRadius = 3.5;
    }
    gateColliders(
      this.world,
      RING.x,
      RING.z,
      this.ringCenter.y - this.ringRadius,
      -2,
    );
    this.airU = { uTime: { value: 0 } };
    const air = new THREE.Mesh(
      new THREE.CircleGeometry(this.ringRadius - 0.05, 64),
      new THREE.ShaderMaterial({
        uniforms: this.airU,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vView;
          void main(){ vUv=uv; vec4 p=modelViewMatrix*vec4(position,1.0); vView=p.xyz; gl_Position=projectionMatrix*p; }`,
        fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; varying vec3 vView;
          void main(){
            vec2 q=vUv-0.5; float r=length(q)*2.0;
            float ripple=0.5+0.5*sin(r*26.0-uTime*1.4+sin(atan(q.y,q.x)*5.0+uTime*0.4)*0.6);
            float rim=smoothstep(0.78,1.0,r);
            float a=(0.025+ripple*0.03+rim*0.22)*smoothstep(0.6,3.0,length(vView));
            gl_FragColor=vec4(mix(vec3(0.12,0.55,0.55),vec3(0.45,0.98,0.9),rim),a);
          }`,
      }),
    );
    air.position.copy(this.ringCenter).add(V(0, 0, -0.2));
    air.rotation.y = Math.PI;
    air.renderOrder = 3;
    this.scene.add(air);
    this.air = air;
    // Nobody steps back out into the dark.
    this.world.add(
      -2.4,
      RING.dais,
      RING.z + 0.1,
      2.4,
      8,
      RING.z + 0.6,
      "prop",
      null,
      {
        grab: false,
        stand: false,
        cam: false,
      },
    );
  }

  // The sealed door, its six medallions and the channels that feed them.
  async buildDoor() {
    const door =
      (await this.assets.make("vault_door", { keepHierarchy: true })) ||
      fallbackDoor();
    door.position.set(DOOR.x, 0, DOOR.z);
    this.scene.add(door);
    door.updateMatrixWorld(true);
    this.door = door;
    const toWorld = (p) => V(...p).applyMatrix4(door.matrixWorld);
    const opening = door.userData.opening || {
      center: [0, 3.9, 0.8],
      radius: 3.72,
    };
    this.doorCenter = toWorld(opening.center);
    this.doorRadius = opening.radius;
    this.leaves = door.userData.joints || {};
    this.leafRest = {};
    for (const [name, leaf] of Object.entries(this.leaves))
      this.leafRest[name] = leaf.position.clone();
    const glow = (part) => {
      const list = [];
      part?.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(LIGHT);
        o.material.emissiveIntensity = 0;
        list.push(o.material);
      });
      return list;
    };
    const parts = door.userData.parts || {};
    this.slitMats = [...glow(parts.slitLeft), ...glow(parts.slitRight)];
    this.grooveMats = glow(parts.grooves);
    // Colliders: the slab either side of the opening, its lintel, and the leaves while shut.
    const z0 = DOOR.z - 0.85,
      z1 = DOOR.z + 0.85;
    this.world.add(-7.2, -1, DOOR.z - 1.3, 7.2, 0.18, DOOR.z + 1.3, "rock");
    this.world.add(-7.3, 0, z0, -2.3, 11.2, z1, "rock", null, { grab: false });
    this.world.add(2.3, 0, z0, 7.3, 11.2, z1, "rock", null, { grab: false });
    this.world.add(-2.3, 6.6, z0, 2.3, 11.2, z1, "rock", null, { grab: false });
    this.leafBox = this.world.add(
      -2.3,
      0.18,
      DOOR.z - 0.4,
      2.3,
      6.6,
      DOOR.z + 0.4,
      "prop",
      null,
      {
        grab: false,
        stand: false,
      },
    );
    const sockets = door.userData.sockets || [];
    const proto = await this.assets.make("vault_medallion", {
      keepHierarchy: true,
    });
    BAYS.forEach((bay, i) => {
      const socket = sockets[i]
        ? toWorld(sockets[i])
        : V(
            Math.cos(2.5 - i * 0.38) * 5.75,
            3.9 + Math.sin(2.5 - i * 0.38) * 5.75,
            DOOR.z + 0.9,
          );
      const medal = this.medallion(proto, bay.glyph);
      medal.object.position.copy(socket).add(V(0, -medal.half, medal.depth));
      this.scene.add(medal.object);
      this.medallions.push({ ...medal, center: socket.clone() });
    });
    // Over each bay's opening, the glyph of the world it keeps, lit with its seal.
    this.signs = BAYS.map((bay) => {
      const sign = this.medallion(proto, bay.glyph, 0.62);
      sign.object.position.set(
        bay.side * 7.86,
        6.3,
        (bay.entry[0] + bay.entry[1]) / 2,
      );
      sign.object.rotation.y = bay.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(sign.object);
      return sign;
    });
    this.doorLight = new THREE.PointLight(LIGHT, 0, 22, 1.6);
    this.doorLight.position.set(0, 5.5, DOOR.z + 4);
    this.scene.add(this.doorLight);
  }

  // A medallion with one glyph in its field; returned dark.
  medallion(proto, glyph, scale = 1) {
    const object = proto ? proto.clone(true) : fallbackMedallion();
    object.scale.setScalar(scale);
    const ring = [];
    object.traverse((o) => {
      if (!o.isMesh || !o.material.emissive || o.name !== "ring") return;
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(LIGHT);
      o.material.emissiveIntensity = 0;
      ring.push(o.material);
    });
    const field = object.userData.field || {
      center: [0, 0.85, 0.17],
      size: 0.78,
    };
    const mat = glyphMaterial();
    const mark = makeGlyph(glyph, field.size * 0.8, mat);
    mark.position.set(
      field.center[0],
      field.center[1],
      field.center[2] + 0.004,
    );
    object.add(mark);
    return {
      object,
      glyph,
      ring,
      mark: mat,
      half: (field.center[1] || 0.85) * scale,
      depth: 0.18 * scale,
      lit: 0,
      target: 0,
    };
  }

  setMedallion(medal, value) {
    medal.target = value;
    if (!this.medallions.includes(medal)) (this.extra ??= new Set()).add(medal);
  }

  // The sky outside: stars and a far planet through the oculus and the ring, and the last
  // door adrift beyond the arrival ring.
  buildOutside() {
    const sky = spaceSky();
    const stars = brightStars(700);
    this.sky = sky;
    this.stars = stars;
    this.scene.add(sky, stars);
    this.world2 = planet({
      name: "Ringed world",
      kind: 1,
      radius: 70,
      at: V(-160, 260, -120),
      tilt: -0.3,
      seed: 2.1,
      ring: { span: [86, 124], turn: new THREE.Euler(1.25, 0.22, -0.38) },
    });
    this.scene.add(this.world2);
    this.drifting = spaceGate();
    this.drifting.position.set(-14, 9, 78);
    this.drifting.rotation.y = 0.5;
    this.drifting.scale.setScalar(1.6);
    this.scene.add(this.drifting);
  }

  update(dt, time) {
    this.airU.uTime.value = time;
    this.drifting.userData.animate(time);
    this.stars.material.uniforms.uTime.value = time;
    this.world2.userData.uniforms.uTime.value = time;
    this.world2.userData.body.rotation.y = time * 0.006;
    for (const medal of [...this.medallions, ...(this.extra ?? [])]) {
      medal.lit += (medal.target - medal.lit) * Math.min(1, dt * 3);
      for (const material of medal.ring)
        material.emissiveIntensity = medal.lit * 2.6;
      medal.mark.emissiveIntensity = medal.lit * 2.4;
    }
  }

  telemetry() {
    return {
      door: this.doorCenter.toArray().map((v) => +v.toFixed(2)),
      medallions: this.medallions.map((m) => +m.target.toFixed(2)),
    };
  }
}

// A bay's seal: a stepped plinth with a small medallion carrying the bay's glyph. `yaw` turns
// the medallion's face (0 faces +z). Pressing a seal is a hand-height use volume in front of it.
export async function buildSeal(
  vault,
  bay,
  { x, z, yaw, height = 0.75, floor = 0, kind = "rock" },
) {
  const m = vault.mat,
    S = vault.masonry;
  const area = `bay ${bay.id}`;
  const fx = Math.sin(yaw),
    fz = Math.cos(yaw);
  const across = Math.abs(fx) > 0.5;
  const hw = across ? 0.55 : 0.75,
    hd = across ? 0.75 : 0.55;
  S.block(
    area,
    x - hw - 0.15,
    floor,
    z - hd - 0.15,
    x + hw + 0.15,
    floor + 0.25,
    z + hd + 0.15,
    m.base,
    m.bone,
    {
      grab: false,
      kind,
    },
  );
  S.block(
    area,
    x - hw,
    floor + 0.25,
    z - hd,
    x + hw,
    floor + height,
    z + hd,
    m.wall,
    m.wallTop,
    {
      grab: false,
      kind,
    },
  );
  const proto = await vault.medallionProto();
  const medal = vault.hall.medallion(proto, bay.glyph, 0.72);
  const top = floor + height;
  medal.object.position.set(x - fx * 0.2, top, z - fz * 0.2);
  medal.object.rotation.y = yaw;
  vault.scene.add(medal.object);
  const center = V(x + fx * 0.05, top + medal.half, z + fz * 0.05);
  const box = {
    shape: "box",
    minX: x - hw - 0.2,
    maxX: x + hw + 0.2,
    minZ: z - hd - 0.2,
    maxZ: z + hd + 0.2,
    minY: floor,
    maxY: floor + 1.8,
  };
  const seal = {
    bay: bay.id,
    x,
    z,
    yaw,
    facing: { x: fx, z: fz },
    center,
    medal,
    box,
    lit: false,
    light(on = true) {
      seal.lit = on;
      vault.hall.setMedallion(medal, on ? 1 : 0);
    },
  };
  return seal;
}

function fallbackMedallion() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 0.3, 32),
    new THREE.MeshStandardMaterial({ color: 0xb57f4f, roughness: 0.9 }),
  );
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 0.85;
  g.add(disc);
  g.userData.field = { center: [0, 0.85, 0.16], size: 0.78 };
  return g;
}

function fallbackDoor() {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(12.8, 11, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xb57f4f, roughness: 0.9 }),
  );
  slab.position.y = 5.5;
  g.add(slab);
  return g;
}
