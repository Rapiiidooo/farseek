// The scenarios the capture page plays for both trees: synthetic hero states for the gaits, the
// landing, the ledge, the rope, a hit and a roll; the explorer's own controller on ice and ivy;
// the lab's equipment for the pistols, the aim and the reload.
import * as THREE from "three";

const { box, stone, ice, ivy, rope } = window.CAPTURE;
const range = (start, step, count = 8) =>
  Array.from({ length: count }, (_, i) => +(start + i * step).toFixed(3));

const gait = (speed, ramp) => (T, t, dt) => {
  const h = T.h;
  h.speed = Math.min(speed, t * ramp);
  h.vel.set(0, 0, h.speed);
  h.pos.z += h.speed * dt;
  T.animator.update(dt, h);
};

const equipped = (carry, events) => ({
  body: [1.5, 0.55, 2.4],
  setup(T) {
    T.lab.select("pistols", true);
    T.lab.setCarry(carry);
  },
  step(T, t, dt) {
    events(T, t);
    T.lab.prepare(dt, T.h);
    T.animator.update(dt, T.h);
    T.lab.update(dt, T.h);
  },
});

function wall(kind) {
  return {
    body: [1.7, 0.6, -2.8],
    handView: { thumb: -0.6, normal: -0.5, fingers: -0.3 },
    setup(T) {
      const { World, Hero, addClimbSurface } = T.modules;
      const world = new World();
      world.add(-10, -30, -10, 10, 0, 10, "rock");
      world.add(-3, -30, -3.6, 3, 4.6, -2, "rock", null, { grab: false });
      world.add(-10, -30, -14, 10, 4.6, -3.6, "rock");
      addClimbSurface(world, {
        kind,
        x: 0,
        z: -2,
        nx: 0,
        nz: 1,
        width: 4,
        bottom: -0.2,
        top: 4.6,
      });
      T.props.add(
        box(kind === "ice" ? ice : ivy, [6, 4.6, 1.6], [0, 2.3, -2.8]),
      );
      const hero = new Hero(world, {
        interactables: () => [],
        use: () => false,
        moveBlock: () => false,
      });
      hero.spawn(0, -1.2, 0, Math.PI);
      hero.axes = kind === "ice";
      T.world = world;
      T.h = hero;
      T.animator.groundAt = (x, z, referenceY) => ({
        height: world.ground(x, z, 0.025, Math.max(referenceY, hero.feet), 0.6),
        normal: new THREE.Vector3(0, 1, 0),
      });
    },
    step(T, t, dt) {
      const frame = Math.round(t * 60);
      const up = t > 0.4 && t < 2.2,
        across = t >= 2.2 && t < 3;
      T.h.update(dt, {
        move: { x: across ? 1 : 0, y: t < 0.4 || up ? 1 : 0 },
        camYaw: Math.PI,
        jump: frame === Math.round(0.32 * 60),
        jumpHeld: false,
        drop: false,
        dropHeld: false,
        interactPressed: false,
        interactHeld: false,
        walk: false,
        roll: false,
      });
      T.h.events.splice(0);
      T.h.wallStrikes?.splice(0);
      T.animator.update(dt, T.h);
    },
  };
}

