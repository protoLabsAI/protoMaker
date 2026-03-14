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

| Workflow                      | Trigger                        | Purpose                                        |
| ----------------------------- | ------------------------------ | ---------------------------------------------- |
| `deploy-staging.yml`          | Push to `staging`              | Deploy to staging environment                  |
| `deploy-main.yml`             | Push to `main`                 | Deploy to protolabs production (CT 104)        |
| `promotion-check-staging.yml` | PR to `staging`                | Fails if source ≠ `dev` or `promote/*`         |
| `promotion-check.yml`         | PR to `main`                   | Fails if source ≠ `staging`                    |
| `changeset-release.yml`       | Push to `main`                 | Version bump + GitHub Release                  |
| `pr-check.yml`                | PR to `dev`, `staging`, `main` | Build check (Electron build on env-branch PRs) |
| `test.yml`                    | PR/push to any branch          | Run server + package tests                     |
| `checks.yml`                  | PR/push to any branch          | Lint, format, audit                            |

### Branch protection (GitHub)

**`main`**

- Require PR before merging (no approvals required — CI-only gate for solo dev)
- Require status checks: `build`, `test`, `checks`, `source-branch` (promotion-check), `CodeRabbit`
- No direct push — even admins

**`staging`**

- Require PR before merging
- Require status checks: `build`, `test`, `checks`, `source-branch` (promotion-check-staging), `CodeRabbit`
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

## Promotion Merge Strategy

The merge strategy depends on the target branch:

| Promotion           | Strategy            | Why                                  |
| ------------------- | ------------------- | ------------------------------------ |
| `feature/*` → `dev` | squash ✅           | Branch is discarded after merge      |
| `dev` → `staging`   | **merge commit** ✅ | Preserves DAG — staging lives on     |
| `staging` → `main`  | **merge commit** ✅ | Preserves DAG — no back-merge needed |

### Why merge commits for all promotions

Squash merges create a synthetic commit (S) with no DAG parent on the source branch. The next promotion sees S as a new diff relative to the old common ancestor and produces conflicts.

```
# Squash (BREAKS next promotion):
dev:     A → B → C → D
                       ← squash → staging: A → S   (S has no parent on dev)
dev:     A → B → C → D → E → F
                       ← merge: finds A as base, sees S vs B+C+D+E+F → CONFLICT

# Merge commit (CORRECT):
dev:     A → B → C → D
                       ← merge commit → staging: A → B → C → D → M1
dev:     A → B → C → D → E → F
                       ← merge: finds D as base, sees only E+F → CLEAN
```

The same logic applies to `staging → main`. The `non_fast_forward` branch protection rule has been removed from `main`, so merge commits are now allowed for all promotions.

## Promotion Commands

```bash
# Promote dev → staging
gh pr create --base staging --head dev --title "chore: promote dev → staging"
gh pr merge <number> --auto --merge

# Promote staging → main
gh pr create --base main --head staging \
  --template .github/PULL_REQUEST_TEMPLATE/promote-to-main.md
gh pr merge <number> --auto --merge
```

## Common Questions

**Can I push a hotfix directly to staging or main?**
No. Hotfixes should be cut from `dev`, merged to `dev`, then promoted through the normal flow. For true emergencies, request an admin bypass (and document why).

**What about the Changesets version bump PR?**
The `changeset-release.yml` creates a version bump PR that targets `main` using the GitHub Actions bot token. This is a known exception — the bot is a trusted actor and the PR goes through the same required status checks.

**What if dev → staging shows conflicts?**
A previous promotion used `--squash`. To recover: create a new branch from `dev`, `git merge origin/staging` (take `--ours` for all conflicts), push, open a new PR with `--merge`.

**What if staging → main shows conflicts?**
A previous promotion used `--squash`. To recover: create a new branch from `staging`, `git merge origin/main` (take `--ours` for all conflicts), use `chore/promote-staging-main-*` naming (allowed by `promotion-check.yml`), open a new PR with `--merge`.
