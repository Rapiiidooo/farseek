import { recordLoadEvent, reportLoadFailure } from "./load-diagnostics.js";
import { loadLanguage, translatePage, t } from "./i18n.js";

async function boot() {
  const state = { mode: "loading", chapter: null, where: "court" };
  let stage = "Loading game code";
  try {
    // The game's modules translate their text as they evaluate, so the table comes first.
    await loadLanguage();
    translatePage();
    recordLoadEvent(state, "bootstrap-import");
    const { startGame } = await import("./app/bootstrap.js");
    stage = "Initializing game";
    recordLoadEvent(state, "bootstrap-ready");
    startGame();
  } catch (error) {
    reportLoadFailure(error, stage, state, null);
    console.error(error?.stack || error);
    const fill = document.querySelector("#load-fill");
    fill.style.transform = getComputedStyle(fill).transform;
    fill.parentElement.classList.add("driven", "failed");
    document.querySelector("#load-tip").hidden = true;
    document.querySelector("#load-step").textContent = t(
      "The expedition could not load. Try again to continue.",
    );
    document.querySelector("#load-actions").hidden = false;
    const retry = document.querySelector("#load-retry");
    retry.addEventListener("click", () => location.reload());
    retry.focus({ preventScroll: true });
  }
}

boot();
