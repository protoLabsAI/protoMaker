# GitHub Infrastructure as Code

This directory contains infrastructure-as-code scripts and configuration for GitHub repository settings and branch protection.

## Overview

The infrastructure management follows a declarative approach using GitHub API and JSON ruleset definitions:

- **Repository Settings**: Merge strategies, branch deletion, auto-merge
- **Branch Protection**: Main branch protection via rulesets API
- **CI/CD Requirements**: Required status checks from GitHub Actions

## Quick Start

### Prerequisites

1. Install GitHub CLI:

   ```bash
   # macOS
   brew install gh

   # Linux
   sudo apt install gh

   # Or from https://cli.github.com/
   ```

2. Authenticate:
   ```bash
   gh auth login
   ```

### Apply Settings

Run the idempotent settings script:

```bash
./scripts/infra/github-settings.sh
```

This script will:

1. Verify prerequisites (gh CLI, authentication)
2. Apply repository-level merge settings
3. Create or update the main branch ruleset
4. Verify settings were applied correctly

## Repository Settings

The following settings are applied at the repository level:

| Setting                  | Value   | Purpose                                     |
| ------------------------ | ------- | ------------------------------------------- |
| `allow_merge_commit`     | `false` | Prevent merge commits (keep linear history) |
| `allow_rebase_merge`     | `false` | Prevent rebase merges (avoid confusion)     |
| `allow_squash_merge`     | `true`  | Allow squash merges (clean history)         |
| `delete_branch_on_merge` | `true`  | Auto-delete branches after PR merge         |
| `allow_auto_merge`       | `true`  | Enable auto-merge for approved PRs          |

## Branch Protection Ruleset

The main branch is protected by a comprehensive ruleset defined in `rulesets/main.json`.

### Protection Rules

#### Pull Request Requirements

- **1 approving review** required before merge
- **Dismiss stale reviews on push** - new commits invalidate approvals
- **Require conversation resolution** - all PR comments must be resolved
- **No last-push approval required** - approver can be the last committer

#### Required Status Checks

The following CI jobs must pass before merge:

- `build` - PR Build Check (pr-check.yml)
- `test` - Test Suite (test.yml)
- `format` - Format Check (format-check.yml)
- `audit` - Security Audit (security-audit.yml)

**Note**: E2E tests (`e2e`) are NOT required yet - they will be promoted to required status once proven stable.

#### Additional Protections

- **Linear history required** - no merge commits (enforces squash-only)
- **Branch deletion protection** - prevents accidental deletion of main
- **Force push protection** - prevents force pushes

#### Bypass Actors

Repository admins can bypass all protections when necessary:

- Actor: `RepositoryRole` (ID: 5)
- Bypass mode: `always`

## CI Workflows

### Required Workflows

| Workflow             | Job      | Triggers                  | Purpose                       |
| -------------------- | -------- | ------------------------- | ----------------------------- |
| `pr-check.yml`       | `build`  | PRs, push to main         | Electron build verification   |
| `test.yml`           | `test`   | PRs, push to main         | Package and server tests      |
| `format-check.yml`   | `format` | PRs, push to main         | Code formatting validation    |
| `security-audit.yml` | `audit`  | PRs, push to main, weekly | npm audit for vulnerabilities |

### Optional Workflows

| Workflow        | Job     | Status       | Notes                                           |
| --------------- | ------- | ------------ | ----------------------------------------------- |
| `e2e-tests.yml` | `e2e`   | Optional     | Not yet required - will be promoted when stable |
| `release.yml`   | `build` | Release-only | Runs on release publish, not for PRs            |

### Removed Workflows

- `claude.yml` - Deleted (using CodeRabbit for code review instead)

## Modifying Settings

### Update Repository Settings

Edit the settings in `github-settings.sh` and re-run:

```bash
./scripts/infra/github-settings.sh
```

### Update Branch Protection

1. Edit `rulesets/main.json` with your changes
2. Run the settings script:
   ```bash
   ./scripts/infra/github-settings.sh
   ```

The script will automatically detect the existing ruleset and update it.

### Add Required Status Checks

To add a new required CI job:

1. Ensure the CI workflow is working and reliable
2. Edit `rulesets/main.json`:
   ```json
   {
     "type": "required_status_checks",
     "parameters": {
       "required_status_checks": [
         {
           "context": "new-job-name",
           "integration_id": 15368
         }
       ]
     }
   }
   ```
3. Apply the changes:
   ```bash
   ./scripts/infra/github-settings.sh
   ```

**Important**: The `integration_id` (15368) is the GitHub Actions app ID - this should remain constant.

### Promote E2E Tests to Required

When ready to require E2E tests:

1. Verify E2E tests are stable (passing consistently)
2. Add to `rulesets/main.json`:
   ```json
   {
     "context": "e2e",
     "integration_id": 15368
   }
   ```
3. Apply changes

## Graphite Integration

The repository supports Graphite for stacked PRs with epics:

```
main
  ↑
epic/foundation ──────────── Epic PR (targets main)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch)
```

### Strict Status Checks with Graphite

The ruleset uses `strict_required_status_checks_policy: true`, which means:

- PRs must be up-to-date with the base branch before merging
- When base branch changes, Graphite will automatically trigger re-checks
- This may cause cascade re-checks in stacked PRs

Monitor this behavior and adjust if it causes excessive CI runs.

## Troubleshooting

### CI Not Running

If CI workflows don't trigger on a test PR:

1. Check Actions are enabled:

   ```bash
   gh api repos/:owner/:repo --jq '.has_issues'
   ```

2. Verify workflows are valid:

   ```bash
   gh workflow list
   ```

3. Check workflow run history:
   ```bash
   gh run list --limit 5
   ```

### Script Fails with Authentication Error

```bash
gh auth status
gh auth login --web
```

### Ruleset Update Fails

The API returns a 404 when trying to update a ruleset that doesn't exist, or 422 if the JSON is invalid.

1. Check existing rulesets:

   ```bash
   gh api repos/:owner/:repo/rulesets --jq '.[] | {id, name}'
   ```

2. Validate JSON syntax:

   ```bash
   jq empty rulesets/main.json
   ```

3. Check API response for details:
   ```bash
   gh api repos/:owner/:repo/rulesets/12467930 --method PUT --input rulesets/main.json
   ```

## References

- [GitHub Branch Protection API](https://docs.github.com/en/rest/repos/rules)
- [GitHub Rulesets Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Graphite Documentation](https://docs.graphite.dev/)
