---
name: ci-branch-protection
description: Branch protection ruleset config and direct commit restrictions for main.
tags: [branch-protection, github, ci, direct-commit]
---

# Branch Protection

## Ruleset

Single consolidated ruleset "Protect main" (ID 12552305):

- **Required checks:** build, test, format, audit, CodeRabbit
- **Squash-only** merges (no merge commits, no rebase)
- **Admin bypass** enabled — but `git push origin main` still fails
- **Thread resolution required** — all CodeRabbit comments must be resolved before merge
- **Strict status checks disabled** — PRs don't need to be up-to-date with main to merge

Source of truth: `scripts/infra/rulesets/main.json`

## Direct Commits to Main

Branch protection blocks `git push origin main` even with admin bypass. Always use PRs.

If you must commit to main directly for a critical hotfix:

1. Run `npm run format` first (CI won't run for direct pushes)
2. Verify with `npm run build:packages && npm run build:server`
3. Consider creating a PR instead — auto-merge + thread resolution is the fastest path

## BAD/GOOD: Attempting Direct Push to Main

```bash
# BAD — try to push directly to main
git push origin main
# Result: "remote: error: GH013: Repository rule violations found"
# Push rejected even with admin token

# GOOD — always use a PR
git push origin my-branch
gh pr create --base main --title "fix: critical hotfix"
gh pr merge <number> --auto --squash
```

## BAD/GOOD: Forgetting Thread Resolution

```bash
# BAD — enable auto-merge but leave CodeRabbit threads open
gh pr merge <number> --auto --squash
# Result: PR passes CI but hangs on "Required review threads resolved" check

# GOOD — resolve threads before or alongside auto-merge
mcp__protolabs__resolve_review_threads({ prNumber: <number>, projectPath: "..." })
gh pr merge <number> --auto --squash
```
