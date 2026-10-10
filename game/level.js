import * as THREE from "three";
import * as COURT from "./court.js";
import {
  FaceBuilder,
  aoField,
  greedyRects,
  terrainMaterial,
} from "./terrain.js";
import { glyphMaterial, makeGlyph } from "./glyphs.js";
import { buildCliffs } from "./cliffs.js";
import { plantGrass, clumps } from "./grass.js";
import { buildCourtDetail, prepareCourtSurface } from "./court-detail.js";

// The court's grass, bleached to straw by the sun, darker where it roots in the sand.
const DRY_GRASS = [0x6e5b37, 0xc4a86c];

// The canyon's skyline: low in the west where the sun comes over, tallest behind the gate,
// with a slot cut deep into the west wall, where the sun falls through onto the catcher
// mirror. Its sill stays above what a jump from the pushed block can reach.
function rimHeight(x, z) {
  const W = COURT.MAP[0].length * COURT.CELL,
    D = COURT.MAP.length * COURT.CELL;
  const sides = [
    [11, Math.abs(x - 2)],
    [21, Math.abs(z - 4)],
    [15.5, Math.abs(x - (W - 2))],
    [16.5, Math.abs(z - (D - 2))],
  ];
  let wsum = 0,
    h = 0;
  for (const [height, d] of sides) {
    const w = 1 / Math.pow(d + 0.5, 3);
    wsum += w;
    h += height * w;
  }
  h /= wsum;
  const n =
    Math.sin(x * 0.21 + z * 0.13) * 1.6 +
    Math.sin(x * 0.07 - z * 0.19 + 1.3) * 2.2 +
    Math.sin((x + z) * 0.43) * 0.7;
  h += n;
  if (x < 4) h -= 5.9 * Math.exp(-Math.pow((z - 21) / 1.2, 2));
  return h;
}

