---
tags: [monitoring]
summary: monitoring implementation decisions and patterns
relevantTo: [monitoring]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 14
  referenced: 2
  successfulFeatures: 2
---
# monitoring

#### [Pattern] Gauge state synchronization: Added syncMetrics() method to reset and rebuild features_by_status gauge from authoritative database source (2026-02-25)
- **Problem solved:** Server restarts leave Prometheus gauges at their last value (not persistent). Without recovery, features_by_status would remain at old values until first feature mutation occurs.
- **Why this works:** Gauges represent point-in-time state and must match reality. Need explicit initialization from truth source (feature database) to handle process restarts gracefully.
- **Trade-offs:** Adds startup latency (need to query all features), but ensures metrics accuracy from server boot time