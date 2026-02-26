---
name: git-workflow
description: Three-branch strategy, worktree safety, and correct commit patterns
triggers: [git, commit, branch, pr, push, merge, worktree, husky]
---

# Git Workflow Patterns

## Three-Branch Strategy

```
feature/* → dev → staging → main
```

- **`dev`** — active development. Feature branches PR here.
- **`staging`** — integration/QA. PR from `dev` only.
- **`main`** — stable release. PR from `staging` only.

Feature PRs always target `dev` (never `main` or `staging` directly).

## Commit Patterns

Skip Husky hooks when committing from within agents/scripts:

```bash
HUSKY=0 git commit -m "feat: implement X"
```

Before committing, verify only intended files are staged:

```bash
git status
git diff --staged
git add specific-file.ts  # Prefer specific files over git add -A
```

Never use `git add -A` without checking for `.automaker/` or `.beads/` drift:

```bash
# Safe pattern to exclude runtime files
git add -A -- ':!.automaker/' ':!.beads/'
```

## Worktree Safety

Never `cd` into a worktree directory. If the worktree is removed, Bash breaks for the entire session.

```bash
# ✅ Use git -C for operations in worktrees
git -C /path/to/.worktrees/branch-name status
git -C /path/to/.worktrees/branch-name log --oneline -5

# ❌ Never do this
cd /path/to/.worktrees/branch-name
```

## Branch Naming

Feature branches use `feature/` prefix matching the feature ID or a short slug:

```bash
git checkout -b feature/my-feature-name
```
