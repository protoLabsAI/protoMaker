# M2: Strip CRDT from Consumer Services

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Remove all CRDT reads, writes, and setCrdtStore() injection from notes, calendar, todos, metrics, and project-service.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-remove-crdt-dual-write-from-notes-routes.md](./phase-01-remove-crdt-dual-write-from-notes-routes.md) | 0.5 weeks | None | TBD |
| 2 | [phase-02-remove-setcrdtstore-from-calendarservice-todoservice-and-metrics-route.md](./phase-02-remove-setcrdtstore-from-calendarservice-todoservice-and-metrics-route.md) | 0.5 weeks | None | TBD |
| 3 | [phase-03-refactor-projectservice-remove-automerge-doc-in-memory-usage.md](./phase-03-refactor-projectservice-remove-automerge-doc-in-memory-usage.md) | 0.5 weeks | None | TBD |

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

**Next**: [Phase 1](./phase-01-remove-crdt-dual-write-from-notes-routes.md)
