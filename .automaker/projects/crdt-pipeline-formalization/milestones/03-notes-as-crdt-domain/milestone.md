# M3: Notes as CRDT Domain

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Add a NotesWorkspace CRDT domain following the todos pattern — one shared document per project containing all tabs with LWW-per-tab semantics. Multi-instance agents can read and write notes without last-write-wins data loss. Hydrate from existing workspace.json on first start.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-add-notesworkspace-crdt-domain-schema.md](./phase-01-add-notesworkspace-crdt-domain-schema.md) | 1 week | None | TBD |
| 2 | [phase-02-refactor-notes-routes-to-use-crdtstore-with-disk-fallback.md](./phase-02-refactor-notes-routes-to-use-crdtstore-with-disk-fallback.md) | 1 week | None | TBD |
| 3 | [phase-03-expose-notes-crdt-via-mcp-tools-and-document-the-boundary.md](./phase-03-expose-notes-crdt-via-mcp-tools-and-document-the-boundary.md) | 0.5 weeks | None | TBD |

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

**Next**: [Phase 1](./phase-01-add-notesworkspace-crdt-domain-schema.md)
