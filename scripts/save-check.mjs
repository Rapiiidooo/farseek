import assert from "node:assert/strict";

const data = new Map();
globalThis.matchMedia = () => ({ matches: false });
globalThis.screen = { width: 1280, height: 720 };
globalThis.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
};
const load = (id) => import(`../game/store.js?case=${id}`);
data.set(
  "far-door-progress",
  JSON.stringify({
    reached: ["court", "floor", "checkpoint", "isles", "frost"],
    last: "frost",
    completed: true,
    relics: ["radio"],
  }),
);
const legacy = await load("legacy");
assert.equal(legacy.CHAPTERS.at(-1).id, "vault");
assert.equal(legacy.CHAPTERS.at(-1).level, 7);
assert.equal(legacy.progress.finished, false);
assert.equal(legacy.progress.last, "forest");
assert(legacy.progress.reached.has("forest"));
assert(!legacy.progress.reached.has("sea"));
assert(!legacy.progress.reached.has("vault"));
assert(legacy.progress.relics.has("radio"));
legacy.reach("sea");
legacy.finish();
assert(legacy.progress.reached.has("vault"));
const current = await load("current");
assert.equal(current.progress.finished, true);
// A finish now happens in the vault, and the save says so.
assert.equal(current.progress.campaign, 7);
assert.equal(current.progress.last, "sea");
assert(current.progress.reached.has("vault"));
assert(current.progress.relics.has("radio"));
// A six-world save from before the vault: still completed, and the vault opens from it.
data.set(
  "far-door-progress",
  JSON.stringify({
    reached: [
      "court",
      "floor",
      "checkpoint",
      "isles",
      "frost",
      "forest",
      "sea",
    ],
    last: "sea",
    completed: true,
    campaign: 6,
    pistols: true,
    relics: [],
  }),
);
const six = await load("six");
assert.equal(six.progress.finished, true);
assert.equal(six.progress.campaign, 6);
assert.equal(six.progress.last, "sea");
assert(six.progress.reached.has("vault"));
// A later campaign number still reads as the expanded campaign, never as the four-level one.
data.set(
  "far-door-progress",
  JSON.stringify({
    reached: ["court", "vault"],
    last: "vault",
    completed: true,
    campaign: 7,
  }),
);
const later = await load("later");
assert.equal(later.progress.finished, true);
assert.equal(later.progress.last, "vault");
current.reach("forest");
assert.equal(JSON.parse(data.get("far-door-progress")).last, "forest");
assert.equal(JSON.parse(data.get("far-door-progress")).campaign, 7);
current.resetProgress();
const reset = await load("reset");
assert.deepEqual([...reset.progress.reached], ["court"]);
assert.equal(reset.progress.finished, false);
assert.equal(reset.progress.campaign, 6);
assert.equal(reset.progress.last, null);
assert.equal(reset.progress.relics.size, 0);
data.set("far-door-progress", "{");
const corrupt = await load("corrupt");
assert.deepEqual([...corrupt.progress.reached], ["court"]);
globalThis.localStorage.getItem = () => {
  throw new Error("Storage blocked");
};
globalThis.localStorage.setItem = () => {
  throw new Error("Storage blocked");
};
const blocked = await load("blocked");
blocked.reach("sea");
blocked.finish();
assert.equal(blocked.progress.finished, true);
// Settings saved by earlier builds load unchanged; options added later take their defaults,
// and a value of the wrong kind falls back to its default.
const settingsData = new Map();
globalThis.localStorage = {
  getItem: (key) => settingsData.get(key) ?? null,
  setItem: (key, value) => settingsData.set(key, value),
};
const legacySettings = {
  sensitivity: 1.4,
  invertY: true,
  volume: 0.5,
  music: 0.3,
  effects: 0.7,
  quality: "fast",
  markers: false,
  hints: true,
  shake: false,
};
settingsData.set("far-door-settings", JSON.stringify(legacySettings));
const oldSettings = await load("old-settings");
for (const [key, value] of Object.entries(legacySettings))
  assert.equal(oldSettings.settings[key], value, key);
assert.equal(oldSettings.settings.invertX, false);
assert.equal(oldSettings.settings.fov, 58);
assert.equal(oldSettings.settings.recenter, true);
assert.equal(oldSettings.settings.aimMode, "hold");
assert.equal(oldSettings.settings.reduceMotion, false);
assert.equal(oldSettings.settings.subtitleSize, "medium");
assert.equal(oldSettings.settings.subtitleBacking, "none");
assert.equal(oldSettings.settings.contrast, false);
assert.equal(oldSettings.settings.bindings, undefined);
settingsData.set(
  "far-door-settings",
  JSON.stringify({
    ...legacySettings,
    subtitleSize: "huge",
    fov: 140,
    aimMode: "toggle",
    bindings: { keys: { jump: ["KeyJ"] }, pad: { roll: 2 } },
  }),
);
const newSettings = await load("new-settings");
assert.equal(newSettings.settings.subtitleSize, "medium");
assert.equal(newSettings.settings.fov, 90);
assert.equal(newSettings.settings.aimMode, "toggle");
assert.deepEqual(newSettings.settings.bindings, {
  keys: { jump: ["KeyJ"] },
  pad: { roll: 2 },
});
newSettings.saveSettings();
assert.deepEqual(
  JSON.parse(settingsData.get("far-door-settings")).bindings.keys.jump,
  ["KeyJ"],
);
console.log(
  "PASS legacy migration, six-level completion, vault access, return checkpoint, relic retention, reset, blocked storage, old settings and new options",
);
