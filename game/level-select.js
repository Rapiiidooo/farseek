// The levels screen: one world at a time, its picture centre stage, turned with left and right.
// Worlds not reached stay behind one sealed door, so the screen never tells how many lie ahead;
// the local test session still opens every chapter.
import { createCarousel } from "./carousel.js";
import { CHAPTERS, WORLDS } from "./worlds/catalog.js";
import { progress } from "./store.js";
import { LAB_SESSION } from "./local-preview.js";
import { svg } from "./glyph-icons.js";
import { t } from "./i18n.js";

// A plain carved ring with three dormant lenses round a sealed medallion: no world shows through.
const SEALED_DOOR = `<svg viewBox="0 0 240 240" aria-hidden="true">
  <defs>
    <radialGradient id="sealed-membrane" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="#2d2824" />
      <stop offset="1" stop-color="#0f0d0c" />
    </radialGradient>
    <linearGradient id="sealed-stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d4a373" />
      <stop offset="0.55" stop-color="#b57f4f" />
      <stop offset="1" stop-color="#8a5433" />
    </linearGradient>
  </defs>
  <circle cx="120" cy="120" r="85" fill="url(#sealed-membrane)" />
  <circle cx="120" cy="120" r="96" fill="none" stroke="url(#sealed-stone)" stroke-width="22" />
  <g fill="none" stroke="#5a3822" stroke-width="1.6" opacity="0.8">
    <circle cx="120" cy="120" r="106" />
    <circle cx="120" cy="120" r="86" />
    <circle cx="120" cy="120" r="96" stroke-dasharray="3 9" />
  </g>
  <g fill="#1d5f63" stroke="#0b2729" stroke-width="2.5">
    <circle cx="120" cy="24" r="7.5" />
    <circle cx="203.1" cy="168" r="7.5" />
    <circle cx="36.9" cy="168" r="7.5" />
  </g>
  <circle cx="120" cy="120" r="27" fill="rgba(16, 12, 10, 0.85)" stroke="rgba(232, 207, 164, 0.45)" stroke-width="1.6" stroke-dasharray="5 4" />
  ${svg("unknown").replace("<svg ", '<svg class="sealed-glyph" x="99" y="99" width="42" height="42" ')}
</svg>`;

export function createLevelSelect(panel, { menu, sound, keys }) {
  const carousel = createCarousel(panel, { onTurn: turned });
  // Each world's picture is fetched the first time the screen opens with it, then kept.
  const shots = new Map();
  const shot = (id) => {
    if (!shots.has(id)) {
      const image = new Image();
      image.className = "level-shot";
      image.alt = "";
      image.decoding = "async";
      image.addEventListener("load", () => image.classList.add("ready"), {
        once: true,
      });
      image.src = new URL(`./ui/levels/${id}.webp`, import.meta.url).href;
      shots.set(id, image);
    }
    return shots.get(id);
  };

  const element = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  function slide(world, kicker, title, blurb) {
    const card = element("article", "carousel-slide level-slide");
    if (world) card.dataset.world = world;
    const info = element("div", "level-info");
    info.append(
      element("p", "kicker", kicker),
      element("h3", "", title),
      element("p", "blurb", blurb),
    );
    card.append(info);
    return card;
  }

  function refresh() {
    // A finish recorded before the vault belongs to the drowned archive, a later one to the vault.
    const finalLevel =
      progress.campaign >= 7
        ? WORLDS.length
        : WORLDS.find((world) => world.entry === "finale")?.level - 1 ||
          WORLDS.length;
    const reached = (c) => LAB_SESSION || progress.reached.has(c.id);
    const slides = [];
    let next = null;
    for (const world of WORLDS) {
      const starts = CHAPTERS.filter((c) => c.level === world.level);
      if (!starts.some(reached)) {
        next ??= world.level;
        continue;
      }
      const card = slide(
        world.id,
        t("Level {n}", { n: world.level }),
        world.title,
        starts[0].blurb,
      );
      card.prepend(shot(world.id));
      const info = card.querySelector(".level-info");
      if (world.level === finalLevel && progress.finished)
        info.append(element("p", "level-state", t("Completed.")));
      const row = element("div", "level-starts");
      for (const c of starts) {
        const button = element("button", "");
        button.type = "button";
        button.dataset.action = "chapter";
        button.dataset.chapter = c.id;
        if (!reached(c)) button.dataset.locked = "";
        button.innerHTML = `<span class="menu-glyph" aria-hidden="true">${svg("peak")}</span><span class="label"></span>`;
        button.querySelector(".label").textContent = c.start;
        row.append(button);
      }
      info.append(row);
      slides.push(card);
    }
    if (next !== null) {
      const card = slide(
        null,
        t("Level {n}", { n: next }),
        t("Unknown"),
        t("Open the next door to learn where it leads."),
      );
      card.classList.add("sealed");
      card.insertAdjacentHTML(
        "afterbegin",
        `<div class="level-door">${SEALED_DOOR}</div>`,
      );
      slides.push(card);
    }
    const last = CHAPTERS.find((c) => c.id === progress.last)?.where;
    carousel.fill(
      slides,
      last ? slides.findIndex((card) => card.dataset.world === last) : 0,
    );
    for (const key of panel.querySelectorAll(".carousel-key"))
      key.innerHTML = keys(key.dataset.key);
  }

  // The new world's first start takes the focus; Back keeps it where the player took it, though
  // not where a sealed door, with no start to offer, left it.
  function turned(_, left) {
    const back = panel.querySelector(':scope > nav [data-action="back"]');
    const keep =
      back.classList.contains("focus") &&
      !!left?.querySelector(".level-starts button:not([data-locked])");
    sound.start();
    sound.play("ui");
    menu.focus(keep ? menu.items().indexOf(back) : 0);
  }

  return { refresh, turn: (direction) => carousel.turn(direction) };
}
