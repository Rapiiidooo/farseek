import * as THREE from "three";
import { t } from "../i18n.js";
import "../object-copy.js";
import { AssetStore } from "../asset-store.js";
import CourtWorld from "../worlds/court/index.js";
import { WorldManager } from "../worlds/manager.js";
import { WorldWorkBudget } from "../worlds/work-budget.js";
import { residencyPolicy } from "../worlds/gpu-budget.js";
import { addEarlyWorldDetail } from "../early-world-detail.js";
import { finishWorldLandscape } from "../mountain-landscape.js";
import { Hero } from "../hero.js";
import { HeroAnimator, placeholderHero, LIP } from "../hero-anim.js";
import { HeroWeather } from "../hero-weather.js";
import { Equipment } from "../equipment.js";
import { EquipmentUI } from "../equipment-ui.js";
import { LAB_SESSION } from "../local-preview.js";
import { FollowCamera } from "../follow-camera.js";
import { Input } from "../input.js";
import { TouchControls } from "../touch.js";
import { Hud } from "../hud.js";
import { Gate } from "../gate.js";
import { Sound } from "../sound.js";
import { Dust } from "../fx.js";
import { Bubbles } from "../bubbles.js";
import { Credits } from "../credits.js";
import { Relics } from "../relics.js";
import { drawColliders } from "../debug-colliders.js";
import { settings, progress } from "../store.js";
import * as COURT from "../court.js";
import { createView, createCourtRig, createRendering } from "./rendering.js";
import { createUI } from "./ui.js";
import { createCampaign } from "./campaign.js";
import { createLoop } from "./loop.js";
import { createDiagnostics } from "./diagnostics.js";
import { recordLoadEvent } from "../load-diagnostics.js";

