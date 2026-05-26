# Drive the board from the CLI

Use the `protomaker` CLI to manage features, dispatch agents, and drive the full development loop — all from the terminal. This guide walks through a complete workflow: creating a feature, dispatching an agent, and merging the result.

## Prerequisites

- The protoLabs server is running (`:3008`)
- `protomaker` CLI is installed and in your `PATH`
- Your project is initialized (`.automaker/settings.json` exists)

Verify the connection:

```bash
protomaker health
```

Expected output:

```
Server: ✅ healthy
Version: 0.1.0
Checked: 2026-05-26T10:30:00.000Z
```

## View the current board

Check what's already queued or in progress:

```bash
protomaker board
```

This shows a per-status summary table with counts for backlog, in progress, review, blocked, and done features. You can also see the full board grouped by status:

```bash
protomaker feature list
```

## Create a feature

Add a new feature to the backlog:

```bash
protomaker feature create \
  --title "Add user authentication" \
  --description "Implement JWT-based auth with login, logout, and token refresh endpoints" \
  --category feature \
  --complexity medium \
  --priority 2
```

The CLI returns the new feature ID. Save it for the next steps.

### Create an epic container

For larger initiatives, create an epic that groups child features:

```bash
protomaker feature create \
  --title "Q3 Platform Redesign" \
  --description "Redesign the core platform with new architecture" \
  --is-epic
```

Child features reference the epic via `--epic-id`:

```bash
protomaker feature create \
  --title "Migrate to micro-frontends" \
  --description "Split the monolith into independent frontend modules" \
  --epic-id feature-1779776805064-xxx
```

## Dispatch an agent

Start an agent on a feature. The agent will work in an isolated git worktree by default:

```bash
protomaker agent start feature-1779776805064-xxx
```

Skip dependency checks with `--force`:

```bash
protomaker agent start feature-1779776805064-xxx --force
```

Monitor what's running:

```bash
protomaker agent list
```

Stream agent output for a feature:

```bash
protomaker agent output feature-1779776805064-xxx
```

Send a follow-up message to a running agent:

```bash
protomaker agent message feature-1779776805064-xxx "Also handle edge case when token expires during refresh"
```

## Open a PR

When the agent completes its work, create a pull request:

```bash
protomaker pr create feature-1779776805064-xxx \
  --commit-message "feat: add user authentication" \
  --pr-title "Add user authentication" \
  --pr-body "Implements JWT-based auth with login, logout, and token refresh."
```

Check CI status on the PR:

```bash
protomaker pr status 42
```

## Merge the PR

Once CI passes, merge with the default squash strategy:

```bash
protomaker pr merge 42
```

Use a different merge strategy if needed:

```bash
protomaker pr merge 42 --strategy rebase
```

## Use auto-mode for hands-off execution

Start the auto-mode loop to automatically process backlog features:

```bash
protomaker auto-mode start --max-concurrency 3
```

Check auto-mode status at any time:

```bash
protomaker auto-mode status
```

Stop the loop:

```bash
protomaker auto-mode stop
```

## Get a full situation report

For a single-command overview of board state, running agents, open PRs, and server health:

```bash
protomaker sitrep
```

## Use JSON output for scripting

Every command supports `--json` for machine-readable output, making the CLI suitable for automation and CI pipelines:

```bash
protomaker feature list --json
protomaker board --json
protomaker sitrep --json
```

## Next Steps

- **[CLI Command Reference](../reference/cli-commands)** — Complete list of every command and flag
- **[Auto Mode](../reference/auto-mode)** — Deep dive into the auto-mode service
- **[Workflow Settings](../reference/workflow-settings)** — Configure per-project behavior
