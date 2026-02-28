# CI/CD Pipelines

protoLabs uses GitHub Actions for continuous integration and delivery. All workflows run on a self-hosted runner (`ava-staging`) with access to Claude CLI, Docker, and the staging environment.

## Workflows Overview

| Workflow                 | Trigger                   | Runner      | Purpose                             |
| ------------------------ | ------------------------- | ----------- | ----------------------------------- |
| `checks.yml`             | PR, push to main, weekly  | self-hosted | Format, lint, audit                 |
| `test.yml`               | PR, push to main          | self-hosted | Unit tests                          |
| `e2e-tests.yml`          | Push to main, manual      | self-hosted | End-to-end tests                    |
| `pr-check.yml`           | PR, push to main          | self-hosted | Build verification                  |
| `deploy-staging.yml`     | Push to staging, manual   | self-hosted | Auto-deploy staging environment     |
| `deploy-main.yml`        | Push to main, manual      | self-hosted | Auto-deploy production environment  |
| `auto-release.yml`       | staging→main PR merged    | self-hosted | Version bump + tag + GitHub Release |
| `build-electron.yml`     | `v*` tag push             | matrix      | Multi-platform Electron builds      |
| `generate-changelog.yml` | Release published, manual | self-hosted | AI changelog generation             |
| `linear-sync.yml`        | PR merged to main         | self-hosted | Linear issue sync                   |

> **Note:** There are no separate `format-check.yml` or `security-audit.yml` workflows. Format checking, linting, and security audit are consolidated into `checks.yml`.

## Checks (`checks.yml`)

Consolidates format checking, linting, and security auditing into a single workflow.

```yaml
name: Checks

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main]
  schedule:
    - cron: '0 9 * * 1' # Weekly on Mondays (security audit)

jobs:
  checks:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
        with:
          check-lockfile: 'true'
          skip-native-rebuild: 'true'
      - run: npm run format:check
      - run: npm run lint:ui
      - run: npm run lint:server
      - run: npm audit --audit-level=critical
```

### What It Checks

- `npm run format:check` — Prettier formatting across entire codebase
- `npm run lint:ui` — ESLint for UI code
- `npm run lint:server` — Import safety linting for server
- `npm audit --audit-level=critical` — Fails only on critical vulnerabilities

### Fixing Issues

```bash
npm run format       # Auto-fix formatting
npm run lint -- --fix # Auto-fix lint issues
npm audit            # Check all vulnerabilities
```

## Test Suite (`test.yml`)

Runs unit tests for all packages.

```yaml
name: Test Suite

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main, master]

jobs:
  test:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
        with:
          check-lockfile: 'true'
          rebuild-node-pty-path: 'apps/server'
      - run: npm run test:packages
      - run: npm run test:server:coverage
```

### What It Tests

- `npm run test:packages` — Tests for all `libs/*` packages
- `npm run test:server:coverage` — Server tests with coverage report

## E2E Tests (`e2e-tests.yml`)

Runs Playwright end-to-end tests. Only triggered on push to main (not on PRs) and via manual dispatch.

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  e2e:
    runs-on: self-hosted
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: npx playwright install --with-deps chromium
      - run: npm run build --workspace=apps/server

      # Start backend on port 3018 (avoids conflict with staging on 3008)
      - run: npm run start --workspace=apps/server &
        env:
          PORT: 3018
          AUTOMAKER_API_KEY: test-api-key-for-e2e-tests
          AUTOMAKER_MOCK_AGENT: 'true'
          IS_CONTAINERIZED: 'true'

      # Wait for health check
      - run: |
          for i in {1..60}; do
            curl -s -f http://localhost:3018/api/health && exit 0
            sleep 1
          done
          exit 1

      # Run tests (Playwright starts Vite automatically via webServer config)
      - run: npm run test --workspace=apps/ui
        env:
          VITE_SERVER_URL: http://localhost:3018
          TEST_PORT: 3017
          TEST_SERVER_PORT: 3018
```

### Test Environment

- `AUTOMAKER_MOCK_AGENT=true` — Uses mock agent instead of real API
- `IS_CONTAINERIZED=true` — Skips sandbox confirmation dialogs
- Port 3018 for server, 3017 for UI (avoids conflict with staging)
- Deterministic API key for reliable login

### Artifacts

On failure, uploads:

- `playwright-report/` — HTML test report
- `test-results/` — Screenshots, traces, videos

## PR Build Check (`pr-check.yml`)

Verifies the project builds successfully.

```yaml
name: PR Build Check

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main, master]

jobs:
  build:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: npm run build:electron:dir
        env:
          NODE_OPTIONS: '--max-old-space-size=4096'
