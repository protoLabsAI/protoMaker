# M2: Feature Sync

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Implement AutomergeFeatureStore backed by CRDT documents, replacing filesystem reads/writes for feature data. Events propagate across instances via EventBus.broadcast().

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-automergefeaturestore-implementation.md](./phase-01-automergefeaturestore-implementation.md) | 2 weeks | None | TBD |
| 2 | [phase-02-eventbus-crdt-bridge.md](./phase-02-eventbus-crdt-bridge.md) | 1 week | None | TBD |

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

**Next**: [Phase 1](./phase-01-automergefeaturestore-implementation.md)
