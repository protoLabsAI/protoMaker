---
tags: [patterns]
summary: patterns implementation decisions and patterns
relevantTo: [patterns]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 106
  referenced: 23
  successfulFeatures: 23
---

<!-- domain: Patterns & Best Practices | Reusable implementation patterns proven in this codebase -->

# patterns

#### [Pattern] Calendar event signal classification using keyword matching with fallback routing: Check for marketing keywords (campaign, content, social, analytics) → GTM track; engineering keywords (sprint, deployment, bug) → Ops track; default to Ops. All events classified, no drop-through. (2026-02-22)

- **Problem solved:** Need to automatically route calendar events to appropriate teams without manual setup. Which classification method?
- **Why this works:** Keyword matching is O(1) per event, requires no ML model or training data, works with any calendar. Fallback ensures no events are unrouted (robustness). Simple for users to understand.
- **Trade-offs:** Keyword matching sometimes misclassifies (e.g., 'campaign management sprint' matches both), but fallback ensures it goes somewhere. All events routed even if imperfectly.

#### [Pattern] Matcher-based conditional hook execution allows same hook array to dispatch different behaviors based on context (e.g., SessionStart has separate matchers for 'compact', 'startup', 'resume' modes) (2026-02-24)

- **Problem solved:** Plugins need hooks that behave differently depending on session state, tool type, or MCP method invoked. Matcher field enables context-aware routing without hardcoding in hook scripts.
- **Why this works:** Reduces code duplication and provides declarative routing. Different session contexts (compact, startup, resume) can trigger different initialization sequences without needing conditional logic in bash scripts.
- **Trade-offs:** Declarative matchers are easier to understand and modify (+) but add complexity to hook schema and require matcher implementation in Claude Code runtime (-)

#### [Pattern] Skeleton-first approach: auto-generates structure with explicit TODO markers, not complete specification (2026-03-07)

- **Problem solved:** generateSpecMd must produce useful output without access to product/business context
- **Why this works:** Acknowledges that product goals, target users, workflows cannot be reliably auto-generated without hallucination risk
- **Trade-offs:** More friction for user (must fill TODOs) but prevents confidence in incorrect auto-generated product specification

#### [Pattern] Intentionally lower confidence scoring (0.75 vs standard) for broad-keyword patterns ('needs human input', 'ambiguous', 'cannot proceed') to avoid false positives. Accept imperfect recall to prevent misclassification. (2026-03-09)

- **Problem solved:** The new 'agent escalation' pattern covers common escalation phrases that are linguistically broader than specific failure modes. Using high confidence would create false positives misclassifying other failures.
- **Why this works:** False positives (classifying a retry-able failure as non-retryable escalation) cause more damage than false negatives (some escalations slip through to unknown). Lower confidence + high recall on unclassified logging allows gradual pattern tightening.
- **Trade-offs:** Some real agent escalations may still be classified as unknown initially, but they'll surface in the warn logs for pattern refinement. Avoids breaking the retry system with false escalations.

#### [Pattern] Gate expensive render-time operations (syntax highlighting, heavy transforms) behind an `isStreaming` prop to prevent thrashing during token delivery. Apply the operation only on completion. (2026-03-09)

- **Problem solved:** Streaming AI responses deliver tokens incrementally. Any useEffect that depends on `code`/`content` will re-fire on every token, making expensive operations (Prism.js, markdown parsing, diff computation) thrash the renderer.
- **Why this works:** The rendered output during streaming doesn't need to be perfect — users are watching text appear. Deferred enhancement (apply Prism once streaming completes) keeps the UI responsive during delivery and produces the same final result.
- **Trade-offs:** Easier: eliminates render thrashing, smooth streaming UX. Harder: requires threading `isStreaming` prop down to leaf display components. Pattern: add `isStreaming?: boolean` to component props, skip expensive effect when true, re-run effect when `isStreaming` transitions to `false`.

#### [Pattern] Typed event payload interfaces exported from central types package, paired with EventType union that includes event names as discriminated union. (2026-02-14)