```

### Why Directory Build

`build:electron:dir` creates the unpacked app without packaging:

- Faster than full build
- Still validates the build process
- Catches TypeScript errors, missing imports, etc.

## Auto Release (`auto-release.yml`)

Automatically cuts a version bump and GitHub Release whenever a `staging→main` PR is merged. The resulting `v*` tag triggers `build-electron.yml`.

### Release Flow

```
staging → main PR merged
    ↓
auto-release.yml
    ├── verify GH_PAT is set (warning if absent — Electron build chain won't fire)
    ├── clean stale changesets (find .changeset -name '*.md' ! -name 'README.md' -delete)
    ├── npm run release:prepare  (analyze commits since last tag → bump type)
    ├── npm run changeset:version  (bump @protolabs-ai/* in lockstep, write CHANGELOG)
    ├── git commit "chore: release vX.Y.Z" → pushed to main
    ├── git tag vX.Y.Z → pushed via GH_PAT
    │               ↓
    │       build-electron.yml fires (macOS, Linux, Windows in parallel)
    │       → artifacts uploaded to GitHub Release
    └── sync version bump back to staging and dev
            ├── gh pr create --base staging --head main → auto-merge
            └── gh pr create --base dev --head main → auto-merge
```

### Token Requirement

`auto-release.yml` uses `secrets.GH_PAT` (falls back to `GITHUB_TOKEN`) for the checkout and tag push. A PAT is required because GitHub's loop-prevention policy blocks `GITHUB_TOKEN`-triggered pushes from firing downstream workflow runs — without it, the `v*` tag won't trigger `build-electron.yml`.

The first step in the release job validates that `GH_PAT` is configured and emits a visible warning when it is not. The release proceeds regardless — the version bump and GitHub Release are created — but the Electron build chain requires a PAT.

## Electron Builds (`build-electron.yml`)

Builds the Electron desktop app for all platforms on every `v*` tag push.

| Platform | Runner           | Formats                     |
| -------- | ---------------- | --------------------------- |
| macOS    | `macos-latest`   | `.dmg`, `.zip`              |
| Linux    | `self-hosted`    | `.AppImage`, `.deb`, `.rpm` |
| Windows  | `windows-latest` | `.exe`                      |

Each platform job builds independently, then `upload-release` waits for all three to finish before uploading artifacts to the GitHub Release.

> **Note:** Linux uses `self-hosted` (not `ubuntu-latest`) — GitHub-hosted runner minutes are exhausted for large builds.

## Changelog Generation (`generate-changelog.yml`)

Auto-generates changelogs when a GitHub Release is published.

- Triggered on release publish or manual dispatch
- Runs on self-hosted runner (requires Claude CLI for AI summarization)
- Collects merged PRs since last release via `gh pr list`
- Uses Claude CLI to categorize changes (features, bug fixes, docs, infra)
- Updates `CHANGELOG.md` and the GitHub Release notes
- Script: `scripts/generate-changelog.sh`

### Requirements

- Self-hosted runner with Claude CLI installed and authenticated
- `gh` CLI authenticated with repository access
- `LINEAR_API_TOKEN` for fetching issue context (optional)

## Linear Issue Sync (`linear-sync.yml`)

Automatically syncs Linear issues when PRs merge to main.

- Triggered when a PR is merged into `main`
- Extracts Linear issue identifiers (e.g., `PRO-123`) from PR title, body, or branch name
- Adds a comment to the Linear issue with PR link, merge timestamp, and commit SHA
- Transitions the Linear issue status to "Done"
- Posts a notification to Discord `#deployments` channel

### Requirements

- `LINEAR_API_TOKEN` secret for GraphQL API access
- `DISCORD_DEPLOY_WEBHOOK` secret for Discord notifications

## Deploy Staging (`deploy-staging.yml`)

Auto-deploys to the staging server when code is pushed to the `staging` branch (i.e., when a `dev→staging` PR merges). Staging always runs staging-branch code — **not** main. Includes agent draining, rollback support, and smoke tests.

### Deployment Pipeline

1. **Setup** — Clone/pull repo into persistent deploy directory (`/home/deploy/staging/automaker`)
2. **Disk check** — Require at least 10GB free, prune dangling Docker images
3. **Drain agents** — POST to `/api/deploy/drain` to gracefully stop auto-mode and wait for agents to finish
4. **Tag rollback** — Tag current working Docker images as `rollback` for restore on failure
5. **Build & start** — `./scripts/setup-staging.sh --build && --start`
6. **Verify** — Health check with 15 retries (30s total), docs site check (non-fatal)
7. **Smoke tests** — `./scripts/smoke-test.sh` verifies critical functionality
8. **Rollback** — On failure, restores rollback-tagged images and verifies recovery
9. **Cleanup** — Prune rollback tags and unused images
10. **Notify Discord** — Posts deploy result to `#deployments` via webhook

See [staging-deployment.md](./staging-deployment.md#automated-deploys) for full setup.

## Deploy Production (`deploy-main.yml`)

Auto-deploys to the production server (`/opt/protomaker`) when code is pushed to the `main` branch (i.e., when a `staging→main` PR merges). Includes agent draining, rollback support, and fatal smoke tests.

### Deployment Pipeline

1. **Pull** — `git fetch origin main && git reset --hard origin/main` at `/opt/protomaker`
2. **Disk check** — Require at least 5GB free, prune dangling Docker images
3. **Tag rollback** — Tag current working Docker images (`protomaker-{svc}:rollback`) for restore on failure
4. **Drain agents** — POST to `/api/deploy/drain` to gracefully stop auto-mode and wait for agents to finish
5. **Rebuild** — `docker compose build --no-cache`
6. **Restart** — `docker compose down && docker compose up -d`
7. **Verify** — Health check with 20 retries (60s total)
8. **Smoke tests** — `./scripts/smoke-test.sh` — **fatal**: failure triggers rollback
9. **Rollback** — On verify or smoke failure, restores rollback-tagged images
10. **Cleanup** — Prune rollback tags and unused images
11. **Notify Discord** — Posts deploy result to `#deployments` or `#alerts` via webhook

### Runner

Runs on `[self-hosted, protolabs]` — the production runner inside CT 104 on pve01.

### Secrets

| Secret                   | Purpose                                   |
| ------------------------ | ----------------------------------------- |
| `DISCORD_DEPLOY_WEBHOOK` | Post deploy notifications to #deployments |
| `DISCORD_ALERTS_WEBHOOK` | Post failure alerts to #alerts            |

### Self-Hosted Runner

```bash
# Install runner
./scripts/setup-runner.sh

# Check status
./scripts/setup-runner.sh --status
```

### Secrets

| Secret                   | Purpose                                   |
| ------------------------ | ----------------------------------------- |
| `DISCORD_DEPLOY_WEBHOOK` | Post deploy notifications to #deployments |
| `DISCORD_ALERTS_WEBHOOK` | Post smoke test failures to #alerts       |

## Composite Actions

### `setup-project`

Located at `.github/actions/setup-project/action.yml`:

```yaml
inputs:
  check-lockfile:
    description: Verify lockfile is up to date
    default: 'false'
  rebuild-node-pty-path:
    description: Path to rebuild node-pty (for native modules)
    default: ''
  skip-native-rebuild:
    description: Skip native module rebuild
    default: 'false'

runs:
  using: composite
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - run: npm ci --legacy-peer-deps --force
    - run: npm rebuild node-pty # if rebuild-node-pty-path set
    - run: npm run build:packages
```

## Branch Protection

The `main` branch is protected by a single consolidated ruleset ("Protect main", ID 12552305):

- **Required status checks**: `checks`, `test`, `build`
- **Required reviews**: CodeRabbit
- **Required review thread resolution**: Yes (CodeRabbit comments must be resolved)
- **Squash-only merges**: Yes
- **Admin bypass**: Enabled
- **Branches do NOT need to be up-to-date**: `strict_required_status_checks_policy` is `false` — PRs can merge without rebasing onto the latest main. This eliminates the cascade problem where each merge forces all other PRs to update and re-run CI.

IaC source of truth: `scripts/infra/rulesets/main.json`

## Secrets

| Secret                   | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `GITHUB_TOKEN`           | Auto-provided, used for releases                                           |
| `GH_PAT`                 | PAT for `auto-release.yml` tag push (enables `build-electron.yml` trigger) |
| `DISCORD_DEPLOY_WEBHOOK` | Staging deploy notifications (#deployments)                                |
| `DISCORD_ALERTS_WEBHOOK` | Smoke test failure alerts (#alerts)                                        |
| `LINEAR_API_TOKEN`       | Linear issue sync on PR merge                                              |

## Self-Hosted Runner Capabilities

The `ava-staging` runner has access to resources that GitHub-hosted runners don't:

| Capability                 | What It Enables                                       |
| -------------------------- | ----------------------------------------------------- |
| Claude CLI (authenticated) | AI-assisted changelog generation                      |
| Anthropic API key          | Agent execution, code analysis                        |
| protoLabs MCP server       | Board updates, feature status, agent orchestration    |
| Docker (host)              | Staging deploys, integration tests against real infra |
| gh CLI (authenticated)     | PR creation, issue management, release publishing     |
| 125GB RAM / 24 CPUs        | Full E2E test suites, parallel builds                 |

## Local CI Simulation

Run CI checks locally before pushing:

```bash
# Checks (format + lint + audit)
npm run format:check && npm run lint && npm audit --audit-level=critical

# Tests
npm run test:packages && npm run test:server

# Build check
npm run build:electron:dir
```
