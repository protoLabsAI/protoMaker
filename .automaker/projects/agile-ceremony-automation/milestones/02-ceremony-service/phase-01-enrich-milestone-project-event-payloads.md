# Phase 1: Enrich milestone/project event payloads

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In projm-agent.ts, when emitting milestone:completed and project:completed events, load all features for the milestone/project and aggregate stats: featureCount, totalCostUsd, totalDurationSec, failureCount, prUrls, feature summaries. Pass these in the event payload so downstream consumers have rich data without needing to re-query.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/authority-agents/projm-agent.ts`

### Verification
- [ ] milestone:completed payload includes featureCount, totalCostUsd, featureSummaries array
- [ ] project:completed payload includes totalMilestones, totalFeatures, totalCostUsd, milestoneSummaries
- [ ] Existing event consumers still work (payload is additive, not breaking)
- [ ] npm run build:server succeeds

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
