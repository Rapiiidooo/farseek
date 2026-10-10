import * as THREE from "three";
import * as COURT from "./court.js";
import { t } from "./i18n.js";

// The guide for the first level: which objective is current, where its marker points, and
// the one-time control cards that teach each move the first time it is needed. Steps follow
// the route in order; reaching a later step's goal skips the ones before it, so a player
// who finds their own way is never told to do what they have done.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const near = (a, b, e = 0.06) => Math.abs(a - b) < e;
const litCount = (level) => level.stelae.filter((s) => s.lit).length;

// A cinematic in world space: the camera eases between keyframes { at, eye, look } from
// wherever it was, and lines of narration come up at their times. Enter or jump skips it.
export class Shot {
  constructor(keys, lines, hud) {
    this.keys = keys;
    this.lines = lines.slice();
    this.hud = hud;
    this.t = 0;
    this.end = keys[keys.length - 1].at;
    this.letterbox = true;
    this.probe = new THREE.PerspectiveCamera();
  }

  update(dt, camera) {
    this.t += dt;
    if (!this.from)
      this.from = {
        pos: camera.position.clone(),
        quat: camera.quaternion.clone(),
      };
    const k = this.keys;
    let i = 0;
    while (i < k.length - 2 && this.t > k[i + 1].at) i++;
    const a = k[i],
      b = k[i + 1];
    const q = smooth(a.at, b.at, this.t);
    this.probe.position.set(...a.eye).lerp(new THREE.Vector3(...b.eye), q);
    this.probe.lookAt(
      new THREE.Vector3(...a.look).lerp(new THREE.Vector3(...b.look), q),
    );
    const blend = smooth(0, 1.2, this.t);
    camera.position.lerpVectors(this.from.pos, this.probe.position, blend);
    camera.quaternion.slerpQuaternions(
      this.from.quat,
      this.probe.quaternion,
      blend,
    );
    while (this.lines.length && this.t >= this.lines[0][0]) {
      const [, text, seconds] = this.lines.shift();
      this.hud.subtitle(text, seconds);
    }
    if (this.t >= this.end) this.done = true;
  }

