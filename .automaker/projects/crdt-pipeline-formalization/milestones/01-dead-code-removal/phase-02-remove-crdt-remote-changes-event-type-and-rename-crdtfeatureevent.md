# Phase 2: Remove crdt:remote-changes event type and rename CrdtFeatureEvent

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove the crdt:remote-changes EventType entry from libs/types/src/events.ts — it has zero subscribers and zero emitters in production code. Remove applyRemoteChanges() from ProjectService which references this dead event. Rename CrdtFeatureEvent to CrdtSyncWireMessage (3 files: events.ts, index.ts, crdt-sync-service.ts) — the type represents all wire messages (project events, settings events), not just feature events. The wire format string 'feature_event' remains unchanged for backwards compat.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/events.ts`
- [ ] `libs/types/src/index.ts`
- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `apps/server/src/services/project-service.ts`

### Verification
- [ ] crdt:remote-changes is removed from the EventType union in events.ts
- [ ] CrdtFeatureEvent is renamed to CrdtSyncWireMessage in events.ts
- [ ] Re-export in index.ts updated to CrdtSyncWireMessage
- [ ] crdt-sync-service.ts import updated to CrdtSyncWireMessage
- [ ] ProjectService.applyRemoteChanges() method removed
- [ ] Wire format string 'feature_event' in crdt-sync-service.ts is unchanged
- [ ] npm run typecheck passes with no new errors
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
