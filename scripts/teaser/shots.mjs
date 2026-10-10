// The teaser's shots. Each opens its chapter, plays its moment with real keys, and films it
// through a lens of its own: (t, subject, mem, lib, params, dt, game) => {pos, look, fov}.
// Lens functions run in the page, so they use only their arguments.

// A save that has reached the forest: Nyra carries Mira's ice axes and her pistols.
const LATE = {
  reached: ["court", "floor", "checkpoint", "isles", "frost", "forest", "sea"],
  last: "frost",
  pistols: true,
};

// Places her on the ground (or at `feet`) facing `yaw`, with the follow camera behind her.
function place(c, x, z, yaw, feet = null) {
  return c.eval(
    (x, z, yaw, feet) => {
      const { hero, follow, app } = window.__FD__;
      const f = feet ?? hero.world.ground(x, z, 0.2, 1e4, 0);
      hero.spawn(x, z, f, yaw);
      follow.yaw = yaw;
      follow.snap(hero);
      app.state.cinematic?.skip?.();
      app.state.cinematic = app.state.intro = null;
    },
    x,
    z,
    yaw,
    feet,
  );
}

async function settle(c, seconds = 2.5) {
  await c.skipCinematic();
  await c.wait(seconds);
  await c.skipCinematic();
}

// --- lenses -------------------------------------------------------------------------------

// Holds a point beside her (or a fixed point) and looks at her, easing after her as she
// moves: `from`/`to` offset the lens from her hips over `seconds`, `fixed`/`fixedTo` place it
// in the world instead.
function follower(t, s, mem, lib, P, dt) {
  const target = lib.damp(
    mem,
    "target",
    lib.add(s.hips, P.aim || [0, 0.3, 0]),
    P.rate ?? 4,
    dt,
  );
  const k = lib.inOut(t / (P.seconds || 4));
  const base = P.fixed
    ? lib.mix(P.fixed, P.fixedTo || P.fixed, k)
    : lib.add(s.hips, lib.mix(P.from, P.to || P.from, k));
  const pos = lib.add(base, lib.hand(t, P.hand ?? 0.02, 1));
  return { pos, look: target, fov: P.fov ?? 40 };
}

// Moves along keyed points, looking at keyed points, over `seconds`.
function rail(t, s, mem, lib, P) {
  const k = lib.inOut(t / P.seconds);
  const pos = lib.add(lib.path(P.pos, k), lib.hand(t, P.hand ?? 0.015, 2));
  return { pos, look: lib.path(P.look, k), fov: P.fov ?? 40 };
}

// The game's own camera with a longer lens.
function game(t, s, mem, lib, P, dt, g) {
  return { pos: g.pos, look: g.look, fov: P.fov ?? g.fov };
}

// A still or gently moving view of a place, Nyra standing in it where `at` puts her.
function view({
  chapter,
  at,
  pos,
  look,
  fov = 40,
  seconds = 4,
  progress,
  act,
}) {
  return {
    chapter,
    progress,
    query: at ? { at } : {},
    async run(c) {
      await settle(c, 3);
      await c.lens(rail, {
        seconds,
        pos: pos.length === 3 && !Array.isArray(pos[0]) ? [pos, pos] : pos,
        look:
          look.length === 3 && !Array.isArray(look[0]) ? [look, look] : look,
        fov,
        hand: 0.008,
      });
      await c.roll();
      if (act) await act(c);
      await c.wait(seconds);
      await c.cut();
    },
  };
}

// --- shots ---------------------------------------------------------------------------------

