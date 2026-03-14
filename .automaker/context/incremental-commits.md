# Incremental Commits — Protect Against Turn Limits and Interruptions

Agents are killed by server restarts, turn limits, and interruptions. Uncommitted work is lost.

## Rule

Commit after every logical unit of work — not just at the end.

## What counts as a logical unit

- New file created and compiling
- Type changes propagated to all consumers
- Service wired into server
- Route mounted and tested
- Test file written and passing

## Pattern

```bash
# After each logical unit:
git add <specific files>
HUSKY=0 git commit -m "wip: <what was just completed>"
```

## Why

- Server restarts kill agents mid-flight (hot-reload on PR merge to dev)
- Turn limits end sessions without warning
- WorktreeRecoveryService can only rescue what's been staged
- A commit every 10-15 minutes of work means at most 15 minutes of rework on interruption vs hours

## Anti-pattern

```
# BAD: one giant commit at the end
# ... 45 minutes of work across 8 files ...
git add -A && git commit  # agent killed 1 line before this
```

## The final commit

Before creating the PR, squash WIP commits into a clean conventional commit:

```bash
git reset --soft origin/dev
git add -A
HUSKY=0 git commit -m "feat: <feature title>"
```
