# Phase 1: Implement DORA metrics service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create MetricsCollectionService that subscribes to events and tracks: (1) Deployment frequency — count of PRs merged to dev per day/week, (2) Change lead time — time from feature creation to PR merge, (3) Change fail rate — ratio of features that fail CI or require remediation after merge to total merged, (4) Recovery time — time from failure detection to fix merge. Persist to `.automaker/metrics/dora.json` as time-series entries. Add to ServiceContainer.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/metrics-collection-service.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `libs/types/src/metrics.ts`

### Verification
- [ ] All 4 DORA metrics tracked
- [ ] Time-series data persisted to disk
- [ ] Event-driven collection (no polling)
- [ ] npm run build:server passes
- [ ] npm run test:server passes

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
