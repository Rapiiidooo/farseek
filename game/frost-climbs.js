import * as THREE from "three";
import { addClimbSurface } from "./wall-climb.js";
import { ClimbChips } from "./climb-chips.js";
import { iceAxes, syncAxes } from "./ice-axes.js";
import { prepareVisuals } from "./shader-preparation.js";
import { t } from "./i18n.js";

// The frozen reach's climbs. A short fall closes the crevasse's landing, with Mira's axes at
// its foot; on the island a taller fall, broken by a band of bare rock, leads to the prism's
// shelf. Their faces carry the scars of her picks: only scarred ice can be climbed.
export const POCKET = {
  x: 0,
  face: -49.85,
  top: 4,
  width: 4.9,
  axes: { x: 1.35, z: -49.55 },
};
export const SHELF = {
  face: -8.75,
  z: -144,
  top: 5.6,
  floor: 0.6,
  lower: { z: -144, width: 4.6, bottom: 0.4, top: 4 },
  upper: { z: -144.3, width: 3.4, bottom: 4.7, top: 5.6 },
};
const ICE = 0xa9d2e3,
  GROOVE = 0x86b6cf,
  FROST = 0xe9f2f6;

// The four surfaces of a scarred fall: clear ice, its grooves, the frost of its chips and the
// dark notches of a pick.
export function curtainMaterials() {
  const glossy = (color, roughness) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.15,
      envMapIntensity: 1.3,
      flatShading: true,
    });
  return {
    ice: glossy(ICE, 0.12),
    deep: glossy(GROOVE, 0.2),
    frost: new THREE.MeshStandardMaterial({
      color: FROST,
      roughness: 0.85,
      flatShading: true,
    }),
    scar: glossy(0x2c4b5c, 0.5),
  };
}

export class FrostClimbs {
  constructor(frozen) {
    this.frozen = frozen;
    this.scene = frozen.scene;
    this.world = frozen.world;
    this.assets = frozen.assets;
    this.services = frozen.services;
  }

  async build() {
    this.mat = curtainMaterials();
    const pocket = new Curtain(this, "pocket", 11);
    pocket.patch({ width: POCKET.width, height: POCKET.top, lip: 0.1 });
    pocket.scars({ width: POCKET.width, from: 0.35, to: POCKET.top - 0.3 });
    pocket.place({ x: POCKET.x, z: POCKET.face }, { x: 0, z: 1 });
    this.world.add(
      POCKET.x - 2.5,
      -30,
      POCKET.face - 0.3,
      POCKET.x + 2.5,
      POCKET.top,
      POCKET.face,
      "rock",
      null,
      { grab: false },
    );
    this.pocket = addClimbSurface(this.world, {
      kind: "ice",
      id: "pocket",
      x: POCKET.x,
      z: POCKET.face,
      nx: 0,
      nz: 1,
      width: POCKET.width - 0.3,
      bottom: -0.2,
      top: POCKET.top,
    });
    // On the shelf's face the frame's x runs towards -z, so a patch at z sits at x = SHELF.z - z.
    // One fall from the island to the shelf, thinned to bare rock across the band between the
    // two climbable stretches.
    const { lower, upper, floor } = SHELF;
    const shelf = new Curtain(this, "shelf", 23);
    shelf.patch({
      width: 5,
      height: SHELF.top - floor + 0.1,
      y0: floor,
      x0: 0.1,
      lip: 0.12,
      gap: [lower.top - floor, upper.bottom - floor],
    });
    for (const [part, from, to, spread] of [
      [lower, 0.45, lower.top - floor - 0.3, 0.75],
      [upper, upper.bottom - floor + 0.15, SHELF.top - floor - 0.3, 0.45],
    ])
      shelf.scars({
        width: part.width,
        from,
        to,
        y0: floor,
        x0: SHELF.z - part.z,
        spread,
      });
    shelf.place({ x: SHELF.face, z: SHELF.z }, { x: 1, z: 0 });
    this.world.add(
      SHELF.face - 0.3,
      -30,
      SHELF.z - 2.6,
      SHELF.face,
      SHELF.top,
      SHELF.z + 2.6,
      "rock",
      null,
      { grab: false },
    );
    this.shelf = [lower, upper].map((part, i) =>
      addClimbSurface(this.world, {
        kind: "ice",
        id: i ? "shelf-upper" : "shelf-lower",
        x: SHELF.face,
        z: part.z,
        nx: 1,
        nz: 0,
        width: part.width - 0.3,
        bottom: i ? part.bottom : floor - 0.2,
        top: part.top,
        mantle: i === 1,
        side: -1,
      }),
    );
    await this.buildAxes();
    this.chips = new ClimbChips(this.scene, "ice");
  }

