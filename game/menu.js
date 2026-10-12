// The title, pause, levels, settings, controls and confirm screens. One panel shows at a time
// and the rest stack behind it for Back. Keyboard, mouse and gamepad all drive the same
// virtual focus: up and down move it, left and right change a setting or move along a row of
// key bindings, Enter or A activates, Escape or B goes back. The movement keys, as the player
// has bound them, move the focus as the arrows do. A screen that shows one thing at a time
// turns to the next with left and right through `onTurn(screen, direction)`.

const NAV_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "Enter",
  "NumpadEnter",
  "Space",
  "Escape",
  "Backspace",
]);
const FIXED_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "NumpadEnter",
  "Space",
  "Escape",
  "Backspace",
]);
const ARROWS = {
  forward: "ArrowUp",
  back: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

export class Menu {
  constructor(root, { onAction, onChange } = {}) {
    this.root = root;
    this.onAction = onAction;
    this.onChange = onChange;
    this.stack = [];
    this.index = 0;
    this.pad = { held: new Set(), repeat: 0 };
    this.locked = false;
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-action]");
      if (!b || b.disabled || !this.isOpen) return;
      e.preventDefault();
      this.activate(b);
    });
    root.addEventListener("pointermove", (e) => {
      const items = this.items();
      const hit = items.findIndex((el) => el.contains(e.target));
      if (hit >= 0 && hit !== this.index) this.focus(hit);
    });
    root.addEventListener("input", (e) => this.onChange?.(e.target));
    root.addEventListener("change", (e) => this.onChange?.(e.target));
    addEventListener(
      "keydown",
      (e) => {
        const code = this.isOpen && !e.repeat ? this.navigation(e.code) : null;
        if (!code) return;
        e.preventDefault();
        e.stopPropagation();
        this.key(code);
      },
      true,
    );
  }

  // The menu key a pressed key stands for: the fixed ones, then the movement keys as bound
  // (`moveKeys`, from the input), or WASD when nothing says otherwise.
  navigation(code) {
    if (FIXED_KEYS.has(code)) return code;
    if (!this.moveKeys) return NAV_KEYS.has(code) ? code : null;
    for (const [direction, arrow] of Object.entries(ARROWS))
      if (this.moveKeys(direction).includes(code)) return arrow;
    return null;
  }

  get isOpen() {
    return !this.root.hidden && this.stack.length > 0;
  }

  get screen() {
    return this.stack[this.stack.length - 1]?.name || null;
  }

  panel(name = this.screen) {
    return this.root.querySelector(`.panel[data-screen="${name}"]`);
  }

  // Opens the menu on a screen, replacing whatever stack was there.
  open(name, { paused = false } = {}) {
    // Whatever was showing goes first: quitting to the title opens it over the pause menu.
    for (const p of this.root.querySelectorAll(".panel")) p.hidden = true;
    this.stack = [];
    this.root.hidden = false;
    this.root.classList.remove("leaving");
    this.root.classList.toggle("paused", paused);
    this.push(name);
  }

  push(name) {
    if (this.screen) {
      this.panel().hidden = true;
      this.stack[this.stack.length - 1].index = this.index;
    }
    this.stack.push({ name, index: 0 });
    const p = this.panel();
    p.hidden = false;
    // Replaying the entrance animation each time the panel is shown.
    p.style.animation = "none";
    void p.offsetWidth;
    p.style.animation = "";
    this.shown(p);
    this.focus(0);
  }

  back() {
    if (this.stack.length <= 1) {
      this.onAction?.("back-root", null);
      return;
    }
    this.panel().hidden = true;
    this.stack.pop();
    this.panel().hidden = false;
    this.shown(this.panel());
    this.focus(this.stack[this.stack.length - 1].index);
  }

  // The screen's name on the root for styles, and the panel now laid out to `onShow`.
  shown(panel) {
    this.root.dataset.screen = this.screen || "";
    if (panel) this.onShow?.(panel);
  }

  close({ fade = false } = {}) {
    for (const p of this.root.querySelectorAll(".panel")) p.hidden = true;
    this.stack = [];
    this.shown(null);
    if (fade) {
      this.root.classList.add("leaving");
      setTimeout(() => {
        if (!this.stack.length) this.root.hidden = true;
      }, 600);
    } else this.root.hidden = true;
  }

  // Focusable things in the active panel: enabled buttons and settings rows, in page order.
  items() {
    const p = this.panel();
    if (!p) return [];
    return [
      ...p.querySelectorAll("button[data-action], .settings .row"),
    ].filter((el) => !el.disabled && !el.closest("[hidden]"));
  }

  focus(i) {
    const items = this.items();
    if (!items.length) return;
    this.index = (i + items.length) % items.length;
    items.forEach((el, k) => el.classList.toggle("focus", k === this.index));
    items[this.index].scrollIntoView?.({ block: "nearest" });
  }

  activate(el) {
    if (el.matches(".row")) {
      const input = el.querySelector("input, select");
      if (input?.type === "checkbox") {
        input.checked = !input.checked;
        this.onChange?.(input);
      } else this.adjust(1);
      return;
    }
    this.onAction?.(el.dataset.action, el);
  }

  // Left and right on a settings row.
  adjust(dir) {
    const el = this.items()[this.index];
    const input = el?.matches(".row") && el.querySelector("input, select");
    if (!input) return;
    if (input.type === "range") {
      const step = Number(input.step) || 0.1;
      const v = Math.min(
        Number(input.max),
        Math.max(Number(input.min), Number(input.value) + dir * step),
      );
      input.value = String(Math.round(v * 1000) / 1000);
    } else if (input.type === "checkbox") input.checked = !input.checked;
    else if (input.tagName === "SELECT") {
      const n = input.options.length;
      input.selectedIndex = (input.selectedIndex + dir + n) % n;
    }
    this.onChange?.(input);
  }

  key(code) {
    if (this.locked) return;
    const up = code === "ArrowUp" || code === "KeyW",
      down = code === "ArrowDown" || code === "KeyS",
      left = code === "ArrowLeft" || code === "KeyA",
      right = code === "ArrowRight" || code === "KeyD";
    if ((up || down || left || right) && this.grid(up, down, left, right))
      return;
    if ((left || right) && this.onTurn?.(this.screen, left ? -1 : 1)) return;
    if (up) this.focus(this.index - 1);
    else if (down) this.focus(this.index + 1);
    else if (left) this.adjust(-1);
    else if (right) this.adjust(1);
    else if (code === "Escape" || code === "Backspace") this.back();
    else {
      const el = this.items()[this.index];
      if (el) this.activate(el);
    }
  }

  // In a table of rows (the key bindings), left and right move along the row and up and down
  // keep the column.
  grid(up, down, left, right) {
    const items = this.items();
    const el = items[this.index];
    const row = el?.closest("[data-row]");
    if (!row) return false;
    const rows = [
      ...new Set(items.map((item) => item.closest("[data-row]"))),
    ].filter(Boolean);
    const at = rows.indexOf(row);
    const inRow = (r) =>
      items.filter((item) => item.closest("[data-row]") === r);
    if (left || right) {
      const cells = inRow(row);
      const next = cells[cells.indexOf(el) + (right ? 1 : -1)];
      if (next) this.focus(items.indexOf(next));
      return true;
    }
    const target = rows[at + (down ? 1 : -1)];
    if (!target) return false;
    const column = Number(el.dataset.col ?? 0);
    const cells = inRow(target);
    const best = cells.reduce((a, b) =>
      Math.abs(Number(b.dataset.col ?? 0) - column) <
      Math.abs(Number(a.dataset.col ?? 0) - column)
        ? b
        : a,
    );
    this.focus(items.indexOf(best));
    return true;
  }

  // Gamepad navigation, polled every frame while the menu is open.
  poll(dt) {
    if (!this.isOpen || this.locked) return;
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (!pad) return;
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ay = pad.axes[1] || 0,
      ax = pad.axes[0] || 0;
    const now = new Set();
    if (b(12) || ay < -0.6) now.add("up");
    if (b(13) || ay > 0.6) now.add("down");
    if (b(14) || ax < -0.6) now.add("left");
    if (b(15) || ax > 0.6) now.add("right");
    if (b(0)) now.add("a");
    if (b(1)) now.add("b");
    const fresh = [...now].filter((k) => !this.pad.held.has(k));
    this.pad.repeat -= dt;
    const repeatable = [...now].filter((k) =>
      ["up", "down", "left", "right"].includes(k),
    );
    let fire = fresh;
    if (!fresh.length && repeatable.length && this.pad.repeat <= 0) {
      fire = repeatable;
      this.pad.repeat = 0.12;
    } else if (fresh.length) this.pad.repeat = 0.4;
    this.pad.held = now;
    for (const k of fire)
      this.key(
        {
          up: "ArrowUp",
          down: "ArrowDown",
          left: "ArrowLeft",
          right: "ArrowRight",
          a: "Enter",
          b: "Escape",
        }[k],
      );
  }
}
