---
title: Branch Strategy
description: Single-trunk flow — feature branches merge directly into main
---

# Branch Strategy

protoLabs uses a **single-trunk flow**. Feature branches merge directly into `main`. Every commit on `main` is a release candidate.

## The Model

```
feature/* ──▶ main ──────────────────────────────────── (stable trunk)
                       Tagged + released on merge
                       Auto-deploys to production
```

## Branch Rules

| Branch       | Purpose                                                | Who can push    | PR required | Deploy        |
| ------------ | ------------------------------------------------------ | --------------- | ----------- | ------------- |
| `main`       | Stable trunk — every merge is a release candidate      | Nobody directly | Yes         | Auto on merge |
| `feature/*`  | Active feature work — short-lived, target `main`       | Anyone          | n/a         | None          |
| `fix/*`      | Bug fixes — short-lived, target `main`                 | Anyone          | n/a         | None          |
| `docs/*`     | Documentation-only changes                             | Anyone          | n/a         | None          |
| `refactor/*` | Code restructuring — short-lived, target `main`        | Anyone          | n/a         | None          |
| `epic/*`     | Epic integration branches — short-lived, target `main` | Anyone          | n/a         | None          |

## Flow in Practice

1. Cut a short-lived branch from `main` (`feature/*`, `fix/*`, `docs/*`, `refactor/*`).
2. Push and open a PR targeting `main`.
3. CI runs the full check suite. CodeRabbit reviews.
4. On approval and green CI, squash-merge (or merge-commit for epics).
5. The auto-release workflow tags and publishes a release on push to `main`.

Agent-generated PRs always target `main`. `DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch` is `'main'`.

## Epic Workflow

For larger features grouped under an epic, use a hierarchical PR structure:

```
main
  ↑
epic/foundation ────────── Epic PR (targets main, merge commit)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch, squash)
```

1. Create `epic/<name>` from `main` with an initial commit.
2. Cut feature branches from the epic branch and PR back into it (squash).
3. When all features land, open an epic PR from `epic/<name>` → `main` (merge commit).

## Merge Strategy

| PR type                | Strategy         | Why                             |
| ---------------------- | ---------------- | ------------------------------- |
| `feature/*` → `main`   | squash           | Branch is discarded after merge |
| `fix/*` → `main`       | squash           | Branch is discarded after merge |
| `feature/*` → `epic/*` | squash           | Branch is discarded after merge |
| `epic/*` → `main`      | **merge commit** | Preserves epic history          |

## Branch Protection (GitHub)

**`main`**

- Require PR before merging
- Require status checks: `build`, `test`, `checks`, `CodeRabbit`
- No direct push — even admins

## Agent Configuration

The `prBaseBranch` default in `DEFAULT_GIT_WORKFLOW_SETTINGS` is `'main'`. All agent-generated PRs target `main` automatically.

To override per project (e.g., a fork targeting a different trunk):

```json
{
  "gitWorkflow": {
    "prBaseBranch": "trunk"
  }
}
```

## Common Questions

**Can I push directly to `main`?**
No. Open a PR even for one-line fixes. The required CI gates protect the trunk.

**What about hotfixes?**
Cut a `fix/*` branch from `main`, PR back into `main`. There is no separate hotfix channel — the trunk is the only release branch.

**Why no `dev` or `staging` branch?**
We tried `feature/* → dev → staging → main`. It added merge debt without catching real issues. CI plus auto-deploy from `main` is faster and produces fewer broken-promotion incidents.
