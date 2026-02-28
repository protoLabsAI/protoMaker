---
name: worktree-cleanup
emoji: 🧹
description: Clean stale worktrees that block auto-mode from picking up features. Run before restarting auto-mode after failures.
metadata:
  author: ava
  created: 2026-02-11T21:00:00.000Z
  usageCount: 0
  successRate: 0
  tags: [worktree, cleanup, auto-mode, maintenance]
  source: learned
---

# Worktree Cleanup

## When to Run

- Before restarting auto-mode after agent failures
- When `isAutoLoopRunning: true` but `runningFeatures: []` (loop alive, no work)
- After bulk feature resets
- As part of regular board grooming

## Why Worktrees Block Auto-Mode

`loadPendingFeatures()` filters features by branch ownership:
- Features with `branchName` AND an existing worktree → "belongs to that worktree" → **excluded** from main worktree auto-mode
- Features with `branchName` but NO worktree → "orphaned" → **included**
- Features with `branchName: null` → "unassigned" → **included**

When agents fail, features reset to `backlog` but keep their `branchName` and worktree. Result: every backlog feature is filtered out as "belonging to a worktree."

## Diagnostic

```bash
# Check which worktrees exist
git worktree list

# Check for uncommitted work in worktrees
for wt in .worktrees/*/; do
  name=$(basename "$wt")
  changes=$(git -C "$wt" status --short 2>/dev/null | wc -l | tr -d ' ')
  ahead=$(git -C "$wt" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
  echo "$name: $changes uncommitted, $ahead ahead of main"
done
```

## Safe Cleanup (recommended)

```bash
# Stop auto-mode first
mcp__plugin_protolabs_studio__stop_auto_mode({ projectPath })

# Remove all worktrees
for wt in .worktrees/*/; do
  git worktree remove --force ".worktrees/$(basename $wt)"
done

# Restart auto-mode — features become orphaned = eligible
mcp__plugin_protolabs_studio__start_auto_mode({ projectPath, maxConcurrency: 1 })
```

## Preserving Work from Worktrees

Before removing, check for valuable uncommitted work:
- **0 uncommitted, 0 ahead**: Safe to remove (clean, nothing to lose)
- **0 uncommitted, N ahead**: Has commits from failed agent. Usually partial/broken — safe to remove. Auto-mode will recreate fresh.
- **N uncommitted, 0 ahead**: Agent hit turn limit. Review the diff. If valuable, commit/push/PR before removing.

## CRITICAL: Never `cd` Into Worktrees

Use `git -C <path>` or absolute paths. If you `cd` into a worktree and then remove it, Bash breaks permanently for the session. See `worktree-safety` skill.

## Crew Loop Delegation

Worktree health monitoring is delegated to the **Frank** crew loop, which runs every 10 minutes and detects stale worktrees. Only intervene manually for worktrees with uncommitted critical changes that need human judgment about whether to preserve or discard.
