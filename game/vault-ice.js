import * as THREE from "three";
import { glyphMaterial, makeGlyph } from "./glyphs.js";
import { BAYS, buildSeal } from "./vault.js";

// The frozen reach's bay: a floor of ice in 2 m cells, spires that stop a sliding block, and a
// plate the block must come to rest on. As at the frozen pond, one push sends the block on
// until the next cell is taken and hands cannot pull it; two posts leave no room to push it from
// where it starts, so the orb's tether drags it towards Nyra first. The plate wakes a seal on a
// shelf up the north wall, reached by climbing a scarred fall with Mira's axes.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BAY = BAYS[3];
const CELL = 2;
export const ICE = {
  minX: 13,
  maxX: 27,
  minZ: -38,
  maxZ: -26,
  home: { x: 14, z: -37 },
  plate: { x: 22, z: -29 },
  pillars: [
    [24, -37],
    [22, -27],
    [16, -31],
    [26, -33],
  ],
  // Builders' posts on the slate beside the block's start.
  posts: [
    [12, -37],
    [14, -39],
  ],
  shelf: { x0: 28.2, x1: 33, z0: -39.5, face: -37.3, top: 3.4 },
  wall: { x: 30.5, width: 2.6 },
  // At the shelf's east end, facing the top of the climb, so the ledge climb lands clear of it.
  seal: { x: 32.3, z: -38.4, yaw: -Math.PI / 2, floor: 3.4 },
};

function crackTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  let seed = 913;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.strokeStyle = "rgba(232, 244, 250, 0.9)";
  for (let i = 0; i < 22; i++) {
    let x = rand() * 256,
      y = rand() * 256,
      a = rand() * Math.PI * 2;
    g.lineWidth = 0.6 + rand() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      a += (rand() - 0.5) * 1.2;
      x += Math.cos(a) * 14;
      y += Math.sin(a) * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.anisotropy = 8;
  return t;
}

export class IceTrial {
  constructor(vault) {
    this.vault = vault;
    this.bay = BAY;
    this.id = BAY.id;
    this.done = false;
  }

