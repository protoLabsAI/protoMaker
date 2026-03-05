---
name: headsdown
emoji: 🛡️
description: Worktree safety guardrails for headsdown mode. NEVER remove worktrees from running agents.
metadata:
  author: agent
  created: 2026-03-05T00:00:00.000Z
  usageCount: 0
  successRate: 0
  tags: [headsdown, worktree, safety, critical]
  source: feature
---

# Headsdown Mode Worktree Safety

These rules prevent data loss and session-breaking failures when cleaning up worktrees during or after headsdown mode.

## NEVER Remove Worktrees With Active Agents

Before removing ANY worktree, you MUST verify no agent is running in it. Removing a worktree from under a running agent:

- Breaks the agent's Bash tool permanently for the session
- Destroys uncommitted work
- Corrupts the agent's working state

### Pre-Removal Checklist (ALL must pass)

1. **Check running agents**: `list_running_agents` - if any agent's `worktreePath` matches, DO NOT remove
2. **Check the lock file**: look for `.automaker-lock` in the worktree directory. If it exists and the PID is alive, DO NOT remove
3. **Check for uncommitted changes**: run `git -C <worktreePath> status --short` - if output is non-empty (`changedFilesCount > 0`), DO NOT remove
4. **Check for unpushed commits**: run `git -C <worktreePath> log --oneline origin/HEAD..HEAD` - if output is non-empty, DO NOT remove

```bash
# Full pre-removal safety check (use -C, NEVER cd into worktrees)
WORKTREE="/path/to/.worktrees/feature-branch"

# 1. Check lock file
cat "$WORKTREE/.automaker-lock" 2>/dev/null && echo "LOCKED - check PID before removing"

# 2. Check uncommitted changes
git -C "$WORKTREE" status --short

# 3. Check unpushed commits
git -C "$WORKTREE" log --oneline origin/HEAD..HEAD 2>/dev/null
```

## Safe Removal Order

Only proceed if ALL of the following are true:

- `list_running_agents` shows no agent with this worktree path
- No `.automaker-lock` file exists (or PID in lock file is dead)
- `git status --short` output is empty (no uncommitted changes)
- `git log origin/HEAD..HEAD` output is empty (no unpushed commits)

```bash
# Safe removal (from project root, NOT from inside the worktree)
git worktree remove --force ".worktrees/feature-branch-name"
```

## Preserving Uncommitted Work Before Removal

If uncommitted changes exist and the worktree needs to be removed:

```bash
# Commit before removing
git -C "$WORKTREE" add -A -- ':!.automaker/'
git -C "$WORKTREE" commit --no-verify -m "wip: preserve work before cleanup"
git -C "$WORKTREE" push -u origin HEAD
```

## NEVER `cd` Into Worktrees

Always use `git -C <path>` to run commands in a worktree. See `worktree-safety` skill for full explanation.