// Builds the court from its map: colliders for the hero, merged terrain meshes, and the
// things that move (blocks slide one cell, mirrors turn on their drums).
export class Level {
  constructor(scene, world, assets) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.root = new THREE.Group();
    this.root.name = "court";
    scene.add(this.root);
    this.blocks = [];
    this.mirrors = [];
    this.stelae = [];
    this.memories = [];
    this.moving = [];
  }

  get receivers() {
    return [...this.stelae, ...this.memories];
  }

  async build() {
    const { MAP, CELL, heightOf } = COURT;
    const rock = terrainMaterial("rock", 0xb57f4f),
      floor = terrainMaterial("floor", 0xc4935f),
      sand = terrainMaterial("sand", 0xd4a373, 0.98),
      dark = terrainMaterial("rock", 0x8a5433),
      masonry = terrainMaterial("masonry", 0xbd8a58),
      dressed = terrainMaterial("dressed", 0xbd8a58);
    this.materials = { rock, floor, sand, dark, masonry, dressed };
    prepareCourtSurface(floor);
    for (const material of Object.values(this.materials)) shadeRavine(material);
    this.buildOcclusion();
    // Faces on the outer rim of the map are never seen.
    const faces = new FaceBuilder({
      minX: 0,
      maxX: MAP[0].length * CELL,
      minZ: 0,
      maxZ: MAP.length * CELL,
    });
    const base = -10;

    // Cliffs get a ragged skyline: every cell its own height.
    const rects = greedyRects(MAP, heightOf, (ch) => ch === "#");
    for (const r of rects) {
      const x0 = r.i0 * CELL,
        x1 = (r.i1 + 1) * CELL,
        z0 = r.j0 * CELL,
        z1 = (r.j1 + 1) * CELL;
      this.world.add(x0, base, z0, x1, r.h, z1, "rock", null, {
        grab: r.ch !== "#",
      });
      // Platforms and stairs are the builders' dressed stone; the standing wall is rock.
      const built =
        r.ch !== "." && r.ch !== "_" && r.ch !== "~" && r.ch !== "o";
      const top =
        r.ch === "."
          ? floor
          : r.ch === "_"
            ? sand
            : r.ch === "~"
              ? dark
              : built
                ? masonry
                : rock;
      if (built)
        faces.masonryBox(x0, base, z0, x1, r.h, z1, dressed, top, {
          roundedTop: false,
        });
      else faces.box(x0, base, z0, x1, r.h, z1, rock, top);
    }
    // Cliff heights follow a smooth noise around the rim, in 1.5 m steps, and runs of equal
    // height merge into broad slabs so the rim reads as rock rather than a row of pillars.
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const wave = (t) =>
      Math.sin(t * 0.9) * 0.5 +
      Math.sin(t * 2.3 + 1.7) * 0.3 +
      Math.sin(t * 0.37 + 4) * 0.2;
    const cliff = MAP.map((row, j) =>
      [...row].map((ch, i) => {
        if (ch !== "#") return "-";
        const lo = j <= 1 ? 18 : i === 0 ? 10 : j === MAP.length - 1 ? 14 : 13;
        const span = j <= 1 ? 6 : 4.5;
        const h =
          lo +
          (wave(i * 0.8 + j * 0.8) * 0.5 + 0.5) * span -
          (i === 0 && j === 10 ? 3.5 : 0);
        return String.fromCharCode(65 + Math.round(h / 1.5));
      }),
    );
    for (const r of greedyRects(
      cliff,
      (ch) => (ch.charCodeAt(0) - 65) * 1.5,
      (ch) => ch === "-",
    )) {
      const x0 = r.i0 * CELL,
        x1 = (r.i1 + 1) * CELL,
        z0 = r.j0 * CELL,
        z1 = (r.j1 + 1) * CELL;
      // Colliders only: the canyon wall is drawn by one continuous skin below, whose rim
      // does not follow these steps, so the walls rise out of reach and are never ledges.
      this.world.add(x0, base, z0, x1, Math.max(r.h, 40), z1, "rock", null, {
        grab: false,
      });
    }
    void rand;
    this.root.add(
      buildCliffs(rock, {
        corners: [
          [CELL, 2 * CELL],
          [(MAP[0].length - 1) * CELL, 2 * CELL],
          [(MAP[0].length - 1) * CELL, (MAP.length - 1) * CELL],
          [CELL, (MAP.length - 1) * CELL],
        ],
        top: rimHeight,
      }),
    );
    for (const [x0, y0, z0, x1, y1, z1, kind, look, flags] of COURT.EXTRA) {
      this.world.add(x0, y0, z0, x1, y1, z1, kind, null, flags);
      const mat = look === "masonry" ? masonry : rock;
      if (look === "masonry")
        faces.masonryBox(x0, y0, z0, x1, y1, z1, dressed, dressed, {
          roundedTop: flags?.grab === false,
        });
      else faces.box(x0, y0, z0, x1, y1, z1, mat);
    }
    this.buildDrifts(sand);
    faces.build(this.root);

    this.buildHorizon(rock);
    for (const b of COURT.BLOCKS) await this.addBlock(b);
    for (const m of COURT.MIRRORS) await this.addMirror(m);
    for (const s of COURT.STELAE) await this.addStela(s);
    for (const s of COURT.MEMORIES) await this.addStela(s);
    await this.addCatcher(COURT.LIGHT.source);
    await this.dress();
    this.scenery = await buildCourtDetail(this);
  }

  // Scenery that frames the court: the carved facade, the two seated guardians, fallen
  // columns and fire bowls. None of it moves; each piece gets a simple collider.
  async dress() {
    const put = async (name, x, z, yaw = 0, scale = 1) => {
      const o = await this.assets.make(name);
      if (!o) return null;
      o.position.set(x, 0, z);
      o.rotation.y = yaw;
      o.scale.multiplyScalar(scale);
      this.root.add(o);
      return o;
    };
    const facade = await put(
      "temple_facade",
      COURT.FACADE.x,
      COURT.FACADE.z + 1.5,
    );
    if (!facade) this.root.add(fallbackFacade(COURT.FACADE));
    // The facade is solid except for its doorway, a 3.5 by 6 m tunnel 2 m deep behind a
    // frame set 0.7 m back from the pillars (measured from the asset's doorway data).
    {
      const fx = COURT.FACADE.x,
        front = COURT.FACADE.z + 3,
        frame = COURT.FACADE.z + 2.3,
        back = COURT.FACADE.z + 0.3;
      const w = this.world;
      w.add(fx - 8, -10, 2, fx - 1.75, 13, front, "rock", null, {
        grab: false,
      });
      w.add(fx + 1.75, -10, 2, fx + 8, 13, front, "rock", null, {
        grab: false,
      });
      w.add(fx - 1.75, 6, 2, fx + 1.75, 13, front, "rock", null, {
        grab: false,
      });
      w.add(fx - 1.75, -10, 2, fx + 1.75, 13, back, "rock", null, {
        grab: false,
      });
      w.add(fx - 1.75, -10, frame, fx + 1.75, 0.05, front, "rock");
      w.add(fx - 1.75, -10, back, fx + 1.75, 0.05, frame, "rock");
    }
    for (const c of COURT.COLOSSI) {
      const o = await put("guardian_colossus", c.x, c.z, c.yaw);
      if (o) o.position.y = c.y;
      if (!o) this.root.add(fallbackColossus(c));
      for (const [x0, z0, x1, z1, top] of COURT.COLOSSUS_BOXES)
        this.world.add(
          c.x + x0,
          -10,
          c.z + z0,
          c.x + x1,
          c.y + top,
          c.z + z1,
          "rock",
          null,
          {
            grab: top < 2,
          },
        );
    }
    for (const [x, z, yaw] of COURT.COLUMNS) {
      await put("broken_column", x, z, yaw);
      this.addShapes("broken_column", x, 0, z, yaw);
    }
    for (const [name, x, y, z, yaw] of COURT.PROPS) {
      const o = await this.assets.make(name);
      if (!o) continue;
      o.position.set(x, y, z);
      o.rotation.y = yaw;
      this.root.add(o);
      this.addShapes(name, x, y, z, yaw);
    }
    await this.plantGrass();
    // Placed by the lip point the asset declares, turned with the face it hangs down.
    for (const [x, y, z, yaw] of COURT.ROPES) {
      const o = await this.assets.make("expedition_rope", {
        keepHierarchy: true,
      });
      if (!o) break;
      const [ax, ay, az] = o.userData.anchor || [0, 1.75, 0];
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      o.position.set(x - (ax * c + az * s), y - ay, z - (-ax * s + az * c));
      o.rotation.y = yaw;
      this.root.add(o);
    }
    this.fires = [];
    const flame = flameMaterial();
    for (const [x, z] of COURT.BRAZIERS) {
      await put("brazier", x, z);
      const top = 0.98;
      this.world.addRound(x, z, 0.42, -10, 1.1, "fire", null, { cam: false });
      const light = new THREE.PointLight(0xff9a4a, 6, 9, 1.8);
      light.position.set(x, top + 0.45, z);
      this.root.add(light);
      // Three crossed flame cards flicker independently above the coals.
      const tongues = [0, 1, 2].map((k) => {
        const card = new THREE.Mesh(
          new THREE.PlaneGeometry(0.55, 0.9).translate(0, 0.4, 0),
          flame,
        );
        card.position.set(x, top, z);
        card.rotation.y = (k * Math.PI) / 3;
        card.renderOrder = 8;
        this.root.add(card);
        return card;
      });
      this.fires.push({ light, x, z, top, tongues, seed: Math.random() * 10 });
    }
  }

  // Round colliders fitted to a prop's mesh, turned with it (see COURT.PROP_SHAPES).
  addShapes(name, x, y, z, yaw) {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (const [lx, lz, r, top] of COURT.PROP_SHAPES[name] || [])
      this.world.addRound(
        x + lx * c + lz * s,
        z - lx * s + lz * c,
        r,
        -10,
        y + top,
        "prop",
        null,
        { cam: !COURT.SMALL_PROPS.has(name) },
      );
  }

  // Mesas and buttes far beyond the rim, so the canyon sits in a landscape rather than
  // against an empty sky. The rig's aerial perspective hazes them into the distance.
  buildHorizon(rock) {
    let seed = 91;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cx = 15,
      cz = 22;
    const group = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
      const d = 160 + rand() * 260;
      const w = 30 + rand() * 70,
        h = 25 + rand() * 60;
      const geo = new THREE.CylinderGeometry(
        w * (0.55 + rand() * 0.2),
        w,
        h,
        9,
        4,
      );
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k),
          y = p.getY(k),
          z = p.getZ(k);
        const r =
          1 +
          Math.sin(y * 0.3 + x * 0.05) * 0.06 +
          Math.sin(z * 0.08 + i) * 0.08;
        p.setXYZ(
          k,
          x * r,
          y + (y > h / 2 - 1 ? Math.sin(x * 0.2) * 2 : 0),
          z * r,
        );
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rock);
      m.position.set(cx + Math.sin(a) * d, h / 2 - 12, cz + Math.cos(a) * d);
      m.rotation.y = rand() * 3;
      group.add(m);
    }
    this.root.add(group);
  }

  // Soft darkening on the ground near taller rock, precomputed at half-metre resolution
  // from the height map and sampled by the terrain shaders.
  buildOcclusion() {
    const { MAP, CELL, heightOf } = COURT;
    const cols = MAP[0].length,
      rows = MAP.length;
    const res = 0.5,
      w = Math.round((cols * CELL) / res),
      d = Math.round((rows * CELL) / res);
    const heightAtCell = (i, j) =>
      i < 0 || j < 0 || i >= cols || j >= rows ? 20 : heightOf(MAP[j][i]);
    const data = new Uint8Array(w * d * 4);
    for (let pz = 0; pz < d; pz++)
      for (let px = 0; px < w; px++) {
        const x = (px + 0.5) * res,
          z = (pz + 0.5) * res;
        const ci = Math.floor(x / CELL),
          cj = Math.floor(z / CELL);
        const here = heightAtCell(ci, cj);
        let occ = 0;
        for (let j = cj - 2; j <= cj + 2; j++)
          for (let i = ci - 2; i <= ci + 2; i++) {
            const h = heightAtCell(i, j);
            const rise = h - here;
            if (rise < 0.8) continue;
            const dx = Math.max(i * CELL - x, 0, x - (i + 1) * CELL),
              dz = Math.max(j * CELL - z, 0, z - (j + 1) * CELL);
            const dist = Math.hypot(dx, dz);
            occ = Math.max(
              occ,
              Math.exp(-dist / 0.95) * Math.min(1, rise / 2.5),
            );
          }
        const v = Math.round(255 * (1 - 0.55 * occ));
        const k = (pz * w + px) * 4;
        data[k] = data[k + 1] = data[k + 2] = v;
        data[k + 3] = Math.round(
          255 * Math.min(1, COURT.chasmDistance(x, z) / 1.4),
        );
      }
    const tex = new THREE.DataTexture(data, w, d);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    aoField.texture = tex;
    aoField.box.set(0, 0, cols * CELL, rows * CELL);
  }

  // Wind-blown sand banked against the foot of every wall on the court floor.
  buildDrifts(sand) {
    const { MAP, CELL, heightOf } = COURT;
    const pos = [],
      uv = [];
    const hAt = (i, j) =>
      j < 0 || j >= MAP.length || i < 0 || i >= MAP[0].length
        ? 30
        : heightOf(MAP[j][i]);
    const bump = (x, z) =>
      Math.sin(x * 2.3 + z * 1.7) * 0.5 + Math.sin(x * 0.9 - z * 1.3) * 0.5;
    const quad = (a, b, c, e) => {
      for (const p of [a, b, c, a, c, e]) {
        pos.push(p[0], p[1], p[2]);
        uv.push(p[0] / 2, p[2] / 2);
      }
    };
    for (let j = 0; j < MAP.length; j++)
      for (let i = 0; i < MAP[0].length; i++) {
        const ch = MAP[j][i];
        if (ch !== "." && ch !== "_") continue;
        const h0 = heightOf(ch);
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (hAt(i + di, j + dj) < h0 + 0.9) continue;
          // Edge endpoints along the wall and the direction pointing away from it.
          const cx = (i + 0.5) * CELL,
            cz = (j + 0.5) * CELL;
          const wx = cx + (di * CELL) / 2,
            wz = cz + (dj * CELL) / 2;
          const tx = -dj,
            tz = di;
          const segs = 6,
            rings = 5,
            reach = 1.5;
          const grid = [];
          for (let a = 0; a <= segs; a++) {
            const s = a / segs - 0.5;
            const taper = 1 - Math.pow(Math.abs(s) * 2, 6) * 0.35;
            const row = [];
            for (let b = 0; b <= rings; b++) {
              const r = b / rings;
              const x = wx + tx * s * CELL - di * (r * reach - 0.12),
                z = wz + tz * s * CELL - dj * (r * reach - 0.12);
              const height =
                (0.42 + 0.14 * bump(x, z)) * Math.pow(1 - r, 1.6) * taper;
              row.push([x, h0 + 0.01 + Math.max(0, height), z]);
            }
            grid.push(row);
          }
          for (let a = 0; a < segs; a++)
            for (let b = 0; b < rings; b++) {
              const p00 = grid[a][b],
                p10 = grid[a + 1][b],
                p11 = grid[a + 1][b + 1],
                p01 = grid[a][b + 1];
              // Wind the quad so its face points up whichever wall it leans on.
              const flip = di * tz - dj * tx > 0;
              if (flip) quad(p00, p01, p11, p10);
              else quad(p00, p10, p11, p01);
            }
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, sand);
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  // Dry grass in the lee of the walls, round the fallen stones and along the terrace, where
  // what little rain there is collects: clumps of [x, z, radius, tufts], kept off anything
  // built, so a clump round a stone rings its foot.
  async plantGrass() {
    const { MAP, CELL, heightOf } = COURT;
    let seed = 17;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const centres = [
      [27.1, 14.2, 1, 7],
      [27.3, 17.6, 0.8, 5],
      [26.3, 26.2, 2, 14],
      [26.5, 21, 1.4, 9],
      [25.8, 30.5, 1.4, 9],
      [24.3, 34.9, 2.2, 12],
      [27.2, 33.2, 0.9, 6],
      [3.6, 16.9, 2, 14],
      [3.2, 27.5, 1.5, 9],
      [3.3, 33.1, 0.9, 6],
      [15.9, 34.3, 1.1, 7],
      [11.2, 34.4, 0.8, 5],
      [12, 18.7, 0.6, 4],
      [18, 18.7, 0.6, 4],
      [19.9, 39.6, 0.9, 6],
      [11.4, 40.2, 0.8, 5],
      [15.2, 41.3, 0.7, 4],
    ];
    const ground = (x, z) => {
      const ch = MAP[Math.floor(z / CELL)]?.[Math.floor(x / CELL)];
      if (ch !== "." && ch !== "g") return null;
      const h = heightOf(ch);
      if (this.world.occupied(x, z, 0.3, h + 0.05, h + 0.6)) return null;
      return h + this.driftAt(x, z, h);
    };
    const spots = clumps(centres, ground, rand, [0.9, 1.5]);
    await plantGrass(this.assets, this.root, spots, { colors: DRY_GRASS });
  }

  // Height of the sand drift at a point on the court floor, the same shape buildDrifts lays
  // against the foot of each wall, so the explorer's feet stand on the sand instead of in it.
  driftAt(x, z, feet) {
    const { MAP, CELL, heightOf } = COURT;
    const i = Math.floor(x / CELL),
      j = Math.floor(z / CELL);
    const ch = MAP[j]?.[i];
    if (ch !== "." && ch !== "_") return 0;
    const h0 = heightOf(ch);
    if (Math.abs(feet - h0) > 0.05) return 0;
    const hAt = (a, b) =>
      b < 0 || b >= MAP.length || a < 0 || a >= MAP[0].length
        ? 30
        : heightOf(MAP[b][a]);
    const bump =
      Math.sin(x * 2.3 + z * 1.7) * 0.5 + Math.sin(x * 0.9 - z * 1.3) * 0.5;
    const cx = (i + 0.5) * CELL,
      cz = (j + 0.5) * CELL;
    let best = 0;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (hAt(i + di, j + dj) < h0 + 0.9) continue;
      // Distance in from the wall face, and position along it for the taper.
      const d = di
        ? (cx + (di * CELL) / 2 - x) * di
        : (cz + (dj * CELL) / 2 - z) * dj;
      const along = di ? (z - cz) / CELL : (x - cx) / CELL;
      const r = (d + 0.12) / 1.5;
      if (r < 0 || r > 1) continue;
      const taper = 1 - Math.pow(Math.min(1, Math.abs(along) * 2), 6) * 0.35;
      best = Math.max(
        best,
        (0.42 + 0.14 * bump) * Math.pow(1 - r, 1.6) * taper,
      );
    }
    return best;
  }

  // --- blocks ---------------------------------------------------------------
  async addBlock({ id, x, z }) {
    const mesh = (await this.assets.make("push_block")) || fallbackBlock();
    mesh.position.set(x, 0, z);
    this.root.add(mesh);
    const box = this.world.add(
      x - 0.98,
      -10,
      z - 0.98,
      x + 0.98,
      1.9,
      z + 0.98,
      "block",
    );
    const block = { id, x, z, mesh, box, ref: null };
    block.ref = block;
    box.ref = block;
    this.blocks.push(block);
  }

  blockBox(block) {
    return block.box;
  }

  isMoving(block) {
    return this.moving.some((mv) => mv.block === block);
  }

  // Slides a block one cell if the cell ahead is level floor and empty.
  moveBlock(block, dir, duration) {
    const tx = block.x + dir.x * COURT.CELL,
      tz = block.z + dir.z * COURT.CELL;
    const w = this.world;
    // Its whole footprint must be clear, corners included, and on level floor throughout.
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
    this.onBlockMoved?.(block);
    return true;
  }

  // --- mirrors --------------------------------------------------------------
  async addMirror({ id, x, z, yaw }) {
    const mesh = (await this.assets.make("sun_mirror")) || fallbackMirror();
    keepPolish(mesh);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;
    this.root.add(mesh);
    const box = this.world.addRound(x, z, 0.62, -10, 1.95, "mirror", null, {
      cam: false,
    });
    const mirror = { id, x, z, yaw, mesh, box, locked: null };
    mirror.ref = mirror;
    box.ref = mirror;
    this.mirrors.push(mirror);
  }

  // --- stelae ---------------------------------------------------------------
  async addStela({ id, x, z, yaw, glyph, memory = false, relic }) {
    const mesh = (await this.assets.make("glyph_stela")) || fallbackStela();
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;
    this.root.add(mesh);
    const halfX =
      Math.abs(Math.cos(yaw)) * 0.62 + Math.abs(Math.sin(yaw)) * 0.34;
    const halfZ =
      Math.abs(Math.sin(yaw)) * 0.62 + Math.abs(Math.cos(yaw)) * 0.34;
    const box = this.world.add(
      x - halfX,
      -10,
      z - halfZ,
      x + halfX,
      2.4,
      z + halfZ,
      "stela",
    );
    const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
    // The glyph sits in the stela's recessed panel and lights with its lens.
    const panel = mesh.userData.panel || { center: [0, 0.77, 0.3], size: 0.48 };
    const glyphMat = glyphMaterial();
    const mark = makeGlyph(glyph, panel.size * 0.85, glyphMat);
    mark.position.set(
      panel.center[0],
      panel.center[1],
      panel.center[2] + 0.004,
    );
    mesh.add(mark);
    // The lens gets its own material: it warms while light charges it, then stays lit.
    const lensMats = [];
    mesh.userData.parts?.lens?.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0x39e3d0);
      o.material.emissiveIntensity = 0;
      lensMats.push(o.material);
    });
    (memory ? this.memories : this.stelae).push({
      id,
      x,
      z,
      yaw,
      glyph,
      mesh,
      box,
      facing: f,
      charge: 0,
      lit: false,
      glyphMat,
      lensMats,
      memory,
      relic,
    });
  }

  lightStela(s) {
    s.glyphMat.emissiveIntensity = 2.6;
    for (const m of s.lensMats) m.emissiveIntensity = 3;
  }

  // Back to the state the court was found in: blocks home, mirrors at their first angles,
  // every stela dark.
  reset() {
    this.moving = [];
    COURT.BLOCKS.forEach((b, i) => {
      const block = this.blocks[i];
      block.x = b.x;
      block.z = b.z;
      block.mesh.position.set(b.x, 0, b.z);
      Object.assign(block.box, {
        minX: b.x - 0.98,
        maxX: b.x + 0.98,
        minZ: b.z - 0.98,
        maxZ: b.z + 0.98,
      });
    });
    COURT.MIRRORS.forEach((m, i) => {
      const mirror = this.mirrors[i];
      Object.assign(mirror, {
        yaw: m.yaw,
        locked: null,
        pending: 0,
        lastCatch: null,
        lockedAt: -9,
      });
      mirror.mesh.rotation.y = m.yaw;
    });
    for (const s of this.receivers) {
      s.lit = false;
      s.charge = 0;
      s.glyphMat.emissiveIntensity = 0;
      for (const m of s.lensMats) m.emissiveIntensity = 0;
    }
  }

  async addCatcher({ x, z }) {
    const mesh = (await this.assets.make("sun_mirror")) || fallbackMirror();
    keepPolish(mesh);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = Math.PI / 2;
    mesh.scale.setScalar(1.15);
    this.root.add(mesh);
    this.catcher = mesh;
    this.world.addRound(x, z, 0.72, -10, 2.1, "mirror", null, { cam: false });
  }

  // Items with an action (the expedition's notes) are used, not held.
  use(ref) {
    return ref.use?.() ?? false;
  }

  interactables() {
    const list = [];
    if (this.notes)
      list.push({
        kind: "use",
        box: this.notes.box,
        ref: this.notes,
        prompt: "read",
      });
    for (const memory of this.memories)
      if (memory.lit && !memory.found?.())
        list.push({
          kind: "use",
          box: memory.box,
          ref: memory,
          prompt: "relic:Read the stone memory",
        });
    for (const m of this.mirrors)
      list.push({ kind: "mirror", box: m.box, ref: m });
    for (const b of this.blocks)
      list.push({ kind: "block", box: b.box, ref: b });
    return list;
  }

  update(dt) {
    for (const mv of this.moving) {
      mv.t = Math.min(1, mv.t + dt / mv.duration);
      const k = mv.t * mv.t * (3 - 2 * mv.t);
      const x = mv.from.x + (mv.to.x - mv.from.x) * k,
        z = mv.from.z + (mv.to.z - mv.from.z) * k;
      const b = mv.block;
      b.mesh.position.set(x, 0, z);
      Object.assign(b.box, {
        minX: x - 0.98,
        maxX: x + 0.98,
        minZ: z - 0.98,
        maxZ: z + 0.98,
      });
    }
    this.moving = this.moving.filter((mv) => mv.t < 1);
    for (const m of this.mirrors) m.mesh.rotation.y = m.yaw;
    this.time = (this.time || 0) + dt;
    for (const s of this.receivers) {
      if (s.lit) continue;
      const k = Math.min(1, s.charge / 0.45);
      const idle = 0.12 + 0.08 * Math.sin(this.time * 2.2 + s.x);
      for (const m of s.lensMats) m.emissiveIntensity = idle + k * 2.4;
    }
    for (const f of this.fires || []) {
      const t = this.time + f.seed;
      const flick =
        0.8 +
        Math.sin(t * 13) * 0.08 +
        Math.sin(t * 23.7) * 0.06 +
        Math.sin(t * 5.3) * 0.06;
      f.light.intensity = 6 * flick;
      f.tongues.forEach((c, k) => {
        c.scale.set(
          0.85 + Math.sin(t * (7 + k) + k) * 0.12,
          flick * (0.9 + Math.sin(t * (9 + k * 2)) * 0.15),
          1,
        );
      });
    }
  }
}

