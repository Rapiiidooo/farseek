// In-page recorder that the nightly monitor installs into a game page opened with ?debug=1.
// After every world render it records the shader program count, whether world preparation was
// running, and (with `pixels`) the frame itself resolved, reduced to 1/8 and read back two
// frames later through a pixel buffer for the flash rules, keeping 1/4 size images of flagged
// frames and their neighbours.
export function installRecorder(options, flashKinds) {
  if (window.__NIGHTLY__) return "present";
  const FD = window.__FD__;
  if (!FD?.worlds || !FD.renderer || !FD.app) return "waiting";
  const { renderer, worlds, app } = FD;
  const gl = renderer.getContext();
  const n = {
    frames: [],
    events: [],
    programEvents: [],
    errors: [],
    captured: 0,
    flagged: 0,
    saved: 0,
  };
  window.__NIGHTLY__ = n;

  let started = 0;
  const pending = worlds.pending;
  const set = pending.set;
  pending.set = function (key, value) {
    started++;
    return set.call(this, key, value);
  };
  const busy = () => worlds.pending.size > 0 || worlds.jobs.size > 0;
  const worldId = () => {
    for (const [id, world] of worlds.instances)
      if (world === worlds.current) return id;
    return null;
  };
  let known = new Set(renderer.info.programs);
  let busyBefore = busy(),
    startedBefore = started;

  function programs(t, world) {
    const list = renderer.info.programs;
    const busyNow = busy();
    // New programs are appended, so a creation shows at the end even when another was released.
    if (list.length > known.size || (list.length && !known.has(list.at(-1)))) {
      const { mode, loading } = app.state;
      const late =
        (mode === "play" || mode === "credits") &&
        !loading &&
        !busyBefore &&
        !busyNow &&
        started === startedBefore;
      n.programEvents.push({
        t,
        world,
        mode,
        from: known.size,
        to: list.length,
        created: list.filter((p) => !known.has(p)).length,
        late,
        pending: [...worlds.pending.keys()],
        added: list
          .filter((p) => !known.has(p))
          .slice(0, 12)
          .map((p) => ({
            name: p.name || p.type,
            key: String(p.cacheKey).slice(0, 200),
          })),
      });
    }
    if (list.length !== known.size || !known.has(list.at(-1)))
      known = new Set(list);
    busyBefore = busyNow;
    startedBefore = started;
  }

  const GX = 8,
    GY = 5;
  let W = 0,
    H = 0,
    format = gl.RGBA8,
    resolve = null,
    chain = [],
    ring = [],
    buffers = [],
    index = 0,
    last = 0,
    view = null,
    cost = 0,
    failures = 0;
  const history = [];
  // A pixel buffer is read two frames after its copy, once the GPU has finished it, so the
  // frame never waits; fence objects raise WebGL errors here when the canvas resizes.
  const QUEUE = 2;
  const queue = [];
  const make = (w, h) => {
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, format, w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.RENDERBUFFER,
      rb,
    );
    return { fb, rb, w, h };
  };
  const free = (o) => {
    gl.deleteFramebuffer(o.fb);
    gl.deleteRenderbuffer(o.rb);
  };
  function allocate() {
    [resolve, ...chain, ...ring].filter(Boolean).forEach(free);
    queue.length = 0;
    buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    W = gl.drawingBufferWidth;
    H = gl.drawingBufferHeight;
    resolve = make(W, H);
    chain = [2, 4, 8].map((k) =>
      make(Math.max(1, Math.round(W / k)), Math.max(1, Math.round(H / k))),
    );
    // Thumbnails of a flagged frame and its neighbours must outlive the readback queue.
    ring = Array.from({ length: QUEUE + 3 }, () =>
      make(chain[1].w, chain[1].h),
    );
    buffers = Array.from({ length: QUEUE + 1 }, () => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(
        gl.PIXEL_PACK_BUFFER,
        chain[2].w * chain[2].h * 4,
        gl.STREAM_READ,
      );
      return buffer;
    });
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  const blit = (from, to, filter) => {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from ? from.fb : null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.fb);
    const w = from ? from.w : W,
      h = from ? from.h : H;
    gl.blitFramebuffer(
      0,
      0,
      w,
      h,
      0,
      0,
      to.w,
      to.h,
      gl.COLOR_BUFFER_BIT,
      filter,
    );
  };
  const read = (target) => {
    const pixels = new Uint8Array(target.w * target.h * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.fb);
    gl.readPixels(0, 0, target.w, target.h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  function stats(pixels, w, h) {
    let sum = 0,
      zero = 0;
    const cells = new Float64Array(GX * GY),
      counts = new Float64Array(GX * GY);
    for (let y = 0; y < h; y++) {
      const row = Math.min(GY - 1, Math.floor(((h - 1 - y) / h) * GY));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = pixels[i],
          g = pixels[i + 1],
          b = pixels[i + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += l;
        if (r === 0 && g === 0 && b === 0) zero++;
        const cell = row * GX + Math.min(GX - 1, Math.floor((x / w) * GX));
        cells[cell] += l;
        counts[cell]++;
      }
    }
    return {
      L: sum / (w * h),
      zero: zero / (w * h),
      cells: [...cells].map((c, k) => c / counts[k]),
    };
  }
  function encode(pixels, w, h) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++)
      image.data.set(
        pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4),
        y * w * 4,
      );
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
    ctx.putImageData(image, 0, 0);
    return canvas.convertToBlob({ type: "image/png" }).then(
      (blob) =>
        new Promise((done) => {
          const reader = new FileReader();
          reader.onload = () => done(reader.result);
          reader.readAsDataURL(blob);
        }),
    );
  }

  // A camera that jumps between frames changes the picture by design, not by a fault.
  function cut(camera) {
    const e = camera.matrixWorld.elements;
    const now = [e[12], e[13], e[14], -e[8], -e[9], -e[10]];
    const before = view;
    view = now;
    if (!before) return { moved: 0, turned: 0, now };
    const moved = Math.hypot(
      now[0] - before[0],
      now[1] - before[1],
      now[2] - before[2],
    );
    const dot = now[3] * before[3] + now[4] * before[4] + now[5] * before[5];
    return { moved, turned: Math.acos(Math.min(1, Math.max(-1, dot))), now };
  }

  function capture(t, world, camera) {
    if (gl.drawingBufferWidth !== W || gl.drawingBufferHeight !== H) {
      history.length = 0;
      allocate();
      blit(null, resolve, gl.NEAREST);
      // A multisampled default framebuffer resolves only into its own format.
      if (gl.getError() && format === gl.RGBA8) {
        format = gl.RGB8;
        W = 0;
        return;
      }
    } else blit(null, resolve, gl.NEAREST);
    const now = performance.now();
    const motion = cut(camera);
    blit(resolve, chain[0], gl.LINEAR);
    blit(chain[0], chain[1], gl.LINEAR);
    blit(chain[1], chain[2], gl.LINEAR);
    const slot = index % ring.length;
    blit(chain[1], ring[slot], gl.NEAREST);
    const buffer = buffers.find((b) => !queue.some((e) => e.buffer === b));
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, chain[2].fb);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.readPixels(0, 0, chain[2].w, chain[2].h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    queue.push({
      buffer,
      dt: last ? now - last : 0,
      frame: {
        cut:
          motion.moved > options.limits.cutMetres ||
          motion.turned > options.limits.cutRadians,
        i: index,
        t,
        shots: app.equipment?.shots ?? 0,
        space: !!worlds.current?.epilogue?.active,
        hidden: !!FD.follow?.hidden,
        p: motion.now.slice(0, 3),
        f: motion.now.slice(3),
        slot,
        world,
        mode: app.state.mode,
      },
    });
    last = now;
    index++;
    collect();
  }

  // Reads the readbacks older than the queue, oldest first, and applies the flash rules.
  function collect() {
    const small = chain[2];
    const pixels = new Uint8Array(small.w * small.h * 4);
    while (queue.length > QUEUE) {
      const entry = queue.shift();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, entry.buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const frame = { ...entry.frame, ...stats(pixels, small.w, small.h) };
      n.frames.push([
        +frame.t.toFixed(1),
        +entry.dt.toFixed(1),
        +frame.L.toFixed(2),
        +frame.zero.toFixed(4),
        frame.world,
        frame.space ? 1 : 0,
        frame.cut ? 1 : 0,
        +cost.toFixed(2),
      ]);
      n.captured++;
      history.push(frame);
      if (history.length > 3) history.shift();
      if (history.length === 3) judge(...history);
    }
  }

  function judge(a, b, c) {
    const kinds = flashKinds(a, b, c, options.limits);
    if (!kinds.length) return;
    n.flagged++;
    const event = {
      i: b.i,
      t: +b.t.toFixed(1),
      world: b.world,
      mode: b.mode,
      kinds,
      L: [a.L, b.L, c.L].map((v) => +v.toFixed(2)),
      zero: [a.zero, b.zero, c.zero].map((v) => +v.toFixed(4)),
      images: null,
      ready: true,
    };
    if (n.saved < options.maxImages) {
      n.saved++;
      event.ready = false;
      const target = ring[0];
      Promise.all(
        [a, b, c].map((f) => encode(read(ring[f.slot]), target.w, target.h)),
      ).then(
        (urls) => {
          event.images = urls;
          event.ready = true;
        },
        () => (event.ready = true),
      );
    }
    n.events.push(event);
  }

  const render = worlds.render;
  worlds.render = function (camera, dt) {
    render.call(this, camera, dt);
    const t = performance.now();
    const world = worldId();
    try {
      programs(t, world);
      if (options.pixels && failures < 5) {
        capture(t, world, camera);
        cost = performance.now() - t;
      }
    } catch (error) {
      failures++;
      n.errors.push(String(error?.stack || error).slice(0, 400));
    } finally {
      if (options.pixels) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        renderer.resetState();
      }
    }
  };
  n.drain = () => {
    const out = {
      frames: n.frames,
      programs: n.programEvents,
      events: n.events.filter((e) => e.ready),
      errors: n.errors,
      captured: n.captured,
      flagged: n.flagged,
    };
    n.frames = [];
    n.programEvents = [];
    n.events = n.events.filter((e) => !e.ready);
    n.errors = [];
    return out;
  };
  return "installed";
}
