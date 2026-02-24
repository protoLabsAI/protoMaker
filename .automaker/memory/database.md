---
tags: [database]
summary: database implementation decisions and patterns
relevantTo: [database]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 3
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

#### [Pattern] Atomic persistence pattern: Both phaseDurations and toolExecutions are persisted via FeatureLoader.update() to prevent partial writes when multiple services modify feature.json concurrently. (2026-02-23)
- **Problem solved:** Pipeline orchestrator persists phase duration, agent service persists tool executions—both write to the same feature.json file
- **Why this works:** Race condition risk: if pipeline-orchestrator and agent-service write to feature.json without coordination, one write can clobber the other. FeatureLoader uses atomic file operations (write-to-temp, rename).
- **Trade-offs:** Atomic writes guarantee consistency but require understanding FeatureLoader's atomic mechanism. Developers unfamiliar with the pattern might use direct fs.writeFileSync() and create race conditions.

#### [Pattern] Conditional state mutation: lastCeremonyAt and counters only update on confirmed success. Creates immutable audit trail: if counter didn't increment, nothing happened. (2026-02-24)
- **Problem solved:** Previously, ceremony state would update even if Discord post failed, creating inaccurate ceremony history and timestamps.
- **Why this works:** State should reflect actual delivered ceremonies, not attempted ceremonies. Simplifies understanding: 'if counter exists in output, it actually happened'. Timestamp represents real event, not failed attempt.
- **Trade-offs:** Easier: Simpler model—count means it happened. Harder: Failed attempts leave no trace in counters. Harder: Requires checking return value in all callers before state update.

#### [Pattern] Store source system identifiers (linearIssueId) on records created from external integrations to enable reliable deduplication and tracking. (2026-02-24)
- **Problem solved:** SignalIntakeService created features from Linear signals but didn't store linearIssueId, making it impossible to deduplicate based on source system identity.
- **Why this works:** Without the external ID stored, dedup becomes fragile: you'd have to match on title (couples to title format), content (changes break dedup), or timestamps (unreliable). Source ID is the source of truth for 'is this the same external thing?'.
- **Trade-offs:** Slight data model expansion (one extra field) vs. reliable deduplication and source tracking. Field becomes a foreign key-like identifier for dedup queries.

### Enabled SQLite WAL (Write-Ahead Logging) mode via pragma('journal_mode = WAL') for the knowledge store database (2026-02-24)
- **Context:** Knowledge store needs high concurrent read performance as it will be frequently queried during development
- **Why:** WAL mode separates read and write operations, allowing concurrent reads while writes are in progress. Default rollback journal serializes all operations.
- **Rejected:** Default rollback journal mode - simpler but blocks reads during writes
- **Trade-offs:** Gains: Much better concurrent read performance. Losses: Requires additional cleanup on process exit (checkpoint operations), doesn't work on all filesystems (network drives, some cloud storage), more complex backup strategy
- **Breaking if changed:** Removing WAL mode would cause read operations to block during writes, significantly degrading performance under concurrent access patterns

#### [Pattern] Used SQLite FTS5 virtual table with automatic INSERT/UPDATE/DELETE triggers to keep full-text search index synchronized with main chunks table (2026-02-24)
- **Problem solved:** Need efficient full-text search on chunk content and headings without manual index management scattered throughout application code
- **Why this works:** Automatic triggers guarantee index stays synchronized with source data. Single source of truth: triggers defined once at schema time, then always applied. Prevents bugs from forgotten index updates in application code.
- **Trade-offs:** Gains: Simpler application code, guaranteed consistency, single point of maintenance. Losses: Slight write overhead from trigger execution, less visibility into when updates happen

### Created comprehensive database schema with full metadata columns (source_type, source_file, project_path, chunk_index, heading, tags, importance, created_at, updated_at) rather than minimal schema (2026-02-24)
- **Context:** Designing schema for knowledge store that needs rich filtering, sorting, and statistics capabilities
- **Why:** Comprehensive metadata enables future features: filter by source type, track chunk origin, calculate stats by source, sort by importance/timestamp, and organize by project. Better to include now than add columns later.
- **Rejected:** Minimal schema with just id, content, and created_at - simpler but would require schema migration to add these later
- **Trade-offs:** Gains: Flexibility for future features, rich statistics possible. Losses: More storage overhead, more complex inserts/updates, more careful typing needed
- **Breaking if changed:** Removing columns would lose capability to filter/sort by source or importance, break any code depending on these fields

