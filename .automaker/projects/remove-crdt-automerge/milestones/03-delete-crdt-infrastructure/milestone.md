# M3: Delete CRDT Infrastructure

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Remove module wiring, delete crdt-store.module.ts and crdt-sync.module.ts, clean up startup/services container, rename CrdtSyncService to PeerMeshService.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-remove-crdt-module-wiring-from-startup-and-services-container.md](./phase-01-remove-crdt-module-wiring-from-startup-and-services-container.md) | 1 week | None | TBD |
| 2 | [phase-02-rename-crdtsyncservice-to-peermeshservice.md](./phase-02-rename-crdtsyncservice-to-peermeshservice.md) | 0.5 weeks | None | TBD |

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

**Next**: [Phase 1](./phase-01-remove-crdt-module-wiring-from-startup-and-services-container.md)
