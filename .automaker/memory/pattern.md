---
tags: [pattern]
summary: pattern implementation decisions and patterns
relevantTo: [pattern]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# pattern

#### [Pattern] Typed event payload interfaces exported from central types package, paired with EventType union that includes event names as discriminated union (2026-02-14)
- **Problem solved:** Event system needs type safety across multiple services and files that emit/listen to events
- **Why this works:** Allows type-safe event emission with IDE autocomplete and compile-time validation. Central types package ensures consistency. Discriminated union pattern enables TypeScript to infer payload shape from event name.
- **Trade-offs:** More boilerplate (define both EventType string and PayloadInterface) but provides exhaustive type checking at emit sites