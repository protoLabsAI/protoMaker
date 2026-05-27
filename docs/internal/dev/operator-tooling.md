# Operator Tooling: Plugin, CLI, and Beads

How an operator drives protoMaker from outside the web UI: the `protolabs` Claude Code plugin (MCP tools + skills), the `protomaker` CLI, and `br` (beads) as the task-list surface.

## The `protolabs` Claude Code plugin

Installs the `studio` MCP server (board/agent/PR tools) + the bundled skills (`/board`, `/auto-mode`, `/cli-control`, …) into your Claude session.

```bash
# 1. Add the local marketplace (absolute path — a relative path is treated as a git remote and fails)
claude plugin marketplace add /absolute/path/to/protomaker/packages/mcp-server/plugins

# 2. Install
claude plugin install protolabs

# 3. Restart Claude — the plugin's MCP server + skills attach on session boot,
#    not into a running session.
```

**Gotcha — the plugin `.env`.** `packages/mcp-server/plugins/automaker/.env` (gitignored, per-operator) must set `AUTOMAKER_ROOT` to the **absolute path of this clone**, plus `AUTOMAKER_API_KEY` (and `GH_TOKEN`). `start-mcp.sh` resolves the MCP binary at `${AUTOMAKER_ROOT}/packages/mcp-server/dist/index.js` — a stale `AUTOMAKER_ROOT` (e.g. an old `…/dev/automaker` path) makes the server fail to start. Build the server first: `npm run build:packages`.

Verify after restart: the `studio` MCP tools enumerate, and `/cli-control` is available.

## The `protomaker` CLI

`@protolabsai/cli` (bin: `protomaker`) talks to the server's HTTP API directly — no MCP needed. Build with `npm run build:packages`; run with `node packages/cli/dist/cli.js <cmd>` (or the linked `protomaker` bin).

Config: `AUTOMAKER_API_URL` (default `http://localhost:3008`) + `AUTOMAKER_API_KEY` (env or `.env`); `x-api-key` is sent on every request.

```bash
protomaker health          # server up + version
protomaker board           # per-status board summary
protomaker sitrep          # board + agents + escalations + auto-mode
protomaker query --status in_progress
protomaker feature list    # features grouped by status
protomaker agent list      # running agents
protomaker auto-mode status
protomaker pr check <n>
```

Global flags: `--json`, `--quiet`, `--project <path>` (defaults to cwd).

> Note: command handlers are async — the CLI uses `parseAsync` so output is produced before exit (a prior sync `parse()` + `process.exit(0)` made every command silently produce nothing; fixed in #3909).

## `br` (beads) — the task-list surface

`br` is the canonical local issue tracker (see the `## Local Issue Tracker` section in `CLAUDE.md`). It's what both operators and agents use for cross-session work; the in-app TODO view is a thin wrapper over the same `.beads/` store. Dogfood it for planning:

```bash
RUST_LOG=error br ready --json                 # startable (deps satisfied), P0 first
RUST_LOG=error br create "Title" --type feature --priority 1 --labels sprint-1
RUST_LOG=error br dep add <issue> <depends-on>  # <issue> depends on <depends-on>
RUST_LOG=error br update <id> --status in_progress
RUST_LOG=error br close <id> --reason "…"
RUST_LOG=error br sync --flush-only             # keep .beads/issues.jsonl in step
```

Commit `.beads/issues.jsonl` alongside the code it tracks; `.beads/beads.db` is gitignored.
