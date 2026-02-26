---
title: Branch Strategy
description: Environment-pinned trunk flow — dev, staging, main
---

# Branch Strategy

protoLabs uses a **three-branch, environment-pinned trunk flow**. Each branch maps 1:1 to an environment and a stability tier.

## The Model

```
feature/* ──▶ dev ──────────────────────────────────── (playground)
                │
                │  PR from dev/* or feature/* into dev (CI required)
                │
              staging ──────────────────────────────── (integration / user QA)
                │         Auto-deploys to staging env on push
                │
                │  PR from staging into main (CI + CodeRabbit required)
                │
               main ──────────────────────────────────── (stable release)
                         Tagged on every merge, auto-deploys to protolabs (production)
```

## Branch Rules

| Branch    | Purpose                                             | Who can push    | PR required                 | Deploy                     |
| --------- | --------------------------------------------------- | --------------- | --------------------------- | -------------------------- |
| `main`    | Stable release — every commit is a tagged release   | Nobody directly | Yes — from `staging` only   | Auto → protolabs (CT 104)  |
| `staging` | Integration — user-testable, QA environment         | Nobody directly | Yes — from `dev` or `dev/*` | Auto → staging environment |
| `dev`     | Active development — experimental, agent playground | Josh directly   | Yes for feature branches    | Local only                 |

## Flow in Practice

### Day-to-day development

1. Agent features target `dev` (default `prBaseBranch` is now `dev`)
2. Feature branches (`feature/*`) PR into `dev`
3. `dev` receives continuous agent PRs — never touches `staging` directly

### Promoting to staging (for user testing)

1. Cut a clean PR from `dev` into `staging`
2. CI runs the full test + check suite
3. Merge triggers auto-deploy to the staging environment
4. QA the running build at `https://api.protolabs.studio`

### Promoting to main (stable release)

1. On staging, manually verify all features are stable
2. Open a PR from `staging` → `main` using the `promote-to-main` PR template
3. CI runs — `build`, `test`, `checks`, `source-branch` (promotion-check), and `CodeRabbit` all required
4. **Enforcement**: The `promotion-check` CI job hard-fails any PR to `main` that doesn't originate from `staging`
5. On merge: `deploy-main.yml` auto-deploys to protolabs production (CT 104); Changesets auto-creates a version bump PR

## Enforcement

### Workflows

| Workflow                | Trigger                        | Purpose                                        |
| ----------------------- | ------------------------------ | ---------------------------------------------- |
| `deploy-staging.yml`    | Push to `staging`              | Deploy to staging environment                  |
| `deploy-main.yml`       | Push to `main`                 | Deploy to protolabs production (CT 104)        |
| `promotion-check.yml`   | PR to `main`                   | Fails if source ≠ `staging`                    |
| `changeset-release.yml` | Push to `main`                 | Version bump + GitHub Release                  |
| `pr-check.yml`          | PR to `dev`, `staging`, `main` | Build check (Electron build on env-branch PRs) |
| `test.yml`              | PR/push to any branch          | Run server + package tests                     |
| `checks.yml`            | PR/push to any branch          | Lint, format, audit                            |

### Branch protection (GitHub)

**`main`**

- Require PR before merging (no approvals required — CI-only gate for solo dev)
- Require status checks: `build`, `test`, `checks`, `source-branch` (promotion-check), `CodeRabbit`
- No direct push — even admins

**`staging`**

- Require PR before merging
- Require status checks: `build`, `test`, `checks`, `CodeRabbit`
- Strict mode: dev branch must be up-to-date with staging before merge
- No direct push

**`dev`**

- Require status checks on PRs
- Josh may push directly for emergency fixes

## Agent Configuration

The `prBaseBranch` default in `DEFAULT_GIT_WORKFLOW_SETTINGS` is `'dev'`. This means all agent-generated PRs target `dev` automatically.

If a project needs agents to target a different base, override in project settings:

```json
{
  "gitWorkflow": {
    "prBaseBranch": "dev"
  }
}
```

## Promotion Commands

```bash
# Promote dev → staging
gh pr create --base staging --head dev --title "chore: promote dev to staging" \
  --body "Promoting dev to staging for user testing."

# Promote staging → main (use the template)
gh pr create --base main --head staging \
  --template .github/PULL_REQUEST_TEMPLATE/promote-to-main.md
```

## Common Questions

**Can I push a hotfix directly to staging or main?**
No. Hotfixes should be cut from `dev`, merged to `dev`, then promoted through the normal flow. For true emergencies, request an admin bypass (and document why).

**What about the Changesets version bump PR?**
The `changeset-release.yml` creates a version bump PR that targets `main` using the GitHub Actions bot token. This is a known exception — the bot is a trusted actor and the PR goes through the same required status checks.

**Do I need to rebase dev before promoting?**
Yes — make sure `dev` is up to date with `main` before opening a `dev → staging` PR to avoid drift.

**What if CI fails on the staging promote PR?**
Fix the failure on `dev`, push the fix, then the open PR to `staging` will re-run CI automatically.
