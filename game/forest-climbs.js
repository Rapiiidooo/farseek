import * as THREE from "three";
import { addClimbSurface } from "./wall-climb.js";
import { ClimbChips } from "./climb-chips.js";
import { stoneSteps } from "./gate-bases.js";
import { prepareVisuals } from "./shader-preparation.js";

// The castle's outworks, in the stone of its door's steps, with thick ivy that bare hands can
// climb. An outer wall closes the trail below the castle's clearing; a stair inside leads down
// from its walk. A bastion on the clearing's east side holds the crescent seal of the castle's
// address above its ivy.
export const OUTER = {
  x0: -34.4,
  x1: -13.6,
  // Outer face, then inner face.
  z0: -202.8,
  z1: -204.2,
  rise: 4.3,
  ivy: { x: -24.4, width: 3.3 },
  stair: { x0: -27.2, x1: -25.6, rise: 0.5, run: 0.6 },
};
export const BASTION = {
  x0: -25,
  x1: -20.6,
  z0: -250.8,
  z1: -244.8,
  rise: 4.5,
  ivy: { z: -247.7, width: 3.4 },
  seal: [-22.3, -248.7],
};
const IVY = 0.06;

export class ForestClimbs {
  constructor(level) {
    this.level = level;
    this.scene = level.scene;
    this.world = level.world;
    this.assets = level.assets;
  }

  // The terrain's lowest and highest heights along a segment.
  span(x0, z0, x1, z1) {
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const h = this.world.terrainAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
    return { low, high };
  }

