---
name: pr-conflict-resolution
emoji: 🔧
description: Rebase workflow when PRs conflict after other merges. Safe conflict resolution without data loss.
metadata:
  author: agent
  created: 2026-02-12T02:12:04.529Z
  usageCount: 0
  successRate: 0
  tags: [git, pr, conflicts, rebase, workflow]
  source: learned
---

# PR Conflict Resolution

When PRs conflict because other PRs merged into main first.

## Standard Rebase (no uncommitted changes)

```bash
# From main repo (NEVER cd into worktree)
git -C <worktree> fetch origin
git -C <worktree> rebase origin/main

# If rebase succeeds
git -C <worktree> push --force-with-lease

# Verify PR is mergeable
gh pr view <number> --json mergeable,mergeStateStatus
```

## Rebase With Uncommitted Changes

```bash
# Stash first
git -C <worktree> stash

# Rebase
git -C <worktree> fetch origin
git -C <worktree> rebase origin/main

# Restore stash
git -C <worktree> stash pop

# If stash pop conflicts: keep only new work
git -C <worktree> checkout -- <conflicting-files-from-main>

# Push
git -C <worktree> push --force-with-lease
```

## During Active Agent

Send rebase instructions via MCP instead of doing it yourself:

```
send_message_to_agent(featureId, `
  Your worktree is behind main. Please rebase:
  git stash && git fetch origin && git rebase origin/main && git stash pop
  If stash pop conflicts on files you didn't modify, run:
  git checkout -- <file>
`)
```

## Common Conflict Sources

| File | Why | Resolution |
|------|-----|------------|
| `libs/types/src/index.ts` | Multiple features add exports | Keep all exports, sort alphabetically |
| `packages/mcp-server/src/index.ts` | Multiple features add MCP tools | Keep all tools |
| `apps/server/src/index.ts` | Multiple features register routes | Keep all registrations |
| `package.json` / `package-lock.json` | Dependency changes | Accept incoming, `npm install` |

## Safety Rules

- **NEVER** `git push --force` (use `--force-with-lease` always)
- **NEVER** `cd` into worktree directories (use `git -C` or absolute paths)
- **NEVER** rebase while agent is running without sending message first
- **ALWAYS** verify mergeable status after push
- **ALWAYS** re-enable auto-merge if it was disabled by the conflict
