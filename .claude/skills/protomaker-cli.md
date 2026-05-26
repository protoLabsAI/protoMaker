---
name: protomaker-cli
description: Use the protomaker CLI as the primary board interface. Discover commands via --help, complete feature->PR loops via Bash. Prefer this over MCP tools for board operations.
category: tooling
argument-hint: [command or subcommand to look up]
allowed-tools:
  - Bash
  - Read
---

# protomaker CLI — Primary Board Interface

The `protomaker` CLI is the primary interface for board operations, agent lifecycle,
and PR management. Use it via Bash instead of MCP tools.

## Discovery Pattern

Always discover available commands and flags via `--help`:

```bash
# Top-level help — shows all command groups
protomaker --help

# Command group help — shows subcommands
protomaker feature --help
protomaker agent --help
protomaker pr --help
protomaker auto-mode --help
protomaker queue --help
protomaker context --help

# Subcommand help — shows arguments and flags
protomaker feature create --help
protomaker agent start --help
protomaker pr create --help
```

## Global Flags

Every command supports:

| Flag               | Description                               |
| ------------------ | ----------------------------------------- |
| `--json`           | Output structured JSON (machine-readable) |
| `--quiet`          | Suppress all non-error output             |
| `--project <path>` | Project path (defaults to cwd)            |

## Command Surface

### Feature Management

```bash
protomaker feature list                    # Board view — grouped by status
protomaker feature list --status backlog   # Filter by status
protomaker feature list --compact          # One-line per feature (text mode)
protomaker feature get <featureId>         # Full feature details
protomaker feature create --description "..." --title "..." --complexity small --priority 3
protomaker feature update <featureId> --title "..." --description "..."
protomaker feature move <featureId> <status>   # status: backlog, in_progress, review, blocked, done, interrupted
```

### Agent Lifecycle

```bash
protomaker agent list                      # Show running agents
protomaker agent start <featureId>         # Dispatch agent for a feature
protomaker agent start <featureId> --force # Skip dependency checks
protomaker agent start <featureId> --worktree # Use git worktree isolation
protomaker agent stop <featureId>          # Stop a running agent
protomaker agent output <featureId>        # Print agent output (agent-output.md)
protomaker agent message <featureId> "..." # Send follow-up message to running agent
```

### PR Lifecycle

```bash
protomaker pr create <featureId>           # Commit, push, and open PR from worktree
protomaker pr status <prNumber>            # CI rollup (checks, ownership, staleness)
protomaker pr merge <prNumber>             # Merge with configured strategy (default: squash)
protomaker pr merge <prNumber> --strategy rebase
protomaker pr merge <prNumber> --no-wait-for-ci
```

### Auto-Mode

```bash
protomaker auto-mode start                 # Start the auto-mode loop
protomaker auto-mode start --max-concurrency 3
protomaker auto-mode stop                  # Stop the auto-mode loop
protomaker auto-mode status                # Show auto-mode state + active features
```

### Queue

```bash
protomaker queue add <featureId>           # Add feature to execution queue
protomaker queue list                      # List queued features
protomaker queue clear --yes               # Clear all queued features
```

### Board & Query

```bash
protomaker board                           # Per-status summary with WIP limits
protomaker query --status backlog          # Query with compound filters
protomaker query --status in_progress --assignee agent
```

### Context Files

```bash
protomaker context list                    # List all context files
protomaker context get <filename.md>       # Read a context file
protomaker context create <filename.md> --content "..."  # Create a context file
protomaker context delete <filename.md>    # Delete a context file
```

### Operations

```bash
protomaker sitrep                          # Full operational status (board, agents, PRs, health)
protomaker health                          # Server health check
```

## Feature -> PR Loop (Agent Workflow)

Complete a full feature-to-PR cycle using only the CLI:

```bash
# 1. Check server is reachable
protomaker health

# 2. View current board state
protomaker board

# 3. Create a feature
protomaker feature create \
  --title "Add user auth" \
  --description "Implement JWT-based authentication for API endpoints" \
  --complexity medium \
  --priority 2

# 4. Get the feature ID from the output (or list to find it)
FEATURE_ID=$(protomaker feature list --compact --json | jq -r '.[0].id')

# 5. Dispatch an agent
protomaker agent start $FEATURE_ID --worktree

# 6. Monitor agent progress
protomaker agent list
protomaker agent output $FEATURE_ID

# 7. Send follow-up if needed
protomaker agent message $FEATURE_ID "Also add rate limiting to auth endpoints"

# 8. Create PR when agent completes
protomaker pr create $FEATURE_ID \
  --commit-message "feat: add user auth" \
  --pr-title "Add user authentication"

# 9. Check CI status
protomaker pr status 123

# 10. Merge when checks pass
protomaker pr merge 123

# 11. Move feature to done
protomaker feature move $FEATURE_ID done
```

## JSON Mode for Parsing

Use `--json` when you need to parse output programmatically:

```bash
# Get feature details as JSON
protomaker feature get $FEATURE_ID --json

# List features in JSON format
protomaker feature list --json

# Sitrep as JSON for scripting
protomaker sitrep --json
```

## Exit Codes

| Code | Meaning                                       |
| ---- | --------------------------------------------- |
| 0    | Success                                       |
| 1    | Runtime error (server error, network failure) |
| 2    | Usage error (bad args, missing required flag) |

## Best Practices for Agents

1. **Discover via `--help`** — run `protomaker --help` before using unfamiliar commands
2. **Use `--json` for parsing** — always use JSON mode when extracting IDs or values for scripting
3. **Check health first** — run `protomaker health` before starting work
4. **Use `sitrep` for overview** — get a full picture before making decisions
5. **Prefer CLI over MCP** — the CLI is the canonical interface; MCP tools may lag behind
