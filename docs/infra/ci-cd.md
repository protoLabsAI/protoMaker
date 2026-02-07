# CI/CD Pipelines

Automaker uses GitHub Actions for continuous integration and delivery.

## Workflows Overview

| Workflow                 | Trigger           | Purpose                 |
| ------------------------ | ----------------- | ----------------------- |
| `test.yml`               | PR, push to main  | Unit tests              |
| `e2e-tests.yml`          | PR, push to main  | End-to-end tests        |
| `pr-check.yml`           | PR, push to main  | Build verification      |
| `format-check.yml`       | PR, push to main  | Code formatting         |
| `security-audit.yml`     | PR, push, weekly  | npm audit               |
| `release.yml`            | Release published | Multi-platform builds   |
| `deploy-staging.yml`     | Push to main      | Auto-deploy staging     |
| `generate-changelog.yml` | Release published | AI changelog generation |
| `linear-sync.yml`        | PR merge to main  | Linear issue sync       |

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
    runs-on: ubuntu-latest
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

- `npm run test:packages` - Tests for all `libs/*` packages
- `npm run test:server:coverage` - Server tests with coverage report

### Setup Action

The `setup-project` composite action:

1. Sets up Node.js 22
2. Caches npm dependencies
3. Installs dependencies
4. Optionally rebuilds native modules (node-pty)

## E2E Tests (`e2e-tests.yml`)

Runs Playwright end-to-end tests.

```yaml
name: E2E Tests

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main, master]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: npx playwright install --with-deps chromium
      - run: npm run build --workspace=apps/server

      # Start backend
      - run: npm run start --workspace=apps/server &
        env:
          AUTOMAKER_API_KEY: test-api-key-for-e2e-tests
          AUTOMAKER_MOCK_AGENT: 'true'
          IS_CONTAINERIZED: 'true'

      # Wait for health check
      - run: |
          for i in {1..60}; do
            curl -s -f http://localhost:3008/api/health && exit 0
            sleep 1
          done
          exit 1

      # Run tests (Playwright starts Vite automatically)
      - run: npm run test --workspace=apps/ui
        env:
          VITE_SERVER_URL: http://localhost:3008

      # Upload artifacts on failure
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/ui/playwright-report/
```

### Test Environment

- `AUTOMAKER_MOCK_AGENT=true` - Uses mock agent instead of real API
- `IS_CONTAINERIZED=true` - Skips sandbox confirmation dialogs
- Deterministic API key for reliable login

### Artifacts

On failure, uploads:

- `playwright-report/` - HTML test report
- `test-results/` - Screenshots, traces, videos

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
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: npm run build:electron:dir # Directory only (faster)
```

### Why Directory Build

`build:electron:dir` creates the unpacked app without packaging:

- Faster than full build
- Still validates the build process
- Catches TypeScript errors, missing imports, etc.

## Format Check (`format-check.yml`)

Ensures code follows Prettier formatting.

```yaml
name: Format Check

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main, master]

jobs:
  format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm install --ignore-scripts --force
      - run: npm run format:check
```

### Fixing Formatting Issues

```bash
npm run format  # Auto-fix
```

## Security Audit (`security-audit.yml`)

Checks for vulnerable dependencies.

```yaml
name: Security Audit

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main, master]
  schedule:
    - cron: '0 9 * * 1' # Weekly on Mondays

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: npm audit --audit-level=critical
```

### Audit Level

Only fails on **critical** vulnerabilities. To check all:

```bash
npm audit
```

## Release Build (`release.yml`)

Builds Electron apps for all platforms when a release is published.

```yaml
name: Release Build

