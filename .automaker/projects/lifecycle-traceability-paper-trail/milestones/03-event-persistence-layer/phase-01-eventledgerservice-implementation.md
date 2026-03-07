# Phase 1: EventLedgerService implementation

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create EventLedgerService at apps/server/src/services/event-ledger-service.ts. Append-only JSONL file at .automaker/ledger/events.jsonl. Each entry: { id (uuid), timestamp (ISO), eventType (string), correlationIds: { projectSlug?, milestoneSlug?, featureId?, ceremonyId?, traceId? }, payload (object), source (string — which service emitted) }. Write is fire-and-forget (async, never blocks caller). Idempotent — skip duplicate event IDs. Add EventLedgerEntry type to libs/types/src/. Provide query methods: getByFeatureId(), getByProjectSlug(), getByTimeRange(), getByEventType(). Wire into services.ts and wiring.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/event-ledger-service.ts`
- [ ] `libs/types/src/event-ledger.ts`
- [ ] `libs/types/src/index.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification
- [ ] EventLedgerService writes append-only JSONL to .automaker/ledger/events.jsonl
- [ ] Each entry has unique ID, timestamp, eventType, correlationIds, payload, source
- [ ] Write is async fire-and-forget — never blocks the event bus
- [ ] Duplicate event IDs are skipped
- [ ] getByFeatureId returns all events for a feature
- [ ] getByProjectSlug returns all events for a project
- [ ] EventLedgerEntry type exported from @protolabsai/types
- [ ] npm run typecheck passes

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
