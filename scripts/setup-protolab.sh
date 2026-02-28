#!/usr/bin/env bash
set -e

# ProtoLab Setup Script
# Initializes a project with Beads, Automaker, and Claude Code plugin
#
# Usage:
#   npm run setup-lab -- /path/to/project
#   ./scripts/setup-protolab.sh /path/to/project

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

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
  echo "Usage: npm run setup-lab -- /path/to/project"
  echo "   or: ./scripts/setup-protolab.sh /path/to/project"
  echo ""
  exit 1
fi

# Resolve to absolute path
if [[ "$PROJECT_PATH" != /* ]]; then
  PROJECT_PATH="$(pwd)/$PROJECT_PATH"
fi

log_section "ProtoLab Setup for: $PROJECT_PATH"

# Step 1: Validate prerequisites
log_section "Step 1: Validating Prerequisites"

# Check if path exists
if [ ! -d "$PROJECT_PATH" ]; then
  log_error "Directory does not exist: $PROJECT_PATH"
  exit 1
fi
log_success "Project directory exists"

# Check git
if ! command -v git &> /dev/null; then
  log_error "git is not installed"
  exit 1
fi
log_success "git is installed"

# Check if project is a git repository
if [ ! -d "$PROJECT_PATH/.git" ]; then
  log_warning "Not a git repository. Initializing git..."
  (cd "$PROJECT_PATH" && git init)
  log_success "Git repository initialized"
else
  log_success "Git repository detected"
fi

# Check beads CLI
if ! command -v bd &> /dev/null; then
  log_error "beads CLI (bd) is not installed"
  log_info "Install from: https://github.com/jlowin/beads"
  exit 1
fi
log_success "beads CLI (bd) is installed"

# Check Claude CLI
if ! command -v claude &> /dev/null; then
  log_error "claude CLI is not installed"
  log_info "Install from: https://claude.ai/code"
  exit 1
fi
log_success "claude CLI is installed"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  log_error "jq is not installed"
  log_info "Install from: https://stedolan.github.io/jq/ or your package manager"
  exit 1
fi
log_success "jq is installed"

# Check if Automaker server is running
log_info "Checking if Automaker server is running..."
if ! curl -f -S -s --connect-timeout 2 --max-time 5 http://localhost:3008/api/health &> /dev/null; then
  log_warning "Automaker server is not running"
  log_info "Start it with: npm run dev"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  log_success "Automaker server is running"
fi

# Step 2: Initialize Beads
log_section "Step 2: Initializing Beads"

if [ -d "$PROJECT_PATH/.beads" ]; then
  log_warning "Beads already initialized in this project"
  read -p "Reinitialize? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Reinitializing beads..."
    (cd "$PROJECT_PATH" && bd init --force)
    log_success "Beads reinitialized"
  else
    log_info "Skipping beads initialization"
  fi
else
  log_info "Initializing beads..."
  # Get project name from path
  PROJECT_NAME=$(basename "$PROJECT_PATH")

  # Initialize beads with project name as prefix
  (cd "$PROJECT_PATH" && bd init --prefix "$PROJECT_NAME" --no-daemon)
  log_success "Beads initialized with prefix: $PROJECT_NAME"
fi

# Check beads status
BEAD_COUNT=$(cd "$PROJECT_PATH" && bd list --json 2>/dev/null | jq length 2>/dev/null || echo "0")
log_info "Current beads: $BEAD_COUNT"

# Step 3: Initialize Automaker
log_section "Step 3: Initializing Automaker"

if [ -d "$PROJECT_PATH/.automaker" ]; then
  log_warning "Automaker already initialized in this project"
  read -p "Reinitialize? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Skipping Automaker initialization"
  else
    log_info "Calling setup_lab MCP tool..."
    # Use the MCP tool via API
    RESPONSE=$(curl -f -S -s --connect-timeout 2 --max-time 15 -X POST http://localhost:3008/api/setup/project \
      -H "Content-Type: application/json" \
      -H "X-API-Key: ${AUTOMAKER_API_KEY:-dev-key}" \
      -d "{\"projectPath\": \"$PROJECT_PATH\"}")

    if echo "$RESPONSE" | jq -e '.success' &> /dev/null; then
      log_success "Automaker reinitialized"
      echo "$RESPONSE" | jq -r '.filesCreated[]' | while read -r file; do
        log_success "  $file"
      done
    else
      log_error "Automaker initialization failed"
      echo "$RESPONSE" | jq -r '.error // "Unknown error"'
      exit 1
    fi
  fi
else
  log_info "Calling setup_lab MCP tool..."

  # Use the MCP tool via API
  RESPONSE=$(curl -f -S -s --connect-timeout 2 --max-time 15 -X POST http://localhost:3008/api/setup/project \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${AUTOMAKER_API_KEY:-dev-key}" \
    -d "{\"projectPath\": \"$PROJECT_PATH\"}")

  if echo "$RESPONSE" | jq -e '.success' &> /dev/null; then
    log_success "Automaker initialized"
    echo "$RESPONSE" | jq -r '.filesCreated[]' | while read -r file; do
      log_success "  $file"
    done

    # Check if project was added to settings
    if echo "$RESPONSE" | jq -e '.projectAdded' &> /dev/null; then
      log_success "Project added to Automaker settings"
    else
      log_info "Project already in Automaker settings"
    fi
  else
    log_error "Automaker initialization failed"
    echo "$RESPONSE" | jq -r '.error // "Unknown error"'
    exit 1
  fi
fi

# Step 4: Ensure Automaker plugin is installed
log_section "Step 4: Ensuring Automaker Plugin is Installed"

# Get automaker repo root (parent of scripts/)
AUTOMAKER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_PATH="$AUTOMAKER_ROOT/packages/mcp-server/plugins"

# Check if plugin marketplace is configured
MARKETPLACE_CHECK=$(claude plugin marketplace list 2>&1 || true)
if ! echo "$MARKETPLACE_CHECK" | grep -q "$PLUGIN_PATH"; then
  log_info "Adding Automaker plugin marketplace..."
  claude plugin marketplace add "$PLUGIN_PATH"
  log_success "Plugin marketplace added"
else
  log_success "Plugin marketplace already configured"
fi

# Check if plugin is installed
PLUGIN_LIST=$(claude plugin list 2>&1 || true)
if ! echo "$PLUGIN_LIST" | grep -q "automaker"; then
  log_info "Installing Automaker plugin..."
  claude plugin install automaker
  log_success "Automaker plugin installed"
else
  log_success "Automaker plugin already installed"

  # Check if update is available
  log_info "Checking for plugin updates..."
  UPDATE_OUTPUT=$(claude plugin update automaker 2>&1 || true)
  if echo "$UPDATE_OUTPUT" | grep -q "successfully"; then
    log_success "Plugin updated to latest version"
  else
    log_info "Plugin is up to date"
  fi
fi

# Step 4b: Write plugin .env if not already present
PLUGIN_ENV="$HOME/.claude/plugins/automaker/.env"
PLUGIN_ENV_EXAMPLE="$HOME/.claude/plugins/automaker/.env.example"

if [[ ! -f "$PLUGIN_ENV" ]]; then
  if [[ -f "$PLUGIN_ENV_EXAMPLE" ]]; then
    cp "$PLUGIN_ENV_EXAMPLE" "$PLUGIN_ENV"
    # Inject the absolute repo root as AUTOMAKER_ROOT using portable sed
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^AUTOMAKER_ROOT=.*|AUTOMAKER_ROOT=$AUTOMAKER_ROOT|" "$PLUGIN_ENV"
    else
      sed -i "s|^AUTOMAKER_ROOT=.*|AUTOMAKER_ROOT=$AUTOMAKER_ROOT|" "$PLUGIN_ENV"
    fi
    log_success "Plugin .env written with AUTOMAKER_ROOT=$AUTOMAKER_ROOT"
  else
    log_info "Plugin .env.example not found — writing minimal .env"
    {
      echo "AUTOMAKER_ROOT=$AUTOMAKER_ROOT"
      echo "AUTOMAKER_API_KEY=${AUTOMAKER_API_KEY:-your-dev-key-2026}"
      echo "AUTOMAKER_API_URL=http://localhost:3008"
    } > "$PLUGIN_ENV"
    log_success "Plugin .env written with AUTOMAKER_ROOT=$AUTOMAKER_ROOT"
  fi
else
  log_info "Plugin .env already exists — skipping"
fi

# Step 5: Optional CI/CD Setup
log_section "Step 5: CI/CD Setup (Optional)"

echo ""
echo "Would you like to set up CI/CD workflows and branch protection?"
echo ""
echo "This will:"
echo "  - Detect existing CI/CD setup"
echo "  - Create GitHub Actions workflows (build, test, lint, audit)"
echo "  - Optionally configure branch protection for main"
echo ""
read -p "Set up CI/CD now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  log_info "Running CI/CD setup..."
  "$AUTOMAKER_ROOT/scripts/setup-ci-cd.sh" "$PROJECT_PATH"
else
  log_info "Skipping CI/CD setup"
  log_info "You can run it later with: npm run setup-ci -- $PROJECT_PATH"
fi

# Step 6: Summary
log_section "Setup Complete! 🎉"

echo ""
echo -e "${GREEN}Your ProtoLab is ready:${NC}"
echo ""
echo "  📁 Project: $PROJECT_PATH"
echo ""
echo -e "${BLUE}What was set up:${NC}"
echo "  ✓ Git repository"
echo "  ✓ Beads issue tracker (.beads/)"
echo "  ✓ Automaker structure (.automaker/)"
echo "  ✓ Automaker plugin for Claude Code"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Open Claude Code in the project:"
echo -e "     ${YELLOW}cd $PROJECT_PATH${NC}"
echo ""
echo "  2. Create your first feature:"
echo -e "     ${YELLOW}/board${NC} then create a feature"
echo ""
echo "  3. Create your first bead (task):"
echo -e "     ${YELLOW}cd $PROJECT_PATH && bd create \"My first task\"${NC}"
echo ""
echo "  4. View the board:"
echo -e "     ${YELLOW}/board${NC}"
echo ""
echo "  5. Start auto-mode:"
echo -e "     ${YELLOW}/auto-mode start${NC}"
echo ""
echo -e "${GREEN}Happy building! 🚀${NC}"
echo ""
