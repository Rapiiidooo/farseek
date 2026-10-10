import * as THREE from "three";
import { BOG, buildBog } from "./forest-bog.js";
import { BAYS, buildSeal } from "./vault.js";
import { t } from "./i18n.js";

// The wildwood's bay: a pool of the forest's spore water from wall to wall, crossed on the
// builders' stepping stones. A stone holds a moment, warns in amber, then sinks if it is stood
// on too long, and rises again a little later. The water burns: a fall returns the explorer to
// the bank. On the far bank the seal waits on a ledge above thick ivy.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BAY = BAYS[4];
// Stones 2.9 m across with 1.1 m of water between: a walking hop from a lip and a running
// leap both land on the next top.
export const POOL = {
  minX: -30.1,
  maxX: -13,
  water: -0.7,
  stones: [
    [-15.55, -52],
    [-19.55, -51.6],
    [-23.55, -52.4],
    [-27.55, -51.9],
  ],
  radius: 1.45,
  top: 0.15,
  hold: 1.2,
  sink: 2.5,
  rise: 3,
  ledge: { face: -56.5, top: 3.2 },
  ivy: { x: -31.55, width: 2.4 },
  seal: { x: -31.6, z: -58.75, yaw: 0, floor: 3.2 },
  bank: { x: -11, z: -52, yaw: -Math.PI / 2 },
};
const AMBER = new THREE.Color(0xffb24a),
  TURQUOISE = new THREE.Color(0x39e3d0);

export class BogTrial {
  constructor(vault) {
    this.vault = vault;
    this.bay = BAY;
    this.id = BAY.id;
    this.done = false;
    this.stones = [];
    this.time = 0;
  }

  async build() {
    const { vault } = this;
    const { scene, world, assets } = vault;
    const m = vault.mat,
      S = vault.masonry;
    const area = `bay ${BAY.id}`;
    S.block(area, POOL.maxX, -3, BAY.z0, -9, 0, BAY.z1, m.moss, m.moss, {
      grab: true,
    });
    S.block(area, -33, -3, BAY.z0, POOL.minX, 0, BAY.z1, m.moss, m.moss, {
      grab: true,
    });
    const L = POOL.ledge;
    S.block(area, -33, 0, BAY.z0, POOL.minX, L.top, L.face, m.moss, m.moss, {
      grab: false,
    });
    this.ivy = await vault.climbs.ivy({
      id: "forest-ivy",
      x: POOL.ivy.x,
      z: L.face,
      n: { x: 0, z: 1 },
      width: POOL.ivy.width,
      top: L.top,
    });
    S.block(
      area,
      POOL.minX,
      -4,
      BAY.z0,
      POOL.maxX,
      -2.6,
      BAY.z1,
      m.base,
      m.base,
      {
        solid: false,
        plain: true,
      },
    );
    // The forest's own bog water and haze, fitted to the pool.
    const group = new THREE.Group();
    const sx = (POOL.maxX - POOL.minX + 2) / (BOG.ax * 2 + 2),
      sz = (BAY.z1 - BAY.z0 + 1) / (BOG.az * 2 + 6);
    group.scale.set(sx, 0.6, sz);
    group.position.set(
      (POOL.minX + POOL.maxX) / 2 - BOG.x * sx,
      POOL.water - BOG.level * 0.6,
      (BAY.z0 + BAY.z1) / 2 - BOG.z * sz,
    );
    scene.add(group);
    this.bog = buildBog(THREE, group);
    // Stepping stones: drums of mossy masonry with a ring of light let into the top.
    this.stoneMat = new THREE.MeshStandardMaterial({
      color: 0x6f7a55,
      roughness: 0.92,
    });
    this.stoneMat.name = "stone";
    const drum = new THREE.CylinderGeometry(
      POOL.radius * 0.94,
      POOL.radius,
      2.4,
      12,
      1,
    );
    drum.translate(0, -1.2, 0);
    const ringGeo = new THREE.RingGeometry(
      POOL.radius * 0.5,
      POOL.radius * 0.62,
      24,
      1,
    );
    ringGeo.rotateX(-Math.PI / 2);
    for (const [x, z] of POOL.stones) {
      const mesh = new THREE.Mesh(drum, this.stoneMat);
      mesh.castShadow = mesh.receiveShadow = true;
      const glow = new THREE.MeshStandardMaterial({
        color: 0x1d5f63,
        emissive: TURQUOISE.clone(),
        emissiveIntensity: 0.6,
        roughness: 0.3,
      });
      const ring = new THREE.Mesh(ringGeo, glow);
      ring.position.y = 0.012;
      mesh.add(ring);
      scene.add(mesh);
      const box = world.addRound(
        x,
        z,
        POOL.radius,
        -3,
        POOL.top,
        "rock",
        null,
        {
          stand: true,
          grab: false,
          unsafe: true,
        },
      );
      this.stones.push({
        x,
        z,
        mesh,
        glow,
        box,
        held: 0,
        phase: "rest",
        t: 0,
        y: POOL.top,
      });
    }
    this.placeStones();
    this.seal = await buildSeal(vault, BAY, POOL.seal);
    for (const [name, x, z, s, yaw] of [
      ["fern_cluster", -10.6, -58.4, 1.1, 0.2],
      ["fern_cluster", -10.4, -45.8, 0.9, 1.7],
      ["fern_cluster", -31.8, -58.2, 1, 2.6],
      ["fern_cluster", -31.6, -45.9, 1.2, 0.9],
      ["glow_mushroom", -12.2, -57.8, 0.8, 0.5],
      ["glow_mushroom", -32.2, -48.6, 0.7, 1.9],
      ["glow_mushroom", -11.4, -46.6, 0.6, 2.8],
    ]) {
      const o = await assets.make(name, {
        keepHierarchy: name === "glow_mushroom",
      });
      if (!o) continue;
      o.position.set(x, 0, z);
      o.rotation.y = yaw;
      o.scale.setScalar(s);
      scene.add(o);
      world.addRound(x, z, 0.45 * s, 0, 1 * s, "prop", null, { thin: true });
    }
  }