  // Mira's pair, leaning crossed against the foot of the pocket's fall.
  async buildAxes() {
    const model = await this.assets.make("ice_axe", { surfaces: false });
    this.prop = new THREE.Group();
    this.prop.name = "mira-ice-axes";
    if (model) {
      model.traverse((node) => {
        if (node.isMesh) node.castShadow = node.receiveShadow = true;
      });
      for (const [i, lean, turn, dx] of [
        [0, 0.42, 0.5, -0.09],
        [1, 0.36, -0.42, 0.11],
      ]) {
        const axe = i ? model.clone() : model;
        axe.rotation.set(-lean, turn, 0, "YXZ");
        axe.position.set(dx, 0, 0);
        this.prop.add(axe);
      }
    }
    this.prop.position.set(POCKET.axes.x, 0, POCKET.axes.z);
    this.scene.add(this.prop);
    this.useBox = {
      minX: POCKET.axes.x - 0.45,
      maxX: POCKET.axes.x + 0.45,
      minZ: POCKET.axes.z - 0.35,
      maxZ: POCKET.axes.z + 0.45,
      minY: -0.1,
      maxY: 1.4,
    };
  }

  interactables() {
    if (iceAxes.taken || this.hero?.axes) return [];
    return [
      {
        kind: "use",
        box: this.useBox,
        ref: { use: () => this.take() },
        prompt: `relic:${t("Take Mira's ice axes")}`,
      },
    ];
  }

  take() {
    if (iceAxes.taken) return false;
    iceAxes.taken = true;
    syncAxes(this.hero);
    this.prop.visible = false;
    this.onTake?.();
    return true;
  }

  // The axes wait at the fall's foot until taken; a save that already owns them finds none.
  update(dt, hero) {
    this.hero = hero;
    this.prop.visible = !hero.axes;
    for (const strike of hero.wallStrikes?.splice(0) ?? [])
      if (strike.kind === "ice") this.chips.burst(strike);
    this.chips.update(dt);
  }

  // Whether the explorer stands on the prism's shelf.
  onShelf(hero) {
    return (
      !!hero &&
      hero.pos.x < SHELF.face - 0.1 &&
      hero.pos.x > SHELF.face - 3.3 &&
      Math.abs(hero.pos.z - SHELF.z) < 3.2 &&
      hero.feet > SHELF.top - 0.3
    );
  }

  prepareForCompile(on) {
    this.chips.prepareForCompile(on);
    prepareVisuals(this, on, [[this.prop, "visible", true]]);
  }

  reset() {
    iceAxes.taken = false;
    if (this.hero) syncAxes(this.hero);
    this.chips.hide();
  }
}

// A sheet of frozen fall on a vertical plane, built in its own frame: x to the right of a
// climber facing it, y up, z out of the plane. Its front stays within a few centimetres of the
// plane, so palms and picks meet what is drawn.
export class Curtain {
  constructor(owner, name, seed) {
    this.owner = owner;
    this.name = name;
    this.rand = seeded(seed);
    this.parts = { ice: [], deep: [], frost: [], scar: [] };
  }

