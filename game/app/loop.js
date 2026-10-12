import * as THREE from "three";
import { t } from "../i18n.js";
import { settings } from "../store.js";
import { grassTime } from "../grass.js";
import { CalmCamera } from "../calm-camera.js";

export function createLoop(app) {
  const {
    state,
    input,
    renderer,
    camera,
    hero,
    follow,
    dust,
    hud,
    sound,
    inventory,
    credits,
    bubbles,
    relics,
    touch,
    params,
    reduced,
    worlds,
  } = app;
  const { level } = app.court;
  const currentOrb = () => worlds.current?.disc;
  const combatTargets = () => worlds.current?.combatTargets?.() || [];
  const timer = new THREE.Timer();
  const calm = new CalmCamera();
  const shaking = () => (settings.shake && !settings.reduceMotion ? 1 : 0);
  const steady = (dt) =>
    settings.reduceMotion ? calm.apply(camera, dt) : calm.reset();
  function frame(now) {
    requestAnimationFrame(frame);
    timer.update(now);
    const raw = timer.getDelta();
    app.diagnostics.sample(raw);
    // Real time down to 20 frames a second, as on a busy phone; slower than that, the game slows.
    const dt = Math.min(raw, 1 / 20);
    state.time += dt;
    grassTime.value = state.time;
    state.frames++;
    state.fpsClock += raw;
    if (state.fpsClock >= 0.5) {
      state.fps = state.frames / state.fpsClock;
      state.frames = 0;
      state.fpsClock = 0;
    }
    const { equipment, menu } = app;
    state.framePhase = "input";
    input.poll();
    app.ui.pollRecovery();
    menu?.poll(dt);
    // The rig counts draws across its passes; the other worlds render without it.
    renderer.info.autoReset = false;
    renderer.info.reset();

    if (!state.loading) {
      state.framePhase = "simulation";
      if (state.mode === "title") {
        app.campaign.titleCamera();
        level.update(dt);
        app.court.beams?.update(dt);
        app.court.gate?.update(dt);
      } else if (state.mode === "play") {
        if (state.reading) {
          if (["interact", "skip", "pause"].some((a) => input.pressed(a)))
            app.ui.closeNotes();
        } else {
          if (
            !state.paused &&
            input.pressed("inventory") &&
            !state.cinematic &&
            !state.processing
          ) {
            if (inventory.open) inventory.close();
            else inventory.show();
          }
          if (!state.paused && !inventory.open && input.pressed("pause"))
            app.ui.pause(true);
          if (!state.paused && !inventory.open) {
            equipment.syncOrb(currentOrb());
            if (input.pressed("orb")) equipment.select("orb");
            if (input.pressed("pistols")) equipment.select("pistols");
            input.equipment = equipment.selected;
            if (input.pressed("reload")) equipment.reload();
            step(dt);
          }
        }
      } else if (state.mode === "credits") {
        worlds.current.ambient(dt);
        if (state.cinematic) {
          state.cinematic.update(dt, camera);
          steady(dt);
          if (state.cinematic.done) state.cinematic = null;
        }
        placeHero(dt);
        sound.update(dt, hero, null);
      }
    }
    credits.update(dt);
    state.framePhase = "interface";
    const breath =
      state.where === "six"
        ? worlds.get("six")?.drowned.breath
        : worlds.current?.breath;
    hud.breath(
      breath?.remaining ?? 0,
      breath?.capacity ?? 0,
      !!breath?.submerged,
    );
    input.swimming = !!hero.swimming;
    input.equipment = equipment?.selected;
    inventory.update(
      equipment,
      currentOrb(),
      state.mode === "play" &&
        !state.paused &&
        !state.reading &&
        !state.cinematic,
      hero.weaponActive,
    );
    touch.update({
      play:
        state.mode === "play" &&
        !state.paused &&
        !state.reading &&
        !inventory.open,
      cinematic: !!state.cinematic,
      holding:
        equipment?.selected === "pistols" ||
        (state.where !== "court" && hero.holding),
      prompt: hero.prompt,
      hanging: hero.state === "hang" || hero.state === "wall",
      swimming: !!hero.swimming,
      beyond: state.where !== "court",
      shield: equipment?.shieldStatus?.(),
    });
    state.framePhase = "render";
    if (state.mode !== "loading" && !state.loading && !app.ui.renderStage(dt))
      worlds.render(camera, dt);
    input.endFrame();
    app.diagnostics.publish();
    state.framePhase = "idle";
  }

  function step(dt) {
    const { equipment } = app;
    const move = input.move;
    const look = input.takeLook(dt);
    const waitingForWorld = state.crossing && !state.crossing.ready;
    const blocked = !!state.cinematic || state.processing || waitingForWorld;
    if (!blocked && input.pressed("pace")) input.running = !input.running;
    const firePressed = input.pressed("throw");
    if (!blocked && (firePressed || input.held("throw")))
      equipment.requestFire(firePressed);
    const aiming =
      !blocked &&
      equipment.selected === "pistols" &&
      (input.held("aim") || input.held("throw") || equipment.shotBuffer > 0);
    const heading = camera.getWorldDirection(new THREE.Vector3());
    if (aiming) equipment.aimTime = 0.75;
    hero.aiming = aiming && equipment.reloadLeft === 0;
    const relayPressed =
      !blocked &&
      !state.crossing &&
      !hero.swimming &&
      ["ground", "air"].includes(hero.state) &&
      equipment.selected === "orb" &&
      input.pressed("throw");
    const commands = {
      move: blocked ? { x: 0, y: 0 } : move,
      camYaw: follow.yaw,
      aimYaw: aiming ? Math.atan2(heading.x, heading.z) : undefined,
      swimDirection: heading,
      jump: !blocked && input.pressed("jump"),
      jumpHeld: !blocked && input.held("jump"),
      interactPressed: !blocked && input.pressed("interact"),
      interactHeld: !blocked && input.held("interact"),
      drop: !blocked && input.pressed("drop"),
      dropHeld: !blocked && input.held("drop"),
      walk: !blocked && input.walking,
      roll: !blocked && input.pressed("roll"),
    };
    // A cinematic can be skipped with Enter or jump.
    if (
      state.cinematic?.skip &&
      (input.pressed("skip") ||
        input.pressed("jump") ||
        (state.cinematic.skipOnMove && Math.hypot(move.x, move.y) > 0.3))
    )
      state.cinematic.skip();
    // Substeps of at most 1/50 s keep ledge catches reliable at low frame rates.
    state.framePhase = "hero";
    if (waitingForWorld) hero.vel.x = hero.vel.z = 0;
    else {
      const sub = Math.max(1, Math.ceil(dt * 50 - 1e-6));
      for (let i = 0; i < sub; i++) {
        hero.update(dt / sub, commands);
        commands.jump =
          commands.interactPressed =
          commands.drop =
          commands.roll =
            false;
      }
    }
    for (const e of hero.events.splice(0)) onHeroEvent(e);

    state.framePhase = "world";
    worlds.update(dt, hero, state, {
      throw: relayPressed,
      interact: !blocked && input.pressed("interact"),
      camera,
    });
    if (!state.crossing) {
      const crossing = worlds.crossing(hero);
      if (crossing) app.campaign.cross(crossing.to, crossing.opts);
    }
    app.campaign.updateCrossing(dt);
    relics.update(dt, state.where);
    bubbles.update(dt, camera);
    state.framePhase = "camera";
    if (state.cinematic) {
      app.workBudget.hold(400);
      state.cinematic.update(dt, camera, shaking());
      steady(dt);
      hud.letterbox(!!state.cinematic.letterbox, !!state.cinematic.skip);
      if (state.cinematic.done) {
        state.cinematic = null;
        calm.reset();
        hud.letterbox(false);
        // Glide back to the explorer from wherever the shot ended.
        state.intro = {
          t: 0,
          pos: camera.position.clone(),
          quat: camera.quaternion.clone(),
        };
        follow.snap(hero, false);
      }
    } else {
      follow.shakeScale = shaking();
      follow.update(
        dt,
        hero,
        look,
        move,
        state.processing || state.crossing ? [] : combatTargets(),
      );
    }
    if (state.intro && !state.cinematic) {
      state.intro.t = Math.min(
        1,
        state.intro.t + dt / (reduced || settings.reduceMotion ? 0.01 : 1.4),
      );
      const k = state.intro.t * state.intro.t * (3 - 2 * state.intro.t);
      camera.position.lerpVectors(state.intro.pos, camera.position.clone(), k);
      camera.quaternion.slerpQuaternions(
        state.intro.quat,
        camera.quaternion.clone(),
        k,
      );
      if (state.intro.t >= 1) state.intro = null;
    }
    if (
      !state.cinematic &&
      !state.processing &&
      !waitingForWorld &&
      (Math.hypot(move.x, move.y) > 0.05 ||
        Math.abs(look.x) + Math.abs(look.y) > 1e-4 ||
        input.held("aim") ||
        ["jump", "drop", "roll", "throw", "interact", "pace", "skip"].some(
          (action) => input.pressed(action),
        ))
    )
      hud.compactChapter();
    // Development shortcut: ?cam=x,y,z,tx,ty,tz holds the camera still for inspection.
    const fixed = params.get("cam")?.split(",").map(Number);
    if (fixed?.length === 6) {
      camera.position.set(fixed[0], fixed[1], fixed[2]);
      camera.lookAt(fixed[3], fixed[4], fixed[5]);
    }
    state.framePhase = "animation";
    placeHero(dt);
    // Her pose is placed after the camera moved, so the near-plane test runs again on it.
    if (!state.cinematic) follow.conceal(hero);
    if (!blocked && equipment.shotBuffer > 0)
      equipment.fire(hero, hero.world, camera, combatTargets());
    state.framePhase = "effects";
    equipment.updateVisuals();
    dust.update(dt);
    hud.updateMarkers(
      camera,
      hero.pos,
      hero.swimming ? hero.feet + 0.95 : undefined,
    );
    input.swimming = !!hero.swimming;
    hud.prompt(state.cinematic || state.reading ? "" : hero.prompt);
    sound.update(dt, hero, state.where === "court" ? app.court.beams : null, {
      immersion:
        state.where === "six"
          ? worlds.get("six").drowned.sanctuary.headWater(hero)
          : (worlds.current?.headWater?.(hero) ?? 0),
      phase: app.animator.swimPhase,
    });
  }

  function placeHero(dt) {
    const { equipment, animator, heroWeather } = app;
    // Sand banked against the court's walls lifts the feet onto its slope.
    const lift =
      state.where === "court" &&
      ["ground", "grab", "shove", "turn", "roll"].includes(hero.state)
        ? level.driftAt(hero.pos.x, hero.pos.z, hero.feet)
        : 0;
    equipment.prepare(
      dt,
      hero,
      camera,
      currentOrb(),
      !!state.cinematic || !!state.processing || !!state.crossing,
      combatTargets(),
    );
    animator.update(dt, hero, reduced, lift);
    heroWeather.update(dt, hero);
    if (animator.footfall) {
      sound.footfall(Math.min(1, 0.4 + hero.speed / 9));
      animator.footfall = 0;
      const f = hero.facing;
      dust.burst(
        hero.pos.x - f.x * 0.25,
        hero.feet + lift,
        hero.pos.z - f.z * 0.25,
        0.25,
        3,
      );
    }
  }

  function onHeroEvent(e) {
    if (e === "hurt") hud.damage();
    if (e === "land-hard") follow.shake = settings.shake ? 0.8 : 0;
    if (e === "land" || e === "land-hard")
      dust.burst(
        hero.pos.x,
        hero.feet,
        hero.pos.z,
        e === "land-hard" ? 1.4 : 0.7 * hero.landing + 0.3,
        10,
      );
    if (e === "push" || e === "pull") {
      const b = hero.grip?.ref;
      if (b) dust.burst(b.x, 0, b.z, 1.1, 16);
    }
    if (e === "strain" && state.where === "four" && !state.iceStrainHinted) {
      state.iceStrainHinted = true;
      hud.hint(
        t("Ice"),
        t(
          "A block of ice cannot be pulled, and it will not slide off the ice. Push it from another side.",
        ),
        7,
      );
    } else if (e === "strain" && !state.strainHinted) {
      state.strainHinted = true;
      hud.hint(
        t("Blocks"),
        t(
          "It will not budge that way: something is in the way, or the floor ends. Try another side.",
        ),
        7,
      );
    }
    if (e === "respawn")
      hud.blackout(
        hero.lastFall === "water"
          ? t("The cold water throws you back.")
          : state.where === "court"
            ? t("Fatal fall. Returned to the last safe ledge.")
            : hero.lastFall !== "deep"
              ? t("Too far to fall.")
              : state.where === "three"
                ? t("The clouds close over the fall.")
                : state.where === "four"
                  ? t("The ice swallows the fall.")
                  : t("The dark swallows the fall."),
      );
    sound.play(e);
  }

  return { frame, placeHero };
}
