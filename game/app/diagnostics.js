import { LAB_SESSION } from "../local-preview.js";
import { progress } from "../store.js";
import { isleAt } from "../world.js";
import { miraVoice } from "../voice.js";

export function createDiagnostics(app) {
  const { state, renderer, hero, follow, credits, relics, inventory } = app;
  const { level } = app.court;
  const frames = [];
  let sampledAt = -Infinity;
  function sample(dt) {
    const now = performance.now();
    if (now - sampledAt < 250) return;
    sampledAt = now;
    frames.push({
      time: Math.round(now),
      dt: Math.round(dt * 1000),
      mode: state.mode,
      world: state.where,
      state: hero.state,
      pos: [hero.pos.x, hero.feet, hero.pos.z],
      camera: follow.camera.position.toArray(),
      crossing: state.crossing?.to || null,
      pending: [...app.worlds.pending.keys()],
    });
    if (frames.length > 12) frames.shift();
  }
  function relayTelemetry(orb) {
    return orb
      ? {
          state: orb.state,
          charged: orb.charged,
          activations: orb.activations,
          cooldown: orb.cooldown,
          kind: orb.kind,
        }
      : null;
  }

  function expandedTelemetry(next) {
    const result = next?.telemetry?.();
    return result
      ? { ...result, disc: { ...result.disc, ...relayTelemetry(next.disc) } }
      : null;
  }

  function publish() {
    const info = renderer.info.render;
    const { equipment, menu } = app;
    const worldTwo = app.worlds?.get("two");
    const worldFive = app.worlds?.get("five");
    const worldSix = app.worlds?.get("six");
    const gate = app.court.gate;
    const story = app.court.story;
    const cp = worldTwo?.checkpoint;
    window.__GAME__ = {
      time: state.time,
      mode: state.mode,
      where: state.where,
      chapter: state.chapter,
      paused: state.paused,
      menu: menu.screen,
      pos: [hero.pos.x, hero.pos.z],
      feet: hero.feet,
      state: hero.state,
      swimming: !!hero.swimming,
      climb: {
        axes: !!hero.axes,
        wall: hero.cling?.s.id ?? null,
        leaping: !!hero.cling?.leap,
      },
      lab: LAB_SESSION,
      equipment: equipment?.telemetry(),
      inventoryOpen: inventory.open,
      fps: Math.round(state.fps),
      speed: hero.speed,
      pace: app.input.running ? "run" : "walk",
      score: level.stelae.filter((s) => s.lit).length,
      over: state.mode === "credits" || state.mode === "ending",
      draws: info.calls,
      tris: info.triangles,
      programs: renderer.info.programs?.length ?? 0,
      programsAtLoad: state.programs ?? 0,
      programsAtStart: state.programsAtStart ?? 0,
      camYaw: follow.yaw,
      relics: [...progress.relics],
      relicSpots: relics.spots(),
      cinematic: !!state.cinematic,
      beat: state.cinematic?.beat ?? null,
      voice: miraVoice(app.sound).telemetry(),
      audio: {
        muted: !!app.sound.settings.muted,
        gain: app.sound.master ? +app.sound.master.gain.value.toFixed(3) : null,
      },
      crossing: !!state.crossing,
      step: state.where === "court" ? story?.step?.id : cp?.step,
      objective: document.querySelector("#objective")?.textContent,
      mirrors: level.mirrors.map((m) => ({
        id: m.id,
        yaw: m.yaw,
        locked: m.locked?.ref?.id || null,
      })),
      lit: level.stelae.filter((s) => s.lit).map((s) => s.id),
      gateOpen: !!gate?.isOpen,
      health: cp?.health,
      checkpoint: cp?.phase,
      stampReview: cp?.review?.telemetry() ?? null,
      plates: cp?.plates?.map((p) => ({ glyph: p.glyph, stamped: p.stamped })),
      disc: relayTelemetry(worldTwo?.disc),
      guards: cp?.guards.map((g) => ({
        state: g.state,
        glyph: g.glyph,
        hp: g.hp,
        hostile: g.hostile,
        pos: [g.pos.x, g.pos.z],
        target: g.target ? [g.target.x, g.target.z] : null,
      })),
      exitOpen: !!worldTwo?.exitGate?.isOpen,
      isles: islesTelemetry(),
      frozen: frozenTelemetry(),
      forest: expandedTelemetry(worldFive),
      sea: expandedTelemetry(worldSix),
      vault: expandedTelemetry(app.worlds?.get("vault")),
      credits: credits.running,
      assets: Object.fromEntries(app.assets.available),
      worlds: app.worlds.telemetry(),
      streaming: { ...app.worlds.streaming(), yields: app.workBudget.yields },
      renderBudget: app.rendering.budget.telemetry(app.worlds.current),
      waterSound: app.sound.water
        ? { immersion: app.sound.water.immersion, ...app.sound.water.counts }
        : null,
    };
  }

  // What the play-through steers by on the isles: progress, the disc, the pylons and their
  // bridges, and where the things to reach are.
  function islesTelemetry() {
    const worldThree = app.worlds?.get("three");
    const I = worldThree?.isles;
    if (!I) return null;
    const xz = (v) => [+v.x.toFixed(2), +v.z.toFixed(2), +v.y.toFixed(2)];
    return {
      step: I.guideKey,
      reached: I.reached,
      on: I.on,
      read: I.read,
      disc: relayTelemetry(worldThree.disc),
      isles: I.isles.map((i) => ({
        id: i.id,
        at: [
          +i.collider.x.toFixed(2),
          +i.collider.z.toFixed(2),
          +i.collider.maxY.toFixed(2),
        ],
      })),
      wells: I.wells.map((w) => xz(w.center)),
      pylons: I.pylons.map((p) => ({
        id: p.id,
        lens: xz(p.lens),
        emit: xz(p.emit),
        to: p.to,
        on: p.bridge.on,
        left: +p.bridge.left.toFixed(2),
      })),
      note: I.notePos ? xz(I.notePos) : null,
      ring: I.ring
        ? {
            x: +I.ring.center.x.toFixed(2),
            z: +I.ring.center.z.toFixed(2),
            phase: I.ring.phase,
          }
        : null,
      ferry: I.isle("ferry")?.run
        ? {
            z: +I.isle("ferry").collider.z.toFixed(2),
            a: +I.isle("ferry").run.a.toFixed(2),
            b: +I.isle("ferry").run.b.toFixed(2),
          }
        : null,
      stones: I.isles
        .filter((i) => i.crumble)
        .map((i) => ({ id: i.id, phase: i.phase })),
      swings: I.swings?.telemetry() ?? null,
      pendulum:
        hero.state === "swing" && hero.pendulum
          ? {
              rope: hero.pendulum.rope.id,
              angle: hero.pendulum.angle,
              spin: hero.pendulum.spin,
              length: hero.pendulum.length,
              t: hero.pendulum.t,
            }
          : null,
      // The rim of each isle facing the next one: where to take off.
      edges: I.isles.slice(0, -1).map((a, k) => {
        const c = a.collider,
          b = I.isles[k + 1].collider;
        const ang = Math.atan2(b.z - c.z, b.x - c.x);
        const r = isleAt(
          c,
          c.x + Math.cos(ang) * 99,
          c.z + Math.sin(ang) * 99,
        ).rim;
        return [
          +(c.x + Math.cos(ang) * r).toFixed(2),
          +(c.z + Math.sin(ang) * r).toFixed(2),
        ];
      }),
    };
  }

  function frozenTelemetry() {
    const worldFour = app.worlds?.get("four");
    const F = worldFour?.frozen;
    if (!F) return null;
    const r = (v) => +v.toFixed(2);
    return {
      reached: F.reached,
      section: F.guideKey,
      block: F.blocks.map((b) => ({ x: r(b.x), z: r(b.z), state: b.state }))[0],
      floes: F.floes.map((f) => r(f.x)),
      thin: F.thin.map((t) => t.phase),
      fallingIce: F.fallingIce?.telemetry() ?? [],
      broken: F.broken,
      freed: F.freed,
      ring: worldFour.ring?.phase,
      disc: relayTelemetry(worldFour.disc),
      hunt: worldFour.hunt?.telemetry() ?? null,
    };
  }

  function loadContext() {
    let interactables;
    try {
      interactables = hero.level.interactables().length;
    } catch (error) {
      interactables = String(error?.message || error);
    }
    return {
      phase: state.framePhase,
      frames: [...frames],
      assetFailures: [...app.assets.failures.values()],
      worlds: app.worlds.telemetry(),
      streaming: app.worlds.streaming(),
      crossing: state.crossing ? { ...state.crossing } : null,
      hero: {
        state: hero.state,
        pos: { ...hero.pos },
        feet: hero.feet,
        prompt: hero.prompt,
      },
      input: {
        keys: [...app.input.down],
        edges: [...app.input.edges],
        move: app.input.move,
      },
      colliders: hero.world.boxes.length,
      interactables,
      assetsPending: [...app.assets.pending.keys()],
      ready: !!window.__READY__,
    };
  }

  return { publish, loadContext, sample };
}
