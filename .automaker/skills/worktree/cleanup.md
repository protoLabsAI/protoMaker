---
name: worktree-cleanup
description: Rules for cleaning up worktrees — pre-removal checklist, stale detection, operational cleanup when auto-mode is blocked.
metadata:
  author: agent
  created: 2026-03-12T00:00:00.000Z
  tags: [git, worktree, cleanup, stale]
  source: learned
---

# Worktree Cleanup

Rules for safely removing worktrees and recovering from stale states.

---

## Rule: Pre-Removal Safety Checklist

Before removing ANY worktree, ALL of the following must be true:

1. **No running agent**: `list_running_agents` shows no agent with this worktree path
2. **No lock file**: No `.automaker-lock` in the worktree (or the PID inside it is dead)
3. **No uncommitted changes**: `git -C <worktree> status --short` is empty
4. **No unpushed commits**: `git -C <worktree> log --oneline origin/HEAD..HEAD` is empty

### BAD

```bash
# WRONG — removes worktree without checking for agent work
git worktree remove --force .worktrees/feature-branch
```

### GOOD

```bash
WORKTREE="/path/to/.worktrees/feature-branch"

# Check lock file
cat "$WORKTREE/.automaker-lock" 2>/dev/null && echo "LOCKED — check PID before removing"

# Check uncommitted changes
git -C "$WORKTREE" status --short

# Check unpushed commits
git -C "$WORKTREE" log --oneline origin/HEAD..HEAD 2>/dev/null

# If uncommitted work exists and must preserve it:
git -C "$WORKTREE" add -A -- ':!.automaker/'
git -C "$WORKTREE" commit --no-verify -m "wip: preserve work before cleanup"
git -C "$WORKTREE" push -u origin HEAD
```

---

## Rule: Prune Stale Worktrees Before Diagnosing Auto-Mode Blocks

Stale worktrees block auto-mode. `loadPendingFeatures()` filters features with a `branchName` AND an existing worktree as "belonging to that worktree" — excluding them from the queue. After failures, features reset to `backlog` but keep their `branchName`, so every backlog feature is filtered out.

### BAD

```bash
# WRONG — debugging auto-mode without first checking for stale worktrees
# leads to wasted investigation
mcp__plugin_protolabs_studio__get_auto_mode_status({ projectPath })
# "no features being processed" but board has 10 backlog items
```

### GOOD

```bash
# 1. Check for stale worktrees
git worktree prune --dry-run

# 2. Prune confirmed stale entries
git worktree prune

# 3. For active worktrees, check states
for wt in .worktrees/*/; do
  name=$(basename "$wt")
  changes=$(git -C "$wt" status --short 2>/dev/null | wc -l | tr -d ' ')
  ahead=$(git -C "$wt" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
  echo "$name: $changes uncommitted, $ahead ahead of main"
done
```

---

## Operational Cleanup (Auto-Mode Blocked by Stale Worktrees)

```bash
# Stop auto-mode before bulk removal
mcp__plugin_protolabs_studio__stop_auto_mode({ projectPath })

# Remove all worktrees (preserves uncommitted work only if committed first)
for wt in .worktrees/*/; do
  git worktree remove --force ".worktrees/$(basename $wt)"
done

# Restart with lower concurrency
mcp__plugin_protolabs_studio__start_auto_mode({ projectPath, maxConcurrency: 1 })
```

**Frank crew loop** handles worktree health monitoring every 10 minutes. Only intervene manually for worktrees with uncommitted critical changes.

---

## Recover from Accidentally Deleted Worktree Directory

If the worktree directory was deleted without `git worktree remove` (leaves dangling refs):

```bash
# Detect dangling refs
git worktree prune --dry-run

# Remove dangling entries from .git/worktrees/ metadata
git worktree prune

# Re-create if needed
git worktree add .worktrees/my-branch my-branch
```
