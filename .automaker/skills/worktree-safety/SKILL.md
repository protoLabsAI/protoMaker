---
name: worktree-safety
description: Never cd into worktrees, use git -C patterns, and prettier with --ignore-path
triggers: [worktree, git, cd, bash, prettier, format]
---

# Worktree Safety Rules

## NEVER `cd` Into Worktree Directories

If you `cd` into a worktree path and the worktree is later removed, **Bash permanently breaks** for the entire session. Every subsequent Bash call fails with `ENOENT`.

**Session restart is the only fix.**

## Always Use `git -C` Instead

```bash
# ✅ Correct: operate in worktree without changing CWD
git -C /path/to/.worktrees/branch-name status
git -C /path/to/.worktrees/branch-name log --oneline -5
git -C /path/to/.worktrees/branch-name diff
git -C /path/to/.worktrees/branch-name add specific-file.ts
git -C /path/to/.worktrees/branch-name commit -m "feat: X"

# ❌ Wrong: never cd into the worktree
cd /path/to/.worktrees/branch-name
```

## Running Commands That Require CWD (e.g., Prettier)

When a tool must run from inside the worktree directory, cd in and back out in a single Bash call:

```bash
cd /absolute/path/to/.worktrees/branch-name && \
  npx prettier --write src/ && \
  cd /original/working/directory
```

## Prettier with `--ignore-path`

When running prettier from outside the worktree, use `--ignore-path` to respect the project's `.prettierignore`:

```bash
npx prettier --write src/ --ignore-path /path/to/.worktrees/branch-name/.prettierignore
```

## Never Checkout Branches in the Main Repo

`git checkout <branch>` in the main repo modifies `.automaker/features/` on disk, causing feature data loss when the server is running.

Instead:

- Use worktrees for isolated work
- Create branches with `git branch` + `git push` (no switch)

## CWD Persists Across Bash Calls

If you use `cd` in one Bash call, the next call starts from that directory. Always use absolute paths when switching contexts.
