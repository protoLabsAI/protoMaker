---
name: worktree-safety
emoji: ⚠️
description: Critical safety rules for git worktrees. Prevents session-breaking CWD issues and data loss.
metadata:
  author: agent
  created: 2026-02-11T23:24:06.492Z
  usageCount: 0
  successRate: 0
  tags: [git, worktree, safety, critical]
  source: learned
---

# Worktree Safety Rules

These rules prevent session-breaking failures and data loss. Violating them can require a full session restart.

## NEVER `cd` Into Worktree Directories

If you `cd` into a worktree path and the worktree is later removed (`git worktree remove`), **Bash permanently breaks** for the entire session. Every subsequent Bash call fails with `ENOENT: no such file or directory, posix_spawn '/bin/sh'`.

This also breaks: Task subagents, hooks (stop hook, safety guard), and ALL shell spawning. Only non-shell tools survive (MCP, Read, Write, Edit, Grep, Glob).

**Session restart is the ONLY fix.**

### Instead, Always Use:

```bash
# Read files in worktree
git -C /path/to/.worktrees/branch-name log --oneline -5

# Run commands in worktree (use absolute paths)
git -C /path/to/.worktrees/branch-name status --short
git -C /path/to/.worktrees/branch-name diff

# For npm/prettier that MUST run inside worktree dir:
cd /absolute/path/to/.worktrees/branch-name && npx prettier --write . && cd /Users/kj/dev/automaker
# Always cd BACK immediately after
```

## NEVER Checkout Branches in Main Repo

`git checkout <branch>` modifies `.automaker/features/` on disk, causing feature data loss when the server is running.

### Instead:
- Use worktrees for isolated work
- Create branches with `git branch` + `git push` (no switch)
- Only use `git checkout` inside worktree directories

## NEVER Use `git add -A` with .automaker or .beads

`git add -A` captures runtime files (feature.json, beads.db) that should not be committed.

### Instead:
```bash
git add <specific-files>
# Or exclude automaker:
git add -A -- ':!.automaker/' ':!.beads/'
```

## CWD Persists Across Bash Calls

If you `cd /path/to/worktree-A` in one Bash call, the NEXT call starts there. Always use full `cd /absolute/path && command` patterns when switching between worktrees.