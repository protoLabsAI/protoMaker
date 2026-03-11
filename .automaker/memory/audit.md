---
tags: [audit]
summary: audit implementation decisions and patterns
relevantTo: [audit]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 4
  referenced: 1
  successfulFeatures: 1
---
<!-- domain: Audit & Compliance | Audit trail patterns, decision logging, compliance tracking -->

# audit

#### [Pattern] Uses event emission (authority:approved, authority:rejected) for audit trail rather than direct logging (2026-03-10)
- **Problem solved:** Need audit trail without coupling authority service to logging/persistence
- **Why this works:** Fire-and-forget events decouple enforcement from auditing; systems can subscribe to events without authority service knowing about them
- **Trade-offs:** Loose coupling but audit logging failures are invisible to authority service; action could be blocked but event never emitted