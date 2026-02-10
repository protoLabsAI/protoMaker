---
tags: [gotcha]
summary: gotcha implementation decisions and patterns
relevantTo: [gotcha]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# gotcha

#### [Gotcha] Features in 'review' status must have prNumber field populated; no validation of this invariant in task (2026-02-10)
- **Situation:** Task assumes feature.prNumber exists if feature.status === 'review'. No defensive checks.
- **Root cause:** Assumed board-health system maintains this invariant (features only marked 'review' after PR created). Defensive checks add noise.
- **How to avoid:** Trust the invariant vs defensive programming. Silence if invariant breaks (prNumber undefined = skipped feature, hard to debug). Documented in notes to avoid later confusion.