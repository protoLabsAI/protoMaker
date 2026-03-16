# M1: State Machine Terminal State Fix

**Status**: 🔴 Not started
**Duration**: 1-2 weeks (estimated)
**Dependencies**: None

---

## Overview

Fix the DEPLOY to DONE transition so features correctly reach terminal state. Remove orphaned VERIFY enum and legacy status references. This is the foundation — everything downstream depends on features actually reaching DONE.

---

## Phases

| Phase | File                                                                                                                                                           | Duration  | Dependencies | Owner |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ----- |
| 1     | [phase-01-fix-deployprocessor-done-transition-and-clean-up-orphaned-states.md](./phase-01-fix-deployprocessor-done-transition-and-clean-up-orphaned-states.md) | 0.5 weeks | None         | TBD   |

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

**Next**: [Phase 1](./phase-01-fix-deployprocessor-done-transition-and-clean-up-orphaned-states.md)
