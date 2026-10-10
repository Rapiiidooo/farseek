// The teaser's timeline, shared by the type, the score and the edit: 120 beats a minute, the
// drop on `DROP`, every cut and caption on the beat grid after it.
export const FPS = 60;
export const BEAT = 0.5;
export const DROP = 4.6;
export const at = (beats) => +(DROP + beats * BEAT).toFixed(4);
export const END = at(54);

export const TITLES = [
  {
    id: "swing",
    kind: "caption",
    kicker: "Rope swings",
    line: "Swing",
    at: at(0),
    seconds: 2.4,
  },
  {
    id: "climb",
    kind: "caption",
    kicker: "Ice axes and ivy",
    line: "Climb",
    at: at(6),
    seconds: 2.4,
  },
  {
    id: "dive",
    kind: "caption",
    kicker: "Sea currents",
    line: "Dive",
    at: at(11),
    seconds: 1.5,
  },
  {
    id: "fight",
    kind: "caption",
    kicker: "Shield, tether, twin pistols",
    line: "Fight",
    at: at(17),
    seconds: 2.4,
  },
  {
    id: "worlds",
    kind: "center",
    kicker: "New light, sound and voice",
    line: "Seven worlds",
    at: at(26),
    seconds: 2.0,
  },
  {
    id: "vault",
    kind: "caption",
    kicker: "Level 7",
    line: "The Builders’ Vault",
    at: at(36),
    seconds: 2.6,
  },
  {
    id: "card",
    kind: "card",
    kicker: "An expedition through seven worlds",
    tagline: "Every door hides an address.",
    play: "Play free in your browser",
    url: "farseek.rapidoai.dev",
    at: at(46),
    seconds: +(END - at(46)).toFixed(4),
  },
];

// Mira's lines: [t, "voice", clip, mode].
export const SOUND = [
  [0.3, "voice", "radio-1", "radio"],
  [at(33) + 0.35, "voice", "vault-reveal-next", "hall"],
  [at(46) + 0.8, "voice", "reunion-4", "live"],
];

// The cut: each entry starts at `at` and runs to the next; `take` names a recorded file in
// the output folder and `from` the second of that take where the cut begins.
export const CUTS = [
  { at: 0, take: "portrait", from: 0.4 },
  { at: 1.9, take: "reunion", from: 0.6 },
  { at: at(0), take: "swing-catch", from: 0.55 },
  { at: at(2), take: "swing-ride", from: 1.4 },
  { at: at(6), take: "climb-chips-side", from: 1.25 },
  {
    at: at(8),
    take: "ivy",
    from: 2.2,
    eq: "gamma=1.22:brightness=0.02:saturation=1.1",
  },
  { at: at(11), take: "current", from: 0.4 },
  { at: at(14), take: "isles-wide", from: 0.5 },
  { at: at(16), take: "lynx-pounce", from: 2.55 },
  { at: at(22), take: "lynx-tether", from: 0.85 },
  { at: at(24), take: "lynx-pistols", from: 0.3 },
  { at: at(26), take: "court-haze", from: 1.0 },
  { at: at(27), take: "isles-rim", from: 1.0 },
  { at: at(28), take: "climb-chips-side", from: 3.55 },
  { at: at(29), take: "forest-shafts", from: 1.0 },
  { at: at(30), take: "sea-caustics", from: 1.0 },
  { at: at(31), take: "sea-city", from: 1.0 },
  { at: at(32), take: "black", from: 0 },
  { at: at(33), take: "reunion", from: 8.8 },
  { at: at(36), take: "reveal-medallions", from: 7.5 },
  { at: at(39), take: "reveal-reveal", from: 1.4 },
  { at: at(42), take: "reveal-reveal", from: 23.4 },
  { at: at(44), take: "reveal-walk", from: 1.2 },
  { at: at(46), take: "black", from: 0 },
];

// White flashes over the big hits: [at, seconds, strength].
export const FLASHES = [
  [at(0), 0.22, 0.85],
  [at(16), 0.12, 0.35],
  [at(33), 0.2, 0.6],
  [at(46) - 0.1, 0.35, 1],
];

// The game's effects under the cut, each levelled first: [t, name, dB, arg] through its Sound
// class, [t, "file", wav, dB, pan] from its recordings, [t, "whoosh", level] for a cut's air.
export const EFFECTS = [
  [at(0) + 0.42, "jump", -6],
  [at(0) + 0.9, "swing", 0],
  [at(2) + 0.35, "rope", -4],
  [at(2) + 1.2, "swing", -1],
  [at(2) + 1.75, "land", -4],
  [at(6) + 0.15, "axe", -2],
  [at(6) + 0.57, "axe", -3],
  [at(6) + 0.98, "axe", -2],
  [at(8) + 0.2, "vine", -5],
  [at(8) + 0.7, "vine", -5],
  [at(8) + 1.2, "vine", -6],
  [at(11) + 0.05, "current", 0],
  [at(16) + 0.02, "predator", -3],
  [at(16) + 0.25, "pounce", 0],
  [at(16) + 0.29, "shield", 1],
  [at(16) + 2.35, "clink", -2],
  [at(16) + 2.37, "thud", -2],
  [at(22) + 0.02, "tether", 1],
  [at(24) + 0.1, "file", "pistol-shot.wav", -3, -0.3],
  [at(24) + 0.32, "file", "pistol-shot.wav", -4, 0.3],
  [at(24) + 0.54, "file", "pistol-shot.wav", -3, -0.3],
  [at(24) + 0.76, "file", "pistol-shot.wav", -4, 0.3],
  [at(26), "whoosh", 0.8],
  [at(28), "whoosh", 0.6],
  [at(30), "whoosh", 0.7],
  [at(36) + 0.2, "medallion", -5],
  [at(36) + 0.7, "medallion", -6],
  [at(36) + 1.2, "chime", -6, 5],
  [at(39), "rumble", -4],
  [at(42) + 0.1, "ignite", -1],
];
