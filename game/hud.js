import * as THREE from "three";
import { svg } from "./glyph-icons.js";
import { t } from "./i18n.js";

// Where the objective markers stood on the last frame, for the speech bubbles to keep clear of.
export const markerSpots = [];

// Prompts that offer something to use; they carry the ring that marks such things.
const USES = new Set([
  "turn",
  "grab",
  "take",
  "take-pistols",
  "read",
  "read-mira",
  "talk",
  "shield",
]);

// Shapes that tell the kinds of mark apart without their colours.
const KINDS = {
  goal: "",
  danger:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2Z"/><path class="cut" d="M12 9v5M12 16.5v.5"/></svg>',
  use: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle class="cut" cx="12" cy="12" r="2.5"/></svg>',
};

// Everything drawn over the game: the objective, the gate address, a marker on the next thing
// to reach, one-time control cards, the context prompt, composure pips, and the cinematic
// overlays. Controls are named for the device in use, with the printed key labels of the
// current keyboard layout.

export class Hud {
  constructor(input, settings) {
    this.input = input;
    this.settings = settings;
    this.el = (id) => document.getElementById(id);
    this.lastPrompt = null;
    this.promptCode = "";
    this.hintPrompt = null;
    this.markerEls = [];
    this.markerSpots = markerSpots;
    this.targets = [];
    this.v = new THREE.Vector3();
    this.hintTimer = null;
    this.hintQueue = [];
    this.queueTimer = null;
    this.hintShown = 0;
    this.address = [];
    this.markerPanels = [
      "objective-box",
      "address",
      "health",
      "breath",
      "boss",
      "relic-toast",
      "prompt",
      "hint",
      "subtitle",
    ].map(this.el);
  }

  // A control named for the device in use: <kbd>E</kbd>, <kbd>X</kbd> on a gamepad.
  k(action) {
    return `<kbd data-control="${action}">${this.input.label(action)}</kbd>`;
  }

  keys(...codes) {
    return codes
      .map((c) => `<kbd data-key="${c}">${this.input.keyLabel(c)}</kbd>`)
      .join("");
  }

  // "press E", or "tap Use" on a touch screen, so a key's label never reads as a word of the
  // sentence (an AZERTY roll key prints A).
  press(action, capital = false) {
    const key = this.k(action);
    if (this.input.usingTouch)
      return capital ? t("Tap {key}", { key }) : t("tap {key}", { key });
    return capital ? t("Press {key}", { key }) : t("press {key}", { key });
  }

  show() {
    this.el("hud").hidden = false;
  }

  hide() {
    this.el("hud").hidden = true;
    this.clearDamage();
    this.clearHint();
    this.setMarkers([]);
    this.clearChapter();
  }

  // --- objective ------------------------------------------------------------------------
  objective(text, sub = "") {
    const box = this.el("objective-box");
    const changed = text !== this.lastObjective;
    this.lastObjective = text;
    this.el("objective").textContent = text || "";
    this.el("objective-sub").textContent = sub || "";
    box.classList.toggle("empty", !text);
    if (changed && text) {
      box.classList.remove("fresh");
      void box.offsetWidth;
      box.classList.add("fresh");
    }
  }

  sub(text) {
    this.el("objective-sub").textContent = text || "";
  }

  // --- the gate address ---------------------------------------------------------------------
  setAddress(kinds) {
    this.address = kinds;
    document.querySelectorAll("#address .glyph").forEach((g, i) => {
      g.innerHTML = svg(kinds[i] ?? "unknown");
      g.dataset.kind = kinds[i] ?? "unknown";
      g.classList.remove("lit");
    });
  }

  light(kind) {
    document
      .querySelector(`#address .glyph[data-kind="${kind}"]`)
      ?.classList.add("lit");
  }

