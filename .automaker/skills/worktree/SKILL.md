---
name: worktree-patterns
description: Safe patterns for git worktrees in the Automaker project. Use when working with feature worktrees, fixing prettier in worktrees, or recovering stale worktrees. Trigger on "worktree", "cd into worktree", "stale worktree", "worktree rebase", or "prettier in worktree".
tags: [worktree, git, safety, cleanup]
---

# Worktree Patterns

Safe patterns for working with git worktrees in the Automaker monorepo. Each rule is documented in its own file below.

## Rules

| Rule | File | Description |
|------|------|-------------|
| Committing | [committing.md](./committing.md) | Safe commit workflow from worktrees (HUSKY=0, prettier --ignore-path) |
| Cleanup | [cleanup.md](./cleanup.md) | Stale worktree detection, decision matrix, safe removal |
| Branches | [branches.md](./branches.md) | Branch management, rebase vs cherry-pick, epic branch patterns |
| Safety | [safety.md](./safety.md) | Data safety rules, incident context, backup strategy |

## Quick Reference

### Never Do

- `cd .worktrees/my-branch` — breaks Bash if worktree removed
- `git checkout <branch>` in main repo — overwrites `.automaker/features/`
- `git add -A` in main repo — captures runtime files

### Always Do

- Use `git -C <worktree-path>` or absolute paths
- Use `HUSKY=0` when committing from worktrees
- Use `npx prettier --write <file> --ignore-path /dev/null` for formatting
