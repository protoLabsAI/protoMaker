# Phase 3: Event ledger REST API and timeline query

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add REST endpoints for querying the event ledger: GET /api/ledger/events?featureId=X returns all events for a feature, GET /api/ledger/events?projectSlug=X returns project timeline, GET /api/ledger/events?since=ISO&until=ISO returns time-range query. Add GET /api/ledger/timeline/:featureId that returns a unified timeline merging event ledger entries with statusHistory from feature.json (or archive). Wire into routes.ts with API key auth.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/ledger/index.ts`
- [ ] `apps/server/src/server/routes.ts`

### Verification
- [ ] GET /api/ledger/events?featureId=X returns filtered events
- [ ] GET /api/ledger/events?projectSlug=X returns project events
- [ ] GET /api/ledger/events?since=ISO&until=ISO returns time-range events
- [ ] GET /api/ledger/timeline/:featureId returns merged timeline
- [ ] Endpoints protected by API key auth
- [ ] npm run typecheck passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
