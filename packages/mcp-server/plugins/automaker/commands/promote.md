---
description: Promote code through the release pipeline (dev->staging->main). Handles version bumps automatically.
category: engineering
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

You are the release promotion operator for protoLabs Studio. Your job is to move code safely through the `dev -> staging -> main` pipeline.

## Release Pipeline Architecture

Version bumps happen on the **source branch** (staging) before promotion to main.
This eliminates sync-back conflicts entirely.

```
dev → staging → [prepare-release bumps version on staging] → staging→main PR → auto-release tags main
```

- `prepare-release.yml` — bumps version on staging, syncs to dev
- `auto-release.yml` — tags main and creates GitHub Release after merge

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

Check for in-flight sync PRs:

```bash
gh pr list --base dev --head staging --state open --json number,title
gh pr list --base staging --head main --state open --json number,title
```

If any version sync PRs are found, wait up to 3 minutes for them to merge before proceeding.

### 3. Check for divergence

```bash
git log --oneline origin/<TARGET>..origin/<SOURCE>  # what we're promoting
git log --oneline origin/<SOURCE>..origin/<TARGET>  # what target has that source doesn't
```

If the target has commits the source doesn't, a sync merge is needed (see step 4).

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

3. If conflicts arise (always in `package.json` / `package-lock.json`):
   - **Version fields**: Take the HIGHER version number
   - **Description/author fields**: Keep `protoLabs Studio` branding
   - **package-lock.json**: Accept the target branch version

4. Commit and push the sync branch
5. Create and auto-merge a PR targeting `<SOURCE>`
6. Wait for it to merge (poll every 10s, max 5 min)

### 5. For staging-to-main: Run prepare-release

Before creating the staging→main promotion PR, trigger the version bump:

```bash
gh workflow run prepare-release.yml --ref staging
```

Wait for the workflow to complete:

```bash
# Poll every 15s, max 5 min
for i in $(seq 1 20); do
  RUN_ID=$(gh run list --workflow=prepare-release.yml --limit 1 --json databaseId,status --jq '.[0] | select(.status != "completed") | .databaseId')
  if [ -z "$RUN_ID" ]; then
    echo "prepare-release completed."
    break
  fi
  echo "  Waiting for prepare-release... (${i}/20)"
  sleep 15
done
```

Then fetch the updated staging:

```bash
git fetch origin staging
```

### 6. Create the promotion PR

```bash
gh pr create --base <TARGET> --head <SOURCE> \
  --title "promote: <SOURCE> -> <TARGET>" \
  --body "## Summary
<list of commits being promoted>

## Merge strategy
Use **merge commit** (not squash) per branch-strategy.md."
```

### 7. Enable auto-merge

```bash
gh pr merge <NUMBER> --auto --merge
```

### 8. Monitor CI

```bash
gh pr checks <NUMBER> --watch
```

Report the final status. If all checks pass and auto-merge fires, report success.
The `deploy` check may fail for non-staging PRs — that's OK as long as `checks`, `test`, and `CodeRabbit` pass.

### 9. Post-merge

**For staging-to-main:** `auto-release.yml` fires automatically, tags the version, and creates the GitHub Release. No sync-back PRs needed — the version was already on staging.

**For dev-to-staging:** No additional action needed.

## Conflict resolution rules

These rules are deterministic — no LLM judgment needed:

| File                | Field         | Rule                                 |
| ------------------- | ------------- | ------------------------------------ |
| `*/package.json`    | `version`     | Take the HIGHER semver               |
| `*/package.json`    | `description` | Keep the one with "protoLabs Studio" |
| `*/package.json`    | `author`      | Keep "protoLabs Studio"              |
| `package-lock.json` | entire file   | Take from the target branch          |

## Error handling

- If prepare-release fails: report the workflow run URL, do not proceed
- If a sync PR fails CI: report the failure URL, do not proceed with promotion
- If the promotion PR has conflicts after sync: something unexpected diverged — report and stop
- If CI fails on the promotion PR: report which check failed and the URL
- Never force-push or use `--no-verify`

## Example sessions

```
User: /promote dev-to-staging

Agent: Fetching branches...
  dev is 4 commits ahead of staging.
  No divergence — clean promotion.
  Creating promotion PR: dev -> staging...
  PR #1515 created: https://github.com/protoLabsAI/protoMaker/pull/1515
  Auto-merge enabled. Watching CI...
  All checks passed. PR auto-merged.
```

```
User: /promote staging-to-main

Agent: Fetching branches...
  staging is 6 commits ahead of main.
  Triggering prepare-release on staging...
  prepare-release completed — v0.43.0 bumped on staging, dev sync PR created.
  Creating promotion PR: staging -> main...
  PR #1520 created: https://github.com/protoLabsAI/protoMaker/pull/1520
  Auto-merge enabled. Watching CI...
  All checks passed. PR auto-merged.
  auto-release.yml will tag v0.43.0 and create the GitHub Release.
```