  async build() {
    const blocks = [];
    // A course of blocks between x0 and x1 (or z0 and z1), staggered by `shift`.
    const course = (
      axis,
      from,
      to,
      across0,
      across1,
      low,
      top,
      size,
      shift,
    ) => {
      let at = from;
      let first = true;
      while (at < to - 0.05) {
        const length = Math.min(to - at, first && shift ? size * 0.5 : size);
        first = false;
        const middle = at + length / 2;
        blocks.push(
          axis === "x"
            ? {
                x: middle,
                z: (across0 + across1) / 2,
                width: length - 0.03,
                depth: Math.abs(across1 - across0),
                low,
                top,
              }
            : {
                x: (across0 + across1) / 2,
                z: middle,
                width: Math.abs(across1 - across0),
                depth: length - 0.03,
                low,
                top,
              },
        );
        at += length;
      }
    };
    const O = OUTER;
    const outerFoot = this.span(O.x0, O.z0 + 0.5, O.x1, O.z0 + 0.5);
    const innerFoot = this.span(O.x0, O.z1 - 0.5, O.x1, O.z1 - 0.5);
    O.top = outerFoot.high + O.rise;
    O.base = Math.min(outerFoot.low, innerFoot.low) - 0.8;
    const rows = Math.round((O.top - O.base) / 0.72);
    for (let r = 0; r < rows; r++) {
      const low = O.base + ((O.top - O.base) * r) / rows,
        top = O.base + ((O.top - O.base) * (r + 1)) / rows;
      course("x", O.x0, O.x1, O.z0, O.z1, low, top, 1.9, r % 2);
    }
    // Coping along the walk, and the end towers bedded in the banks.
    course(
      "x",
      O.x0,
      O.x1,
      O.z0 + 0.08,
      O.z1 - 0.08,
      O.top - 0.02,
      O.top + 0.18,
      2.4,
      0,
    );
    O.walk = O.top + 0.18;
    for (const [x0, x1] of [
      [O.x0 - 1.2, O.x0 + 1.2],
      [O.x1 - 1.2, O.x1 + 1.2],
    ]) {
      const towerTop = O.walk + 1.8;
      for (let r = 0; r < rows + 2; r++) {
        const low = O.base + ((towerTop - O.base) * r) / (rows + 2),
          top = O.base + ((towerTop - O.base) * (r + 1)) / (rows + 2);
        course("x", x0, x1, O.z0 + 0.35, O.z1 - 0.35, low, top, 1.2, r % 2);
      }
      this.world.add(
        x0,
        O.base,
        O.z1 - 0.35,
        x1,
        towerTop,
        O.z0 + 0.35,
        "rock",
        null,
        {
          grab: false,
        },
      );
    }
    this.world.add(O.x0, O.base, O.z1, O.x1, O.walk, O.z0, "rock", null, {
      grab: false,
    });
    // The stair down from the walk, inside the wall, until it meets the rising ground.
    const S = O.stair;
    for (let k = 0; k < 12; k++) {
      const top = O.walk - S.rise * (k + 1);
      const z1 = O.z1 - S.run * k,
        z0 = z1 - S.run;
      const ground = this.span(S.x0, z0, S.x1, z1);
      if (top < ground.high + 0.15) break;
      const foot = ground.low - 0.6;
      blocks.push({
        x: (S.x0 + S.x1) / 2,
        z: (z0 + z1) / 2,
        width: S.x1 - S.x0,
        depth: S.run - 0.02,
        low: foot,
        top,
      });
      this.world.add(S.x0, foot, z0, S.x1, top, z1, "rock");
    }
    this.outer = addClimbSurface(this.world, {
      kind: "vine",
      id: "outer-wall",
      x: O.ivy.x,
      z: O.z0 + IVY,
      nx: 0,
      nz: 1,
      width: O.ivy.width - 0.3,
      bottom: outerFoot.low - 0.3,
      top: O.walk,
    });

    const B = BASTION;
    const westFoot = this.span(B.x0 - 0.5, B.z0, B.x0 - 0.5, B.z1);
    const under = this.span(B.x0, B.z0, B.x1, B.z1);
    B.top = westFoot.high + B.rise;
    B.base = Math.min(westFoot.low, under.low) - 0.8;
    const courses = Math.round((B.top - B.base) / 0.72);
    for (let r = 0; r < courses; r++) {
      const low = B.base + ((B.top - B.base) * r) / courses,
        top = B.base + ((B.top - B.base) * (r + 1)) / courses;
      course("z", B.z0, B.z1, B.x0, B.x1, low, top, 1.5, r % 2);
    }
    course(
      "z",
      B.z0,
      B.z1,
      B.x0 + 0.06,
      B.x1 - 0.06,
      B.top - 0.02,
      B.top + 0.16,
      2,
      0,
    );
    B.walk = B.top + 0.16;
    this.world.add(B.x0, B.base, B.z0, B.x1, B.walk, B.z1, "rock", null, {
      grab: false,
    });
    // Parapets on the sides against the bank: too tall to jump onto.
    for (const [x0, z0, x1, z1] of [
      [B.x1 - 0.45, B.z0, B.x1, B.z1],
      [B.x0, B.z0, B.x1 - 0.45, B.z0 + 0.45],
    ]) {
      const width = x1 - x0,
        depth = z1 - z0;
      const along = width > depth ? "x" : "z";
      for (let r = 0; r < 2; r++)
        course(
          along,
          along === "x" ? x0 : z0,
          along === "x" ? x1 : z1,
          along === "x" ? z0 : x0,
          along === "x" ? z1 : x1,
          B.walk + r * 0.72,
          B.walk + (r + 1) * 0.72,
          1.2,
          r,
        );
      this.world.add(x0, B.walk, z0, x1, B.walk + 1.44, z1, "rock", null, {
        grab: false,
      });
    }
    this.bastion = addClimbSurface(this.world, {
      kind: "vine",
      id: "bastion",
      x: B.x0 - IVY,
      z: B.ivy.z,
      nx: -1,
      nz: 0,
      width: B.ivy.width - 0.3,
      bottom: westFoot.low - 0.3,
      top: B.walk,
    });
    this.scene.add(await stoneSteps(blocks, this.assets));
    await this.buildIvy();
    this.chips = new ClimbChips(this.scene, "vine");
  }

  // Thick woody vines up each climbing face, under runners of the castle's own ivy.
  async buildIvy() {
    const vine = await this.assets.make("wall_vine", { keepHierarchy: true });
    if (!vine) return;
    ivyFaces(this.scene, vine, "castle-outwork-ivy", [
      { s: this.outer, rise: OUTER.walk - this.outer.y0, seed: 3 },
      { s: this.bastion, rise: BASTION.walk - this.bastion.y0, seed: 7 },
    ]);
  }

  update(dt, hero) {
    this.hero = hero;
    for (const strike of hero.wallStrikes?.splice(0) ?? [])
      if (strike.kind === "vine") this.chips.burst(strike, 4);
    this.chips.update(dt);
  }

  // Whether the explorer stands on the bastion, by the crescent seal.
  onBastion(hero) {
    const B = BASTION;
    return (
      !!hero &&
      hero.pos.x > B.x0 - 0.1 &&
      hero.pos.x < B.x1 &&
      hero.pos.z > B.z0 &&
      hero.pos.z < B.z1 + 0.1 &&
      hero.feet > B.walk - 0.3
    );
  }

