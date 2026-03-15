# Phase 3: Wire MaintenanceOrchestrator and remove old systems

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Wire MaintenanceOrchestrator into server startup. Register all check modules. Remove: FeatureHealthService board-health cron, HealthMonitorService periodic loop, board-health maintenance task, maintenance-flow.ts. Keep ReconciliationService untouched. Wire results to EventHistoryService.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/scheduler.module.ts`
- [ ] `apps/server/src/server/wiring.ts`
- [ ] `apps/server/src/services/health-monitor-service.ts`
- [ ] `apps/server/src/services/feature-health-service.ts`
- [ ] `apps/server/src/services/maintenance-tasks.ts`

### Verification
- [ ] MaintenanceOrchestrator wired at startup
- [ ] Old board-health cron removed
- [ ] HealthMonitorService periodic loop removed
- [ ] maintenance-flow.ts removed
- [ ] ReconciliationService unchanged
- [ ] Results written to EventHistoryService
- [ ] All existing server tests pass
- [ ] Integration test runs full sweep

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
