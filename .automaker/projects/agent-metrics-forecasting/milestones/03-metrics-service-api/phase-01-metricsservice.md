# Phase 1: MetricsService

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create MetricsService with getProjectMetrics() and getCapacityMetrics(). Computes: avgCycleTimeMs, avgAgentTimeMs, avgPrReviewTimeMs, totalCostUsd, successRate, throughputPerDay, costByModel, tokenUsage.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/metrics-service.ts`

### Verification
- [ ] MetricsService class created
- [ ] getProjectMetrics() returns aggregated metrics
- [ ] getCapacityMetrics() returns utilization data
- [ ] All metrics computed from feature.json data

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
