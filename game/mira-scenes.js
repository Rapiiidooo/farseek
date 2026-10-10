import * as THREE from "three";
import { Shot } from "./story.js";
import { miraVoice } from "./voice.js";
import { t } from "./i18n.js";

// Mira at each crossing: a short scene over what she left, once per expedition. `seconds` is
// each clip's length, and how long a line's subtitle stays if its clip is missing.
export const MIRA_LINES = {
  "radio-1": {
    mode: "radio",
    seconds: 4.18,
    text: t("This is Mira. If you came through the door after us, listen."),
  },
  "radio-2": {
    mode: "radio",
    seconds: 5.72,
    text: t(
      "The Wardens want an address stamped on their three plates, and they only stamp offenders.",
    ),
  },
  "radio-3": {
    mode: "radio",
    seconds: 4.26,
    text: t("They kept my orb at the window. Take it back if you can."),
  },
  "radio-4": {
    mode: "radio",
    seconds: 5.78,
    text: t(
      "We're going on through the far door, past their barrier. Follow the light.",
    ),
  },
  "camp-1": {
    mode: "tape",
    seconds: 6.14,
    text: t(
      "Day fifteen. At first light the isles drift together, and we rope across while they touch.",
    ),
  },
  "camp-2": {
    mode: "tape",
    seconds: 5.97,
    text: t(
      "Every rope parts behind us. Whoever follows will need the builders' bridges.",
    ),
  },
  "camp-3": {
    mode: "tape",
    seconds: 5.46,
    text: t("Camp on the last isle. Nyra would have checked every knot twice."),
  },
  "ice-1": {
    mode: "tape",
    seconds: 3.7,
    text: t("I've cut our sign into the ice, where the snow can't bury it."),
  },
  "ice-2": {
    mode: "tape",
    seconds: 4.21,
    text: t("Don't stop on the thin ice. The arrow points to the ring."),
  },
  "castle-1": {
    mode: "tape",
    seconds: 5.56,
    text: t(
      "I've left the castle's address for whoever follows. It only answers in order.",
    ),
  },
  "castle-2": {
    mode: "tape",
    seconds: 5.85,
    text: t(
      "Water first, then the spiral of roots, then the crescent above the trees.",
    ),
  },
  "castle-3": {
    mode: "tape",
    seconds: 4.36,
    text: t("It's the last puzzle I'll leave you. Beyond it, the sea."),
  },
  "reunion-1": { mode: "live", seconds: 1.45, text: t("Nyra.") },
  "reunion-2": {
    mode: "live",
    seconds: 4.42,
    text: t("I knew you'd follow the light. I kept it burning at every door."),
  },
  "reunion-3a": {
    mode: "live",
    seconds: 4.73,
    text: t(
      "You brought our map. This time, we choose the next crossing together.",
    ),
  },
  "reunion-3b": {
    mode: "live",
    seconds: 4.13,
    text: t("The way home is open. Stay beside me for the next one."),
  },
  "reunion-4": {
    mode: "live",
    seconds: 1.8,
    text: t("Come on. There are more doors."),
  },
};

export const miraLine = (id) => ({ id, ...MIRA_LINES[id] });

// A Shot whose lines are Mira's voice; `beat` names it for the telemetry and route scripts.
export class Beat extends Shot {
  constructor(beat, keys, cues, { hud, sound }) {
    super(keys, [], hud);
    this.beat = beat;
    this.voice = miraVoice(sound);
    this.cues = cues.map(([at, id]) => ({ at, line: miraLine(id) }));
  }

  update(dt, camera) {
    super.update(dt, camera);
    this.voice.alive();
    while (this.cues.length && this.t >= this.cues[0].at)
      this.voice.say(this.cues.shift().line, this.hud);
    if (this.done) this.voice.release();
  }

  skip() {
    this.voice.stop();
    super.skip();
  }
}

// A scene waits for its moment in its world: `ready(hero, t)`, with `t` the seconds spent in
// that world, holds for `after` seconds before `make()` builds the beat.
class Scene {
  constructor(world, id, cues, { ready, make, after = 0 }) {
    this.world = world;
    this.id = id;
    this.cues = cues;
    this.ready = ready;
    this.make = make;
    this.after = after;
    this.reset();
  }

  update(dt, hero, state) {
    const { sound, hud } = this.world.services;
    if (!this.prepared && sound) {
      this.prepared = true;
      miraVoice(sound).prepare(this.cues.map(([, id]) => id));
    }
    this.t += dt;
    if (this.played) {
      this.done ||= state.cinematic !== this.beat;
      return;
    }
    if (
      state.mode !== "play" ||
      state.cinematic ||
      state.crossing ||
      state.processing
    )
      return;
    if (!this.ready(hero, this.t)) {
      this.held = 0;
      return;
    }
    this.held += dt;
    if (this.held < this.after) return;
    this.played = true;
    this.beat = new Beat(this.id, this.make(), this.cues, { hud, sound });
    state.cinematic = this.beat;
  }

