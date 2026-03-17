# Codex CLI Integration

Use protoLabs Studio with Codex natively through `AGENTS.md`, local Codex skills, and the existing protoLabs MCP server.

This guide is for developers who want Codex-native workflows in this repo without changing the current Claude plugin implementation. After following it, Codex can operate against the existing protoLabs control plane and use a local Ava skill for orchestration.

## Prerequisites

- Node.js 22+
- Codex CLI installed and authenticated
- protoLabs server running locally
- The MCP server built from this repo

## Build the Existing MCP Server

From the repository root:

```bash
npm run build:packages
```

This produces the MCP entry point at `packages/mcp-server/dist/index.js`.

## Start protoLabs Server

Run the server in a separate terminal:

```bash
npm run dev:web
```

By default the API is available at `http://localhost:3008`.

## Add the MCP Server to Codex

Register the existing protoLabs MCP server with Codex:

```bash
codex mcp add protolabs \
  --env AUTOMAKER_ROOT=/absolute/path/to/protomaker \
  --env AUTOMAKER_API_URL=http://localhost:3008 \
  --env AUTOMAKER_API_KEY=YOUR_AUTOMAKER_API_KEY \
  --env GH_TOKEN=YOUR_GH_TOKEN \
  -- bash /absolute/path/to/protomaker/packages/mcp-server/plugins/automaker/hooks/start-mcp.sh
```

This uses the existing launcher script. No Claude plugin install is required.

## Configure Codex Via config.toml

You can also configure Codex through `~/.codex/config.toml`.

Example:

```toml
[mcp_servers.protolabs]
command = "bash"
args = ["/absolute/path/to/protomaker/packages/mcp-server/plugins/automaker/hooks/start-mcp.sh"]
env = { AUTOMAKER_ROOT = "/absolute/path/to/protomaker", AUTOMAKER_API_URL = "http://localhost:3008", AUTOMAKER_API_KEY = "YOUR_AUTOMAKER_API_KEY", GH_TOKEN = "YOUR_GH_TOKEN" }
startup_timeout_sec = 20
tool_timeout_sec = 120
enabled = true
```

A repo-local example is checked in at `.codex/config.toml.example`.

The example uses placeholder paths only. Replace `/absolute/path/to/protomaker` with your local clone path.

## Codex-Native Repo Layer

This repo now provides a Codex-native control layer:

- `AGENTS.md` at the repo root for persistent repo behavior
- `.codex/skills/ava/SKILL.md` for Ava-style orchestration

These files are additive. They do not replace or modify the current Claude plugin flow.

## Ava in Codex

The Codex-native Ava path is a local skill, not a slash command.

Use Ava when you want:

- backlog triage
- board supervision
- operational routing
- agent coordination
- multi-step orchestration across features or projects

The skill should prefer MCP tools for board and orchestration operations and only drop into direct implementation when the user explicitly wants local coding work.

## Recommended Split

Use each layer for one job:

- `AGENTS.md` for stable repo rules
- `.codex/skills/ava/SKILL.md` for Ava operating behavior
- `packages/mcp-server/` as the capability layer

Do not translate the old Claude `/ava` command into one giant Codex prompt. Split rules, workflow, and capability cleanly across these layers.

## Verification

After setup, verify these in order:

1. Codex can see the `protolabs` MCP server.
2. The protoLabs API is reachable at `http://localhost:3008/api/health`.
3. Codex is running inside this repository so it can load `AGENTS.md`.
4. The local Ava skill exists at `.codex/skills/ava/SKILL.md`.

## Troubleshooting

If Codex cannot launch the MCP server:

- verify `AUTOMAKER_ROOT` points at this repo
- verify `packages/mcp-server/dist/index.js` exists
- verify the protoLabs server is running
- verify `AUTOMAKER_API_KEY` matches the server configuration

If Codex can launch the server but tools fail:

- check the API health endpoint
- confirm the MCP env vars passed to Codex
- confirm the target project contains `.automaker/`

## Related

- [Claude Code Plugin](./claude-plugin.md)
- [Plugin Deep Dive](./plugin-deep-dive.md)
- [MCP Tools Reference](../reference/mcp-tools.md)
