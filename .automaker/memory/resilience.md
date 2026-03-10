---
tags: [resilience]
summary: resilience implementation decisions and patterns
relevantTo: [resilience]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 3
  referenced: 1
  successfulFeatures: 1
---
<!-- domain: Resilience & Error Handling | Fault tolerance, graceful degradation, error classification -->

# resilience

#### [Gotcha] Monitor orchestrator uses hard-coded threshold of 10 consecutive errors to auto-disable a monitor, with no rationale or configuration option. (2026-02-22)
- **Situation:** Individual monitor failures should not crash the orchestrator or hammer failing APIs.
- **Root cause:** Prevents cascading failures and repeated API calls to broken services. Provides graceful degradation.
- **How to avoid:** Gained resilience and API protection, but lost visibility into silent failures and fine-grained control. The threshold of 10 is arbitrary - too low threshold disables on temporary blips, too high wastes API quota.