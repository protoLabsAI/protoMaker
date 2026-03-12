---
name: worktree-safety
description: Critical safety rules for git worktrees — never cd into worktrees, use git -C, absolute paths, data incident context.
metadata:
  author: agent
  created: 2026-03-12T00:00:00.000Z
  tags: [git, worktree, safety]
  source: learned
---

# Worktree Safety

Critical rules for avoiding session-breaking and data loss when working with git worktrees.

---

## Rule: Never `cd` Into a Worktree

If you `cd` into a worktree path and the worktree is later removed (`git worktree remove`), the **Bash tool permanently breaks for the entire session**. Session restart is the ONLY fix.

```
ENOENT: no such file or directory, posix_spawn '/bin/sh'
```

This kills: Task subagents, all hooks (stop hook, safety guard), any shell spawning.

### BAD

```bash
# WRONG — if worktree is removed, your session breaks permanently
cd .worktrees/my-branch
git status
```

### GOOD

```bash
# Use git -C to run git commands without changing directory
git -C /path/to/project/.worktrees/my-branch status --short
git -C /path/to/project/.worktrees/my-branch log --oneline -5
git -C /path/to/project/.worktrees/my-branch diff
git -C /path/to/project/.worktrees/my-branch add src/server/routes/foo.ts
git -C /path/to/project/.worktrees/my-branch commit -m "feat: add foo route"

# Read/Write/Edit/Grep/Glob tools all accept absolute paths — no cd needed
# Read:  /path/to/.worktrees/my-branch/src/server/index.ts
# Write: /path/to/.worktrees/my-branch/src/server/new-file.ts
# Grep:  path=/path/to/.worktrees/my-branch
```

---

## Rule: Never Checkout Branches in Main Repo

`git checkout feature-branch` in the main repo overwrites `.automaker/features/` with whatever that branch has (usually nothing), deleting all feature.json files on disk.

### BAD

```bash
# WRONG — overwrites .automaker/features/ with branch snapshot
git checkout feature-branch
```

### GOOD

```bash
# Use worktrees for all branch-based work
git worktree add .worktrees/feature-branch feature-branch

# Or run commands in the branch context without checkout
git -C .worktrees/feature-branch <command>
```

---

## Data Safety Incident (Feb 10, 2026)

ALL 141 feature.json files were deleted during a 9+ agent crash. Two causes:

1. **Branch checkout in main repo** — `git checkout feature-branch` overwrote `.automaker/features/`
2. **`git add -A` in worktree commits** — Captured stale feature.json state; when merged, deleted features from main

`.automaker/features/` is intentionally not git-tracked (incompatible with server runtime writes). The feature backup service provides out-of-directory backups as the real safety net.
