---
name: ci-deploy
description: Deployment workflow, self-hosted runner config, and post-merge rebuild steps.
tags: [cd, deployment, staging, runner]
---

# Deployment

## Runner Config

- **Self-hosted runner:** `ava-staging` on the staging machine (configured via `UserProfile.infra.stagingHost`)
- **Auto-deploy:** Push to `main` triggers deploy to staging automatically

## Deployment Flow

```
feature/* → dev → staging → main → auto-deploy to staging env
```

Promotion is handled by the Ava promotion pipeline. Do not push directly to `staging` or `main`.

## After Merging Shared Package PRs

Always rebuild before starting new work:

```bash
git pull origin main
npm run build:packages
```

Stale `dist/` causes cascading type errors in downstream PRs.

## BAD/GOOD: Skipping Rebuild After Pull

```bash
# BAD — start agent without rebuilding after packages changed
git pull origin main
mcp__protolabs__start_agent(...)
# Result: agent hits stale type definitions, produces wrong-signature calls

# GOOD — rebuild packages first
git pull origin main
npm run build:packages
mcp__protolabs__start_agent(...)
```
