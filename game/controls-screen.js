// The Controls screen: every action with its two keys or mouse buttons and its gamepad
// button. Choosing one listens for the next key, mouse button or gamepad button; a control
// taken from another action goes back to it in exchange, and the status line says so.
import { t } from "./i18n.js";

const NAMES = {
  forward: [t("Move forward")],
  back: [t("Move back")],
  left: [t("Move left")],
  right: [t("Move right")],
  jump: [t("Jump"), t("Climb up, swim upward")],
  interact: [t("Use"), t("Grab, turn, talk, take; hold to keep hold")],
  drop: [t("Hang"), t("Hang from an edge, let go, dive")],
  pace: [t("Walk or run"), t("Walking stops at edges")],
  walk: [t("Careful walk"), t("Hold to walk while running is on")],
  roll: [t("Roll")],
  throw: [
    t("Act"),
    t("Link the orb, fire the pistols; hold to pull, once earned"),
  ],
  shield: [t("Shield"), t("Raise the relay shield, once earned")],
  aim: [t("Aim"), t("Aim the pistols")],
  reload: [t("Reload"), t("Reload the pistols")],
  inventory: [t("Equipment"), t("Open the equipment wheel")],
  orb: [t("Relay orb")],
  pistols: [t("Twin pistols")],
  pause: [t("Pause"), t("Esc always pauses")],
};
const MOVES = new Set(["forward", "back", "left", "right"]);
const LISTEN_MS = 10000;

const title = (action) =>
  NAMES[action]?.[0] ||
  action
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

