# M2: Goal-Backward Verification

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Add goal-backward verification at two pipeline stages: pre-execution (validate plan covers acceptance criteria before burning agent budget) and post-execution (verify acceptance criteria are satisfied by actual code changes before marking done).

---

## Phases

| Phase | File                                                                                           | Duration | Dependencies | Owner |
| ----- | ---------------------------------------------------------------------------------------------- | -------- | ------------ | ----- |
| 1     | [phase-01-pre-execution-plan-validation.md](./phase-01-pre-execution-plan-validation.md)       | 1 week   | None         | TBD   |
| 2     | [phase-02-post-execution-goal-verification.md](./phase-02-post-execution-goal-verification.md) | 1 week   | None         | TBD   |

---

## Success Criteria

M2 is **complete** when:

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

## Handoff to M3

Once M2 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-pre-execution-plan-validation.md)
