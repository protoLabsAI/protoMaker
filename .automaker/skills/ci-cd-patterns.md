---
name: ci-cd-patterns
emoji: 🚀
description: CI/CD pipeline rules — branch protection, direct commits, format checks, and deployment workflow.
metadata:
  author: agent
  created: 2026-02-12T16:56:52.470Z
  usageCount: 0
  successRate: 0
  tags: [ci, cd, github-actions, deployment, branch-protection]
  source: learned
---

# CI/CD Patterns

Rules and gotchas for the Automaker CI/CD pipeline.

## Branch Protection

Single consolidated ruleset "Protect main" (ID 12552305):
- **Required checks:** build, test, format, audit, CodeRabbit
- **Squash-only** merges
- **Admin bypass** enabled
- **Direct pushes blocked** — even with admin bypass, `git push origin main` fails. Must go through PRs.
- **Strict status checks disabled** — PRs don't need to be up-to-date with main to merge

Source of truth: `scripts/infra/rulesets/main.json`

## Format Check Scope

CI format check runs against the **entire codebase**, not just PR changes. One pre-existing violation on main blocks every PR.

**If format CI fails on code not in your PR:**
1. Create a separate format-fix PR for main
2. Or fix it in your PR (adds noise but unblocks)

## Direct Commits to Main

Admin bypass allows direct pushes BUT branch protection rules still block `git push origin main`.

**If you must commit to main directly:**
1. Run `npm run format` first (CI won't check it)
2. Run `npm run build:packages && npm run build:server` to verify
3. Create a PR instead — auto-merge + thread resolution is fastest

## Deployment

- **Self-hosted runner:** `ava-staging` on staging machine (configured via UserProfile.infra.stagingHost)
- **Auto-deploy:** Push to main triggers deploy to staging
- **Staging URL:** Configured per-instance in settings

## Common CI Failures

| Failure | Cause | Fix |
|---------|-------|-----|
| Format | Prettier violations | `npm run format` in PR branch |
| Build | TypeScript errors | Fix types, rebuild packages |
| Test | Failing tests | Run `npm run test:server` locally |
| Audit | npm vulnerabilities | `npm audit fix` or add to allowlist |
| CodeRabbit | No review posted | Comment `@coderabbitai review` |

## After Merging Shared Packages

Always rebuild before starting new work:
```bash
git pull origin main
npm run build:packages
```

Stale `dist/` causes cascading type errors in downstream PRs.