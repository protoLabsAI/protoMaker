---
name: graphite-workflow
emoji: 📊
description: "Graphite-first git workflow for PRs and branch stacking. Josh's directive over gh CLI."
metadata:
  author: agent
  created: 2026-02-11T23:25:15.622Z
  usageCount: 0
  successRate: 0
  tags: [git, graphite, pr, workflow, stacking]
  source: learned
---

# Graphite-First Git Workflow

Josh directive: Use `gt` over `gh` for all branch and PR operations. Graphite prevents cascade rebases in epic stacks.

## Core Commands

```bash
# Create branch (auto-tracks parent)
gt create <branch-name>

# Push and create/update PRs for entire stack
gt submit --stack

# Sync with remote
gt sync

# Rebase entire stack when main changes (one command)
gt restack

# View stack
gt log short

# Track existing branch under a parent
gt track <branch> --parent <parent-branch>
```

## Epic Workflow with Stacking

```
main
  ↑
epic/foundation ──────────── Epic PR (targets main)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch)
```

```bash
# Set up epic stack
gt track epic/my-epic --parent main
gt track feature/my-feature --parent epic/my-epic

# Submit all PRs in stack
gt submit --stack
```

## Why Graphite Over gh

- **Cascade prevention:** Without Graphite, merging one PR in a stack forces all others to rebase and re-run CI. Graphite handles this automatically with `gt restack`.
- **Parent tracking:** `gt create` automatically tracks the parent branch. `gh` requires manual `--base` specification.
- **Stack-aware PRs:** `gt submit --stack` creates/updates all PRs in the stack at once.

## When to Fall Back to gh

- Graphite not installed or not synced
- Single PRs with no stack
- Issue/PR comments and reactions
- PR status checks and reviews

## Prerequisite Setup

1. Install: `npm install -g @withgraphite/graphite-cli`
2. Auth: `gt auth --token <token>`
3. Sync repo in Graphite settings
4. Join/create team for org