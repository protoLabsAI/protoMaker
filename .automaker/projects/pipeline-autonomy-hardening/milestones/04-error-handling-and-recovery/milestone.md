# M4: Error Handling and Recovery

**Status**: 🔴 Not started
**Duration**: 4-8 weeks (estimated)
**Dependencies**: None

---

## Overview

Make the pipeline self-healing on transient failures with proper detection and recovery

---

## Phases

| Phase | File                                                                                                                                                                             | Duration  | Dependencies | Owner |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ----- |
| 1     | [phase-01-fix-errorbudget-sync-io-and-unbounded-record-growth.md](./phase-01-fix-errorbudget-sync-io-and-unbounded-record-growth.md)                                             | 1 week    | None         | TBD   |
| 2     | [phase-02-fix-worktree-recovery-rebase-conflicts-and-stream-observer-hang-detection.md](./phase-02-fix-worktree-recovery-rebase-conflicts-and-stream-observer-hang-detection.md) | 1 week    | None         | TBD   |
| 3     | [phase-03-fix-git-workflow-counter-and-agent-queue-stall-and-scheduler-timeout.md](./phase-03-fix-git-workflow-counter-and-agent-queue-stall-and-scheduler-timeout.md)           | 0.5 weeks | None         | TBD   |
| 4     | [phase-04-add-missing-failure-patterns-and-fix-classifier-regex-and-wiring.md](./phase-04-add-missing-failure-patterns-and-fix-classifier-regex-and-wiring.md)                   | 1 week    | None         | TBD   |

---

## Success Criteria

M4 is **complete** when:

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

## Handoff to M5

Once M4 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-fix-errorbudget-sync-io-and-unbounded-record-growth.md)
