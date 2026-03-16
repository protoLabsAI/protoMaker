# Phase 1: MaintenanceOrchestrator service with check module interface

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create MaintenanceOrchestrator that runs composable check modules on configurable schedule. Define MaintenanceCheck interface with run(context) method returning MaintenanceCheckResult. Orchestrator runs checks in sequence, aggregates results, emits events. Two tiers: critical checks (5min) and full audit (6h).

---

## Tasks

### Files to Create/Modify

- [ ] `libs/types/src/maintenance.ts`
- [ ] `apps/server/src/services/maintenance-orchestrator.ts`
- [ ] `apps/server/src/services/scheduler.module.ts`

### Verification

- [ ] MaintenanceCheck interface defined in @protolabsai/types
- [ ] Orchestrator accepts check module registration
- [ ] Two-tier schedule: critical (5min) and full (6h)
- [ ] Results aggregated with timing
- [ ] Events emitted for sweep lifecycle
- [ ] Registered with TimerRegistry
- [ ] Unit tests for orchestrator

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
