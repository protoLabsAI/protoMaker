# Phase 1: EventLedger project-scoped query + /api/projects/:slug/timeline route

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase. Write integration tests for a new route GET /api/projects/:slug/timeline that: (1) returns all EventLedger events with matching projectSlug, (2) supports ?since and ?type query params for filtering, (3) returns events in chronological order with type, timestamp, correlationIds, and payload. Implement by adding a queryByProject(projectSlug, opts) method to EventLedgerService and wiring the route in apps/server/src/routes/projects/. Test with seeded JSONL data.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/event-ledger-service.ts`
- [ ] `apps/server/src/routes/projects/index.ts`
- [ ] `apps/server/tests/integration/routes/project-timeline.test.ts`

### Verification
- [ ] GET /api/projects/:slug/timeline returns chronological EventLedger events for the project
- [ ] ?since= and ?type= query params filter correctly
- [ ] EventLedgerService.queryByProject() method implemented and tested
- [ ] Integration tests use seeded JSONL data and verify ordering and filtering
- [ ] Build passes

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
