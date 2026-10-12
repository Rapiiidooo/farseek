// One thing at a time, centre stage, its neighbours peeking in at the sides, smaller and dimmed.
// The arrow medallions, a click on a neighbour, a sideways swipe and the menu's left and right
// (`turn`) move it along; the pips below mark where it stands. A pip takes its slide's
// `data-world`, and with it that world's colour. Only the card in the middle offers its menu
// buttons, so the menu's focus never lands on a neighbour; a button marked `data-locked` stays
// shut there too. `onTurn(card, left)` follows each turn with the new card and the one it left.
const PLACES = ["before", "prev", "current", "next", "after"];
const SWIPE = 48;

export function createCarousel(panel, { onTurn } = {}) {
  const stage = panel.querySelector(".carousel-stage");
  const pips = panel.querySelector(".carousel-pips");
  const arrows = [...panel.querySelectorAll(".carousel-turn")];
  let slides = [];
  let index = 0;
  let swallowUntil = 0;

  function show() {
    slides.forEach((slide, i) => {
      slide.dataset.place = PLACES[Math.max(-2, Math.min(2, i - index)) + 2];
      slide.setAttribute("aria-hidden", String(i !== index));
    });
    for (const button of stage.querySelectorAll("button[data-action]")) {
      button.disabled =
        "locked" in button.dataset ||
        button.closest(".carousel-slide") !== slides[index];
      if (button.disabled) button.classList.remove("focus");
    }
    [...pips.children].forEach((pip, i) =>
      pip.classList.toggle("current", i === index),
    );
    for (const arrow of arrows) {
      const to = index + Number(arrow.dataset.turn);
      arrow.disabled = to < 0 || to >= slides.length;
    }
  }

  function fill(items, at = 0) {
    slides = items;
    index = Math.max(0, Math.min(items.length - 1, at));
    stage.replaceChildren(...items);
    pips.replaceChildren(
      ...items.map((slide) => {
        const pip = document.createElement("li");
        if (slide.dataset.world) pip.dataset.world = slide.dataset.world;
        return pip;
      }),
    );
    show();
  }

  function turn(direction) {
    const to = index + direction;
    if (!direction || to < 0 || to >= slides.length) return false;
    const left = slides[index];
    index = to;
    show();
    // The medallion on that side lights for a moment, whichever way the turn came.
    const arrow = arrows.find((a) => Number(a.dataset.turn) === direction);
    if (arrow) {
      arrow.classList.remove("lit");
      void arrow.offsetWidth;
      arrow.classList.add("lit");
    }
    onTurn?.(slides[index], left);
    return true;
  }

  for (const arrow of arrows)
    arrow.addEventListener("click", () => turn(Number(arrow.dataset.turn)));
  stage.addEventListener(
    "click",
    (e) => {
      // The click that ends a swipe lands on whatever lies under the finger: it is not a choice.
      if (performance.now() < swallowUntil) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      const i = slides.indexOf(e.target.closest(".carousel-slide"));
      if (i >= 0 && i !== index) {
        e.stopPropagation();
        turn(Math.sign(i - index));
      }
    },
    true,
  );

  // A finger pulls the row along and turns it once let go far enough to the side.
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || !e.isPrimary) return;
    drag = { id: e.pointerId, x: e.clientX, dx: 0 };
  });
  addEventListener("pointermove", (e) => {
    if (e.pointerId !== drag?.id) return;
    drag.dx = e.clientX - drag.x;
    if (!drag.moving && Math.abs(drag.dx) < 10) return;
    drag.moving = true;
    stage.classList.add("dragging");
    stage.style.setProperty("--drag", `${drag.dx}px`);
  });
  const release = (e) => {
    if (e.pointerId !== drag?.id) return;
    const { dx } = drag;
    drag = null;
    stage.classList.remove("dragging");
    stage.style.removeProperty("--drag");
    // A tap that trembles a little still presses what it lands on.
    if (Math.abs(dx) < 24) return;
    swallowUntil = performance.now() + 400;
    if (e.type === "pointerup" && Math.abs(dx) > SWIPE) turn(dx < 0 ? 1 : -1);
  };
  addEventListener("pointerup", release);
  addEventListener("pointercancel", release);

  return {
    fill,
    turn,
    get current() {
      return slides[index];
    },
  };
}