function shadeRavine(material) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  const strength = { value: 0.9 };
  material.userData.ravineShade = strength;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uRavineShade = strength;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uRavineShade;",
      )
      .replace(
        "#include <opaque_fragment>",
        `
        float ravine = 1.0 - texture2D(uAO, (vFDWorld.xz - uAOBox.xy) / uAOBox.zw).a;
        float depth = pow(1.0 - smoothstep(-8.0, 5.5, vFDWorld.y), 1.4);
        float wall = 1.0 - smoothstep(0.45, 0.85, abs(normalize(vFDNormal).y));
        float bottom = 1.0 - smoothstep(-7.0, -5.0, vFDWorld.y);
        outgoingLight *= mix(vec3(1.0), vec3(0.07, 0.053, 0.04),
          ravine * depth * max(wall, bottom) * uRavineShade);
        #include <opaque_fragment>
      `,
      );
  };
  material.customProgramCacheKey = () =>
    key.call(material) + "|fd-court-depth-1";
}

// Procedural metal surfaces rust and dent everything metallic; a polished mirror face must
// stay smooth, so it keeps its flat material.
function keepPolish(root) {
  root.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || m.metalness < 0.95 || m.roughness > 0.3) return;
    o.material = m.clone();
    o.material.map = o.material.roughnessMap = o.material.normalMap = null;
    o.material.needsUpdate = true;
  });
}

