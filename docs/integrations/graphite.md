# Graphite Integration

[Graphite](https://graphite.dev) is a stack-aware PR management tool that makes working with stacked pull requests seamless. protoLabs integrates natively with Graphite to automate PR creation across the epic branch hierarchy.

## Why Graphite?

protoLabs works with **epics** — long-running branches that group related features. Each feature lives on its own branch, stacked on top of its epic branch:

```
main
 └── epic/my-epic          ← epic PR targets main
      ├── feature/feat-a   ← feature PR targets epic
      └── feature/feat-b   ← feature PR targets epic
```

Managing this hierarchy with plain `git` and `gh` is error-prone: PRs can accidentally target `main`, rebase conflicts cascade, and base branches must be updated manually. Graphite solves all of this. It tracks the parent–child relationship between branches, submits the full stack in a single command, and restacks cleanly when trunk moves.

## Setup

### 1. Install the Graphite CLI

```bash
npm install -g @withgraphite/graphite-cli
```

Verify the installation:

```bash
gt --version
```

### 2. Authenticate

Generate a token at [app.graphite.dev/settings/cli](https://app.graphite.dev/settings/cli), then:

```bash
gt auth --token <your-token>
```

### 3. Sync your repository

1. Open [Graphite settings → Synced Repos](https://app.graphite.com/settings/synced-repos)
2. Click **Add repository** and select your GitHub repo
3. Graphite will mirror your PRs and branch relationships going forward

### 4. Join or create a team

1. Open [Graphite settings → Teams](https://app.graphite.com/settings)
2. Join an existing team for your organisation, or create one
3. Team membership enables the Graphite inbox and review assignment features

## How protoLabs Uses Graphite

### Automatic stack PR creation

When an agent creates PRs for an epic, protoLabs orchestrates the full stack automatically:

1. Epic branch is pushed (`epic/my-epic`)
2. Feature branches are pushed on top of the epic branch
3. protoLabs calls `gt submit --stack` to open all PRs in one operation, with each PR targeting the correct base branch

The agent never manually sets `--base` for individual PRs — Graphite reads the tracked parent from the local repo state and handles targeting.

### `gt submit` vs `gh pr create` fallback

protoLabs detects whether Graphite is available and whether the repo is synced:

| Condition                          | PR command used        |
| ---------------------------------- | ---------------------- |
| Graphite CLI installed + repo synced | `gt submit --stack`  |
| Graphite not installed             | `gh pr create --base <epic-branch>` |
| Repo not synced in Graphite        | `gh pr create --base <epic-branch>` |

When falling back to `gh pr create`, protoLabs sets `--base` explicitly so feature PRs still target their epic branch instead of `main`.

### Epic branch hierarchy

The PR chain that Graphite manages mirrors the protoLabs epic model:

- **Epic PR** — `epic/my-epic → main` — opened when the epic is created
- **Feature PRs** — `feature/feat-a → epic/my-epic` — opened when each feature completes
- Merge order: feature PRs first into the epic branch, then the epic PR into main

This keeps `main` clean while all feature work accumulates incrementally inside the epic.

## The `graphite_restack` MCP Tool

protoLabs exposes a dedicated MCP tool for Graphite restacking:

**Tool:** `graphite_restack`

**Description:** Restacks the entire branch stack on trunk using the Graphite CLI. When `main` has advanced since your stack was created, this rebases all branches in order, preventing merge conflicts during PR creation.

**Input:**

| Parameter      | Type   | Required | Description                                  |
| -------------- | ------ | -------- | -------------------------------------------- |
| `worktreePath` | string | Yes      | Absolute path to the git worktree to restack |

**Example (from Claude Code via MCP):**

```typescript
mcp__plugin_automaker_automaker__graphite_restack({
  worktreePath: '/path/to/project/.claude/worktrees/feature-abc',
});
```

**When to use it:** Call `graphite_restack` whenever the headsdown agent encounters merge conflicts after trunk has moved. It is equivalent to running `gt restack` in the worktree directory.

See [MCP Tools Reference](./mcp-tools-reference) for the complete tool listing.

## Common Commands

### Tracking branches

```bash
# Track the epic branch against main
gt track epic/my-epic --parent main

# Track a feature branch under its epic
gt track feature/my-feature --parent epic/my-epic
```

### Submitting PRs

```bash
# Open/update every PR in the current stack
gt submit --stack

# Open/update only the current branch's PR
gt submit
```

### Viewing the stack

```bash
# Compact view of the current stack
gt log short

# Full log with PR status indicators
gt log
```

### Syncing and restacking

```bash
# Pull latest remote changes and update the stack
gt sync

# Rebase the entire stack on the latest trunk
gt restack
```

### Other useful commands

```bash
# Show the tracked parent of the current branch
gt branch info

# Checkout the next branch up in the stack
gt up

# Checkout the next branch down in the stack
gt down
```

## Troubleshooting

### "No commits on this branch" error when submitting PRs

Graphite cannot create a PR for a branch that has no commits relative to its parent. This most commonly happens with freshly created epic branches.

**Fix:** Make sure the epic branch has at least one commit before running `gt submit`. protoLabs agents add an initial commit (e.g., a `.gitkeep` or scaffold commit) to every epic branch for this reason. If the branch is empty, add a commit manually:

```bash
git commit --allow-empty -m "chore: initialise epic branch"
```

### `gt submit` exits with "repo not synced"

Graphite requires the repository to be connected in the Graphite dashboard before it can open PRs.

**Fix:** Visit [app.graphite.com/settings/synced-repos](https://app.graphite.com/settings/synced-repos), add the repo, and re-run `gt submit --stack`.

### Stack targeting wrong base branch

If a feature PR targets `main` instead of its epic branch, the tracked parent was not set correctly.

**Fix:**

```bash
# Confirm the current tracked parent
gt branch info

# Re-track with the correct parent
gt track feature/my-feature --parent epic/my-epic --force
```

### Merge conflicts after restacking

When `gt restack` encounters a conflict:

1. Resolve the conflict in the affected file(s)
2. Stage the resolved files: `git add <files>`
3. Continue the restack: `gt restack --continue`
4. If you want to abort: `gt restack --abort`

Alternatively, use the `graphite_restack` MCP tool — protoLabs agents call this automatically when they detect conflict signals.

### `gt auth` token invalid or expired

Graphite CLI tokens do not expire by default, but they can be revoked.

**Fix:** Generate a new token at [app.graphite.dev/settings/cli](https://app.graphite.dev/settings/cli) and re-run:

```bash
gt auth --token <new-token>
```

### Graphite CLI not found in PATH

```
Error: gt: command not found
```

**Fix:** Ensure the global npm bin directory is in your `PATH`:

```bash
npm root -g   # find the global root
# Add the bin sibling of this directory to PATH in your shell profile
```

Or install with a version manager (e.g., `pnpm install -g @withgraphite/graphite-cli`).

## Related Documentation

- [MCP Tools Reference](./mcp-tools-reference) — Full list of MCP tools, including `graphite_restack`
- [Branch Strategy](/dev/branch-strategy) — How epics and feature branches are structured
- [Git Workflow](/dev/git-workflow) — End-to-end PR and merge workflow
