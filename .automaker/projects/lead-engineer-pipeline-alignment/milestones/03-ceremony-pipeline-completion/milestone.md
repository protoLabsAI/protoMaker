# M3: Ceremony Pipeline Completion

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Fix the ceremony state machine so it can advance through the full lifecycle. Remove dead rules and wire gate-tuning signals.

---

## Phases

| Phase | File                                                                                                                                                   | Duration  | Dependencies | Owner |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------ | ----- |
| 1     | [phase-01-fix-ceremony-payloads-with-remainingmilestones-and-retrodata.md](./phase-01-fix-ceremony-payloads-with-remainingmilestones-and-retrodata.md) | 1 week    | None         | TBD   |
| 2     | [phase-02-remove-dead-rollbacktriggered-rule-and-clean-up-gate-tuning.md](./phase-02-remove-dead-rollbacktriggered-rule-and-clean-up-gate-tuning.md)   | 0.5 weeks | None         | TBD   |

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

**Next**: [Phase 1](./phase-01-fix-ceremony-payloads-with-remainingmilestones-and-retrodata.md)
