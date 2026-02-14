# M7: Deconflict EM Agent & Cleanup

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Remove duplicate pr:changes-requested handler from EM agent and clean up race conditions

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-remove-em-pr-changes-requested-handler.md](./phase-01-remove-em-pr-changes-requested-handler.md) | 0.5 weeks | None | TBD |
| 2 | [phase-02-stop-em-from-polluting-feature-description.md](./phase-02-stop-em-from-polluting-feature-description.md) | 0.5 weeks | None | TBD |

---

## Success Criteria

M7 is **complete** when:

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

## Handoff to M8

Once M7 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-remove-em-pr-changes-requested-handler.md)