### Selected Turso (serverless SQLite) as primary database migration path instead of PostgreSQL for hosted deployments (2026-02-24)
- **Context:** Application currently uses SQLite locally, needs hosted database solution for multiple deployment platforms
- **Why:** Turso maintains SQLite compatibility (easier migration, minimal code changes) while providing edge replication, global distribution, and serverless scaling. PostgreSQL would require schema and driver changes
- **Rejected:** PostgreSQL with managed services (RDS, Render's native PostgreSQL) would mean more infrastructure control but requires code migration and different connection pooling strategies
- **Trade-offs:** Lower migration friction and protocol compatibility vs vendor lock-in to Turso and different scaling characteristics than traditional PostgreSQL
- **Breaking if changed:** If switching away from Turso, requires full database migration including schema translation, connection string changes, and potential application code updates

#### [Gotcha] Incremental processing via null-check creates hidden state versioning problem. Worker only processes chunks where `hype_queries IS NULL`. If generation logic changes, existing chunks won't be regenerated. (2026-02-24)
- **Situation:** To support restart-safety and incremental progress, only chunks without hype_queries are processed
- **Root cause:** Allows resuming interrupted processing without duplication. Chunks that failed on retry can be reattempted without reprocessing successful ones.
- **How to avoid:** Simplicity and restart-safety gained, but creates invisible state that may become stale if logic changes

#### [Gotcha] Embeddings stored as Buffer (Float32Array.buffer) in SQLite BLOB column. Encoding endianness and platform-specific byte order are persisted without conversion. (2026-02-24)
- **Situation:** SQLite has no native array/vector type, so embeddings must be serialized to BLOB
- **Root cause:** Binary BLOB is 4x more space-efficient than JSON and enables bulk binary I/O. Float32Array.buffer provides direct byte representation without JSON overhead.
- **How to avoid:** Efficiency gained but reduced portability. Cross-platform and cross-architecture compatibility requires explicit endianness handling on deserialization.

### Deduplication threshold: BM25 score < -5 (log-odds), pruning after 90 days OR zero retrieval count (whichever comes first). (2026-02-24)
- **Context:** memory-system.md documents write pipeline deduplication (BM25 < -5) and pruning policy (90d + zero retrieval).
- **Why:** BM25 < -5 is low-confidence match threshold (empirically chosen from similarity experiments—not documented but discoverable in code). Combining time-based (staleness) AND usage-based (relevance) pruning prevents two failure modes: (1) keeping irrelevant docs forever just because they're new, (2) removing useful docs that happen to not be retrieved recently.
- **Rejected:** Could use only time-based pruning (simpler, but keeps unused docs consuming space). Could use only usage-based (discards potentially useful but less-frequently-accessed domain knowledge). Could use single threshold (BM25 > some value) without time component.
- **Trade-offs:** Dual-criterion pruning is more complex to reason about and requires observing both metrics. But: prevents accumulating stale knowledge and prevents useful knowledge from being garbage-collected just because it's not in the hotpath.
- **Breaking if changed:** Removing time-based pruning allows knowledge bloat. Removing usage-based pruning keeps rarely-used but valid docs. Changing BM25 threshold dramatically changes what counts as 'duplicate' (too high = misses duplicates, too low = false positives).

### Store hype_queries as TEXT (JSON array) but hype_embeddings as BLOB (binary Float32Array buffer) (2026-02-24)
- **Context:** Need to store both generated questions and their computed embeddings in same record
- **Why:** Hybrid approach: TEXT for debuggability and inspection, BLOB for embedding efficiency (8x smaller than JSON float arrays). Simplifies querying questions without deserialization
- **Rejected:** All-BLOB storage (smaller but loses query introspection); all-JSON storage (simpler schema but 8x larger embeddings column)
- **Trade-offs:** Requires different serialization logic per column but gains both queryability and space efficiency
- **Breaking if changed:** Changing hype_embeddings to TEXT would increase storage 8x; changing hype_queries to BLOB would eliminate ability to index/search questions without deserialization

### Store HyPE embeddings in chunks.hype_embeddings column (pre-computed) rather than computing at query time (2026-02-24)
- **Context:** HyPE embeddings are expensive to compute (require running model on stored query embeddings) and don't change for static corpus
- **Why:** Pre-computation trades storage space for elimination of query-time computation latency. Since HyPE embeddings are deterministic given static query embeddings, computing once at ingestion time is strictly better than computing every search.
- **Rejected:** Query-time computation (increases latency by model inference time), separate embeddings table (would require schema migration)
- **Trade-offs:** Storage cost (embeddings take disk space) for latency gain (no inference per search). Schema is denormalized but justified by performance.
- **Breaking if changed:** If chunk embeddings are updated, HyPE embeddings become stale and must be recomputed; removing this column disables hybrid_hype mode

### Store averaged embeddings as Float32Array serialized to Buffer (BLOB), not JSON string (2026-02-24)
- **Context:** Persisting 384-dim embedding vector to SQLite for each chunk
- **Why:** 10-50x space efficiency vs JSON stringification; preserves numeric precision; faster serialization/deserialization
- **Rejected:** Store as JSON array of numbers; or external vector DB; or as separate embedding table
- **Trade-offs:** Binary format is opaque in database inspection but gains efficiency; tied to Float32Array representation, not portable
- **Breaking if changed:** Format migration if switching vector DB backends; if you inspect SQL with tools expecting JSON, get unreadable binary

#### [Pattern] Outcome-based trajectory categorization: single outcome field ('success' vs 'escalated') enables different downstream processing without schema branching (2026-02-24)
- **Problem solved:** DeployProcessor and EscalateProcessor both call save() but with different outcome values and different supplemental fields (failureAnalysis only on escalation)
- **Why this works:** Discriminated union pattern: single schema with outcome tag determines which optional fields are present, avoiding multiple schema variants
- **Trade-offs:** Gains: Single schema evolution point, flexible for new outcomes. Loses: Schema validation must be conditional on outcome field