# PR Recovery Playbook

Use this playbook when review work or PR flow is stuck.

## First Checks

1. check PR status
2. inspect review feedback or threads
3. inspect worktree status
4. determine whether the blocker is formatting, mergeability, missing status, or real implementation failure

## Recovery Heuristics

- If checks are passing and merge is available, merge or enable the next merge step.
- If review threads are mechanical and resolvable, resolve them.
- If the worktree contains simple cleanup work, delegate or perform the minimum safe recovery step.
- If the failure is a real implementation defect, route back to implementation instead of forcing the PR through.

## Avoid

- broad speculative rewrites
- unrelated board changes while PR state is unclear
- forcing progress when the failure mode is not understood

## Report Format

- PR state
- blocker
- recovery action
- resulting status
