// The nightly's checks: the command each runs and how its outputs are judged.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FLASH_LIMITS } from "./flash-rules.js";

const FLASH = { pixels: true, limits: FLASH_LIMITS, maxImages: 12 };
const PROGRAMS = { pixels: false, limits: FLASH_LIMITS, maxImages: 0 };
const readJSON = (file) => readFile(file, "utf8").then(JSON.parse, () => null);

async function judgeViews(out) {
  const result = await readJSON(join(out, "result.json"));
  if (!result) return { failures: ["no result.json"], details: null };
  return {
    failures: [
      ...result.views
        .filter((v) => !v.passed)
        .map((v) => `${v.id}: ${v.failed?.join("; ")}`),
      ...result.errors,
      ...(result.failure ? [result.failure.split("\n")[0]] : []),
    ],
    details: result,
  };
}

function judgeHitch(limit, crossings) {
  return async (out) => {
    const result = await readJSON(join(out, "result.json"));
    if (!result) return { failures: ["no result.json"], details: null };
    const failures = [];
    for (const c of result.crossings) {
      const worst = c.worst[0]?.[1] ?? 0;
      if (worst > limit)
        failures.push(
          `${c.from} to ${c.to}${c.back ? " (back)" : ""}: a ${worst} ms frame, ${c.worst.filter(([, d]) => d > limit).length} over ${limit} ms`,
        );
    }
    if (result.crossings.length !== crossings)
      failures.push(
        `${result.crossings.length} of ${crossings} crossings measured`,
      );
    failures.push(
      ...result.errors.map((e) => `page error: ${e.split("\n")[0]}`),
    );
    return {
      failures,
      details: result,
      timing: failures.length > 0 && failures.every((f) => /ms frame/.test(f)),
    };
  };
}

/** Every step in run order; `quick` marks the subset that runs with --quick. */
export function plan({ base, check, hitchMs, update, baselines }) {
  const game = `${base}/`;
  return [
    {
      id: "modules",
      title: "Every game module parses (npm run check)",
      quick: true,
      timeout: 10,
      args: () => check,
    },
    {
      id: "architecture",
      title: "World catalog, manager and background work contracts",
      quick: true,
      timeout: 5,
      args: (out) => ["scripts/architecture-check.mjs", out],
    },
    {
      id: "save",
      title: "Save compatibility",
      quick: true,
      timeout: 5,
      args: () => ["scripts/save-check.mjs"],
    },
    {
      id: "animation",
      title: "Animation contracts",
      quick: true,
      timeout: 20,
      args: (out) => ["scripts/animation-check.mjs", "--out", out],
    },
    {
      id: "views",
      title: update
        ? "Fixed camera views, baselines replaced"
        : "Fixed camera views against baselines",
      quick: true,
      browser: true,
      timeout: 20,
      args: (out) => [
        "scripts/nightly/views.mjs",
        `--url=${base}`,
        `--out=${out}`,
        `--baselines=${baselines}`,
        ...(update ? ["--update"] : []),
      ],
      judge: judgeViews,
    },
    {
      id: "hitch",
      title: `Ten door crossings, no frame over ${hitchMs} ms`,
      quick: true,
      browser: true,
      recorder: PROGRAMS,
      timeout: 15,
      confirm: true,
      args: (out) => [
        "scripts/nightly/hitch.mjs",
        `--url=${base}`,
        "--back",
        `--out=${out}`,
      ],
      judge: judgeHitch(hitchMs, 10),
    },
    {
      id: "markers",
      title: "Marker layout",
      quick: true,
      browser: true,
      timeout: 5,
      args: (out) => ["scripts/marker-check.mjs", out, `--url=${game}`],
    },
    {
      id: "sea",
      title:
        "Sea, guardian, the reunion in space and the vault's arrival, with the flash detector",
      quick: true,
      browser: true,
      recorder: FLASH,
      minFrames: 1500,
      timeout: 15,
      args: (out) => [
        "scripts/sea-check.mjs",
        out,
        `--url=${game}?nolock=1&chapter=sea&debug=1`,
      ],
    },
    {
      id: "vault",
      title:
        "The vault's six trials, the reveal and the credits, with the flash detector",
      quick: true,
      browser: true,
      recorder: FLASH,
      minFrames: 1500,
      timeout: 20,
      args: (out) => [
        "scripts/vault-check.mjs",
        out,
        `--url=${game}?nolock=1&chapter=vault&debug=1`,
      ],
    },
    {
      id: "forest",
      title: "Whole forest, sea crossing and return, with the flash detector",
      quick: true,
      browser: true,
      recorder: FLASH,
      minFrames: 1500,
      timeout: 20,
      args: (out) => [
        "scripts/forest-check.mjs",
        out,
        `--url=${game}?nolock=1&chapter=forest&debug=1`,
      ],
    },
    {
      id: "playthrough",
      title: "Levels 1 to 4 and the forest entry, with the flash detector",
      browser: true,
      recorder: FLASH,
      minFrames: 3000,
      timeout: 30,
      args: (out) => [
        "scripts/playthrough.mjs",
        out,
        `--url=${game}?nolock=1&debug=1`,
      ],
    },
    {
      id: "touch",
      title: "Touch layouts",
      browser: true,
      timeout: 15,
      args: (out) => ["scripts/touch-check.mjs", out, `--url=${game}`],
    },
    {
      id: "menu",
      title: "Menus, notes, chapters and returns",
      browser: true,
      timeout: 15,
      args: (out) => ["scripts/menu-check.mjs", out, `--url=${game}?nolock=1`],
    },
    {
      id: "relic",
      title: "Relic collection, saves and reset",
      browser: true,
      timeout: 15,
      args: (out) => ["scripts/relic-check.mjs", out, `--url=${game}`],
    },
    {
      id: "starts",
      title: "Title, every chapter start and the asset lab",
      browser: true,
      recorder: PROGRAMS,
      timeout: 15,
      args: (out) => [
        "scripts/architecture-browser-check.mjs",
        out,
        `--url=${game}`,
      ],
    },
  ];
}
