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

Prettier formatting in worktrees is handled automatically by the server (`worktree-recovery-service.ts` and `git-workflow-service.ts`). They use `node "${projectPath}/node_modules/.bin/prettier" --ignore-path /dev/null` to bypass `.prettierignore` masking and avoid `npx` resolution failures in worktrees (no `node_modules/`).

For manual fixes: `npx prettier --write <file> --ignore-path /dev/null`.

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

## Pre-Removal Safety Checklist

Before removing ANY worktree, ALL of the following must be true:

1. **No running agent**: `list_running_agents` shows no agent with this worktree path
2. **No lock file**: No `.automaker-lock` in the worktree (or the PID inside it is dead)
3. **No uncommitted changes**: `git -C <worktree> status --short` is empty
4. **No unpushed commits**: `git -C <worktree> log --oneline origin/HEAD..HEAD` is empty

```bash
WORKTREE="/path/to/.worktrees/feature-branch"

# Check lock file
cat "$WORKTREE/.automaker-lock" 2>/dev/null && echo "LOCKED — check PID before removing"

# Check uncommitted changes
git -C "$WORKTREE" status --short

# Check unpushed commits
git -C "$WORKTREE" log --oneline origin/HEAD..HEAD 2>/dev/null
```

If uncommitted changes exist and the worktree must be removed:

```bash
git -C "$WORKTREE" add -A -- ':!.automaker/'
git -C "$WORKTREE" commit --no-verify -m "wip: preserve work before cleanup"
git -C "$WORKTREE" push -u origin HEAD
```

---

## Stale Worktree Cleanup — Operational

Stale worktrees block auto-mode because `loadPendingFeatures()` filters features with a `branchName` AND an existing worktree as "belonging to that worktree" — excluding them from the main worktree queue. After agent failures, features reset to `backlog` but keep their `branchName` and worktree, so every backlog feature is filtered out.

**Diagnostic: check for stale worktrees**

```bash
for wt in .worktrees/*/; do
  name=$(basename "$wt")
  changes=$(git -C "$wt" status --short 2>/dev/null | wc -l | tr -d ' ')
  ahead=$(git -C "$wt" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
  echo "$name: $changes uncommitted, $ahead ahead of main"
done
```

**Decision matrix before removing:**

| State                  | Action                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| 0 uncommitted, 0 ahead | Safe to remove — clean slate                                                   |
| 0 uncommitted, N ahead | Has commits but likely partial; safe to remove. Auto-mode recreates fresh.     |
| N uncommitted, 0 ahead | Agent hit turn limit. Review diff. Commit/push/PR before removing if valuable. |

**Safe cleanup procedure:**

```bash
mcp__plugin_protolabs_studio__stop_auto_mode({ projectPath })

for wt in .worktrees/*/; do
  git worktree remove --force ".worktrees/$(basename $wt)"
done

mcp__plugin_protolabs_studio__start_auto_mode({ projectPath, maxConcurrency: 1 })
```

**Crew loop delegation:** Worktree health monitoring is handled by the **Frank** crew loop every 10 minutes. Only intervene manually for worktrees with uncommitted critical changes.

---

## Data Safety — Incident Context

On Feb 10, 2026, ALL 141 feature.json files were recursively deleted during a 9+ agent crash. Two interacting causes:

1. **Branch checkout in main repo** — `git checkout feature-branch` overwrites `.automaker/features/` with whatever that branch has (usually nothing)
2. **`git add -A` in worktree commits** — Captures stale feature.json state. When merged, deletes features from main because the branch snapshot didn't include them

**Hard rules (reinforced):**

- Never `git checkout` branches in the main repo — always use worktrees
- Never `git add -A` or `git add .` — always stage specific files or use `git add -A -- ':!.automaker/'`
- Always ensure features have `branchName` set before starting agents

**Backup strategy note:** AtomicWriter `.bak` files live in the same directory — useless when the directory itself is deleted. The feature backup service (PR #164) provides out-of-directory backups as the real safety net. `.automaker/features/` is intentionally not git-tracked (incompatible with server runtime writes).

---

## Anti-Patterns Summary

| Anti-Pattern                                | Consequence                                                | Fix                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `cd .worktrees/my-branch`                   | Breaks Bash permanently if worktree removed                | Use `git -C <path>` or absolute paths                                                                |
| `npx prettier --write .` from worktree dir  | Wrong ignore paths; `npx` fails silently (no node_modules) | Server handles this automatically now; manual: `npx prettier --write <file> --ignore-path /dev/null` |
| Starting agent without rebase               | Mid-feature merge conflicts, wasted work                   | Always `fetch` + `rebase origin/dev` first                                                           |
| `git worktree remove` with uncommitted work | Data loss                                                  | Check `git status --short` first                                                                     |
| `git checkout <branch>` in main repo        | Modifies `.automaker/features/` on disk → data loss        | Use worktrees or `git -C <wt> checkout`                                                              |
| `git add -A` in main repo                   | Captures runtime files (.automaker/)                       | Use `git add <specific-files>`                                                                       |
| Not `cd`-ing back after worktree commands   | Next Bash call starts in wrong directory                   | Always return: `&& cd /Users/kj/dev/automaker`                                                       |
