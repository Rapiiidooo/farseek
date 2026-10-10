// Touch controls for phones and tablets: a stick for moving, a drag anywhere else on the
// picture to look, and buttons for the actions, fed into the same intentions as the keyboard
// and the pad (input.js). Several fingers at once: each pointer is tracked by its id. A touch
// on the picture or the stick also skips what can be skipped (a shot, the notes, the credits).
// The controls show while touch is the device in use: a key or a moving mouse hides them.
import { t } from "./i18n.js";

const DEAD = 0.12,
  WALK_ZONE = 0.75,
  // Radians of view per pixel dragged, before the sensitivity setting.
  LOOK = 0.0048;

export class TouchControls {
  constructor(input, canvas) {
    this.input = input;
    this.canvas = canvas;
    this.root = document.getElementById("touch");
    this.stick = document.getElementById("stick");
    this.knob = this.stick.querySelector(".knob");
    this.enabled =
      matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    this.stickId = null;
    this.look = new Map();
    this.held = new Map();
    if (!this.enabled) return;
    // A phone or a tablet starts on touch; a touch laptop starts on its keyboard and mouse.
    input.usingTouch = matchMedia("(pointer: coarse)").matches;
    addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch") input.usingTouch = true;
      },
      true,
    );
    addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" && (e.movementX || e.movementY))
        input.usingTouch = false;
    });

    this.stick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.touched();
      this.stickId = e.pointerId;
      this.stick.setPointerCapture?.(e.pointerId);
      this.steer(e);
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      this.touched();
      this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    // Sheets over the game (the notes, the credits) close or skip at a tap.
    for (const id of ["notes", "credits"])
      document.getElementById(id)?.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "mouse") this.touched();
      });
    for (const b of this.root.querySelectorAll("[data-touch]"))
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = b.dataset.touch;
        this.input.usingTouch = true;
        this.input.usingPad = false;
        this.input.touchDown.add(action);
        this.input.edges.add("touch:" + action);
        this.held.set(e.pointerId, action);
        b.classList.add("down");
        b.setPointerCapture?.(e.pointerId);
      });
    addEventListener("pointermove", (e) => {
      if (e.pointerId === this.stickId) return this.steer(e);
      const last = this.look.get(e.pointerId);
      if (!last) return;
      this.input.lookX += ((e.clientX - last.x) * LOOK) / 0.0026;
      this.input.lookY += ((e.clientY - last.y) * LOOK) / 0.0022;
      last.x = e.clientX;
      last.y = e.clientY;
    });
    const up = (e) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.input.touchMove.x = this.input.touchMove.y = 0;
        this.input.touchWalk = false;
        this.knob.style.transform = "";
      }
      this.look.delete(e.pointerId);
      const action = this.held.get(e.pointerId);
      if (action) {
        this.held.delete(e.pointerId);
        if (![...this.held.values()].includes(action))
          this.input.touchDown.delete(action);
        for (const b of this.root.querySelectorAll(`[data-touch="${action}"]`))
          b.classList.remove("down");
      }
    };
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    // Held buttons and the stick are released when the page loses the fingers.
    addEventListener("blur", () => {
      this.stickId = null;
      this.look.clear();
      this.held.clear();
      this.input.touchDown.clear();
      this.input.touchMove.x = this.input.touchMove.y = 0;
      this.input.touchWalk = false;
      this.knob.style.transform = "";
    });
  }

  // A finger on the picture or the stick: touch is the device now, and a skippable moment skips.
  touched() {
    this.input.usingTouch = true;
    this.input.usingPad = false;
    this.input.edges.add("touch:skip");
  }

  steer(e) {
    const r = this.stick.getBoundingClientRect();
    const radius = r.width / 2;
    const dx = (e.clientX - (r.left + radius)) / radius,
      dy = (e.clientY - (r.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    const ux = len > 1e-6 ? dx / len : 0,
      uy = len > 1e-6 ? dy / len : 0;
    const m = len < DEAD ? 0 : Math.min(1, (len - DEAD) / (1 - DEAD));
    const walk = m < WALK_ZONE;
    const pace = walk ? m / WALK_ZONE : m;
    this.input.touchWalk = walk && m > 0;
    this.input.touchMove.x = ux * pace;
    this.input.touchMove.y = -uy * pace;
    const k = Math.min(len, 1) * radius * 0.6;
    this.knob.style.transform = `translate(${ux * k}px, ${uy * k}px)`;
    this.knob.classList.toggle("run", this.input.running && !walk);
  }

  // Which controls show: none outside play, only the stick (to skip) during a shot, and the
  // actions that make sense where the explorer is.
  update({
    play,
    cinematic,
    holding,
    prompt,
    hanging,
    swimming,
    beyond,
    shield,
  }) {
    if (!this.enabled) return;
    const on = this.input.usingTouch;
    document.body.classList.toggle("touch", on);
    this.root.hidden = !(play && on);
    if (this.root.hidden) return;
    this.knob.classList.toggle(
      "run",
      this.input.running && !this.input.touchWalk && this.stickId !== null,
    );
    this.root.classList.toggle("cine", !!cinematic);
    const show = (action, on) =>
      this.root
        .querySelector(`[data-touch="${action}"]`)
        ?.classList.toggle("off", !on);
    show("drop", swimming || prompt === "edge" || hanging);
    show("throw", !!holding && !swimming);
    show("roll", !!beyond && !swimming);
    show("shield", !!shield?.unlocked && !!beyond && !swimming);
    const ward = this.root.querySelector('[data-touch="shield"]');
    if (ward && shield?.unlocked) {
      const charge = shield.charge.toFixed(2);
      if (ward.dataset.charge !== charge) {
        ward.dataset.charge = charge;
        ward.style.setProperty("--charge", charge);
      }
      ward.classList.toggle("cooling", !shield.ready && !shield.active);
      ward.classList.toggle("raised", !!shield.active);
    }
    for (const [action, label] of [
      ["jump", swimming ? t("Rise") : t("Jump")],
      ["drop", swimming ? t("Dive") : t("Hang")],
      ["throw", this.input.equipment === "pistols" ? t("Fire") : t("Link")],
    ]) {
      const button = this.root.querySelector(`[data-touch="${action}"]`);
      if (button && button.textContent !== label) {
        button.textContent = label;
        button.setAttribute("aria-label", label);
      }
    }
  }
}