  // --- markers ------------------------------------------------------------------------------
  // `targets` are world positions (Vector3 or functions returning one), or `{ at, glyph, kind }`
  // for a marker that wears the glyph of what it points at. The kind gives the shape as well as
  // the colour: a diamond for a goal (the default), a triangle for danger, a ring for something
  // to use.
  setMarkers(targets) {
    this.targets = targets || [];
    while (this.markerEls.length < this.targets.length) {
      const m = document.createElement("div");
      m.className = "marker";
      m.innerHTML =
        '<span class="arrow"></span><span class="diamond"></span><span class="dist"></span>';
      this.el("markers").appendChild(m);
      this.markerEls.push(m);
      this.markerSpots.push({
        x: 0,
        y: 0,
        on: false,
        near: false,
        edge: false,
      });
    }
    this.markerEls.forEach((m, i) => {
      m.hidden = i >= this.targets.length;
      this.markerSpots[i].on = false;
      const glyph = this.targets[i]?.glyph || "";
      const kind = KINDS[this.targets[i]?.kind] ? this.targets[i].kind : "goal";
      if (m.dataset.glyph === glyph && m.dataset.kind === kind) return;
      m.dataset.glyph = glyph;
      m.dataset.kind = kind;
      m.classList.toggle("glyph", !!glyph);
      m.children[1].innerHTML = glyph
        ? `<span class="glyph-mark">${svg(glyph)}</span>`
        : KINDS[kind];
    });
  }

  // The kit and pace buttons come from the equipment UI, built after the HUD: a control card
  // above them pushes marks down, which must not land on them either.
  obstaclePanels() {
    if (this.allPanels) return this.allPanels;
    const kit = ["pace-status", "equipment-status"].map(this.el);
    if (!kit.every(Boolean)) return this.markerPanels;
    return (this.allPanels = [...this.markerPanels, ...kit]);
  }

  markerObstacles(w, h) {
    const panels = this.obstaclePanels();
    const key = [
      w,
      h,
      document.body.className,
      document.fonts.status,
      this.el("hud").hidden,
      this.el("pace-status")?.hidden,
      ...panels.map(
        (el) =>
          `${el.hidden}:${el.className}:${el.textContent}:${el.children.length}:${el.style.bottom}`,
      ),
    ].join("|");
    if (key === this.markerBoundsKey) return this.markerBounds;
    this.markerBoundsKey = key;
    this.markerBounds = panels
      .flatMap((el) => {
        if (
          el.hidden ||
          el.classList.contains("empty") ||
          (["relic-toast", "prompt", "hint", "subtitle"].includes(el.id) &&
            !el.classList.contains("on"))
        )
          return [];
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden")
          return [];
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return [];
        const dx =
          el.id === "objective-box" && style.transform !== "none"
            ? new DOMMatrixReadOnly(style.transform).m41
            : 0;
        return [
          {
            left: r.left - dx - 36,
            right: r.right - dx + 36,
            top: r.top - 36,
            bottom: r.bottom + 36,
          },
        ];
      })
      .sort((a, b) => a.top - b.top);
    return this.markerBounds;
  }

