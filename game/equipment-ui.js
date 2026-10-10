import { PISTOL_CAPACITY } from "./weapon-reload.js";
import { CRAFT } from "./pistol-craft.js";
import { t } from "./i18n.js";

const CARDS = {
  pull: (k) => [
    t("Relay pull"),
    t(
      "Hold {key} on a creature to drag it toward you: out of cover, off its feet, out of a charge.",
      { key: k("throw") },
    ),
  ],
  shield: (k) => [
    t("Relay shield"),
    t(
      "Press {key} to raise a ward of the builders' light in front of you for a moment: it turns aside charges, spores and pressure, then gathers again.",
      { key: k("shield") },
    ),
  ],
};

export class EquipmentUI {
  constructor(input, { onSelect, onOpen, onClose, onReload, onBriefing }) {
    Object.assign(this, {
      input,
      onSelect,
      onOpen,
      onClose,
      onReload,
      onBriefing,
    });
    this.open = false;
    this.selected = "none";
    this.focused = "none";
    this.quietSince = null;
    this.button = document.createElement("button");
    this.button.id = "equipment-status";
    this.button.type = "button";
    this.button.setAttribute("aria-label", t("Open equipment wheel"));
    this.button.innerHTML = `<span class="kit-charge" aria-hidden="true"><i></i></span><span class="kit-name">${t("Expedition kit")}</span><span class="kit-state">${t("Follow the expedition")}</span><kbd>Tab</kbd><span class="kit-relay" hidden><i aria-hidden="true"></i><span>${t("Shield ready")}</span><kbd>V</kbd></span>`;
    document.querySelector("#hud").append(this.button);
    this.pace = document.createElement("button");
    this.pace.id = "pace-status";
    this.pace.type = "button";
    this.pace.innerHTML = `<span>${t("Walking")}</span><kbd>Shift</kbd>`;
    document.querySelector("#hud").append(this.pace);
    this.reticle = document.createElement("div");
    this.reticle.id = "equipment-reticle";
    this.reticle.setAttribute("aria-hidden", "true");
    this.reticle.innerHTML = `<i class="sight-tick north"></i><i class="sight-tick east"></i><i class="sight-tick south"></i><i class="sight-tick west"></i><span class="sight-hit"></span><span class="sight-bore"></span><span class="sight-feedback">${t("Target protected")}</span><span class="sight-pull"></span><svg class="sight-reload" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" pathLength="1"/></svg><svg class="sight-charge" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" pathLength="1"/></svg>`;
    document.querySelector("#hud").append(this.reticle);
    this.hintCard = document.querySelector("#hint");
    this.chapterCard = document.querySelector("#chapter-card");
    this.styled = { charge: null, gap: null, reload: null };
    this.root = document.createElement("section");
    this.root.id = "equipment-wheel";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "equipment-title");
    this.root.innerHTML = `<div class="kit-panel">
      <p class="kit-kicker">${t("Expedition equipment")}</p><h2 id="equipment-title">${t("Choose your approach")}</h2>
      <div class="kit-wheel">
        <button type="button" data-equipment="orb"><span class="kit-icon orb-icon" aria-hidden="true"></span><kbd>1</kbd><strong>${t("Relay orb")}</strong><span>${t("Channel light into mechanisms")}</span></button>
        <button type="button" data-equipment="pistols"><span class="kit-icon pistol-icon" aria-hidden="true">⌁</span><kbd>2</kbd><strong>${t("Twin pistols")}</strong><span>${t("Draw both weapons")}</span></button>
        <div class="kit-hub" aria-hidden="true">F</div>
      </div>
      <p class="kit-detail" aria-live="polite"></p>
      <p class="kit-upgrades" hidden></p>
      <p class="kit-controls">${t("Click to equip · 1 / 2 select · Esc returns")}</p>
      <div class="kit-buttons"><button type="button" data-reload>${t("Reload pistols")}</button><button type="button" data-close>${t("Return to game")}</button></div>
    </div>`;
    document.body.append(this.root);
    const trackPointer = (event) => {
      this.input.usingTouch = event.pointerType === "touch";
      this.input.usingPad = false;
    };
    this.root.addEventListener("pointerdown", trackPointer);
    this.button.addEventListener("pointerdown", trackPointer);
    this.pace.addEventListener("pointerdown", trackPointer);
    this.pace.addEventListener("click", () =>
      this.input.edges.add("touch:pace"),
    );
    this.button.addEventListener("click", () => this.show());
    this.root
      .querySelector("[data-close]")
      .addEventListener("click", () => this.close());
    this.root
      .querySelector("[data-reload]")
      .addEventListener("click", () => this.reload());
    for (const button of this.root.querySelectorAll("[data-equipment]")) {
      button.addEventListener("click", () =>
        this.choose(button.dataset.equipment),
      );
      button.addEventListener("pointerenter", () =>
        this.focus(button.dataset.equipment),
      );
    }
    addEventListener(
      "keydown",
      (event) => {
        if (!this.open) return;
        if (
          [
            "Escape",
            "Tab",
            "KeyI",
            "Digit1",
            "Digit2",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "KeyR",
            "KeyX",
            "Enter",
            "Space",
          ].includes(event.code)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.repeat) return;
          if (["Escape", "Tab", "KeyI"].includes(event.code)) this.close();
          else if (event.code === "Digit1") this.choose("orb");
          else if (event.code === "Digit2") this.choose("pistols");
          else if (["KeyR", "KeyX"].includes(event.code)) this.reload();
          else if (event.code.startsWith("Arrow")) {
            const actions = [
              ...this.root.querySelectorAll(".kit-buttons button"),
            ].filter((button) => !button.disabled);
            const active = document.activeElement;
            if (event.code === "ArrowDown")
              actions[0]?.focus({ preventScroll: true });
            else if (event.code === "ArrowUp") this.focus(this.selected);
            else if (actions.includes(active)) {
              const step = event.code === "ArrowRight" ? 1 : -1;
              actions[
                (actions.indexOf(active) + step + actions.length) %
                  actions.length
              ]?.focus({ preventScroll: true });
            } else this.focus(this.focused === "orb" ? "pistols" : "orb");
          } else if (document.activeElement?.matches("[data-reload]"))
            this.reload();
          else if (document.activeElement?.matches("[data-close]"))
            this.close();
          else this.choose(this.focused);
        }
      },
      true,
    );
  }

  focus(value) {
    const buttons = [...this.root.querySelectorAll("[data-equipment]")];
    const available = buttons.filter((button) => !button.disabled);
    const target =
      available.find((button) => button.dataset.equipment === value) ||
      available[0];
    this.focused = value = target?.dataset.equipment || "none";
    for (const button of buttons) {
      const active = button === target;
      button.classList.toggle("focused", active);
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.equipment === this.selected),
      );
      if (active) button.focus({ preventScroll: true });
    }
    if (!target)
      this.root.querySelector("[data-close]").focus({ preventScroll: true });
    this.root.querySelector(".kit-detail").textContent =
      value === "none"
        ? t(
            "Follow the expedition. Mira's relay orb is at the checkpoint, and her field kit is beyond it.",
          )
        : value === "orb" && !this.orbAvailable
          ? this.orbUnlocked
            ? t("The relay orb is stowed beyond the gate.")
            : t(
                "Recover Mira's relay orb from the checkpoint confiscation bin.",
              )
          : value === "orb"
            ? `${t("Link to a crystal: for ten seconds the shell turns to glass round a bright core. A charged pulse wakes mechanisms and stuns creatures; it never wounds.")}${this.abilities?.has("pull") ? ` ${t("Hold the link on a creature to pull it.")}` : ""}${this.abilities?.has("shield") ? ` ${t("{key} raises a shield.", { key: this.input.label("shield") })}` : ""}`
            : t(
                "Sixteen rounds per pistol. Only bullets wound; seals and cores still need the orb's light.",
              );
  }

  show() {
    if (this.button.hidden || this.open) return;
    this.open = true;
    this.onOpen?.();
    this.root.hidden = false;
    this.unlockUntil = performance.now() + 300;
    this.input.clear();
    document.exitPointerLock?.();
    this.focus(this.selected);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.input.clear();
    document.querySelector("#view").focus({ preventScroll: true });
    this.onClose?.();
  }

  choose(value) {
    if (value === "none" || (value === "pistols" && !this.pistolsUnlocked))
      return;
    if (value === "orb" && !this.orbAvailable) return;
    if (this.onSelect(value) === false) return;
    this.selected = value;
    this.close();
  }

  reload() {
    if (this.root.querySelector("[data-reload]").disabled) return false;
    if (this.onReload?.() === false) return false;
    this.close();
    return true;
  }

  update(equipment, orb, playing, canAct) {
    this.button.hidden = !playing;
    this.pace.hidden = !playing || this.open || this.input.swimming;
    this.pace.querySelector("span").textContent = this.input.running
      ? t("Running")
      : t("Walking");
    this.pace.querySelector("kbd").textContent = this.input.label("pace");
    this.pace.setAttribute("aria-pressed", String(this.input.running));
    this.pace.setAttribute(
      "aria-label",
      this.input.running ? t("Switch to walking") : t("Switch to running"),
    );
    this.pace.title = t("{key} switches between walking and running.", {
      key: this.input.label("pace"),
    });
    this.reticle.hidden =
      !playing ||
      (!canAct && !this.input.swimming) ||
      (!this.input.swimming && equipment?.selected === "none") ||
      this.open;
    if (!equipment) return;
    this.orbAvailable = equipment.orbAvailable;
    this.orbUnlocked = equipment.orbUnlocked;
    this.pistolsUnlocked = equipment.pistolsUnlocked;
    this.abilities = equipment.abilities;
    this.relay(equipment, playing);
    const pistols = this.root.querySelector('[data-equipment="pistols"]');
    pistols.disabled = !this.pistolsUnlocked;
    pistols.querySelector("span:last-child").textContent = this.pistolsUnlocked
      ? t("Draw both weapons")
      : t("Find Mira's field kit");
    const relay = this.root.querySelector('[data-equipment="orb"]');
    relay.disabled = !this.orbAvailable;
    relay.querySelector("span:last-child").textContent = this.orbAvailable
      ? t("Channel light into mechanisms")
      : this.orbUnlocked
        ? t("Stowed beyond the gate")
        : t("Find Mira's relay orb");
    this.selected = equipment.selected;
    this.root.querySelector(".kit-controls").textContent = this.input.usingTouch
      ? t("Tap an item to equip")
      : this.input.usingPad
        ? t("Left stick selects · A equips · LB reloads · B returns")
        : t("Arrows select · Enter equips · {key} reloads · Esc returns", {
            key: this.input.label("reload"),
          });
    for (const key of this.root.querySelectorAll(".kit-wheel kbd"))
      key.hidden = this.input.usingTouch || this.input.usingPad;
    this.button.querySelector(".kit-name").textContent =
      this.selected === "orb"
        ? t("Relay orb")
        : this.selected === "pistols"
          ? t("Twin pistols")
          : t("Expedition kit");
    const state = this.button.querySelector(".kit-state");
    state.textContent = this.input.swimming
      ? t("Stowed")
      : this.selected === "none"
        ? t("Follow the expedition")
        : this.selected === "orb"
          ? orb?.ready
            ? orb.charged
              ? t("Charged · {n} s", { n: Math.ceil(orb.charge) })
              : t("Aim at a crystal to charge")
            : t("Awaiting Mira's relay orb")
          : equipment.reloadLeft > 0
            ? t("Reloading…")
            : this.input.usingTouch
              ? `${equipment.ammo} / ${PISTOL_CAPACITY}`
              : t("{ammo} / {capacity} · {key} reload", {
                  ammo: equipment.ammo,
                  capacity: PISTOL_CAPACITY,
                  key: this.input.label("reload"),
                });
    // The touch badge is 64 px wide: a word or two.
    if (this.input.usingTouch && !this.input.swimming)
      if (this.selected === "none") state.textContent = t("Empty");
      else if (this.selected === "orb")
        state.textContent = !orb?.ready
          ? t("No orb")
          : orb.charged
            ? t("{n} s charged", { n: Math.ceil(orb.charge) })
            : t("Relay orb");
    this.button.setAttribute(
      "aria-label",
      this.selected === "orb"
        ? t("Open equipment wheel, relay orb")
        : this.selected === "pistols"
          ? t("Open equipment wheel, twin pistols, {ammo} rounds", {
              ammo: equipment.ammo,
            })
          : t("Open equipment wheel, no equipment recovered"),
    );
    this.button.querySelector("kbd").textContent =
      this.input.label("inventory");
    const holding =
      !this.input.swimming && this.selected === "orb" && !!orb?.ready;
    const left = holding && orb.charged ? orb.chargeLeft : 0;
    const fading = left > 0 && orb.charge < 3;
    this.button.classList.toggle("orb", holding);
    this.button.classList.toggle("charged", left > 0);
    this.button.classList.toggle("fading", fading);
    this.reticle.classList.toggle("charged", left > 0);
    this.reticle.classList.toggle("fading", fading);
    this.restyle("charge", left.toFixed(3), this.button, this.reticle);
    this.reticle.classList.toggle(
      "guns",
      !this.input.swimming && this.selected === "pistols",
    );
    this.reticle.classList.toggle("swimming", !!this.input.swimming);
    this.reticle.classList.toggle(
      "pullable",
      !this.input.swimming && this.selected === "orb" && !!equipment.pullAim,
    );
    this.reticle.classList.toggle(
      "pulling",
      !this.input.swimming && !!equipment.pull?.active,
    );
    const sight = this.input.swimming ? {} : equipment.sight || {};
    this.restyle("gap", `${sight.spread || 4}px`);
    this.restyle("reload", sight.reload || 0);
    this.brief(equipment, playing && canAct && !this.open);
    this.reticle.classList.toggle("aiming", !!sight.aiming);
    this.reticle.classList.toggle("target", !!sight.target);
    this.reticle.classList.toggle("blocked", !!sight.blocked);
    this.reticle.classList.toggle(
      "reloading",
      !this.input.swimming && equipment.reloadLeft > 0,
    );
    const bore = this.reticle.querySelector(".sight-bore");
    const [x, y, z] = sight.bore || [0, 0, 2];
    bore.hidden =
      this.input.swimming ||
      this.selected !== "pistols" ||
      !sight.aiming ||
      equipment.reloadLeft > 0 ||
      z > 1 ||
      Math.hypot(x * innerWidth, y * innerHeight) < 18;
    bore.style.transform = `translate(${(x * innerWidth) / 2}px, ${(-y * innerHeight) / 2}px)`;
    this.reticle.classList.toggle(
      "hit",
      !this.input.swimming && equipment.hitTime > 0,
    );
    this.reticle.classList.toggle(
      "protected",
      !this.input.swimming &&
        this.selected === "pistols" &&
        equipment.protectedTime > 0,
    );
    this.root.querySelector("[data-reload]").disabled =
      !canAct ||
      this.input.swimming ||
      !this.pistolsUnlocked ||
      this.selected !== "pistols" ||
      equipment.ammo === PISTOL_CAPACITY ||
      equipment.reloadLeft > 0;
    if (this.open && this.input.usingPad) {
      if (Math.abs(this.input.padMove.x) > 0.6)
        this.focus(this.input.padMove.x < 0 ? "orb" : "pistols");
      if (this.input.pressed("reload")) this.reload();
      else if (this.input.pressed("jump")) this.choose(this.focused);
      else if (this.input.pressed("drop")) this.close();
    }
  }

  relay(equipment, playing) {
    const row = this.button.querySelector(".kit-relay");
    const status = equipment.shieldStatus?.();
    row.hidden = !status?.unlocked || this.input.usingTouch;
    if (!row.hidden) {
      const text = status.active
        ? t("Shield up")
        : status.ready
          ? t("Shield ready")
          : t("Shield in {n} s", { n: Math.ceil(status.left) });
      const label = row.querySelector("span");
      if (label.textContent !== text) label.textContent = text;
      row.querySelector("kbd").textContent = this.input.label("shield");
      row.classList.toggle("ready", status.ready);
      row.classList.toggle("up", status.active);
      this.restyle("relay", status.charge.toFixed(2), row);
    }
    const craft = equipment.craft?.learned ?? [];
    const lines = [];
    if (equipment.pistolsUnlocked && craft.length)
      lines.push(t("Mira's craft: {craft}", { craft: craft.join(t(", ")) }));
    const relay = ["pull", "shield"].filter((name) => equipment.has?.(name));
    if (relay.length)
      lines.push(
        t("Orb: {abilities}", {
          abilities: relay
            .map((name) =>
              name === "pull"
                ? t("hold {key} to pull", { key: this.input.label("throw") })
                : t("{key} shield", { key: this.input.label("shield") }),
            )
            .join(t(", ")),
        }),
      );
    const upgrades = this.root.querySelector(".kit-upgrades");
    const text = lines.join(" · ");
    upgrades.hidden = !text;
    if (upgrades.textContent !== text) upgrades.textContent = text;
    const key = craft.join("|");
    if (this.craftKey === undefined || !equipment.pistolsUnlocked)
      this.craftKey = key;
    else if (key !== this.craftKey && playing) {
      const fresh = craft.filter((name) => !this.craftKey.includes(name));
      this.craftKey = key;
      const latest = fresh.at(-1);
      const kind = Object.keys(CRAFT).find((id) =>
        latest?.startsWith(CRAFT[id].name),
      );
      if (kind)
        equipment.pendingCards.push({
          title: t("Mira's pistol craft"),
          html: t("{craft}: {effect}", {
            craft: latest,
            effect: CRAFT[kind].effect,
          }),
        });
    }
  }

  restyle(name, value, ...elements) {
    if (this.styled[name] === value) return;
    this.styled[name] = value;
    for (const element of elements.length ? elements : [this.reticle])
      element.style.setProperty(`--${name}`, value);
  }

  // Pistols that appear in the holsters get their control card at the first quiet moment; a
  // card cut short within six seconds (a journal or another card over it) comes back once.
  brief(equipment, ready) {
    const now = performance.now();
    const hint = this.hintCard?.classList.contains("on");
    if (this.briefCard) {
      const ours =
        hint &&
        this.hintCard.querySelector(".hint-title")?.textContent ===
          t("Mira's pistols");
      if (ours) this.briefCard.seen = true;
      else {
        if (
          this.briefCard.seen &&
          !this.rebriefed &&
          now - this.briefCard.at < 6000
        ) {
          this.rebriefed = true;
          equipment.briefing = true;
        }
        this.briefCard = null;
      }
    }
    const busy =
      hint ||
      (this.chapterCard?.classList.contains("on") &&
        !this.chapterCard.classList.contains("compact"));
    if (!equipment.briefing) {
      this.quietSince = null;
      this.card(equipment, ready && !this.input.swimming && !busy, now);
      return;
    }
    if (!ready || this.input.swimming || busy) {
      this.quietSince = null;
      return;
    }
    this.quietSince ??= now;
    if (now - this.quietSince < 1200) return;
    this.quietSince = null;
    equipment.briefing = false;
    equipment.briefed = true;
    this.briefCard = { at: now, seen: false };
    this.onBriefing?.();
  }

  card(equipment, ready, now) {
    const pending = equipment.pendingCards;
    const index = pending.findIndex(
      (next) => typeof next !== "string" || equipment.has(next),
    );
    if (index < 0 || !ready) {
      this.cardSince = null;
      return;
    }
    this.cardSince ??= now;
    if (now - this.cardSince < 900) return;
    this.cardSince = null;
    const [next] = pending.splice(index, 1);
    const k = (action) =>
      `<kbd data-control="${action}">${this.input.label(action)}</kbd>`;
    const [title, html] =
      typeof next === "string" ? CARDS[next](k) : [next.title, next.html];
    this.onCard?.(title, html, 10);
  }
}
