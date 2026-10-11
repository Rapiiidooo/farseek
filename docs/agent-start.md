# Start an agent in Farseek

Run from this repository's root:

```sh
codex
```

Or select it explicitly from another directory:

```sh
codex --cd /path/to/farseek
```

In the app, attach `farseek/` as the project's primary folder and start a new chat there. The primary folder controls the initial working directory and project instruction discovery. See [OpenAI's project guide](https://learn.chatgpt.com/docs/projects).

New sessions read `AGENTS.md` from this Git root; the startup guide does not require the parent workspace overview. An existing conversation still contains its earlier context, so start a fresh conversation for the smaller scope. See [OpenAI's instruction discovery guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

Read [the handoff](resume.md#current-state) and the matching open task. [Implementation history](history.md) is available for investigating earlier decisions. The recipe at `../404-game-recipe/` supplies the asset workflow and `npm run check`; other games supply no development dependencies.

## Atlas when needed

Inspect the configured Atlas transport:

```sh
codex mcp get atlas
```

The local `.codex/config.toml` uses `http_headers_helper` with `scripts/atlas-headers.zsh`. With the owner's authorization to load the shared environment, that helper sources `../.env` with tracing and output disabled, then supplies `ATLAS_API_KEY` as an authorization header to Codex. The client can authenticate even when its launch environment lacks the key. Credentials remain outside the repository; agents must not inspect or duplicate the secret file or display the helper's output. See [OpenAI's MCP configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Use `/mcp` to inspect active servers and Atlas `whoami` before an asset request. Existing clients reload configuration through MCP Restart or `config/mcpServer/reload`; see [OpenAI's MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and [app-server protocol](https://learn.chatgpt.com/docs/app-server). If Atlas is absent, check that the project configuration is trusted; see [OpenAI's configuration guide](https://learn.chatgpt.com/docs/config-file/config-basic). If the helper reports a missing key, the owner updates `ATLAS_API_KEY` in the shared environment before restarting Atlas. MCP shows neither the workspace's plan nor its credits; Studio does (`app.atlas.design`, the credits pill or Settings, Workspace, Plan & credits). With no usable credits, `prompt_project_agent` refuses a large budget with `ACCESS_EXPIRED` (HTTP 402) and stops a small one after a few credits.

## Local development

```sh
npm start
npm run check
npm run format:check -- AGENTS.md docs/agent-start.md docs/resume.md docs/history.md
```

Run the server in its own terminal, or reuse the existing instance for this checkout. Preview at `http://localhost:3002/`; inspect assets at `http://localhost:3002/labs`. Node 24 or newer is required. If dependencies are missing, install this repository's lockfile with `npm ci --ignore-scripts`.
