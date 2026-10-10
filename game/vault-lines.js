import { t } from "./i18n.js";

// What is said in the vault, by beat. The vault calls `onBeat(id)` at each of these moments.
// Mira's lines are spoken live from her light (clip `vault-<id>` with ":" as "-"); lines without
// a speaker are Nyra's own thoughts, shown as subtitles only.
export const VAULT_BEATS = {
  arrival: {
    speaker: t("Mira"),
    text: t(
      "Their air holds in here, Nyra. You can walk. I'm only light for now, so follow me.",
    ),
    seconds: 5.5,
  },
  door: {
    speaker: null,
    text: t(
      "A sealed door with six medallions. One for every world we crossed.",
    ),
    seconds: 4.5,
  },
  "bay:court": {
    speaker: t("Mira"),
    text: t(
      "Starlight through a slit, like the sun in the court. The mirrors still turn.",
    ),
    seconds: 6.3,
  },
  "bay:checkpoint": {
    speaker: t("Mira"),
    text: t(
      "A keeper of the builders, older than the clerks. Turn its stamp aside with your shield.",
    ),
    seconds: 6.0,
  },
  "bay:isles": {
    speaker: t("Mira"),
    text: t(
      "The pylon's lens is held shut. Something up on that shelf is doing it.",
    ),
    seconds: 5.6,
  },
  "bay:frost": {
    speaker: t("Mira"),
    text: t(
      "Ice and a plate again. You can't push it from there, but the orb's tether can drag it.",
    ),
    seconds: 6.5,
  },
  "power:frost": {
    speaker: t("Mira"),
    text: t("That woke the seal. Up the ice now. You still have my axes."),
    seconds: 4.8,
  },
  "bay:forest": {
    speaker: t("Mira"),
    text: t("Spore water. Don't stand still on those stones."),
    seconds: 3.9,
  },
  "bank:forest": {
    speaker: t("Mira"),
    text: t("That ivy will hold you. Up you go."),
    seconds: 3.4,
  },
  "bay:sea": {
    speaker: t("Mira"),
    text: t(
      "The seal is at the end of that passage, and the water pours out of it. One breath, Nyra.",
    ),
    seconds: 6.9,
  },
  "done:court": {
    speaker: t("Mira"),
    text: t("One. The first door's lesson."),
    seconds: 3.1,
  },
  "done:checkpoint": {
    speaker: t("Mira"),
    text: t("Two. It bowed to you. I think that was approval."),
    seconds: 4.6,
  },
  "done:isles": {
    speaker: t("Mira"),
    text: t(
      "Three. The seal drank the bridge's light. Swing back on the builders' cable.",
    ),
    seconds: 6.0,
  },
  "done:frost": {
    speaker: t("Mira"),
    text: t("Four. Nice climb."),
    seconds: 2.6,
  },
  "done:forest": { speaker: t("Mira"), text: t("Five. One more."), seconds: 3 },
  "done:sea": {
    speaker: t("Mira"),
    text: t("Six. That's the whole address. Come back to the door."),
    seconds: 4.6,
  },
  "reveal:address": {
    speaker: t("Mira"),
    text: t("Six worlds, one address. It knows us."),
    seconds: 3.9,
  },
  "reveal:masks": {
    speaker: null,
    text: t("Masks without faces. Only the slit where the light went through."),
    seconds: 4.5,
  },
  "reveal:fate": {
    speaker: t("Mira"),
    text: t(
      "They never died out, Nyra. When their worlds failed, they let their bodies go and became light.",
    ),
    seconds: 7.2,
  },
  "reveal:doors": {
    speaker: t("Mira"),
    text: t(
      "Every door we opened was kept awake by one of them, for whoever came after.",
    ),
    seconds: 5.5,
  },
  "reveal:us": {
    speaker: null,
    text: t(
      "That is what happened to us at the last door. Their way of crossing.",
    ),
    seconds: 4.5,
  },
  "reveal:next": {
    speaker: t("Mira"),
    text: t("And one address they never reached. They left it open for us."),
    seconds: 5.2,
  },
  crossing: { speaker: t("Mira"), text: t("Together, this time."), seconds: 3 },
};

// The clip a beat's line is spoken from, when Mira says it.
export function beatClip(id) {
  return VAULT_BEATS[id]?.speaker ? `vault-${id.replace(":", "-")}` : null;
}

export function beatLine(id) {
  const beat = VAULT_BEATS[id];
  if (!beat) return null;
  return {
    ...beat,
    clip: beatClip(id),
    line: beat.speaker ? `${beat.speaker}: ${beat.text}` : beat.text,
  };
}
