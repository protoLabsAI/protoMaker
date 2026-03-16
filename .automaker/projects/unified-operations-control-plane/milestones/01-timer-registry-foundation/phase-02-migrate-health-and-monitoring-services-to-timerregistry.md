# Phase 2: Migrate health and monitoring services to TimerRegistry

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Migrate HealthMonitorService (30s), PRWatcherService (30s), SpecGenerationMonitor (30s) to use schedulerService.registerInterval() instead of raw setInterval. Each service receives schedulerService via constructor or setter injection. Remove the internal setInterval calls. Preserve all existing behavior.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/health-monitor-service.ts`
- [ ] `apps/server/src/services/pr-watcher-service.ts`
- [ ] `apps/server/src/services/spec-generation-monitor.ts`
- [ ] `apps/server/src/services/scheduler.module.ts`

### Verification
- [ ] All three services use schedulerService.registerInterval()
- [ ] All three appear in schedulerService.listAll()
- [ ] No behavioral change from existing functionality
- [ ] Existing unit tests still pass
- [ ] New integration test verifies registration on startup

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
