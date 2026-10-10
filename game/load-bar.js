// The loading bar: the empty track (its span) slides right over the worlds' band as work is done.
// Each stage eases toward its end as a CSS transition, which the compositor keeps playing while
// preparation blocks the page, and stops short until it is done.
const CREEP = 0.9;
const STAGE = [0.3, 0.6, 0.4, 1];
const REACH = [0.2, 0.7, 0.3, 1];

function bezier([x1, y1, x2, y2], x) {
  const at = (a, b, t) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2;
    if (at(x1, x2, t) < x) low = t;
    else high = t;
  }
  return at(y1, y2, (low + high) / 2);
}

export function createLoadBar(bar) {
  const fill = bar.querySelector("span");
  let target = 0;
  let motion = { from: 0, to: 0, start: 0, seconds: 0, curve: STAGE };

  // After a long task the page's style clock still reads the frame before it, behind what the
  // compositor drew, so the motion's own timing decides when it is further along.
  function drawn() {
    const width = bar.getBoundingClientRect().width;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(fill).transform);
    const styled = width ? matrix.m41 / width : motion.from;
    const { from, to, start, seconds, curve } = motion;
    const t = seconds
      ? Math.min(1, (performance.now() - start) / 1000 / seconds)
      : 1;
    const timed = from + (to - from) * bezier(curve, t);
    return Math.min(1, Math.max(0, styled, timed));
  }

  function place(to, seconds, curve = STAGE) {
    motion = { from: drawn(), to, start: performance.now(), seconds, curve };
    fill.style.transition = seconds
      ? `transform ${seconds}s cubic-bezier(${curve})`
      : "none";
    fill.style.transform = `translateX(${(to * 100).toFixed(3)}%)`;
  }

  // Takes over at the fraction drawn, from the page's opening animation or a running stage.
  function hold() {
    const from = drawn();
    place(from, 0);
    bar.classList.add("driven");
    fill.getBoundingClientRect();
    return from;
  }

  return {
    get value() {
      return target;
    },
    reset() {
      target = 0;
      motion = { from: 0, to: 0, start: 0, seconds: 0, curve: STAGE };
      bar.classList.remove("failed");
      bar.classList.add("driven");
      fill.style.transition = "none";
      fill.style.transform = "translateX(0%)";
      fill.getBoundingClientRect();
      bar.setAttribute("aria-valuenow", "0");
    },
    // Heads for `to` over about `seconds`, stopping short until the next stage takes over.
    stage(to, seconds) {
      const from = hold();
      target = Math.max(target, from, to);
      place(from + (target - from) * CREEP, Math.max(0.2, seconds));
      bar.setAttribute("aria-valuenow", String(Math.round(from * 100)));
    },
    reach(to, seconds = 0.3) {
      const from = hold();
      target = Math.max(target, from, to);
      place(target, seconds, REACH);
      bar.setAttribute("aria-valuenow", String(Math.round(target * 100)));
    },
    freeze() {
      target = hold();
      bar.classList.add("failed");
      bar.setAttribute("aria-valuenow", String(Math.round(target * 100)));
    },
  };
}
