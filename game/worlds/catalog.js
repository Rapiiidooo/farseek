export const WORLDS = [
  {
    id: "court",
    title: "The Sunken Court",
    place: "court",
    music: "court",
    dust: 0xd9b88a,
    load: () => import("./court/index.js"),
    starts: [
      {
        id: "court",
        start: "From the terrace",
        blurb:
          "Climb down into the ruin and bend the sunlight onto the gate's address.",
      },
      {
        id: "floor",
        start: "From the court floor",
        blurb: "Skip the descent: the mirrors and the stelae are waiting.",
      },
    ],
  },
  {
    id: "two",
    title: "The Checkpoint",
    place: "two",
    music: "world2",
    dust: 0x6a5a78,
    lockHint: "Open the first far door to reach it.",
    load: () => import("./checkpoint/index.js"),
    starts: [
      {
        id: "checkpoint",
        start: "Beyond the first door",
        blurb: "No address stamp, no passage. Get stamped, one way or another.",
      },
    ],
  },
  {
    id: "three",
    title: "The Dawn Isles",
    place: "three",
    music: "isles",
    dust: 0xe8dcc4,
    lockHint: "Open the far door beyond the checkpoint to reach it.",
    load: () => import("./isles/index.js"),
    starts: [
      {
        id: "isles",
        start: "Beyond the far door",
        blurb:
          "Follow Mira's trail across the floating isles on bridges of light.",
      },
    ],
  },
  {
    id: "four",
    title: "The Frozen Reach",
    place: "four",
    music: "frost",
    dust: 0xeaf2f8,
    lockHint: "Follow Mira through her ring on the isles to reach it.",
    load: () => import("./frost/index.js"),
    starts: [
      {
        id: "frost",
        start: "Beyond Mira's ring",
        blurb:
          "Slide the ice, push its blocks and cross the lake to the glyph it keeps.",
      },
    ],
  },
  {
    id: "five",
    title: "The Wildwood",
    place: "forest",
    music: "forest",
    dust: 0x819663,
    lockHint: "Free the frozen glyph and cross the great ring.",
    load: () => import("./forest/index.js"),
    starts: [
      {
        id: "forest",
        start: "Through the great ring",
        blurb:
          "Cross the spore groves and restore the castle's forgotten address.",
      },
    ],
  },
  {
    id: "six",
    title: "The Drowned Archive",
    place: "sea",
    music: "sea",
    dust: 0x9dc6c2,
    lockHint: "Restore the castle's address in the wildwood.",
    load: () => import("./sea/index.js"),
    starts: [
      {
        id: "sea",
        start: "Beyond the castle door",
        blurb:
          "Wake the drowned causeway and face the guardian of Mira's last message.",
      },
    ],
  },
  {
    id: "vault",
    title: "The Builders' Vault",
    place: "vault",
    music: "vault",
    dust: 0xc9a77a,
    lockHint: "Cross the last door and follow the light.",
    // Reached from the previous world's finale, never through its exit door.
    entry: "finale",
    load: () => import("./vault/index.js"),
    starts: [
      {
        id: "vault",
        start: "Beyond the last door",
        blurb:
          "Wake six medallions with what every world taught, and learn why the doors stayed open.",
      },
    ],
  },
].map((world, index) => Object.freeze({ ...world, level: index + 1 }));

export const CHAPTERS = WORLDS.flatMap((world) =>
  world.starts.map((start) =>
    Object.freeze({
      ...start,
      where: world.id,
      level: world.level,
      title: world.title,
      music: world.music,
    }),
  ),
);

export const LAB_LEVELS = WORLDS.map((world) => ({
  id: world.starts[0].id,
  name: world.title,
  number: world.level,
}));

export function chapterById(id) {
  return CHAPTERS.find((chapter) => chapter.id === id) || CHAPTERS[0];
}

export function worldById(id) {
  const world = WORLDS.find((world) => world.id === id);
  if (!world) throw new Error(`Unknown world: ${id}`);
  return world;
}
