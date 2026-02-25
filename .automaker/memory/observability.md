---
tags: [observability]
summary: observability implementation decisions and patterns
relevantTo: [observability]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 4
  referenced: 2
  successfulFeatures: 2
---
# observability

### Failure-path metric instrumentation: Incrementing agent_cost_usd_total, execution duration, and token counters on BOTH success and failure execution paths (2026-02-25)
- **Context:** Could have only tracked successful executions to show 'profitable' activity, but chose to include failures
- **Why:** Need visibility into full system cost including failed attempts. Failures still consume tokens/compute. Critical for debugging why total cost exceeds expected.
- **Rejected:** Could have only instrumented success path to show cleaner metrics, but would hide failure costs
- **Trade-offs:** Metrics appear 'noisier' with failures included, but provide complete cost picture for billing and debugging
- **Breaking if changed:** If failure tracking is removed, cost metrics become misleading (actual system cost higher than reported)

#### [Pattern] Langfuse traces are created and persisted even when quality gates fail and content generation is blocked, providing full observability into failed runs. (2026-02-25)
- **Problem solved:** All 5 test runs created Langfuse traces with `traceId: content-content-{runId}` despite producing no content.md output. This was verified as successful even when pipeline didn't generate final output.
- **Why this works:** When content generation fails due to quality gates, you need to inspect LLM reasoning and research findings to decide: is this a threshold problem or a genuine quality issue? Traces provide this visibility.
- **Trade-offs:** Upside: Complete observability, enables root cause analysis. Downside: Requires access to Langfuse dashboard to debug failures (not available in CLI output). Adds Langfuse dependency to operations.