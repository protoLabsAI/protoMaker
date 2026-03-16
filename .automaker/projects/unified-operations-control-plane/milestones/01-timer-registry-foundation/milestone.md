# M1: Timer Registry Foundation

**Status**: 🔴 Not started
**Duration**: 5-10 weeks (estimated)
**Dependencies**: None

---

## Overview

Extend SchedulerService to support interval-based tasks alongside cron, create a TimerRegistry interface, migrate all 16+ independent setInterval loops to register through it, and add pause/resume/list/metrics capabilities.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-timerregistry-interface-and-schedulerservice-extension.md](./phase-01-timerregistry-interface-and-schedulerservice-extension.md) | 1 week | None | TBD |
| 2 | [phase-02-migrate-health-and-monitoring-services-to-timerregistry.md](./phase-02-migrate-health-and-monitoring-services-to-timerregistry.md) | 1 week | None | TBD |
| 3 | [phase-03-migrate-lifecycle-and-sync-services-to-timerregistry.md](./phase-03-migrate-lifecycle-and-sync-services-to-timerregistry.md) | 1 week | None | TBD |
| 4 | [phase-04-migrate-external-monitors-and-lead-engineer-timers.md](./phase-04-migrate-external-monitors-and-lead-engineer-timers.md) | 1 week | None | TBD |
| 5 | [phase-05-timer-registry-api-routes-and-mcp-tools.md](./phase-05-timer-registry-api-routes-and-mcp-tools.md) | 1 week | None | TBD |

---

## Success Criteria

M1 is **complete** when:

- [ ] All phases complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Team reviewed and approved

---

## Outputs

### For Next Milestone
- Foundation work ready for dependent features
- APIs stable and documented
- Types exported and usable

---

## Handoff to M2

Once M1 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-timerregistry-interface-and-schedulerservice-extension.md)
