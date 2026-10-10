// The Controls screen: every action with its two keys or mouse buttons and its gamepad
// button. Choosing one listens for the next key, mouse button or gamepad button; a control
// taken from another action goes back to it in exchange, and the status line says so.

const NAMES = {
  forward: ["Move forward"],
  back: ["Move back"],
  left: ["Move left"],
  right: ["Move right"],
  jump: ["Jump", "Climb up, swim upward"],
  interact: ["Use", "Grab, turn, talk, take; hold to keep hold"],
  drop: ["Hang", "Hang from an edge, let go, dive"],
  pace: ["Walk or run", "Walking stops at edges"],
  walk: ["Careful walk", "Hold to walk while running is on"],
  roll: ["Roll"],
  throw: ["Act", "Link the orb, fire the pistols; hold to pull, once earned"],
  shield: ["Shield", "Raise the relay shield, once earned"],
  aim: ["Aim", "Aim the pistols"],
  reload: ["Reload", "Reload the pistols"],
  inventory: ["Equipment", "Open the equipment wheel"],
  orb: ["Relay orb"],
  pistols: ["Twin pistols"],
  pause: ["Pause", "Esc always pauses"],
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
      help.textContent =
        "The on-screen controls, by the names their buttons carry.";
      reset.hidden = true;
      body.innerHTML = touchRows()
        .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
        .join("");
      return;
    }
    reset.hidden = false;
    help.textContent =
      "Choose a key, then press the new key or mouse button, or a gamepad button in the last column. Esc cancels; Backspace clears.";
    head.innerHTML =
      '<tr><th scope="col">Action</th><th scope="col">Key</th><th scope="col">Other key</th><th scope="col">Gamepad</th></tr>';
    const rows = [
      `<tr><th scope="row">Look</th>${fixed("Mouse")}${fixed("")}${fixed("Right stick")}</tr>`,
    ];
    for (const action of input.remappable()) {
      const [name, note] = NAMES[action] || [title(action)];
      const keys = keysOf(action);
      const slots = [];
      if (action === "pause") {
        slots.push(fixed("Esc"));
        slots.push(slot(action, 0, keys[0], name, 1));
      } else
        for (let i = 0; i < 2; i++)
          slots.push(slot(action, i, keys[i], name, i));
      const pad = MOVES.has(action)
        ? fixed("Left stick")
        : action === "pause"
          ? fixed("Start")
          : padSlot(action, name);
      const missing = !keys.length && input.defaults(action).keys.length > 0;
      rows.push(
        `<tr class="bind-row${missing ? " unbound" : ""}" data-row="${action}"><th scope="row">${name}${note ? `<span class="note">${note}</span>` : ""}${missing ? '<span class="note warn">No key: choose one</span>' : ""}</th>${slots.join("")}${pad}</tr>`,
      );
    }
    body.innerHTML = rows.join("");
  }

  function slot(action, index, code, name, col) {
    const text = code ? input.codeLabel(code, true) : "";
    return cell(
      action,
      index,
      code ? `<kbd>${text}</kbd>` : '<span class="empty">None</span>',
      `${name}: ${code ? text : "no key"}. Change`,
      col,
    );
  }

  function padSlot(action, name) {
    const index = input.padButton(action);
    const text = index === undefined ? "" : padName(index);
    return cell(
      action,
      "pad",
      text ? `<kbd>${text}</kbd>` : '<span class="empty">None</span>',
      `${name} on a gamepad: ${text || "no button"}. Change`,
      2,
    );
  }

  const padName = (index) => input.padName(index);

  function touchRows() {
    return [
      ["Stick", "Move; a light push keeps your footing near edges"],
      ["<kbd>Walking</kbd> / <kbd>Running</kbd>", "Switch walking / running"],
      ["Drag the picture", "Look"],
      ["Look + stick", "Swim toward the reticle, including depth"],
      ["<kbd>Jump</kbd>", "Jump, climb up"],
      ["<kbd>Use</kbd> hold", "Grab, turn, talk, take, activate"],
      ["<kbd>Hang</kbd>", "Hang from an edge, let go"],
      ["<kbd>Rise</kbd> / <kbd>Dive</kbd> hold", "Adjust swimming height"],
      ["<kbd>Link</kbd> / <kbd>Fire</kbd>", "Use the selected equipment"],
      ["<kbd>Kit</kbd>", "Choose equipment or reload pistols"],
      ["<kbd>Link</kbd> hold", "Pull with the orb, once earned"],
      ["<kbd>Shield</kbd>", "Raise the relay shield, once earned"],
      ["<kbd>Roll</kbd>", "Roll away, from level 2 on"],
      ["<kbd>II</kbd>", "Pause"],
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
    button.innerHTML = `<kbd>${pad ? "Press a button" : "Press a key"}</kbd>`;
    say(
      pad
        ? `Press a gamepad button for ${title(action)}. Start or Esc cancels.`
        : `Press a key or mouse button for ${title(action)}. Esc cancels, Backspace clears.`,
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
      return stop(`${title(action)} keeps its controls.`);
    if (pad) return;
    if (e.code === "Backspace" || e.code === "Delete") {
      input.assignKey(action, slotIndex(action, slot), null);
      saveSettings();
      return stop(
        `${title(action)} lost that key.${keysOf(action).length ? "" : " It has none now: choose one."}`,
      );
    }
    if (!input.bindable(e.code))
      return say(
        `${input.codeLabel(e.code)} stays with the browser. Choose another key.`,
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
    const parts = [`${title(action)} now uses ${label}.`];
    for (const m of moved)
      parts.push(
        m.to === null || m.to === undefined
          ? `${title(m.action)} gave it up and has no other control: choose one.`
          : `${title(m.action)} moved to ${name(m.to)}.`,
      );
    return parts.join(" ");
  }

  // Gamepad buttons are polled; the press that opened the slot must be let go first.
  function tick() {
    if (!listening) return;
    if (performance.now() > listening.until)
      return stop(
        `No control pressed: ${title(listening.action)} keeps its controls.`,
      );
    if (listening.pad) {
      const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
      const pressed = pad ? pad.buttons.findIndex((b) => b?.pressed) : -1;
      if (pressed < 0) listening.released = true;
      else if (listening.released) {
        if (pressed === 8 || pressed === 9)
          return stop(`${title(listening.action)} keeps its controls.`);
        if (input.padBindable(pressed)) return assignPad(pressed);
      }
    }
    requestAnimationFrame(tick);
  }

  function resetAll() {
    input.resetBindings();
    saveSettings();
    render();
    say("Every key and button is back to its default.");
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
