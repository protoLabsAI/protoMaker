---
name: pr-pipeline
emoji: 🔀
description: PR lifecycle management — auto-merge, CodeRabbit, format fixes, branch protection rules.
metadata:
  author: agent
  created: 2026-02-11T23:24:35.201Z
  usageCount: 0
  successRate: 0
  tags: [pr, github, ci, coderabbit, auto-merge]
  source: learned
---

# PR Pipeline Management

End-to-end PR lifecycle from creation to merge. Covers auto-merge, CodeRabbit, format fixes, and branch protection gotchas.

## Branch Protection Rules

- **Required checks:** build, test, format, audit, CodeRabbit
- **Squash-only** merges (no merge commits, no rebase)
- **Admin bypass** enabled (but direct `git push origin main` still fails)
- **Thread resolution required** — all CodeRabbit comments must be resolved before merge
- **Strict status checks disabled** — PRs don't need to be up-to-date with main to merge

## Auto-Merge Setup

```bash
gh pr merge <number> --auto --squash
```

Auto-merge waits for all required checks then merges automatically. Set it early — don't wait for checks to pass first.

## CodeRabbit Gotchas

### CodeRabbit Doesn't Review
If CodeRabbit doesn't post a review, auto-merge hangs forever (it's a required check).

**Fix:** Comment on the PR:
```bash
gh pr comment <number> --body "@coderabbitai review"
```

### Unresolved Threads Block Merge
Use the `resolve_review_threads` MCP tool for batch resolution, or GraphQL:
```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<id>"}) { thread { isResolved } } }'
```

## Format Failures

Agents consistently produce prettier violations. CI format check runs against the ENTIRE codebase, not just PR changes.

**Fix from inside the worktree:**
```bash
cd <worktree-path> && npx prettier --write $(git diff --name-only --diff-filter=ACMR) && cd /Users/kj/dev/automaker
```

**Never run prettier from outside the worktree** — config resolution differences cause false passes.

## Pre-Existing Format Violations

One violation on main blocks EVERY PR. If format CI fails on code not in the PR, fix main first.

## After Merging Shared Package PRs

```bash
npm run build:packages
```

Stale `dist/` after types changes causes downstream PRs to fail with wrong type references.

## Large PRs = Review Bottleneck

Keep PRs under 200 lines. Use Graphite stacking for epic workflows.