on:
  release:
    types: [published]

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      # Extract version from tag
      - id: version
        run: |
          VERSION="${{ github.event.release.tag_name }}"
          VERSION="${VERSION#v}"
          echo "version=${VERSION}" >> $GITHUB_OUTPUT

      # Update package.json version
      - run: node apps/ui/scripts/update-version.mjs "${{ steps.version.outputs.version }}"

      - uses: ./.github/actions/setup-project

      # Platform-specific builds
      - run: npm run build:electron:mac --workspace=apps/ui
        if: matrix.os == 'macos-latest'
      - run: npm run build:electron:win --workspace=apps/ui
        if: matrix.os == 'windows-latest'
      - run: npm run build:electron:linux --workspace=apps/ui
        if: matrix.os == 'ubuntu-latest'

      # Upload artifacts
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-builds
          path: apps/ui/release/*

  upload:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            artifacts/**/*.dmg
            artifacts/**/*.exe
            artifacts/**/*.AppImage
            artifacts/**/*.deb
            artifacts/**/*.rpm
```

### Release Artifacts

| Platform | Formats                     |
| -------- | --------------------------- |
| macOS    | `.dmg`, `.zip`              |
| Windows  | `.exe`                      |
| Linux    | `.AppImage`, `.deb`, `.rpm` |

### Creating a Release

1. Create and push a tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. Create a GitHub Release from the tag

3. The workflow builds and uploads artifacts

## Changelog Generation (`generate-changelog.yml`)

Auto-generates changelogs when a GitHub Release is published.

```yaml
name: Generate Changelog

on:
  release:
    types: [published]
  workflow_dispatch:

jobs:
  changelog:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: ./scripts/generate-changelog.sh
```

### What It Does

- Triggered automatically when a GitHub Release is published
- Runs on the self-hosted runner (requires Claude CLI for AI summarization)
- Collects all merged PRs since the last release using `gh pr list`
- Uses Claude CLI to generate a categorized changelog with sections for:
  - Features
  - Bug Fixes
  - Documentation
  - Refactoring
  - Infrastructure
- Updates `CHANGELOG.md` in the repository
- Updates the GitHub Release notes with the generated content
- Script location: `scripts/generate-changelog.sh`

### Requirements

- Self-hosted runner with Claude CLI installed and authenticated
- `gh` CLI authenticated with repository access
- `LINEAR_API_TOKEN` for fetching issue context (optional)

## Linear Issue Sync (`linear-sync.yml`)

Automatically syncs Linear issues when PRs merge to main.

```yaml
name: Linear Sync

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  sync:
    if: github.event.pull_request.merged == true
    runs-on: self-hosted
    steps:
      - Parses PRO-NNN from PR title, body, and branch name
      - Adds merge comment to Linear issue via GraphQL API
      - Transitions issue to Done state
      - Posts notification to Discord #deployments
```

### What It Does

- Triggered when a pull request is merged into the `main` branch
- Extracts Linear issue identifiers (e.g., `PRO-123`) from:
  - PR title
  - PR body/description
  - Branch name
- Adds a comment to the Linear issue with:
  - Link to the merged PR
  - Merge timestamp
  - Commit SHA
- Automatically transitions the Linear issue status to "Done"
- Posts a notification to the Discord `#deployments` channel with:
  - Issue identifier and title
  - PR link
  - Merge author

### Requirements

- `LINEAR_API_TOKEN` secret for GraphQL API access
- `DISCORD_DEPLOY_WEBHOOK` secret for Discord notifications
- Linear issue identifier must be present in PR title, body, or branch name

## Deploy Staging (`deploy-staging.yml`)

Auto-deploys to the staging server when code merges to `main`.

```yaml
name: Deploy Staging

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - run: git pull origin main
      - run: ./scripts/setup-staging.sh --build
      - run: ./scripts/setup-staging.sh --start
      - run: curl -sf http://localhost:3008/api/health
      - run: ./scripts/smoke-test.sh
      - run: docker system prune -f --volumes
```

### Self-Hosted Runner

Requires a GitHub Actions runner on the staging machine:

```bash
# Install runner
./scripts/setup-runner.sh

# Check status
./scripts/setup-runner.sh --status
```

