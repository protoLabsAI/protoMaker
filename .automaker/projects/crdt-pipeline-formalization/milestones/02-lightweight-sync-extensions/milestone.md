# M2: Lightweight Sync Extensions

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Two small additions that close real sync gaps without introducing new full CRDT domains: categories via the existing event bridge, and memory usage stats folded into the existing Metrics domain.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-categories-via-event-bridge.md](./phase-01-categories-via-event-bridge.md) | 0.5 weeks | None | TBD |
| 2 | [phase-02-memory-usage-stats-in-metrics-crdt-domain.md](./phase-02-memory-usage-stats-in-metrics-crdt-domain.md) | 1 week | None | TBD |

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

**Next**: [Phase 1](./phase-01-categories-via-event-bridge.md)