export const SHOTS = {
  // The axes biting into the pocket fall below the crevasse, from above the rock beside it.
  "climb-chips": {
    chapter: "frost",
    progress: LATE,
    query: { at: "0.5,-48.4,0,180" },
    async run(c) {
      await settle(c);
      const climb = async (name, lens) => {
        await place(c, 0.5, -48.4, Math.PI, 0);
        await c.face(Math.PI);
        await c.wait(0.8);
        await c.lens(follower, lens);
        await c.roll(name);
        await c.wait(0.3);
        await c.hold(["KeyW"]);
        await c.wait(0.4);
        await c.hold(["KeyW", "Space"]);
        await c.until(
          (s) => s.state === "wall" && s.climb.wall === "pocket",
          3,
          "grab the pocket fall",
        );
        c.mark("grab");
        await c.hold(["KeyW"]);
        await c.until(
          (s) => s.state === "ground" && Math.abs(s.feet - 4) < 0.1,
          6,
          "top of the pocket",
        );
        c.mark("top");
        await c.hold([]);
        await c.wait(0.6);
        await c.cut();
      };
      await climb("side", {
        fixed: [2.85, 4.1, -48.35],
        fixedTo: [2.65, 4.7, -48.9],
        aim: [0, 0.75, 0],
        fov: 40,
        seconds: 3.6,
        rate: 5,
        hand: 0.012,
      });
    },
  },

  // The frost lynx: its crouch, the pounce met by the shield in slow motion, then dragged out
  // of cover by the tether and met by both pistols.
  lynx: {
    chapter: "frost",
    progress: LATE,
    settings: { difficulty: "story" },
    query: { at: "3,-77,3.8,180" },
    async run(c) {
      await settle(c, 1.5);
      await c.until((s) => s.frozen?.hunt?.met, 4, "the plateau is met");
      const reset = () =>
        c.eval(() => {
          const { hero, follow, equipment, worldFour: F } = window.__FD__;
          equipment.grant("shield");
          equipment.grant("pull");
          F.hunt.reset();
          hero.invulnerable = 1e9;
          hero.spawn(0, -87.5, 3.8, -1.31);
          follow.yaw = -1.31;
          follow.snap(hero);
        });
      await reset();
      await c.face(-1.31);
      await c.wait(0.3);
      const L = (s) => s.frozen.hunt.lynx;
      // Side on to the line from the lair to her, low, pushing in.
      await c.lens(rail, {
        seconds: 4.5,
        pos: [
          [-0.7, 4.2, -80.9],
          [-1.1, 4.3, -82.2],
        ],
        look: [
          [-2.1, 4.45, -86.8],
          [-2.0, 4.5, -86.9],
        ],
        fov: 38,
        hand: 0.02,
      });
      await c.roll("pounce");
      await c.until((s) => L(s).state === "windup", 6, "the crouch");
      c.mark("crouch");
      await c.until((s) => L(s).state === "pounce", 3, "the pounce");
      c.mark("pounce");
      await c.hold(["KeyV"]);
      let slow = 1,
        met = false;
      for (let i = 0; i < 150; i++) {
        const s = await c.state();
        if (i === 4) await c.hold([]);
        const st = L(s).state;
        if (st === "sprawl" || st === "land") {
          if (!met) (c.mark(`met: ${st}`), (met = true));
          slow = Math.min(1, slow + 0.05);
        } else slow = Math.max(0.3, slow - 0.12);
        await c.frame(slow);
        if (slow >= 1 && met && i > 60) break;
      }
      await c.wait(0.8);
      await c.cut();

      // The tether: wait for it to go to ground, then drag it out, over her shoulder.
      await c.lens(null);
      await c.until(
        (s) => ["hidden", "stalk"].includes(L(s).state),
        8,
        "back in cover",
      );
      const s0 = await c.state();
      const at = L(s0).at;
      const yaw = Math.atan2(at[0] - s0.pos[0], at[2] - s0.pos[1]);
      await c.face(yaw);
      await c.wait(0.35);
      await c.lens(follower, {
        from: [
          -Math.sin(yaw) * 2.6 + Math.cos(yaw) * 1.7,
          1.25,
          -Math.cos(yaw) * 2.6 - Math.sin(yaw) * 1.7,
        ],
        aim: [Math.sin(yaw) * 2.0, -0.45, Math.cos(yaw) * 2.0],
        fov: 42,
        rate: 6,
        hand: 0.014,
      });
      await c.roll("tether");
      await c.wait(0.3);
      await c.hold(["KeyR"]);
      await c
        .until((s) => L(s).state === "pulled", 1.5, "pulled")
        .then(() => c.mark("pulled"))
        .catch(() => c.mark("no pull"));
      await c
        .until((s) => L(s).state !== "pulled", 2.5, "pull ends")
        .catch(() => {});
      await c.hold([]);
      c.mark("pull ends");
      await c.wait(0.3);
      await c.cut();

      // Both pistols while it sprawls, seen from in front of her.
      const s1 = await c.state();
      const l1 = L(s1).at;
      const aim = Math.atan2(l1[0] - s1.pos[0], l1[2] - s1.pos[1]);
      await c.face(aim);
      await c.lens(follower, {
        from: [
          Math.cos(aim) * 2.6 + Math.sin(aim) * 0.9,
          -0.05,
          -Math.sin(aim) * 2.6 + Math.cos(aim) * 0.9,
        ],
        aim: [Math.sin(aim) * 1.1, 0.35, Math.cos(aim) * 1.1],
        fov: 42,
        rate: 8,
        hand: 0.02,
      });
      await c.roll("pistols");
      await c.tap(["Digit2"], 0.08);
      await c.page.mouse.move(640, 360);
      await c.page.mouse.down({ button: "right" });
      await c.wait(0.3);
      await c.page.mouse.down({ button: "left" });
      c.mark("fire");
      await c.wait(1.3);
      await c.page.mouse.up({ button: "left" });
      await c.page.mouse.up({ button: "right" });
      await c.wait(0.5);
      await c.cut();
    },
  },

  // The castle's outer wall in the Wildwood, climbed on its ivy.
  ivy: {
    chapter: "forest",
    progress: LATE,
    query: { at: "-24.4,-201.4,0,180" },
    async run(c) {
      await settle(c);
      await place(c, -24.4, -201.4, Math.PI);
      await c.face(Math.PI);
      await c.wait(0.8);
      const s0 = await c.state();
      await c.lens(follower, {
        fixed: [-21.2, s0.feet + 0.6, -199.2],
        fixedTo: [-21.6, s0.feet + 3.4, -199.6],
        aim: [0, 0.45, 0],
        fov: 40,
        seconds: 5.5,
        rate: 3.5,
      });
      await c.roll();
      await c.wait(0.3);
      await c.hold(["KeyW"]);
      await c.wait(0.4);
      await c.hold(["KeyW", "Space"]);
      await c.until(
        (s) => s.state === "wall" && s.climb.wall === "outer-wall",
        3,
        "grab the ivy",
      );
      c.mark("grab");
      await c.hold(["KeyW"]);
      await c.until(
        (s) => s.state === "ground" && s.pos[1] < -203,
        8,
        "over the wall",
      );
      c.mark("top");
      await c.hold([]);
      await c.wait(0.8);
      await c.cut();
    },
  },

  // The six seals answered at once, then the reveal through to the next door.
  reveal: {
    chapter: "vault",
    async run(c) {
      await settle(c, 2);
      await place(c, -0.8, -55.8, Math.PI);
      await c.face(Math.PI);
      await c.wait(0.5);
      await c.lens(rail, {
        seconds: 9.5,
        pos: [
          [0.8, 1.2, -47.5],
          [0.6, 1.5, -50.5],
        ],
        look: [
          [0.0, 5.4, -66.1],
          [0.0, 5.2, -66.1],
        ],
        fov: 36,
        hand: 0.01,
      });
      await c.roll("medallions");
      await c.wait(0.4);
      await c.eval(() => {
        const v = window.__FD__.worlds.get("vault");
        for (const t of v.trials) if (!t.done) (t.solve(), v.trialDone(t));
      });
      c.mark("solved");
      await c.until(
        (s) => s.vault.hall.medallions.every((m) => m > 0.9),
        14,
        "medallions lit",
      );
      c.mark("all lit");
      await c.wait(1.2);
      await c.cut();
      await place(c, 0, -56.5, Math.PI);
      await c.lens(game, { fov: 44 });
      await c.roll("reveal");
      await c.eval(() => {
        const { worlds, app } = window.__FD__;
        const v = worlds.get("vault");
        if (!v.revealed) v.reveal(app.state);
      });
      await c.until((s) => s.cinematic, 2, "the reveal starts");
      c.mark("reveal");
      await c.until((s) => !s.cinematic, 40, "the reveal ends");
      c.mark("reveal ends");
      await c.wait(0.5);
      await c.cut();

      // Toward the open door, Mira's light going ahead of her.
      await place(c, 0.5, -81.5, Math.PI);
      await c.face(Math.PI);
      await c.eval(() => {
        const { worlds, THREE } = window.__FD__;
        const v = worlds.get("vault");
        v.mira.place(new THREE.Vector3(-0.9, 2.3, -81.2));
        v.mira.go([new THREE.Vector3(-0.5, 3.2, -88.5)]);
      });
      await c.wait(0.4);
      await c.lens(follower, {
        from: [0.85, 0.35, 3.4],
        to: [0.55, 0.75, 2.4],
        aim: [0, 1.6, -7],
        fov: 36,
        seconds: 4,
        rate: 3,
      });
      await c.roll("walk");
      await c.pace("walk");
      await c.steer([0, -92.2]);
      await c.hold(["KeyW"]);
      await c.wait(3.6);
      await c.hold([]);
      await c.cut();
    },
  },

  // Her face before the vault's window on space, Mira's light hovering beside her.
  portrait: {
    chapter: "vault",
    async run(c) {
      await settle(c, 2);
      await c.eval(() => {
        const { worlds, THREE, app } = window.__FD__;
        const v = worlds.get("vault");
        v.mira.go = () => {};
        v.mira.place(new THREE.Vector3(0.55, 1.95, 3.95));
        app.lighting.closeUp(true);
      });
      await place(c, 0, 4.6, Math.PI);
      await c.face(Math.PI);
      await c.wait(2);
      await c.lens(rail, {
        seconds: 5,
        pos: [
          [-0.35, 1.7, 2.05],
          [-0.2, 1.66, 2.45],
        ],
        look: [
          [0.15, 1.75, 4.3],
          [0.1, 1.68, 4.5],
        ],
        fov: 32,
        hand: 0.005,
      });
      await c.roll();
      await c.wait(5);
      await c.cut();
    },
  },

  // Space: her gold light and Mira's white one meet beyond the drowned city's last door.
  reunion: {
    chapter: "sea",
    async run(c) {
      await settle(c, 2.5);
      await c.eval(() => {
        const { worlds, hero, follow } = window.__FD__;
        const six = worlds.get("six");
        six.solve();
        hero.spawn(0, -97, six.gate.daisTop + 0.02, Math.PI);
        follow.yaw = Math.PI;
        follow.snap(hero);
      });
      await c.face(Math.PI);
      await c.wait(0.5);
      await c.lens(null);
      await c.hold(["KeyW"]);
      await c.until((s) => s.cinematic, 8, "the finale starts");
      await c.hold([]);
      await c.roll();
      c.mark("finale");
      await c.wait(24);
      await c.cut();
    },
  },

  "court-haze": view({
    chapter: "court",
    at: "19.4,39,8,180",
    pos: [
      [24, 13.5, 47],
      [23.2, 13.1, 45.6],
    ],
    look: [
      [13, 2, 8],
      [13, 2.2, 8],
    ],
    fov: 36,
  }),
  "isles-rim": view({
    chapter: "isles",
    at: "1.5,-9,0.3,140",
    pos: [
      [-2.6, 2.3, -2.2],
      [-2.2, 2.0, -3.0],
    ],
    look: [
      [4, 1.1, -12.5],
      [4, 1.2, -12.5],
    ],
    fov: 40,
  }),
  "isles-wide": view({
    chapter: "isles",
    pos: [
      [-5, 5, 5],
      [-4, 5.6, 3.5],
    ],
    look: [
      [6, 0, -50],
      [6, 0.4, -50],
    ],
    fov: 38,
  }),
  "forest-shafts": view({
    chapter: "forest",
    progress: LATE,
    pos: [
      [1.5, 3.2, -8],
      [1.2, 3.0, -10.5],
    ],
    look: [
      [-1, 5, -48],
      [-1, 5, -48],
    ],
    fov: 40,
  }),
  "sea-caustics": view({
    chapter: "sea",
    at: "0,-8,30.4,0",
    pos: [
      [4.5, 32.6, -3.5],
      [3.6, 32.2, -5.0],
    ],
    look: [
      [0, 29.6, -14],
      [0, 29.6, -14],
    ],
    fov: 42,
  }),
  "sea-city": view({
    chapter: "sea",
    pos: [
      [-6, 31, -6],
      [-8, 29.5, -8.5],
    ],
    look: [
      [-32, 16, -28],
      [-32, 16, -28],
    ],
    fov: 40,
  }),

  // Across the void on the builders' rope, filmed twice with the same keys: once running
  // beside her to the rim, once side on to the whole arc.
  swing: {
    chapter: "isles",
    query: { at: "3.37,-15.37,0.97,177.7" },
    async run(c) {
      await settle(c, 2.5);
      const start = () =>
        c.eval(() => {
          const { worldThree, hero, follow } = window.__FD__;
          const I = worldThree.isles;
          const r = I.swings.rope("first");
          const on = I.isle(r.on).collider;
          const h = r.heading;
          const x = on.x - h.x * 1.2,
            z = on.z - h.y * 1.2;
          hero.spawn(x, z, I.groundAt(x, z), Math.atan2(h.x, h.y));
          follow.yaw = Math.atan2(h.x, h.y);
          follow.snap(hero);
          return {
            pivot: r.pivot.toArray(),
            h: [h.x, h.y],
            yaw: Math.atan2(h.x, h.y),
          };
        });
      const swing = async (r) => {
        await c.hold(["KeyW"]);
        await c.until(
          (s) =>
            (r.pivot[0] - s.pos[0]) * r.h[0] +
              (r.pivot[2] - s.pos[1]) * r.h[1] <
            3.35,
          3,
          "run-up",
        );
        c.mark("leap");
        await c.hold(["KeyW", "Space"]);
        await c.wait(0.3);
        await c.hold(["KeyW"]);
        await c.until((s) => s.state === "swing", 2, "catch the rope");
        c.mark("catch");
        await c.until(
          (s) => {
            const p = s.isles.pendulum;
            return p && p.t > 0.4 && p.angle > 0.5 && p.spin < 0.35;
          },
          5,
          "front of the arc",
        );
        await c.tap(["Space"], 0.1);
        c.mark("release");
        await c.hold([]);
        await c.until(
          (s) => s.state === "ground" && s.isles.on === "well",
          3,
          "land on the far isle",
        );
        c.mark("land");
        await c.wait(1.2);
        await c.cut();
      };
      let r = await start();
      await c.face(r.yaw);
      await c.pace("run");
      await c.wait(0.6);
      // Beside her on the run, held at the rim as she swings away over the void.
      await c.lens(function (t, s, mem, lib, P, dt) {
        const x = Math.max(3.3, Math.min(9, s.x + 2.4));
        const z = Math.max(-19.2, s.z + 1.6);
        const pos = lib.damp(
          mem,
          "pos",
          [x, Math.max(1.4, s.y + 1.0), z],
          5,
          dt,
        );
        const look = lib.damp(
          mem,
          "look",
          lib.add(s.hips, [0, 0.2, -0.6]),
          7,
          dt,
        );
        return { pos: lib.add(pos, lib.hand(t, 0.015, 3)), look, fov: 44 };
      });
      await c.roll("catch");
      await c.wait(0.25);
      await swing(r);

      r = await start();
      await c.face(r.yaw);
      await c.wait(0.8);
      await c.lens(function (t, s, mem, lib, P, dt) {
        const look = lib.damp(mem, "look", lib.add(s.hips, [0, 0.1, 0]), 4, dt);
        return {
          pos: lib.add([12.8, 1.5, -21.6], lib.hand(t, 0.01, 4)),
          look,
          fov: 40,
        };
      });
      await c.roll("ride");
      await c.wait(0.25);
      await swing(r);
    },
  },

  // Carried by the arrival plaza's current, its streaks racing past her.
  current: {
    chapter: "sea",
    async run(c) {
      await settle(c, 2.5);
      await c.eval(() => {
        const { worldSix, hero, follow } = window.__FD__;
        worldSix.drowned.breath.reset();
        hero.spawn(1.5, -11.6, 30.6, -Math.PI / 2);
        follow.yaw = -Math.PI / 2;
        follow.pitch = 0;
        follow.snap(hero);
      });
      await c.face(-Math.PI / 2, 0);
      await c.wait(0.4);
      await c.lens(function (t, s, mem, lib, P, dt) {
        const target = lib.damp(mem, "t", lib.add(s.hips, [0, 0.2, 0]), 6, dt);
        const pos = lib.add(
          lib.add(target, [-2.2, 0.35, 2.3]),
          lib.hand(t, 0.03, 5),
        );
        return { pos, look: lib.add(target, [-0.6, 0, 0]), fov: 46 };
      });
      await c.roll();
      await c.hold(["KeyW"]);
      await c.wait(3.2);
      await c.hold([]);
      await c.cut();
    },
  },
};
