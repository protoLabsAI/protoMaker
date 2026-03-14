---
tags: [pattern]
summary: pattern implementation decisions and patterns
relevantTo: [pattern]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 4
  referenced: 2
  successfulFeatures: 2
---
# pattern

#### [Pattern] Role prompt injection uses multiple short-circuit returns: missing assignedRole → '', missing promptFile → '', file-not-found → warn + '', manifest error → warn + ''. Execution never fails due to incomplete role setup. (2026-03-13)
- **Problem solved:** Role prompts are optional—features without assignedRole or with an assignedRole missing promptFile should execute normally.
- **Why this works:** Graceful degradation prioritizes robustness. A missing role file should not block feature execution. Warnings log the issue for debugging.
- **Trade-offs:** Silent failure with logging is forgiving but makes configuration errors hard to detect. User may think a role is applied when it silently fell back to no-role execution.