window.SCENARIOS = {
  standing: {
    times: range(1, 1),
    closeUps: [
      { at: 3, side: "left", name: "left-3s" },
      { at: 6, side: "right", name: "right-6s" },
    ],
    step: gait(0, 0),
  },
  walking: {
    times: range(3, 0.1025),
    step: gait(1.7, 2),
  },
  running: {
    times: range(3, 0.076),
    closeUps: [{ at: 3.3, side: "left", name: "left" }],
    step: gait(5.6, 4.5),
  },
  landing: {
    times: [1.6, 1.8, 1.85, 1.9, 1.95, 2.05, 2.2, 2.5],
    closeUps: [{ at: 1.9, side: "left", name: "left-flex" }],
    step(T, t, dt) {
      const h = T.h;
      const air = t >= 1 && t < 1.8,
        u = (t - 1) / 0.8;
      h.state = air ? "air" : "ground";
      h.feet = air ? Math.sin(u * Math.PI) * 0.85 : 0;
      h.vel.y = air ? (Math.cos(u * Math.PI) * 0.85 * Math.PI) / 0.8 : 0;
      h.landing = t >= 1.8 ? Math.max(0, 0.7 - 3 * (t - 1.8)) : 0;
      T.animator.update(dt, h);
    },
  },
  ledge: {
    times: [0.38, 0.43, 0.48, 0.53, 0.58, 0.63, 0.75, 1.5],
    closeUps: [
      { at: 0.5, side: "right", name: "right-reach" },
      { at: 1.5, side: "right", name: "right-hold" },
    ],
    body: [2.1, 0.2, -2.2],
    bodyLift: 0.35,
    handView: { thumb: 0.35, normal: -0.75, fingers: -0.45 },
    setup(T) {
      T.props.add(box(stone, [4, 2.4, 1.2], [0, 1.2, 0.84]));
      T.hangFeet = 2.4 - T.animator.hangReach(0.25);
    },
    step(T, t, dt) {
      const h = T.h;
      const hang = t >= 0.4;
      h.state = hang ? "hang" : "air";
      h.vel.y = hang ? 0 : -1;
      h.feet = hang ? T.hangFeet : T.hangFeet + 0.1 - 0.25 * t;
      h.t = hang ? t - 0.4 : t;
      h.ledge = { n: { x: 0, z: -1 }, top: 2.4, hand: { x: 0, z: 0.24 } };
      T.animator.update(dt, h);
    },
  },
  ice: {
    times: range(0.5, 0.33),
    closeUps: [{ at: 2.15, side: "right", name: "right-axe" }],
    ...wall("ice"),
  },
  ivy: {
    times: range(0.5, 0.33),
    closeUps: [{ at: 1.49, side: "left", name: "left-between-holds" }],
    ...wall("vine"),
  },
  rope: {
    times: [0.02, 0.07, 0.12, 0.17, 0.25, 0.6, 1.1, 1.6],
    closeUps: [
      { at: 0.12, side: "right", name: "right-reach" },
      { at: 0.17, side: "left", name: "left-closing" },
    ],
    body: [2.4, -0.3, 1.2],
    bodyLift: 0.4,
    setup(T) {
      const pivot = new THREE.Vector3(0, 7, 0);
      T.swing = {
        pivot,
        hands: T.animator.hangReach(0.3) ?? 2.05,
        mesh: new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 1, 10),
          rope,
        ),
      };
      T.props.add(T.swing.mesh);
      T.floor.visible = false;
      T.h.state = "swing";
      T.h.yaw = 0;
      T.h.pendulum = {
        rope: { pivot, id: "capture" },
        angle: 0,
        spin: 0,
        length: 4.2,
        reach: 5.2,
        dir: { x: 0, y: 1 },
        heading: { x: 0, y: 1 },
        grip: new THREE.Vector3(),
        t: 0,
      };
    },
    step(T, t, dt) {
      const h = T.h,
        sw = h.pendulum,
        { pivot, hands, mesh } = T.swing;
      sw.angle = 0.55 * Math.cos(2 * t + 0.3);
      sw.spin = -1.1 * Math.sin(2 * t + 0.3);
      sw.t = t;
      const s = Math.sin(sw.angle),
        c = Math.cos(sw.angle);
      sw.grip.set(0, pivot.y - c * sw.length, s * sw.length);
      h.pos.set(0, 0, s * (sw.length + hands));
      h.feet = pivot.y - c * (sw.length + hands);
      const end = sw.grip
        .clone()
        .addScaledVector(sw.grip.clone().sub(pivot).normalize(), 0.25);
      mesh.position.copy(pivot).add(end).multiplyScalar(0.5);
      mesh.scale.y = pivot.distanceTo(end);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        end.clone().sub(pivot).normalize(),
      );
      T.animator.update(dt, h);
    },
  },
  pistols: {
    times: [0.3, 0.6, 0.9, 1.2, 1.5, 1.62, 1.7, 2],
    closeUps: [{ at: 1.5, side: "right", name: "right-aim" }],
    ...equipped("held", (T, t) => {
      if (Math.abs(t - 1) < 1e-6) T.lab.setCarry("aim");
      if (Math.abs(t - 1.6) < 1e-6) T.lab.fire(T.h);
    }),
  },
  reload: {
    times: [0.35, 0.7, 1, 1.3, 1.6, 2, 2.4, 3.1],
    ...equipped("held", (T, t) => {
      if (Math.abs(t - 0.3) < 1e-6) T.lab.kit.ammo = 12;
      if (Math.abs(t - 0.4) < 1e-6) T.lab.reload(T.h);
    }),
  },
  "hit-roll": {
    times: [0.35, 0.45, 0.55, 0.75, 1.3, 1.5, 1.7, 2],
    step(T, t, dt) {
      const h = T.h;
      if (Math.abs(t - 0.4) < 1e-6) h.stun = 0.5;
      h.stun = Math.max(0, h.stun - (t > 0.4 ? dt : 0));
      const roll = t >= 1.2 && t < 1.92;
      h.state = roll ? "roll" : "ground";
      h.t = roll ? t - 1.2 : 0;
      if (roll) {
        const k = (t - 1.2) / 0.72,
          before = Math.max(0, t - dt - 1.2) / 0.72;
        const distance = (x) => 2.756 * (2 * x - x * x);
        h.speed = ((distance(k) - distance(before)) / dt) * (k > 0 ? 1 : 0);
        h.pos.z += distance(k) - distance(before);
      } else h.speed = 0;
      T.animator.update(dt, h);
    },
  },
  swimming: {
    times: range(2, 0.12),
    body: [2.6, 0.2, 0.6],
    setup(T) {
      T.floor.visible = false;
      Object.assign(T.h, {
        state: "swim",
        swimming: true,
        swimSpeed: 0,
        swimVertical: 0,
      });
    },
    step(T, t, dt) {
      const h = T.h;
      h.swimSpeed = h.speed = Math.min(2.6, t * 2);
      h.vel.set(0, 0, h.speed);
      h.pos.z += h.speed * dt;
      T.animator.update(dt, h);
    },
  },
};
