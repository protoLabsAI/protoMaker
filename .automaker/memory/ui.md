---
tags: [ui]
summary: ui implementation decisions and patterns
relevantTo: [ui]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# ui

#### [Pattern] Recent server URLs stored as deduplicated, capped-at-10 list in localStorage (automaker:recentServerUrls). Each setServerUrlOverride() call filters duplicates before capping. (2026-03-11)
- **Problem solved:** Users need history dropdown of visited servers; storage is limited; UX should not show same URL twice
- **Why this works:** Deduplication improves UX (no confusing duplicate entries). Cap at 10 provides useful history depth while preventing unbounded localStorage growth (~500 bytes per URL × 10 = manageable).
- **Trade-offs:** Slight complexity in dedup+cap logic vs cleaner UX and bounded storage