  // The columns of the patch being built: their edges across it, of uneven widths.
  columns(width) {
    const edges = [-width / 2];
    while (edges.at(-1) < width / 2 - 0.2)
      edges.push(edges.at(-1) + 0.3 + this.rand() * 0.34);
    edges[edges.length - 1] = width / 2;
    this.edges = edges;
  }

  // Which column a point lies in and how far across it.
  column(x) {
    const { edges } = this;
    let k = 1;
    while (k < edges.length - 1 && x > edges[k]) k++;
    const a = edges[k - 1],
      b = edges[k];
    return { k, f: THREE.MathUtils.clamp((x - a) / (b - a), 0, 1) };
  }

  // How far the face stands out of its plane: columns poured side by side, each bulging along
  // its length, with grooves between them, and a brow where the flow rounds over the top.
  front(x, y, height = Infinity) {
    const { k, f } = this.column(x);
    const ridge = Math.sin(Math.PI * f) ** 0.5;
    const swell = 0.55 + 0.45 * Math.sin(y * (0.9 + (k % 4) * 0.31) + k * 2.3);
    const brow = Math.max(0, 1 - (height - y) / 0.45);
    return (
      0.05 * ridge * swell +
      0.005 * Math.sin(y * 7.7 + x * 5.1) +
      0.07 * brow * brow
    );
  }

  groove(x) {
    const { f } = this.column(x);
    return f < 0.1 || f > 0.9;
  }