- **Problem solved:** Event system needs type safety across multiple services and files that emit/listen to events.
- **Why this works:** Allows type-safe event emission with IDE autocomplete and compile-time validation. Central types package ensures consistency. Discriminated union enables TypeScript to infer payload shape from event name.
- **Trade-offs:** More boilerplate (define both EventType string and PayloadInterface) but provides exhaustive type checking at emit sites.

#### [Pattern] For state-changing operations with async/deferred semantics, follow command execution with explicit state verification queries rather than relying on command exit codes. (2026-02-24)

- **Problem solved:** After `gh pr merge`, query actual PR state via `gh pr view --json state` to confirm MERGED rather than assuming success from command completion.
- **Why this works:** Deferred operations (auto-merge, background jobs, queued work) can succeed as a command while the actual state transition happens later or conditionally. Exit codes don't reflect final state.
- **Trade-offs:** Additional API call adds latency/cost but provides ground truth.

#### [Pattern] Form state machine implemented with vanilla JavaScript using CSS class toggling (.hidden, loading spinner state) instead of framework state management. (2026-02-24)

- **Problem solved:** No frontend framework in use; need to coordinate form submission, loading, success, and error states.
- **Why this works:** Minimal overhead, works in vanilla JS context, leverages existing Tailwind CSS utility classes.
- **Trade-offs:** Simple for single form; brittle if CSS class names change.

#### [Pattern] Background job ownership stays with orchestrator: HyPE generation (runBackgroundHype) is orchestrator responsibility, not delegated elsewhere. (2026-02-24)

- **Problem solved:** HyPE processing is async background work triggered during knowledge operations.
- **Why this works:** Orchestrator owns embedding lifecycle end-to-end, so it should own jobs that operate on embeddings. Prevents fragmented background job management.
- **Trade-offs:** KnowledgeStoreService must call out to orchestrator to trigger background work; single clear owner of HyPE job lifecycle.

#### [Pattern] Identify dead event types by full-codebase text search for EventType string literal (emit, on, event payload references) (2026-03-12)

- **Problem solved:** Removing 'crdt:remote-changes' required confirming zero subscribers and zero emitters exist
- **Why this works:** Event-driven architectures lack static type safety for event completeness; text search is the only reliable way to find all emit() and on() call sites across the codebase
- **Trade-offs:** Labor-intensive manual search, but 100% reliable; false negatives are impossible if search is thorough

#### [Pattern] Notes CRDT dual-write: disk is primary (always written first, awaited), CRDT is secondary (fire-and-forget for replication). CRDT read is guarded by seeded-check before use. (2026-03-12)

- **Problem solved:** Notes workspace needs multi-instance eventual consistency via CRDT, but must remain reliable when CRDT is unavailable.
- **Why this works:** `saveWorkspaceWithCrdt()` awaits the disk write first, then calls `store.change(...).catch(...)` without awaiting. Disk success is the durable guarantee; CRDT propagates asynchronously. On read, `loadWorkspaceWithCrdt()` only uses CRDT data if `doc.tabOrder` is non-empty (the seeded-check) — an empty tabOrder means the document was created by `getOrCreate` but never written via this service, so disk is the correct source.
- **Trade-offs:** Brief window of inconsistency between disk and CRDT after a write. CRDT failures are logged but don't surface to callers. Read falls back silently to disk if CRDT is unavailable or un-seeded.
- **Key implementation:** `apps/server/src/routes/notes/index.ts` — `loadWorkspaceWithCrdt()` and `saveWorkspaceWithCrdt()`.

#### [Pattern] Setter injection for DATA_DIR on CeremonyService: `setDataDir(dataDir)` called post-construction in services.ts to avoid circular dependency at service initialization time. (2026-03-12)

- **Problem solved:** `CeremonyService` needs to know `DATA_DIR` to write ceremony state to the correct location, but `dataDir` is resolved from the service container context after construction.
- **Why this works:** Follows the same setter injection pattern used for `setAutoModeService()` — construction and wiring are decoupled. `getCeremonyStatePath()` falls back to the old `.automaker/projects/{slug}/ceremony-state.json` path if `dataDir` is not set, preserving backward compatibility.
- **Trade-offs:** Easy to forget calling `setDataDir()` after construction (silent fallback to old path). Consistent with established service wiring pattern in the codebase.
