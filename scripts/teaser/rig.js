// Page side of the teaser recorder, installed once the game has loaded with ?debug=1. At render
// time the shot's own lens replaces the follow camera, then the follow camera is put back, so
// the game's steering, aiming and swimming still read the camera they expect.
window.__teaserInstall = () => {
  const { THREE, worlds, follow, hero, app } = window.__FD__;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lib = {
    clamp,
    smooth: (k) => ((k = clamp(k)), k * k * (3 - 2 * k)),
    inOut: (k) => (
      (k = clamp(k)),
      k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
    ),
    out: (k) => 1 - Math.pow(1 - clamp(k), 3),
    in: (k) => Math.pow(clamp(k), 3),
    mix: (a, b, k) => a.map((x, i) => x + (b[i] - x) * k),
    add: (a, b) => a.map((x, i) => x + b[i]),
    sub: (a, b) => a.map((x, i) => x - b[i]),
    scale: (a, s) => a.map((x) => x * s),
    // Catmull-Rom through the points, `k` running over the whole path.
    path(points, k) {
      const n = points.length - 1;
      const u = clamp(k) * n;
      const i = Math.min(n - 1, Math.floor(u));
      const f = u - i;
      const p0 = points[Math.max(0, i - 1)],
        p1 = points[i],
        p2 = points[i + 1],
        p3 = points[Math.min(n, i + 2)];
      return p1.map((_, c) => {
        const a = p0[c],
          b = p1[c],
          d = p2[c],
          e = p3[c];
        return (
          0.5 *
          (2 * b +
            (-a + d) * f +
            (2 * a - 5 * b + 4 * d - e) * f * f +
            (-a + 3 * b - 3 * d + e) * f * f * f)
        );
      });
    },
    // Eases a remembered value toward the target, `rate` per second.
    damp(mem, key, target, rate, dt) {
      if (!mem[key]) return (mem[key] = target.slice());
      const k = 1 - Math.exp(-rate * dt);
      mem[key] = mem[key].map((x, i) => x + (target[i] - x) * k);
      return mem[key];
    },
    // A slow, smooth wander for a hand-held lens: three octaves of sines per axis.
    hand(t, amount, seed = 0) {
      const w = (a, b, c) =>
        Math.sin(t * a + seed * 1.7 + b) * 0.6 +
        Math.sin(t * a * 2.3 + seed * 3.1 + c) * 0.3 +
        Math.sin(t * a * 5.1 + seed * 0.7 + b + c) * 0.1;
      return [w(0.9, 0.3, 1.1), w(1.1, 2.1, 0.4), w(0.7, 4.2, 2.6)].map(
        (x) => x * amount,
      );
    },
    ahead: (s, d) => [Math.sin(s.yaw) * d, 0, Math.cos(s.yaw) * d],
  };
  const T = {
    fn: null,
    params: {},
    t: 0,
    dt: 1 / 60,
    mem: {},
    steer: null,
    yaw: null,
    pitch: null,
    lib,
    last: null,
  };
  const head = new THREE.Vector3(),
    hips = new THREE.Vector3(),
    forward = new THREE.Vector3();
  const subject = () => {
    const joints = app.heroModel?.userData.joints;
    if (joints?.head) joints.head.getWorldPosition(head);
    else head.set(hero.pos.x, hero.feet + 1.6, hero.pos.z);
    if (joints?.hips) joints.hips.getWorldPosition(hips);
    else hips.set(hero.pos.x, hero.feet + 0.95, hero.pos.z);
    return {
      x: hero.pos.x,
      y: hero.feet,
      z: hero.pos.z,
      p: [hero.pos.x, hero.feet, hero.pos.z],
      head: [head.x, head.y, head.z],
      hips: [hips.x, hips.y, hips.z],
      yaw: hero.yaw,
      vel: [hero.vel.x, hero.vel.y, hero.vel.z],
      state: hero.state,
    };
  };
  T.subject = subject;
  const render = worlds.render.bind(worlds);
  worlds.render = (camera, dt) => {
    if (!T.fn) return render(camera, dt);
    camera.getWorldDirection(forward);
    const game = {
      pos: camera.position.toArray(),
      look: camera.position.clone().addScaledVector(forward, 10).toArray(),
      fov: camera.fov,
    };
    const shot = T.fn(T.t, subject(), T.mem, lib, T.params, T.dt, game);
    const saved = {
      pos: camera.position.clone(),
      quat: camera.quaternion.clone(),
      fov: camera.fov,
      near: camera.near,
      visible: app.heroModel.visible,
    };
    camera.position.set(...shot.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(...shot.look);
    if (shot.roll) camera.rotateZ(shot.roll);
    camera.fov = shot.fov ?? 40;
    camera.near = shot.near ?? 0.1;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    app.heroModel.visible = shot.hero !== false;
    T.last = {
      pos: shot.pos.map((x) => +x.toFixed(3)),
      look: shot.look.map((x) => +x.toFixed(3)),
      fov: camera.fov,
    };
    try {
      return render(camera, dt);
    } finally {
      camera.position.copy(saved.pos);
      camera.quaternion.copy(saved.quat);
      camera.fov = saved.fov;
      camera.near = saved.near;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      app.heroModel.visible = saved.visible;
    }
  };
  // Before each frame: the keys move her along `T.yaw`, or toward `T.steer`.
  T.before = () => {
    if (T.steer) {
      const [x, z] = T.steer;
      T.yaw = Math.atan2(x - hero.pos.x, z - hero.pos.z);
    }
    if (T.yaw !== null) follow.yaw = T.yaw;
    if (T.pitch !== null) follow.pitch = T.pitch;
  };
  T.set = (source, params = {}) => {
    T.fn = source ? new Function(`return (${source})`)() : null;
    T.params = params;
    T.mem = {};
    T.t = 0;
  };
  window.__teaser = T;
};
