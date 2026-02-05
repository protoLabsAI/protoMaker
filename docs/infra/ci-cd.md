# CI/CD Pipelines

Automaker uses GitHub Actions for continuous integration and delivery.

## Workflows Overview

| Workflow             | Trigger           | Purpose               |
| -------------------- | ----------------- | --------------------- |
| `test.yml`           | PR, push to main  | Unit tests            |
| `e2e-tests.yml`      | PR, push to main  | End-to-end tests      |
| `pr-check.yml`       | PR, push to main  | Build verification    |
| `format-check.yml`   | PR, push to main  | Code formatting       |
| `security-audit.yml` | PR, push, weekly  | npm audit             |
| `release.yml`        | Release published | Multi-platform builds |

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

| Secret          | Purpose                          |
| --------------- | -------------------------------- |
| `GITHUB_TOKEN`  | Auto-provided, used for releases |
| `CODECOV_TOKEN` | (Optional) Coverage reporting    |

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
