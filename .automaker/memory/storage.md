---
tags: [storage]
summary: storage implementation decisions and patterns
relevantTo: [storage]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 17
  referenced: 5
  successfulFeatures: 5
---
# storage

#### [Pattern] Uses atomicWriteJson and readJsonWithRecovery utilities instead of direct fs operations for trajectory persistence (2026-02-24)
- **Problem solved:** Storing execution metadata to filesystem for later learning analysis
- **Why this works:** Atomic writes prevent partial/corrupted files on unexpected termination; recovery mechanism handles stale data from prior crashes without requiring manual intervention
- **Trade-offs:** Atomic writes slightly slower and more complex than direct writes vs eliminates corrupted trajectory data issues; slightly higher latency for non-blocking writes