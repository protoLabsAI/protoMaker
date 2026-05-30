---
name: cli-control
description: Manage the protoMaker board and crew entirely through the `protomaker` CLI (no MCP). Use when MCP is unavailable, in scripts/CI, or when you want deterministic shell control over features, agents, auto-mode, and PRs.
category: engineering
argument-hint: (what you want to do — e.g. "show the board", "create and dispatch a feature", "start the crew")
allowed-tools:
  - Bash
  - Read
---

# protoMaker CLI control

Drive the entire board + crew over the `protomaker` CLI — no MCP server required. Every command hits the running server's API. This is the deterministic, scriptable path: use it in CI, when MCP isn't connected, or when you want exact shell control.

## Invocation & global flags

The binary is `protomaker` (from `@protolabsai/cli`). If a bare `protomaker` isn't found, it's just not on PATH yet — link it once: `npm run build:packages && npm link --workspace=@protolabsai/cli`. Without linking, fall back to `npx --workspace=@protolabsai/cli protomaker …` or `node packages/cli/dist/cli.js …` (build first with `npm run build --workspace=@protolabsai/cli`). See `docs/internal/dev/operator-tooling.md` → "Put `protomaker` on your PATH".

Global flags (apply to every command):

- `--project <path>` — project root (defaults to cwd). Pass it explicitly in scripts.
- `--json` — machine-readable output. **Always use `--json` when parsing.**
- `--quiet` — suppress non-error output.

The server URL + API key come from the CLI's config/env (same `AUTOMAKER_API_URL` / `AUTOMAKER_API_KEY` the server uses). Confirm connectivity first: `protomaker health`.

## Board — inspect & edit features

```bash
protomaker board                     # per-status summary of the board
protomaker query --status backlog --json          # compound filter (status/category/assignee)
protomaker feature list --status review --compact  # list grouped by status
protomaker feature get <featureId> --json          # full detail for one feature
protomaker feature create --title "Add X" --category fix --complexity small --priority 2
protomaker feature update <featureId> --priority 1 --title "…"
protomaker feature update <featureId> --depends-on <id1,id2>  # set the dependency list (replaces existing)
protomaker feature update <featureId> --clear-deps            # remove all dependencies
protomaker feature move <featureId> <status> --reason "…"   # --reason required when moving to blocked
```

Dependencies gate execution: a feature is only eligible for auto-mode once all `--depends-on` features reach `done`. Use this to sequence epic children (e.g. `--depends-on <epicChildId>`).

Statuses: `backlog | in_progress | review | blocked | done`. Complexity: `small | medium | large | architectural`. Priority: `1=urgent … 4=low`.

## Crew — auto-mode loop + individual agents

```bash
# Auto-mode (the crew loop)
protomaker auto-mode start --max-concurrency 8     # start the loop (capped by AUTOMAKER_MAX_CONCURRENCY)
protomaker auto-mode status --json                 # is it running? how many slots?
protomaker auto-mode stop                           # stop the loop

# Individual agents
protomaker agent start <featureId> --worktree      # dispatch one feature (--force skips dep checks)
protomaker agent list --json                        # currently running agents
protomaker agent output <featureId>                 # tail an agent's output
protomaker agent message <featureId> "<prompt>"     # send a follow-up to a running agent (--image <path>)
protomaker agent stop <featureId>                   # stop a running agent
```

## PRs

```bash
protomaker pr create <featureId> --pr-title "…" --base-branch main   # open a PR from the feature worktree
protomaker pr status <prNumber> --json                                # CI rollup
protomaker pr merge <prNumber> --strategy squash                      # merge (waits for CI unless --no-wait-for-ci)
```

> Note: protoMaker's pipeline owns merges and will only merge when all checks are green — don't bypass that gate by forcing merges with failing/pending checks.

## Queue & context

```bash
protomaker queue add <featureId>      # queue a feature for execution
protomaker queue list --json
protomaker queue clear --yes
protomaker context list               # agent context files; also get/create/delete <filename>
```

## Common workflows

**Check in on the board + crew:**

```bash
protomaker health && protomaker board && protomaker auto-mode status --json && protomaker agent list --json
```

**Create a feature and let the crew run it:**

```bash
protomaker feature create --title "Fix flaky test" --category fix --complexity small --json
protomaker auto-mode start --max-concurrency 8       # crew picks it up
# or dispatch just that one:  protomaker agent start <featureId> --worktree
```

**Watch a feature to completion:**

```bash
watch -n 10 'protomaker feature get <featureId> --json | jq "{status, prNumber}"'
```

## Tips

- Parse with `--json | jq …`; never scrape the human-formatted output.
- `protomaker <group> --help` lists subcommands; `protomaker <group> <cmd> --help` lists flags.
- This CLI and the MCP tools hit the same server API — pick whichever fits the context; the CLI is the better choice for shell scripts, CI, and when MCP isn't connected.
