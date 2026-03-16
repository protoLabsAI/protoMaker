# M3: State Machine Correctness

**Status**: 🔴 Not started
**Duration**: 4-8 weeks (estimated)
**Dependencies**: None

---

## Overview

Ensure every state transition leads to a valid terminal state with no stuck paths

---

## Phases

| Phase | File                                                                                                                                                 | Duration  | Dependencies | Owner |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ----- |
| 1     | [phase-01-fix-staledeps-rule-done-features-excluded-from-worldstate.md](./phase-01-fix-staledeps-rule-done-features-excluded-from-worldstate.md)     | 0.5 weeks | None         | TBD   |
| 2     | [phase-02-fix-state-machine-null-nextstate-and-done-terminal-handling.md](./phase-02-fix-state-machine-null-nextstate-and-done-terminal-handling.md) | 1 week    | None         | TBD   |
| 3     | [phase-03-fix-action-executor-race-and-enable-auto-merge-strategy.md](./phase-03-fix-action-executor-race-and-enable-auto-merge-strategy.md)         | 1 week    | None         | TBD   |
| 4     | [phase-04-fix-error-classification-breadth-and-merge-retry-logic.md](./phase-04-fix-error-classification-breadth-and-merge-retry-logic.md)           | 1 week    | None         | TBD   |

---

## Success Criteria

M3 is **complete** when:

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

## Handoff to M4

Once M3 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-fix-staledeps-rule-done-features-excluded-from-worldstate.md)
