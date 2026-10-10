// The Sunken Court: the first tomb. A 30 by 44 metre ruin in 2 m cells, north at -Z.
//
// Route: the explorer starts on the southern terrace (8 m) looking north at the gate, jumps
// the gap to the west platform, drops to a lower ledge, jumps the chasm to a crack in the
// standing wall, shimmies east to the next platform, climbs up, then walks down a broken
// stair of blocks into the court. There, sunlight enters from the west: push the block out
// of its way, then turn three mirrors to light the three stelae of the address.
//
// Heights: '.' 0, '_' sand pit at -3, '~' chasm at -8, '#' cliff, '1'..'9' 0.5 to 4.5 m,
// 'a'..'o' 5 to 12 m in 0.5 m steps.
export const CELL = 2;

export const MAP = [
  "###############",
  "###############",
  "#.............#",
  "#.............#",
  "#.............#",
  "#.............#",
  "#.............#",
  "#.............#",
  "#.............#",
  "#.............#",
  "#.............#",
  "#.............#",
  "#.............#",
  "#...eb852.....#",
  "#...e_____....#",
  "#oooe__.._....#",
  "#~~~~_____....#",
  "#bb~~~~.......#",
  "#gg~gggggggggg#",
  "#gg~gggggggggg#",
  "#gg~gggggggggg#",
  "###############",
];

const CHASMS = MAP.flatMap((row, j) =>
  [...row].flatMap((cell, i) =>
    cell === "~" ? [[i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL]] : [],
  ),
);

export function chasmDistance(x, z) {
  let distance = Infinity;
  for (const [x0, z0, x1, z1] of CHASMS)
    distance = Math.min(
      distance,
      Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)),
    );
  return distance;
}

export function heightOf(ch) {
  if (ch === ".") return 0;
  if (ch === "_") return -3;
  if (ch === "~") return -8;
  if (ch === "#") return 16;
  if (ch >= "1" && ch <= "9") return (ch.charCodeAt(0) - 48) * 0.5;
  if (ch >= "a" && ch <= "o") return 5 + (ch.charCodeAt(0) - 97) * 0.5;
  throw new Error("unknown cell " + ch);
}

// Extra boxes that a height map cannot express: the crack in the standing wall (a lip with
// an overhang above it, so it can be hung from but not stood on) and the platform face that
// continues it. Each is [minX, minY, minZ, maxX, maxY, maxZ, kind, look, flags].
//
// The way down from the terrace has to be taken: the chasm runs on under the terrace's west
// end, so the ledge below the west platform leads nowhere but across to the crack; a broken
// parapet along that end of the terrace, too high to jump and nothing to hold, stops a jump
// straight across to the platform; and the overhang reaches a metre over the platform's lip,
// so a jump from the corner of the west platform meets rock, and the climb out is past it.
export const EXTRA = [
  // Rock shoulders that set the carved facade into the cliff.
  [2, -10, 4, 7, 15.5, 6.6, "rock"],
  [23, -10, 4, 28, 14.5, 6.6, "rock"],
  [2, -10, 32, 8, 7.0, 32.35, "rock"],
  [2, 7.6, 32, 9.1, 12, 32.7, "rock"],
  [8, 8, 36, 14, 9.7, 36.8, "rock", "masonry", { grab: false, stand: false }],
  [8, -10, 32, 10, 7.0, 32.35, "rock", "masonry"],
];

// Back from the terrace's edge, west of the camp, facing the court: the first steps have room.
export const START = { x: 19.4, z: 39, yaw: Math.PI };
// The foot of the broken stair, for the Levels menu's second start.
export const FLOOR = { x: 19.6, z: 27.2, yaw: -2.4 };

export const LIGHT = {
  // The sun catcher sits against the west cliff and throws the beam east at 1.3 m.
  source: { x: 3, z: 21, dir: [1, 0] },
  height: 1.3,
};

export const MIRRORS = [
  { id: "m1", x: 9, z: 21, yaw: -Math.PI / 4 },
  { id: "m2", x: 21, z: 25, yaw: Math.PI / 2 },
  { id: "m3", x: 17, z: 31, yaw: Math.PI * 0.75 },
];

// The address: three stelae before the gate, each feeding one medallion.
export const STELAE = [
  { id: "left", x: 9, z: 17, yaw: 0, glyph: "twin" },
  { id: "top", x: 15, z: 17, yaw: 0, glyph: "spiral" },
  { id: "right", x: 21, z: 17, yaw: 0, glyph: "peak" },
];

export const MEMORIES = [
  {
    id: "memory",
    x: 23.6,
    z: 31.6,
    yaw: Math.atan2(-6.6, -0.6),
    glyph: "star",
    memory: true,
    relic: "sun-memory",
  },
];

export const BLOCKS = [{ id: "b1", x: 5, z: 21 }];

// The previous expedition's field notes: the map rolled up in their open crate on the
// terrace (the supply_crates asset turned 0.35 rad at its PROPS spot).
export const NOTES = { x: 22.08, y: 8.9, z: 40.5 };

