import * as THREE from "three";
import { createRig } from "../rig.js";
import { CSMShader } from "three/addons/csm/CSMShader.js";
import { LuminosityHighPassShader } from "three/addons/shaders/LuminosityHighPassShader.js";
import { createShaderPreview } from "./shader-preview.js";
import { RenderBudget } from "../render-budget.js";
import { settings } from "../store.js";
import { createAtmosphere } from "../atmosphere.js";
import { pixelsSettled } from "../offload.js";
import { TreeLevels } from "../tree-lod.js";
import { runSteps } from "../work-steps.js";

// Bloom spreads one NaN texel or runaway glint over most of the screen; clamping drops NaN to 0.
LuminosityHighPassShader.fragmentShader =
  LuminosityHighPassShader.fragmentShader.replace(
    "vec4 texel = texture2D( tDiffuse, vUv );",
    "vec4 texel = clamp( texture2D( tDiffuse, vUv ), 0.0, 16.0 );",
  );

export function createView(settings) {
  const canvas = document.querySelector("#view");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  // Software renderers use a lower pixel ratio and defer shader warm-up to the first draw.
  const software = (() => {
    try {
      const gl = renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = gl.getParameter(
        info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
      );
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    } catch {
      return false;
    }
  })();
  const PIXEL_RATIO = { high: 1.5, balanced: 1.1, fast: 0.85 };
  const pixelRatio = () =>
    Math.min(
      devicePixelRatio,
      software ? 0.75 : PIXEL_RATIO[settings.quality] || 1.5,
    );
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // The r186 CSM chunk omits material.dfg, leaving metallic surfaces black.
  {
    const core = THREE.ShaderChunk.lights_fragment_begin;
    const block = core.slice(
      core.indexOf("#ifdef STANDARD"),
      core.indexOf("IncidentLight directLight;"),
    );
    if (block && !CSMShader.lights_fragment_begin.includes("material.dfg"))
      CSMShader.lights_fragment_begin = CSMShader.lights_fragment_begin.replace(
        "IncidentLight directLight;",
        block + "IncidentLight directLight;",
      );
  }

  const camera = new THREE.PerspectiveCamera(
    58,
    innerWidth / innerHeight,
    0.1,
    1200,
  );
  fitCamera(camera);
  camera.position.set(21, 11, 44);
  camera.lookAt(15, 4, 12);

  return { canvas, renderer, camera, software, pixelRatio };
}

export function createCourtRig(view, scene) {
  const { renderer, camera, pixelRatio } = view;
  const rig = createRig(THREE, renderer, scene, {
    hour: 15.2,
    azimuth: 236,
    maxElevation: 58,
    camera,
    fogStart: 60,
    fogDensity: 0.0032,
    exposure: 0.86,
  });
  renderer.setPixelRatio(pixelRatio());
  // r186 replaces PCFSoftShadowMap at the first draw, changing every compiled program key.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  return rig;
}

export function fitCamera(camera) {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  camera.fov = aspect < 1 ? Math.min(80, 58 + (1 - aspect) * 40) : 58;
  camera.updateProjectionMatrix();
}