  updateMarkers(camera, from, height) {
    const w = innerWidth,
      h = innerHeight;
    const on = this.settings.markers;
    const obstacles =
      on && this.targets.length ? this.markerObstacles(w, h) : [];
    const spots = this.markerSpots;
    this.targets.forEach((t, i) => {
      const spot = spots[i];
      const at = t?.at ?? t;
      const p = typeof at === "function" ? at() : at;
      spot.on = !!(on && p);
      if (!spot.on) return;
      const dist = from
        ? Math.hypot(
            p.x - from.x,
            p.z - from.z,
            Number.isFinite(height) ? p.y - height : 0,
          )
        : 99;
      const v = this.v.copy(p).project(camera);
      let x = v.x,
        y = v.y;
      const behind = v.z > 1;
      if (behind) {
        x = -x;
        y = -y;
      }
      const edge = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.82;
      if (edge) {
        const k = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.82, 1e-3);
        x /= k;
        y /= k;
        if (behind && Math.abs(y) < 0.82 && Math.abs(x) < 0.9) y = -0.82;
      }
      const sx = (x * 0.5 + 0.5) * w,
        projectedY = (-y * 0.5 + 0.5) * h;
      let sy = projectedY;
      const blockers = obstacles.filter((r) => sx > r.left && sx < r.right);
      if (blockers.some((r) => sy > r.top && sy < r.bottom)) {
        const candidates = blockers
          .flatMap((r) => [r.top, r.bottom])
          .filter(
            (candidate) =>
              candidate >= 36 &&
              candidate <= h - 36 &&
              blockers.every(
                (r) => candidate <= r.top || candidate >= r.bottom,
              ),
          );
        if (candidates.length)
          sy = candidates.reduce((best, candidate) =>
            Math.abs(candidate - projectedY) < Math.abs(best - projectedY)
              ? candidate
              : best,
          );
      }
      spot.x = sx;
      spot.y = sy;
      spot.edge = edge;
      spot.pointed = edge || sy !== projectedY;
      spot.angle = edge
        ? (-Math.atan2(y, x) * 180) / Math.PI + 90
        : sy < projectedY
          ? 180
          : 0;
      spot.dist = dist;
      spot.near = dist < 2.2 && !edge;
    });
    this.separateMarkers(w, h);
    this.targets.forEach((t, i) => {
      const m = this.markerEls[i],
        spot = spots[i];
      if (!spot.on) {
        m.style.opacity = 0;
        return;
      }
      m.classList.toggle("edge", spot.pointed);
      m.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px) translate(-50%, -50%)`;
      // An arrow pointing down would sit on the distance, which then moves above the mark; the
      // arrow tucks in so the mark still reaches no further below than the panels allow for.
      const down =
        spot.pointed && Math.cos((spot.angle * Math.PI) / 180) < -0.2;
      m.classList.toggle("flip", down);
      if (spot.pointed)
        m.firstChild.style.transform = `rotate(${spot.angle}deg) translateY(-${(m.classList.contains("glyph") ? 22 : 18) - (down ? 4 : 0)}px)`;
      const text = spot.dist < 99 ? `${Math.round(spot.dist)} m` : "";
      if (m.lastChild.textContent !== text) m.lastChild.textContent = text;
      m.style.opacity = spot.near ? 0 : 1;
    });
  }

  // Marks that land on one another, at a screen edge most often, spread apart: along the edge
  // they are pinned to, otherwise the shorter way.
  separateMarkers(w, h) {
    const spots = this.markerSpots,
      n = this.targets.length;
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = spots[i],
            b = spots[j];
          if (!a.on || !b.on || a.near || b.near) continue;
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const px = 44 - Math.abs(dx),
            py = 50 - Math.abs(dy);
          if (px <= 0 || py <= 0) continue;
          const pinned = a.edge && b.edge;
          const sides =
            pinned &&
            (Math.min(a.x, b.x) < w * 0.1 || Math.max(a.x, b.x) > w * 0.9);
          const ends =
            pinned &&
            (Math.min(a.y, b.y) < h * 0.13 || Math.max(a.y, b.y) > h * 0.87);
          // Spread evenly, unless one of the pair would be pushed into a panel: then the other
          // goes the whole way.
          if (sides || (!ends && py <= px)) {
            const s = (dy < 0 ? -py : py) / 2;
            if (this.blockedAt(b.x, b.y + s)) a.y -= 2 * s;
            else if (this.blockedAt(a.x, a.y - s)) b.y += 2 * s;
            else {
              a.y -= s;
              b.y += s;
            }
          } else {
            const s = (dx < 0 ? -px : px) / 2;
            if (this.blockedAt(b.x + s, b.y)) a.x -= 2 * s;
            else if (this.blockedAt(a.x - s, a.y)) b.x += 2 * s;
            else {
              a.x -= s;
              b.x += s;
            }
          }
        }
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      s.x = Math.min(w - 24, Math.max(24, s.x));
      s.y = Math.min(h - 30, Math.max(30, s.y));
    }
  }

  blockedAt(x, y) {
    const list = this.markerBounds || [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (x > r.left && x < r.right && y > r.top && y < r.bottom) return true;
    }
    return false;
  }

  // --- control cards --------------------------------------------------------------------------
  // With `queue`, a card waits until the one showing has had six seconds to be read.
  hint(
    title,
    html,
    duration = 8,
    { replacesPrompt = null, queue = false } = {},
  ) {
    if (!this.settings.hints) return;
    const card = { title, html, duration, replacesPrompt };
    if (queue && this.el("hint").classList.contains("on")) {
      this.hintQueue.push(card);
      this.nextHint();
    } else this.showHint(card);
  }

  showHint({ title, html, duration, replacesPrompt }) {
    const el = this.el("hint");
    el.querySelector(".hint-title").textContent = title;
    el.querySelector(".hint-body").innerHTML = html;
    el.classList.add("on");
    this.hintShown = performance.now();
    this.hintPrompt = replacesPrompt;
    this.lastPrompt = null;
    this.prompt(this.promptCode);
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.clearHint(false), duration * 1000);
  }

  nextHint() {
    if (this.queueTimer || !this.hintQueue.length) return;
    this.queueTimer = setTimeout(
      () => {
        this.queueTimer = null;
        const card = this.hintQueue.shift();
        if (card) this.showHint(card);
        this.nextHint();
      },
      Math.max(0, this.hintShown + 6000 - performance.now()),
    );
  }

  // The twin pistols' controls, worded for the device in use.
  pistolsHint() {
    const keys = {
      kit: this.k("inventory"),
      pistols: this.k("pistols"),
      aim: this.k("aim"),
      fire: this.k("fire"),
      reload: this.k("reload"),
    };
    const toggle = this.settings.aimMode === "toggle";
    const body = this.input.usingTouch
      ? t(
          "Tap {kit} and choose Twin pistols. Hold {fire} to aim and shoot; {kit} also reloads.",
          keys,
        )
      : this.input.usingPad
        ? toggle
          ? t(
              "Press {kit} to open the kit and draw them. Press {aim} to aim, then press {fire} to fire and {reload} to reload.",
              keys,
            )
          : t(
              "Press {kit} to open the kit and draw them. Hold {aim} to aim, then press {fire} to fire and {reload} to reload.",
              keys,
            )
        : toggle
          ? t(
              "Press {pistols} or {kit} to draw them. Press {aim} to aim, then press {fire} to fire and {reload} to reload.",
              keys,
            )
          : t(
              "Press {pistols} or {kit} to draw them. Hold {aim} to aim, then press {fire} to fire and {reload} to reload.",
              keys,
            );
    this.hint(
      t("Mira's pistols"),
      t("{controls} Only bullets wound; the orb stuns.", { controls: body }),
      11,
    );
  }

  // A relic found: a card of its own, so neither it nor a control card hides the other, and
  // shown even with the control cards turned off.
  relic(name, line, count, total) {
    const el = this.el("relic-toast");
    el.querySelector(".kicker").textContent = t(
      "Relic found · {count} of {total}",
      { count, total },
    );
    el.querySelector(".name").textContent = name;
    el.querySelector(".line").textContent = line;
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
    clearTimeout(this.relicTimer);
    this.relicTimer = setTimeout(() => el.classList.remove("on"), 7000);
  }

  // A card's own time running out lets a queued one follow; any other clearing drops the queue.
  clearHint(flush = true) {
    clearTimeout(this.hintTimer);
    if (flush) {
      clearTimeout(this.queueTimer);
      this.queueTimer = null;
      this.hintQueue.length = 0;
      this.quiet = null;
    }
    this.el("hint").classList.remove("on");
    this.hintPrompt = null;
    this.prompt(this.promptCode);
    this.liftSubtitle(false);
  }

  // A line of narration climbs above a control card only where the card would cover it. Layout
  // boxes, not transforms: the card may still be sliding in.
  liftSubtitle(on) {
    const line = this.el("subtitle");
    line.style.bottom = "";
    if (!on) return;
    const card = this.el("hint");
    const bottom = line.offsetTop + line.offsetHeight;
    if (
      card.offsetLeft < line.offsetLeft + line.offsetWidth &&
      card.offsetLeft + card.offsetWidth > line.offsetLeft &&
      card.offsetTop + card.offsetHeight > bottom - 60
    )
      line.style.bottom = `${innerHeight - card.offsetTop + 14}px`;
  }

  // --- the context prompt ----------------------------------------------------------------------
  prompt(code) {
    this.promptCode = code;
    const hint = this.el("hint");
    const covered = this.hintPrompt === code && hint.classList.contains("on");
    const context = [
      code,
      covered,
      this.quiet,
      innerWidth,
      innerHeight,
      this.input.version,
      this.input.label("jump"),
      this.input.label("interact"),
      this.input.label("drop"),
      this.input.moveLabel(),
    ].join("|");
    if (context === this.lastPrompt) return;
    this.lastPrompt = context;
    for (const key of hint.querySelectorAll("kbd[data-control], kbd[data-key]"))
      key.textContent = key.dataset.control
        ? this.input.label(key.dataset.control)
        : this.input.keyLabel(key.dataset.key);
    const keys = {
      interact: this.k("interact"),
      drop: this.k("drop"),
      jump: this.k("jump"),
      sides: this.keys("KeyA", "KeyD"),
      forward: this.keys("KeyW"),
      back: this.keys("KeyS"),
      move: this.keys("KeyW", "KeyA", "KeyS", "KeyD"),
      swing: this.keys("KeyW", "KeyS"),
    };
    const lines = {
      turn: () => t("Hold {interact} to turn the mirror", keys),
      grab: () => t("Hold {interact} to grab the block", keys),
      block: () =>
        t("Push {forward} or pull {back} while holding {interact}", keys),
      turning: () =>
        t("Steer {sides} to turn · release {interact} to let go", keys),
      hang: () =>
        t("{sides} shimmy · {forward} climb · {drop} to let go", keys),
      wall: () => t("{move} climb · {jump} leap · {drop} let go", keys),
      // A touch screen's button is already called Hang.
      edge: () =>
        this.input.usingTouch
          ? t("{drop} from the edge", keys)
          : t("{drop} Hang from the edge", keys),
      take: () => t("{interact} Take Mira's relay orb", keys),
      "take-pistols": () => t("{interact} Take Mira's pistols", keys),
      read: () => t("{interact} Read the expedition's notes", keys),
      "read-mira": () => t("{interact} Read Mira's journal", keys),
      talk: () => t("{interact} Talk to the clerk", keys),
      swim: () => t("Look up or down, then swim toward the reticle"),
      shield: () => t("{interact} Activate the air shield", keys),
      swing: () => t("{swing} swing higher · {jump} let go", keys),
    };
    let text = lines[code]?.();
    // A relic names itself: "relic:Take the radio".
    if (!text && code?.startsWith("relic:"))
      text = t("{interact} {action}", { ...keys, action: code.slice(6) });
    // A tutorial step can keep back a prompt that would contradict it.
    if (covered || this.quiet?.includes(code)) text = "";
    const p = this.el("prompt");
    if (text) p.innerHTML = text;
    p.classList.toggle("on", !!text);
    p.classList.toggle(
      "use",
      !!text && (USES.has(code) || code.startsWith("relic:")),
    );
    document.body.style.setProperty(
      "--prompt-height",
      `${text ? p.offsetHeight : 0}px`,
    );
    this.liftSubtitle(hint.classList.contains("on"));
  }

  // --- the story's own voice ---------------------------------------------------------------------
  // A line of narration under the picture, over cinematics as well as play. A `speaker`
  // labels a voiced line; the explorer's own thoughts carry none.
  subtitle(text, seconds = 4, speaker = "") {
    const el = this.el("subtitle");
    el.textContent = text;
    if (speaker) {
      const label = document.createElement("span");
      label.className = "speaker";
      label.textContent = speaker;
      el.prepend(label);
    }
    el.classList.toggle("voiced", !!speaker);
    el.classList.add("on");
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = setTimeout(
      () => el.classList.remove("on"),
      seconds * 1000,
    );
  }

  clearSubtitle() {
    clearTimeout(this.subtitleTimer);
    this.el("subtitle").classList.remove("on");
    this.el("subtitle").textContent = "";
  }

  // A sheet over the game: the first expedition's field notes, or Mira's journal.
  showNotes(on, which = "first") {
    const el = this.el("notes");
    if (on) {
      el.querySelectorAll("[data-note]").forEach(
        (a) => (a.hidden = a.dataset.note !== which),
      );
      el.querySelectorAll("[data-glyph]").forEach(
        (g) => (g.innerHTML = svg(g.dataset.glyph)),
      );
      const key = this.k("interact");
      const help = this.input.usingTouch
        ? which === "mira"
          ? t("Tap to put it back")
          : t("Tap to put them back")
        : which === "mira"
          ? t("{key} or <kbd>Esc</kbd> to put it back", { key })
          : t("{key} or <kbd>Esc</kbd> to put them back", { key });
      el.querySelectorAll("[data-help]").forEach((h) => (h.innerHTML = help));
    }
    el.hidden = !on;
  }

  // --- composure --------------------------------------------------------------------------------
  // A pip can be half spent; pips that come back fill one after another.
  health(value, max) {
    const el = this.el("health");
    el.hidden = false;
    if (this.lastHealth === value && el.children.length === max) return;
    const before = this.lastHealth;
    const hurt = before !== undefined && value < before;
    this.lastHealth = value;
    if (el.children.length !== max) {
      el.innerHTML = "";
      for (let i = 0; i < max; i++)
        el.appendChild(document.createElement("span"));
    }
    let order = 0;
    [...el.children].forEach((pip, i) => {
      if (hurt) pip.classList.remove("refill");
      const fill = Math.max(0, Math.min(1, value - i));
      pip.classList.toggle("spent", fill <= 0);
      pip.classList.toggle("half", fill > 0 && fill < 1);
      if (before === undefined || fill <= Math.max(0, Math.min(1, before - i)))
        return;
      pip.classList.remove("refill");
      void pip.offsetWidth;
      pip.style.animationDelay = `${order++ * 0.16}s`;
      pip.classList.add("refill");
    });
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", t("{value} of {max} health", { value, max }));
    if (hurt) this.damage();
  }

  damage() {
    const now = performance.now();
    if (now - (this.lastDamage ?? -Infinity) < 100) return;
    this.lastDamage = now;
    clearTimeout(this.damageTimer);
    const hud = this.el("hud"),
      health = this.el("health");
    hud.classList.remove("hurt");
    health.classList.remove("hit");
    void health.offsetWidth;
    hud.classList.add("hurt");
    health.classList.add("hit");
    this.damageTimer = setTimeout(() => this.clearDamage(), 800);
  }

  clearDamage() {
    clearTimeout(this.damageTimer);
    this.el("hud").classList.remove("hurt");
    this.el("health").classList.remove("hit");
  }

  hideHealth() {
    this.el("health").hidden = true;
    this.lastHealth = undefined;
    this.clearDamage();
  }

  breath(remaining, capacity, submerged) {
    const el = this.el("breath");
    const ratio =
      capacity > 0 ? Math.max(0, Math.min(1, remaining / capacity)) : 1;
    el.hidden = capacity <= 0 || (!submerged && ratio >= 1);
    if (el.hidden) return;
    const seconds = Math.ceil(remaining);
    el.classList.toggle("low", submerged && ratio < 0.25);
    el.classList.toggle("recovering", !submerged);
    this.el("breath-label").textContent = submerged
      ? t("Breath")
      : t("Recovering breath");
    this.el("breath-time").textContent = t("{n} s", { n: seconds });
    this.el("breath-fill").style.transform = `scaleX(${ratio})`;
    const meter = this.el("breath-meter");
    meter.setAttribute("aria-valuemax", String(capacity));
    meter.setAttribute("aria-valuenow", String(seconds));
    meter.setAttribute(
      "aria-valuetext",
      t("{n} seconds of breath", { n: seconds }),
    );
  }

  boss(name, remaining, max, phase = "") {
    const el = this.el("boss");
    el.hidden = false;
    this.el("boss-name").textContent = name;
    this.el("boss-phase").textContent = phase;
    const meter = this.el("boss-meter");
    meter.setAttribute("aria-valuemax", String(max));
    meter.setAttribute("aria-valuenow", String(remaining));
    this.el("boss-fill").style.transform =
      `scaleX(${Math.max(0, Math.min(1, remaining / max))})`;
  }

  hideBoss() {
    this.el("boss").hidden = true;
  }

  // --- cinematic overlays -------------------------------------------------------------------------
  letterbox(on, skippable = false) {
    const box = this.el("letterbox");
    box.classList.toggle("on", on);
    this.el("hud").style.opacity = on ? 0 : 1;
    const skip = box.querySelector(".cine-skip");
    const text = this.input.usingTouch
      ? t("Tap to skip")
      : this.input.usingPad
        ? t("<kbd>A</kbd> skip")
        : t("<kbd>Enter</kbd> skip");
    if (skip.dataset.text !== text) skip.innerHTML = skip.dataset.text = text;
    skip.classList.toggle("on", on && skippable);
  }

  chapter(kicker, title, sub = "", seconds = 4.5) {
    const c = this.el("chapter-card");
    this.el("chapter-name").textContent = `${kicker} · ${title}`;
    this.el("chapter-name").hidden = true;
    this.el("objective-box").classList.remove("chapter-compact");
    c.classList.remove("compact");
    c.setAttribute("aria-hidden", "false");
    c.querySelector(".kicker").textContent = kicker;
    c.querySelector("h2").textContent = title;
    c.querySelector(".sub").textContent = sub;
    c.classList.add("on");
    clearTimeout(this.chapterTimer);
    this.chapterTimer = setTimeout(() => this.clearChapter(), seconds * 1000);
  }

  compactChapter() {
    const c = this.el("chapter-card");
    if (!c.classList.contains("on") || c.classList.contains("compact")) return;
    c.classList.add("compact");
    c.setAttribute("aria-hidden", "true");
    this.el("chapter-name").hidden = false;
    this.el("objective-box").classList.add("chapter-compact");
  }

  // At once, without the fade: the card must not linger behind the title menu.
  clearChapter() {
    clearTimeout(this.chapterTimer);
    const c = this.el("chapter-card");
    c.style.transition = "none";
    c.classList.remove("on");
    c.classList.remove("compact");
    c.setAttribute("aria-hidden", "true");
    this.el("chapter-name").hidden = true;
    this.el("objective-box").classList.remove("chapter-compact");
    void c.offsetWidth;
    c.style.transition = "";
  }

  // The light of a crossing: a bloom of white and turquoise that covers the swap of worlds.
  warp() {
    const w = this.el("warp");
    w.classList.remove("go");
    void w.offsetWidth;
    w.classList.add("go");
  }

  processed(done) {
    const el = this.el("processed");
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    setTimeout(() => {
      el.hidden = true;
      done();
    }, 1900);
  }

  // A short dip to black with a line of text, so a respawn reads as a consequence.
  blackout(text, hold = 650) {
    const f = this.el("fade");
    this.el("fade-line").textContent = text;
    f.classList.add("dark");
    f.style.opacity = 1;
    setTimeout(() => {
      f.style.opacity = 0;
      setTimeout(() => f.classList.remove("dark"), 400);
    }, hold);
  }

  flash(strength = 0.6) {
    const f = this.el("fade");
    f.classList.remove("dark");
    // With reduced motion a flash is a soft glow.
    f.style.opacity = this.settings.reduceMotion ? strength * 0.35 : strength;
    setTimeout(() => (f.style.opacity = 0), 120);
  }

  fadeTo(opacity, dark = true) {
    const f = this.el("fade");
    f.classList.toggle("dark", dark);
    this.el("fade-line").textContent = "";
    f.style.opacity = opacity;
  }
}
