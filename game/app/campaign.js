import { chapterById } from "../worlds/catalog.js";
import { reach, finish as finishGame, progress, setPistols } from "../store.js";
import * as COURT from "../court.js";

export function createCampaign(app) {
  const {
    state,
    hero,
    hud,
    sound,
    follow,
    camera,
    input,
    credits,
    inventory,
    params,
    worlds,
  } = app;
  const { level } = app.court;
  let starting = null;
  let chapterTimer = null;

  function reloadAt(chapter, { continuing = false } = {}) {
    const url = new URL(location.href);
    for (const key of ["level", "chapter", "w2", "resume"])
      url.searchParams.delete(key);
    if (chapter) url.searchParams.set("chapter", chapter);
    if (continuing) url.searchParams.set("resume", "1");
    location.replace(url);
  }

  function goTo(where, options = {}) {
    hud.hideHealth();
    hud.hideBoss();
    const definition = worlds.definition(where);
    clearTimeout(chapterTimer);
    if (state.where !== where) {
      app.bubbles.clear();
      hud.clearHint();
    }
    state.where = where;
    sound.setPlace(definition.place);
    app.dressHero(where);
    const next = worlds.enter(where, options);
    app.dust.moveTo(next.scene, definition.dust);
    return next;
  }

  function resetWorlds(pistols = false) {
    clearTimeout(chapterTimer);
    inventory.close();
    input.running = false;
    app.equipment?.reset({ pistols });
    state.reading = false;
    hud.showNotes(false);
    hud.clearSubtitle();
    worlds.reset();
    app.bubbles.clear();
    hud.setAddress(["twin", "spiral", "peak"]);
    state.cinematic = null;
    state.crossing = null;
    state.intro = null;
    state.processing = false;
    hud.letterbox(false);
    hud.hideHealth();
    hud.hideBoss();
  }

  function startChapter(id, { continuing = false } = {}) {
    if (starting) return starting;
    starting = app.ui
      .withLoading(
        async () => {
          const chapter = chapterById(id);
          const fromTitle = state.mode === "title";
          resetWorlds(chapter.level >= 4 || (continuing && progress.pistols));
          await worlds.ensure(chapter.where);
          worlds.solveBefore(chapter.where);
          // Whatever the title screen has not prepared yet finishes here, so play never competes with loading.
          worlds.prefetch(chapter.where);
          await worlds.settle((done, total) =>
            app.ui.loading(
              0.75 + (0.25 * done) / Math.max(1, total),
              "Preparing the worlds ahead…",
            ),
          );
          state.chapter = chapter.id;
          state.paused = false;
          state.mode = "play";
          app.menu.close({ fade: true });
          credits.stop();
          hud.show();
          hud.clearHint();
          input.clear();
          sound.start();
          sound.startMusic();
          const next = goTo(chapter.where, { arrive: true });
          if (chapter.where === "court") {
            const start = chapter.id === "floor" ? COURT.FLOOR : COURT.START;
            hero.spawn(
              start.x,
              start.z,
              chapter.id === "floor" ? 0 : 8,
              start.yaw,
            );
          }
          next.startStory(chapter.id);
          sound.setMusic(chapter.music);
          devSpawn();
          if (params.has("barrier") && chapter.id === "checkpoint")
            next.devOpenBarrier();
          follow.snap(hero);
          follow.pitch = 0.28;
          state.intro =
            fromTitle && chapter.where === "court"
              ? {
                  t: 0,
                  pos: camera.position.clone(),
                  quat: camera.quaternion.clone(),
                }
              : null;
          if (!state.intro) follow.update(0, hero, { x: 0, y: 0 });
          if (chapter.id === "court" && !params.has("at")) {
            state.intro = null;
            state.cinematic = app.court.story.introShot();
            state.cinematic.skipOnMove = true;
            // Close behind Nyra from the camp onward: her close-up lighting rises.
            state.cinematic.closeUp = function () {
              return this.t > 7.4;
            };
          }
          hud.chapter(`Level ${chapter.level}`, chapter.title, chapter.start);
          setPistols(app.equipment.pistolsUnlocked);
          reach(chapter.id);
          state.programsAtStart ??= app.renderer.info.programs.length;
          app.ui.lockPointer();
          app.workBudget.milliseconds = 4;
          app.workBudget.hold(2500);
          if (params.has("lit") && chapter.where === "court")
            for (const stela of level.stelae) {
              stela.lit = true;
              app.court.beams.onLit(stela);
            }
          worlds.prefetch(chapter.where);
        },
        {
          retry: () => startChapter(id, { continuing }),
          reload: () => reloadAt(id, { continuing }),
        },
      )
      .catch(app.ui.fail)
      .finally(() => {
        starting = null;
      });
    return starting;
  }

  function devSpawn() {
    const at = params.get("at")?.split(",").map(Number);
    if (at?.length >= 3)
      hero.spawn(at[0], at[1], at[2], ((at[3] ?? 180) * Math.PI) / 180);
  }

  function toTitle({ prefetch = true } = {}) {
    if (!worlds.isResident("court"))
      return app.ui
        .withLoading(
          async () => {
            await worlds.ensure("court");
            toTitle({ prefetch });
          },
          { retry: () => toTitle({ prefetch }), reload: () => reloadAt() },
        )
        .catch(app.ui.fail);
    resetWorlds();
    // The title scene can spare more of each frame for preparing the other worlds.
    app.workBudget.milliseconds = 12;
    hud.clearChapter();
    goTo("court");
    hero.spawn(COURT.START.x, COURT.START.z, 8, COURT.START.yaw);
    state.mode = "title";
    state.paused = false;
    hud.hide();
    credits.stop();
    document.exitPointerLock?.();
    app.ui.refreshMainMenu();
    titleCamera();
    app.menu.open("main");
    sound.setMusic?.("court");
    if (prefetch) worlds.prefetch("court");
  }

  function titleCamera() {
    const t = state.time * 0.05;
    camera.position.set(
      17 + Math.sin(t) * 6,
      12.5 + Math.sin(t * 0.7) * 1.5,
      39.5 - Math.cos(t) * 1.5,
    );
    camera.lookAt(15, 5, 11);
  }

  function cross(to, opts = {}) {
    if (state.crossing) return;
    app.workBudget.hold(2500);
    const crossing = (state.crossing = {
      t: 0,
      to,
      opts,
      swapped: false,
      ready: false,
    });
    const preparation = worlds.ensure(to);
    preparation
      .then(() => {
        crossing.ready = true;
        worlds.prefetch(to);
        hud.warp();
        sound.play("cross");
      })
      .catch((error) => {
        const retry = () =>
          app.ui
            .withLoading(
              async () => {
                await worlds.ensure(to);
                state.crossing = null;
                state.mode = "play";
                hud.show();
                cross(to, opts);
              },
              { retry },
            )
            .catch(app.ui.fail);
        app.ui.fail(error, {
          stage: `Opening ${worlds.definition(to).title}`,
          retry,
          reload: () =>
            reloadAt(worlds.definition(to).starts[0].id, { continuing: true }),
        });
      });
  }

  function updateCrossing(dt) {
    const crossing = state.crossing;
    if (!crossing?.ready) return;
    crossing.t += dt;
    if (!crossing.swapped && crossing.t > 0.42) {
      crossing.swapped = true;
      app.workBudget.hold(2500);
      hud.clearSubtitle();
      hud.clearChapter();
      const definition = worlds.definition(crossing.to);
      const source = worlds.current.exit;
      if (crossing.to === "court") {
        const gate = app.court.gate;
        goTo("court");
        hero.spawn(
          gate.center.x + (crossing.opts.x || 0),
          gate.center.z + 0.9,
          gate.daisTop + 0.02,
          0,
        );
        follow.snap(hero, false);
        sound.setMusic(gate.isOpen ? "court-open" : "court");
        state.chapter = "floor";
        reach("floor");
        app.court.story.start("floor");
      } else {
        // A finale's shot holds the screen until the next world takes over.
        if (crossing.opts.arrive) {
          state.cinematic = state.intro = null;
          hud.letterbox(false);
        }
        const options = crossing.opts.arrive
          ? { arrive: true }
          : crossing.opts.back
            ? { back: crossing.opts.x || 0 }
            : {
                through: {
                  x: hero.pos.x - source.center.x,
                  z: hero.pos.z - source.center.z,
                  feet: hero.feet - source.daisTop,
                },
              };
        const next = goTo(crossing.to, options);
        const chapter = chapterById(definition.starts[0].id);
        state.chapter = chapter.id;
        sound.setMusic(definition.music);
        if (crossing.opts.back && definition.level < 5)
          follow.snap(hero, false);
        else next.startStory();
        const fresh = reach(chapter.id);
        if (fresh && (!crossing.opts.back || definition.level >= 5)) {
          const show = () =>
            hud.chapter(`Level ${chapter.level}`, chapter.title, chapter.start);
          if (definition.level < 5) chapterTimer = setTimeout(show, 900);
          else show();
        }
      }
    }
    if (crossing.t > 1.15) state.crossing = null;
  }

  // The last world's finale finishes the campaign and rolls the credits; a finale that leads on
  // (the space crossing to the vault) crosses into that world once its shot ends.
  function finale() {
    if (state.mode !== "play" || !worlds.current.finaleShot) return;
    const definition = worlds.definitionForCurrent();
    const onward = worlds.finaleTo(worlds.definitions.indexOf(definition));
    if (!onward) finishGame();
    app.workBudget.hold(onward ? 40000 : 120000);
    sound.setMusic("finale");
    sound.setPlace(definition.place);
    const shown = () => {
      if (onward) return cross(onward.id, { arrive: true });
      state.mode = "credits";
      hud.hide();
      document.exitPointerLock?.();
      app.ui.skipHelp();
      credits.play(() => toTitle(), { speed: 28, linger: true });
    };
    state.cinematic = worlds.current.finaleShot(hero, shown, {
      onward: !!onward,
    });
  }

  function knockedOut(respawn) {
    state.processing = true;
    hud.processed(() => {
      respawn();
      follow.snap(hero);
      state.processing = false;
    });
  }

  return {
    startChapter,
    goTo,
    toTitle,
    titleCamera,
    cross,
    updateCrossing,
    finale,
    knockedOut,
  };
}
