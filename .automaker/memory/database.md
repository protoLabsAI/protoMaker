---
tags: [database]
summary: database implementation decisions and patterns
relevantTo: [database]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 1
  referenced: 0
  successfulFeatures: 0
---
# database

#### [Pattern] Compute derived fields (prReviewDurationMs) at write-time rather than query-time (2026-02-11)
- **Problem solved:** Review duration is a simple calculation (merge_time - creation_time) that could be computed on-demand during queries
- **Why this works:** Write-time computation enables efficient filtering/sorting on the board UI without requiring post-processing. Stores a snapshot of the metric at the moment of merge, creating immutable audit trail. Query-time computation would require fetching two timestamp fields + JavaScript arithmetic on every read.
- **Trade-offs:** Adds storage (~8 bytes per merged feature) and write-time processing, but eliminates compute on every read. Favors read-heavy metrics workload (board queries, analytics aggregations)