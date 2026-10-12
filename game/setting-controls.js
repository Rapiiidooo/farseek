// The settings screen's controls in the menus' look: a select becomes a cycler of its options, kept
// beneath as the value store and for screen readers, and a range shows its filled share.

const CHEVRONS = { "-1": "M14.5 6l-6 6 6 6", 1: "M9.5 6l6 6-6 6" };
const cyclers = new WeakMap();

function part(className, step) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.step = step;
  button.tabIndex = -1;
  button.setAttribute("aria-hidden", "true");
  return button;
}

function arrow(step) {
  const button = part("cycler-arrow", step);
  button.innerHTML = `<svg viewBox="0 0 24 24"><path d="${CHEVRONS[step]}" /></svg>`;
  return button;
}

function cycler(select) {
  const box = document.createElement("div");
  box.className = "cycler";
  const value = part("cycler-value", 1);
  // Every option's name shares one cell, so the widest sets the width and the arrows stay put.
  const names = [...select.options].map((option) => {
    const name = document.createElement("span");
    name.textContent = option.text;
    for (const attribute of ["lang", "translate"])
      if (option.hasAttribute(attribute))
        name.setAttribute(attribute, option.getAttribute(attribute));
    return name;
  });
  const pips = document.createElement("span");
  pips.className = "cycler-pips";
  pips.append(...names.map(() => document.createElement("i")));
  value.append(...names, pips);
  select.replaceWith(box);
  box.append(select, arrow(-1), value, arrow(1));
  // The focus stays put: the menu, not these buttons, takes Enter and Space.
  box.addEventListener("mousedown", (e) => e.preventDefault());
  box.addEventListener("click", (e) => {
    // The row is a label: a click on the cycler must not reach the select as well.
    e.preventDefault();
    const step = Number(e.target.closest("[data-step]")?.dataset.step);
    if (!step) return;
    const count = select.options.length;
    select.selectedIndex = (select.selectedIndex + step + count) % count;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  cyclers.set(select, { box, names, pips: [...pips.children] });
}

// Shows a control's stored value: the cycler's option, or the filled part of a range.
export function showSetting(el) {
  const shown = cyclers.get(el);
  if (shown) {
    for (const marks of [shown.names, shown.pips])
      marks.forEach((mark, i) =>
        mark.classList.toggle("current", i === el.selectedIndex),
      );
  } else if (el.type === "range") {
    const low = Number(el.min);
    const fill = (Number(el.value) - low) / (Number(el.max) - low);
    el.style.setProperty("--fill", String(fill));
  }
}

export function dressSetting(el) {
  if (el instanceof HTMLSelectElement && !cyclers.has(el)) cycler(el);
  showSetting(el);
}
