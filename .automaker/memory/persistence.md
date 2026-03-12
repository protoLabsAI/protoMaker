---
tags: [persistence]
summary: persistence implementation decisions and patterns
relevantTo: [persistence]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 23
  referenced: 6
  successfulFeatures: 6
---

<!-- domain: Data Persistence | File I/O, atomic writes, backup and recovery patterns -->

# persistence

### All persistence uses FeatureLoader.update() for atomic writes rather than direct file operations or partial updates. (2026-02-23)

- **Context:** Both pipeline orchestrator and agent service write to feature.pipelineState concurrently. Without atomicity, simultaneous writes corrupt state.
- **Why:** Atomic writes ensure read-modify-write sequence is indivisible. If process crashes mid-write, the previous complete state is preserved. Prevents partial data from being visible to other readers.
- **Rejected:** Direct fs.writeFileSync: vulnerable to race conditions and corruption. Manual file locking: fragile and easy to forget. Transactions: overcomplicated for single-file state.
- **Trade-offs:** Must abstract file I/O through FeatureLoader. Adds indirection, but guarantees correctness under concurrent load.
- **Breaking if changed:** Switching to non-atomic writes causes data loss when multiple services write simultaneously. Orphaned or corrupted feature.json files lose tool execution history.

#### [Pattern] Both phaseDurations and toolExecutions fields are optional in feature.pipelineState interface. phaseDurations uses Partial<Record<PipelinePhase, number>> to allow sparse data. (2026-02-23)

- **Problem solved:** Existing features in the codebase don't have these fields. New fields must be backward compatible, and not all phases may be completed by all features.
- **Why this works:** Optional fields mean existing feature.json files remain valid without migration. Partial<Record> allows only completed phases to be tracked, saving space and avoiding 'undefined' placeholders.
- **Trade-offs:** All code reading these fields must handle absence (null checks, default values). More flexible and compatible, but error-prone if fields aren't checked.

#### [Pattern] Uses namespaced localStorage key (automaker:serverUrlOverride) to persist runtime override across reloads without rebuilding. This decouples runtime state from build-time env vars. (2026-03-10)

- **Problem solved:** User sets server URL at runtime via UI; must survive reload and not require env var re-injection.
- **Why this works:** localStorage provides client-side persistence; namespace prevents collisions with other apps. Enables 'set once, forget' UX without rebuild/redeploy cycle.
- **Trade-offs:** Pro: simple, no server required. Con: cleared if user clears browser cache; namespace is convention not enforced.

### lead-engineer-sessions.json uses a multi-project map format: { sessions: Record<projectPath, PersistedSessionData>, savedAt: string } (2026-03-12)

- **Context:** Previously one file per project path at `.automaker/lead-engineer-sessions.json`. Now a single file at `DATA_DIR/lead-engineer-sessions.json` keyed by project path.
- **Why:** Single file with keyed map eliminates the need to enumerate all known project paths at restore time. `save()` merges into the map (read-modify-write); `remove()` deletes the key; `restoreSessions()` iterates entries directly.
- **Rejected:** Retaining per-project files with a discovery scan — fragile to missing settings, breaks when projects move.
- **Trade-offs:** All sessions in one file means a single corrupt file affects all projects. `readJsonWithRecovery` provides crash resilience.
- **Breaking if changed:** Old per-project format is migrated at startup by `migrateRuntimeStateFiles()` but only the single top-level `lead-engineer-sessions.json` — not legacy per-project files from older layouts.

### recentServerUrls persisted via browser localStorage (per-origin key-value) rather than IndexedDB or server-side user preferences (2026-03-11)

- **Context:** UI needs quick access to recent server URLs for dropdown, but doesn't require cross-device sync or complex queries
- **Why:** localStorage is synchronous, no async overhead, no server round-trip. Meets UX requirement of instant dropdown population. Scoped to origin (secure by design).
- **Rejected:** IndexedDB: over-engineered for simple key-value. Server storage: unnecessary latency for UI dropdowns, requires auth/sync logic.
- **Trade-offs:** Lost on browser clear/incognito. Per-origin isolation (https://localhost:3000 and :3001 have separate histories). Survives only within same origin.
- **Breaking if changed:** If persisted to server instead, need auth integration and sync strategy. If cleared, user loses context but app still works.
