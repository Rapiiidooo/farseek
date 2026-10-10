// Keyboard, mouse, gamepad and touch folded into one set of intentions. Keys are read by
// physical position (event.code), so ZQSD on an AZERTY keyboard moves like WASD, and prompts
// ask the layout map for the printed label. The on-screen stick and buttons (touch.js) feed
// `touchMove`, `touchDown` and the `touch:` edges.
import { t } from "./i18n.js";

const MOVE = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};
const ACTIONS = {
  jump: ["Space"],
  interact: ["KeyE", "KeyF"],
  drop: ["KeyC", "ControlLeft"],
  walk: [],
  pace: ["ShiftLeft", "ShiftRight"],
  throw: ["KeyR", "Mouse0"],
  roll: ["KeyQ"],
  aim: ["Mouse2"],
  inventory: ["Tab", "KeyI"],
  orb: ["Digit1"],
  pistols: ["Digit2"],
  reload: ["KeyR", "KeyX"],
  pause: ["Escape", "KeyP"],
  skip: ["Escape", "Enter", "Space"],
  shield: ["KeyV"],
};
const PAD = {
  jump: 0,
  drop: 1,
  interact: 2,
  roll: 5,
  walk: 6,
  throw: 7,
  inventory: 3,
  reload: 4,
  aim: 10,
  pace: 11,
  pause: 9,
  skip: 0,
  shield: 12,
};

// The Controls screen lists these first, in this order; actions other modules add to ACTIONS
// or PAD follow them. `skip` stays fixed: Escape, Enter and the jump keys always skip.
const REMAPPABLE = [
  "forward",
  "back",
  "left",
  "right",
  "jump",
  "interact",
  "drop",
  "pace",
  "walk",
  "roll",
  "throw",
  "aim",
  "reload",
  "inventory",
  "orb",
  "pistols",
  "pause",
];
const FIXED = new Set(["skip"]);
// Escape always pauses and backs out of menus; the browser keeps the rest for itself.
const RESERVED =
  /^(Escape|Meta|OS|ContextMenu|F\d+|PrintScreen|Fn|Lang|Power|Audio|Media|Browser|Launch)/;