  async build() {
    const { vault } = this;
    const { scene, world, assets } = vault;
    const m = vault.mat,
      S = vault.masonry;
    const area = `bay ${BAY.id}`;
    // Slate floor round the ice, then the ice itself.
    for (const [x0, z0, x1, z1] of [
      [9, BAY.z0, 33, ICE.minZ],
      [9, ICE.maxZ, 33, BAY.z1],
      [9, ICE.minZ, ICE.minX, ICE.maxZ],
      [ICE.maxX, ICE.minZ, 33, ICE.maxZ],
    ])
      S.block(area, x0, -2, z0, x1, 0, z1, m.slate, m.slate, { plain: true });
    const SH = ICE.shelf;
    S.block(area, SH.x0, 0, SH.z0, SH.x1, SH.top, SH.face, m.slate, m.slate, {
      grab: false,
    });
    this.wall = vault.climbs.ice({
      id: "frost-wall",
      x: ICE.wall.x,
      z: SH.face,
      n: { x: 0, z: 1 },
      width: ICE.wall.width,
      top: SH.top,
    });
    this.iceMat = new THREE.MeshStandardMaterial({
      color: 0x8fc3da,
      roughness: 0.08,
      metalness: 0.15,
      envMapIntensity: 1.3,
      map: crackTexture(),
    });
    const ice = new THREE.Mesh(
      new THREE.BoxGeometry(ICE.maxX - ICE.minX, 0.4, ICE.maxZ - ICE.minZ),
      this.iceMat,
    );
    ice.position.set(
      (ICE.minX + ICE.maxX) / 2,
      -0.2,
      (ICE.minZ + ICE.maxZ) / 2,
    );
    ice.receiveShadow = true;
    scene.add(ice);
    world.add(ICE.minX, -2, ICE.minZ, ICE.maxX, 0, ICE.maxZ, "rock", null, {
      slick: true,
      grab: false,
    });
    // Faint cell lines frozen into the ice, so the slides read in steps.
    const lines = new THREE.MeshBasicMaterial({
      color: 0xd8eef7,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const grid = new THREE.Group();
    for (let x = ICE.minX + CELL; x < ICE.maxX; x += CELL) {
      const l = new THREE.Mesh(
        new THREE.PlaneGeometry(0.04, ICE.maxZ - ICE.minZ),
        lines,
      );
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.006, (ICE.minZ + ICE.maxZ) / 2);
      grid.add(l);
    }
    for (let z = ICE.minZ + CELL; z < ICE.maxZ; z += CELL) {
      const l = new THREE.Mesh(
        new THREE.PlaneGeometry(ICE.maxX - ICE.minX, 0.04),
        lines,
      );
      l.rotation.x = -Math.PI / 2;
      l.position.set((ICE.minX + ICE.maxX) / 2, 0.006, z);
      grid.add(l);
    }
    scene.add(grid);
    for (const [x, z] of ICE.pillars) {
      const o = await assets.make("ice_spire", { surfaces: false });
      if (o) {
        o.position.set(x, -0.05, z);
        o.rotation.y = x * 0.7 + z;
        o.scale.setScalar(0.62);
        this.iceLook(o);
        scene.add(o);
      }
      world.addRound(x, z, 0.95, -2, 2.6, "prop");
    }
    // The plate, sunk flush with the ice, and its glyph.
    const plate = await assets.make("stamp_plate", { keepHierarchy: true });
    this.plateGlyph = glyphMaterial();
    if (plate) {
      plate.position.set(ICE.plate.x, -0.12, ICE.plate.z);
      scene.add(plate);
      const field = plate.userData.field || { center: [0, 0.12, 0], size: 1.2 };
      const mark = makeGlyph(BAY.glyph, field.size * 0.7, this.plateGlyph);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(
        field.center[0],
        field.center[1] + 0.006,
        field.center[2],
      );
      plate.add(mark);
      this.plateInlay = [];
      plate.userData.parts?.inlay?.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0x39e3d0);
        o.material.emissiveIntensity = 0.2;
        this.plateInlay.push(o.material);
      });
    }
    const mesh = await assets.make("ice_block", { surfaces: false });
    if (mesh) {
      this.iceLook(mesh);
      scene.add(mesh);
    }
    const block = {
      home: { ...ICE.home },
      x: ICE.home.x,
      z: ICE.home.z,
      mesh,
      slides: true,
      state: "rest",
      t: 0,
    };
    block.ref = block;
    block.box = world.add(0, -0.5, 0, 0, 1.9, 0, "block", block, {
      unsafe: true,
    });
    block.target = {
      radius: 1.1,
      center: () => V(block.x, 0.95, block.z),
      alive: () => block.state === "rest" && !this.powered,
      onHit: () => {},
      pull: (event) => this.tether(event),
    };
    this.block = block;
    this.settle(ICE.home.x, ICE.home.z);
    this.seal = await buildSeal(vault, BAY, ICE.seal);
    for (const [x, z] of ICE.posts) {
      S.block(
        area,
        x - 0.42,
        0,
        z - 0.42,
        x + 0.42,
        1.25,
        z + 0.42,
        m.wall,
        m.wallTop,
        {
          grab: false,
        },
      );
      S.block(
        area,
        x - 0.52,
        1.25,
        z - 0.52,
        x + 0.52,
        1.45,
        z + 0.52,
        m.bone,
        m.bone,
        {
          grab: false,
        },
      );
    }
    for (const [x, z, s, yaw] of [
      [32.1, -35.4, 0.7, 0.3],
      [10.6, -38.6, 0.55, 1.4],
      [31.8, -25.6, 0.6, 2.2],
    ]) {
      const o = await assets.make("ice_spire", { surfaces: false });
      if (!o) continue;
      o.position.set(x, -0.05, z);
      o.rotation.y = yaw;
      o.scale.setScalar(s);
      this.iceLook(o);
      scene.add(o);
      world.addRound(x, z, 1.05 * s, -2, 4 * s, "prop");
    }
    this.cold = new THREE.PointLight(0xbfe3ff, 6, 18, 1.5);
    this.cold.position.set(20, 5.5, -32);
    scene.add(this.cold);
  }

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

  settle(x, z) {
    const b = this.block;
    b.x = x;
    b.z = z;
    b.mesh?.position.set(x, 0, z);
    Object.assign(b.box, {
      minX: x - 0.95,
      maxX: x + 0.95,
      minZ: z - 0.95,
      maxZ: z + 0.95,
    });
  }

  cellFree(x, z, hero) {
    if (x < ICE.minX || x > ICE.maxX || z < ICE.minZ || z > ICE.maxZ)
      return false;
    const w = this.vault.world;
    if (!w.slickAt(x, z, 0)) return false;
    if (
      !w.freeBox(
        x - 0.93,
        z - 0.93,
        x + 0.93,
        z + 0.93,
        0.05,
        1.85,
        this.block.box,
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

  moveBlock(block, dir, hero) {
    if (block.state !== "rest" || this.powered) return false;
    let x = block.x,
      z = block.z,
      n = 0;
    while (n < 12 && this.cellFree(x + dir.x * CELL, z + dir.z * CELL, hero)) {
      x += dir.x * CELL;
      z += dir.z * CELL;
      n++;
    }
    if (!n) return false;
    Object.assign(block, {
      state: "sliding",
      t: 0,
      from: { x: block.x, z: block.z },
      to: { x, z },
      duration: 0.25 + 0.22 * n,
    });
    this.vault.services.sound?.play("slide");
    return true;
  }

  isMoving(block) {
    return block.state === "sliding";
  }

  // The orb's tether drags the ice towards Nyra along its row or column, until it reaches her or
  // something stops it, and stays drawn while it slides.
  tether({ phase, hero }) {
    const b = this.block;
    if (phase === "release") return true;
    if (phase === "hold") return b.state === "sliding";
    if (!hero || b.state !== "rest" || this.powered) return false;
    const dx = hero.pos.x - b.x,
      dz = hero.pos.z - b.z;
    const dir =
      Math.abs(dx) > Math.abs(dz)
        ? { x: Math.sign(dx), z: 0 }
        : { x: 0, z: Math.sign(dz) };
    const moved = this.moveBlock(b, dir, hero);
    if (moved) this.onTether?.(this);
    return moved;
  }

  orbTargets() {
    return [this.block.target];
  }

  interactables() {
    const b = this.block;
    if (this.powered)
      return this.done
        ? []
        : [
            {
              kind: "use",
              box: this.seal.box,
              ref: this,
              prompt: "relic:Wake the seal",
            },
          ];
    return b.state === "rest" ? [{ kind: "block", box: b.box, ref: b }] : [];
  }

  use() {
    if (!this.powered || this.done) return false;
    this.complete();
    return true;
  }

  update(dt, hero) {
    const b = this.block;
    b.t += dt;
    if (b.state === "sliding") {
      const k = Math.min(1, b.t / b.duration);
      const e = 1 - (1 - k) * (1 - k);
      this.settle(
        b.from.x + (b.to.x - b.from.x) * e,
        b.from.z + (b.to.z - b.from.z) * e,
      );
      if (k >= 1) {
        b.state = "rest";
        this.settle(b.to.x, b.to.z);
        this.vault.services.sound?.play("thud");
        if (b.x === ICE.plate.x && b.z === ICE.plate.z) this.power();
      }
    }
    const on = this.powered ? 2.6 : 0.2 + 0.12 * Math.sin(b.t * 2.4);
    for (const mat of this.plateInlay || []) mat.emissiveIntensity = on;
    this.plateGlyph.emissiveIntensity = this.powered ? 2.8 : 0.35;
  }

  // The ice on the plate wakes the seal up on the shelf; pressing it there wakes its channel.
  power() {
    if (this.powered) return;
    this.powered = true;
    this.vault.hall.setMedallion(this.seal.medal, 0.45);
    this.vault.services.sound?.play("plate");
    this.onPower?.(this);
  }

  complete() {
    if (this.done) return;
    this.done = true;
    this.seal.light();
    this.vault.services.sound?.play("pylon");
    this.onDone?.(this);
  }

  // The side to push from next: east from home, then south down the plate's column.
  guide(hero) {
    const b = this.block;
    const onColumn = b.x === ICE.plate.x;
    if (this.powered)
      return hero.feet > ICE.shelf.top - 0.3
        ? {
            title: "Climb to the seal",
            sub: "Press the seal on the shelf",
            point: this.seal.center,
          }
        : {
            title: "Climb to the seal",
            sub: "Mira's axes bite the scarred ice: jump at it and climb",
            point: V(ICE.wall.x, 2.2, ICE.shelf.face),
          };
    const home = b.x === ICE.home.x && b.z === ICE.home.z;
    return {
      title: "Slide the ice onto the plate",
      sub: home
        ? "No room to push it here: hold the orb's link on the ice to drag it towards you"
        : onColumn
          ? "Push it towards the plate: it slides until something stops it"
          : "Bring it in line with the plate: push it, or drag it with the orb's link",
      point: onColumn ? V(ICE.plate.x, 1.2, ICE.plate.z) : V(b.x, 2.4, b.z),
    };
  }

  hint(hud) {
    return [
      BAY.title,
      `Hold ${hud.k("interact")} against the block and push: it slides until something stops it. Hands cannot pull ice, but holding ${hud.k("throw")} on it with the orb drags it towards you. Then ${hud.k("jump")} at the scarred ice and climb to the seal.`,
    ];
  }

  reset() {
    this.done = this.powered = false;
    const b = this.block;
    b.state = "rest";
    b.t = 0;
    b.box.solid = true;
    if (b.mesh) {
      b.mesh.visible = true;
      b.mesh.scale.setScalar(1);
    }
    this.settle(ICE.home.x, ICE.home.z);
    this.seal.light(false);
  }

  solve() {
    this.reset();
    this.settle(ICE.plate.x, ICE.plate.z);
    this.done = this.powered = true;
    this.seal.light();
  }

  telemetry() {
    const b = this.block;
    return {
      done: this.done,
      powered: !!this.powered,
      block: { x: +b.x.toFixed(2), z: +b.z.toFixed(2), state: b.state },
      wall: { x: ICE.wall.x, z: ICE.shelf.face, top: ICE.shelf.top },
      seal: this.seal.center.toArray(),
      plate: ICE.plate,
      home: ICE.home,
      pillars: ICE.pillars,
      area: [ICE.minX, ICE.minZ, ICE.maxX, ICE.maxZ],
    };
  }
}
