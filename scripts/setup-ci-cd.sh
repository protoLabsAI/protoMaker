#!/usr/bin/env bash
set -e

# CI/CD Setup Script for ProtoLab
# Detects existing CI setup and optionally adds/enhances GitHub Actions workflows
#
# Usage:
#   ./scripts/setup-ci-cd.sh /path/to/project
#   npm run setup-ci -- /path/to/project

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_section() {
  echo ""
  echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${PURPLE}  $1${NC}"
  echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# Parse arguments
PROJECT_PATH="${1:-}"

if [ -z "$PROJECT_PATH" ]; then
  log_error "Project path is required"
  echo ""
  echo "Usage: npm run setup-ci -- /path/to/project"
  exit 1
fi

# Resolve to absolute path
if [[ "$PROJECT_PATH" != /* ]]; then
  PROJECT_PATH="$(pwd)/$PROJECT_PATH"
fi

log_section "CI/CD Setup for: $PROJECT_PATH"

# Step 1: Detect existing CI setup
log_section "Step 1: Detecting Existing CI/CD Setup"

GITHUB_WORKFLOWS_DIR="$PROJECT_PATH/.github/workflows"
HAS_EXISTING_CI=false
EXISTING_WORKFLOWS=()

if [ -d "$GITHUB_WORKFLOWS_DIR" ]; then
  log_info "Found .github/workflows/ directory"
  HAS_EXISTING_CI=true

  # Find existing workflows
  while IFS= read -r workflow; do
    WORKFLOW_NAME=$(basename "$workflow")
    EXISTING_WORKFLOWS+=("$WORKFLOW_NAME")
    log_info "  - $WORKFLOW_NAME"
  done < <(find "$GITHUB_WORKFLOWS_DIR" -name "*.yml" -o -name "*.yaml")

  if [ ${#EXISTING_WORKFLOWS[@]} -eq 0 ]; then
    log_warning "Directory exists but no workflow files found"
    HAS_EXISTING_CI=false
  fi
else
  log_info "No existing CI/CD setup detected"
fi

# Step 2: Detect package manager and scripts
log_section "Step 2: Analyzing Project Configuration"

PKG_MANAGER="npm"
if [ -f "$PROJECT_PATH/pnpm-lock.yaml" ]; then
  PKG_MANAGER="pnpm"
  log_success "Detected package manager: pnpm"
elif [ -f "$PROJECT_PATH/yarn.lock" ]; then
  PKG_MANAGER="yarn"
  log_success "Detected package manager: yarn"
else
  log_success "Detected package manager: npm (bun not yet supported in workflows)"
fi

# Detect available scripts
HAS_BUILD=false
HAS_TEST=false
HAS_LINT=false
HAS_FORMAT=false

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  log_error "jq is not installed (required for package.json parsing)"
  log_info "Install from: https://stedolan.github.io/jq/ or your package manager"
  exit 1
fi

if [ -f "$PROJECT_PATH/package.json" ]; then
  SCRIPTS=$(jq -r '.scripts | keys[]' "$PROJECT_PATH/package.json" 2>/dev/null || echo "")

  if echo "$SCRIPTS" | grep -q "^build$"; then
    HAS_BUILD=true
    log_success "Found build script"
  fi

  if echo "$SCRIPTS" | grep -qE "^test$|^test:"; then
    HAS_TEST=true
    log_success "Found test script(s)"
  fi

  if echo "$SCRIPTS" | grep -qE "^lint"; then
    HAS_LINT=true
    log_success "Found lint script"
  fi

  if echo "$SCRIPTS" | grep -qE "^format"; then
    HAS_FORMAT=true
    log_success "Found format script"
  fi
fi

# Step 3: Prompt user for action
log_section "Step 3: CI/CD Setup Options"

if [ "$HAS_EXISTING_CI" = true ]; then
  echo -e "${YELLOW}Existing CI/CD setup detected!${NC}"
  echo ""
  echo "Found workflows:"
  for workflow in "${EXISTING_WORKFLOWS[@]}"; do
    echo "  - $workflow"
  done
  echo ""
  echo "Options:"
  echo "  1) Keep existing workflows (skip)"
  echo "  2) Add missing workflows (enhance)"
  echo "  3) Replace all workflows (overwrite)"
  echo ""
  read -p "Choose an option (1-3): " -n 1 -r SETUP_ACTION
  echo ""
else
  echo "No existing CI/CD setup found."
  echo ""
  read -p "Create GitHub Actions workflows? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    SETUP_ACTION="3"
  else
    log_info "Skipping CI/CD setup"
    exit 0
  fi
fi

# Step 4: Create workflows
if [[ "$SETUP_ACTION" != "1" ]]; then
  log_section "Step 4: Creating/Updating Workflows"

  mkdir -p "$GITHUB_WORKFLOWS_DIR"

  # Determine which workflows to create
  CREATE_BUILD=true
  CREATE_TEST=true
  CREATE_FORMAT=true
  CREATE_AUDIT=true

  if [ "$SETUP_ACTION" = "2" ]; then
    # Only create missing workflows
    for workflow in "${EXISTING_WORKFLOWS[@]}"; do
      if [[ "$workflow" =~ build|pr-check ]]; then CREATE_BUILD=false; fi
      if [[ "$workflow" =~ test ]]; then CREATE_TEST=false; fi
      if [[ "$workflow" =~ format|lint ]]; then CREATE_FORMAT=false; fi
      if [[ "$workflow" =~ audit|security ]]; then CREATE_AUDIT=false; fi
    done
  fi

  # Create pr-check.yml (build)
  if [ "$CREATE_BUILD" = true ] && [ "$HAS_BUILD" = true ]; then
    log_info "Creating pr-check.yml (build workflow)..."
    cat > "$GITHUB_WORKFLOWS_DIR/pr-check.yml" <<EOF
name: PR Build Check

on:
  pull_request:
    branches:
      - '*'
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: '$PKG_MANAGER'

      - name: Install dependencies
        run: $PKG_MANAGER install

      - name: Build project
        run: $PKG_MANAGER run build
EOF
    log_success "Created pr-check.yml"
  fi

  # Create test.yml
  if [ "$CREATE_TEST" = true ] && [ "$HAS_TEST" = true ]; then
    log_info "Creating test.yml (test workflow)..."
    cat > "$GITHUB_WORKFLOWS_DIR/test.yml" <<EOF
name: Test Suite

on:
  pull_request:
    branches:
      - '*'
  push:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: '$PKG_MANAGER'

      - name: Install dependencies
        run: $PKG_MANAGER install

      - name: Run tests
        run: $PKG_MANAGER test
        env:
          NODE_ENV: test
EOF
    log_success "Created test.yml"
  fi

  # Create format-check.yml
  if [ "$CREATE_FORMAT" = true ] && { [ "$HAS_LINT" = true ] || [ "$HAS_FORMAT" = true ]; }; then
    # Determine which command to run
    FORMAT_CMD="lint"
    if [ "$HAS_LINT" = true ]; then
      FORMAT_CMD="lint"
    elif [ "$HAS_FORMAT" = true ]; then
      FORMAT_CMD="format:check"
    fi

    log_info "Creating format-check.yml (format/lint workflow)..."
    cat > "$GITHUB_WORKFLOWS_DIR/format-check.yml" <<EOF
name: Format Check

on:
  pull_request:
    branches:
      - '*'
  push:
    branches:
      - main

jobs:
  format:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: '$PKG_MANAGER'

      - name: Install dependencies
        run: $PKG_MANAGER install

      - name: Check formatting
        run: $PKG_MANAGER run $FORMAT_CMD
EOF
    log_success "Created format-check.yml"
  fi

  # Create security-audit.yml
  if [ "$CREATE_AUDIT" = true ]; then
    log_info "Creating security-audit.yml..."
    cat > "$GITHUB_WORKFLOWS_DIR/security-audit.yml" <<EOF
name: Security Audit

on:
  pull_request:
    branches:
      - '*'
  push:
    branches:
      - main

jobs:
  audit:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: '$PKG_MANAGER'

      - name: Run security audit
        run: $PKG_MANAGER audit --audit-level=moderate || true
EOF
    log_success "Created security-audit.yml"
  fi
fi

# Step 5: Branch protection setup
log_section "Step 5: Branch Protection Rules"

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  log_warning "gh CLI not found - cannot configure branch protection"
  log_info "Install gh CLI from: https://cli.github.com"
  log_info "Then manually configure branch protection in GitHub Settings"
else
  # Check if repo has a remote
  if ! git -C "$PROJECT_PATH" remote -v | grep -q "github.com"; then
    log_warning "No GitHub remote found - skipping branch protection"
  else
    REPO_URL=$(git -C "$PROJECT_PATH" remote get-url origin 2>/dev/null || echo "")
    if [[ "$REPO_URL" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
      REPO_OWNER="${BASH_REMATCH[1]}"
      REPO_NAME="${BASH_REMATCH[2]}"

      log_info "Repository: $REPO_OWNER/$REPO_NAME"
      echo ""
      read -p "Configure branch protection for main? (y/n) " -n 1 -r
      echo ""

      if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Build required status checks array based on created workflows
        REQUIRED_CHECKS=""
        [ "$CREATE_BUILD" = true ] && [ "$HAS_BUILD" = true ] && REQUIRED_CHECKS="${REQUIRED_CHECKS}{\"context\": \"build\"},"
        [ "$CREATE_TEST" = true ] && [ "$HAS_TEST" = true ] && REQUIRED_CHECKS="${REQUIRED_CHECKS}{\"context\": \"test\"},"
        { [ "$CREATE_FORMAT" = true ] && { [ "$HAS_LINT" = true ] || [ "$HAS_FORMAT" = true ]; }; } && REQUIRED_CHECKS="${REQUIRED_CHECKS}{\"context\": \"format\"},"
        [ "$CREATE_AUDIT" = true ] && REQUIRED_CHECKS="${REQUIRED_CHECKS}{\"context\": \"audit\"},"
        # Remove trailing comma
        REQUIRED_CHECKS="${REQUIRED_CHECKS%,}"

        # Create ruleset JSON
        RULESET_FILE="/tmp/protolab-ruleset-$$.json"
        cat > "$RULESET_FILE" <<EOF
{
  "name": "Protect main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": true,
        "required_status_checks": [
          $REQUIRED_CHECKS
        ]
      }
    },
    {
      "type": "required_linear_history"
    },
    {
      "type": "deletion"
    },
    {
      "type": "non_fast_forward"
    }
  ],
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "pull_request"
    }
  ]
}
EOF

        log_info "Creating branch protection rule..."
        if gh api "repos/$REPO_OWNER/$REPO_NAME/rulesets" \
          --method POST \
          --input "$RULESET_FILE" &>/dev/null; then
          log_success "Branch protection configured!"
        else
          log_error "Failed to configure branch protection"
          log_info "You may need admin access or can configure manually in Settings"
        fi

        rm -f "$RULESET_FILE"
      else
        log_info "Skipping branch protection setup"
      fi
    fi
  fi
fi

# Summary
log_section "CI/CD Setup Complete! 🎉"

echo ""
echo -e "${GREEN}Summary:${NC}"
echo ""
echo "  📁 Project: $PROJECT_PATH"
echo "  📦 Package Manager: $PKG_MANAGER"
echo ""

if [[ "$SETUP_ACTION" != "1" ]]; then
  echo -e "${BLUE}Workflows created:${NC}"
  [ "$CREATE_BUILD" = true ] && [ "$HAS_BUILD" = true ] && echo "  ✓ pr-check.yml (build)"
  [ "$CREATE_TEST" = true ] && [ "$HAS_TEST" = true ] && echo "  ✓ test.yml (tests)"
  { [ "$CREATE_FORMAT" = true ] && { [ "$HAS_LINT" = true ] || [ "$HAS_FORMAT" = true ]; }; } && echo "  ✓ format-check.yml (format/lint)"
  [ "$CREATE_AUDIT" = true ] && echo "  ✓ security-audit.yml (audit)"
else
  echo -e "${BLUE}No changes made${NC}"
  echo "  - Existing workflows preserved"
fi

echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Review workflows in .github/workflows/"
echo "  2. Push workflows to GitHub"
echo "  3. Create a test PR to verify CI checks"
echo "  4. Verify branch protection rules in Settings"
echo ""
