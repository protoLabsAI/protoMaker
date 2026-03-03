# M1: Backend: Enrich Automation List with Scheduler Metadata

**Status**: 🔴 Not started
**Duration**: 1-2 weeks (estimated)
**Dependencies**: None

---

## Overview

Make /api/automations/list return lastRunAt, nextRunAt, executionCount, and failureCount by merging SchedulerService task data into the Automation list response.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-enrich-automation-list-response-with-scheduler-stats.md](./phase-01-enrich-automation-list-response-with-scheduler-stats.md) | 0.5 weeks | None | TBD |

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

**Next**: [Phase 1](./phase-01-enrich-automation-list-response-with-scheduler-stats.md)
