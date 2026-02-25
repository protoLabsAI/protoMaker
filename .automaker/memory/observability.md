---
tags: [observability]
summary: observability implementation decisions and patterns
relevantTo: [observability]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# observability

### Failure-path metric instrumentation: Incrementing agent_cost_usd_total, execution duration, and token counters on BOTH success and failure execution paths (2026-02-25)
- **Context:** Could have only tracked successful executions to show 'profitable' activity, but chose to include failures
- **Why:** Need visibility into full system cost including failed attempts. Failures still consume tokens/compute. Critical for debugging why total cost exceeds expected.
- **Rejected:** Could have only instrumented success path to show cleaner metrics, but would hide failure costs
- **Trade-offs:** Metrics appear 'noisier' with failures included, but provide complete cost picture for billing and debugging
- **Breaking if changed:** If failure tracking is removed, cost metrics become misleading (actual system cost higher than reported)