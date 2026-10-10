# Farseek

This repository is the working root for Farseek agents. Talk to the owner in French; keep game copy, code documentation and repository artifacts in English.

## Session entry

Read [the current handoff](docs/resume.md#current-state), then the task in `tasks/` that matches the requested work. Read the relevant [technical lessons](docs/resume.md#traps-met-on-the-way) and complete affected files before editing. Inspect the branch and working tree; local work may belong to another session.

Keep searches and changes inside this repository. Do not load `../WORKSPACE.md`, sibling games or implementation history by default. Use [agent setup](docs/agent-start.md) for launch or Atlas problems, [the style lock](docs/style-lock.md) for visual work, and [deployment](docs/deployment.md) for release work.

## Development

- Run commands from this root. Use this repository's pinned dependencies and formatter.
- Keep `far-door-` save keys compatible, preserve the original character and world designs, and keep runtime independent of asset services.
- Before creating 3D assets, read `../404-game-recipe/GAME.md` and its referenced asset workflow. The recipe is a shared tooling dependency; enter it only for that workflow or its harness. Preserve prompts, provenance, candidate choices and test receipts.
- Preserve the copied recipe harness modules `game/assetlib.js`, `game/surfaces.js` and `game/rig.js`; do not reformat them.
- Run at most six agents or browser test sessions at once on the owner's machine; pause extra agents rather than stopping them.
- Record unfinished work in `tasks/` and update `docs/resume.md` after meaningful milestones. Historical receipts establish the tested revision, not the current working tree or public release.
- The known intermittent startup exception is tracked in [startup-box-error](tasks/startup-box-error.md). Repeated passes alone do not establish a fix.
- Push, deployment and contest submission each require the owner's authorization for that action. Use the private operational handoff referenced by the deployment guide when delivery is requested.

## Verification

`npm start` serves the game at `http://localhost:3002/` and the asset lab at `/labs`. Reuse an existing server when it serves this checkout.

Run `npm run check` for game changes, the focused checks and browser review relevant to the behavior, and `npm run format:check -- <changed-files>` for supported edited files. Format Markdown with `npm run format -- <changed-markdown-files>`. Keep test evidence in `receipts/`; a viewport simulation is not a physical device test.

Atlas is declared in `.codex/config.toml`; `scripts/atlas-headers.zsh` loads `ATLAS_API_KEY` from the shared environment for authentication. Never inspect, copy or print secret files; use the authorized header loader described in the setup guide.
