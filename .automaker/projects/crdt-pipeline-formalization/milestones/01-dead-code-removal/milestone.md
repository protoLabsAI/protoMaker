# M1: Dead Code Removal

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Eliminate all remnants of the abandoned feature-sync model. Remove dead methods, dead event types, dead config sections, and rename misleading type names. No behavior changes — purely subtractive.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-remove-dead-automergefeaturestore-methods-and-claim-protocol.md](./phase-01-remove-dead-automergefeaturestore-methods-and-claim-protocol.md) | 0.5 weeks | None | TBD |
| 2 | [phase-02-remove-crdt-remote-changes-event-type-and-rename-crdtfeatureevent.md](./phase-02-remove-crdt-remote-changes-event-type-and-rename-crdtfeatureevent.md) | 0.5 weeks | None | TBD |
| 3 | [phase-03-remove-vestigial-hive-config-section.md](./phase-03-remove-vestigial-hive-config-section.md) | 0.5 weeks | None | TBD |

---

## Success Criteria

M1 is **complete** when:

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

## Handoff to M2

Once M1 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-remove-dead-automergefeaturestore-methods-and-claim-protocol.md)
