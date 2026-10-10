import * as THREE from "three";
import { Beams } from "./beams.js";
import { BAYS, buildSeal } from "./vault.js";

// The court's bay: starlight falls through a slot in the outer wall onto a catcher mirror and
// runs east. A stone block stands in it; two bronze mirrors must relay it round to the seal.
// The court's own Beams trace the light, so mirrors turn and catch exactly as they do there.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BAY = BAYS[0];
export const LIGHT = {
  source: { x: -31.4, z: -17, dir: [1, 0] },
  height: 1.3,
  slot: V(-33.8, 6.4, -17),
  block: { x: -27, z: -17 },
  mirrors: [
    { id: "m1", x: -19, z: -17, yaw: Math.PI / 4, solve: -Math.PI / 4 },
    { id: "m2", x: -19, z: -7, yaw: -Math.PI / 4, solve: (-3 * Math.PI) / 4 },
  ],
  seal: { x: -30.6, z: -7, yaw: Math.PI / 2 },
};

// The court's beams with their shaft and spot turned to this bay's slot.
class StarBeams extends Beams {
  makeShaft() {
    super.makeShaft();
    const from = V(this.source.x - 0.2, this.height, this.source.z);
    const to = this.source.slot;
    const dir = to.clone().sub(from);
    const length = dir.length();
    dir.normalize();
    this.shaft.position.copy(from);
    this.shaft.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
    this.shaft.scale.set(0.8, length / 10, 0.8);
    for (const light of this.group.children) {
      if (light.isSpotLight) {
        light.color.setHex(0xfff0dc);
        light.intensity = 26;
        light.position.copy(to);
        light.target.position.set(this.source.x + 3, 0, this.source.z);
      } else if (light.isPointLight) {
        light.color.setHex(0xffd9a8);
        light.intensity = 5;
        light.position.set(
          this.source.x + 0.8,
          this.height + 0.5,
          this.source.z,
        );
      }
    }
  }
}

export class LightTrial {
  constructor(vault) {
    this.vault = vault;
    this.bay = BAY;
    this.id = BAY.id;
    this.mirrors = [];
    this.blocks = [];
    this.moving = [];
    this.done = false;
  }

  get receivers() {
    return this.seal ? [this.seal] : [];
  }

