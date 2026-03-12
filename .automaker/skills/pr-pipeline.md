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

Prettier formatting in worktrees is now handled automatically by the server. If a format failure still slips through CI, fix manually: `npx prettier --write <file> --ignore-path /dev/null`.

## Pre-Existing Format Violations

One violation on main blocks EVERY PR. If format CI fails on code not in the PR, fix main first.

## After Merging Shared Package PRs

```bash
npm run build:packages
```

Stale `dist/` after types changes causes downstream PRs to fail with wrong type references.

## Post-Agent Checklist

Run this after every agent completion or turn-limit hit:

1. **Check for uncommitted work first:**

   ```bash
   git -C <worktree-path> status --short
   ```

   If uncommitted changes exist, review the diff — this work is lost if the worktree is cleaned up.

2. **Formatting** is handled automatically by `worktree-recovery-service.ts` and `git-workflow-service.ts`. For manual fixes: `npx prettier --write <file> --ignore-path /dev/null`.

3. **Commit, push, create PR** if the agent left work uncommitted:

   ```bash
   git -C <worktree-path> add <specific-files>
   git -C <worktree-path> commit -m "feat: <description>"
   git -C <worktree-path> push -u origin <branch-name>
   gh pr create --base dev ...
   ```

4. **Enable auto-merge:** `gh pr merge <number> --auto --squash`

5. **Trigger CodeRabbit** if missing: `gh pr comment <number> --body "@coderabbitai review"`

6. **Resolve CodeRabbit threads** via `resolve_review_threads` MCP tool before merge.

Prefer delegating steps 2–6 to the **PR Maintainer** agent.

## Direct Commits to Main

Branch protection blocks `git push origin main` even with admin bypass. Always use PRs.

If you must bypass for a critical hotfix:

1. Run `npm run format` first (CI won't run for direct pushes)
2. Verify with `npm run build:packages && npm run build:server`
3. Create a PR instead — auto-merge + thread resolution is the fastest path

**Runner config:** Self-hosted runner is `ava-staging` (configured via `UserProfile.infra.stagingHost`). Auto-deploy triggers on push to main.

## Large PRs = Review Bottleneck

Keep PRs under 200 lines.

## Crew Loop Automation

Routine PR pipeline work (auto-merge enablement, CodeRabbit thread resolution, format fixes, branch rebasing) is handled by the **PR Maintainer** crew member, which runs every 10 minutes. Only intervene manually for complex failures that require strategic judgment (e.g., TypeScript build errors, conflicting merges, architectural review issues).
