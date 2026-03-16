# Phase 2: Extract health checks to maintenance modules

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extract checks from FeatureHealthService, HealthMonitorService, and maintenance-tasks into individual MaintenanceCheck modules: StuckFeatureCheck, OrphanedWorktreeCheck, DanglingDependencyCheck, EpicCompletionCheck, MemoryPressureCheck, DataIntegrityCheck, StalePRCheck, StaleConcurrencyLeaseCheck, ClosedPRCheck.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/maintenance/checks/stuck-feature-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/orphaned-worktree-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/dangling-dependency-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/epic-completion-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/memory-pressure-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/data-integrity-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/stale-pr-check.ts`

### Verification

- [ ] Each check implements MaintenanceCheck interface
- [ ] All thresholds match existing services
- [ ] Auto-fix logic preserved from all source systems
- [ ] Each check has unit tests
- [ ] No duplicate logic across checks

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
