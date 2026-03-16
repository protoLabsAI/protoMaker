# M4: Merge and Review Hardening

**Status**: 🔴 Not started
**Duration**: 1-2 weeks (estimated)
**Dependencies**: None

---

## Overview

Fix MergeProcessor to respect per-project merge strategy configuration and add a coordination guard between PRMergePoller and ReviewProcessor.

---

## Phases

| Phase | File                                                                                                                                                         | Duration | Dependencies | Owner |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------ | ----- |
| 1     | [phase-01-mergeprocessor-respects-prmergestrategy-and-pr-merge-race-guard.md](./phase-01-mergeprocessor-respects-prmergestrategy-and-pr-merge-race-guard.md) | 1 week   | None         | TBD   |

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

**Next**: [Phase 1](./phase-01-mergeprocessor-respects-prmergestrategy-and-pr-merge-race-guard.md)
