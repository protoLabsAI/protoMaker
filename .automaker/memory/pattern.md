---
tags: [pattern]
summary: pattern implementation decisions and patterns
relevantTo: [pattern]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 126
  referenced: 40
  successfulFeatures: 40
---
# pattern

#### [Pattern] Typed event payload interfaces exported from central types package, paired with EventType union that includes event names as discriminated union (2026-02-14)
- **Problem solved:** Event system needs type safety across multiple services and files that emit/listen to events
- **Why this works:** Allows type-safe event emission with IDE autocomplete and compile-time validation. Central types package ensures consistency. Discriminated union pattern enables TypeScript to infer payload shape from event name.
- **Trade-offs:** More boilerplate (define both EventType string and PayloadInterface) but provides exhaustive type checking at emit sites

#### [Pattern] For state-changing operations with async/deferred semantics, follow command execution with explicit state verification queries rather than relying on command exit codes (2026-02-24)
- **Problem solved:** After `gh pr merge`, query actual PR state via `gh pr view --json state` to confirm MERGED rather than assuming success from command completion
- **Why this works:** Deferred operations (auto-merge, background jobs, queued work) can succeed as a command while the actual state transition happens later or conditionally. This decoupling breaks exit-code-based verification.
- **Trade-offs:** Additional API call adds latency/cost but provides ground truth. Polling alternative would be slower. Webhook alternative requires event infrastructure.

#### [Pattern] Form state machine implemented with vanilla JavaScript using CSS class toggling (.hidden, loading spinner state) instead of framework state management. (2026-02-24)
- **Problem solved:** No frontend framework in use; need to coordinate form submission, loading, success, and error states
- **Why this works:** Minimal overhead, works in vanilla JS context, leverages existing Tailwind CSS utility classes
- **Trade-offs:** Code simplicity for a single form vs. brittleness if CSS class names change, potential state sync bugs

#### [Pattern] Background job ownership stays with orchestrator: HyPE generation (runBackgroundHype) is orchestrator responsibility, not delegated elsewhere (2026-02-24)
- **Problem solved:** HyPE processing is async background work triggered during knowledge operations
- **Why this works:** Background jobs have state (queue, completion status, error handling). Orchestrator owns embedding lifecycle end-to-end, so it should own jobs that operate on embeddings. Prevents fragmented background job management.
- **Trade-offs:** Gained: single clear owner of HyPE job lifecycle, easier to track state. Lost: KnowledgeStoreService must call out to orchestrator to trigger background work