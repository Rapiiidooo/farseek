import { progress } from "./store.js";

export const CRAFT = Object.freeze({
  steady: {
    name: "Steady hands",
    effect: "Recoil settles sooner between shots.",
  },
  reload: { name: "Fast reload", effect: "Both magazines change faster." },
  trigger: { name: "Quick trigger", effect: "A shorter pause between shots." },
  grouping: {
    name: "Tight grouping",
    effect: "Near misses still find the target, and the sight narrows.",
  },
  heavy: { name: "Heavy rounds", effect: "Hits stagger animals for longer." },
});

// Each of Mira's relics teaches one habit with the pistols, two of each kind, so progress is
// derived from the relics found and needs no save of its own.
export const MIRA_CRAFT = Object.freeze({
  "transit-file": {
    kind: "reload",
    note: "In the margin she timed a magazine change against the clerk's stamp.",
  },
  page: {
    kind: "trigger",
    note: "A corner of the page counts the beat between two shots, shorter each time.",
  },
  "dawn-survey": {
    kind: "grouping",
    note: "Her survey marks how a sight settles on something that moves.",
  },
  "camp-drill": {
    kind: "steady",
    note: "Three clear marks, then breathe: her drill steadies the hands.",
  },
  scarf: {
    kind: "heavy",
    note: "Knotted into the scarf is a note on where a charging animal flinches.",
  },
  lantern: {
    kind: "reload",
    note: "A spare loop of wick holds a magazine ready at the belt.",
  },
  "winter-crossing": {
    kind: "grouping",
    note: "She practised on the anchored ice until her sights stopped drifting.",
  },
  "grove-map": {
    kind: "heavy",
    note: "Beside the boars she drew where a round turns a charge aside.",
  },
  "pressure-log": {
    kind: "steady",
    note: "Her last dry page braces both arms against the recoil.",
  },
  "tide-proof": {
    kind: "trigger",
    note: "She shot the valves in pairs, faster than the pressure could answer.",
  },
});

const NUMERAL = ["", "I", "II"];

export function pistolCraft(found = progress.relics) {
  const ranks = { steady: 0, reload: 0, trigger: 0, grouping: 0, heavy: 0 };
  for (const [id, { kind }] of Object.entries(MIRA_CRAFT))
    if (found.has(id)) ranks[kind]++;
  return {
    ranks,
    recoilRecovery: 1 + 0.35 * ranks.steady,
    reloadRate: 1 + 0.15 * ranks.reload,
    shotInterval: 0.22 * (1 - 0.12 * ranks.trigger),
    slack: 0.05 * ranks.grouping,
    sightGap: -0.8 * ranks.grouping,
    stagger: 1 + 0.5 * ranks.heavy,
    learned: Object.entries(ranks)
      .filter(([, rank]) => rank > 0)
      .map(([kind, rank]) => `${CRAFT[kind].name} ${NUMERAL[rank]}`),
  };
}

/** The relic reader's line for one of Mira's relics, or null for the others. */
export function craftLine(id) {
  const craft = MIRA_CRAFT[id];
  if (!craft) return null;
  const { name, effect } = CRAFT[craft.kind];
  return `Pistol craft: ${name}. ${craft.note} ${effect}`;
}
