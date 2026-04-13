#!/usr/bin/env bash
#
# GitHub Repository Settings — protoLabsAI/ava
#
# Applies branch protection rulesets to the ava repo via GitHub API.
# This script is idempotent and can be run multiple times safely.
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated with repo admin access
#
# Usage:
#   ./scripts/infra/ava/github-settings.sh
#

set -euo pipefail

REPO="protoLabsAI/ava"
RULESET_FILE="scripts/infra/ava/rulesets/main.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_prerequisites() {
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) not found. Install from https://cli.github.com/"
        exit 1
    fi
    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        exit 1
    fi
    log_info "Prerequisites OK — targeting ${REPO}"
}

apply_main_branch_ruleset() {
    log_info "Applying main branch ruleset..."

    if [[ ! -f "$RULESET_FILE" ]]; then
        log_error "Ruleset file not found: $RULESET_FILE"
        exit 1
    fi

    local EXISTING_ID
    EXISTING_ID=$(gh api \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "/repos/${REPO}/rulesets" \
        --jq '.[] | select(.name == "Protect main") | .id' 2>/dev/null || echo "")

    if [[ -n "$EXISTING_ID" ]]; then
        log_info "Updating existing ruleset (ID: ${EXISTING_ID})..."
        gh api \
            --method PUT \
            -H "Accept: application/vnd.github+json" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            "/repos/${REPO}/rulesets/${EXISTING_ID}" \
            --input "$RULESET_FILE" \
            > /dev/null
        log_info "Ruleset updated"
    else
        log_info "Creating new ruleset..."
        gh api \
            --method POST \
            -H "Accept: application/vnd.github+json" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            "/repos/${REPO}/rulesets" \
            --input "$RULESET_FILE" \
            > /dev/null
        log_info "Ruleset created"
    fi
}

verify_settings() {
    log_info "Current rulesets on ${REPO}:"
    gh api \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "/repos/${REPO}/rulesets" \
        --jq '.[] | {id, name, enforcement}' | jq -s '.'
}

main() {
    log_info "Configuring branch protection for ${REPO}..."
    check_prerequisites
    apply_main_branch_ruleset
    verify_settings
    log_info "Done. Next step: add required status checks once CI is configured."
}

main "$@"