export function createRendering(app) {
  const { renderer, camera, state, view, worlds, heroLooks, workBudget } = app;
  const budget = new RenderBudget(renderer, settings, app.rig, view.software);
  const lighting = (app.lighting = createAtmosphere(app));
  const withPreparation = (owner, run, model = null) => {
    try {
      owner.prepareForCompile(true);
      if (model) model.visible = true;
      return run();
    } finally {
      try {
        owner.prepareForCompile(false);
      } finally {
        if (model) model.visible = false;
      }
    }
  };
  const compile = async (
    target,
    scene,
    planes = [],
    context = null,
    eye = camera,
    prepare = (run) => run(),
  ) => {
    await workBudget.yield(true);
    const previousTarget = renderer.getRenderTarget();
    const previousPlanes = renderer.clippingPlanes;
    let pending;
    try {
      renderer.setRenderTarget(target);
      renderer.clippingPlanes = planes;
      pending = prepare(() =>
        Promise.all(
          [scene]
            .flat()
            .map((object) => renderer.compileAsync(object, eye, context)),
        ),
      );
    } finally {
      renderer.clippingPlanes = previousPlanes;
      renderer.setRenderTarget(previousTarget);
    }
    await pending;
  };

  // Small groups of top-level objects keep each background preparation step short.
  const batches = (scene, size = 40) => {
    const groups = [];
    let group = [],
      count = 0;
    for (const child of scene.children) {
      if (child.isLight) continue;
      let meshes = 0;
      child.traverse((node) => {
        if (node.isMesh || node.isPoints || node.isLine || node.isSprite)
          meshes++;
      });
      if (!meshes) continue;
      group.push(child);
      count += meshes;
      if (count >= size) {
        groups.push(group);
        group = [];
        count = 0;
      }
    }
    if (group.length) groups.push(group);
    return groups;
  };

  const upload = async (scene) => {
    const textures = new Set();
    const collect = (value) => {
      if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
    };
    scene.traverse((node) => {
      for (const material of node.material ? [node.material].flat() : []) {
        Object.values(material).forEach(collect);
        for (const uniform of Object.values(material.uniforms || {}))
          [uniform.value].flat().forEach(collect);
      }
    });
    for (const texture of textures) {
      const { width = 0, height = 0 } = texture.image || {};
      if (width * height >= 512 * 512) await workBudget.frame();
      else await workBudget.yield();
      if (texture.version > 0) renderer.initTexture(texture);
    }
  };

  // Draws every object once, culling off and hidden effects shown, so uploads and first draws happen before they are seen.
  // Layers rather than visibility isolate a batch, and subtrees holding lights stay as they are: light counts key every program.
  const warmBatches = async (
    scene,
    target,
    eye,
    prepare,
    variants = [[]],
    groups = batches(scene),
  ) => {
    // Static shadow maps exist only once rendered; sampling a missing one fails every lit draw.
    const statics = [];
    scene.traverse((node) => {
      if (node.isLight && node.castShadow && node.shadow?.autoUpdate === false)
        statics.push(node.shadow);
    });
    for (const group of groups) {
      await workBudget.frame();
      const previousTarget = renderer.getRenderTarget();
      const previousPlanes = renderer.clippingPlanes;
      const previousInfo = { ...renderer.info.render };
      const members = new Set();
      for (const child of group) child.traverse((node) => members.add(node));
      const restored = [],
        hidden = [];
      scene.traverse((node) => {
        if (node.isMesh || node.isPoints || node.isLine || node.isSprite)
          restored.push([node, node.layers.mask, node.frustumCulled]);
        if (node.visible) return;
        let lit = false;
        node.traverse((child) => (lit ||= !!child.isLight));
        if (!lit) hidden.push(node);
      });
      try {
        for (const [node] of restored)
          if (members.has(node)) node.frustumCulled = false;
          else node.layers.mask = 0;
        // A program's first draw is costly too, so portal views also draw their clipped variant here.
        prepare(() => {
          for (const node of hidden) node.visible = true;
          renderer.setRenderTarget(target);
          for (const planes of variants) {
            for (const shadow of statics) shadow.needsUpdate = true;
            renderer.clippingPlanes = planes;
            renderer.render(scene, eye);
          }
        });
      } finally {
        for (const node of hidden) node.visible = false;
        for (const [node, mask, culled] of restored) {
          node.layers.mask = mask;
          node.frustumCulled = culled;
        }
        renderer.clippingPlanes = previousPlanes;
        renderer.setRenderTarget(previousTarget);
        Object.assign(renderer.info.render, previousInfo);
      }
    }
    for (const shadow of statics) shadow.needsUpdate = true;
  };

  // A door draws its world into a target of its own sample count, and a program's first draw at a
  // new count builds a pipeline; pipelines follow attachments, not size, so a few pixels suffice.
  const doorPasses = new WeakMap();
  const doorStandIn = (id, world) => {
    const index = worlds.definitions.findIndex((entry) => entry.id === id);
    if (index < 1 || worlds.doorTo(index - 1)?.id !== id) return null;
    const door =
      worlds.get(worlds.definitions[index - 1].id)?.exit?.target ??
      world.exit?.target;
    const own = world.composer?.readBuffer;
    const key = `${door?.samples} ${door?.texture.type}`;
    // Pipelines outlive released targets and uploads: a restored world keeps the ones it built.
    if (
      !door?.isRenderTarget ||
      (door.samples === own?.samples &&
        door.texture.type === own.texture.type) ||
      doorPasses.get(world)?.has(key)
    )
      return null;
    const target = door.clone();
    target.setSize(16, 16);
    return { target, key };
  };

  const warm = async (next, eye, prepare = (run) => run()) => {
    await workBudget.yield(true);
    const screen = next.composer.renderToScreen;
    const previousTarget = renderer.getRenderTarget();
    const previousPlanes = renderer.clippingPlanes;
    const previousInfo = { ...renderer.info.render };
    try {
      next.composer.renderToScreen = false;
      prepare(() => next.render(eye, 0.016));
    } finally {
      next.composer.renderToScreen = screen;
      renderer.clippingPlanes = previousPlanes;
      renderer.setRenderTarget(previousTarget);
      Object.assign(renderer.info.render, previousInfo);
    }
  };

  async function precompile(id, next) {
    // Worker pixels land before compiling and uploading, so no map is computed here at first read.
    await pixelsSettled();
    if (id === "court") await app.rig.ready;
    await runSteps(budget.registerSteps(next, id), () => workBudget.yield());
    budget.apply(next);
    lighting.attach(id, next);
    if (id === "court") {
      next.beams.update(0);
      app.rig.refresh(next.scene);
      budget.update(next, camera);
      await compile(app.rig.post?.rt ?? null, next.scene);
      app.rig.render(camera, 0.016);
      await warmBatches(next.scene, app.rig.post?.rt ?? null, camera, (run) =>
        run(),
      );
      // Captures draw into half float targets as live reflections do and so build their pipelines;
      // without post the court was compiled for the screen, and targets need programs of their own.
      if (!app.rig.post) {
        const target = new THREE.WebGLRenderTarget(1, 1, {
          type: THREE.HalfFloatType,
        });
        await compile(target, next.scene);
        target.dispose();
      }
      await next.mirrors.capture({
        csm: view.software ? null : app.rig.csm,
        hide: [app.heroModel, next.gate.disc],
        frame: () => workBudget.frame(),
        around: (probe) => budget.update(next, probe),
      });
      budget.update(next, camera);
    } else if (!view.software) {
      await workBudget.yield(true);
      const preview = createShaderPreview(app.heroModel, heroLooks, id);
      const orbPreview = next.disc?.mesh
        ? createShaderPreview(next.disc.mesh, new Map(), id)
        : null;
      if (orbPreview) {
        orbPreview.model.position.set(0, 1, 0.35);
        orbPreview.model.rotation.set(0, 0, 0);
        orbPreview.model.scale.setScalar(1);
        orbPreview.model.visible = true;
        preview.model.add(orbPreview.model);
      }
      preview.model.visible = false;
      const prepare = (run) => withPreparation(next, run, preview.model);
      const eye = camera.clone();
      preview.model.position.set(next.gateCenter.x, 0, next.gateCenter.z);
      preview.model.rotation.set(0, 0, 0);
      eye.position.copy(preview.model.position).add(new THREE.Vector3(3, 2, 5));
      eye.lookAt(
        preview.model.position.clone().add(new THREE.Vector3(0, 0.9, 0)),
      );
      next.scene.add(preview.model);
      const door = doorStandIn(id, next);
      try {
        for (const planes of [[next.clipPlane], []])
          for (const group of batches(next.scene))
            await compile(
              next.composer.readBuffer,
              group,
              planes,
              next.scene,
              eye,
              prepare,
            );
        if (next.disc?.mesh) {
          await compile(
            next.composer.readBuffer,
            next.disc.mesh,
            [next.clipPlane],
            next.scene,
            eye,
            prepare,
          );
          await compile(
            next.composer.readBuffer,
            next.disc.mesh,
            [],
            next.scene,
            eye,
            prepare,
          );
        }
        // Dust stays in the active world, so prepare its shader against the next world's fog and lights.
        for (const planes of [[next.clipPlane], []])
          await compile(
            next.composer.readBuffer,
            app.dust.items[0].sprite,
            planes,
            next.scene,
            eye,
            prepare,
          );
        await upload(next.scene);
        await warmBatches(next.scene, next.composer.readBuffer, eye, prepare, [
          [],
          [next.clipPlane],
        ]);
        // The explorer's copy stays out: she is never seen through a door.
        if (door)
          await warmBatches(
            next.scene,
            door.target,
            eye,
            prepare,
            [[next.clipPlane], []],
            batches(next.scene)
              .map((group) => group.filter((child) => child !== preview.model))
              .filter((group) => group.length),
          );
        await warm(next, eye, prepare);
        next.treeLevels ??= await TreeLevels.build(next.scene, () =>
          workBudget.yield(),
        );
        // Far tree levels share their materials; drawing them uploads their buffers and builds the
        // pipelines of their vertex layout.
        await next.treeLevels?.prepare(async (meshes) => {
          for (const [target, variants] of [
            [next.composer.readBuffer, [[], [next.clipPlane]]],
            [door?.target, [[next.clipPlane], []]],
          ])
            if (target)
              await warmBatches(next.scene, target, eye, prepare, variants, [
                meshes,
              ]);
        });
        if (door) {
          if (!doorPasses.has(next)) doorPasses.set(next, new Set());
          doorPasses.get(next).add(door.key);
        }
        if (next.epilogue) {
          const prepareEnding = (run) => withPreparation(next.epilogue, run);
          await compile(
            next.gate.target,
            next.epilogue.scene,
            [next.epilogue.clipPlane],
            null,
            eye,
            prepareEnding,
          );
          await compile(
            next.composer.readBuffer,
            next.epilogue.scene,
            [],
            null,
            eye,
            prepareEnding,
          );
          await compile(
            next.composer.readBuffer,
            next.epilogue.wisp,
            [],
            next.scene,
            eye,
            prepareEnding,
          );
          await upload(next.epilogue.scene);
          await warmBatches(
            next.epilogue.scene,
            next.gate.target,
            eye,
            prepareEnding,
            [[next.epilogue.clipPlane]],
          );
          await warmBatches(
            next.epilogue.scene,
            next.composer.readBuffer,
            eye,
            prepareEnding,
          );
        }
      } finally {
        door?.target.dispose();
        orbPreview?.dispose();
        preview.dispose();
      }
    }
    if (id !== "court" && settings.quality !== "high" && !view.software) {
      const eye = camera.clone();
      eye.position.copy(next.gateCenter).add(new THREE.Vector3(3, 2, 5));
      eye.lookAt(next.gateCenter);
      budget.update(next, eye);
      await warm(next, eye, (run) => withPreparation(next, run));
    }
    state.programs = renderer.info.programs.length;
  }

  function resize() {
    renderer.setPixelRatio(view.pixelRatio());
    renderer.setSize(innerWidth, innerHeight);
    fitCamera(camera);
    app.follow.baseFov = camera.fov;
    app.hud.liftSubtitle(
      document.querySelector("#hint").classList.contains("on"),
    );
    worlds.resize(innerWidth, innerHeight);
    for (const world of worlds.instances.values())
      if (world.gpuResident !== false) budget.apply(world);
  }

  return { precompile, resize, budget, lighting };
}
