# M1: Migrate Raw Timers to Scheduler

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Migrate the top 5 long-lived raw setInterval timers to schedulerService.registerInterval() so they appear in the Ops Dashboard.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-migrate-prfeedbackservice-and-archivalservice-timers.md](./phase-01-migrate-prfeedbackservice-and-archivalservice-timers.md) | 1 week | None | TBD |
| 2 | [phase-02-migrate-worktreelifecycle-and-projectassignment-timers.md](./phase-02-migrate-worktreelifecycle-and-projectassignment-timers.md) | 1 week | None | TBD |

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

**Next**: [Phase 1](./phase-01-migrate-prfeedbackservice-and-archivalservice-timers.md)
