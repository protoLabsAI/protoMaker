---
tags: [reliability]
summary: reliability implementation decisions and patterns
relevantTo: [reliability]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 11
  referenced: 3
  successfulFeatures: 3
---

<!-- domain: Reliability | Retry logic, error recovery, resilience patterns -->

# reliability

#### [Pattern] Individual checkpoint deletion errors are caught and logged as warnings without stopping overall reconciliation; errors do not propagate to halt the process (2026-02-24)

- **Problem solved:** Checkpoint files may fail to delete due to file system issues, permissions, race conditions, or external file removal
- **Why this works:** Partial cleanup success is preferable to startup failure. One checkpoint deletion failure should not block deletion of other checkpoints or prevent the system from coming online. Reconciliation is a recovery operation; best effort is sufficient.
- **Trade-offs:** Some orphaned checkpoints might persist if deletion fails (incomplete cleanup), but system availability is preserved and operational

#### [Pattern] Fire-and-forget CRDT writes: disk is always primary (awaited), CRDT is secondary (fire-and-forget with .catch()). System stays available when CRDT is slow or unavailable. (2026-03-12)

- **Problem solved:** Services need to replicate data across instances via CRDT, but can't let CRDT failures block the primary operation.
- **Why this works:** `.catch(err => logger.warn(...))` after a CRDT write ensures failure is surfaced in logs without propagating. Disk write success is the durable guarantee; CRDT catches up asynchronously.
- **Trade-offs:** Brief inconsistency window between disk and CRDT replicas. CRDT failures require log monitoring to detect; callers never see them.

#### [Pattern] Double-run guard via in-memory state flag prevents duplicate concurrent operations on the same resource. Idempotent response (return early with `{started: true}`) for already-running operations. (2026-03-13)

- **Problem solved:** Multiple API calls or auto-triggers could fire the same long-running operation (e.g., research) on the same project within milliseconds.
- **Why this works:** State flag check is O(1), no external dependencies. Idempotent response means callers get consistent semantics whether it's a new start or already running.
- **Trade-offs:** In-memory flag only works on a single node; breaks on multi-node deployments without shared state. Sufficient for current single-node architecture.

#### [Pattern] Pre-flight rebase conflict blocks feature execution instead of proceeding on stale base. Status set to `blocked` with clear `statusChangeReason`. (2026-03-12)

- **Problem solved:** Agents proceeding on conflict-ridden branches waste execution cycles and repeatedly fail with `merge_conflict` errors.
- **Why this works:** Early detection at pre-flight stops wasted work immediately. `blocked` status + `statusChangeReason` surfaces the required manual action (human must resolve conflicts and rebase) without ambiguity.
- **Trade-offs:** Agents stop rather than attempting to proceed, but proceeding was never going to succeed. Manual intervention is required regardless.

#### [Pattern] Graceful degradation with component-level independence: features work with partial data (metadata-only download, missing research.md) rather than failing entirely when upstream enrichment is absent. (2026-03-13)

- **Problem solved:** Features in a pipeline can't always guarantee upstream data is available. Blocking on enrichment creates tight coupling.
- **Why this works:** Optional enrichment fields (`content?`, `researchFindings?`) allow each stage to produce useful output with what it has. Consumers handle both cases (`content ?? fallback`).
- **Trade-offs:** Degraded experience (metadata instead of full content) but feature remains usable. Creates technical debt: metadata fallbacks can become permanent if enrichment is never implemented.
