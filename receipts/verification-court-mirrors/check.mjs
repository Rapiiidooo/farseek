// Behaviour of the court mirrors in the running game: captures, live reflections per tier, the
// still-camera cache, blending, renderer state, views through a door, leaving and GPU release.
//   node receipts/verification-court-mirrors/check.mjs [url] [out.json]
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://localhost:3009";
const out = process.argv[3] || new URL("check.json", import.meta.url).pathname;
const result = { base, passed: false, checks: [], errors: [] };
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(240000);
  await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (error) => result.errors.push(error.stack));
  page.on("console", (message) => {
    if (message.type() === "error") result.errors.push(message.text());
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem("far-door-progress");
    localStorage.setItem(
      "far-door-settings",
      JSON.stringify({ quality: "high", shake: false }),
    );
  });
  await page.goto(`${base}/?chapter=floor&debug=1&nolock=1`, {
    waitUntil: "load",
  });
  await page.waitForFunction(
    () => window.__READY__ && __FD__.worlds.pending.size === 0,
  );
  result.checks = await page.evaluate(async () => {
    const { worlds, renderer, follow, THREE, app } = __FD__;
    const court = worlds.get("court");
    const mirrors = court.mirrors;
    const state = court.services.state;
    const { settings } = await import("./store.js");
    state.paused = true;
    state.intro = state.cinematic = null;
    const camera = follow.camera;
    const checks = [];
    const verify = (name, condition, data) => {
      if (!condition) throw new Error(name + ": " + JSON.stringify(data));
      checks.push({ name, passed: true, data });
    };
    const frames = async (count) => {
      const seen = [];
      for (let i = 0; i < count; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        seen.push(mirrors.renders);
      }
      return seen;
    };
    const look = (view) => {
      camera.position.set(view[0], view[1], view[2]);
      camera.lookAt(view[3], view[4], view[5]);
      camera.updateMatrixWorld(true);
    };
    const live = () => mirrors.entries.filter((entry) => entry.live).length;
    const weights = () =>
      mirrors.entries.map((entry) => entry.uniforms.uMirrorLive.value);
    const programs = renderer.info.programs.length;
    const material = mirrors.entries[0].mesh.material;
    verify(
      "Every polished face is a mirror entry with its capture taken during preparation",
      mirrors.entries.length === 4 &&
        mirrors.entries.every(
          (entry) =>
            entry.uniforms.uMirrorStill.value === 1 &&
            entry.uniforms.uMirrorCube.value === entry.cube.texture &&
            !!renderer.properties.get(entry.cube.texture).__webglTexture &&
            entry.cube.width === 256,
        ),
      {
        entries: mirrors.entries.length,
        probe: mirrors.entries.map((entry) =>
          entry.uniforms.uMirrorProbe.value.toArray().map((v) => +v.toFixed(2)),
        ),
      },
    );
    verify(
      "All mirror materials share one program key",
      new Set(
        mirrors.entries.map((entry) =>
          entry.mesh.material.customProgramCacheKey(),
        ),
      ).size === 1 &&
        material.customProgramCacheKey().includes("fd-court-mirror-2"),
      { key: material.customProgramCacheKey() },
    );
    // From the floor chapter's start two mirrors face the camera within reach.
    const start = [22.5, 2.6, 30.5, 13, 1.1, 22];
    for (const [quality, expected] of [
      ["high", 2],
      ["balanced", 2],
      ["fast", 1],
    ]) {
      settings.quality = quality;
      look(start);
      const seen = await frames(30);
      verify(
        `${quality}: ${expected} mirrors reflect live, at most two drawn per frame`,
        live() === expected &&
          Math.max(...seen) <= 2 &&
          mirrors.count === { high: 4, balanced: 2, fast: 1 }[quality],
        {
          live: live(),
          renders: seen,
          count: mirrors.count,
          weights: weights(),
        },
      );
    }
    settings.quality = "high";
    look(start);
    await frames(30);
    const sizes = mirrors.entries
      .filter((entry) => entry.live)
      .map((entry) => entry.target.width)
      .sort((a, b) => b - a);
    verify(
      "The best mirror draws at full size, the other at half",
      sizes.length === 2 && sizes[0] === 512 && sizes[1] === 256,
      { sizes },
    );
    const still = await frames(36);
    const drawn = still.reduce((sum, value) => sum + value, 0);
    verify(
      "A still camera redraws its live mirrors about every 100 ms, not every frame",
      drawn > 0 && drawn <= 18,
      { renders: still },
    );
    // Moving every frame: the best each frame, the other one in turn.
    const moving = [];
    for (let i = 0; i < 30; i++) {
      look([22.5 - i * 0.01, 2.6, 30.5, 13, 1.1, 22]);
      moving.push(...(await frames(1)));
    }
    // The first sample may predate the first moved frame.
    verify(
      "A moving camera redraws the best mirror every frame and the other in turn",
      moving.slice(1).every((value) => value >= 1 && value <= 2) &&
        moving.filter((value) => value === 2).length >= 10,
      { renders: moving },
    );
    const before = {
      target: renderer.getRenderTarget(),
      planes: renderer.clippingPlanes,
      viewport: renderer.getViewport(new THREE.Vector4()),
      shadow: renderer.shadowMap.autoUpdate,
      xr: renderer.xr.enabled,
      face: renderer.getActiveCubeFace(),
    };
    const entry = mirrors.entries.find((item) => item.live);
    const pass = mirrors.draw(entry, camera, 512, performance.now());
    verify(
      "A live reflection restores the renderer state and the explorer",
      !!pass &&
        renderer.getRenderTarget() === before.target &&
        renderer.clippingPlanes === before.planes &&
        renderer.getViewport(new THREE.Vector4()).equals(before.viewport) &&
        renderer.shadowMap.autoUpdate === before.shadow &&
        renderer.xr.enabled === before.xr &&
        renderer.getActiveCubeFace() === before.face &&
        entry.mesh.visible &&
        app.heroModel.visible,
      { calls: pass?.calls },
    );
    const original = renderer.render;
    renderer.render = () => {
      throw new Error("Reflection fixture failure");
    };
    let failed = false;
    try {
      mirrors.draw(entry, camera, 512, performance.now());
    } catch (error) {
      failed = error.message === "Reflection fixture failure";
    } finally {
      renderer.render = original;
    }
    verify(
      "A failed reflection restores the renderer state and stops reading its target",
      failed &&
        !entry.ready &&
        entry.mesh.visible &&
        app.heroModel.visible &&
        renderer.getRenderTarget() === before.target &&
        renderer.clippingPlanes === before.planes &&
        renderer.shadowMap.autoUpdate === before.shadow,
      { failed, ready: entry.ready },
    );
    const projection = mirrors.camera.projectionMatrix.elements;
    verify(
      "The reflected camera clips at the mirror plane with an oblique near plane",
      Math.abs(projection[2]) + Math.abs(projection[6]) > 1e-4,
      { row: [projection[2], projection[6], projection[10], projection[14]] },
    );
    // Turning away: the live weights fall smoothly to the capture, then rest.
    look([22.5, 2.6, 30.5, 30, 2, 40]);
    const fading = [];
    for (let i = 0; i < 30; i++) {
      await frames(1);
      fading.push(Math.max(...weights()));
    }
    const steps = fading.slice(1).map((value, i) => fading[i] - value);
    verify(
      "Leaving the live set blends back to the capture over about a quarter second",
      fading[0] > 0 &&
        fading.at(-1) === 0 &&
        steps.every((step) => step >= -1e-9) &&
        Math.max(...steps) < 0.5 &&
        fading.filter((value) => value > 0 && value < 1).length >= 6,
      { fading: fading.map((value) => +value.toFixed(3)) },
    );
    look(start);
    await frames(30);
    const seenWeights = weights();
    let inside = null;
    const render = renderer.render.bind(renderer);
    renderer.render = (scene, eye) => {
      inside = weights();
      return render(scene, eye);
    };
    // A door draws its destination into a target of its own.
    const door = new THREE.WebGLRenderTarget(64, 64, {
      type: THREE.HalfFloatType,
    });
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(door);
      court.renderInto(renderer, camera);
    } finally {
      renderer.render = render;
      renderer.setRenderTarget(previous);
      door.dispose();
    }
    verify(
      "A view through a door shows only the captures and keeps the live weights",
      inside.every((value) => value === 0) &&
        weights().every((value, i) => value === seenWeights[i]) &&
        seenWeights.some((value) => value > 0),
      { inside, after: weights() },
    );
    const textures = mirrors.entries
      .filter((item) => item.target)
      .map((item) => item.target.texture);
    court.leave();
    verify(
      "Leaving the court frees the live targets and keeps the captures",
      textures.length > 0 &&
        textures.every(
          (texture) => !renderer.properties.get(texture).__webglTexture,
        ) &&
        weights().every((value) => value === 0) &&
        mirrors.entries.every(
          (item) =>
            item.uniforms.uMirrorStill.value === 1 &&
            !!renderer.properties.get(item.cube.texture).__webglTexture,
        ),
      { freed: textures.length },
    );
    court.enter();
    look(start);
    await frames(30);
    verify(
      "Returning reflects live again",
      live() === 2 && weights().filter((value) => value === 1).length === 2,
      { weights: weights() },
    );
    // GPU release and restore, as the residency window does, with the frame loop held.
    const cubes = mirrors.entries.map((item) => item.cube.texture);
    state.loading = true;
    court.leave();
    await worlds.gpuCache.release(court, []);
    verify(
      "Releasing the court's GPU resources frees every capture",
      court.gpuResident === false &&
        cubes.every(
          (texture) => !renderer.properties.get(texture).__webglTexture,
        ) &&
        mirrors.entries.every(
          (item) =>
            item.uniforms.uMirrorStill.value === 0 &&
            item.uniforms.uMirrorCube.value === null,
        ),
      {},
    );
    await worlds.ensure("court");
    court.enter();
    state.loading = false;
    look(start);
    await frames(40);
    verify(
      "Restoring the court captures the mirrors again and reflects live",
      court.gpuResident === true &&
        mirrors.entries.every(
          (item) =>
            item.uniforms.uMirrorStill.value === 1 &&
            !!renderer.properties.get(item.cube.texture).__webglTexture,
        ) &&
        live() === 2,
      { live: live() },
    );
    verify(
      "No shader program was compiled by any of this",
      renderer.info.programs.length === programs,
      { before: programs, after: renderer.info.programs.length },
    );
    return checks;
  });
  for (const check of result.checks) console.log("PASS " + check.name);
  assert.deepEqual(result.errors, []);
  result.passed = true;
} catch (error) {
  result.failure = error.stack;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(out, JSON.stringify(result, null, 2) + "\n");
  await browser.close();
  for (const stream of browser.process()?.stdio ?? []) stream?.destroy();
}