// Back, Start and Home on a gamepad stay with the menus and the pause.
const PAD_RESERVED = new Set([8, 9, 16]);
// Actions that share a key on purpose: R links the orb and reloads the pistols.
const SHARED = [["throw", "reload"]];
const PAD_NAMES = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  t("View"),
  t("Start"),
  "L3",
  "R3",
  t("D-pad up"),
  t("D-pad down"),
  t("D-pad left"),
  t("D-pad right"),
  t("Home"),
];
const NAMED = {
  Space: t("Space"),
  Tab: t("Tab"),
  Escape: t("Esc"),
  Enter: t("Enter"),
  NumpadEnter: t("Num Enter"),
  Backspace: t("Backspace"),
  CapsLock: t("Caps Lock"),
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Mouse0: t("Click"),
  Mouse1: t("Middle click"),
  Mouse2: t("Right click"),
  Mouse3: t("Mouse 4"),
  Mouse4: t("Mouse 5"),
};
const SIDED = { Shift: t("Shift"), Control: t("Ctrl"), Alt: t("Alt") };

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.down = new Set();
    this.edges = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.padLook = { x: 0, y: 0 };
    this.padMove = { x: 0, y: 0 };
    this.padDown = new Set();
    this.usingPad = false;
    this.touchMove = { x: 0, y: 0 };
    this.touchDown = new Set();
    this.touchWalk = false;
    this.running = false;
    this.usingTouch = false;
    this.labels = new Map();
    this.dragging = false;
    this.aimLatch = false;
    // Bumped whenever a binding changes, so prompts that cache their keys write them again.
    this.version = 0;
    // Look options and the player's bindings live in the shared settings (store.js).
    this.settings = settings;
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (this.isGameKey(e.code)) e.preventDefault();
      this.down.add(e.code);
      this.edges.add(e.code);
      this.usingPad = false;
      this.usingTouch = false;
    });
    addEventListener("keyup", (e) => this.down.delete(e.code));
    addEventListener("blur", () => this.clear());
    canvas.addEventListener("pointerdown", (e) => {
      this.pointerType = e.pointerType;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (
        e.sourceCapabilities?.firesTouchEvents ||
        this.pointerType === "touch"
      )
        return;
      if (e.button >= 0 && e.button <= 4) {
        if (e.button !== 0 && e.button !== 2) e.preventDefault();
        this.down.add("Mouse" + e.button);
        this.edges.add("Mouse" + e.button);
        this.usingPad = false;
        this.usingTouch = false;
      }
      if (!this.locked && e.button === 2) this.dragging = true;
    });
    addEventListener("mouseup", (e) => {
      // The side buttons would otherwise go back and forward in the history.
      if (e.button >= 3 && this.isGameKey("Mouse" + e.button))
        e.preventDefault();
      this.dragging = false;
      this.down.delete("Mouse" + e.button);
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // Escape releases the pointer before the page sees the key: the release is the pause.
    this.wasLocked = false;
    document.addEventListener("pointerlockchange", () => {
      const locked = this.locked;
      if (this.wasLocked && !locked) this.onUnlock?.();
      this.wasLocked = locked;
    });
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === canvas || this.dragging) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    navigator.keyboard
      ?.getLayoutMap?.()
      .then((map) => {
        map.forEach((key, code) => {
          if (key) this.labels.set(code, key.toUpperCase());
        });
        this.version++;
      })
      .catch(() => {});
  }

  lockPointer() {
    this.canvas.requestPointerLock?.()?.catch?.(() => {});
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  poll() {
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    const before = new Set(this.padDown);
    this.padDown.clear();
    this.padMove.x = this.padMove.y = this.padLook.x = this.padLook.y = 0;
    if (pad) {
      const dead = (v) =>
        Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
      this.padMove.x = dead(pad.axes[0] || 0);
      this.padMove.y = -dead(pad.axes[1] || 0);
      this.padLook.x = dead(pad.axes[2] || 0);
      this.padLook.y = dead(pad.axes[3] || 0);
      for (const [name, index] of Object.entries(this.padTable()))
        if (pad.buttons[index]?.pressed) this.padDown.add(name);
      for (const name of this.padDown)
        if (!before.has(name)) this.edges.add("pad:" + name);
      if (
        this.padDown.size ||
        Math.hypot(this.padMove.x, this.padMove.y) > 0.3
      ) {
        this.usingPad = true;
        this.usingTouch = false;
      }
    }
    // Aiming on a toggle flips at each press and lets go with the pistols.
    if (this.settings?.aimMode !== "toggle" || this.equipment !== "pistols")
      this.aimLatch = false;
    else if (this.pressed("aim")) this.aimLatch = !this.aimLatch;
  }

  // Stick or keys, as x (right) and y (forward), length at most 1.
  get move() {
    const key = (action) => this.binding(action).some((c) => this.down.has(c));
    let x =
      (key("right") ? 1 : 0) -
      (key("left") ? 1 : 0) +
      this.padMove.x +
      this.touchMove.x;
    let y =
      (key("forward") ? 1 : 0) -
      (key("back") ? 1 : 0) +
      this.padMove.y +
      this.touchMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  held(action) {
    if (action === "aim" && this.settings?.aimMode === "toggle")
      return this.aimLatch || this.touchDown.has(action);
    return (
      this.keys(action).some((c) => this.down.has(c)) ||
      this.padDown.has(action) ||
      this.touchDown.has(action)
    );
  }

  get walking() {
    return !this.running || this.held("walk") || this.touchWalk;
  }

  pressed(action) {
    return (
      this.keys(action).some((c) => this.edges.has(c)) ||
      this.edges.has("pad:" + action) ||
      this.edges.has("touch:" + action)
    );
  }

  anyPressed() {
    return this.edges.size > 0;
  }

  // The keys that act now: with the pistols drawn, a key shared with reload reloads instead
  // of firing, and reload does nothing without them.
  keys(action) {
    if (action === "reload" && this.equipment !== "pistols") return [];
    if (action === "throw" && this.equipment === "pistols") return this.fire();
    return this.binding(action);
  }

  fire() {
    const reload = this.binding("reload");
    return this.binding("throw").filter((code) => !reload.includes(code));
  }

  // The keys and mouse buttons bound to an action: the player's own if saved, else the
  // defaults. Pause always keeps Escape.
  binding(action) {
    const saved = this.settings?.bindings?.keys?.[action];
    const list = Array.isArray(saved)
      ? saved
      : MOVE[action] || ACTIONS[action] || [];
    return action === "pause" && !list.includes("Escape")
      ? ["Escape", ...list]
      : list;
  }

  // The gamepad button bound to an action, or undefined.
  padButton(action) {
    const saved = this.settings?.bindings?.pad;
    const index = saved && action in saved ? saved[action] : PAD[action];
    return Number.isInteger(index) ? index : undefined;
  }

  padTable() {
    const table = {};
    for (const action of new Set([
      ...Object.keys(PAD),
      ...Object.keys(this.settings?.bindings?.pad || {}),
    ])) {
      const index = this.padButton(action);
      if (index !== undefined) table[action] = index;
    }
    return table;
  }

  // Every action the Controls screen offers, the known ones first.
  remappable() {
    const extra = [...Object.keys(ACTIONS), ...Object.keys(PAD)].filter(
      (action) => !REMAPPABLE.includes(action) && !FIXED.has(action),
    );
    return [...REMAPPABLE, ...new Set(extra)];
  }

  defaults(action) {
    return {
      keys: [...(MOVE[action] || ACTIONS[action] || [])],
      pad: PAD[action],
    };
  }

  // Whether a key or button may be bound at all, and to which slot of which action.
  bindable(code) {
    return !RESERVED.test(code);
  }

  padBindable(index) {
    return Number.isInteger(index) && !PAD_RESERVED.has(index);
  }

  // Binds `code` to `action` in `slot` (0 or 1). Another action holding the same code takes
  // the code this slot held, so nothing is lost silently; returns what moved.
  assignKey(action, slot, code) {
    const keys = this.savedKeys();
    const list = this.binding(action).filter((c) => c !== "Escape");
    const previous = list[slot] ?? null;
    const moved = [];
    if (code && list.includes(code) && list[slot] !== code) {
      list[list.indexOf(code)] = previous;
    }
    list[slot] = code;
    keys[action] = list.filter(Boolean);
    if (code)
      for (const other of this.remappable()) {
        if (other === action || this.shares(action, other)) continue;
        const theirs = this.binding(other).filter((c) => c !== "Escape");
        const at = theirs.indexOf(code);
        if (at < 0) continue;
        const swap = previous && !theirs.includes(previous) ? previous : null;
        theirs[at] = swap;
        keys[other] = theirs.filter(Boolean);
        moved.push({ action: other, to: swap });
      }
    this.saveBindings({ keys });
    return moved;
  }

  assignPad(action, index) {
    const pad = { ...(this.settings?.bindings?.pad || {}) };
    const previous = this.padButton(action) ?? null;
    const moved = [];
    pad[action] = index;
    if (index !== null)
      for (const other of this.remappable()) {
        if (other === action || this.padButton(other) !== index) continue;
        pad[other] = previous;
        moved.push({ action: other, to: previous });
      }
    this.saveBindings({ pad });
    return moved;
  }

  shares(a, b) {
    return SHARED.some(
      ([x, y]) => (a === x && b === y) || (a === y && b === x),
    );
  }

  savedKeys() {
    return { ...(this.settings?.bindings?.keys || {}) };
  }

  // Keeps only what differs from the defaults; no difference at all leaves no `bindings`.
  saveBindings({ keys, pad }) {
    const next = {
      keys: keys ?? this.savedKeys(),
      pad: pad ?? { ...(this.settings?.bindings?.pad || {}) },
    };
    for (const [action, list] of Object.entries(next.keys)) {
      const base = this.defaults(action).keys.filter((c) => c !== "Escape");
      if (JSON.stringify(list) === JSON.stringify(base))
        delete next.keys[action];
    }
    for (const [action, index] of Object.entries(next.pad))
      if (index === (PAD[action] ?? null)) delete next.pad[action];
    if (!Object.keys(next.keys).length) delete next.keys;
    if (!Object.keys(next.pad).length) delete next.pad;
    if (Object.keys(next).length) this.settings.bindings = next;
    else delete this.settings.bindings;
    this.version++;
  }

  resetBindings() {
    delete this.settings.bindings;
    this.version++;
  }

  // Forget everything held, after a menu or a cinematic took the controls.
  clear() {
    this.down.clear();
    this.edges.clear();
    this.touchDown.clear();
    this.touchMove.x = this.touchMove.y = 0;
    this.touchWalk = false;
    this.dragging = false;
    this.aimLatch = false;
    this.lookX = this.lookY = 0;
  }

  // Camera look in radians for this frame.
  takeLook(dt) {
    const k = this.settings.sensitivity,
      invY = this.settings.invertY ? -1 : 1,
      invX = this.settings.invertX ? -1 : 1;
    const x = (this.lookX * 0.0026 + this.padLook.x * 2.6 * dt) * k * invX;
    const y = (this.lookY * 0.0022 + this.padLook.y * 1.8 * dt) * k * invY;
    this.lookX = this.lookY = 0;
    return { x, y };
  }

  endFrame() {
    this.edges.clear();
  }

  // Printed name of a control for prompts, following the current device, layout and bindings.
  // `fire` names the pistols' trigger.
  label(action) {
    // The on-screen buttons carry these names.
    if (this.usingTouch)
      return (
        {
          jump: this.swimming ? t("Rise") : t("Jump"),
          interact: t("Use"),
          drop: this.swimming ? t("Dive") : t("Hang"),
          walk: t("Stick"),
          pace: t("Pace"),
          throw: this.equipment === "pistols" ? t("Fire") : t("Link"),
          fire: t("Fire"),
          inventory: t("Kit"),
          reload: t("Reload"),
          aim: t("Aim"),
          roll: t("Roll"),
          pause: t("Pause"),
          shield: t("Shield"),
        }[action] || action
      );
    if (this.usingPad)
      return this.padName(this.padButton(action === "fire" ? "throw" : action));
    if (action === "walk" && !this.binding("walk").length) action = "pace";
    let codes =
      action === "fire"
        ? this.fire()
        : action === "throw" && this.equipment === "pistols"
          ? this.fire()
          : this.binding(action);
    if (action === "throw" && this.equipment !== "pistols")
      codes = [...codes].sort(
        (a, b) => b.startsWith("Mouse") - a.startsWith("Mouse"),
      );
    else codes = codes.slice(0, 1);
    return codes
      .slice(0, 2)
      .map((code) => this.codeLabel(code))
      .join(" / ");
  }

  padName(index) {
    return index === undefined
      ? ""
      : PAD_NAMES[index] || t("Button {n}", { n: index });
  }

  // A key's printed name; `long` tells the left and right modifiers apart.
  codeLabel(code, long = false) {
    if (!code) return "";
    if (NAMED[code])
      return long && code === "Mouse0" ? t("Left click") : NAMED[code];
    const sided = /^(Shift|Control|Alt)(Left|Right)$/.exec(code);
    if (sided && long)
      return sided[2] === "Left"
        ? t("Left {key}", { key: SIDED[sided[1]] })
        : t("Right {key}", { key: SIDED[sided[1]] });
    if (sided) return SIDED[sided[1]];
    // Digits read as digits on every layout, where AZERTY prints a symbol first.
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (this.labels.has(code)) return this.labels.get(code);
    if (code.startsWith("Numpad"))
      return t("Num {key}", { key: code.slice(6) });
    return code.replace(/^(Key|Digit)/, "");
  }

  // The printed label of a movement key on the current layout and bindings: KeyW reads Z on
  // AZERTY, and whatever key now moves forward once remapped.
  keyLabel(code) {
    if (this.usingPad || this.usingTouch)
      return { KeyW: "↑", KeyS: "↓", KeyA: "←", KeyD: "→" }[code] || code;
    const direction = {
      KeyW: "forward",
      KeyS: "back",
      KeyA: "left",
      KeyD: "right",
    }[code];
    return this.codeLabel(direction ? this.binding(direction)[0] : code);
  }

  moveLabel() {
    if (this.usingPad) return t("Left stick");
    if (this.usingTouch) return t("Stick");
    return ["forward", "left", "back", "right"]
      .map((direction) => this.codeLabel(this.binding(direction)[0]))
      .join("");
  }

  isGameKey(code) {
    return (
      Object.values(MOVE).some((l) => l.includes(code)) ||
      Object.values(ACTIONS).some((l) => l.includes(code)) ||
      Object.values(this.settings?.bindings?.keys || {}).some(
        (l) => Array.isArray(l) && l.includes(code),
      )
    );
  }
}