// --- stand-ins until the generated assets load ------------------------------------------
const flat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

function fallbackBlock() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 1.9, 1.9),
    flat(0xb57f4f),
  );
  m.position.y = 0.95;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

function fallbackMirror() {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.62, 0.55, 20),
    flat(0xb57f4f),
  );
  drum.position.y = 0.275;
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 0.08, 28),
    flat(0xe0b56a, { metalness: 1, roughness: 0.18 }),
  );
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 1.3;
  const fork = new THREE.Mesh(
    new THREE.BoxGeometry(1.36, 0.1, 0.12),
    flat(0x9a6a35, { metalness: 0.8 }),
  );
  fork.position.y = 0.62;
  for (const o of [drum, disc, fork]) {
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  return g;
}

function fallbackFacade({ x, z }) {
  const g = new THREE.Group();
  const m = flat(0xb57f4f);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 13, 3), m);
  wall.position.set(x, 6.5, z + 1.5);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 6, 0.2),
    flat(0x140d09),
  );
  door.position.set(x, 3, z + 3.02);
  for (const o of [wall, door]) {
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  return g;
}

function fallbackColossus({ x, z }) {
  const g = new THREE.Group();
  const m = flat(0xb57f4f);
  for (const [w, h, d, y, oz] of [
    [6, 4, 8, 2, 0],
    [4, 6, 3, 7, -1.5],
    [2.2, 2.6, 2.2, 11.3, -1.2],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z + oz);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
  }
  return g;
}

function fallbackStela() {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.4, 0.6),
    flat(0xb57f4f),
  );
  slab.position.y = 1.2;
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 24),
    flat(0x1d5f63, { emissive: 0x000000 }),
  );
  lens.position.set(0, 1.3, 0.301);
  lens.name = "lens";
  for (const o of [slab, lens]) {
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  g.userData.parts = { lens };
  return g;
}

// A soft flame: hot white core, orange body, fading to nothing at the tips and edges.
function flameMaterial() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 104, 2, 32, 80, 64);
  g.addColorStop(0, "rgba(255,250,220,1)");
  g.addColorStop(0.25, "rgba(255,190,90,0.9)");
  g.addColorStop(0.6, "rgba(230,90,30,0.45)");
  g.addColorStop(1, "rgba(120,30,10,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.bezierCurveTo(52, 50, 62, 90, 32, 126);
  ctx.bezierCurveTo(2, 90, 12, 50, 32, 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    map: t,
    color: new THREE.Color(2.2, 1.6, 1.0),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
}