export function createControlsScreen({ input, saveSettings, menu, sound }) {
  const head = document.querySelector("#controls-head");
  const body = document.querySelector("#controls-keys");
  const help = document.querySelector("#controls-help");
  const status = document.querySelector("#bind-status");
  const reset = document.querySelector("#reset-bindings");
  let listening = null;

  const say = (text) => (status.textContent = text);
  const cell = (action, slot, text, label, col) =>
    `<td><button type="button" class="bind" data-action="${slot === "pad" ? "bind-pad" : "bind"}" data-bind="${action}" data-slot="${slot}" data-col="${col}" aria-label="${label}">${text}</button></td>`;
  const fixed = (text) =>
    text ? `<td><span class="bind fixed">${text}</span></td>` : "<td></td>";

  // Keys as the player sees them in the table; the pause's Escape is shown but never moved.
  const keysOf = (action) =>
    input.binding(action).filter((code) => code !== "Escape");

  function render() {
    say("");
    if (input.usingTouch) {
      head.innerHTML = "";
      help.textContent = t(
        "The on-screen controls, by the names their buttons carry.",
      );
      reset.hidden = true;
      body.innerHTML = touchRows()
        .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
        .join("");
      return;
    }
    reset.hidden = false;
    help.textContent = t(
      "Choose a key, then press the new key or mouse button, or a gamepad button in the last column. Esc cancels; Backspace clears.",
    );
    head.innerHTML = `<tr><th scope="col">${t("Action")}</th><th scope="col">${t("Key")}</th><th scope="col">${t("Other key")}</th><th scope="col">${t("Gamepad")}</th></tr>`;
    const rows = [
      `<tr><th scope="row">${t("Look")}</th>${fixed(t("Mouse"))}${fixed("")}${fixed(t("Right stick"))}</tr>`,
    ];
    for (const action of input.remappable()) {
      const [name, note] = NAMES[action] || [title(action)];
      const keys = keysOf(action);
      const slots = [];
      if (action === "pause") {
        slots.push(fixed(t("Esc")));
        slots.push(slot(action, 0, keys[0], name, 1));
      } else
        for (let i = 0; i < 2; i++)
          slots.push(slot(action, i, keys[i], name, i));
      const pad = MOVES.has(action)
        ? fixed(t("Left stick"))
        : action === "pause"
          ? fixed(t("Start"))
          : padSlot(action, name);
      const missing = !keys.length && input.defaults(action).keys.length > 0;
      rows.push(
        `<tr class="bind-row${missing ? " unbound" : ""}" data-row="${action}"><th scope="row">${name}${note ? `<span class="note">${note}</span>` : ""}${missing ? `<span class="note warn">${t("No key: choose one")}</span>` : ""}</th>${slots.join("")}${pad}</tr>`,
      );
    }
    body.innerHTML = rows.join("");
  }

  function slot(action, index, code, name, col) {
    const text = code ? input.codeLabel(code, true) : "";
    return cell(
      action,
      index,
      code ? `<kbd>${text}</kbd>` : `<span class="empty">${t("None")}</span>`,
      code
        ? t("{name}: {key}. Change", { name, key: text })
        : t("{name}: no key. Change", { name }),
      col,
    );
  }

  function padSlot(action, name) {
    const index = input.padButton(action);
    const text = index === undefined ? "" : padName(index);
    return cell(
      action,
      "pad",
      text ? `<kbd>${text}</kbd>` : `<span class="empty">${t("None")}</span>`,
      text
        ? t("{name} on a gamepad: {button}. Change", { name, button: text })
        : t("{name} on a gamepad: no button. Change", { name }),
      2,
    );
  }

  const padName = (index) => input.padName(index);

  function touchRows() {
    const key = (label) => `<kbd>${label}</kbd>`;
    return [
      [t("Stick"), t("Move; a light push keeps your footing near edges")],
      [
        `${key(t("Walking"))} / ${key(t("Running"))}`,
        t("Switch walking / running"),
      ],
      [t("Drag the picture"), t("Look")],
      [t("Look + stick"), t("Swim toward the reticle, including depth")],
      [key(t("Jump")), t("Jump, climb up")],
      [
        t("{button} hold", { button: key(t("Use")) }),
        t("Grab, turn, talk, take, activate"),
      ],
      [key(t("Hang")), t("Hang from an edge, let go")],
      [
        t("{buttons} hold", {
          buttons: `${key(t("Rise"))} / ${key(t("Dive"))}`,
        }),
        t("Adjust swimming height"),
      ],
      [
        `${key(t("Link"))} / ${key(t("Fire"))}`,
        t("Use the selected equipment"),
      ],
      [key(t("Kit")), t("Choose equipment or reload pistols")],
      [
        t("{button} hold", { button: key(t("Link")) }),
        t("Pull with the orb, once earned"),
      ],
      [key(t("Shield")), t("Raise the relay shield, once earned")],
      [key(t("Roll")), t("Roll away, from level 2 on")],
      [key("II"), t("Pause")],
    ];
  }

  // --- listening for the new control ----------------------------------------------------------
  function begin(button) {
    if (listening) stop();
    const action = button.dataset.bind;
    const pad = button.dataset.action === "bind-pad";
    const slot = pad ? "pad" : Number(button.dataset.slot);
    listening = {
      action,
      slot,
      pad,
      button,
      until: performance.now() + LISTEN_MS,
      released: false,
    };
    menu.locked = true;
    button.classList.add("listening");
    button.innerHTML = `<kbd>${pad ? t("Press a button") : t("Press a key")}</kbd>`;
    say(
      pad
        ? t("Press a gamepad button for {action}. Start or Esc cancels.", {
            action: title(action),
          })
        : t(
            "Press a key or mouse button for {action}. Esc cancels, Backspace clears.",
            { action: title(action) },
          ),
    );
    addEventListener("keydown", onKey, true);
    addEventListener("mousedown", onMouse, true);
    for (const type of ["click", "auxclick", "contextmenu"])
      addEventListener(type, swallow, true);
    requestAnimationFrame(tick);
  }

  function stop(message) {
    if (!listening) return;
    const { action, slot } = listening;
    listening = null;
    removeEventListener("keydown", onKey, true);
    removeEventListener("mousedown", onMouse, true);
    // The click that ends a mouse capture is swallowed too, then the menu listens again.
    setTimeout(() => {
      if (listening) return;
      for (const type of ["click", "auxclick", "contextmenu"])
        removeEventListener(type, swallow, true);
      menu.locked = false;
    }, 250);
    render();
    if (message) say(message);
    const again = body.querySelector(
      `[data-bind="${action}"][data-slot="${slot}"]`,
    );
    const items = menu.items();
    if (again && items.includes(again)) menu.focus(items.indexOf(again));
  }

  function swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onKey(e) {
    if (!listening) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const { action, slot, pad } = listening;
    if (e.code === "Escape")
      return stop(t("{action} keeps its controls.", { action: title(action) }));
    if (pad) return;
    if (e.code === "Backspace" || e.code === "Delete") {
      input.assignKey(action, slotIndex(action, slot), null);
      saveSettings();
      return stop(
        keysOf(action).length
          ? t("{action} lost that key.", { action: title(action) })
          : t("{action} lost that key. It has none now: choose one.", {
              action: title(action),
            }),
      );
    }
    if (!input.bindable(e.code))
      return say(
        t("{key} stays with the browser. Choose another key.", {
          key: input.codeLabel(e.code),
        }),
      );
    assign(e.code);
  }

  function onMouse(e) {
    if (!listening || listening.pad) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.button < 0 || e.button > 4) return;
    assign(`Mouse${e.button}`);
  }

  const slotIndex = (action, slot) => (action === "pause" ? 0 : slot);

  function assign(code) {
    const { action, slot } = listening;
    const moved = input.assignKey(action, slotIndex(action, slot), code);
    saveSettings();
    sound?.play("ui");
    stop(
      describe(action, input.codeLabel(code, true), moved, (c) =>
        input.codeLabel(c, true),
      ),
    );
  }

  function assignPad(index) {
    const { action } = listening;
    const moved = input.assignPad(action, index);
    saveSettings();
    sound?.play("ui");
    stop(describe(action, padName(index), moved, (i) => padName(i)));
  }

  function describe(action, label, moved, name) {
    const parts = [
      t("{action} now uses {key}.", { action: title(action), key: label }),
    ];
    for (const m of moved)
      parts.push(
        m.to === null || m.to === undefined
          ? t("{action} gave it up and has no other control: choose one.", {
              action: title(m.action),
            })
          : t("{action} moved to {key}.", {
              action: title(m.action),
              key: name(m.to),
            }),
      );
    return parts.join(" ");
  }

  // Gamepad buttons are polled; the press that opened the slot must be let go first.
  function tick() {
    if (!listening) return;
    if (performance.now() > listening.until)
      return stop(
        t("No control pressed: {action} keeps its controls.", {
          action: title(listening.action),
        }),
      );
    if (listening.pad) {
      const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
      const pressed = pad ? pad.buttons.findIndex((b) => b?.pressed) : -1;
      if (pressed < 0) listening.released = true;
      else if (listening.released) {
        if (pressed === 8 || pressed === 9)
          return stop(
            t("{action} keeps its controls.", {
              action: title(listening.action),
            }),
          );
        if (input.padBindable(pressed)) return assignPad(pressed);
      }
    }
    requestAnimationFrame(tick);
  }

  function resetAll() {
    input.resetBindings();
    saveSettings();
    render();
    say(t("Every key and button is back to its default."));
  }

  return {
    render,
    begin,
    reset: resetAll,
    get listening() {
      return !!listening;
    },
  };
}
