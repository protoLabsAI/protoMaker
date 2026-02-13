# Development Guide

Guide for extending and contributing to the ProtoLab setup system.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Adding New Gap Checks](#adding-new-gap-checks)
3. [Adding New Template Files](#adding-new-template-files)
4. [Testing Locally](#testing-locally)
5. [Publishing New Versions](#publishing-new-versions)
6. [Debugging Setup Issues](#debugging-setup-issues)
7. [Common Patterns](#common-patterns)

---

## Architecture Overview

### Setup Pipeline

The ProtoLab setup follows this pipeline:

1. Validation Phase
   - Check prerequisites (git, CLIs)
   - Verify project path exists
   - Confirm directory is writable

2. Initialization Phase
   - Initialize git repository (if needed)
   - Initialize Beads issue tracker
   - Initialize Automaker structure

3. Plugin Phase
   - Configure Claude Code plugin
   - Install/update Automaker plugin

4. CI/CD Phase (Optional)
   - Detect existing CI/CD setup
   - Create GitHub Actions workflows
   - Configure branch protection

### Key Components

**Validation**

- Location: scripts/setup-protolab.sh (lines ~60-130)
- Checks: git, Claude CLI, Beads CLI, jq, Automaker server
- Exit codes: E001-E008

**Initialization**

- Beads: scripts/setup-protolab.sh (lines ~150-200)
- Automaker: via API call to /api/setup/project
- Exit codes: E009-E012

**Plugin Setup**

- Location: scripts/setup-protolab.sh (lines ~220-260)
- Uses: claude plugin commands
- Exit codes: E013-E015

**CI/CD Setup**

- Location: scripts/setup-ci-cd.sh (separate file)
- Uses: gh CLI commands
- Exit codes: E016-E018

---

## Adding New Gap Checks

Gap checks validate that required tools and configurations are in place.

### 1. Add Check to Validation Phase

Edit scripts/setup-protolab.sh:

```bash
# After existing checks, add new check
log_section "Step 1: Validating Prerequisites"

# ... existing checks ...

# NEW CHECK: Check for Docker (example)
if ! command -v docker &> /dev/null; then
  log_error "Docker is not installed"
  log_info "Install from: https://docker.com"
  exit 1
fi
log_success "Docker is installed"
```

### 2. Define Error Code

Add to error code reference (lines ~2-20):

```bash
# Error Codes:
# E001: Not a git repository
# E020: Docker not installed  # NEW
```

### 3. Update Documentation

Add to docs/ERROR-CATALOG.md with error code, root causes, and fixes.

Add to docs/TROUBLESHOOTING.md with platform-specific solutions.

### 4. Test the Check

```bash
# Temporarily uninstall tool to test error
sudo rm $(which docker)

# Run setup and verify error is displayed correctly
./scripts/setup-protolab.sh /path/to/project

# Reinstall tool
brew install docker  # or appropriate command
```

---

## Adding New Template Files

Template files are created in .automaker/ and .beads/ directories during setup.

### 1. Beads Templates

Beads templates are initialized via bd init command - handled by Beads CLI itself.

To customize Beads behavior:

```bash
# In project directory after setup
cd /path/to/project

# Create custom Beads configuration
cat > .beads/config.json << 'CONFIG'
{
  "prefix": "project-name",
  "database": ".beads/db.json"
}
CONFIG

# Verify
bd list
```

### 2. Automaker Templates

Automaker templates are created by the server API call. To add new templates:

Location: Automaker server repository

Edit apps/server/src/routes/setup.ts:

```typescript
// Add new template files
const newTemplate = {
  path: '.automaker/custom-config.json',
  content: JSON.stringify(
    {
      // Your configuration
    },
    null,
    2
  ),
};

filesCreated.push(newTemplate);
```

### 3. Git Templates

To add Git hooks or workflow templates:

```bash
# Add to git template directory
mkdir -p /path/to/project/.git/hooks

cat > /path/to/project/.git/hooks/pre-commit << 'HOOK'
#!/bin/bash
# Pre-commit hook
npm run lint
HOOK

chmod +x /path/to/project/.git/hooks/pre-commit
```

### 4. GitHub Actions Templates

Add workflow files to .github/workflows/:

```bash
mkdir -p .github/workflows

cat > .github/workflows/ci.yml << 'WORKFLOW'
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22
      - run: npm install
      - run: npm test
WORKFLOW
```

---

## Testing Locally

### 1. Manual Test

Test setup on a temporary directory:

```bash
# Create test project
mkdir -p /tmp/test-project
cd /tmp/test-project
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Run setup from automaker repo
/path/to/automaker/scripts/setup-protolab.sh .

# Verify setup
ls -la .beads/
ls -la .automaker/
cd .automaker && ls -la
```

### 2. Integration Tests

Test against live Automaker server:

```bash
# Start server
cd /path/to/automaker
npm run dev &
SERVER_PID=$!

# Wait for startup
sleep 5

# Test setup
TEST_DIR="/tmp/setup-integration-test"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
git init
/path/to/automaker/scripts/setup-protolab.sh . --yes

# Verify Automaker integration
curl -s http://localhost:3008/api/health | jq -e '.status == "ok"'

# Cleanup
rm -rf "$TEST_DIR"
kill $SERVER_PID
```

### 3. Test Different Platforms

macOS:

```bash
bash ./scripts/setup-protolab.sh /test/path
zsh ./scripts/setup-protolab.sh /test/path
```

Linux:

```bash
docker run -it ubuntu:22.04 bash -c "
  apt-get update && apt-get install -y git nodejs npm jq
  ./scripts/setup-protolab.sh /test/path
"
```

Windows (WSL2):

```bash
wsl bash ./scripts/setup-protolab.sh ~/test/path
```

---

## Publishing New Versions

### 1. Update Version Number

Edit package.json in repository root:

```json
{
  "version": "0.14.0",
  "name": "automaker"
}
```

Also update in scripts/setup-protolab.sh:

```bash
SETUP_VERSION="0.14.0"
```

### 2. Update Changelog

Create/update CHANGELOG.md:

```markdown
# Changelog

## [0.14.0] - 2024-02-12

### Added

- New gap check for Docker
- Support for custom Beads configuration

### Fixed

- Fixed path resolution on Windows
- Fixed plugin installation

### Changed

- Increased default timeout to 30 seconds
```

### 3. Update Documentation

Update version references in all markdown files:

```bash
sed -i 's/v0.13.0/v0.14.0/g' packages/create-protolab/README.md
sed -i 's/0.13.0/0.14.0/g' packages/create-protolab/docs/*.md
```

### 4. Tag Release

```bash
git tag -a v0.14.0 -m "Release v0.14.0"
git push origin v0.14.0
```

---

## Debugging Setup Issues

### 1. Enable Debug Mode

Add set -x to see all commands:

```bash
DEBUG=true ./scripts/setup-protolab.sh /path/to/project
```

### 2. Check Logs

```bash
tail -f ~/.beads/logs/latest.log
tail -f ~/.automaker/logs/*.log
dmesg | tail -20
```

### 3. Manual API Testing

Test individual API calls:

```bash
curl -v http://localhost:3008/api/health

curl -X POST http://localhost:3008/api/setup/project \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project"}' | jq '.'
```

### 4. Conditional Execution

Only run if not already done:

```bash
if [ ! -d "$PROJECT_PATH/.beads" ]; then
  log_info "Initializing Beads..."
  # initialization code
  log_success "Beads initialized"
fi
```

### 5. User Confirmation

Ask user before proceeding:

```bash
read -p "Continue with CI/CD setup? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  # proceed
fi
```

---

## Common Patterns

### Logging Functions

```bash
log_info "This is informational"
log_success "Operation completed"
log_warning "Something to watch out for"
log_error "Something went wrong"
log_section "Major phase starting"
```

### Error Handling

```bash
if ! command_name; then
  log_error "Command failed"
  exit 1
fi

# Or use set -e
set -e
command1
command2  # Won't run if command1 fails
```

### JSON Response Handling

```bash
RESPONSE=$(curl -s -X POST http://endpoint -d '{}')

if echo "$RESPONSE" | jq -e '.success' &> /dev/null; then
  log_success "Success"
  echo "$RESPONSE" | jq -r '.filesCreated[]'
else
  log_error "Failed"
  echo "$RESPONSE" | jq -r '.error'
  exit 1
fi
```

### Path Resolution

```bash
if [[ "$PROJECT_PATH" != /* ]]; then
  PROJECT_PATH="$(pwd)/$PROJECT_PATH"
fi

if [ ! -d "$PROJECT_PATH" ]; then
  log_error "Directory does not exist: $PROJECT_PATH"
  exit 1
fi
```

---

## Contributing Guidelines

### Code Style

- Use log\_\* functions for all output
- Add comments for complex logic
- Keep lines under 80 characters
- Use consistent indentation (2 spaces)

### Testing Requirements

Before submitting PR:

1. Test on multiple platforms (macOS, Linux, Windows)
2. Test with different shell versions (bash 4.x, 5.x, zsh)
3. Test edge cases (no internet, slow connection, permission issues)
4. Update documentation if behavior changes
5. Add error code if new failure mode

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass on multiple platforms
- [ ] Documentation is updated
- [ ] Error codes documented in ERROR-CATALOG.md
- [ ] Examples added if new functionality
- [ ] CHANGELOG.md updated

---

## Resources

- Bash Best Practices: https://mywiki.wooledge.org/BashGuide
- jq Documentation: https://stedolan.github.io/jq/manual/
- curl Documentation: https://curl.se/docs/
- gh CLI Documentation: https://cli.github.com/manual/
- Beads Documentation: https://github.com/jlowin/beads
