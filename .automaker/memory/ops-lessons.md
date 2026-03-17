---
tags: []
summary: "relevantTo: []"
relevantTo: []
importance: 0.5
relatedFiles: []
usageStats:
  loaded: 3
  referenced: 2
  successfulFeatures: 2
---
# Ops Lessons

Recurring operational failures and their fixes. Each entry captures the root cause, the fix, and prevention guidance.

---

## Recurring merge_conflict failures from hot-file contention

**Pattern:** Two parallel agents modify the same "hot file" (wiring.ts, event.ts, index.ts, services.ts). The first agent's PR merges cleanly. The second agent's PR conflicts because the merge target changed under it. Auto-mode retries the second agent, which fails again at the pre-flight merge step, burning API budget and blocking the feature.

**Root cause:** Auto-mode had no awareness of file-level overlap between concurrent features. It would happily launch two agents that both needed to modify wiring.ts, guaranteeing a conflict.

**Fix (implemented 2026-03-16):**

1. **Surface 2 conflicting file capture** -- The pre-flight `git merge origin/dev` in execution-service.ts now captures which files conflicted (using `git diff --name-only --diff-filter=U`) before aborting. This gives operators actionable information in the `statusChangeReason` instead of a generic "has conflicts" message.

2. **Hot-file overlap deferral** -- FeatureScheduler now checks candidate features against running/starting features before launch. If both declare overlapping hot files in `filesToModify`, the candidate is deferred to the next scheduling cycle. This serializes hot-file modifications without requiring manual dependency setup.

**Prevention guidance for future features:**

- When creating features that modify hot files, set `filesToModify` on the feature JSON so the scheduler can detect overlap.
- For epics with many children that all touch hot files, use explicit `dependsOn` to serialize them rather than relying on the scheduler deferral (deferral is a safety net, not a planning tool).
- The hot file list is defined in `HOT_FILE_BASENAMES` in feature-scheduler.ts. If new hot files emerge, add them there.
