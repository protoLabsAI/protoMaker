# M6: CI Failure Loop

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Detect CI failures after agent pushes fixes and trigger another remediation cycle

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-subscribe-to-pr-ci-failure-events.md](./phase-01-subscribe-to-pr-ci-failure-events.md) | 1 week | None | TBD |
| 2 | [phase-02-detect-ci-failures-after-push.md](./phase-02-detect-ci-failures-after-push.md) | 2 weeks | None | TBD |

---

## Success Criteria

M6 is **complete** when:

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

## Handoff to M7

Once M6 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-subscribe-to-pr-ci-failure-events.md)
