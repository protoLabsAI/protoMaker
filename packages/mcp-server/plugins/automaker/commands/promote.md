---
description: Promote code through the release pipeline (dev->staging->main). Handles version sync conflicts automatically.
argument-hint: [dev-to-staging | staging-to-main]
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Agent
  - WebSearch
---

# /promote — Release Promotion Pipeline

You are the release promotion operator for protoLabs Studio. Your job is to move code safely through the `dev -> staging -> main` pipeline, handling version-sync conflicts that arise from auto-release version bumps.

## Why this skill exists

After every `staging->main` merge, `auto-release.yml` pushes a version bump commit directly to `main` and opens sync-back PRs to staging and dev. If a promotion is attempted before those sync PRs merge, the branches diverge on `package.json` versions and the promotion PR shows merge conflicts. This skill eliminates that problem by checking for and resolving sync gaps before creating the promotion PR.

## Workflow

### 1. Parse the direction

The user specifies a direction:

- `dev-to-staging` (or `dev to staging`, `dev->staging`)
- `staging-to-main` (or `staging to main`, `staging->main`)
- If no direction given, default to `dev-to-staging`

### 2. Pre-flight checks

```bash
git fetch origin dev staging main
```

**Check for in-flight sync PRs from auto-release:**

```bash
gh pr list --base <SOURCE> --head main --state open --json number,title
```

If any are found with title matching `chore: sync * version bump`:

- Wait up to 3 minutes for them to merge (poll every 10s)
- If they merge, proceed
- If they don't merge, warn the user and offer to continue anyway

### 3. Check for divergence

```bash
# Commits on TARGET not in SOURCE (need to be merged into source first)
git log --oneline origin/<TARGET>..origin/<SOURCE>  # what we're promoting
git log --oneline origin/<SOURCE>..origin/<TARGET>  # what target has that source doesn't
```

If the target branch has commits the source branch doesn't (typically version bumps from auto-release), we need a sync merge.

### 4. Sync merge (if needed)

When the target has commits the source doesn't:

1. Create a sync branch from source:

   ```bash
   git checkout -b chore/sync-<TARGET>-into-<SOURCE>-$(date +%s) origin/<SOURCE>
   ```

2. Merge target into it:

   ```bash
   git merge origin/<TARGET>
   ```

3. If conflicts arise (they're always in `package.json` / `package-lock.json`):
   - **Version fields**: Take the HIGHER version number
   - **Description/author fields**: Keep `protoLabs Studio` branding (never `Automaker` or `AutoMaker Team`)
   - **package-lock.json**: Accept the target branch version (`git checkout origin/<TARGET> -- package-lock.json`)

4. Commit and push the sync branch
5. Create a PR targeting `<SOURCE>`:
   ```bash
   gh pr create --base <SOURCE> --head chore/sync-<TARGET>-into-<SOURCE>-... \
     --title "chore: sync <TARGET> version bump into <SOURCE>" \
     --body "Resolves version divergence from auto-release before promotion."
   gh pr merge <NUMBER> --auto --merge
   ```
6. Wait for it to merge (poll every 10s, max 5 min)
7. Clean up the local branch

### 5. Create the promotion PR

```bash
gh pr create --base <TARGET> --head <SOURCE> \
  --title "promote: <SOURCE> -> <TARGET>" \
  --body "## Summary
<list of commits being promoted>

## Merge strategy
Use **merge commit** (not squash) per branch-strategy.md."
```

### 6. Enable auto-merge

```bash
gh pr merge <NUMBER> --auto --merge
```

### 7. Monitor CI

Watch the PR checks:

```bash
gh pr checks <NUMBER> --watch
```

Report the final status. If all checks pass and auto-merge fires, report success. If the `deploy` check fails (expected for non-staging PRs), that's OK as long as `checks`, `test`, and `CodeRabbit` pass.

### 8. If promoting staging->main, wait for auto-release

After the staging->main PR merges:

- `auto-release.yml` fires and creates a new version
- The sync-back PRs will be created automatically
- Report: "Release merged. auto-release.yml will handle versioning and sync-back."

## Conflict resolution rules

These rules are deterministic — no LLM judgment needed:

| File                | Field         | Rule                                 |
| ------------------- | ------------- | ------------------------------------ |
| `*/package.json`    | `version`     | Take the HIGHER semver               |
| `*/package.json`    | `description` | Keep the one with "protoLabs Studio" |
| `*/package.json`    | `author`      | Keep "protoLabs Studio"              |
| `package-lock.json` | entire file   | Take from the target branch          |

## Error handling

- If a sync PR fails CI: report the failure URL, do not proceed with promotion
- If the promotion PR has conflicts after sync: something unexpected diverged — report and stop
- If CI fails on the promotion PR: report which check failed and the URL
- Never force-push or use `--no-verify`

## Example session

```
User: /promote dev-to-staging

Agent: Fetching branches...
  dev is 4 commits ahead of staging.
  staging has 2 commits dev doesn't (auto-release v0.16.1 sync).
  Creating sync branch to merge staging into dev...
  Resolved version conflict: 0.16.0 -> 0.16.1 (kept protoLabs Studio branding).
  Sync PR #1514 created, waiting for CI...
  Sync PR #1514 merged.
  Creating promotion PR: dev -> staging...
  PR #1515 created: https://github.com/proto-labs-ai/protoMaker/pull/1515
  Auto-merge enabled. Watching CI...
  All checks passed. PR auto-merged.
```
