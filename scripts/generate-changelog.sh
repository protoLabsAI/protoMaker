#!/usr/bin/env bash
# Generate a changelog entry from merged PRs using Claude CLI
# Usage: ./scripts/generate-changelog.sh <since_tag> <current_tag>

set -euo pipefail

SINCE_TAG="${1:-}"
CURRENT_TAG="${2:-}"

if [ -z "$SINCE_TAG" ] || [ -z "$CURRENT_TAG" ]; then
  echo "Usage: $0 <since_tag> <current_tag>"
  exit 1
fi

# Get the date of the since_tag
SINCE_DATE=$(git log -1 --format=%aI "${SINCE_TAG}" 2>/dev/null || echo "2026-01-01")

# Collect merged PRs since that date
PR_DATA=$(gh pr list \
  --state merged \
  --search "merged:>=${SINCE_DATE}" \
  --json number,title,author,labels,body \
  --limit 100 2>/dev/null || echo "[]")

PR_COUNT=$(echo "$PR_DATA" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Found ${PR_COUNT} merged PRs since ${SINCE_TAG}"

if [ "$PR_COUNT" = "0" ]; then
  echo "No PRs to generate changelog from"
  exit 0
fi

# Get commit log for context
COMMITS=$(git log --oneline "${SINCE_TAG}..${CURRENT_TAG}" 2>/dev/null || git log --oneline -50)

# Save PR data for Claude
echo "$PR_DATA" > /tmp/changelog-prs.json

PROMPT="You are generating a changelog entry for Automaker ${CURRENT_TAG}.

Here are the merged PRs since ${SINCE_TAG}:
$(cat /tmp/changelog-prs.json)

Here are the commits:
${COMMITS}

Generate a markdown changelog entry in this format:

## ${CURRENT_TAG} ($(date +%Y-%m-%d))

### Features
- Brief description of each new feature (reference PR #number)

### Bug Fixes
- Brief description of each bug fix (reference PR #number)

### DevOps & Infrastructure
- Brief description of infra changes (reference PR #number)

### Documentation
- Brief description of doc changes (reference PR #number)

Rules:
- Only include sections that have entries
- Keep descriptions concise (1 line each)
- Reference PR numbers as #N
- Group logically, not just by PR
- Skip merge commits and version bumps
- Use past tense (Added, Fixed, Updated)"

# Generate with Claude CLI
claude -p "$PROMPT" > /tmp/changelog-entry.md

echo "Generated changelog entry:"
cat /tmp/changelog-entry.md

# Update CHANGELOG.md
CHANGELOG_FILE="CHANGELOG.md"

if [ ! -f "$CHANGELOG_FILE" ]; then
  echo "# Changelog" > "$CHANGELOG_FILE"
  echo "" >> "$CHANGELOG_FILE"
  echo "All notable changes to Automaker are documented in this file." >> "$CHANGELOG_FILE"
  echo "" >> "$CHANGELOG_FILE"
fi

python3 -c "
import sys

changelog = '$CHANGELOG_FILE'

with open(changelog, 'r') as f:
    existing = f.read()

with open('/tmp/changelog-entry.md', 'r') as f:
    new_entry = f.read().strip()

lines = existing.split('\n')
insert_idx = 0
for i, line in enumerate(lines):
    if line.startswith('## '):
        insert_idx = i
        break
    insert_idx = i + 1

before = '\n'.join(lines[:insert_idx])
after = '\n'.join(lines[insert_idx:])

result = before.rstrip() + '\n\n' + new_entry + '\n\n' + after.lstrip()

with open(changelog, 'w') as f:
    f.write(result.strip() + '\n')
"

echo "Updated ${CHANGELOG_FILE}"

# Cleanup
rm -f /tmp/changelog-prs.json /tmp/changelog-entry.md
