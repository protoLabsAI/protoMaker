---
name: worktree-branches
description: Rules for managing worktree branches — lifecycle commands, pre-flight rebase, checking uncommitted work before switching.
metadata:
  author: agent
  created: 2026-03-12T00:00:00.000Z
  tags: [git, worktree, branches, rebase]
  source: learned
---

# Worktree Branches

Rules for creating, switching, and maintaining branches via git worktrees.

---

## Rule: Pre-Flight Rebase Before Agent Starts

Before an agent begins work in a worktree, sync it with the base branch to avoid merge conflicts mid-feature.

### BAD

```bash
# WRONG — agent starts without syncing, hits conflicts mid-feature
mcp__plugin_protolabs_studio__start_agent({ featureId, projectPath })
```

### GOOD

```bash
# Fetch and rebase onto base branch first
git -C "$WORKTREE" fetch origin
git -C "$WORKTREE" rebase origin/dev

# Verify clean state — empty output = clean
git -C "$WORKTREE" status --short

# Then start the agent
mcp__plugin_protolabs_studio__start_agent({ featureId, projectPath })
```

If rebase conflicts occur:

```bash
git -C "$WORKTREE" rebase --abort
# Surface to orchestrator as a blocker — do NOT attempt auto-resolve
```

---

## Rule: Check for Uncommitted Work Before Branch Operations

Before creating, switching, or removing worktrees, verify clean state.

### BAD

```bash
# WRONG — may remove worktree with uncommitted agent work
git worktree remove .worktrees/feature-foo
```

### GOOD

```bash
WORKTREE=".worktrees/feature-foo"

# Check for unstaged/staged/untracked changes — empty = clean
git -C "$WORKTREE" status --short

# Check for unpushed commits
git -C "$WORKTREE" log origin/$(git -C "$WORKTREE" branch --show-current)..HEAD --oneline

# Only remove if both are clean
git worktree remove "$WORKTREE"
```

---

## Safe Worktree Lifecycle

```bash
# Create from existing branch
git worktree add .worktrees/feature-foo feature/foo

# Create new branch from dev
git worktree add -b feature/new-thing .worktrees/new-thing origin/dev

# List all worktrees and their state
git worktree list

# Clean remove (requires no uncommitted changes)
git worktree remove .worktrees/feature-foo

# Force remove (discards uncommitted changes — use with caution)
git worktree remove --force .worktrees/feature-foo
```

---

## Checking Uncommitted Work Across All Worktrees

```bash
# Diagnostic — check all worktrees at once
for wt in .worktrees/*/; do
  name=$(basename "$wt")
  changes=$(git -C "$wt" status --short 2>/dev/null | wc -l | tr -d ' ')
  ahead=$(git -C "$wt" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
  echo "$name: $changes uncommitted, $ahead ahead of main"
done
```

| State                  | Action                                                     |
| ---------------------- | ---------------------------------------------------------- |
| 0 uncommitted, 0 ahead | Safe to remove                                             |
| 0 uncommitted, N ahead | Likely partial; safe to remove — auto-mode recreates fresh |
| N uncommitted, 0 ahead | Review diff — commit/push/PR before removing if valuable   |