  // One patch of columns `width` wide and `height` tall from `y0`, centred on `x0`; `lip`
  // rounds its top back over the edge behind. Its sides wander and sink back into the rock, as
  // it does across a `gap` [bottom, top] above y0 where the ice has thinned to bare rock.
  patch({ width, height, y0 = 0, x0 = 0, lip = 0, gap = null }) {
    this.columns(width);
    const across = Math.max(8, Math.round(width / 0.09)),
      up = Math.max(6, Math.round(height / 0.2));
    const phase = this.rand() * 6;
    const rows = [];
    for (let j = 0; j <= up; j++) {
      const row = [];
      const y = (height * j) / up;
      const half =
        width / 2 - 0.12 - 0.12 * (0.5 + 0.5 * Math.sin(y * 1.7 + phase));
      for (let i = 0; i <= across; i++) {
        const x = -width / 2 + (width * i) / across;
        let edge = THREE.MathUtils.smoothstep(half - Math.abs(x), -0.02, 0.2);
        if (gap) {
          const low = gap[0] + 0.07 * Math.sin(x * 4.3 + phase),
            high = gap[1] + 0.06 * Math.sin(x * 3.1 + phase * 2);
          edge *= THREE.MathUtils.smoothstep(
            Math.max(low - y, y - high),
            -0.02,
            0.14,
          );
        }
        const z = -0.28 + (0.295 + this.front(x, y, height)) * edge;
        row.push(new THREE.Vector3(x + x0, y + y0, z));
      }
      rows.push(row);
    }
    const ice = [],
      deep = [];
    const quad = (list, a, b, c, d) => list.push(a, b, c, a, c, d);
    // Where the ice has thinned to nothing the rock behind shows through.
    const bare = (...points) => points.every((p) => p.z < -0.26);
    for (let j = 0; j < up; j++)
      for (let i = 0; i < across; i++) {
        const middle = -width / 2 + (width * (i + 0.5)) / across;
        if (
          bare(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])
        )
          continue;
        quad(
          this.groove(middle) ? deep : ice,
          rows[j][i],
          rows[j][i + 1],
          rows[j + 1][i + 1],
          rows[j + 1][i],
        );
      }
    const top = rows[up];
    const frost = [];
    const back = (p) => new THREE.Vector3(p.x, p.y, -0.3);
    const rise = (p) =>
      new THREE.Vector3(p.x, p.y + 0.05 + lip * 0.3, p.z * 0.4 - 0.12);
    for (let i = 0; i < across; i++) {
      const a = top[i],
        b = top[i + 1];
      if (a.z < -0.2 && b.z < -0.2) continue;
      frost.push(a, b, rise(b), a, rise(b), rise(a));
      frost.push(
        rise(a),
        rise(b),
        back(rise(b)),
        rise(a),
        back(rise(b)),
        back(rise(a)),
      );
    }
    // Icicles hang from the brow, and over a gap, longest on the columns' crests.
    const lips = [up - 1];
    if (gap) lips.push(Math.min(up - 1, Math.ceil((gap[1] / height) * up) + 1));
    for (const j of lips)
      for (let i = 1; i < across; i++) {
        const p = rows[j][i];
        const middle = -width / 2 + (width * i) / across;
        if (p.z < -0.1 || this.groove(middle) || this.rand() < 0.55) continue;
        const length = 0.15 + this.rand() * 0.4;
        const w = 0.02 + this.rand() * 0.024;
        const at = (x, y, z) => new THREE.Vector3(p.x + x, p.y + y, p.z + z);
        const tip = at(0, -length, 0.018),
          l = at(-w, 0.03, -0.012),
          r = at(w, 0.03, -0.012),
          f = at(0, 0.03, w);
        ice.push(l, f, tip, f, r, tip);
      }
    this.parts.ice.push(ice);
    this.parts.deep.push(deep);
    this.parts.frost.push(frost);
    this.height = height;
    this.x0 = x0;
  }

  // Mira's pick marks up the face: dark notches, left and right in turn, each with a drag mark
  // and a white bruise of chips under it. Follows the patch just built.
  scars({ width, from, to, y0 = 0, x0 = 0, spread = 0.55 }) {
    const { height } = this;
    const scar = [],
      frost = [];
    let k = 0;
    for (let y = from; y < to; y += 0.21, k++) {
      const side = k % 2 ? 1 : -1;
      const x =
        side * (spread * (0.6 + 0.4 * this.rand())) + Math.sin(y * 1.3) * 0.2;
      if (Math.abs(x) > width / 2 - 0.45) continue;
      const surface = 0.015 + this.front(x + x0 - this.x0, y, height);
      const c = new THREE.Vector3(x + x0, y + y0, surface + 0.006);
      const at = (dx, dy, dz) => c.clone().add(new THREE.Vector3(dx, dy, dz));
      const w = 0.05 + 0.015 * this.rand(),
        h = 0.028 + 0.01 * this.rand();
      const a = at(-w, h * 0.4, 0),
        b = at(w, h * 0.4, 0),
        d = at(0, -h, 0.001),
        e = at(0, h * 0.1, -0.025);
      scar.push(a, d, e, e, d, b, a, e, b);
      for (let n = 0; n < 4; n++) {
        const q = at(
          (this.rand() - 0.5) * 0.16,
          -0.035 - this.rand() * 0.07,
          0.004,
        );
        const r = 0.01 + this.rand() * 0.012;
        frost.push(
          q.clone().add(new THREE.Vector3(-r, 0, 0)),
          q.clone().add(new THREE.Vector3(r, -r * 0.4, 0)),
          q.clone().add(new THREE.Vector3(0, r, 0)),
        );
      }
    }
    this.parts.scar.push(scar);
    this.parts.frost.push(frost);
  }

  // Into the scene: the frame's origin at `origin` on a plane facing `n`.
  place(origin, n) {
    const matrix = new THREE.Matrix4()
      .makeBasis(
        new THREE.Vector3(n.z, 0, -n.x),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(n.x, 0, n.z),
      )
      .setPosition(origin.x, 0, origin.z);
    for (const [key, lists] of Object.entries(this.parts)) {
      const points = lists.flat();
      if (!points.length) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      geometry.applyMatrix4(matrix);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, this.owner.mat[key]);
      mesh.name = `${this.name}-${key}`;
      mesh.castShadow = key === "ice";
      mesh.receiveShadow = true;
      this.owner.scene.add(mesh);
    }
  }
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
