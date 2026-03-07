# Phase 2: Wire event ledger into lifecycle event emitters

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Subscribe EventLedgerService to the event bus for all lifecycle events: feature:status-changed, feature:started, feature:completed, feature:error, feature:pr-merged, lead-engineer:feature-processed, pipeline:state-entered, milestone:completed, project:completed, project:lifecycle:launched, ceremony:fired, escalation:signal-received, auto-mode:event (feature types only). For each event, extract correlation IDs from the payload (featureId, projectSlug, milestoneSlug where available) and write to the ledger. Add unit tests verifying each event type produces a correct ledger entry.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/event-ledger-service.ts`
- [ ] `apps/server/src/server/wiring.ts`
- [ ] `apps/server/tests/unit/services/event-ledger-service.test.ts`

### Verification
- [ ] All 13 lifecycle event types produce ledger entries
- [ ] Correlation IDs correctly extracted from each event type's payload
- [ ] feature:status-changed entries include from/to status and reason
- [ ] pipeline:state-entered entries include fromState and toState
- [ ] ceremony:fired entries include ceremonyType and projectSlug
- [ ] Unit tests verify ledger entry shape for each event type
- [ ] npm run test:server passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
