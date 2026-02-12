---
name: agent-postflight
emoji: 🛬
description: Post-flight cleanup after agent completes or hits turn limit. Handles formatting, PRs, CodeRabbit, and uncommitted work.
metadata:
  author: agent
  created: 2026-02-11T23:23:52.020Z
  usageCount: 0
  successRate: 0
  tags: [agent, operations, pr, formatting, checklist]
  source: learned
---

# Agent Post-Flight Cleanup

Run this AFTER every agent completion or turn-limit hit. Agents consistently leave behind format violations, uncommitted work, and unresolved review threads.

## 1. Check for Uncommitted Work

```bash
git -C <worktree-path> status --short
```

If uncommitted changes exist: review diff, then proceed to step 2.

**Why:** When agents hit turn limits, changes sit uncommitted in the worktree. This work is lost if the worktree is cleaned up.

## 2. Programmatically Format (MANDATORY)

```bash
cd <worktree-path> && npx prettier --write $(git diff --name-only --diff-filter=ACMR)
```

**CRITICAL:** Always run from INSIDE the worktree. Running prettier from outside gives false passes due to config resolution differences. Always `--write`, never just `--check`.

**Why:** Agents consistently produce format violations. CI will fail. Fix programmatically — don't just report.

## 3. Commit, Push, Create PR

```bash
git -C <worktree-path> add <specific-files>
git -C <worktree-path> commit -m "feat: <description>"
git -C <worktree-path> push -u origin <branch-name>
```

Then create PR via `gh pr create` or `gt submit`.

**Why:** Verified features often lack PRs when agents hit turn limits.

## 4. Resolve CodeRabbit Threads

Use `resolve_review_threads` MCP tool or GraphQL `resolveReviewThread` mutation.

**Why:** `required_review_thread_resolution: true` in branch protection means unresolved CodeRabbit comments block auto-merge.

## 5. Trigger CodeRabbit If Missing

Comment `@coderabbitai review` on PRs where CodeRabbit hasn't reviewed.

**Why:** CodeRabbit is a required check. If it doesn't review, auto-merge hangs forever.

## 6. Re-Verify Dependency Chain

Check that feature resets haven't silently cleared dependencies downstream.

## 7. Enable Auto-Merge

```bash
gh pr merge <number> --auto --squash
```