# Phase 3: Migrate lifecycle and sync services to TimerRegistry

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Migrate WorktreeLifecycleService (6h drift check), ArchivalService (10min), SensorRegistryService (30s electron idle poll), AgentManifestService (2s file watcher), CrdtSyncService (30s heartbeat) to use schedulerService.registerInterval().

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/worktree-lifecycle-service.ts`
- [ ] `apps/server/src/services/archival-service.ts`
- [ ] `apps/server/src/services/sensor-registry-service.ts`
- [ ] `apps/server/src/services/agent-manifest-service.ts`
- [ ] `apps/server/src/services/scheduler.module.ts`

### Verification

- [ ] All five services use schedulerService.registerInterval()
- [ ] All five appear in schedulerService.listAll()
- [ ] Intervals match existing timeouts.ts constants
- [ ] No behavioral change
- [ ] Existing unit tests still pass

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
