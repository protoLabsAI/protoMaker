# M3: Event Persistence Layer

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Introduce an append-only event ledger that captures all lifecycle events with correlation IDs. This is the foundation for full traceability — every project, feature, ceremony, and pipeline event gets a permanent record.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-eventledgerservice-implementation.md](./phase-01-eventledgerservice-implementation.md) | 1 week | None | TBD |
| 2 | [phase-02-wire-event-ledger-into-lifecycle-event-emitters.md](./phase-02-wire-event-ledger-into-lifecycle-event-emitters.md) | 1 week | None | TBD |
| 3 | [phase-03-event-ledger-rest-api-and-timeline-query.md](./phase-03-event-ledger-rest-api-and-timeline-query.md) | 0.5 weeks | None | TBD |

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

**Next**: [Phase 1](./phase-01-eventledgerservice-implementation.md)
