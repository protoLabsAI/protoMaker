---
name: agent-preflight
emoji: 🛫
description: Pre-flight checklist before launching any agent. Use before starting an agent, enabling auto-mode, or retrying a failed feature. Trigger on "starting agent", "running auto-mode", "about to launch", "agent is failing", or any agent invocation.
metadata:
  author: agent
  created: 2026-02-11T23:23:41.859Z
  usageCount: 0
  successRate: 0
  tags: [agent, operations, worktree, checklist]
  source: learned
---

# Agent Pre-Flight Checklist

Run this BEFORE starting any agent or auto-mode. Skipping any step risks wasted API budget on stale code.

## 1. Verify Worktree Base Is Current

```bash
# Compare worktree HEAD vs origin/main
git -C <worktree-path> log --oneline -1
git log --oneline -1 origin/main

# If behind, rebase:
git -C <worktree-path> fetch origin && git -C <worktree-path> rebase origin/main
```

**Why:** Stale worktrees are the #1 agent failure mode. When dependency PRs merge AFTER a worktree is created, agents work on stale code, recreate existing work, and cause merge conflicts.

## 2. Rebuild Shared Packages

```bash
npm run build:packages
```

**Why:** Stale `dist/` in `@protolabsai/types` causes agents to hallucinate wrong type names and method signatures. Always rebuild after ANY types or shared package PR merges.

## 3. Verify Dependency Chain

Use `get_execution_order` MCP tool. Re-set any missing deps before starting auto-mode.

**Why:** Feature resets silently clear dependencies — both on the reset feature AND downstream features. Auto-mode will start features with unsatisfied deps if you don't re-verify.

## 4. Check Existing Code on Main

Read the feature description. Identify what types, services, or utilities already exist on main. Prepare a `send_message_to_agent` with:

- Correct import paths and type names
- Method signatures that exist on main
- Settings access patterns
- Build order: `npm run build:packages` before `npm run build:server`
- Existing utilities the agent should reuse (not recreate)

## Critical Rule

Set ALL dependencies BEFORE starting auto-mode. The first tick runs immediately and caches feature state. Late dependency changes won't be picked up.
