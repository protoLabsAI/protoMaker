# CI/CD Setup Guide for ProtoLab

Complete guide for setting up GitHub Actions CI/CD and branch protection for ProtoLab projects.

## Quick Start

### Automatic Setup (Recommended)

**During initial setup:**

```bash
npm run setup-lab -- /path/to/project
# Prompted at the end for CI/CD setup
```

**Standalone CI/CD setup:**

```bash
npm run setup-ci -- /path/to/project
```

### Manual Setup

For complete control, manually configure workflows and branch protection using this guide.

---

## What Gets Created

### GitHub Actions Workflows

**Location**: `.github/workflows/`

**1. pr-check.yml** (Build Check)

- Triggers: PRs and pushes to main
- Runs project build
- Fast feedback on build issues

**2. test.yml** (Test Suite)

- Triggers: PRs and pushes to main
- Runs all test suites
- Reports coverage (optional)

**3. format-check.yml** (Lint/Format)

- Triggers: PRs and pushes to main
- Runs linter
- Enforces code style

**4. security-audit.yml** (Security)

- Triggers: PRs and pushes to main
- Runs npm/pnpm audit
- Reports vulnerabilities

### Branch Protection Rules

**For main branch:**

- ❌ No direct pushes
- ✅ PRs required
- ✅ All CI checks must pass
- ✅ Squash merge only
- ✅ Auto-delete branches after merge
- ✅ Linear history required

---

## Intelligent Detection

The setup script automatically detects:

### Package Manager

- pnpm (from `pnpm-lock.yaml`)
- yarn (from `yarn.lock`)
- bun (from `bun.lockb`)
- npm (default/fallback)

### Available Scripts

Checks `package.json` for:

- `build` - Build workflow enabled
- `test` - Test workflow enabled
- `lint` - Format check enabled
- Other test variants (`test:e2e`, `test:int`, etc.)

### Existing CI Setup

- Detects `.github/workflows/` directory
- Lists existing workflow files
- Offers three options:
  1. **Keep existing** - No changes
  2. **Enhance** - Add missing workflows
  3. **Replace** - Overwrite all workflows

---

## Usage Scenarios

### Scenario 1: New Project (No CI)

```bash
npm run setup-ci -- /path/to/new-project
```

**Result:**

- Creates all 4 workflows
- Configured for detected package manager
- Only includes workflows for available scripts
- Optionally sets up branch protection

### Scenario 2: Existing CI (Enhance)

```bash
npm run setup-ci -- /path/to/existing-project
```

**Prompt:**

```
Existing CI/CD setup detected!

Found workflows:
  - build.yml
  - test.yml

Options:
  1) Keep existing workflows (skip)
  2) Add missing workflows (enhance)
  3) Replace all workflows (overwrite)

Choose an option (1-3):
```

**Choose 2** to add `format-check.yml` and `security-audit.yml`

### Scenario 3: Existing CI (Replace)

**Warning**: This overwrites existing workflows!

**Choose 3** to standardize on ProtoLab workflows

---

## Branch Protection Setup

### Requirements

1. **GitHub CLI** installed

   ```bash
   brew install gh
   gh auth login
   ```

2. **Admin access** to repository

3. **GitHub remote** configured
   ```bash
   git remote -v
   # Should show github.com URL
   ```

### What Gets Configured

**Pull Request Rules:**

- Required before merge
- Conversation resolution required
- Squash merge enforced

**Status Checks:**

- `build` (from pr-check.yml)
- `test` (from test.yml)
- `format` (from format-check.yml)
- `audit` (from security-audit.yml)

**Additional:**

- Linear history required
- No branch deletion
- No force pushes
- Admin bypass with PR only

### Manual Configuration

If automatic setup fails, configure via GitHub UI:

1. Go to **Settings → Rules → Rulesets**
2. Click **New ruleset → New branch ruleset**
3. Configure:
   - **Name**: Protect main
   - **Target branches**: `main`
   - **Bypass list**: Repository admins (pull_request mode)
   - **Rules**: Add all from template below

**Template**: See `scripts/infra/rulesets/main.json` in automaker

---

## Workflow Details

### pr-check.yml

```yaml
name: PR Build Check

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm' # Auto-detected
      - run: pnpm install
      - run: pnpm run build
```

**Customization:**

- Node version (default: 22)
- Cache type (auto-detected)
- Build command (default: `build`)

### test.yml

```yaml
name: Test Suite

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
        env:
          NODE_ENV: test
```

**Customization:**

- Add coverage reporting
- Split test types (unit, integration, e2e)
- Add matrix strategy for multiple Node versions

### format-check.yml

```yaml
name: Format Check

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main]

jobs:
  format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm run lint
```

**Customization:**

- Use `format:check` instead of `lint`
- Add ESLint/Prettier-specific options
- Add auto-fix on push to main

### security-audit.yml

```yaml
name: Security Audit

on:
  pull_request:
    branches: ['*']
  push:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm audit --audit-level=moderate || true
```

