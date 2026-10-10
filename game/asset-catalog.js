export { LAB_LEVELS } from "./worlds/catalog.js";

const groups = [
  [
    "Characters",
    [
      ["hero_realistic", "Nyra Varen", "Current playable character", "refined"],
      [
        "hero_previous",
        "Previous explorer",
        "Archived character and movement",
        "original",
      ],
      [
        "hero_explorer",
        "Expedition explorer",
        "Post-submission expedition refinement",
      ],
      [
        "hero_second",
        "Second explorer",
        "Game jam submission model, archived rest pose",
      ],
      [
        "hero_first",
        "First explorer",
        "Original prototype model, archived rest pose",
      ],
      ["warden", "Checkpoint warden", "Animated guardian rig"],
    ],
  ],
  [
    "Equipment",
    [
      ["relay_orb", "Relay orb", "Traversal and puzzle tool"],
      ["twin_pistol", "Twin pistol", "Modern combat equipment"],
      ["ice_axe", "Mira’s ice axe", "Climbing tool for scarred ice"],
      ["sun_disc", "Sun disc", "Charged expedition tool"],
      ["mira_lantern", "Mira’s lantern"],
      ["mira_scarf", "Mira’s scarf"],
      ["expedition_rope", "Expedition rope"],
      ["field_radio", "Field radio"],
      ["field_scroll", "Field notes"],
    ],
  ],
  [
    "Puzzles",
    [
      ["far_gate", "Far gate"],
      ["sun_mirror", "Sun mirror"],
      ["push_block", "Push block"],
      ["crystal_emitter", "Crystal emitter"],
      ["light_pylon", "Light pylon"],
      ["shield_console", "Shield console", "Atlantis air shield controls"],
      ["glyph_stela", "Glyph stela"],
      ["glyph_banner", "Glyph banner"],
      ["stamp_plate", "Stamp plate"],
      ["ice_block", "Ice block"],
      ["ice_casing", "Ice casing"],
      [
        "vault_medallion",
        "Vault medallion",
        "A world's glyph on the sealed door",
      ],
    ],
  ],
  [
    "Architecture",
    [
      ["guardian_colossus", "Guardian colossus"],
      ["temple_facade", "Temple facade"],
      ["court_gallery", "Sunken Court gallery", "Eroded ceremonial masonry"],
      ["ruin_temple", "Ruined temple"],
      ["ruin_rings", "Ruined rings"],
      ["ruin_house", "Ruined house"],
      ["ruin_tower", "Ruined tower"],
      ["ruin_column", "Ruined column"],
      ["ruin_arch", "Ruined arch"],
      ["customs_booth", "Customs booth"],
      ["hill_castle", "Hill castle"],
      ["broken_column", "Broken column"],
      ["fallen_head", "Fallen guardian head"],
      ["vault_door", "Vault door", "The builders' sealed round door"],
      ["vault_pillar", "Vault pillar", "Stepped pillar with channels of light"],
      ["builder_mask", "Builder mask", "A watcher with a single slit"],
    ],
  ],
  [
    "Nature",
    [
      ["basalt_spire", "Basalt spire"],
      ["boulder_cluster", "Boulder cluster"],
      ["mountain_ridge", "Mountain ridge", "Eroded distant terrain"],
      ["wall_vine", "Wall vine", "Rooted climbing vegetation"],
      ["desert_agave", "Desert agave"],
      ["lumen_plant", "Lumen plant"],
      ["floating_isle", "Floating isle"],
      ["ice_spire", "Ice spire"],
      ["snow_pine", "Snow pine"],
      ["frost_cairn", "Frost cairn"],
      ["wild_tree", "Wild tree"],
      ["fern_cluster", "Fern cluster"],
      ["glow_mushroom", "Glow mushroom"],
      ["giant_tree", "Giant tree"],
      ["icicle_cluster", "Icicle cluster"],
      ["frozen_falls", "Frozen falls"],
      ["meadow_grass", "Meadow grass"],
      ["sea_kelp", "Sea kelp"],
      ["sea_coral", "Sea coral"],
    ],
  ],
  [
    "Creatures",
    [
      ["forest_bird", "Forest bird"],
      ["forest_deer", "Forest deer"],
      ["forest_boar", "Wildwood boar", "Articulated charging woodland enemy"],
      ["frost_lynx", "Frost lynx", "Articulated stalking predator of the ice"],
      ["manta_ray", "Manta ray"],
      ["reef_fish", "Reef fish"],
    ],
  ],
  [
    "Props",
    [
      ["expedition_tent", "Expedition tent"],
      ["supply_crates", "Supply crates"],
      ["clay_urns", "Clay urns"],
      ["brazier", "Brazier"],
      ["path_lantern", "Path lantern"],
      ["queue_post", "Queue post"],
      ["confiscation_bin", "Confiscation bin"],
      ["rubble_pile", "Rubble pile"],
      ["swing_gantry", "Swing gantry", "Expedition rope swing over a gap"],
    ],
  ],
];

export const ASSET_GROUPS = groups.map(([name]) => name);
export const ASSET_CATALOG = groups.flatMap(([category, entries]) =>
  entries.map(([id, name, description = "", character = null]) => ({
    id,
    name,
    category,
    description,
    character,
    path: `./assets/${id}.js`,
  })),
);
export function findAssets(query = "", category = "all") {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return ASSET_CATALOG.filter(
    (entry) =>
      (category === "all" || entry.category === category) &&
      words.every((word) =>
        `${entry.id} ${entry.name} ${entry.category} ${entry.description}`
          .toLowerCase()
          .includes(word),
      ),
  );
}

const hierarchical = new Set([
  "hero_realistic",
  "far_gate",
  "glyph_stela",
  "warden",
  "customs_booth",
  "confiscation_bin",
  "crystal_emitter",
  "lumen_plant",
  "relay_orb",
  "stamp_plate",
  "path_lantern",
  "floating_isle",
  "light_pylon",
  "ice_casing",
  "glow_mushroom",
  "mira_lantern",
  "forest_bird",
  "hill_castle",
  "forest_deer",
  "forest_boar",
  "frost_lynx",
  "giant_tree",
  "vault_door",
  "vault_medallion",
  "vault_pillar",
  "builder_mask",
]);
const aliases = { hero_explorer: "hero_realistic", sun_disc: "relay_orb" };
const byId = new Map(ASSET_CATALOG.map((asset) => [asset.id, asset]));

export function runtimeAsset(name) {
  const id = aliases[name] || name;
  const entry = byId.get(id);
  if (!entry) throw new Error(`Unknown asset: ${name}`);
  return {
    ...entry,
    path: new URL(entry.path, import.meta.url).href,
    keepHierarchy: hierarchical.has(id),
  };
}