  async build() {
    const { vault } = this;
    const { scene, world, assets } = vault;
    const m = vault.mat,
      S = vault.masonry;
    const area = `bay ${BAY.id}`;
    S.block(area, -33, -2, BAY.z0, -9, 0, BAY.z1, m.base, m.floor, {
      plain: true,
    });
    // Sand blown in through the slot, banked against the walls.
    for (const [x, z, w, d] of [
      [-32.4, -12, 1.2, 14],
      [-21, -19.1, 24, 0.8],
      [-21, -4.9, 24, 0.8],
    ])
      S.block(
        area,
        x - w / 2,
        0,
        z - d / 2,
        x + w / 2,
        0.12,
        z + d / 2,
        m.sand,
        m.sand,
        {
          solid: false,
          plain: true,
        },
      );
    const catcher = await assets.make("sun_mirror");
    if (catcher) {
      catcher.position.set(LIGHT.source.x, 0, LIGHT.source.z);
      catcher.rotation.y = Math.PI / 2;
      catcher.scale.setScalar(1.15);
      polish(catcher);
      scene.add(catcher);
    }
    world.addRound(
      LIGHT.source.x,
      LIGHT.source.z,
      0.72,
      -1,
      2.1,
      "mirror",
      null,
      {
        cam: false,
      },
    );
    for (const def of LIGHT.mirrors) {
      const mesh = await assets.make("sun_mirror");
      if (mesh) {
        polish(mesh);
        mesh.position.set(def.x, 0, def.z);
        scene.add(mesh);
      }
      const box = world.addRound(def.x, def.z, 0.62, -1, 1.95, "mirror", null, {
        cam: false,
      });
      const mirror = { ...def, mesh, box, locked: null };
      mirror.ref = mirror;
      box.ref = mirror;
      this.mirrors.push(mirror);
    }
    const blockMesh = await assets.make("push_block");
    if (blockMesh) scene.add(blockMesh);
    const box = world.add(0, -1, 0, 0, 1.9, 0, "block");
    const block = { id: "b1", mesh: blockMesh, box, home: { ...LIGHT.block } };
    block.ref = block;
    box.ref = block;
    this.blocks.push(block);
    this.place(block, LIGHT.block.x, LIGHT.block.z);
    // The seal receives the beam as a stela would, by its face rather than its stone.
    this.seal = await buildSeal(vault, BAY, {
      ...LIGHT.seal,
      height: 0.72,
      kind: "stela",
    });
    Object.assign(this.seal, { charge: 0, glyph: BAY.glyph });
    this.beams = new StarBeams(
      scene,
      world,
      this,
      { ...LIGHT.source, slot: LIGHT.slot },
      LIGHT.height,
    );
    this.beams.onLit = () => this.complete();
    // The pieces of light exist before play, so their shaders are prepared with the rest.
    for (let i = 0; i < 4; i++) this.beams.piece(i);
    this.beams.update(0);
    for (const [x, z, s, yaw] of [
      [-31.8, -6.4, 1, 0.4],
      [-31.6, -18.5, 0.8, 2.2],
      [-11.2, -18.6, 0.9, 1.1],
    ]) {
      const agave = await assets.make("desert_agave");
      if (!agave) continue;
      agave.position.set(x, 0.1, z);
      agave.rotation.y = yaw;
      agave.scale.setScalar(s);
      scene.add(agave);
      world.addRound(x, z, 0.4 * s, 0, 0.8 * s, "prop");
    }
    const urns = await assets.make("clay_urns");
    if (urns) {
      urns.position.set(-11.4, 0, -5.6);
      urns.rotation.y = 0.6;
      scene.add(urns);
      world.addRound(-11.4, -5.6, 0.55, 0, 1, "prop");
    }
  }

  place(block, x, z) {
    block.x = x;
    block.z = z;
    block.mesh?.position.set(x, 0, z);
    Object.assign(block.box, {
      minX: x - 0.98,
      maxX: x + 0.98,
      minZ: z - 0.98,
      maxZ: z + 0.98,
    });
  }

  turnMirror(mirror, delta) {
    if (this.beams.turn(mirror, delta)) this.vault.services.sound?.play("lock");
  }

  // One cell along a push or a pull, onto level open floor, as in the court.
  moveBlock(block, dir, duration) {
    const tx = block.x + dir.x * 2,
      tz = block.z + dir.z * 2;
    const w = this.vault.world;
    if (
      !w.freeBox(
        tx - 0.97,
        tz - 0.97,
        tx + 0.97,
        tz + 0.97,
        0.05,
        1.85,
        block.box,
      )
    )
      return false;
    for (const [dx, dz] of [
      [0, 0],
      [0.85, 0.85],
      [-0.85, 0.85],
      [0.85, -0.85],
      [-0.85, -0.85],
    ])
      if (Math.abs(w.ground(tx + dx, tz + dz, 0.05, 0, 0.05)) > 0.01)
        return false;
    this.moving.push({
      block,
      from: { x: block.x, z: block.z },
      to: { x: tx, z: tz },
      t: 0,
      duration,
    });
    block.x = tx;
    block.z = tz;
    return true;
  }

  isMoving(block) {
    return this.moving.some((mv) => mv.block === block);
  }

  interactables() {
    return [
      ...this.mirrors.map((m) => ({ kind: "mirror", box: m.box, ref: m })),
      ...this.blocks.map((b) => ({ kind: "block", box: b.box, ref: b })),
    ];
  }

  complete() {
    if (this.done) return;
    this.done = true;
    this.seal.light();
    this.onDone?.(this);
  }

