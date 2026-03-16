# Phase 1: TimerRegistry interface and SchedulerService extension

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Define TimerRegistryEntry type in libs/types with fields for id, name, type (cron|interval), interval/expression, enabled, lastRun, nextRun, duration, failureCount, executionCount, category (maintenance|health|monitor|sync|system). Extend SchedulerService to accept interval-based registrations alongside cron tasks. Add registerInterval(id, name, intervalMs, callback, opts) method that wraps setInterval but tracks metadata. Add listAll(), pauseAll(), resumeAll(), getMetrics() methods. Wire to existing timeouts.ts constants.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/scheduler.ts`
- [ ] `libs/types/src/global-settings.ts`
- [ ] `apps/server/src/services/scheduler-service.ts`
- [ ] `apps/server/src/config/timeouts.ts`

### Verification
- [ ] TimerRegistryEntry type exported from @protolabsai/types
- [ ] SchedulerService.registerInterval() creates managed setInterval with metadata tracking
- [ ] SchedulerService.listAll() returns both cron and interval tasks with unified schema
- [ ] SchedulerService.pauseAll() and resumeAll() stop/restart all managed timers
- [ ] Each tick records lastRun timestamp and duration
- [ ] Failure count incremented on callback errors
- [ ] Existing cron task registration unchanged
- [ ] Unit tests cover registration, pause/resume, metrics, error handling

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
