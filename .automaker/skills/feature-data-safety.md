---
name: feature-data-safety
emoji: 🛡️
description: Prevent feature data loss — branch checkout rules, git add exclusions, and backup patterns. Learned from the Feb 10 incident.
metadata:
  author: agent
  created: 2026-02-12T16:55:56.345Z
  usageCount: 0
  successRate: 0
  tags: [features, data-safety, git, critical, incident-response]
  source: learned
---

# Feature Data Safety

Rules to prevent feature.json data loss. Learned from the Feb 10, 2026 incident where ALL 141 feature.json files were recursively deleted during a 9+ agent crash.

## Root Cause (Two Interacting Problems)

1. **Branch checkout in main repo** — `git checkout feature-branch` modifies the working tree, overwriting `.automaker/features/` with whatever that branch has (usually nothing).

2. **`git add -A` in worktree commits** — Captures stale feature.json state. When those branches merge, they DELETE features from main because the branch snapshot didn't have them.

## Hard Rules

### NEVER Checkout Branches in Main Repo

The server writes to `.automaker/features/` at runtime. Any `git checkout` changes the working tree, wiping live data.

**Instead:**
- Use worktrees: `git worktree add .worktrees/<branch> <branch>`
- Create branches without switching: `git branch <name> && git push origin <name>`
- Use `git -C <worktree-path>` for all worktree operations

### NEVER Use `git add -A` or `git add .`

These stage everything, including:
- `.automaker/features/` runtime data
- `.beads/` runtime files (beads.db, daemon.log)
- Temporary/generated files

**Instead:** Always stage specific files by name:
```bash
git add src/services/my-service.ts libs/types/src/my-type.ts
```

Or exclude automaker directory:
```bash
git add -A -- ':!.automaker/'
```

### Agents Running in Main Repo

When a feature has no `branchName`, agents work directly in the main repo. They may:
- Run `git checkout` (modifies .automaker/features/)
- Create files directly in the repo that need manual cleanup

**Prevention:** Always ensure features have `branchName` set before starting agents.

**Cleanup after cancelled agents:**
```bash
git status  # find leftover files
git checkout -- <unwanted-files>
```

## Backup Strategy

- AtomicWriter `.bak` files are stored in the same directory as originals — useless when the directory itself is deleted
- External backup location is the real safety net
- Feature backup service (PR #164) provides out-of-directory backups
- `.automaker/features/` is NOT git-tracked by design (incompatible with server runtime writes)