  reset() {
    this.t = 0;
    this.held = 0;
    this.played = false;
    this.done = false;
    this.beat = null;
  }
}

const grounded = (hero) => ["ground", "turn"].includes(hero.state);

// --- the checkpoint: her field radio by the arrival, still playing her message -------------
const RADIO = { x: 2.55, z: -9.2, yaw: -0.9 };

export async function radioScene(two) {
  const y = two.world.ground(RADIO.x, RADIO.z, 0.05, 1e4, 0);
  const at = new THREE.Vector3(RADIO.x, Number.isFinite(y) ? y : 0, RADIO.z);
  const radio = await two.assets.make("field_radio");
  if (radio) {
    radio.position.copy(at);
    radio.rotation.y = RADIO.yaw;
    radio.traverse((m) => m.isMesh && (m.castShadow = m.receiveShadow = true));
    two.scene.add(radio);
  }
  two.world.addRound(at.x, at.z, 0.42, at.y - 1, at.y + 0.55, "prop", null, {
    cam: false,
  });
  const g = at.y;
  return new Scene(
    two,
    "radio",
    [
      [0.9, "radio-1"],
      [5.4, "radio-2"],
      [11.4, "radio-3"],
      [16, "radio-4"],
    ],
    {
      ready: (hero, t) =>
        t > 5.6 &&
        two.checkpoint.phase === "arrive" &&
        grounded(hero) &&
        hero.pos.z < -4.5 &&
        hero.pos.z > -24,
      after: 0.3,
      make: () => [
        { at: 0, eye: [0.9, g + 0.95, -7], look: [1.8, g + 0.55, -12] },
        { at: 5.4, eye: [0.9, g + 1.25, -7.2], look: [-1, g + 0.9, -22] },
        { at: 11.4, eye: [0.6, g + 1.9, -9.5], look: [-5.6, g + 1.1, -29] },
        { at: 16, eye: [0.3, g + 2.6, -11.5], look: [0, g + 4, -44] },
        { at: 22.6, eye: [0.2, g + 2.9, -12.6], look: [0, g + 4.2, -44] },
      ],
    },
  );
}

// --- the isles: her last camp, over her journal dictation ----------------------------------
export function campScene(three) {
  const I = three.isles;
  return new Scene(
    three,
    "camp",
    [
      [0.9, "camp-1"],
      [7.4, "camp-2"],
      [13.8, "camp-3"],
    ],
    {
      ready: (hero) => I.on === "camp" && !I.read && grounded(hero),
      after: 2.4,
      make: () => {
        const home = I.isle("camp").collider;
        const y = I.groundAt(home.x, home.z);
        const p = (dx, dy, dz) => [home.x + dx, y + dy, home.z + dz];
        return [
          { at: 0, eye: p(8, 4.4, 10), look: p(-1, 0.4, 1.4) },
          { at: 6.6, eye: p(-6, 3.6, 6.8), look: p(-2.6, 0.6, 1) },
          { at: 13.2, eye: p(6.8, 2.6, 9.4), look: p(2.8, 0.7, 2.6) },
          { at: 19.8, eye: p(5.6, 3.2, 9.2), look: p(0, 1.8, -3.8) },
        ];
      },
    },
  );
}

// --- the frozen reach: her sign and an arrow cut into the ice at the lake shore ------------
const MARK = { x: -5.2, y: 0.3, z: -101.2, size: 3.6, yaw: -0.096 };

export function iceScene(four) {
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(MARK.size, MARK.size).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      map: markTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 0.22,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mark.name = "Mira's sign in the ice";
  mark.position.set(MARK.x, MARK.y + 0.012, MARK.z);
  mark.rotation.y = MARK.yaw;
  mark.receiveShadow = true;
  mark.renderOrder = 1;
  four.scene.add(mark);
  const scene = new Scene(
    four,
    "ice",
    [
      [0.8, "ice-1"],
      [5.2, "ice-2"],
    ],
    {
      ready: (hero) =>
        !four.frozen.freed &&
        grounded(hero) &&
        hero.pos.z < -92.4 &&
        hero.pos.z > -103,
      make: () => [
        { at: 0, eye: [-2.2, 6.4, -89], look: [-4.6, 0.4, -100.8] },
        { at: 4.4, eye: [-3.6, 3.4, -97.4], look: [-5.2, 0.3, -101.2] },
        { at: 8.6, eye: [-4.4, 2.4, -99.2], look: [-1, 1.4, -150] },
        { at: 11, eye: [-4.2, 2.5, -99.6], look: [0, 2.2, -155] },
      ],
    },
  );
  scene.mark = mark;
  return scene;
}

