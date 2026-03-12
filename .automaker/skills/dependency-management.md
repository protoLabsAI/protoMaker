---
name: dependency-management
emoji: 🔗
description: Feature dependency rules and gotchas. Use when features run out of order, dependencies disappear after resets, or auto-mode starts blocked features too early. Trigger on "dependencies", "feature order", "deps disappearing", "wrong execution order", or "dependency issue".
metadata:
  author: agent
  created: 2026-02-11T23:25:03.035Z
  usageCount: 0
  successRate: 0
  tags: [dependencies, auto-mode, features, orchestration]
  source: learned
---

# Feature Dependency Management

Dependencies in Automaker are powerful but have critical edge cases that cause cascading failures if not handled.

## How Dependencies Work

- Topological sort + satisfaction check + priority sort
- Features with unsatisfied deps are skipped by auto-mode
- `get_execution_order` shows the resolved order
- `get_dependency_graph` shows the full graph

## Critical Bug: Dependencies Disappear on Reset

When auto-mode resets a failed feature to backlog, dependencies get cleared — BOTH on the reset feature AND on downstream features in the chain.

**Example cascade observed:**

1. DM types feature fails → reset to backlog → deps cleared
2. handleMessage (depends on DM types) → dep cleared → auto-mode starts it early
3. handleMessage fails (missing DM types) → reset → context gathering dep cleared
4. Cascade continues...

**Mitigation:** After EVERY agent failure/reset, re-verify and re-set the ENTIRE dependency chain using `set_feature_dependencies`.

## Timing Issues with Auto-Mode

Auto-mode's first tick runs immediately and caches feature state. If you set dependencies AFTER starting auto-mode, they won't be picked up until the next tick.

**Rule:** Set ALL dependencies BEFORE starting auto-mode.

## Out-of-Order Agent Recovery

When an agent starts on a feature with unsatisfied deps (due to the reset bug), send it context about what exists on main via `send_message_to_agent`:

- What types/services already exist
- Correct import paths
- What to reuse vs. recreate

This lets the agent produce useful work even when started out of order.

## Dependency Commands

```
# Set deps via MCP
set_feature_dependencies(projectPath, featureId, [depId1, depId2])

# View execution order
get_execution_order(projectPath)

# View full graph
get_dependency_graph(projectPath)
```
