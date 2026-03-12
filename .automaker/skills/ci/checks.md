---
name: ci-checks
description: Required CI checks, common failure causes, and fixes. Use when a build, test, format, audit, or CodeRabbit check fails.
tags: [ci, github-actions, format, build, test, audit]
---

# CI Checks

## Required Checks

- **build** — TypeScript compilation
- **test** — Vitest / Playwright suite
- **format** — Prettier check against entire codebase
- **audit** — npm vulnerability scan
- **CodeRabbit** — automated code review (required; PR hangs if it never posts)

## Common CI Failures

| Failure | Cause | Fix |
|---------|-------|-----|
| format | Prettier violations | `npx prettier --write <file> --ignore-path /dev/null` |
| build | TypeScript errors | Fix types, run `npm run build:packages` |
| test | Failing tests | Run `npm run test:server` locally first |
| audit | npm vulnerabilities | `npm audit fix` or add to allowlist |
| CodeRabbit | No review posted | Comment `@coderabbitai review` on the PR |

## BAD/GOOD: Format Check

```bash
# BAD — commit without formatting
git commit -m "feat: add new handler"
# Result: CI fails with "Check failed: format"

# GOOD — format staged files before committing
git diff --name-only --cached | xargs npx prettier --write --ignore-unknown
git add <formatted-files>
git commit -m "feat: add new handler"
```

## BAD/GOOD: Stale Packages After Types Change

```bash
# BAD — start new work without rebuilding after a types PR merges
git pull origin main
# (skip rebuild)
npm run build:server
# Result: TS errors referencing missing or wrong types

# GOOD — always rebuild packages after pulling
git pull origin main
npm run build:packages
npm run build:server
```

## Format Check Scope

CI format check runs against the **entire codebase**, not just PR changes. One pre-existing violation on main blocks every PR.

If format CI fails on code not in your PR:
1. Create a separate format-fix PR for main, or
2. Include the fix in your current PR (adds noise but unblocks)
