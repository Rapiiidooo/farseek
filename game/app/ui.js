import { Menu } from "../menu.js";
import { createControlsScreen } from "../controls-screen.js";
import {
  settings,
  saveSettings,
  progress,
  resetProgress,
  CHAPTERS,
} from "../store.js";
import { WORLDS } from "../worlds/catalog.js";
import { RELICS } from "../relics.js";
import { applyVoiceVolume } from "../voice.js";
import { craftLine } from "../pistol-craft.js";
import { recordLoadEvent, reportLoadFailure } from "../load-diagnostics.js";
import { createLoadBar } from "../load-bar.js";
import { t } from "../i18n.js";
import {
  LOCAL_PREVIEW,
  LAB_SESSION,
  levelPreviewURL,
} from "../local-preview.js";

// Seconds each world takes to prepare on the reference desktop; restoring a released one takes half.
const PREPARE_SECONDS = {
  court: 1.6,
  two: 0.7,
  three: 0.7,
  four: 1,
  five: 1.2,
  six: 0.7,
  vault: 0.8,
};
const WORLD_SPAN = [0.06, 0.96];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const named = (title) => title.replace(/^The /, "the ");

export function createUI(app) {
  const {
    state,
    input,
    hud,
    sound,
    touch,
    inventory,
    params,
    relics,
    credits,
  } = app;
  inventory.onBriefing = () => hud.pistolsHint();
  inventory.onCard = (title, html, seconds) =>
    hud.hint(title, html, seconds, { queue: true });
  const loadBar = createLoadBar(document.querySelector("#loading .bar"));
  const loadStep = document.querySelector("#load-step");
  const loadTip = document.querySelector("#load-tip");
  const pips = new Map(
    WORLDS.map(({ id }) => {
      const pip = document.createElement("li");
      pip.dataset.world = id;
      pip.dataset.state = id === "court" ? "active" : "later";
      pip.hidden = id !== "court";
      return [id, pip];
    }),
  );
  document.querySelector("#load-worlds").replaceChildren(...pips.values());
  // Tips open on "Press" or "Tap" so a key's label never reads as a word (AZERTY's roll is A).
  const tips = [
    () =>
      t("{press} to switch between walking and running.", {
        press: hud.press("pace", true),
      }),
    () =>
      t("{press} to open the expedition kit.", {
        press: hud.press("inventory", true),
      }),
    () =>
      t("{press} to roll out of harm's way.", {
        press: hud.press("roll", true),
      }),
    () => t("Spent health pips swell back after a quiet spell out of a fight."),
    () => t("Difficulty, controls and subtitles can be changed in Settings."),
  ];
  // Not Math.random: seeded captures expect the game's own draws to come first.
  let tipIndex = Math.floor(performance.timeOrigin / 1000);
  // The first session times the court against the reference desktop to pace later stages.
  let session = { id: 0, plan: null, calibrate: performance.now() };
  let pace = 1;
  setTimeout(() => session.id === 0 && state.loading && showTip(), 1200);
  const loadActions = document.querySelector("#load-actions");
  const loadRetry = document.querySelector("#load-retry");
  const loadFailures = new Map();
  let recovery = null;
  function pollRecovery() {
    if (recovery && (input.pressed("jump") || input.pressed("skip")))
      loadRetry.click();
  }
  loadRetry.addEventListener("click", async () => {
    if (!recovery || loadRetry.disabled) return;
    const retry = recovery;
    recovery = null;
    loadRetry.disabled = true;
    loadActions.hidden = true;
    input.clear();
    recordLoadEvent(state, "retry");
    try {
      await retry();
    } catch (error) {
      fail(error, { retry });
    }
  });
  // Heads for `fraction` over about `seconds` on the reference desktop.
  function loading(fraction, text, seconds = 0.4) {
    loadBar.stage(fraction, seconds * pace);
    if (text) say(text);
  }

  function say(text) {
    if (loadStep.textContent === text) return;
    recordLoadEvent(state, "loading", { fraction: loadBar.value, text });
    loadStep.textContent = text;
    // Each loading step is a mark on the page's timeline, so a slow start can be taken apart.
    performance.mark(text);
  }

  function showTip() {
    loadTip.innerHTML = tips[tipIndex++ % tips.length]();
    loadTip.hidden = false;
    loadTip.classList.remove("shown");
    loadTip.getBoundingClientRect();
    loadTip.classList.add("shown");
  }

  // A world the player has not reached keeps its name and its mark to itself, so the screen
  // never tells how many doors lie ahead.
  function known(id) {
    return (
      id === "court" ||
      id === session.start ||
      app.worlds.definition(id).starts.some((c) => progress.reached.has(c.id))
    );
  }

  function markWorlds(plan = new Map()) {
    for (const [id, pip] of pips) {
      pip.hidden = !known(id);
      pip.dataset.state = app.worlds.isResident(id)
        ? "ready"
        : plan.has(id)
          ? "queued"
          : "later";
    }
  }

  // The worlds a start prepares before play; their preparation events then move the bar.
  function loadPlan(worlds, { start } = {}) {
    session.start = start;
    const plan = new Map(
      worlds.map(({ id, restore }) => [
        id,
        (PREPARE_SECONDS[id] ?? 1) * (restore ? 0.5 : 1),
      ]),
    );
    let total = 0;
    for (const seconds of plan.values()) total += seconds;
    Object.assign(session, { plan, total, done: 0 });
    markWorlds(plan);
    if (!plan.size) loadBar.reach(WORLD_SPAN[1]);
    const running = worlds.find((world) => world.running);
    if (running) worldEvent("build", running);
  }

  function planned(done) {
    const [from, to] = WORLD_SPAN;
    return from + ((to - from) * done) / session.total;
  }

  function worldEvent(event, { id } = {}) {
    const seconds = session.plan?.get(id);
    if (seconds === undefined) return;
    if (event === "build" || event === "restore") {
      session.since = performance.now();
      pips.get(id).dataset.state = "active";
      loadBar.stage(planned(session.done + seconds), seconds * pace);
      say(
        known(id)
          ? t("Preparing {world}…", {
              world: named(app.worlds.definition(id).title),
            })
          : t("Preparing the worlds ahead…"),
      );
    } else if (event === "prepared") {
      session.plan.delete(id);
      session.done += seconds;
      pips.get(id).dataset.state = "ready";
      loadBar.reach(planned(session.done));
      if (session.since) {
        const took = (performance.now() - session.since) / 1000 / seconds;
        pace = clamp((pace + took) / 2, 0.6, 8);
      }
    }
  }

  // A world lit outside a planned start: the court of the first load.
  function lighting(id) {
    if (session.plan?.has(id)) return;
    loading(
      0.94,
      t("Lighting {world}…", {
        world: named(app.worlds.definition(id).title),
      }),
      0.9,
    );
  }

  function openNotes(which = "first") {
    app.equipment?.cancelFire();
    state.reading = which;
    hud.clearHint();
    hud.showNotes(true, which);
    sound.play("paper");
    return true;
  }

  function closeNotes() {
    const which = state.reading;
    state.reading = false;
    hud.showNotes(false);
    sound.play("paper");
    input.clear();
    if (which === "first" && !app.court.story.notesRead) {
      app.court.story.notesRead = true;
      hud.subtitle(t("They went through the door. Then so will I."), 4);
      app.court.story.holdHints(4.3);
    }
    if (which === "mira") app.worlds.get("three").readJournal();
  }

  function pause(on) {
    if (state.mode !== "play" || state.paused === on) return;
    state.paused = on;
    if (on) {
      app.equipment?.cancelFire();
      inventory.close();
      hud.compactChapter();
      const chapter = CHAPTERS.find((c) => c.id === state.chapter);
      document.querySelector("#pause-where").textContent = t(
        "Level {n} · {title}",
        {
          n: chapter?.level ?? 1,
          title: chapter?.title ?? "",
        },
      );
      document.querySelector("#pause-objective").textContent =
        document.querySelector("#objective").textContent;
      menu.open("pause", { paused: true });
      document.exitPointerLock?.();
      sound.duck(true);
    } else {
      menu.close();
      input.clear();
      sound.duck(false);
      lockPointer();
    }
  }

  function lockPointer() {
    if (!params.has("nolock") && !input.usingTouch) input.lockPointer();
  }

  const menu = new Menu(document.querySelector("#menu"), {
    onAction: (action, el) => !state.loading && menuAction(action, el),
    onChange: (el) => settingChanged(el),
  });
  menu.moveKeys = (direction) => input.binding(direction);
  const controls = createControlsScreen({
    input,
    saveSettings: () => {
      saveSettings();
      refreshMainMenu();
    },
    menu,
    sound,
  });

  let confirmAction = null;
  function menuAction(action, el) {
    sound.start();
    sound.play("ui");
    switch (action) {
      case "continue":
        return app.campaign.startChapter(progress.last || "court", {
          continuing: true,
        });
      case "new":
        return app.campaign.startChapter("court");
      case "levels":
        refreshLevels();
        return menu.push("levels");
      case "relics":
        refreshRelics();
        return menu.push("relics");
      case "inspect-relic":
        return inspectRelic(el.dataset.relic);
      case "settings":
        return menu.push("settings");
      case "controls":
        controls.render();
        return menu.push("controls");
      case "bind":
      case "bind-pad":
        return controls.begin(el);
      case "reset-bindings":
        return controls.reset();
      case "credits":
        menu.close({ fade: true });
        skipHelp();
        return credits.play(() => {
          refreshMainMenu();
          menu.open("main");
        });
      case "chapter":
        if (LOCAL_PREVIEW && !LAB_SESSION) {
          location.href = levelPreviewURL(el.dataset.chapter);
          return;
        }
        return app.campaign.startChapter(el.dataset.chapter);
      case "resume":
      case "back-root":
        if (state.mode === "play") return pause(false);
        return;
      case "restart":
        return app.campaign.startChapter(
          state.chapter === "floor" ? "floor" : state.chapter,
          { continuing: true },
        );
      case "title":
        return app.campaign.toTitle();
      case "reset-progress":
        confirmAction = () => {
          resetProgress();
          relics.restore();
          refreshMainMenu();
        };
        document.querySelector("#confirm-text").textContent = t(
          "Forget every level reached and relic found in this browser?",
        );
        return menu.push("confirm");
      case "confirm-yes":
        confirmAction?.();
        confirmAction = null;
        return menu.back();
      case "back":
        return menu.back();
    }
  }

  function refreshMainMenu() {
    const found = RELICS.filter((r) => progress.relics.has(r.id)).length;
    for (const b of document.querySelectorAll('#menu [data-action="relics"]'))
      b.textContent = found
        ? t("Relics · {found} of {total}", { found, total: RELICS.length })
        : t("Relics");
    const cont = document.querySelector('#menu [data-action="continue"]');
    cont.hidden = !progress.last || progress.last === "court";
    const chapter = CHAPTERS.find((c) => c.id === progress.last);
    if (chapter)
      cont.textContent = t("Continue · {title}", { title: chapter.title });
    document.querySelector('[data-help="menu"]').innerHTML = input.usingTouch
      ? t("Tap to choose")
      : t("{keys} or mouse to choose · <kbd>Enter</kbd> to confirm", {
          keys: hud.keys("KeyW", "KeyS"),
        });
  }

  function skipHelp() {
    document.querySelector('[data-help="skip"]').innerHTML = input.usingTouch
      ? t("Tap to skip")
      : t("<kbd>Esc</kbd> or <kbd>Enter</kbd> to skip");
  }

  function refreshLevels() {
    const list = document.querySelector("#level-list");
    list.innerHTML = "";
    // A finish recorded before the vault belongs to the drowned archive, a later one to the vault.
    const finalLevel =
      progress.campaign >= 7
        ? WORLDS.length
        : WORLDS.find((world) => world.entry === "finale")?.level - 1 ||
          WORLDS.length;
    for (const definition of WORLDS) {
      const n = definition.level;
      const starts = CHAPTERS.filter((c) => c.level === n);
      const open = starts.filter(
        (c) => LOCAL_PREVIEW || progress.reached.has(c.id),
      );
      const card = document.createElement("div");
      card.className = `level-card${n === 1 ? "" : ` ${definition.id}`}${open.length ? "" : " locked"}`;
      card.innerHTML = `<p class="num">${t("Level {n}", { n })}</p><h3>${starts[0].title}</h3><p class="blurb">${starts[0].blurb}</p>`;
      for (const c of starts) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.action = "chapter";
        b.dataset.chapter = c.id;
        b.textContent = c.start;
        b.disabled = !LOCAL_PREVIEW && !progress.reached.has(c.id);
        card.appendChild(b);
      }
      if (!open.length) {
        const p = document.createElement("p");
        p.className = "state";
        p.textContent = definition.lockHint;
        card.appendChild(p);
      } else if (n === finalLevel && progress.finished) {
        const p = document.createElement("p");
        p.className = "state";
        p.textContent = t("Completed.");
        card.appendChild(p);
      }
      list.appendChild(card);
    }
  }

  // Each relic as a card: what it is once found, and only its world before.
  function refreshRelics() {
    const list = document.querySelector("#relic-list");
    list.innerHTML = "";
    const world = (r) => WORLDS.findIndex((w) => w.id === r.where);
    const all = relics.list().sort((a, b) => world(a) - world(b));
    const found = all.filter((r) => r.found).length;
    document.querySelector("#relic-count").textContent = found
      ? t("{found} of {total} found.", { found, total: all.length })
      : t("{total} relics lie hidden along the way. None found yet.", {
          total: all.length,
        });
    for (const r of all) {
      const card = document.createElement("div");
      card.className = `level-card relic${r.found ? "" : " missing"}`;
      card.dataset.relic = r.id;
      const add = (tag, cls, text) => {
        const el = document.createElement(tag);
        el.className = cls;
        el.textContent = text;
        card.appendChild(el);
      };
      add("p", "num", r.world);
      add("h3", "", r.found ? r.name : t("Not found yet"));
      add("p", "blurb", r.found ? r.line : r.hint);
      if (r.found && r.entry?.length) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = "inspect-relic";
        button.dataset.relic = r.id;
        button.textContent = t("Inspect");
        button.setAttribute(
          "aria-label",
          t("Inspect {name}", { name: r.name }),
        );
        card.appendChild(button);
      }
      list.appendChild(card);
    }
  }

  function inspectRelic(id) {
    const relic = RELICS.find((r) => r.id === id);
    if (!relic?.entry?.length || !progress.relics.has(id)) return false;
    document.querySelector("#relic-note-world").textContent = relic.world;
    document.querySelector("#relic-note-title").textContent = relic.name;
    const paragraphs = relic.entry.map((text) => {
      const paragraph = document.createElement("p");
      paragraph.className = "blurb";
      paragraph.textContent = text;
      return paragraph;
    });
    const craft = craftLine(id);
    if (craft) {
      const paragraph = document.createElement("p");
      paragraph.className = "blurb craft";
      paragraph.textContent = craft;
      paragraphs.push(paragraph);
    }
    document.querySelector("#relic-note-text").replaceChildren(...paragraphs);
    menu.push("relic-note");
    menu.panel().scrollTop = 0;
    return true;
  }

  function wireMenu() {
    if (LOCAL_PREVIEW) {
      for (const button of document.querySelectorAll('[data-action="levels"]'))
        button.textContent = "Test levels";
      const tools = document.createElement("nav");
      tools.id = "local-tools";
      tools.setAttribute("aria-label", "Local tools");
      tools.innerHTML = `<a href="./labs">Asset lab</a><a href="./?lab=1">Test levels</a>${LAB_SESSION ? "<span>Test session · campaign save preserved</span>" : ""}`;
      document.body.append(tools);
      const subtitle = document.createElement("p");
      subtitle.className = "tagline";
      subtitle.textContent =
        "All chapters are available in a separate local test session.";
      document
        .querySelector('[data-screen="levels"] .panel-title')
        .after(subtitle);
    }
    const bind = (id, key, parse = Number) => {
      const el = document.getElementById(id);
      if (el.type === "checkbox") el.checked = !!settings[key];
      else el.value = settings[key];
      el.dataset.setting = key;
      el.dataset.parse = parse === Number ? "number" : "string";
    };
    bind("set-difficulty", "difficulty", String);
    bind("set-sensitivity", "sensitivity");
    bind("set-invert", "invertY");
    bind("set-volume", "volume");
    bind("set-music", "music");
    bind("set-ambience", "ambience");
    bind("set-effects", "effects");
    bind("set-voice", "voice");
    bind("set-quality", "quality", String);
    bind("set-language", "language", String);
    bind("set-markers", "markers");
    bind("set-hints", "hints");
    bind("set-shake", "shake");
    bind("set-aim", "aimMode", String);
    bind("set-invert-x", "invertX");
    bind("set-fov", "fov");
    bind("set-recenter", "recenter");
    bind("set-subtitle-size", "subtitleSize", String);
    bind("set-subtitle-backing", "subtitleBacking", String);
    bind("set-contrast", "contrast");
    bind("set-reduce-motion", "reduceMotion");
    app.follow.settings = settings;
    applyLook();
    skipHelp();
  }

  // Options that restyle the page: subtitles, contrast and motion, as classes on the body.
  function applyLook() {
    const body = document.body.classList;
    for (const size of ["small", "large"])
      body.toggle(`subtitles-${size}`, settings.subtitleSize === size);
    for (const backing of ["soft", "solid"])
      body.toggle(`subtitles-${backing}`, settings.subtitleBacking === backing);
    body.toggle("high-contrast", !!settings.contrast);
    body.toggle("reduce-motion", !!settings.reduceMotion);
    document.querySelector("#fov-value").textContent = `${settings.fov}°`;
  }

  function settingChanged(el) {
    const key = el.dataset?.setting;
    if (!key) return;
    settings[key] =
      el.type === "checkbox"
        ? el.checked
        : el.dataset.parse === "number"
          ? Number(el.value)
          : el.value;
    saveSettings();
    if (["volume", "music", "ambience", "effects"].includes(key))
      sound.applyVolumes();
    if (key === "voice") applyVoiceVolume(sound);
    if (key === "quality") app.rendering.resize();
    if (key === "language") relaunch();
    applyLook();
  }

  // The game's text is translated as its modules load, so another language needs a reload;
  // a level in progress starts again from its own start.
  function relaunch() {
    const url = new URL(location.href);
    for (const name of ["lang", "chapter", "level", "w2", "resume"])
      url.searchParams.delete(name);
    if (state.mode === "play" && state.chapter) {
      url.searchParams.set("chapter", state.chapter);
      url.searchParams.set("resume", "1");
    }
    location.replace(url);
  }

  function ready() {
    recovery = null;
    loadActions.hidden = true;
    if (session.calibrate)
      pace = clamp((performance.now() - session.calibrate) / 2100, 0.7, 6);
    session = { id: session.id, plan: null };
    const id = session.id;
    markWorlds();
    loadBar.reach(1, 0.2);
    say(t("Ready."));
    const overlay = document.querySelector("#loading");
    overlay.classList.add("leaving");
    setTimeout(() => {
      if (session.id === id && !state.loading) overlay.hidden = true;
    }, 850);
  }

  async function withLoading(
    work,
    { retry = () => location.reload(), reload = () => location.reload() } = {},
  ) {
    const overlay = document.querySelector("#loading");
    state.loading = true;
    session = { id: session.id + 1, plan: null };
    loadBar.reset();
    markWorlds();
    overlay.hidden = false;
    overlay.classList.remove("leaving");
    recovery = null;
    loadActions.hidden = true;
    showTip();
    loading(0.05, t("Opening a door to somewhere else…"), 0.3);
    // The screen paints before the first preparation step can hold the page; a frozen frame
    // loop in a capture falls back on the timer.
    await new Promise((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve));
      setTimeout(resolve, 100);
    });
    try {
      const result = await work();
      state.loading = false;
      ready();
      return result;
    } catch (error) {
      loadFailures.set(error, { stage: loadStep.textContent, retry, reload });
      throw error;
    }
  }

  function reportFailure(error, stage = loadStep.textContent) {
    console.error(error?.stack || error);
    let context;
    try {
      context = app.diagnostics?.loadContext();
    } catch (contextError) {
      context = { unavailable: String(contextError) };
    }
    reportLoadFailure(error, stage, state, app.renderer, context);
  }

  function fail(error, options = {}) {
    const failure = loadFailures.get(error) || options;
    reportFailure(error, failure.stage);
    loadFailures.delete(error);
    state.mode = "loading";
    state.loading = true;
    menu.close();
    inventory.close();
    hud.hide();
    document.exitPointerLock?.();
    const overlay = document.querySelector("#loading");
    overlay.hidden = false;
    overlay.classList.remove("leaving");
    session = { id: session.id + 1, plan: null };
    loadBar.freeze();
    markWorlds();
    loadTip.hidden = true;
    say(t("The expedition could not load. Try again to continue."));
    const moduleFailure =
      app.assets.failedErrors.has(error) ||
      /dynamically imported module|module script/i.test(
        String(error?.message || error),
      );
    recovery =
      (moduleFailure ? failure.reload : failure.retry) ||
      (() => location.reload());
    loadRetry.disabled = false;
    loadActions.hidden = false;
    loadRetry.focus({ preventScroll: true });
  }

  return {
    menu,
    openNotes,
    closeNotes,
    pause,
    lockPointer,
    refreshMainMenu,
    skipHelp,
    wireMenu,
    loading,
    loadPlan,
    worldEvent,
    lighting,
    showTip,
    ready,
    withLoading,
    reportFailure,
    fail,
    pollRecovery,
  };
}
