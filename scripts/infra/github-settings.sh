#!/usr/bin/env bash
#
# GitHub Repository Settings & Branch Protection Script
#
# Applies repository-level settings and branch protection rulesets via GitHub API.
# This script is idempotent and can be run multiple times safely.
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - Ruleset JSON definitions in scripts/infra/rulesets/
#
# Usage:
#   ./scripts/infra/github-settings.sh
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) not found. Install from https://cli.github.com/"
        exit 1
    fi

    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        exit 1
    fi

    log_info "Prerequisites OK"
}

# Get repository information
get_repo_info() {
    REPO_OWNER=$(gh repo view --json owner --jq '.owner.login')
    REPO_NAME=$(gh repo view --json name --jq '.name')
    log_info "Repository: ${REPO_OWNER}/${REPO_NAME}"
}

# Apply repository-level settings
apply_repo_settings() {
    log_info "Applying repository-level settings..."

    gh api \
        --method PATCH \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "/repos/${REPO_OWNER}/${REPO_NAME}" \
        -f allow_merge_commit=false \
        -f allow_rebase_merge=false \
        -f allow_squash_merge=true \
        -f delete_branch_on_merge=true \
        -f allow_auto_merge=true \
        > /dev/null

    log_info "Repository settings updated successfully"
}

# Get or create ruleset for main branch
apply_main_branch_ruleset() {
    log_info "Applying main branch ruleset..."

    local RULESET_FILE="scripts/infra/rulesets/main.json"

    if [[ ! -f "$RULESET_FILE" ]]; then
        log_error "Ruleset file not found: $RULESET_FILE"
        exit 1
    fi

    # Check if ruleset exists (ID: 12467930 mentioned in requirements)
    local EXISTING_RULESET_ID=$(gh api \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "/repos/${REPO_OWNER}/${REPO_NAME}/rulesets" \
        --jq '.[] | select(.name == "Protect main") | .id' 2>/dev/null || echo "")

    if [[ -n "$EXISTING_RULESET_ID" ]]; then
        log_info "Updating existing ruleset (ID: ${EXISTING_RULESET_ID})..."
        gh api \
            --method PUT \
            -H "Accept: application/vnd.github+json" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            "/repos/${REPO_OWNER}/${REPO_NAME}/rulesets/${EXISTING_RULESET_ID}" \
            --input "$RULESET_FILE" \
            > /dev/null
        log_info "Ruleset updated successfully"
    else
        log_info "Creating new ruleset..."
        gh api \
            --method POST \
            -H "Accept: application/vnd.github+json" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            "/repos/${REPO_OWNER}/${REPO_NAME}/rulesets" \
            --input "$RULESET_FILE" \
            > /dev/null
        log_info "Ruleset created successfully"
    fi
}

# Verify settings
verify_settings() {
    log_info "Verifying settings..."

    local SETTINGS=$(gh api \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "/repos/${REPO_OWNER}/${REPO_NAME}" \
        --jq '{allow_merge_commit, allow_rebase_merge, allow_squash_merge, delete_branch_on_merge, allow_auto_merge}')

    echo "$SETTINGS" | jq '.'

    # Check if settings match expectations
    local MERGE_COMMIT=$(echo "$SETTINGS" | jq -r '.allow_merge_commit')
    local REBASE_MERGE=$(echo "$SETTINGS" | jq -r '.allow_rebase_merge')

    if [[ "$MERGE_COMMIT" == "false" ]] && [[ "$REBASE_MERGE" == "false" ]]; then
        log_info "✓ Repository settings verified"
    else
        log_warn "⚠ Repository settings may not have applied correctly"
    fi

    # List rulesets
    log_info "Current rulesets:"
    gh api \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "/repos/${REPO_OWNER}/${REPO_NAME}/rulesets" \
        --jq '.[] | {id, name, enforcement}' | jq -s '.'
}

# Main execution
main() {
    log_info "Starting GitHub settings configuration..."
    echo ""

    check_prerequisites
    get_repo_info
    echo ""

    apply_repo_settings
    echo ""

    apply_main_branch_ruleset
    echo ""

    verify_settings
    echo ""

    log_info "GitHub settings configuration complete!"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Create a test PR to verify all required status checks pass"
    log_info "  2. The ruleset enforces: build, test, format, audit, CodeRabbit"
    log_info "  3. Admin bypass is available for emergency merges"
}

main "$@"