  skip() {
    this.hud.clearSubtitle();
    this.done = true;
  }
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class CourtStory {
  constructor({ hero, level, beams, gate, hud }) {
    this.hero = hero;
    this.level = level;
    this.beams = beams;
    this.gate = gate;
    this.hud = hud;
    this.shown = new Set();
    this.steps = this.makeSteps();
    this.floorIndex = this.steps.findIndex((s) => s.id === "block");
    this.index = 0;
    this.time = 0;
    this.stepTime = 0;
  }

  makeSteps() {
    const hero = this.hero,
      level = this.level;
    const on = (feet) => hero.state === "ground" && near(hero.feet, feet);
    const floor = () => on(0);
    const home = COURT.BLOCKS[0];
    const lit = () => level.stelae.filter((s) => s.lit).length;
    const moved = () => {
      const b = level.blocks[0];
      return b.x !== home.x || b.z !== home.z;
    };
    const k = (a) => this.hud.k(a);
    const press = (a, capital) => this.hud.press(a, capital);
    const keys = (...c) => this.hud.keys(...c);
    // A second mark on where the light should go next: a ring on a mirror, a stela's glyph.
    const story = this;
    const aim = {
      at: () => story.relayTarget()?.at ?? null,
      get glyph() {
        return story.relayTarget()?.glyph || "";
      },
      get kind() {
        return story.relayTarget()?.glyph ? "goal" : "use";
      },
    };
    return [
      {
        id: "camp",
        objective: t("Find the first expedition"),
        sub: t("Their camp is on this terrace: search it"),
        marker: V(COURT.NOTES.x, COURT.NOTES.y + 0.7, COURT.NOTES.z),
        done: () => this.notesRead,
      },
      {
        id: "gap",
        objective: t("Follow the expedition down into the court"),
        sub: t("Jump the gap to the west platform"),
        marker: V(4, 8.6, 39),
        done: () => on(8) && hero.pos.x < 6.2 && hero.pos.z > 35.8,
        // An offer to hang at the gap's lip would contradict the jump.
        quiet: ["edge"],
        hint: [
          t("Jumping"),
          t(
            "Run at the gap and {press}, held for a full jump. {pace} switches between walking and running.",
            { press: press("jump"), pace: k("pace") },
          ),
        ],
      },
      {
        id: "drop",
        objective: t("Follow the expedition down into the court"),
        sub: t(
          "Hang from the platform's edge, then let go onto the ledge below",
        ),
        marker: V(4, 8.4, 36.1),
        done: () => on(5.5) && hero.pos.x < 6.2 && hero.pos.z > 34,
        hint: [
          t("Hanging"),
          t(
            "Walk to the edge and {press} to hang from it. {press2} again to let go.",
            { press: press("drop"), press2: press("drop", true) },
          ),
        ],
      },
      {
        id: "crack",
        objective: t("Follow the expedition down into the court"),
        sub: t("Jump across the chasm and grab the crack in the wall"),
        marker: V(5, 7.3, 32.1),
        done: () =>
          hero.state === "hang" &&
          near(hero.ledge?.top ?? 0, 7, 0.1) &&
          hero.pos.z > 32,
        hint: [
          t("Grabbing"),
          t(
            "Jump towards the crack with {jump}: the explorer catches any edge within reach. The rope marks the spot.",
            { jump: k("jump") },
          ),
        ],
      },
      {
        id: "climb",
        hintPrompt: "hang",
        objective: t("Follow the expedition down into the court"),
        sub: t("Shimmy right along the crack and climb up"),
        marker: V(9.6, 7.4, 31),
        done: () => on(7) && hero.pos.x > 8 && hero.pos.x < 10,
        hint: [
          t("Climbing"),
          t(
            "{sides} shimmy along the edge · {forward} climb up · {drop} to let go.",
            {
              sides: keys("KeyA", "KeyD"),
              forward: keys("KeyW"),
              drop: k("drop"),
            },
          ),
        ],
      },
      {
        id: "stair",
        objective: t("Follow the expedition down into the court"),
        sub: () =>
          hero.feet > 6.5
            ? t("Walk north to the head of the broken stair")
            : t("Take the broken stair down to the floor"),
        // Straight at the foot of the stair runs off the platform into the sand pit.
        marker: () =>
          hero.feet > 6.5 && hero.pos.z > 28.4
            ? V(9.2, 7.7, 27.2)
            : V(17, 1.3, 27),
        done: () => floor() && hero.pos.z < 34,
      },
      {
        id: "block",
        objective: t("Bring the sunlight to the three stelae"),
        sub: () =>
          moved()
            ? t("Still in the light: pull it clear from the marked side")
            : t(
                "A stone block sits in the sunbeam: pull it out from the marked side",
              ),
        // Its south side, where a pull clears the beam; along the beam it only slides in the light.
        marker: () => {
          const b = level.blocks[0];
          return this.route(V(b.x, 1.2, b.z + 0.95));
        },
        done: () =>
          lit() > 0 || !!this.beams.segments?.some((s) => s.end === "mirror"),
        hint: [
          t("Blocks"),
          t(
            "Stand against the block and hold {interact}, then push {forward} or pull {back}. It slides straight, so pick a side that moves it out of the light.",
            {
              interact: k("interact"),
              forward: keys("KeyW"),
              back: keys("KeyS"),
            },
          ),
        ],
      },
      {
        id: "mirror",
        objective: t("Bring the sunlight to the three stelae"),
        sub: t(
          "Turn the bronze mirror to send the light onto a stela's crystal",
        ),
        marker: () => this.route(this.lastMirror()),
        aim,
        done: () => lit() > 0,
        hint: [
          t("Mirrors"),
          t(
            "Hold {interact} at a mirror and steer {sides} to turn it. It catches when the light lines up.",
            { interact: k("interact"), sides: keys("KeyA", "KeyD") },
          ),
        ],
      },
      {
        id: "more",
        objective: t("Bring the sunlight to the three stelae"),
        sub: () =>
          t(
            "Stelae lit: {lit} of 3. Mirrors can pass the light to each other.",
            { lit: lit() },
          ),
        marker: () => this.route(this.lastMirror()),
        aim,
        done: () => lit() >= 3,
        hint: [
          t("Relaying light"),
          t(
            "A lit mirror can aim at another mirror. Turn the last mirror the light reaches towards a dark stela or the next mirror.",
          ),
        ],
        hintAfter: 3,
      },
      {
        id: "opening",
        objective: "",
        marker: null,
        done: () => this.gate.isOpen,
      },
      {
        id: "enter",
        objective: t("The far door is open"),
        sub: t("Step through it"),
        marker: () =>
          this.route(this.gate.center.clone().setY(this.gate.daisTop + 1.2)),
        done: () => false,
      },
    ];
  }

  // Where the light should go next: each mirror it reaches first lights the nearest dark stela,
  // then passes the light on to a mirror it has not reached. Nothing while a stela is charging.
  relayTarget() {
    const reached = this.beams.hitMirrors;
    if (!reached?.size || this.beams.receiving?.lit === false) return null;
    const from = this.lastMirror();
    const dark = this.level.stelae
      .filter((s) => !s.lit)
      .sort(
        (a, b) =>
          Math.hypot(a.x - from.x, a.z - from.z) -
          Math.hypot(b.x - from.x, b.z - from.z),
      )[0];
    const next = this.level.mirrors.find((m) => !reached.has(m));
    if (dark && (litCount(this.level) < reached.size || !next))
      return { at: V(dark.x, 2.9, dark.z), glyph: dark.glyph };
    return next ? { at: V(next.x, 2.4, next.z) } : null;
  }

  // Marks never point across the sand pit. The third mirror stands on an island in it: a mark
  // across the pit leads first to the floor east of it, where a short running jump crosses
  // either way; from the floor east of the pit, marks to the west lead north round it first.
  route(target) {
    const h = this.hero;
    const island = (x, z) => x > 14 && x < 18 && z > 30 && z < 32;
    const on = island(h.pos.x, h.pos.z) && h.feet > -0.5;
    if (on === island(target.x, target.z)) {
      const east =
        !on && h.pos.x > 18 && h.pos.z > 26.2 && Math.abs(h.feet) < 0.3;
      return east && target.x < 18 ? V(20.5, 0.9, 24.6) : target;
    }
    const ready =
      !on &&
      h.pos.x > 19.4 &&
      h.pos.z > 29.6 &&
      h.pos.z < 32.4 &&
      Math.abs(h.feet) < 0.3;
    return ready ? target : V(21, 0.9, 31);
  }

  // The last mirror the sunlight reaches: the one to turn next.
  lastMirror() {
    let last = null;
    for (const s of this.beams.segments || []) if (s.end === "mirror") last = s;
    if (!last) {
      const m = this.level.mirrors[0];
      return V(m.x, 2.4, m.z);
    }
    return V(last.x1, 2.4, last.z1);
  }

  // The opening shot of a new game: over the court to the ring, then back up to the
  // abandoned camp and down behind the explorer, with two lines of narration.
  introShot() {
    return new Shot(
      [
        { at: 0, eye: [18, 12.5, 30], look: [15, 4.5, 11] },
        { at: 4.2, eye: [16, 7.8, 21], look: [15, 4.5, 11] },
        { at: 7.4, eye: [20.4, 10.1, 36.8], look: [24, 8.8, 40.2] },
        { at: 9.6, eye: [19.5, 10.2, 41.5], look: [19.4, 9.3, 34.3] },
      ],
      [
        [
          0.6,
          t(
            "Mira's last signal came from this ravine. Three weeks of silence.",
          ),
          4.6,
        ],
        [
          5.6,
          t("The first expedition left a way down. Mira followed them."),
          3.8,
        ],
      ],
      this.hud,
    );
  }

  // Keeps control cards back while a line of narration is on screen.
  holdHints(seconds) {
    this.hintHold = this.time + seconds;
  }

  start(chapter) {
    this.hintHold = 0;
    this.index = 0;
    this.stepTime = 0;
    this.time = 0;
    this.notesRead = false;
    if (chapter === "floor")
      this.index = this.steps.findIndex((s) => s.id === "block");
    this.enter();
  }

  get step() {
    return this.steps[this.index];
  }

  enter() {
    const s = this.step;
    this.stepTime = 0;
    // A card about the step just finished would only mislead.
    this.hud.clearHint();
    // The first card waits for the level's title to clear.
    const first = this.time < 4 ? 4.2 - this.time : 0.8;
    this.hintDue =
      s.hint && !this.shown.has(s.id) ? (s.hintAfter ?? first) : null;
    this.refresh();
  }

  refresh() {
    const s = this.step;
    const sub = typeof s.sub === "function" ? s.sub() : s.sub;
    this.hud.objective(s.objective, s.objective ? sub : "");
    this.hud.setMarkers(
      s.marker ? [s.marker, ...(s.aim?.at() ? [s.aim] : [])] : [],
    );
    this.hud.quiet = s.quiet || null;
  }

  update(dt) {
    this.time += dt;
    this.stepTime += dt;
    // Jump past the furthest step whose goal is met; never go back.
    let moved = false;
    for (let j = this.steps.length - 2; j >= this.index; j--)
      if (this.steps[j].done()) {
        this.index = j + 1;
        moved = true;
        break;
      }
    if (moved) this.enter();
    else if (typeof this.step.sub === "function" || this.step.aim)
      this.refresh();
    if (
      this.hintDue !== null &&
      this.stepTime > this.hintDue &&
      this.time >= (this.hintHold ?? 0)
    ) {
      const s = this.step;
      this.shown.add(s.id);
      this.hintDue = null;
      this.hud.hint(s.hint[0], s.hint[1], 9, {
        replacesPrompt: s.hintPrompt,
      });
    }
    const memory = this.level.memories[0];
    if (
      this.gate.isOpen &&
      memory &&
      !memory.lit &&
      !memory.found?.() &&
      !this.shown.has("memory") &&
      this.hero.state === "ground" &&
      Math.hypot(this.hero.pos.x - memory.x, this.hero.pos.z - memory.z) < 6
    ) {
      this.shown.add("memory");
      this.hud.hint(
        t("Stone memory"),
        t(
          "The star keeps an optional memory. Relay sunlight to its lens, then read the stone.",
        ),
        8,
      );
      this.holdHints(8);
    }
  }
}