// The previous expedition's ropes, left where it climbed: each marks a lip the explorer can
// hang from. [x, lip height, z of the face, yaw]; yaw 0 hangs down a face turned to +Z.
export const ROPES = [
  [4.1, 8, 36, Math.PI],
  [5.2, 7, 32.35, 0],
  [9.6, 7, 32.35, 0],
];

export const GATE = { x: 15, z: 11, yaw: 0 };
export const FACADE = { x: 15, z: 4, yaw: 0 };
// Each guardian sits a centimetre low: its bottom step reaches 17 cm onto the gate's dais at
// the dais's own 0.5 m, and two tops at one height fight for depth.
export const COLOSSI = [
  { x: 5, y: -0.01, z: 10.5, yaw: 0 },
  { x: 25, y: -0.01, z: 10.5, yaw: 0 },
];

export const COLUMNS = [
  [3.2, 27.5, 0.4],
  [26.5, 21, 1.2],
  [25.8, 30.5, 2.1],
];

export const BRAZIERS = [
  [11.2, 14.6],
  [18.8, 14.6],
];

// Set dressing: [asset, x, y, z, yaw]. The camp on the terrace belongs to the expedition
// that came before.
export const PROPS = [
  ["fallen_head", 24.3, 0, 34.9, -0.45],
  ["boulder_cluster", 26.3, 0, 26.2, 0.8],
  ["boulder_cluster", 3.6, 0, 16.9, 2.2],
  ["desert_agave", 27.0, 0, 22.6, 0.3],
  ["desert_agave", 15.3, 0, 35.2, 1.1],
  ["desert_agave", 19.3, 0, 35.5, 2.4],
  ["desert_agave", 2.9, 0, 24.8, 0.7],
  ["desert_agave", 27.1, 8, 38.6, 1.9],
  ["glyph_banner", 9.4, 8, 41.1, 0.4],
  ["glyph_banner", 27.3, 8, 41.1, -0.3],
  ["expedition_tent", 24.6, 8, 40.3, 2.95],
  ["supply_crates", 21.6, 8, 40.9, 0.35],
  ["clay_urns", 26.6, 0, 17.6, 0.2],
  ["clay_urns", 12.9, 8, 41.0, 2.6],
  // Fallen masonry against the walls and on the terrace's far end, clear of the beams.
  ["rubble_pile", 27.3, 0, 23.6, 0.4],
  ["rubble_pile", 2.7, 0, 24.6, 2.2],
  ["rubble_pile", 26.4, 8, 36.9, 1.1],
  ["desert_agave", 27.4, 0, 12.5, 0.9],
  ["desert_agave", 2.6, 0, 31.2, 2.8],
];

// Colliders fitted to each prop's mesh: circles [x, z, radius, top] in the asset's own frame,
// read off a 5 cm top-down height map of its triangles, and turned with the prop. Round
// colliders cannot be stood on or hung from, so a jump onto a rock slides off it.
// `small` props (plants, urns) do not push the camera.
export const PROP_SHAPES = {
  fallen_head: [
    [0.03, 0.08, 1.44, 2.5],
    [-1.13, 0.23, 1.2, 2.58],
    [1.48, 0.08, 0.75, 2.0],
  ],
  boulder_cluster: [
    [-0.53, -0.48, 0.89, 2.26],
    [0.98, -0.03, 0.62, 1.63],
    [0.08, 0.63, 0.45, 2.05],
  ],
  clay_urns: [
    [-0.28, -0.28, 0.3, 1.01],
    [0.33, -0.28, 0.25, 0.76],
    [0.02, 0.22, 0.2, 0.5],
  ],
  broken_column: [
    [-0.43, -0.03, 0.65, 3.4],
    [0.63, 0.08, 0.35, 0.59],
    [0.38, -0.28, 0.25, 0.62],
  ],
  expedition_tent: [
    [0.03, 0.38, 0.68, 1.56],
    [0.03, -0.43, 0.65, 1.56],
    [-0.48, -0.93, 0.25, 0.6],
  ],
  supply_crates: [
    [0.38, -0.13, 0.4, 1.26],
    [-0.33, -0.28, 0.32, 1.3],
    [-0.53, 0.43, 0.25, 0.56],
    [-0.63, -0.23, 0.3, 1.3],
  ],
  desert_agave: [[0, 0, 0.32, 0.9]],
  glyph_banner: [[0.03, -0.03, 0.34, 3.6]],
  rubble_pile: [
    [0.35, 0, 0.8, 0.9],
    [-0.65, 0.1, 0.55, 0.6],
  ],
};
export const SMALL_PROPS = new Set(["desert_agave", "clay_urns"]);

// The seated colossus measured the same way, as stacked boxes in its own frame
// [minX, minZ, maxX, maxZ, top]: a 0.5 m step, a 1 m plinth the explorer can climb, the
// throne and body, the shins, and feet low enough to step onto.
export const COLOSSUS_BOXES = [
  [-4.2, -4.83, 4.2, 4.83, 0.5],
  [-3.95, -4.43, 3.95, 4.07, 1.0],
  [-3.45, -4.43, 3.45, 1.07, 14],
  [-1.75, 1.07, 1.75, 3.07, 6.2],
  [-1.75, 3.07, 1.75, 3.57, 1.45],
];
