# M5: Durable Workflow Engine

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Replace in-memory Lead Engineer state machine with durable SQLite-backed workflow engine with suspend/resume.

---

## Phases

| Phase | File                                                                                                 | Duration | Dependencies | Owner |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- | ------------ | ----- |
| 1     | [phase-01-workflow-checkpoint-store.md](./phase-01-workflow-checkpoint-store.md)                     | 1 week   | None         | TBD   |
| 2     | [phase-02-lead-engineer-durable-state-machine.md](./phase-02-lead-engineer-durable-state-machine.md) | 2 weeks  | None         | TBD   |

---

## Success Criteria

M5 is **complete** when:

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

## Handoff to M6

Once M5 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-workflow-checkpoint-store.md)