See [staging-deployment.md](./staging-deployment.md#automated-deploys) for full setup.

### Deployment Steps

1. **Pull Latest Code**: `git pull origin main`
2. **Build**: Runs `./scripts/setup-staging.sh --build` to rebuild Docker images
3. **Start Services**: Runs `./scripts/setup-staging.sh --start` to restart containers
4. **Health Check**: Verifies `/api/health` endpoint responds
5. **Smoke Tests**: Runs `./scripts/smoke-test.sh` to verify critical functionality
6. **Cleanup**: Prunes unused Docker resources to free disk space

### Smoke Tests

The smoke test script verifies:

- API health endpoint responds
- WebSocket connection succeeds
- MCP server tools are accessible
- Database migrations are applied
- Feature board loads successfully

If smoke tests fail, an alert is posted to Discord `#alerts` channel via `DISCORD_ALERTS_WEBHOOK`.

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

runs:
  using: composite
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'

    - run: npm ci --legacy-peer-deps --force
      shell: bash

    - run: npm rebuild node-pty
      if: inputs.rebuild-node-pty-path != ''
      working-directory: ${{ inputs.rebuild-node-pty-path }}
      shell: bash

    - run: npm run build:packages
      shell: bash
```

## Branch Protection

Recommended branch protection rules for `main`:

- Require status checks:
  - `test`
  - `e2e`
  - `build`
  - `format`
  - `audit`
- Require pull request reviews
- Require branches to be up to date

## Secrets

| Secret                   | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `GITHUB_TOKEN`           | Auto-provided, used for releases            |
| `CODECOV_TOKEN`          | (Optional) Coverage reporting               |
| `DISCORD_DEPLOY_WEBHOOK` | Staging deploy notifications (#deployments) |
| `DISCORD_ALERTS_WEBHOOK` | Smoke test failure alerts (#alerts)         |
| `LINEAR_API_TOKEN`       | Linear issue sync on PR merge               |

## Self-Hosted Runner Capabilities

The `ava-staging` runner has access to resources that GitHub-hosted runners don't:

| Capability                 | What It Enables                                       |
| -------------------------- | ----------------------------------------------------- |
| Claude CLI (authenticated) | AI-assisted PR reviews, changelog generation          |
| Anthropic API key          | Automated code analysis, release notes                |
| Automaker MCP server       | Board updates, feature status, agent orchestration    |
| Docker (host)              | Staging deploys, integration tests against real infra |
| gh CLI (authenticated)     | PR creation, issue management, release publishing     |
| 125GB RAM / 24 CPUs        | Full E2E test suites, parallel builds                 |

### Automation Status

**✅ Implemented:**

- **Release Automation**: Changelog generation via `generate-changelog.yml` using Claude CLI
- **Board Integration**: Linear issue sync via `linear-sync.yml` on PR merge to main
- **Testing**: Post-deploy smoke tests in `deploy-staging.yml` with Discord alerting

**📋 Planned:**

**PR Workflow:**

- Claude-powered PR review on self-hosted (no API key in GH secrets needed)
- Auto-fix formatting/lint issues and push commits
- Dependency update PRs with AI-generated migration notes

**Release Automation:**

- Automated version bumping based on conventional commits
- AI-assisted release notes with feature summaries from Linear context

**Board Integration:**

- Post deploy summaries to Discord with feature lists
- Sync GitHub milestones with Linear project status

**Testing:**

- Run full E2E suite against staging post-deploy
- Performance regression testing with real agent workloads
- Security scanning with Claude code analysis

### Adding New Workflows

Self-hosted workflows use `runs-on: self-hosted` and have access to the host environment.
The runner is at `/home/josh/actions-runner/` with the Automaker repo at `/home/josh/dev/automaker/`.

```yaml
jobs:
  my-job:
    runs-on: self-hosted
    steps:
      - name: Use Claude CLI
        run: claude --version
      - name: Use Automaker MCP
        run: curl -sf http://localhost:3008/api/health
```

## Local CI Simulation

Run CI checks locally before pushing:

```bash
# All tests
npm run test:packages && npm run test:server

# Format check
npm run format:check

# Build check
npm run build:electron:dir

# Security audit
npm audit --audit-level=critical
```