// Her expedition's sign, a crescent cradling a disc as on its banner, and an arrow pointing
// on, cut with a knife into clear ice where she brushed the snow away.
function markTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  let seed = 4127;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const c = size / 2;
  const patch = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 205 + Math.sin(a * 3 + 1.2) * 18 + (rand() - 0.5) * 22;
    patch.push([c + Math.cos(a) * r, c + Math.sin(a) * r * 0.92]);
  }
  const ice = g.createRadialGradient(c, c, 30, c, c, 230);
  ice.addColorStop(0, "rgba(92, 146, 184, 0.95)");
  ice.addColorStop(0.75, "rgba(128, 178, 210, 0.9)");
  ice.addColorStop(1, "rgba(205, 226, 238, 0)");
  g.fillStyle = ice;
  g.beginPath();
  patch.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(91, 155, 189, 0.35)";
  g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2,
      r = 40 + rand() * 120;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    g.lineTo(
      c + Math.cos(a + 0.5) * (r + 50),
      c + Math.sin(a + 0.5) * (r + 50),
    );
    g.stroke();
  }
  for (let i = 0; i < 160; i++) {
    const [x, y] = patch[Math.floor(rand() * patch.length)];
    g.fillStyle = `rgba(240, 246, 250, ${0.5 + rand() * 0.4})`;
    g.beginPath();
    g.arc(
      x + (rand() - 0.5) * 34,
      y + (rand() - 0.5) * 34,
      2 + rand() * 6,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  // Each stroke is cut twice, a little apart, as a blade drawn through ice goes.
  const cut = (path) => {
    for (const [width, colour] of [
      [22, "rgba(40, 84, 116, 0.6)"],
      [14, "rgba(238, 246, 250, 0.97)"],
    ])
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = colour;
        g.lineWidth = width - pass * 2;
        g.lineCap = g.lineJoin = "round";
        g.beginPath();
        path((x, y, i) => {
          const jx = x + (rand() - 0.5) * 3,
            jy = y + (rand() - 0.5) * 3 + (width > 10 ? 2 : 0);
          return i ? g.lineTo(jx, jy) : g.moveTo(jx, jy);
        });
        g.stroke();
      }
  };
  const arc =
    (cx, cy, r, from, to, steps = 18) =>
    (step) => {
      for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        step(cx + Math.cos(a) * r, cy + Math.sin(a) * r, i);
      }
    };
  const line = (points) => (step) =>
    points.forEach(([x, y], i) => step(x, y, i));
  cut(arc(c, 318, 124, 0.16, Math.PI - 0.16));
  cut(arc(c, 292, 100, 0.34, Math.PI - 0.34));
  cut(arc(c, 300, 54, 0, Math.PI * 2, 24));
  cut(
    line([
      [c, 206],
      [c - 3, 130],
      [c + 1, 40],
    ]),
  );
  cut(
    line([
      [c - 62, 100],
      [c + 1, 36],
      [c + 64, 98],
    ]),
  );
  for (const [x, y, dx, dy] of [
    [c + 104, 236, 14, -9],
    [c - 112, 352, -12, 6],
    [c + 30, 412, 18, 4],
  ])
    cut(
      line([
        [x, y],
        [x + dx, y + dy],
      ]),
    );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// --- the Wildwood: the castle's address, the last puzzle she left -------------------------
export function castleScene(five) {
  const L = five.level;
  return new Scene(
    five,
    "castle",
    [
      [0.9, "castle-1"],
      [6.9, "castle-2"],
      [13.2, "castle-3"],
    ],
    {
      ready: (hero) =>
        L.locked[0] &&
        L.locked[1] &&
        !L.ready &&
        L.sequence === 0 &&
        L.guards.every((guard) => guard.group !== 1 || guard.defeated) &&
        hero.pos.z < -180 &&
        grounded(hero),
      after: 3.2,
      make: () => {
        const at = (x, z, up) => [x, L.groundAt(x, z) + up, z];
        const glyph = (p) => at(p.x, p.z, 3.35);
        const [waves, spiral, crescent] = [0, 1, 2].map((i) =>
          L.relays.find((r) => r.index === i),
        );
        const door = five.forest.lastGate?.center;
        const castle = door ? [door.x, door.y + 1.5, door.z] : at(-40, -276, 9);
        return [
          { at: 0, eye: at(-31, -228.5, 4.6), look: at(-31, -246, 2.8) },
          { at: 6.6, eye: at(-33.5, -235.5, 3), look: glyph(waves) },
          { at: 8.4, eye: at(-31.5, -236.5, 3.2), look: glyph(spiral) },
          { at: 10.6, eye: at(-29, -235.5, 3), look: glyph(crescent) },
          { at: 13.4, eye: at(-32, -237, 5.2), look: castle },
          { at: 18.3, eye: at(-32.6, -238.6, 5.6), look: castle },
        ];
      },
    },
  );
}
