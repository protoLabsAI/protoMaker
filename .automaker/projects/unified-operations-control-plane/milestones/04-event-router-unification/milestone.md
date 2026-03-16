# M4: Event Router Unification

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Consolidate webhook handling with delivery tracking, retry logic, rate limiting, and secret rotation.

---

## Phases

| Phase | File                                                                                                                 | Duration | Dependencies | Owner |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----- |
| 1     | [phase-01-webhook-delivery-tracking-and-retry-service.md](./phase-01-webhook-delivery-tracking-and-retry-service.md) | 1 week   | None         | TBD   |
| 2     | [phase-02-rate-limiting-and-webhook-secret-rotation.md](./phase-02-rate-limiting-and-webhook-secret-rotation.md)     | 1 week   | None         | TBD   |
| 3     | [phase-03-event-router-service-and-delivery-api.md](./phase-03-event-router-service-and-delivery-api.md)             | 1 week   | None         | TBD   |

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

**Next**: [Phase 1](./phase-01-webhook-delivery-tracking-and-retry-service.md)
