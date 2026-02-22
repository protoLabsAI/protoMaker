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

### Event type union in libs/types must be extended to include new event types (github-state-drift) (2026-02-14)
- **Context:** New event type needed to be discoverable and type-safe across all services
- **Why:** Centralized EventType union provides compile-time type safety and makes all event types discoverable in one location for documentation
- **Rejected:** Could have hardcoded string literals in each service but loses type safety and makes refactoring dangerous
- **Trade-offs:** Requires updating shared type library (more coordination) but enables type-safe event subscriptions everywhere
- **Breaking if changed:** Services subscribing to 'github-state-drift' events will have type errors if event type not in union; type checking would prevent misnamed events

#### [Pattern] Model preference stored per-workflow in localStorage (keys like 'copilotkit-model-default'), not globally (2026-02-15)
- **Problem solved:** Different workflows (agents) may have different optimal models. User might want Haiku for lightweight operations but Opus for complex reasoning
- **Why this works:** Per-workflow storage allows user to maintain separate model preferences for different use cases without constant switching. Respects the fact that workflow context changes optimal model choice
- **Trade-offs:** Slight increase in localStorage entries (one per workflow instead of one global) but gained better UX and workflow-specific optimization capability. Makes migration harder if workflow IDs ever change

### Deduplication implemented per-monitor using platform-specific ID tracking (Twitter tweet IDs, RSS GUIDs) rather than centralized content-based deduplication. (2026-02-22)
- **Context:** Each platform has different ID schemes and native deduplication mechanisms. Need to prevent duplicate signal emissions.
- **Why:** Keeps deduplication logic co-located with platform-specific understanding. Each platform's ID scheme is natural for that platform. Simpler implementation than content hashing or URL normalization across platforms.
- **Rejected:** Centralized deduplication by content hash or URL - would require normalizing URLs across platforms, handling encoding differences, and determining whether same story on multiple platforms is duplicate or new signal.
- **Trade-offs:** Simpler per-monitor logic vs inability to detect same content posted to multiple platforms. If monitor state resets (restart, deployment), previously seen IDs are lost and duplicates re-appear.
- **Breaking if changed:** If monitor state persistence is removed (e.g., in-memory only), duplicates become visible. If new platforms are added with IDs that collide with existing IDs, false deduplication occurs.