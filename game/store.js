// Settings and progress kept in this browser. Storage can be missing or blocked (a private
// window, a sandboxed preview), so every read and write falls back to defaults silently.

import { LAB_SESSION } from "./local-preview.js";
import { CHAPTERS } from "./worlds/catalog.js";
export { CHAPTERS } from "./worlds/catalog.js";

const SETTINGS_KEY = "far-door-settings";
const PROGRESS_KEY = "far-door-progress";

// A phone starts one step down in quality: its small screen gains little from the pixels.
const phone =
  matchMedia("(pointer: coarse)").matches &&
  Math.min(screen.width, screen.height) <= 500;

// `bindings`, when present, holds only the keys and buttons the player changed (input.js).
const DEFAULT_SETTINGS = {
  sensitivity: 1,
  invertY: false,
  volume: 0.8,
  music: 0.7,
  ambience: 0.8,
  effects: 0.9,
  voice: 0.9,
  quality: phone ? "balanced" : "high",
  markers: true,
  hints: true,
  shake: true,
  invertX: false,
  fov: 58,
  recenter: true,
  aimMode: "hold",
  reduceMotion: false,
  subtitleSize: "medium",
  subtitleBacking: "none",
  contrast: false,
  difficulty: "standard",
};

// A value of the wrong kind (an old build, a hand edit) falls back to its default.
const CHOICES = {
  aimMode: ["hold", "toggle"],
  subtitleSize: ["small", "medium", "large"],
  subtitleBacking: ["none", "soft", "solid"],
};
function sanitize(saved) {
  const clean = {};
  for (const [key, value] of Object.entries(saved)) {
    const fallback = DEFAULT_SETTINGS[key];
    if (key === "bindings") {
      if (value && typeof value === "object") clean.bindings = value;
    } else if (fallback === undefined) clean[key] = value;
    else if (CHOICES[key]) {
      if (CHOICES[key].includes(value)) clean[key] = value;
    } else if (typeof value === typeof fallback) clean[key] = value;
  }
  if (typeof clean.fov === "number")
    clean.fov = Math.min(90, Math.max(50, clean.fov));
  return clean;
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch {
    return {};
  }
}

function write(key, value) {
  if (LAB_SESSION && key === PROGRESS_KEY) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not persisted */
  }
}

export const settings = {
  ...DEFAULT_SETTINGS,
  ...sanitize(read(SETTINGS_KEY)),
};

export function saveSettings() {
  write(SETTINGS_KEY, settings);
}

// Puts one setting back to its default, as the reset in the Controls screen does.
export function resetSetting(key) {
  if (key in DEFAULT_SETTINGS) settings[key] = DEFAULT_SETTINGS[key];
  else delete settings[key];
  saveSettings();
}

const saved = LAB_SESSION ? {} : read(PROGRESS_KEY);
// Campaign 6 and later count the drowned archive's finale as the expanded campaign's end.
const expanded = saved.campaign >= 6;
const legacyFinished = !!saved.completed && !expanded;
export const progress = {
  reached: new Set(Array.isArray(saved.reached) ? saved.reached : []),
  last: legacyFinished
    ? "forest"
    : typeof saved.last === "string"
      ? saved.last
      : null,
  finished: !!saved.completed && expanded,
  // The campaign a recorded finish belongs to: 6 ended at the drowned archive, 7 in the vault.
  campaign: saved.campaign >= 7 ? 7 : 6,
  pistols:
    typeof saved.pistols === "boolean"
      ? saved.pistols
      : !!saved.last || !!saved.completed,
  // Relics found, kept across new games like any achievement.
  relics: new Set(Array.isArray(saved.relics) ? saved.relics : []),
};
progress.reached.add("court");
if (LAB_SESSION)
  for (const chapter of CHAPTERS) progress.reached.add(chapter.id);
if (saved.completed) progress.reached.add("forest");
// A finished six-world campaign opens the vault beyond the last door.
if (progress.finished) progress.reached.add("vault");

function saveProgress() {
  write(PROGRESS_KEY, {
    reached: [...progress.reached],
    last: progress.last,
    completed: progress.finished,
    campaign: progress.campaign,
    pistols: progress.pistols,
    relics: [...progress.relics],
  });
}

export function findRelic(id) {
  const fresh = !progress.relics.has(id);
  progress.relics.add(id);
  saveProgress();
  return fresh;
}

export function reach(id) {
  const fresh = !progress.reached.has(id);
  progress.reached.add(id);
  progress.last = id;
  saveProgress();
  return fresh;
}

export function finish() {
  progress.finished = true;
  progress.campaign = 7;
  progress.reached.add("vault");
  saveProgress();
}

export function setPistols(unlocked) {
  progress.pistols = !!unlocked;
  saveProgress();
}

export function resetProgress() {
  progress.reached = new Set(["court"]);
  progress.last = null;
  progress.finished = false;
  progress.campaign = 6;
  progress.pistols = false;
  progress.relics = new Set();
  saveProgress();
}
