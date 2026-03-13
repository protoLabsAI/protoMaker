---
name: ci-pr-workflow
description: PR auto-merge setup, CodeRabbit management, post-agent checklist, and large PR guidance.
tags: [pr, github, coderabbit, auto-merge]
---

# PR Workflow

## Auto-Merge

```bash
gh pr merge <number> --auto --squash
```

Set auto-merge early — don't wait for checks to pass first. It waits for all required checks then merges automatically.

## CodeRabbit

### CodeRabbit Doesn't Post a Review

Auto-merge hangs forever when CodeRabbit never posts (it's a required check).

**Fix:**

```bash
gh pr comment <number> --body "@coderabbitai review"
```

### Unresolved Threads Block Merge

Use the `resolve_review_threads` MCP tool for batch resolution, or GraphQL directly:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<PRRT_id>"}) { thread { isResolved } } }'
```

Note: use `reviewThreads` (PRRT_ IDs), not `comments` (PRRC_ IDs). Only PRRT_ IDs work with `resolveReviewThread`.

## BAD/GOOD: Waiting Before Setting Auto-Merge

```bash
# BAD — wait for all checks to pass, then set auto-merge
# (checks take 5+ minutes; if you're away, PR sits idle after passing)
gh pr merge <number> --auto --squash   # set too late

# GOOD — set auto-merge immediately after creating the PR
gh pr create --base dev --title "..."
gh pr merge <number> --auto --squash   # set right away
```

## BAD/GOOD: Missing CodeRabbit Trigger

```bash
# BAD — PR created, auto-merge set, walk away
# CodeRabbit never posts → auto-merge hangs indefinitely

# GOOD — check after 2 minutes; trigger if not posted
gh pr view <number> --json reviews
gh pr comment <number> --body "@coderabbitai review"
```

## Post-Agent Checklist

Run after every agent completion or turn-limit hit:

1. **Check for uncommitted work:**

   ```bash
   git -C <worktree-path> status --short
   ```

   If uncommitted changes exist, review the diff — this work is lost if the worktree is cleaned up.

2. **Format and commit** if agent left work uncommitted:

   ```bash
   git -C <worktree-path> add <specific-files>
   git -C <worktree-path> commit -m "feat: <description>"
   git -C <worktree-path> push -u origin <branch-name>
   gh pr create --base dev ...
   ```

3. **Enable auto-merge:** `gh pr merge <number> --auto --squash`

4. **Trigger CodeRabbit** if missing: `gh pr comment <number> --body "@coderabbitai review"`

5. **Resolve CodeRabbit threads** via `resolve_review_threads` MCP tool before merge.

Prefer delegating steps 2–5 to the **PR Maintainer** agent. Routine pipeline work (auto-merge, thread resolution, format fixes) is handled by PR Maintainer every 10 minutes — only intervene manually for complex failures requiring strategic judgment.

## Large PRs

Keep PRs under 200 lines. Large PRs create review bottlenecks.
