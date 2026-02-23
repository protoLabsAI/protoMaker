---
tags: [patterns]
summary: patterns implementation decisions and patterns
relevantTo: [patterns]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# patterns

#### [Pattern] Calendar event signal classification using keyword matching with fallback routing: Check for marketing keywords (campaign, content, social, analytics) → GTM track; engineering keywords (sprint, deployment, bug) → Ops track; default to Ops. All events classified, no drop-through. (2026-02-22)
- **Problem solved:** Need to automatically route calendar events to appropriate teams without manual setup. Which classification method?
- **Why this works:** Keyword matching is O(1) per event, requires no ML model or training data, works with any calendar. Fallback ensures no events are unrouted (robustness). Simple for users to understand.
- **Trade-offs:** Keyword matching sometimes misclassifies (e.g., 'campaign management sprint' matches both), but fallback ensures it goes somewhere. All events routed even if imperfectly.