  update(dt) {
    for (const mv of this.moving) {
      mv.t = Math.min(1, mv.t + dt / mv.duration);
      const k = mv.t * mv.t * (3 - 2 * mv.t);
      const b = mv.block;
      const x = mv.from.x + (mv.to.x - mv.from.x) * k,
        z = mv.from.z + (mv.to.z - mv.from.z) * k;
      b.mesh?.position.set(x, 0, z);
      Object.assign(b.box, {
        minX: x - 0.98,
        maxX: x + 0.98,
        minZ: z - 0.98,
        maxZ: z + 0.98,
      });
    }
    this.moving = this.moving.filter((mv) => mv.t < 1);
    for (const m of this.mirrors) if (m.mesh) m.mesh.rotation.y = m.yaw;
    this.beams.update(dt);
    if (this.done) return;
    const k = Math.min(1, this.seal.charge / 0.45);
    this.vault.hall.setMedallion(this.seal.medal, k * 0.6);
  }

  // The last mirror the light reaches: the one to turn next.
  lastMirror() {
    let last = null;
    for (const s of this.beams.segments || []) if (s.end === "mirror") last = s;
    if (!last) {
      const m = this.mirrors[0];
      return V(m.x, 2.4, m.z);
    }
    return V(last.x1, 2.4, last.z1);
  }

  guide() {
    const b = this.blocks[0];
    if (b.x === b.home.x && b.z === b.home.z && !this.done)
      return {
        title: "Bring the starlight to the seal",
        sub: "A stone block stands in the beam: push or pull it out of the way",
        point: V(b.x, 2.4, b.z),
      };
    return {
      title: "Bring the starlight to the seal",
      sub: "Turn the bronze mirrors to pass the light on to the seal's medallion",
      point: this.lastMirror(),
    };
  }

  hint(hud) {
    return [
      BAY.title,
      `Stand against the block and hold ${hud.k("interact")} to push or pull it. Hold ${hud.k("interact")} at a mirror and steer ${hud.keys("KeyA", "KeyD")} to turn it.`,
    ];
  }

  reset() {
    this.done = false;
    this.moving = [];
    this.place(this.blocks[0], LIGHT.block.x, LIGHT.block.z);
    LIGHT.mirrors.forEach((def, i) => {
      Object.assign(this.mirrors[i], {
        yaw: def.yaw,
        locked: null,
        pending: 0,
        lastCatch: null,
        lockedAt: -9,
      });
      if (this.mirrors[i].mesh) this.mirrors[i].mesh.rotation.y = def.yaw;
    });
    this.seal.charge = 0;
    this.seal.light(false);
  }

  solve() {
    this.place(this.blocks[0], LIGHT.block.x, LIGHT.block.z + 2);
    LIGHT.mirrors.forEach((def, i) => {
      this.mirrors[i].yaw = def.solve;
      if (this.mirrors[i].mesh) this.mirrors[i].mesh.rotation.y = def.solve;
    });
    this.done = true;
    this.seal.charge = 1;
    this.seal.light();
  }

  telemetry() {
    const r = (v) => +v.toFixed(3);
    return {
      done: this.done,
      block: {
        x: this.blocks[0].x,
        z: this.blocks[0].z,
        moving: this.moving.length > 0,
      },
      mirrors: this.mirrors.map((m) => ({
        id: m.id,
        x: m.x,
        z: m.z,
        yaw: r(m.yaw),
        solve: r(m.solve),
        locked:
          m.locked?.ref?.id || (m.locked?.ref === this.seal ? "seal" : null),
      })),
      segments: (this.beams.segments || []).map((s) => s.end),
      charge: r(this.seal.charge),
    };
  }
}

// A polished mirror face must stay smooth under the procedural metal surfaces.
function polish(root) {
  root.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || m.metalness < 0.95 || m.roughness > 0.3) return;
    o.material = m.clone();
    o.material.map = o.material.roughnessMap = o.material.normalMap = null;
    o.material.needsUpdate = true;
  });
}
