export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const GAIT = {
  track: 0.073,
  roll: 0.05,
  sway: 0.014,
  yaw: 0.12,
  stride: 3.4,
  contact: 0.225,
  arm: 0.52,
  elbow: 1.1,
};

// Smooth gradient noise in [-1, 1]: deterministic, so a pose never jitters frame to frame.
export function noise(x, seed = 0) {
  const i = Math.floor(x),
    f = x - i;
  const a = gradient(i, seed) * f,
    b = gradient(i + 1, seed) * (f - 1);
  return (a + (b - a) * f * f * f * (f * (f * 6 - 15) + 10)) * 2;
}

function gradient(i, seed) {
  let h = Math.imul(i ^ Math.imul(seed + 1, 0x27d4eb2d), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x297a2d39);
  return ((h ^ (h >>> 13)) & 0xffff) / 0x8000 - 1;
}

export function set(pose, name, x = 0, y = 0, z = 0) {
  pose[name] = [x, y, z];
}

export function add(pose, name, x = 0, y = 0, z = 0) {
  const p = pose[name] || (pose[name] = [0, 0, 0]);
  p[0] += x;
  p[1] += y;
  p[2] += z;
}
