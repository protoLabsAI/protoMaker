---
tags: [state]
summary: state implementation decisions and patterns
relevantTo: [state]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# state

#### [Pattern] Load overrides from settings on mount to sync with server state and multi-tab scenarios (2026-03-17)
- **Problem solved:** TaskOverrides could be changed externally (another browser tab, server admin panel, API call) and UI should reflect current state
- **Why this works:** Ensures UI correctness on mount and after external changes; handles multi-tab consistency; prevents stale state after server restarts
- **Trade-offs:** Extra network request on mount (~50ms) but ensures consistency; if loading fails, UI silently defaults to all-enabled without user awareness