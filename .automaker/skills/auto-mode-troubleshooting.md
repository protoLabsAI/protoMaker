---
name: auto-mode-troubleshooting
emoji: 🔧
description: Diagnose why auto-mode isn't picking up features. Covers stale worktrees, circuit breaker, dependency filtering, and branchName issues.
metadata:
  author: ava
  created: 2026-02-11T21:00:00.000Z
  usageCount: 0
  successRate: 0
  tags: [auto-mode, troubleshooting, worktree, debugging]
  source: learned
---

# Auto-Mode Troubleshooting

When `isAutoLoopRunning: true` but `runningFeatures: []` — the loop is alive but selecting nothing. Diagnose in this order.

## 1. Stale Worktrees Blocking Feature Selection (Most Common)

**Symptom:** `loadPendingFeatures` returns 0 candidates despite features in backlog.

**Root cause:** Features have `branchName` set from previous failed agent runs, AND worktrees exist for those branches. `loadPendingFeatures` filters out features that "belong" to a specific worktree when running for the main worktree (`branchName: null`).

**Diagnosis:**
```
# Check if backlog features have branchNames
mcp__plugin_protolabs_studio__list_features({ projectPath })
# Look for: branchName !== null on backlog features

# Check if worktrees exist for those branches
git worktree list
```

**Fix:**
```bash
# Remove all stale worktrees (auto-mode will recreate fresh ones)
for wt in .worktrees/*/; do
  git worktree remove --force ".worktrees/$(basename $wt)"
done

# Restart auto-mode
mcp__plugin_protolabs_studio__stop_auto_mode({ projectPath })
mcp__plugin_protolabs_studio__start_auto_mode({ projectPath, maxConcurrency: 1 })
```

Features become "orphaned" (branchName set but no worktree) = eligible for main worktree auto-mode.

## 2. Circuit Breaker Engaged

**Symptom:** Loop running but paused after consecutive failures.

**Root cause:** `CONSECUTIVE_FAILURE_THRESHOLD = 2` — two failures within the failure window triggers a 5-minute cooldown (`COOLDOWN_PERIOD_MS = 300000`). After cooldown, auto-resumes automatically.

**Diagnosis:** Check server logs for "Circuit breaker triggered" or "Auto Mode paused".

**Fix:** Stop and restart auto-mode to clear the circuit breaker state.

## 3. Dependencies Filtering All Features

**Symptom:** Features in backlog but none returned by `loadPendingFeatures`.

**Root cause:** `resolveDependencies()` runs on pending features. Features whose deps are unsatisfied (dep feature not in `done`/`review`/`verified`) are excluded from execution order.

**Diagnosis:**
```
mcp__plugin_protolabs_studio__list_features({ projectPath })
# Check: Do all chain-starter features (no deps) exist and have status=backlog?
# Check: Are dependency IDs still set correctly? (resets clear deps)
```

**Fix:** Re-set dependencies if they were cleared by resets. Find features with `dependencies: []` that should have deps.

## 4. All Features Marked as "Finished"

**Symptom:** Features in `review`/`done`/`verified` — `isFeatureFinished()` returns true.

**Root cause:** Features moved to terminal status but auto-mode still running.

**Fix:** Move features back to `backlog` if they need re-processing, or stop auto-mode if all work is done.

## 5. Heap Pressure

**Symptom:** Agent starts then immediately aborts.

**Root cause:** `HEAP_USAGE_ABORT_AGENTS_THRESHOLD` (default 90%) triggers agent abort. Dev server with 4GB heap can't run even one Sonnet agent.

**Fix:** Restart dev server with `--max-old-space-size=8192` minimum. Staging uses 32GB.

## Quick Diagnostic Checklist

1. `get_auto_mode_status` → Is loop running? Features count?
2. `list_features` → Any backlog features? Check branchNames.
3. `git worktree list` → Do worktrees exist for backlog feature branches?
4. Check server logs → Circuit breaker? Dependency messages? Heap warnings?
5. `get_execution_order` → Are dependencies satisfied?
