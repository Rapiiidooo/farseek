import { recordLoadEvent, reportLoadFailure } from "./load-diagnostics.js";

async function boot() {
  const state = { mode: "loading", chapter: null, where: "court" };
  let stage = "Loading game code";
  try {
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
    document.querySelector("#load-step").textContent =
      "The expedition could not load. Try again to continue.";
    document.querySelector("#load-actions").hidden = false;
    const retry = document.querySelector("#load-retry");
    retry.addEventListener("click", () => location.reload());
    retry.focus({ preventScroll: true });
  }
}

boot();
