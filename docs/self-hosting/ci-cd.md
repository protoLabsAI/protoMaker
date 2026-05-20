# CI/CD Pipelines

protoLabs uses GitHub Actions for continuous integration and delivery. CI runs on every PR targeting `main` and on every push to `main`. Releases are tagged automatically on merge.

## Workflows Overview

| Workflow           | Trigger                  | Runner      | Purpose                      |
| ------------------ | ------------------------ | ----------- | ---------------------------- |
| `checks.yml`       | PR, push to main, weekly | self-hosted | Format, lint, audit          |
| `test.yml`         | PR, push to main         | self-hosted | Unit tests                   |
| `e2e-tests.yml`    | Push to main, manual     | self-hosted | End-to-end tests             |
| `pr-check.yml`     | PR, push to main         | self-hosted | Build verification           |
| `auto-release.yml` | Push to main             | self-hosted | Version tag + GitHub Release |
| `deploy-docs.yml`  | Push to main             | self-hosted | Publish VitePress docs site  |

> **Note:** Format checking, linting, and security audit are consolidated into `checks.yml`. There is no separate `format-check.yml` or `security-audit.yml`.

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
    branches: [main]

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

      # Start backend on a test port
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
    branches: [main]

jobs:
  build:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: npm run build
        env:
          NODE_OPTIONS: '--max-old-space-size=4096'
```

### What It Validates

- TypeScript compilation
- Missing imports and type errors
- Build process completes successfully

## Auto Release (`auto-release.yml`)

Automatically tags a release and publishes a GitHub Release on every push to `main`.

### Release Flow

```
PR merged to main
    ↓
auto-release.yml
    ├── derive version from package.json
    ├── git tag vX.Y.Z → pushed via GH_PAT
    ├── gh release create vX.Y.Z
    └── (optional) Rewrite release notes via Claude and post to Discord #dev
```

### Token Requirement

`auto-release.yml` uses `secrets.GH_PAT` (falls back to `GITHUB_TOKEN`) for the checkout and tag push. A PAT is required because GitHub's loop-prevention policy blocks `GITHUB_TOKEN`-triggered pushes from firing downstream workflow runs.

## Release Notes Rewriting

An LLM-powered release notes rewriter transforms raw conventional commits into polished, user-facing release notes. Available as both a reusable prompt template (`libs/prompts/src/release-notes.ts`) and a standalone CLI script (`scripts/rewrite-release-notes.mjs`).

### How It Works

1. Fetches commits between two git tags via `git log`
2. Filters out merge, chore, and promote commits
3. Sends the remaining commits to Claude (Haiku 4.5) with a system prompt enforcing brand voice
4. Returns themed, grouped release notes in plain markdown
5. Optionally posts to Discord #dev as an embed

### CLI Usage

```bash
# Auto-detect latest two tags
node scripts/rewrite-release-notes.mjs

# Specify versions
node scripts/rewrite-release-notes.mjs v0.30.1 v0.29.0

# Preview prompt without calling API
node scripts/rewrite-release-notes.mjs --dry-run

# Generate and post to Discord
node scripts/rewrite-release-notes.mjs --post-discord
```

### CI Integration

Wired into `auto-release.yml` as the "Rewrite and post release notes to Discord" step. Runs after the GitHub Release is created, auto-detects the previous tag, and posts the rewritten notes as a Discord embed.

### Requirements

- `ANTHROPIC_API_KEY` — required for Claude API calls
- Git tags must exist locally (`git fetch origin --tags` if needed)

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
- **Squash-only merges**: Yes (epic PRs use merge commits)
- **Admin bypass**: Enabled
- **Branches do NOT need to be up-to-date**: `strict_required_status_checks_policy` is `false` — PRs can merge without rebasing onto the latest main. This eliminates the cascade problem where each merge forces all other PRs to update and re-run CI.

IaC source of truth: `scripts/infra/rulesets/main.json`

## Secrets

| Secret              | Purpose                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `GITHUB_TOKEN`      | Auto-provided, used for releases                                           |
| `GH_PAT`            | PAT for `auto-release.yml` tag push (enables downstream workflow triggers) |
| `ANTHROPIC_API_KEY` | LLM release notes rewriting (Haiku 4.5)                                    |

## Self-Hosted Runner Capabilities

The self-hosted runner has access to resources that GitHub-hosted runners don't:

| Capability                 | What It Enables                                          |
| -------------------------- | -------------------------------------------------------- |
| Claude CLI (authenticated) | AI-assisted tasks, release notes rewriting               |
| Anthropic API key          | Agent execution, code analysis                           |
| protoLabs MCP server       | Board updates, feature status, agent orchestration       |
| Docker (host)              | Production deploys, integration tests against real infra |
| gh CLI (authenticated)     | PR creation, issue management, release publishing        |
| Large memory / CPU         | Full E2E test suites, parallel builds                    |

## Local CI Simulation

Run CI checks locally before pushing:

```bash
# Checks (format + lint + audit)
npm run format:check && npm run lint && npm audit --audit-level=critical

# Tests
npm run test:packages && npm run test:server

# Build check
npm run build
```
