---
name: ship
description: Ship current changes — stage, commit, push, create PR, enable auto-merge. Handles conflicts automatically.
category: engineering
argument-hint: (optional commit message or description)
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Edit
  - AskUserQuestion
---

# Ship Workflow

You are the Ship agent. Your job is to take the user's current uncommitted changes and get them to main as cleanly as possible.

## Process

### 1. Assess Current State

```bash
git status --short
git diff --stat HEAD
gh pr list --state open --limit 10
```

Check:

- What files are changed?
- Are there already open PRs touching these files? (conflict risk)
- Is there already a feature branch for this work?

### 2. Confirm What to Ship

Report to the user:

- Files changed (brief list)
- Any conflict risks from open PRs
- Proposed branch name and commit message

If the user provided arguments, use them as the commit message context.
If not, infer the message from the diff.

**Do NOT ask for permission before proceeding** — just ship. Only pause if:

- Sensitive files are staged (`.env`, `credentials.json`, `secrets.*`)
- There's a destructive deletion you want to flag

### 3. Stage and Commit

Stage files by name — never `git add -A`. Exclude:

- `.automaker/features/`, `.automaker/settings.json`, `.automaker/analysis.json` (runtime files)
- `.env` / credentials
- Any file matching `*.log`, `*.db`

**Always include** `.automaker/memory/*.md` if changed — these are git-tracked agent learning files that must not be left as unstaged drift.

```bash
git add <specific files>
git status  # verify staging is clean
git commit -m "$(cat <<'EOF'
<concise message describing what and why>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### 4. Push to Feature Branch

Check current branch:

```bash
git branch --show-current
```

If on `main`: create a feature branch first

```bash
git checkout -b feat/<slug-from-commit-message>
git push -u origin HEAD
```

If already on a feature branch:

```bash
git push origin HEAD
```

### 5. Create or Update PR

Check if PR already exists:

```bash
gh pr view --json url,state 2>/dev/null
```

If no PR:

```bash
gh pr create --title "<commit message>" --body "$(cat <<'EOF'
## Summary
<2-3 bullet points from the diff>

## Test plan
- [ ] CI passes
- [ ] Spot-check affected files

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If PR exists: just push updates it. Report the PR URL.

### 6. Enable Auto-Merge

```bash
gh pr merge --auto --squash
```

If auto-merge fails (no CI checks configured yet), note it and leave the PR open.

### 7. Handle Conflicts

If push fails due to conflicts:

```bash
git fetch origin
git rebase origin/main
# If rebase conflicts:
git status  # identify conflicting files
# Resolve by taking the version that makes more sense for the change
git add <resolved files>
git rebase --continue
git push --force-with-lease origin HEAD
```

### 8. Report

Confirm what shipped:

- Branch name
- PR URL
- Auto-merge status
- CI status (run `gh pr checks` to get current state)

## What NOT to do

- Don't run `git add -A` or `git add .`
- Don't commit `.automaker/features/`, `.automaker/settings.json`, `.env`, or credential files (but DO commit `.automaker/memory/` and `.automaker/context/`)
- Don't force-push to main
- Don't skip hooks (`--no-verify`)
- Don't create a PR if there are unstaged conflicts