**Customization:**

- Change audit level (low, moderate, high, critical)
- Fail on vulnerabilities (remove `|| true`)
- Add Snyk or other security scanning

---

## Testing Your Setup

### 1. Test Workflows

```bash
# Create a test branch
git checkout -b test/ci-setup

# Make a trivial change
echo "# Test" >> README.md
git add README.md
git commit -m "test: verify CI setup"

# Push and create PR
git push -u origin test/ci-setup
gh pr create --title "Test: Verify CI setup" --body "Testing CI workflows"
```

**Expected:**

- ✅ All 4 checks start automatically
- ✅ Build check passes
- ✅ Test check passes (if tests exist)
- ✅ Format check passes
- ✅ Audit check passes

### 2. Test Branch Protection

**Test 1: Direct push (should fail)**

```bash
git checkout main
echo "test" >> README.md
git commit -am "test: direct push"
git push
# Expected: Error - direct push blocked
```

**Test 2: PR without checks (should block)**

```bash
git checkout -b test/incomplete
# Break something intentionally
git push -u origin test/incomplete
gh pr create
# Expected: Merge button disabled until checks pass
```

**Test 3: PR with passing checks (should allow)**

```bash
git checkout -b test/complete
# Make valid change
git push -u origin test/complete
gh pr create
# Wait for checks
gh pr merge --squash --delete-branch
# Expected: Merge succeeds, branch deleted
```

---

## Troubleshooting

### Workflows Not Running

**Symptom**: No checks appear on PR

**Fixes:**

1. Verify workflows are in `.github/workflows/`
2. Check workflow syntax: `gh workflow list`
3. View workflow runs: `gh run list`
4. Check repository settings → Actions → enabled

### Branch Protection Not Working

**Symptom**: Can still push to main

**Fixes:**

1. Verify ruleset exists: `gh api repos/OWNER/REPO/rulesets`
2. Check enforcement is "active"
3. Verify you're not an admin (or use PR anyway)
4. Check bypass actors list

### Package Manager Mismatch

**Symptom**: Workflow uses wrong package manager

**Fix:**
Edit workflow files to use correct package manager:

```yaml
cache: 'pnpm' # or 'yarn', 'npm'
```

### Node Version Issues

**Symptom**: Build fails with Node version error

**Fix:**
Update Node version in all workflows:

```yaml
node-version: '22' # or your version
```

---

## Best Practices

### 1. Keep Workflows Fast

- Cache dependencies
- Run tests in parallel
- Skip non-critical checks on draft PRs

### 2. Fail Fast

- Run cheapest checks first (lint before tests)
- Exit early on critical failures
- Use matrix strategies sparingly

### 3. Clear Feedback

- Use descriptive workflow names
- Add comments to complex steps
- Annotate failures with context

### 4. Security

- Never commit secrets to workflows
- Use GitHub secrets for sensitive values
- Keep dependencies updated

### 5. Maintenance

- Review failed workflows promptly
- Update Node/package manager versions
- Prune unused workflows

---

## Advanced Configuration

### Matrix Testing

Test multiple Node versions:

```yaml
strategy:
  matrix:
    node-version: [20, 22]
```

### Conditional Jobs

Skip tests on documentation changes:

```yaml
jobs:
  test:
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
```

### Caching

Advanced caching for faster builds:

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ~/.pnpm-store
      node_modules
    key: ${{ runner.os }}-deps-${{ hashFiles('**/pnpm-lock.yaml') }}
```

### Custom Actions

Create reusable actions:

```yaml
- uses: ./.github/actions/setup-project
  with:
    check-lockfile: 'true'
```

---

## Integration with Automaker

### Feature Development

When creating features that modify CI:

1. Create feature with CI changes
2. Agent creates PR with workflow updates
3. Workflows run on PR
4. Branch protection enforces all checks

### Auto-Mode

Auto-mode respects CI:

- Creates PRs only after local verification
- Waits for CI checks before reporting success
- Handles CI failures with retries
- Creates follow-up features for persistent failures

---

## Migration Guide

### From Travis CI

1. Back up `.travis.yml`
2. Run setup-ci script
3. Disable Travis CI in settings
4. Test workflows
5. Delete `.travis.yml`

### From CircleCI

1. Back up `.circleci/config.yml`
2. Run setup-ci script
3. Disable CircleCI integration
4. Test workflows
5. Delete `.circleci/`

### From No CI

Just run:

```bash
npm run setup-ci -- /path/to/project
```

---

## Reference

- **Automaker Workflows**: `.github/workflows/` in automaker repo
- **Branch Protection**: `scripts/infra/rulesets/main.json`
- **GitHub Actions Docs**: https://docs.github.com/actions
- **GitHub Rulesets API**: https://docs.github.com/rest/repos/rules

---

**Questions or issues?** Open an issue at https://github.com/proto-labs-ai/automaker
