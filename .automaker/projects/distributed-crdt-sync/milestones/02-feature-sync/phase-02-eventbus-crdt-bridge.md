# Phase 2: EventBus CRDT Bridge

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Wire EventBus.broadcast() to emit events across instances via CRDT change subscriptions. When a remote peer changes a feature, the local EventBus emits the corresponding event (feature:updated, feature:status-changed, etc.) so the UI and auto-mode react as if the change were local. This is the glue between CRDT sync and the existing event-driven architecture.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/lib/events.ts`
- [ ] `apps/server/src/server/wiring.ts`
- [ ] `libs/types/src/events.ts`

### Verification
- [ ] broadcast() publishes events to CRDT ephemeral messages when sync is active
- [ ] Remote CRDT changes trigger local EventBus.emit() with correct event type
- [ ] Feature status changes from peers trigger feature:status-changed events
- [ ] UI receives WebSocket events for remote changes (board updates in real-time)
- [ ] Auto-mode reacts to remote feature status changes (dep resolution, work stealing)
- [ ] No duplicate events when change originates locally

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
