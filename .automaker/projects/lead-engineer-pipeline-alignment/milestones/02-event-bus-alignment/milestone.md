# M2: Event Bus Alignment

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Fix the three event bus disconnects that leave critical rules and subscribers dead: ErrorBudgetService on wrong bus, auto-mode envelope mismatch, and missing feature lifecycle events.

---

## Phases

| Phase | File                                                                                                                             | Duration  | Dependencies | Owner |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ----- |
| 1     | [phase-01-fix-errorbudgetservice-event-bus-wiring.md](./phase-01-fix-errorbudgetservice-event-bus-wiring.md)                     | 0.5 weeks | None         | TBD   |
| 2     | [phase-02-fix-auto-mode-event-envelope-mismatch.md](./phase-02-fix-auto-mode-event-envelope-mismatch.md)                         | 0.5 weeks | None         | TBD   |
| 3     | [phase-03-emit-feature-lifecycle-events-from-status-changes.md](./phase-03-emit-feature-lifecycle-events-from-status-changes.md) | 1 week    | None         | TBD   |

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

**Next**: [Phase 1](./phase-01-fix-errorbudgetservice-event-bus-wiring.md)
