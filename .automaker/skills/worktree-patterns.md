---
name: worktree-patterns
emoji: 🌳
description: Safe patterns for git worktrees — NEVER cd into worktrees, prettier fix, pre-flight rebase, stale detection and recovery.
metadata:
  author: agent
  created: 2026-02-25T00:00:00.000Z
  usageCount: 0
  successRate: 0
  tags: [git, worktree, safety, prettier, rebase]
  source: learned
---

# Worktree Patterns

Critical rules and exact commands for working safely with git worktrees in Automaker. Violating these rules can break the session, cause data loss, or corrupt worktree state.

---

## ⛔ NEVER `cd` Into a Worktree

This is the most dangerous operation. If you `cd` into a worktree path and the worktree is later removed (`git worktree remove`), the **Bash tool permanently breaks for the entire session**. Every subsequent Bash call fails with:

```
ENOENT: no such file or directory, posix_spawn '/bin/sh'
```

This also kills: Task subagents, all hooks (stop hook, safety guard), any shell spawning.
**Session restart is the ONLY fix.**

### ✅ Use `git -C` Instead

```bash
# Check status in a worktree — SAFE
git -C /Users/kj/dev/automaker/.worktrees/my-branch status --short

# View recent commits — SAFE
git -C /Users/kj/dev/automaker/.worktrees/my-branch log --oneline -5

# View diff — SAFE
git -C /Users/kj/dev/automaker/.worktrees/my-branch diff

# Stage specific files — SAFE
git -C /Users/kj/dev/automaker/.worktrees/my-branch add src/server/routes/foo.ts

# Commit — SAFE
git -C /Users/kj/dev/automaker/.worktrees/my-branch commit -m "feat: add foo route"
```

### ✅ Use Absolute Paths for Read/Write Tools

The `Read`, `Write`, `Edit`, `Grep`, and `Glob` tools work fine with absolute paths — no `cd` needed:

```bash
# These work without any cd:
# Read:  /Users/kj/dev/automaker/.worktrees/my-branch/src/server/index.ts
# Write: /Users/kj/dev/automaker/.worktrees/my-branch/src/server/new-file.ts
# Grep:  path=/Users/kj/dev/automaker/.worktrees/my-branch
```

---

## Prettier in Worktrees

Running `prettier` in a worktree directory fails to pick up the root `.prettierignore` (which references paths relative to the project root). This causes prettier to try formatting files it should skip.

### ✅ Required Fix: `--ignore-path /dev/null`

```bash
# CORRECT: disable .prettierignore lookup when formatting worktree files
cd /Users/kj/dev/automaker/.worktrees/my-branch && \
  npx prettier --write --ignore-path /dev/null src/ && \
  cd /Users/kj/dev/automaker

# Format a single file in a worktree
cd /Users/kj/dev/automaker/.worktrees/my-branch && \
  npx prettier --write --ignore-path /dev/null src/server/routes/foo.ts && \
  cd /Users/kj/dev/automaker
```

> **Why `--ignore-path /dev/null`?** The `.prettierignore` in the main repo has paths like `dist/`, `node_modules/`, `.automaker/`. When prettier runs from the worktree directory, those relative paths may resolve differently or fail. Using `/dev/null` skips the ignore file entirely — format exactly what you specify.

> **Always `cd` back** to `/Users/kj/dev/automaker` immediately after running prettier in a worktree.

---

## Pre-Flight Rebase Before Agent Starts

Before an agent begins work in a worktree, always sync it with the base branch to avoid merge conflicts mid-feature.

### ✅ Standard Pre-Flight Sequence

```bash
# 1. Fetch latest from origin
git -C /Users/kj/dev/automaker/.worktrees/my-branch fetch origin

# 2. Rebase onto the base branch (usually dev or main)
git -C /Users/kj/dev/automaker/.worktrees/my-branch rebase origin/dev

# 3. Verify clean state
git -C /Users/kj/dev/automaker/.worktrees/my-branch status --short
```

If there are no conflicts, status should show empty output (clean tree).

### Handling Rebase Conflicts

```bash
# If rebase fails due to conflicts:
git -C /Users/kj/dev/automaker/.worktrees/my-branch rebase --abort

# Report the conflict — do NOT attempt to resolve automatically
# The agent should surface this to the orchestrator as a blocker
```

---

## Checking for Uncommitted Work

Before creating, switching, or removing worktrees, always verify uncommitted work:

```bash
# Check for unstaged/staged/untracked changes — empty output = clean
git -C /Users/kj/dev/automaker/.worktrees/my-branch status --short

# Check if there are commits not pushed to remote
git -C /Users/kj/dev/automaker/.worktrees/my-branch log origin/my-branch..HEAD --oneline

# Check if worktree has ANY local changes vs base branch
git -C /Users/kj/dev/automaker/.worktrees/my-branch diff origin/dev --stat
```

---

## Stale Worktree Detection and Recovery

A worktree becomes "stale" if its branch was deleted on the remote, or if the worktree directory was removed without `git worktree remove`.

### Detect Stale Worktrees

```bash
# List all worktrees and their state
git worktree list

# Check for prunable (stale/orphan) worktrees
git worktree prune --dry-run
```

Output showing `prunable` means the worktree is stale:
```
Removing worktrees/my-old-branch: gitdir file points to non-existent location
```

### Recover from Stale Worktree

```bash
# Remove stale entries from .git/worktrees/ metadata
git worktree prune

# Verify cleanup
git worktree list
```

### Recover from Accidentally Deleted Worktree Directory

If the worktree directory was deleted without `git worktree remove`:

```bash
# Prune the dangling ref
git worktree prune

# Re-create if needed
git worktree add .worktrees/my-branch my-branch
```

---

## Safe Worktree Lifecycle

```bash
git worktree add .worktrees/feature-foo feature/foo            # from existing branch
git worktree add -b feature/new-thing .worktrees/x origin/dev  # new branch from dev
git worktree list                                               # list all
git worktree remove .worktrees/feature-foo                     # clean remove
git worktree remove --force .worktrees/feature-foo             # force (uncommitted ok)
```

---

## Anti-Patterns Summary

| Anti-Pattern | Consequence | Fix |
|---|---|---|
| `cd .worktrees/my-branch` | Breaks Bash permanently if worktree removed | Use `git -C <path>` or absolute paths |
| `npx prettier --write .` from worktree dir | Wrong ignore paths; may format dist/ or .automaker/ | Add `--ignore-path /dev/null` |
| Starting agent without rebase | Mid-feature merge conflicts, wasted work | Always `fetch` + `rebase origin/dev` first |
| `git worktree remove` with uncommitted work | Data loss | Check `git status --short` first |
| `git checkout <branch>` in main repo | Modifies `.automaker/features/` on disk → data loss | Use worktrees or `git -C <wt> checkout` |
| `git add -A` in main repo | Captures runtime files (.automaker/, .beads/) | Use `git add <specific-files>` |
| Not `cd`-ing back after worktree commands | Next Bash call starts in wrong directory | Always return: `&& cd /Users/kj/dev/automaker` |