  prepareForCompile(on) {
    this.chips.prepareForCompile(on);
    prepareVisuals(this, on, []);
  }

  reset() {
    this.chips.hide();
  }
}

// A copy of a source geometry's position, uv and colour, carried by `matrix` after `local`.
// Woody vines and runners of a loaded `wall_vine` up climbing faces: [{ s, rise, seed }], with s
// a surface from `addClimbSurface`. One mesh for the leaves and one for the stems.
export function ivyFaces(scene, vine, name, faces) {
  vine.updateMatrixWorld(true);
  const sources = [];
  vine.traverse((mesh) => mesh.isMesh && sources.push(mesh));
  const leaves = sources.find((m) => m.material.name === "foliage"),
    stems = sources.find((m) => m.material.name !== "foliage");
  const merged = { leaves: [], stems: [] };
  // The trunks take the stems' own vertex tint, which their material multiplies.
  const tint = [1, 1, 1];
  const source = stems.geometry.attributes.color;
  if (source) {
    tint.fill(0);
    for (let i = 0; i < source.count; i++)
      for (let c = 0; c < 3; c++)
        tint[c] += source.getComponent(i, c) / source.count;
  }
  const place = new THREE.Matrix4(),
    basis = new THREE.Matrix4();
  for (const { s, rise, seed } of faces) {
    const rand = seeded(seed);
    basis.makeBasis(
      new THREE.Vector3(s.n.z, 0, -s.n.x),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(s.n.x, 0, s.n.z),
    );
    const height = vine.userData.growth?.height || 6;
    const width = s.half * 2 + 0.3;
    for (let i = 0; i < 4; i++) {
      const across = -width / 2 + (width * (i + 0.5)) / 4;
      const k = rise / height;
      place
        .copy(basis)
        .multiply(
          new THREE.Matrix4().makeScale(
            0.55 + 0.1 * rand(),
            k * (0.95 + 0.08 * rand()),
            0.8,
          ),
        )
        .setPosition(
          s.o.x + s.n.z * across - s.n.x * 0.015,
          s.y0 + 0.25,
          s.o.z - s.n.x * across - s.n.z * 0.015,
        );
      merged.leaves.push(
        transformed(leaves.geometry, leaves.matrixWorld, place),
      );
      merged.stems.push(transformed(stems.geometry, stems.matrixWorld, place));
    }
    // Woody trunks the hands close on, wandering up the face.
    for (let i = 0; i < 6; i++) {
      const across = -width / 2 + 0.25 + ((width - 0.5) * i) / 5;
      const points = [];
      const phase = rand() * 6;
      for (let j = 0; j <= 10; j++) {
        const y = (rise * j) / 10;
        const u = across + Math.sin(y * 1.3 + phase) * 0.12;
        const d = 0.03 + 0.012 * Math.sin(y * 2.7 + phase);
        points.push(
          new THREE.Vector3(
            s.o.x + s.n.z * u - s.n.x * 0 + s.n.x * (d - IVY),
            s.y0 + 0.25 + y,
            s.o.z - s.n.x * u + s.n.z * (d - IVY),
          ),
        );
      }
      const tube = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        24,
        0.035 + 0.012 * rand(),
        5,
        false,
      ).toNonIndexed();
      const colors = new Float32Array(tube.attributes.position.count * 3);
      for (let c = 0; c < colors.length; c++) colors[c] = tint[c % 3];
      tube.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      merged.stems.push(tube);
    }
  }
  for (const [key, material] of [
    ["leaves", leaves.material],
    ["stems", stems.material],
  ]) {
    const geometry = join(merged[key]);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}-${key}`;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function transformed(source, local, matrix) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  for (const name of Object.keys(geometry.attributes))
    if (!["position", "uv", "color"].includes(name))
      geometry.deleteAttribute(name);
  geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, local));
  return geometry;
}

function join(list) {
  const names = ["position", "uv", "color"].filter((name) =>
    list.every((g) => g.attributes[name]),
  );
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = list[0].attributes[name].itemSize;
    const total = list.reduce((sum, g) => sum + g.attributes[name].count, 0);
    const array = new Float32Array(total * size);
    let offset = 0;
    for (const g of list) {
      array.set(g.attributes[name].array, offset);
      offset += g.attributes[name].count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  return out;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