export function startGame() {
  const params = new URLSearchParams(location.search);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = {
    mode: "loading",
    loading: true,
    where: "court",
    chapter: null,
    paused: false,
    time: 0,
    cinematic: null,
    intro: null,
    crossing: null,
    fps: 0,
    frames: 0,
    fpsClock: 0,
  };
  const view = createView(settings);
  const { renderer, camera, canvas } = view;
  renderer.debug.checkShaderErrors = params.has("debug");
  const workBudget = new WorldWorkBudget();
  const assets = new AssetStore(
    undefined,
    () => workBudget.yield(),
    (failure) => recordLoadEvent(state, "asset-failed", failure),
  );
  const court = new CourtWorld(renderer, assets);
  const { scene, world, level } = court;
  const rig = createCourtRig(view, scene);
  const input = new Input(canvas, settings);
  const touch = new TouchControls(input, canvas);
  const hud = new Hud(input, settings);
  const sound = new Sound(settings);
  const dust = new Dust(scene);
  const bubbles = new Bubbles();
  const follow = new FollowCamera(camera, world);
  const hero = new Hero(world, level);
  Gate.watch(hero);
  const credits = new Credits(document.querySelector("#credits"), input);
  const relics = new Relics({ assets, hud, sound });
  const heroLooks = new Map();
  const app = {
    ...view,
    view,
    params,
    reduced,
    state,
    assets,
    workBudget,
    court,
    rig,
    input,
    touch,
    hud,
    sound,
    dust,
    bubbles,
    follow,
    hero,
    credits,
    relics,
    heroLooks,
  };
  sound.bind(app);
  hero.extras = () => relics.interactables(state.where);
  app.dressHero = (where) => {
    for (const [mesh, look] of heroLooks)
      mesh.material = where === "court" ? look.court : look.plain;
  };
  const inventory = (app.inventory = new EquipmentUI(input, {
    onSelect: (value) => app.equipment?.select(value),
    onOpen: () => app.equipment?.cancelFire(),
    onClose: () => {
      app.equipment?.cancelFire();
      if (state.mode === "play" && !state.paused) app.ui.lockPointer();
    },
    onReload: () => app.equipment?.reload(),
  }));
  app.worlds = new WorldManager({
    renderer,
    assets,
    provided: { court },
    // The device's estimated graphics budget sets how many worlds stay uploaded.
    ...residencyPolicy({
      software: view.software,
      coarse: matchMedia("(pointer: coarse)").matches,
      deviceMemory: navigator.deviceMemory,
      maxTextureSize: renderer.capabilities.maxTextureSize,
      quality: settings.quality,
    }),
    beforeWire: () => app.characterReady,
    schedule: (work, job) => workBudget.run(work, job),
    yieldWork: () => workBudget.yield(),
    onEvent: (event, detail) => {
      recordLoadEvent(state, event, detail);
      app.ui?.worldEvent(event, detail);
    },
    onRestore: async (id, instance) => {
      instance.resize(innerWidth, innerHeight);
      await app.rendering.precompile(id, instance);
    },
    onBackgroundError: (id, error) =>
      app.ui.reportFailure(
        error,
        id === "resources"
          ? "Releasing distant world resources"
          : `Preparing ${app.worlds.definition(id).title}`,
      ),
    services: () => ({
      hero,
      heroModel: app.heroModel,
      follow,
      dust,
      state,
      sound,
      hud,
      bubbles,
      Gate,
      rig,
      palm: app.heroModel?.userData.joints.rightHand
        ? app.animator.ik.right?.palm
        : null,
      onKnockout: app.campaign.knockedOut,
      openNotes: app.ui.openNotes,
      discoverRelic: (id) => relics.discover(id),
      relicFound: (id) => progress.relics.has(id),
      onComplete: app.campaign.finale,
    }),
    onBuilt: async (id, instance, job) => {
      await workBudget.yield();
      addEarlyWorldDetail(instance, id);
      await finishWorldLandscape(instance, id);
      if (!job.background) app.ui.lighting(id);
      const lift =
        id === "court" ? (x, z, y) => level.driftAt(x, z, y) : undefined;
      await relics.build({ [id]: { ...instance, lift } }, instance.isles);
      if (params.has("colliders"))
        drawColliders(instance.scene, instance.world);
      await app.rendering.precompile(id, instance);
    },
  });
  app.ui = createUI(app);
  app.menu = app.ui.menu;
  app.campaign = createCampaign(app);
  app.rendering = createRendering(app);
  app.loop = createLoop(app);
  app.diagnostics = createDiagnostics(app);
  addEventListener("error", (event) =>
    app.ui.reportFailure(
      event.error || new Error(event.message),
      "Runtime exception",
    ),
  );
  addEventListener("unhandledrejection", (event) =>
    app.ui.reportFailure(event.reason, "Unhandled promise rejection"),
  );
  relics.onFound = app.ui.refreshMainMenu;

  async function loadCharacter() {
    let heroModel, animator, equipment, heroWeather;
    heroModel =
      (await assets.make("hero_explorer", { surfaces: false })) ||
      placeholderHero();
    equipment = new Equipment(heroModel, sound);
    equipment.input = input;
    // Pale canvas turns blue-white in the rig's cool shade; a deeper khaki keeps it warm.
    heroModel.traverse((o) => {
      const c = o.isMesh && o.material.color;
      if (c && Math.abs(c.getHex() - 0xcdbf9f) < 0x030303) {
        o.material = o.material.clone();
        o.material.color.setHex(0x9e8660);
      }
      if (o.isMesh) {
        o.castShadow = !o.userData.noShadow;
        if (
          o.isSkinnedMesh ||
          o.morphTargetInfluences ||
          o.material.alphaTest > 0
        ) {
          // ASSET clones omit custom depth materials; sharing one makes shadow variants depend on draw order.
          o.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: o.material.map,
            alphaTest: o.material.alphaTest,
            side: o.material.side,
          });
        }
        heroLooks.set(o, { court: o.material, plain: o.material.clone() });
      }
    });
    if (heroModel.userData.grip?.hands)
      hero.hands = heroModel.userData.grip.hands;
    scene.add(heroModel);
    animator = new HeroAnimator(heroModel);
    equipment.bind(animator);
    heroWeather = new HeroWeather(heroLooks);
    animator.groundAt = (x, z, referenceY, radius = 0.025) => {
      const reference = Math.max(referenceY, hero.feet);
      const heightAt = (px, pz) => {
        const height = hero.world.ground(px, pz, radius, reference, 0.6);
        if (!Number.isFinite(height) || Math.abs(height - reference) > 0.65)
          return null;
        return (
          height + (state.where === "court" ? level.driftAt(px, pz, height) : 0)
        );
      };
      const height = heightAt(x, z);
      if (height === null) return null;
      const slope = (a, b) =>
        a !== null && b !== null && Math.abs(a - b) < 0.12 ? (a - b) / 0.12 : 0;
      const normal = new THREE.Vector3(
        slope(heightAt(x - 0.06, z), heightAt(x + 0.06, z)),
        1,
        slope(heightAt(x, z - 0.06), heightAt(x, z + 0.06)),
      ).normalize();
      return { height, normal };
    };
    // Hang at the depth where the palms, not the fingertips, rest on the lip.
    const reach = animator.hangReach(0.3);
    if (reach) hero.hands = reach - LIP;

    Object.assign(app, { heroModel, animator, equipment, heroWeather });
    follow.model = heroModel;
  }

  async function load() {
    app.ui.loading(0.12, t("Unpacking the expedition…"), 0.3);
    app.characterReady = loadCharacter();
    app.ui.loading(0.66, t("Carving the sunken court…"), 2.2);
    await Promise.all([app.characterReady, app.worlds.ensure("court")]);
    hero.spawn(COURT.START.x, COURT.START.z, 8, COURT.START.yaw);
    follow.snap(hero);
    if (params.has("debug")) {
      window.__FD__ = {
        THREE,
        level,
        hero,
        gate: court.gate,
        renderer,
        follow,
        heroModel: app.heroModel,
        animator: app.animator,
        equipment: app.equipment,
        inventory,
        worlds: app.worlds,
        app,
      };
      for (const [name, id] of [
        ["worldTwo", "two"],
        ["worldThree", "three"],
        ["worldFour", "four"],
        ["worldFive", "five"],
        ["worldSix", "six"],
      ])
        Object.defineProperty(window.__FD__, name, {
          enumerable: true,
          get: () => app.worlds.get(id),
        });
    }
    app.ui.wireMenu();
    // Opening the first audio context waits on the output device; doing it suspended here keeps
    // that wait off the New game click, which then only resumes it.
    sound.start();
    sound.ctx?.suspend();
    state.loading = false;
    app.ui.ready();
    const auto =
      (LAB_SESSION ? params.get("level") : null) ||
      params.get("chapter") ||
      (params.has("w2") ? "checkpoint" : null);
    app.campaign.toTitle({ prefetch: !auto });
    if (auto)
      await app.campaign.startChapter(auto, {
        continuing: params.get("resume") === "1",
      });
    app.diagnostics.publish();
    window.__READY__ = true;
  }

  addEventListener("resize", app.rendering.resize);
  input.onUnlock = () => {
    if (inventory.open || performance.now() < (inventory.unlockUntil || 0))
      return;
    if (state.reading) app.ui.closeNotes();
    if (state.mode === "play" && !state.paused) app.ui.pause(true);
  };
  canvas.addEventListener("click", () => {
    if (state.mode === "play" && !state.paused && !inventory.open)
      app.ui.lockPointer();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) app.ui.pause(true);
  });
  window.__START__ = () =>
    app.campaign.startChapter(progress.last || "court", { continuing: true });
  load().catch(app.ui.fail);
  app.loop.frame();
  return app;
}
