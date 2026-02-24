---
tags: [pattern]
summary: pattern implementation decisions and patterns
relevantTo: [pattern]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 44
  referenced: 26
  successfulFeatures: 26
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