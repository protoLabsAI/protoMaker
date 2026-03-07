# Phase 1: Instance Capacity Advertising

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Each instance periodically updates its InstanceCapacity in the CRDT assignments document: running agents, max agents, RAM usage, CPU load, backlog depth. This data is used by the work-stealing protocol to identify idle instances and busy peers.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `libs/crdt/src/documents.ts`
- [ ] `libs/types/src/hivemind.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`

### Verification
- [ ] Each instance publishes capacity metrics to shared CRDT document
- [ ] Capacity updates every heartbeat interval
- [ ] Includes: runningAgents, maxAgents, backlogCount, ramUsagePercent, cpuPercent
- [ ] All instances can read all peers' capacity in real-time
- [ ] Health endpoint shows peer capacity summary

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
