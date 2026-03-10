# Git Flow Improvements

## Goal

Reduce friction in the three-branch promotion pipeline (feature -> dev -> staging -> main) and prepare for eventual migration to Graphite stacked PRs.

## Problem Statement

The current git workflow has several systemic pain points:

1. **Test/code mismatch across branches** - Tests written against dev's API fail on staging when service signatures differ. Tests and code get promoted separately, creating mismatches.
2. **`.automaker/features/` blocks worktree operations** - Runtime board state files show as dirty in worktrees, blocking rebases and polluting diffs.
3. **Manual worktree rebasing is fragile** - Stale stashes, branch confusion, `.automaker-lock` conflicts on every rebase.
4. **Promotion gap amplifies drift** - Long gaps between dev and staging promotions create large merge conflicts and API surface mismatches.
5. **No merge queue** - Concurrent PR merges to dev cause cascade conflicts. Each merge makes other open PRs conflict.

## Milestones

### Milestone 1: Stop-Gap Fixes (immediate)

**Status: In Progress**

- [x] Worktree git exclude for `.automaker/features/` - prevent board state from blocking rebases
- [ ] Add `.automaker/notes/` to worktree git exclude (same problem)
- [ ] Pre-promotion CI check: verify tests match target branch API signatures
- [ ] Auto-stash `.automaker/` files before worktree rebase operations

### Milestone 2: Promotion Pipeline Hardening

- [ ] Automated promotion cadence: trigger dev->staging PR after N feature merges or daily
- [ ] Pre-promotion test runner: merge dev into staging locally and run tests before creating PR
- [ ] Worktree cleanup automation: prune worktrees for merged/done features
- [ ] Merge queue for dev branch: serialize merges to prevent cascade conflicts

### Milestone 3: Graphite Migration

- [ ] Evaluate Graphite stacked PRs with current branch protection rules
- [ ] Define how staging deploys work with Graphite (tag-based? merge-to-deploy?)
- [ ] Migrate feature PR workflow to Graphite stacks
- [ ] Update CLAUDE.md and agent workflows for Graphite commands
- [ ] Deprecate three-branch flow in favor of trunk-based + deploy gates

## Constraints

- Must not break existing auto-mode agent workflow
- `.automaker/memory/` and `.automaker/context/` must remain git-tracked (agent learning)
- Staging deploy must continue working during migration
- Branch protection on main must remain enforced
