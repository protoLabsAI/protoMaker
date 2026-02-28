---
tags: [cost-optimization]
summary: cost-optimization implementation decisions and patterns
relevantTo: [cost-optimization]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 27
  referenced: 11
  successfulFeatures: 11
---
# cost-optimization

### Use Anthropic Haiku model (cheapest tier) for knowledge summarization instead of Claude 3.5 Sonnet or other capable models (2026-02-24)
- **Context:** Compacting knowledge categories by summarizing their content when they exceed size threshold
- **Why:** Summarization is a one-time-per-category operation, not latency-critical, and Haiku is sufficient quality for lossy compression of knowledge. At scale with many categories, cost difference is significant (Haiku ~7x cheaper than Sonnet)
- **Rejected:** More capable models (better summary quality, but 7-10x higher cost per operation; doesn't justify ROI for lossy compression)
- **Trade-offs:** Slightly lower summary quality, but acceptable since goal is aggressive compression not fidelity; dramatic cost savings
- **Breaking if changed:** Using a much cheaper model could produce summaries too lossy (losing critical details); using a much more expensive model wastes budget on an operation where summary quality is secondary to compression ratio