  placeStones() {
    for (const s of this.stones) {
      s.mesh.position.set(s.x, s.y, s.z);
      s.box.maxY = s.y;
    }
  }

  // The stone under the explorer's feet, if any.
  standing(hero) {
    if (hero.state !== "ground") return null;
    for (const s of this.stones)
      if (
        Math.hypot(hero.pos.x - s.x, hero.pos.z - s.z) < POOL.radius + 0.25 &&
        Math.abs(hero.feet - s.y) < 0.08
      )
        return s;
    return null;
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
    this.vault.services.sound?.play("pylon");
    this.onDone?.(this);
    return true;
  }

  update(dt, hero, { playable }) {
    this.time += dt;
    this.bog.update(
      this.time,
      this.stones.some((s) => s.phase === "sinking") ? 0.4 : 0,
    );
    const under = playable ? this.standing(hero) : null;
    for (const s of this.stones) {
      s.t += dt;
      if (s.phase === "rest") {
        s.held = s === under ? s.held + dt : Math.max(0, s.held - dt * 2);
        if (s.held > POOL.sink) {
          s.phase = "sinking";
          s.t = 0;
          this.vault.services.sound?.play("slide");
        }
        const warn = Math.max(
          0,
          (s.held - POOL.hold) / (POOL.sink - POOL.hold),
        );
        s.y = POOL.top - warn * 0.12;
      } else if (s.phase === "sinking") {
        s.y = POOL.top - 0.12 - Math.min(1, s.t / 0.35) * 1.6;
        if (
          s.t > POOL.rise &&
          Math.hypot(hero.pos.x - s.x, hero.pos.z - s.z) > POOL.radius + 0.6
        ) {
          s.phase = "rising";
          s.t = 0;
        }
      } else if (s.phase === "rising") {
        const k = Math.min(1, s.t / 0.8);
        s.y = POOL.top - 1.72 * (1 - k * k * (3 - 2 * k));
        if (k >= 1) {
          s.phase = "rest";
          s.held = 0;
        }
      }
      const warn =
        s.phase === "rest"
          ? Math.max(0, (s.held - POOL.hold) / (POOL.sink - POOL.hold))
          : s.phase === "sinking"
            ? 1
            : 0;
      const flicker =
        warn > 0 ? 0.55 + 0.45 * Math.sign(Math.sin(this.time * 16)) : 1;
      s.glow.emissive.copy(TURQUOISE).lerp(AMBER, warn);
      s.glow.emissiveIntensity = (s === under ? 1.8 : 0.7) * flicker;
    }
    this.placeStones();
    // The water is no footing: a fall into it burns, and the bank takes the explorer back.
    if (
      playable &&
      hero.feet < POOL.water - 0.2 &&
      hero.pos.x > POOL.minX &&
      hero.pos.x < POOL.maxX &&
      hero.pos.z > BAY.z0 &&
      hero.pos.z < BAY.z1
    )
      this.onBurn?.(POOL.bank);
  }

  guide(hero) {
    if (hero.pos.x < POOL.minX)
      return hero.feet > POOL.ledge.top - 0.3
        ? {
            title: t("Climb to the seal"),
            sub: t("Press the seal on the ledge"),
            point: this.seal.center,
          }
        : {
            title: t("Climb to the seal"),
            sub: t("Thick ivy holds bare hands: jump at it and climb"),
            point: V(POOL.ivy.x, 2, POOL.ledge.face),
          };
    return {
      title: t("Cross the sinking stones"),
      sub: t(
        "Keep moving: a stone sinks into the spore water if you stand on it too long",
      ),
      point: V(POOL.stones[0][0], 1.4, POOL.stones[0][1]),
    };
  }

  hint() {
    return [
      BAY.title,
      t(
        "The builders' stones hold for a moment, glow amber, then sink. Jump from stone to stone without stopping. On the far bank, jump at the ivy and climb to the seal.",
      ),
    ];
  }

  reset() {
    this.done = false;
    for (const s of this.stones)
      Object.assign(s, { phase: "rest", held: 0, t: 0, y: POOL.top });
    this.placeStones();
    this.seal.light(false);
  }

  solve() {
    this.reset();
    this.done = true;
    this.seal.light();
  }

  telemetry() {
    return {
      done: this.done,
      stones: this.stones.map((s) => ({
        x: s.x,
        z: s.z,
        y: +s.y.toFixed(2),
        phase: s.phase,
        held: +s.held.toFixed(2),
      })),
      seal: this.seal.center.toArray(),
      ivy: { x: POOL.ivy.x, z: POOL.ledge.face, top: POOL.ledge.top },
      pool: [POOL.minX, POOL.maxX, POOL.water],
      radius: POOL.radius,
    };
  }
}
