# Git Workflow Settings

Configuration for automatic git operations after agent feature completion. These settings control the commit, push, PR creation, merge, and hook behavior for the entire post-execution git pipeline.

Settings are resolved in priority order: **per-feature override** > **per-project** (`.automaker/settings.json`) > **global** (`data/settings.json`).

## Where to configure

- **UI:** Settings > Git Workflow Defaults
- **Per-project:** `.automaker/settings.json` under `workflow.gitWorkflow`
- **Per-feature:** `feature.gitWorkflow` (set via MCP `update_feature_git_settings`)
- **Global:** `data/settings.json` under `gitWorkflow`

## Settings Reference

### Automation

| Setting        | Type    | Default | Description                                           |
| -------------- | ------- | ------- | ----------------------------------------------------- |
| `autoCommit`   | boolean | `true`  | Commit agent changes when feature completes           |
| `autoPush`     | boolean | `true`  | Push to remote after commit. Requires `autoCommit`    |
| `autoCreatePR` | boolean | `true`  | Create a PR after push. Requires `autoPush`           |
| `autoMergePR`  | boolean | `true`  | Auto-merge PR after creation. Requires `autoCreatePR` |
| `waitForCI`    | boolean | `true`  | Wait for CI checks to pass before merging             |
| `skipGitHooks` | boolean | `true`  | Bypass Husky/commitlint/lint-staged on agent commits  |

Settings form a dependency chain: `autoCommit` > `autoPush` > `autoCreatePR` > `autoMergePR`. Disabling an upstream setting implicitly disables all downstream settings.

### Pull Request

| Setting             | Type   | Default    | Description                                              |
| ------------------- | ------ | ---------- | -------------------------------------------------------- |
| `prBaseBranch`      | string | `"dev"`    | Target branch for PR creation                            |
| `prMergeStrategy`   | string | `"squash"` | How PRs are merged: `merge`, `squash`, or `rebase`       |
| `maxPRLinesChanged` | number | `500`      | Flag PR as oversized above this line count. `0` disables |
| `maxPRFilesTouched` | number | `20`       | Flag PR as oversized above this file count. `0` disables |

### Staging

| Setting              | Type     | Default | Description                                                        |
| -------------------- | -------- | ------- | ------------------------------------------------------------------ |
| `excludeFromStaging` | string[] | `[]`    | Directories to exclude from `git add`                              |
| `softChecks`         | string[] | `[]`    | CI check names that don't block merge (case-insensitive substring) |

## skipGitHooks

By default, agent commits bypass all git hooks using `--no-verify` and `HUSKY=0`. This prevents:

- `commitlint` rejecting agent-generated commit messages
- `lint-staged` reverting all staged changes on linting failure
- Slow pre-commit hooks blocking the agent pipeline

Set `skipGitHooks: false` when you want agent commits to run through your local hooks. Use cases:

- **Local CI with `act`** -- pre-push hooks run GitHub Actions locally before code reaches the remote
- **Custom pre-commit checks** -- security scanning, secret detection, or formatting enforcement
- **Strict quality gates** -- ensure every commit (human or agent) passes the same checks

```json
{
  "gitWorkflow": {
    "skipGitHooks": false
  }
}
```

**Warning:** `lint-staged` (the default Husky pre-commit hook) reverts ALL staged changes when any linter fails. If an agent's code doesn't pass linting, the entire commit is lost. Only disable `skipGitHooks` if your hooks are fast and reliable.

## Example configurations

### Minimal (commit only, no PR)

```json
{
  "gitWorkflow": {
    "autoCommit": true,
    "autoPush": false
  }
}
```

### Full pipeline with local hooks

```json
{
  "gitWorkflow": {
    "autoCommit": true,
    "autoPush": true,
    "autoCreatePR": true,
    "autoMergePR": true,
    "waitForCI": true,
    "skipGitHooks": false,
    "prBaseBranch": "dev",
    "prMergeStrategy": "squash"
  }
}
```

### Read-only audit (no git operations)

```json
{
  "gitWorkflow": {
    "autoCommit": false,
    "autoPush": false,
    "autoCreatePR": false
  }
}
```

## Per-feature overrides

Override any setting on a single feature without changing global defaults:

```bash
# Via MCP
update_feature_git_settings --projectPath /path --featureId <id> --autoMergePR false
```

Per-feature overrides are stored in `feature.json` under the `gitWorkflow` key and take highest priority during resolution.
